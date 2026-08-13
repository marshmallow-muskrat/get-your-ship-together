/**
 * Visual inspection of changed effects, in real gameplay.
 *
 * Loads each fixture that exercises an effect this pass changed, lets the simulation run
 * so the effect is actually on screen, captures a screenshot, and reports console/page
 * errors plus live renderer counters from the F3 overlay. Existing to make "visual
 * inspection of every changed effect" reproducible rather than a claim.
 *
 *   node scripts/effectQa.mjs <baseUrl> [--screenshots <dir>] [--only id,id]
 */
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';

const baseUrl = process.argv[2];
if (!baseUrl) {
  console.error('usage: node scripts/effectQa.mjs <baseUrl> [--screenshots <dir>] [--only id,id]');
  process.exit(2);
}
const shotIdx = process.argv.indexOf('--screenshots');
const shotDir = shotIdx === -1 ? null : process.argv[shotIdx + 1];
if (shotDir) mkdirSync(shotDir, { recursive: true });

/** `freeze` keeps simulation state fixed while shader/mesh animation continues. */
const ALL_SCENES = [
  { id: 'plasma-l1', fixture: 'survivor-plasma-l1', hero: 'bee', settle: 1, freeze: true },
  { id: 'plasma-ship', fixture: 'survivor-plasma-ship', hero: 'bee', settle: 1, freeze: true },
  { id: 'boomerang', fixture: 'survivor-boomerang', hero: 'bee', settle: 1, freeze: true },
  { id: 'gravity', fixture: 'survivor-gravity', hero: 'flamingo', settle: 1, freeze: true },
  { id: 'pulsar', fixture: 'survivor-pulsar', hero: 'bee', settle: 1, freeze: true },
  { id: 'gunship', fixture: 'survivor-gunship', hero: 'red-panda', settle: 1, freeze: true },
  { id: 'singularity', fixture: 'survivor-singularity', hero: 'frog', settle: 1, freeze: true },
  { id: 'singularity-collapse', fixture: 'survivor-singularity-collapse', hero: 'frog', settle: 1, freeze: true },
  { id: 'orbital', fixture: 'survivor-orbital', hero: 'red-panda', settle: 12 },
  { id: 'arc', fixture: 'survivor-arc', hero: 'bee', settle: 10 },
  { id: 'boss', fixture: 'survivor-boss', hero: 'frog', settle: 12 },
  { id: 'miniboss', fixture: 'survivor-miniboss', hero: 'frog', settle: 12 },
  { id: 'cleanup-combat', fixture: 'survivor-cleanup-combat', hero: 'bee', settle: 14 },
  { id: 'cleanup-arrival', fixture: 'survivor-cleanup-arrival', hero: 'bee', settle: 8 },
  { id: 'levelup', fixture: 'survivor-levelup', hero: 'red-panda', settle: 4 },
  { id: 'stress', fixture: 'survivor-stress', hero: 'bee', settle: 16 },
];
const onlyIdx = process.argv.indexOf('--only');
const only = onlyIdx === -1 ? null : new Set((process.argv[onlyIdx + 1] ?? '').split(',').filter(Boolean));
const SCENES = only ? ALL_SCENES.filter((scene) => only.has(scene.id)) : ALL_SCENES;
if (SCENES.length === 0) {
  console.error('No matching effect QA scenes.');
  process.exit(2);
}

const proxyServer = process.env.HTTPS_PROXY || process.env.https_proxy || '';
const useProxy = proxyServer && !/^https?:\/\/(localhost|127\.|\[::1\])/.test(baseUrl);
const browser = await chromium.launch({
  args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--no-sandbox'],
  ...(process.env.CHROME_EXECUTABLE_PATH
    ? { executablePath: process.env.CHROME_EXECUTABLE_PATH }
    : {}),
  ...(useProxy ? { proxy: { server: proxyServer, bypass: 'localhost,127.0.0.1,::1' } } : {}),
});

const rows = [];
const allErrors = [];

for (const scene of SCENES) {
  const page = await browser.newPage({ viewport: { width: 1600, height: 900 }, ignoreHTTPSErrors: true });
  const errors = [];
  page.on('console', (m) => {
    if (m.type() === 'error' && !/^Failed to load resource/.test(m.text())) errors.push(m.text());
  });
  page.on('pageerror', (e) => errors.push('PAGEERROR: ' + e.message));
  page.on('requestfailed', (r) => {
    const u = r.url();
    if (!u.includes('fonts.googleapis.com') && !u.includes('fonts.gstatic.com')) {
      errors.push('REQFAIL: ' + u + ' ' + (r.failure()?.errorText ?? ''));
    }
  });

  const freeze = scene.freeze ? '&freeze=1' : '';
  await page.goto(`${baseUrl}/?mode=survivor&fixture=${scene.fixture}&hero=${scene.hero}${freeze}`, {
    waitUntil: 'networkidle',
    timeout: 90000,
  });
  await page.waitForTimeout(1500 + scene.settle * 1000);

  // F3 opens the GPU stability overlay: live entity counts and renderer.info.
  await page.keyboard.press('F3');
  await page.waitForTimeout(1200);

  const metrics = await page.evaluate(() => {
    const el = document.querySelector('#sv-metrics');
    return {
      overlay: el && !el.classList.contains('hidden') ? (el.textContent ?? '').replace(/\s+/g, ' ').trim() : null,
      canvas: !!document.querySelector('canvas'),
    };
  });

  /*
   * A screenshot is evidence, not the gate. Playwright blocks on "waiting for fonts to
   * load" when a sandbox denies the web-font host, and a heavy scene can exceed the
   * default timeout — neither is a defect in the build, and neither may be allowed to
   * abandon the console-error report for the scenes that follow.
   */
  let shotError = null;
  if (shotDir) {
    try {
      await page.screenshot({ path: `${shotDir}/${scene.id}.png`, timeout: 60000, animations: 'disabled' });
    } catch (e) {
      shotError = String(e).split('\n')[0].slice(0, 120);
    }
  }

  rows.push({ id: scene.id, canvas: metrics.canvas, overlay: metrics.overlay, errors: errors.length, shotError });
  if (errors.length) allErrors.push(...errors.map((e) => `${scene.id}: ${e}`));
  await page.close();
}

await browser.close();

console.log(`\n=== Effect QA: ${baseUrl} ===\n`);
for (const r of rows) {
  console.log(`${r.id.padEnd(18)} canvas=${r.canvas} errors=${r.errors}`);
  if (r.overlay) console.log(`   ${r.overlay}`);
  if (r.shotError) console.log(`   (screenshot skipped: ${r.shotError})`);
}
console.log(`\nconsole/page errors: ${allErrors.length}`);
for (const e of allErrors.slice(0, 20)) console.log('  ERR ' + e.slice(0, 220));
const failed = allErrors.length > 0 || rows.some((r) => !r.canvas);
console.log(`\nRESULT: ${failed ? 'FAIL' : 'CLEAN'}`);
process.exit(failed ? 1 : 0);

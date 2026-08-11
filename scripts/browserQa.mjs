/**
 * Deterministic browser QA harness.
 *
 * Loads a built game (local static server or a deployed Pages URL) in headless
 * Chromium and reports what a human tester would otherwise have to check by
 * hand: console errors, WebGL canvas presence, and layout containment across
 * the viewport and UI-scale matrix the release protocol requires.
 *
 * This exists because the release sandbox cannot reach *.pages.dev, so deployed
 * verification has to run somewhere with real egress (CI) while the same script
 * still runs locally against a static server.
 *
 *   node scripts/browserQa.mjs <baseUrl> [--screenshots <dir>]
 *
 * Exits non-zero if any hard failure is detected. Font requests to third-party
 * hosts are reported separately, since a sandbox that blocks them is an
 * environment artifact rather than a defect in the build.
 */
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';

const baseUrl = process.argv[2];
if (!baseUrl) {
  console.error('usage: node scripts/browserQa.mjs <baseUrl> [--screenshots <dir>]');
  process.exit(2);
}

const shotIdx = process.argv.indexOf('--screenshots');
const shotDir = shotIdx === -1 ? null : process.argv[shotIdx + 1];
if (shotDir) mkdirSync(shotDir, { recursive: true });

/**
 * Viewport matrix.
 *
 * `blocking: false` viewports are still measured and reported, but do not fail
 * the run. Narrow/mobile widths are non-blocking because this is not currently
 * intended to be a mobile game, so their layout is recorded for information
 * rather than gating a release. Raise them to blocking if mobile becomes a
 * supported target.
 */
const VIEWPORTS = [
  { name: 'desktop-1920', width: 1920, height: 1080, blocking: true },
  { name: 'desktop-1280', width: 1280, height: 800, blocking: true },
  { name: 'laptop-1024', width: 1024, height: 768, blocking: true },
  { name: 'mobile-390', width: 390, height: 844, blocking: false },
];

/** UI scales the protocol requires. */
const UI_SCALES = [0.75, 1, 1.25, 1.5];

/** Requests to these hosts failing means the sandbox blocked them, not the build. */
const THIRD_PARTY = ['fonts.googleapis.com', 'fonts.gstatic.com'];

const isThirdParty = (url) => THIRD_PARTY.some((h) => url.includes(h));

// Some sandboxes reach the network only through an intercepting HTTPS proxy.
// curl picks that up from the environment, but Chromium does not, so a remote
// URL fails with ERR_CONNECTION_RESET while the same URL works from the shell.
// Pass the proxy through explicitly, bypassing loopback so a local static
// server is still reached directly.
const proxyServer = process.env.HTTPS_PROXY || process.env.https_proxy || '';
const useProxy = proxyServer && !/^https?:\/\/(localhost|127\.|\[::1\])/.test(baseUrl);

const browser = await chromium.launch({
  args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--no-sandbox'],
  ...(useProxy
    ? { proxy: { server: proxyServer, bypass: 'localhost,127.0.0.1,::1' } }
    : {}),
});

const report = { checks: [], hardErrors: [], thirdPartyBlocked: [] };
let failed = false;

for (const vp of VIEWPORTS) {
  // An intercepting proxy re-signs TLS with its own CA, which Chromium does not
  // trust by default; without this a proxied run fails on certificate errors.
  const page = await browser.newPage({
    viewport: { width: vp.width, height: vp.height },
    ignoreHTTPSErrors: true,
  });
  const errors = [];

  page.on('console', (m) => {
    if (m.type() !== 'error') return;
    // Resource failures are already captured with their full URL by the
    // 'requestfailed' handler below, which can tell a third-party host apart
    // from a real one. The console emits a duplicate for the same failure with
    // no URL attached, so counting it would double-report and make any
    // environment that blocks web fonts look like a broken build.
    if (/^Failed to load resource/.test(m.text())) return;
    errors.push(m.text());
  });
  page.on('pageerror', (e) => errors.push('PAGEERROR: ' + e.message));
  page.on('requestfailed', (r) => {
    const line = `${r.url()} ${r.failure()?.errorText ?? ''}`;
    if (isThirdParty(r.url())) report.thirdPartyBlocked.push(line);
    else errors.push('REQFAIL: ' + line);
  });

  const resp = await page.goto(baseUrl, { waitUntil: 'networkidle', timeout: 90000 });
  const status = resp?.status() ?? 0;
  await page.waitForTimeout(4000);

  for (const scale of UI_SCALES) {
    // The app applies scaling via `--ui-scale` on <html>, consumed by CSS as
    // `transform: scale(var(--ui-scale))`. Drive only that variable: a transform
    // scales without reflowing, so touching root font-size too would apply a
    // second, different scaling model and mask the very defect we look for.
    await page.evaluate((s) => {
      document.documentElement.style.setProperty('--ui-scale', String(s));
    }, scale);
    await page.waitForTimeout(400);

    const layout = await page.evaluate(() => {
      const d = document.documentElement;
      const vw = window.innerWidth;
      const vh = window.innerHeight;
      // Interactive//chrome elements a player must be able to see and reach.
      const els = [...document.querySelectorAll('button, [role="button"], [class*="hud"], [class*="deck"], [class*="card"]')];
      const clipped = { left: 0, right: 0, top: 0, bottom: 0 };
      const offenders = [];
      for (const el of els) {
        const r = el.getBoundingClientRect();
        if (r.width === 0 && r.height === 0) continue;
        let why = '';
        if (r.left < -1) { clipped.left++; why += 'L'; }
        if (r.top < -1) { clipped.top++; why += 'T'; }
        if (r.right > vw + 1) { clipped.right++; why += 'R'; }
        if (r.bottom > vh + 1) { clipped.bottom++; why += 'B'; }
        if (why) {
          const id = `${el.tagName.toLowerCase()}${el.className ? '.' + String(el.className).trim().split(/\s+/).join('.') : ''}`;
          offenders.push(`${why} ${id.slice(0, 70)} [${Math.round(r.left)},${Math.round(r.right)}]`);
        }
      }
      return {
        hOverflow: d.scrollWidth > vw + 1,
        measured: els.length,
        clipped,
        offenders: offenders.slice(0, 6),
        canvas: !!document.querySelector('canvas'),
      };
    });

    const off = layout.clipped.left + layout.clipped.right + layout.clipped.top + layout.clipped.bottom;
    const bad = layout.hOverflow || off > 0;
    if (bad && vp.blocking) failed = true;

    report.checks.push({
      viewport: vp.name, scale, status, canvas: layout.canvas, blocking: vp.blocking,
      hOverflow: layout.hOverflow,
      offscreen: off,
      edges: `L${layout.clipped.left} R${layout.clipped.right} T${layout.clipped.top} B${layout.clipped.bottom}`,
      offenders: layout.offenders,
      verdict: bad ? (vp.blocking ? 'FAIL' : 'info') : 'ok',
    });

    if (shotDir) {
      await page.screenshot({ path: `${shotDir}/${vp.name}@${scale}.png` });
    }
  }

  if (status !== 200) { failed = true; report.hardErrors.push(`${vp.name}: HTTP ${status}`); }
  if (errors.length) {
    failed = true;
    report.hardErrors.push(...errors.map((e) => `${vp.name}: ${e}`));
  }
  await page.close();
}

await browser.close();

console.log(`\n=== Browser QA: ${baseUrl} ===\n`);
console.log('| viewport | scale | http | canvas | h-overflow | offscreen | edges clipped | verdict |');
console.log('| --- | --- | --- | --- | --- | --- | --- | --- |');
for (const c of report.checks) {
  console.log(`| ${c.viewport} | ${c.scale} | ${c.status} | ${c.canvas} | ${c.hOverflow} | ${c.offscreen} | ${c.edges} | ${c.verdict} |`);
}

const withOffenders = report.checks.filter((c) => c.offenders?.length);
if (withOffenders.length) {
  console.log('\nClipped elements:');
  const seen = new Set();
  for (const c of withOffenders) {
    for (const o of c.offenders) {
      const key = `${c.viewport}|${o}`;
      if (seen.has(key)) continue;
      seen.add(key);
      console.log(`  ${c.viewport} @${c.scale}  ${o}`);
    }
  }
}

console.log(`\nhard errors: ${report.hardErrors.length}`);
for (const e of report.hardErrors.slice(0, 25)) console.log('  ERR ' + e.slice(0, 240));

const uniqueThirdParty = [...new Set(report.thirdPartyBlocked)];
console.log(`\nthird-party requests blocked (environment artifact, not a defect): ${uniqueThirdParty.length}`);
for (const t of uniqueThirdParty.slice(0, 5)) console.log('  - ' + t.slice(0, 160));

console.log(`\nRESULT: ${failed ? 'FAIL' : 'CLEAN'}`);
process.exit(failed ? 1 : 0);

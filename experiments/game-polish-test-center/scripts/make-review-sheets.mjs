import { readFileSync, mkdirSync } from 'node:fs';
import { dirname, extname, resolve } from 'node:path';
import { chromium } from 'playwright';

const root = resolve('experiments/game-polish-test-center');
const shots = resolve(root, 'screenshots');

function dataUrl(path) {
  const mime = extname(path).toLowerCase() === '.png' ? 'image/png' : 'image/jpeg';
  return `data:${mime};base64,${readFileSync(path).toString('base64')}`;
}

function esc(value) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
}

function imageCard({ path, eyebrow, title, note = '' }) {
  return `
    <article class="card">
      <div class="frame"><img src="${dataUrl(path)}" alt="${esc(title)}"></div>
      <div class="copy">
        <span>${esc(eyebrow)}</span>
        <strong>${esc(title)}</strong>
        ${note ? `<small>${esc(note)}</small>` : ''}
      </div>
    </article>`;
}

function documentHtml({ title, subtitle, body, columns = 3, compact = false }) {
  return `<!doctype html>
  <html><head><meta charset="utf-8"><style>
    * { box-sizing: border-box; }
    html, body { margin: 0; background: #070b12; color: #eef7ff; font-family: Arial, Helvetica, sans-serif; }
    body { padding: 42px; }
    header { display: flex; justify-content: space-between; align-items: end; gap: 32px; margin: 0 0 28px; }
    h1 { margin: 0; font-size: 38px; letter-spacing: .04em; text-transform: uppercase; }
    header p { margin: 7px 0 0; color: #9db0c5; font-size: 16px; }
    .stamp { flex: none; border: 1px solid #2ddefa; color: #71ecff; padding: 8px 12px; font-weight: 800; letter-spacing: .13em; text-transform: uppercase; }
    .grid { display: grid; grid-template-columns: repeat(${columns}, minmax(0, 1fr)); gap: 20px; }
    .card { min-width: 0; overflow: hidden; border: 1px solid #26394f; border-radius: 10px; background: linear-gradient(145deg, #101926, #0b111a); box-shadow: 0 14px 34px #0008; }
    .frame { aspect-ratio: 16 / 10; background: #02050a; overflow: hidden; }
    .frame img { width: 100%; height: 100%; display: block; object-fit: cover; object-position: center; }
    .copy { min-height: ${compact ? '82px' : '102px'}; padding: 13px 16px 15px; display: flex; flex-direction: column; gap: 4px; }
    .copy span { color: #65e9ff; font-size: 11px; font-weight: 800; letter-spacing: .16em; text-transform: uppercase; }
    .copy strong { font-size: ${compact ? '17px' : '20px'}; }
    .copy small { color: #98aabd; line-height: 1.35; font-size: 12px; }
    .pair { margin-bottom: 25px; }
    .pair-title { margin: 0 0 10px; color: #d8e9fa; font-size: 18px; letter-spacing: .08em; text-transform: uppercase; }
    .pair-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 16px; }
    footer { margin-top: 24px; padding-top: 16px; border-top: 1px solid #25364b; color: #71869d; font-size: 12px; letter-spacing: .04em; }
  </style></head><body>
    <header><div><h1>${esc(title)}</h1><p>${esc(subtitle)}</p></div><div class="stamp">Actual Three.js captures</div></header>
    ${body}
    <footer>Get Your Ship Together · Game Polish Test Center · frozen candidate iteration 10 · source commit c3ccd63</footer>
  </body></html>`;
}

async function render(page, output, html, width, viewportHeight = 900) {
  mkdirSync(dirname(output), { recursive: true });
  await page.setViewportSize({ width, height: viewportHeight });
  await page.setContent(html, { waitUntil: 'load' });
  await page.evaluate(() => Promise.all([...document.images].map((img) => img.decode())));
  await page.screenshot({ path: output, fullPage: true, animations: 'disabled' });
}

const final = (name) => resolve(shots, 'final', name);
const baseline = (name) => resolve(shots, 'baseline', name);

const browser = await chromium.launch({
  headless: true,
  executablePath: 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
});
try {
  const page = await browser.newPage({ deviceScaleFactor: 1 });

  const contact = [
    ['World & HUD', 'map-and-hud.png', '128×128 station, sector language, combat HUD'],
    ['Upgrade cards', 'upgrade-cards.png', 'Authored iconography, hierarchy, readable stats'],
    ['Pickup language', 'energy-health-orbs.png', 'Distinct energy coil and medical repair silhouette'],
    ['Repulsor boundary', 'repulsor-boundary.png', 'Collision-faithful layered shock ring'],
    ['Plasma Wake', 'plasma-pad-contract.png', 'Grounded ribbon remains readable over wayfinding'],
    ['Gunship Flyby', 'gunship-lane.png', 'Local targeting corridor; imported ship remains untouched'],
    ['Combat density', 'horde-and-metrics.png', 'Full encounter legibility at 60 FPS sample'],
    ['Boss telegraph', 'boss-attack-t03.png', 'Threat zones preserve the untouched boss asset'],
    ['Orbital strike', 'orbital-strike-t00.png', 'Beam, impact core, and shock structure'],
  ].map(([title, name, note]) => imageCard({ path: final(name), eyebrow: 'Final candidate', title, note })).join('');
  await render(
    page,
    resolve(shots, 'contact-sheets', 'final-polish-contact-sheet.png'),
    documentHtml({
      title: 'Final polish contact sheet',
      subtitle: 'Procedural VFX, UI, and station-layout review — imported asset packs unchanged',
      body: `<main class="grid">${contact}</main>`,
      columns: 3,
      compact: true,
    }),
    1800,
  );

  const comparisons = [
    ['World layout & combat HUD', 'start.png', 'map-and-hud.png', 'Original 64×64 platform', 'Expanded 128×128 authored sectors'],
    ['Upgrade presentation', 'levelup.png', 'upgrade-cards.png', 'Baseline selection overlay', 'Category iconography and stat hierarchy'],
    ['Repulsor feedback', 'repulsor.png', 'repulsor-boundary.png', 'Baseline procedural effect', 'Collision-faithful layered boundary'],
    ['Plasma Wake', 'plasma.png', 'plasma-pad-contract.png', 'Baseline trail treatment', 'Layered wake with pad readability fix'],
    ['Orbital strike', 'orbital.png', 'orbital-strike-t00.png', 'Baseline impact', 'Beam, core, debris, and shock structure'],
    ['Boss attack language', 'boss.png', 'boss-attack-t03.png', 'Baseline attack presentation', 'Readable authored telegraph hierarchy'],
  ].map(([label, before, after, beforeNote, afterNote]) => `
    <section class="pair">
      <h2 class="pair-title">${esc(label)}</h2>
      <div class="pair-grid">
        ${imageCard({ path: baseline(before), eyebrow: 'Baseline · c3ccd63', title: 'Before', note: `${beforeNote} · ${before}` })}
        ${imageCard({ path: final(after), eyebrow: 'Test Center · iteration 10', title: 'After', note: `${afterNote} · ${after}` })}
      </div>
    </section>`).join('');
  await render(
    page,
    resolve(shots, 'comparisons', 'baseline-vs-final.png'),
    documentHtml({
      title: 'Baseline vs Test Center',
      subtitle: 'Same game and imported assets; procedural presentation and layout are the changed layer',
      body: `<main>${comparisons}</main>`,
      columns: 2,
      compact: true,
    }),
    1800,
  );

  for (const [prefix, title, subtitle] of [
    ['boss-attack', 'Boss attack timeline', 'Five synchronized fixture frames showing telegraph, attack, and dissipation'],
    ['orbital-strike', 'Orbital strike timeline', 'Five consecutive fixture frames showing beam, impact, shock, and decay'],
  ]) {
    const cards = Array.from({ length: 5 }, (_, index) => imageCard({
      path: final(`${prefix}-t0${index}.png`),
      eyebrow: `Frame ${index + 1} / 5`,
      title: `T0${index}`,
      note: `${prefix}-t0${index}.png`,
    })).join('');
    await render(
      page,
      resolve(shots, 'timelines', `${prefix}-timeline.png`),
      documentHtml({ title, subtitle, body: `<main class="grid">${cards}</main>`, columns: 5, compact: true }),
      2400,
      480,
    );
  }
} finally {
  await browser.close();
}

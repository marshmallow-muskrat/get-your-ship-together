/**
 * Upgrade-card layout QA.
 *
 * The release browser harness sweeps the viewport x UI-scale matrix on the crew-select
 * screen, but the upgrade cards only exist inside the level-up modal, so nothing
 * automated ever measured them. This script opens the level-up fixture, injects the
 * real card DOM for every card type the game can produce — including deliberately long
 * descriptions — and geometrically checks the two things that were broken:
 *
 *   1. The keyboard shortcut never overlaps the description text.
 *   2. No card region overflows its own card.
 *
 *   node scripts/cardQa.mjs <baseUrl>
 */
import { chromium } from 'playwright';

const baseUrl = process.argv[2];
if (!baseUrl) {
  console.error('usage: node scripts/cardQa.mjs <baseUrl>');
  process.exit(2);
}

const VIEWPORTS = [
  { name: 'desktop-1920', width: 1920, height: 1080 },
  { name: 'desktop-1280', width: 1280, height: 800 },
  { name: 'laptop-1024', width: 1024, height: 768 },
  { name: 'laptop-1366', width: 1366, height: 768 },
];
const UI_SCALES = [0.75, 1, 1.25, 1.5];

const proxyServer = process.env.HTTPS_PROXY || process.env.https_proxy || '';
const useProxy = proxyServer && !/^https?:\/\/(localhost|127\.|\[::1\])/.test(baseUrl);

const browser = await chromium.launch({
  args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--no-sandbox'],
  ...(useProxy ? { proxy: { server: proxyServer, bypass: 'localhost,127.0.0.1,::1' } } : {}),
});

const rows = [];
const failures = [];
const consoleErrors = [];

for (const vp of VIEWPORTS) {
  const page = await browser.newPage({
    viewport: { width: vp.width, height: vp.height },
    ignoreHTTPSErrors: true,
  });
  page.on('console', (m) => {
    if (m.type() === 'error' && !/^Failed to load resource/.test(m.text())) {
      consoleErrors.push(`${vp.name}: ${m.text()}`);
    }
  });
  page.on('pageerror', (e) => consoleErrors.push(`${vp.name}: PAGEERROR ${e.message}`));

  await page.goto(`${baseUrl}/?mode=survivor&fixture=survivor-levelup&hero=red-panda`, {
    waitUntil: 'networkidle',
    timeout: 90000,
  });
  await page.waitForTimeout(3500);

  for (const scale of UI_SCALES) {
    const result = await page.evaluate((s) => {
      document.documentElement.style.setProperty('--ui-scale', String(s));

      const box = document.querySelector('#sv-choices');
      const modal = document.querySelector('#sv-levelup');
      if (!box || !modal) return { error: 'no level-up modal in the DOM' };
      modal.classList.remove('hidden');

      /*
       * The card copy the runtime produces, plus the extremes. Short exercises the
       * minimum height; the long ones are real card copy from the longest authored
       * passive descriptions, which are what actually collided with the shortcut.
       */
      const CASES = [
        {
          label: 'short',
          category: 'WEAPON UPGRADE',
          level: 'L1 → L2',
          kind: 'level',
          parent: 'Pulse Blaster',
          name: 'Pulse Blaster II',
          summary: 'Pulse Blaster hits harder and fires faster.',
          stats: ['Damage 14 → 16'],
          tradeoff: null,
        },
        {
          label: 'acquire',
          category: 'NEW PROTOTYPE',
          level: 'Acquire · L1',
          kind: 'acquire',
          parent: 'Orbital Lance',
          name: 'Orbital Lance I',
          summary:
            'Delayed orbital strike that prefers bosses and dense elites. Prototypes do not use an ordinary weapon slot.',
          stats: ['Strikes 1', 'Damage 140', 'Volley interval 4.20s', 'Radius 3.20'],
          tradeoff: null,
        },
        {
          label: 'long-passive',
          category: 'PASSIVE UPGRADE',
          level: 'L4 → L5 · MAX',
          kind: 'max',
          parent: 'Overdrive Systems',
          name: 'Overdrive Systems',
          summary:
            'Mech Overdrive lasts longer, returns sooner, and moves faster while active. The cooldown is measured activation-to-activation and keeps counting down during Mech, so a longer duration also means less waiting after it ends. The speed bonus applies only in Mech form and multiplies on top of Thruster Boost.',
          stats: [
            'Mech duration 6.8s → 7.0s',
            'Mech cooldown 28.4s → 28.0s',
            'Mech uptime 23.9% → 25.0%',
            'Mech speed +12% → +15%',
            'Hard cap at L5: 7.0s / 28.0s · 25.0% uptime · +15% speed',
            'Reaches its hard cap at this level',
          ],
          tradeoff: null,
        },
        {
          label: 'long-tradeoff',
          category: 'WEAPON UPGRADE',
          level: 'L3 → L4',
          kind: 'level',
          parent: 'Bio-Plasma Glob',
          name: 'Twin Globs',
          summary:
            'Fires 2 projectiles per volley instead of 1. Pulls energy and repair orbs from farther away, and pulls them in faster, and every weapon radius, blast and beam gets larger as the containment field widens.',
          stats: [
            'Projectiles 1 → 2',
            'Impact 47 → 53',
            'Volley interval 0.40s → 0.65s',
            'Volleys/sec 2.49 → 1.54',
            'Puddle damage 5.6 → 6.2',
          ],
          tradeoff: 'Tradeoff: fires 62% less often, smaller projectiles.',
        },
      ];

      box.replaceChildren();
      const labels = ['1', '2', '3'];
      CASES.forEach((c, i) => {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'sv-choice sv-card';
        btn.dataset.case = c.label;

        const head = document.createElement('span');
        head.className = 'sv-card-head';
        const badge = document.createElement('span');
        badge.className = 'eyebrow sv-card-badge';
        badge.textContent = c.category;
        head.appendChild(badge);
        const level = document.createElement('span');
        level.className = 'sv-card-level';
        level.textContent = c.level;
        level.dataset.progression = c.kind;
        head.appendChild(level);
        btn.appendChild(head);

        const parent = document.createElement('span');
        parent.className = 'sv-card-parent';
        parent.textContent = c.parent;
        btn.appendChild(parent);

        const name = document.createElement('strong');
        name.className = 'sv-card-name';
        name.textContent = c.name;
        btn.appendChild(name);

        const body = document.createElement('span');
        body.className = 'sv-card-body';
        const summary = document.createElement('small');
        summary.className = 'sv-card-summary';
        summary.textContent = c.summary;
        body.appendChild(summary);
        const stats = document.createElement('span');
        stats.className = 'sv-card-stats';
        for (const line of c.stats) {
          const row = document.createElement('span');
          row.className = 'sv-card-stat';
          row.textContent = line;
          stats.appendChild(row);
        }
        body.appendChild(stats);
        if (c.tradeoff) {
          const t = document.createElement('span');
          t.className = 'sv-card-tradeoff';
          t.textContent = c.tradeoff;
          body.appendChild(t);
        }
        btn.appendChild(body);

        const footer = document.createElement('span');
        footer.className = 'sv-card-footer';
        const bind = document.createElement('kbd');
        bind.className = 'sv-card-bind';
        bind.textContent = labels[i % 3];
        footer.appendChild(bind);
        btn.appendChild(footer);

        box.appendChild(btn);
      });

      const overlaps = (a, b) =>
        a.left < b.right - 0.5 && b.left < a.right - 0.5 && a.top < b.bottom - 0.5 && b.top < a.bottom - 0.5;

      const problems = [];
      let minGap = Infinity;
      for (const card of box.querySelectorAll('.sv-card')) {
        const id = card.dataset.case;
        const cardRect = card.getBoundingClientRect();
        const bind = card.querySelector('.sv-card-bind').getBoundingClientRect();

        // Every piece of copy on the card must clear the shortcut.
        for (const sel of ['.sv-card-summary', '.sv-card-stat', '.sv-card-tradeoff', '.sv-card-name', '.sv-card-parent', '.sv-card-level']) {
          for (const el of card.querySelectorAll(sel)) {
            const r = el.getBoundingClientRect();
            if (r.width === 0 && r.height === 0) continue;
            if (overlaps(r, bind)) problems.push(`${id}: ${sel} overlaps the shortcut`);
            if (sel === '.sv-card-summary' || sel === '.sv-card-stat' || sel === '.sv-card-tradeoff') {
              minGap = Math.min(minGap, bind.top - r.bottom);
            }
            if (r.right > cardRect.right + 1) problems.push(`${id}: ${sel} overflows the card`);
            if (r.bottom > cardRect.bottom + 1) problems.push(`${id}: ${sel} spills past the card`);
          }
        }
        if (bind.bottom > cardRect.bottom + 1) problems.push(`${id}: shortcut spills past the card`);
        if (cardRect.right > window.innerWidth + 1 || cardRect.left < -1) {
          problems.push(`${id}: card is off-screen`);
        }
      }
      return {
        problems,
        minGap: Number.isFinite(minGap) ? Math.round(minGap * 10) / 10 : null,
        cards: box.querySelectorAll('.sv-card').length,
        boxRight: Math.round(box.getBoundingClientRect().right),
      };
    }, scale);

    if (result.error) {
      failures.push(`${vp.name} @${scale}: ${result.error}`);
      continue;
    }
    const verdict = result.problems.length ? 'FAIL' : 'ok';
    if (result.problems.length) {
      failures.push(...result.problems.map((p) => `${vp.name} @${scale}: ${p}`));
    }
    rows.push({ vp: vp.name, scale, cards: result.cards, minGap: result.minGap, verdict });
  }
  await page.close();
}

await browser.close();

console.log(`\n=== Upgrade-card QA: ${baseUrl} ===\n`);
console.log('| viewport | ui scale | cards | copy→shortcut gap (px) | verdict |');
console.log('| --- | --- | --- | --- | --- |');
for (const r of rows) {
  console.log(`| ${r.vp} | ${r.scale} | ${r.cards} | ${r.minGap ?? 'n/a'} | ${r.verdict} |`);
}

console.log(`\nconsole/page errors: ${consoleErrors.length}`);
for (const e of consoleErrors.slice(0, 15)) console.log('  ERR ' + e.slice(0, 200));

console.log(`\noverlap failures: ${failures.length}`);
for (const f of failures.slice(0, 25)) console.log('  ' + f);

const failed = failures.length > 0 || consoleErrors.length > 0;
console.log(`\nRESULT: ${failed ? 'FAIL' : 'CLEAN'}`);
process.exit(failed ? 1 : 0);

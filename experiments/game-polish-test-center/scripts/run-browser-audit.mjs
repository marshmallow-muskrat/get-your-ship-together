import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { chromium } from 'playwright';

const baselineUrl = 'http://127.0.0.1:4181/';
const candidateUrl = 'http://127.0.0.1:4189/';
const fixtures = [
  'survivor-start',
  'survivor-levelup',
  'survivor-horde',
  'survivor-mech',
  'survivor-boss',
  'survivor-repulsor',
  'survivor-ship',
  'survivor-damage',
  'survivor-miniboss',
  'survivor-pickups',
  'survivor-arc',
  'survivor-orbital',
  'survivor-mega',
  'survivor-mega-cache',
  'survivor-cache',
  'survivor-shield',
  'survivor-recall',
  'survivor-gunship',
  'survivor-identity',
  'survivor-rotary',
  'survivor-boomerang',
  'survivor-plasma-l1',
  'survivor-plasma-ship',
  'survivor-ship-ram',
  'survivor-overdrive',
  'survivor-cleanup-arrival',
  'survivor-cleanup-combat',
  'survivor-cleanup-departure',
  'survivor-telemetry',
  'survivor-stress',
];

const browser = await chromium.launch({
  headless: true,
  executablePath: 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  args: ['--use-angle=swiftshader'],
});

function attachDiagnostics(page) {
  const consoleErrors = [];
  const consoleWarnings = [];
  const pageErrors = [];
  const requestFailures = [];
  page.on('console', (message) => {
    if (message.type() === 'error') consoleErrors.push(message.text());
    if (message.type() === 'warning') consoleWarnings.push(message.text());
  });
  page.on('pageerror', (error) => pageErrors.push(error.message));
  page.on('requestfailed', (request) => {
    requestFailures.push(`${request.method()} ${request.url()} :: ${request.failure()?.errorText ?? 'unknown'}`);
  });
  return { consoleErrors, consoleWarnings, pageErrors, requestFailures };
}

async function waitForGameReady(page, timeout = 20_000) {
  await page.waitForSelector('.survivor-hud', { state: 'attached', timeout });
  await page.waitForFunction(
    () => {
      const canvas = document.querySelector('canvas');
      return !!canvas && canvas.width > 300 && canvas.height > 150;
    },
    undefined,
    { timeout },
  );
}

async function inspectViewport(page) {
  return page.evaluate(() => {
    const canvas = document.querySelector('canvas');
    const body = document.body;
    const root = document.documentElement;
    const levelup = document.querySelector('#sv-levelup');
    const cards = [...document.querySelectorAll('#sv-levelup .sv-choice')].map((element) => {
      const r = element.getBoundingClientRect();
      return { left: r.left, top: r.top, right: r.right, bottom: r.bottom, width: r.width, height: r.height };
    });
    const withinViewport = cards.every((r) =>
      r.left >= -1 && r.top >= -1 && r.right <= innerWidth + 1 && r.bottom <= innerHeight + 1,
    );
    return {
      title: document.title,
      viewport: { width: innerWidth, height: innerHeight },
      document: {
        scrollWidth: Math.max(body.scrollWidth, root.scrollWidth),
        scrollHeight: Math.max(body.scrollHeight, root.scrollHeight),
      },
      horizontalOverflow: Math.max(body.scrollWidth, root.scrollWidth) > innerWidth + 1,
      canvas: canvas
        ? { cssWidth: canvas.getBoundingClientRect().width, cssHeight: canvas.getBoundingClientRect().height, width: canvas.width, height: canvas.height }
        : null,
      hudPresent: !!document.querySelector('.survivor-hud'),
      levelupVisible: !!levelup && !levelup.classList.contains('hidden'),
      cardCount: cards.length,
      cardsWithinViewport: withinViewport,
    };
  });
}

const result = {
  generatedAt: new Date().toISOString(),
  browser: 'system Chrome via Playwright 1.56.1',
  baselineUrl,
  candidateUrl,
  fixtures: [],
  responsive: [],
  metrics: {},
};

try {
  for (const fixture of fixtures) {
    const page = await browser.newPage({ viewport: { width: 1600, height: 1000 } });
    const diagnostics = attachDiagnostics(page);
    const started = Date.now();
    let navigationError = null;
    try {
      await page.goto(`${candidateUrl}?fixture=${fixture}&hero=bee`, { waitUntil: 'networkidle', timeout: 20_000 });
      await waitForGameReady(page);
      await page.waitForTimeout(fixture === 'survivor-stress' ? 1_500 : 700);
    } catch (error) {
      navigationError = error instanceof Error ? error.message : String(error);
    }
    const viewport = navigationError ? null : await inspectViewport(page);
    result.fixtures.push({
      fixture,
      elapsedMs: Date.now() - started,
      navigationError,
      ...diagnostics,
      viewport,
      passed:
        !navigationError &&
        diagnostics.consoleErrors.length === 0 &&
        diagnostics.pageErrors.length === 0 &&
        diagnostics.requestFailures.length === 0 &&
        !!viewport?.canvas &&
        viewport.canvas.width > 0 &&
        viewport.canvas.height > 0 &&
        viewport.hudPresent,
    });
    await page.close();
  }

  for (const check of [
    { fixture: 'survivor-start', width: 1366, height: 768 },
    { fixture: 'survivor-levelup', width: 1366, height: 768 },
    { fixture: 'survivor-start', width: 1024, height: 768 },
    { fixture: 'survivor-levelup', width: 1024, height: 768 },
  ]) {
    const page = await browser.newPage({ viewport: { width: check.width, height: check.height } });
    const diagnostics = attachDiagnostics(page);
    await page.goto(`${candidateUrl}?fixture=${check.fixture}&hero=bee`, { waitUntil: 'networkidle', timeout: 20_000 });
    await waitForGameReady(page);
    await page.waitForTimeout(500);
    const viewport = await inspectViewport(page);
    result.responsive.push({
      ...check,
      ...diagnostics,
      viewport,
      passed:
        !viewport.horizontalOverflow &&
        !!viewport.canvas &&
        viewport.canvas.width > 0 &&
        (!viewport.levelupVisible || (viewport.cardCount === 3 && viewport.cardsWithinViewport)) &&
        diagnostics.consoleErrors.length === 0 &&
        diagnostics.pageErrors.length === 0 &&
        diagnostics.requestFailures.length === 0,
    });
    await page.close();
  }

  for (const [label, url] of [['baseline', baselineUrl], ['candidate', candidateUrl]]) {
    const page = await browser.newPage({ viewport: { width: 1600, height: 1000 } });
    const diagnostics = attachDiagnostics(page);
    await page.goto(`${url}?fixture=survivor-horde&hero=bee`, { waitUntil: 'networkidle', timeout: 20_000 });
    await waitForGameReady(page);
    await page.waitForTimeout(3_000);
    result.metrics[label] = {
      text: await page.locator('#sv-metrics').innerText(),
      ...diagnostics,
    };
    await page.close();
  }
} finally {
  await browser.close();
}

const fixturePasses = result.fixtures.filter((entry) => entry.passed).length;
const responsivePasses = result.responsive.filter((entry) => entry.passed).length;
result.summary = {
  fixturePasses,
  fixtureTotal: result.fixtures.length,
  responsivePasses,
  responsiveTotal: result.responsive.length,
  consoleErrors: result.fixtures.reduce((n, entry) => n + entry.consoleErrors.length, 0),
  pageErrors: result.fixtures.reduce((n, entry) => n + entry.pageErrors.length, 0),
  requestFailures: result.fixtures.reduce((n, entry) => n + entry.requestFailures.length, 0),
};

const output = resolve('experiments/game-polish-test-center/reports/browser-audit.json');
mkdirSync(resolve('experiments/game-polish-test-center/reports'), { recursive: true });
writeFileSync(output, `${JSON.stringify(result, null, 2)}\n`);

process.stdout.write(
  `fixtures ${fixturePasses}/${result.fixtures.length}; responsive ${responsivePasses}/${result.responsive.length}; ` +
  `console ${result.summary.consoleErrors}; page ${result.summary.pageErrors}; requests ${result.summary.requestFailures}\n`,
);

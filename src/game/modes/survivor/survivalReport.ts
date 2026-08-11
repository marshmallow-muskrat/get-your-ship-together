/** Generated Markdown/SVG formatting for the full-run survival benchmark. */
import type {
  HeroSurvivalSummary,
  SurvivalBenchmarkResult,
} from './survivorSurvivalBenchmark';

export const PROVISIONAL_STANDARD_TARGET = {
  medianSeconds: 12 * 60,
  standardDeviationLow: 3.5 * 60,
  standardDeviationHigh: 4.0 * 60,
  upper2SigmaLow: 18 * 60,
  upper2SigmaHigh: 20 * 60,
  upper3SigmaLow: 22 * 60,
  upper3SigmaHigh: 24 * 60,
} as const;

const HERO_NAME: Record<string, string> = {
  bee: 'Boswell',
  flamingo: 'Fitzwilliam',
  frog: 'Fortunato',
  'red-panda': 'Rutherford',
};

function duration(seconds: number): string {
  const whole = Math.max(0, Math.round(seconds));
  const m = Math.floor(whole / 60);
  return `${m}:${String(whole % 60).padStart(2, '0')}`;
}

function fixed(value: number, digits = 1): string {
  return value.toFixed(digits);
}

function deathSummary(hero: HeroSurvivalSummary): string {
  return Object.entries(hero.deaths)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3)
    .map(([name, count]) => `${name} ${count}`)
    .join(', ') || 'none';
}

export function formatSurvivalMarkdown(result: SurvivalBenchmarkResult): string {
  const L: string[] = [];
  L.push('# Survival Benchmark');
  L.push('');
  L.push(`Balance version: \`${result.balanceVersion}\``);
  L.push(`Experiment: \`${result.label}\``);
  L.push(`Policy: \`${result.policy}\``);
  L.push(`Sample: ${result.runsPerHero} seeded runs per hero; ${result.runs.length} total runs; ${result.maxMinutes}-minute censor limit.`);
  L.push('');
  L.push('**This file is generated.** Regenerate it with `npm run bench:survival`.');
  L.push('The simulation is a regression instrument, not a substitute for human playtesting.');
  L.push('');
  L.push('![Mean survival time with one-standard-deviation bars](generated/survival-time-standard-deviation.svg)');
  L.push('');
  L.push('## Survival distribution');
  L.push('');
  L.push('| Hero | Runs | Mean ± SD | 95% CI | Median | P10 | P25 | P75 | P90 | Censored |');
  L.push('| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |');
  for (const h of result.heroes) {
    L.push(`| ${HERO_NAME[h.heroId]} | ${h.n} | ${duration(h.mean)} ± ${duration(h.standardDeviation)} | ${duration(h.confidence95Low)}–${duration(h.confidence95High)} | ${duration(h.median)} | ${duration(h.p10)} | ${duration(h.p25)} | ${duration(h.p75)} | ${duration(h.p90)} | ${h.censored} |`);
  }
  L.push('');
  L.push('Standard deviation describes spread around the mean. Median and percentiles are');
  L.push('included because endless-run survival is usually skewed rather than normally distributed.');
  L.push('Censored runs reached the safety limit alive and are not treated as observed deaths.');
  L.push('');
  const target = PROVISIONAL_STANDARD_TARGET;
  const upper2 = result.overall.mean + result.overall.standardDeviation * 2;
  const upper3 = result.overall.mean + result.overall.standardDeviation * 3;
  L.push('## Provisional Standard-mode contract');
  L.push('');
  L.push('This target comes from the founders and remains provisional until simulated policies');
  L.push('are calibrated against human playtests. It is a decision aid, not an automatic tuning order.');
  L.push('');
  L.push('| Measure | Target | Observed |');
  L.push('| --- | ---: | ---: |');
  L.push(`| Competent median | ≈${duration(target.medianSeconds)} | ${duration(result.overall.median)} |`);
  L.push(`| Standard deviation | ${duration(target.standardDeviationLow)}–${duration(target.standardDeviationHigh)} | ${duration(result.overall.standardDeviation)} |`);
  L.push(`| Mean + 2σ | ${duration(target.upper2SigmaLow)}–${duration(target.upper2SigmaHigh)} | ${duration(upper2)} |`);
  L.push(`| Mean + 3σ | ${duration(target.upper3SigmaLow)}–${duration(target.upper3SigmaHigh)} | ${duration(upper3)} |`);
  L.push('');
  L.push('## Pressure and agency diagnostics');
  L.push('');
  L.push('| Hero | Kills | Elite kills | Mean elites alive | Peak elites alive | Bosses | Mech uptime | Gunship uses | Gunship damage | Kills/use |');
  L.push('| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |');
  for (const h of result.heroes) {
    const killsPerUse = h.meanGunshipUses > 0 ? h.meanGunshipKills / h.meanGunshipUses : 0;
    L.push(`| ${HERO_NAME[h.heroId]} | ${fixed(h.meanKills, 0)} | ${fixed(h.meanEliteKills, 1)} | ${fixed(h.meanLivingElites, 1)} | ${fixed(h.meanPeakLivingElites, 1)} | ${fixed(h.meanBossesDefeated, 1)} | ${fixed(h.meanMechUptime * 100, 1)}% | ${fixed(h.meanGunshipUses, 2)} | ${fixed(h.meanGunshipDamage, 0)} | ${fixed(killsPerUse, 1)} |`);
  }
  L.push('');
  L.push('## Leading death sources');
  L.push('');
  for (const h of result.heroes) L.push(`- **${HERO_NAME[h.heroId]}:** ${deathSummary(h)}`);
  L.push('');
  L.push('## Methodology');
  L.push('');
  L.push('- Runs execute the real deterministic fixed-step simulation without Three.js rendering.');
  L.push('- Every hero receives the same seed set, making spawn and director schedules comparable.');
  L.push('- The policy sees current state only. It has no future RNG, attack outcome, or spawn knowledge.');
  L.push('- Movement, cooldowns, upgrade cards, Cache collection, Protocol selection, bosses and death use production code.');
  L.push('- The competent policy kites local threats, pursues reachable objectives, and uses abilities reactively with a bounded reaction interval.');
  L.push('- Human playtesting remains authoritative for readability, satisfaction, fairness and fun.');
  L.push('');
  L.push(`Generated: ${result.generatedAt}`);
  return `${L.join('\n')}\n`;
}

function avg(values: number[]): number {
  return values.length > 0 ? values.reduce((a, b) => a + b, 0) / values.length : 0;
}

/** Durable experiment ledger generated from preserved raw snapshots. */
export function formatSurvivalHistory(results: SurvivalBenchmarkResult[]): string {
  const ordered = [...results].sort((a, b) => a.generatedAt.localeCompare(b.generatedAt));
  const L: string[] = [];
  L.push('# Survival Experiment History');
  L.push('');
  L.push('Every row is generated from a preserved seeded simulation snapshot. Failed');
  L.push('experiments remain here as evidence even when their implementation is discarded.');
  L.push('');
  L.push('| Experiment | Policy | Runs | Median | SD | Mean + 2σ | Mean + 3σ | Elite peak | Mech uptime | Gunship kills/use |');
  L.push('| --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |');
  for (const r of ordered) {
    const elitePeak = avg(r.heroes.map((h) => h.meanPeakLivingElites));
    const mech = avg(r.heroes.map((h) => h.meanMechUptime));
    const uses = avg(r.heroes.map((h) => h.meanGunshipUses ?? 0));
    const kills = avg(r.heroes.map((h) => h.meanGunshipKills));
    L.push(`| ${r.label} | ${r.policy} | ${r.runs.length} | ${duration(r.overall.median)} | ${duration(r.overall.standardDeviation)} | ${duration(r.overall.mean + r.overall.standardDeviation * 2)} | ${duration(r.overall.mean + r.overall.standardDeviation * 3)} | ${fixed(elitePeak, 1)} | ${fixed(mech * 100, 1)}% | ${uses > 0 ? fixed(kills / uses, 1) : '—'} |`);
  }
  L.push('');
  L.push('## Per-hero medians');
  L.push('');
  L.push('| Experiment | Boswell | Fitzwilliam | Fortunato | Rutherford |');
  L.push('| --- | ---: | ---: | ---: | ---: |');
  for (const r of ordered) {
    const med = (hero: string) => duration(r.heroes.find((h) => h.heroId === hero)?.median ?? 0);
    L.push(`| ${r.label} (${r.policy}) | ${med('bee')} | ${med('flamingo')} | ${med('frog')} | ${med('red-panda')} |`);
  }
  L.push('');
  L.push('## Interpretation guardrail');
  L.push('');
  L.push('- Candidate deltas are trustworthy only within the same policy and identical seed set.');
  L.push('- **Snapshots are only comparable when generated on the same machine and Node build.**');
  L.push('  The simulation is deterministic on a given platform — two 96-run benchmarks on one');
  L.push('  machine reproduce 96/96 identically — but it is not bit-portable across platforms.');
  L.push('  V8 transcendental results (sin/cos/exp/pow) are not guaranteed identical across');
  L.push('  builds, and a sub-ulp difference cascades once it flips a decision threshold.');
  L.push('  Re-running the 2.7.0 baseline on new hardware reproduced only 59 of 96 runs.');
  L.push('  Always regenerate the baseline locally before A/B testing a candidate against it;');
  L.push('  never diff a candidate against a snapshot inherited from another machine.');
  L.push('- A novice/competent/expert ordering that is not monotonic means those policies need');
  L.push('  further human calibration; it is not evidence that expert play is worse.');
  L.push('- Visual clarity, satisfaction, fairness and fun still require Test Center playtesting.');
  return `${L.join('\n')}\n`;
}

function esc(text: string): string {
  return text.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' })[c]!);
}

export function formatSurvivalSvg(result: SurvivalBenchmarkResult): string {
  const width = 1000;
  const height = 430;
  const left = 190;
  const right = 55;
  const top = 72;
  const rowH = 72;
  const maxSeconds = Math.max(
    60,
    ...result.heroes.map((h) => h.mean + h.standardDeviation),
    ...result.heroes.map((h) => h.p90),
  );
  const maxMinutes = Math.ceil(maxSeconds / 300) * 5;
  const plotW = width - left - right;
  const x = (seconds: number) => left + (seconds / (maxMinutes * 60)) * plotW;
  const ticks: string[] = [];
  for (let m = 0; m <= maxMinutes; m += 5) {
    const px = x(m * 60);
    ticks.push(`<line x1="${px}" y1="${top - 12}" x2="${px}" y2="${height - 55}" stroke="#263552" stroke-width="1"/>`);
    ticks.push(`<text x="${px}" y="${height - 28}" text-anchor="middle" class="tick">${m}m</text>`);
  }
  const rows = result.heroes.map((h, i) => {
    const y = top + i * rowH + 22;
    const low = x(Math.max(0, h.mean - h.standardDeviation));
    const high = x(h.mean + h.standardDeviation);
    const mean = x(h.mean);
    const median = x(h.median);
    return `<g>
      <text x="${left - 18}" y="${y + 6}" text-anchor="end" class="hero">${esc(HERO_NAME[h.heroId] ?? h.heroId)}</text>
      <line x1="${low}" y1="${y}" x2="${high}" y2="${y}" stroke="#72d8ff" stroke-width="10" stroke-linecap="round" opacity="0.55"/>
      <line x1="${low}" y1="${y - 11}" x2="${low}" y2="${y + 11}" stroke="#bdefff" stroke-width="2"/>
      <line x1="${high}" y1="${y - 11}" x2="${high}" y2="${y + 11}" stroke="#bdefff" stroke-width="2"/>
      <circle cx="${mean}" cy="${y}" r="8" fill="#ffb34d" stroke="#fff0c7" stroke-width="2"/>
      <path d="M ${median} ${y - 12} L ${median + 7} ${y} L ${median} ${y + 12} L ${median - 7} ${y} Z" fill="#f7fbff"/>
      <text x="${Math.min(width - 92, high + 14)}" y="${y + 5}" class="value">${duration(h.mean)} ± ${duration(h.standardDeviation)}</text>
    </g>`;
  }).join('\n');
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" role="img" aria-labelledby="title desc">
  <title id="title">Mean survival time and standard deviation by hero</title>
  <desc id="desc">Orange circles show means, cyan bars show plus or minus one standard deviation, and white diamonds show medians.</desc>
  <style>
    text { font-family: ui-monospace, SFMono-Regular, Menlo, monospace; fill: #dce8ff; }
    .title { font-size: 24px; font-weight: 700; }
    .subtitle, .tick { font-size: 13px; fill: #91a4c8; }
    .hero { font-size: 17px; font-weight: 700; }
    .value { font-size: 13px; fill: #bdefff; }
  </style>
  <rect width="100%" height="100%" rx="18" fill="#081120"/>
  <text x="${left}" y="34" class="title">Survival time distribution</text>
  <text x="${left}" y="54" class="subtitle">mean ± 1 SD (cyan) · median (white) · ${esc(result.policy)} policy</text>
  ${ticks.join('\n')}
  ${rows}
</svg>\n`;
}

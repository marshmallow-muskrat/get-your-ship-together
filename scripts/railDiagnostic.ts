/**
 * Fitzwilliam diagnostic instrument (endless-2.8.0 stabilization).
 *
 * Runs matched-seed, hero-restricted five-minute simulations with the benchmark-only
 * recorder attached and reports the measurements that separate the three candidate
 * explanations for his early-death rate:
 *
 *   policy failure     — breadth was offered and the policy declined it
 *   targeting failure  — the line fired is materially worse than the line available
 *   geometry failure   — no single line answers the surround, whatever is chosen
 *
 * Usage:
 *   npx vite-node scripts/railDiagnostic.ts -- [--hero flamingo] [--runs 384]
 *                                              [--minutes 5] [--policy competent]
 *                                              [--seed-base 5351936] [--json out.json]
 *
 * The seed base and run count are explicit so an exploratory set and a disjoint
 * confirmation set can never be confused for one another in a later reading.
 */
import { writeFileSync } from 'node:fs';
import type { HeroId } from '../src/game/content/heroes';
import {
  runSurvivalSimulation,
  type SurvivalPolicyId,
} from '../src/game/modes/survivor/survivorSurvivalBenchmark';

function arg(name: string, fallback: string): string {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1]! : fallback;
}

const heroId = arg('hero', 'flamingo') as HeroId;
const runs = Number(arg('runs', '384'));
const minutes = Number(arg('minutes', '5'));
const policy = arg('policy', 'competent') as SurvivalPolicyId;
const seedBase = Number(arg('seed-base', String(0x51a700)));
const jsonOut = arg('json', '');
const label = arg('label', 'diagnostic');
const has = (name: string): boolean => process.argv.includes(`--${name}`);
const experiments = {
  coverageAware: has('coverage-aware'),
  forceEarlyAcquisition: has('force-acquisition'),
};

const EARLY = minutes * 60;
const pct = (v: number): string => `${(v * 100).toFixed(1)}%`;
const num = (v: number, d = 2): string => (Number.isFinite(v) ? v.toFixed(d) : '—');

interface Row {
  seed: number;
  survivalTime: number;
  early: boolean;
  kills: number;
  deathSource: string;
  railShots: number;
  railEmpty: number;
  railIntersections: number;
  railKills: number;
  railDamage: number;
  railOverkill: number;
  bossOverrides: number;
  chosenScore: number;
  sweepScore: number;
  bossOverrideLost: number;
  totalLost: number;
  /** Selections, in order, as `progression` | `acquisition` | `passive` | other. */
  selections: string[];
  selectionTimes: number[];
  selectionLevels: number[];
  /** Whether an acquisition card was on the table for each of the first three offers. */
  acquisitionOffered: boolean[];
  weaponsAt120: number;
  weaponsAt300: number;
  meanEnclosure: number;
  peakEnclosure: number;
  meanWithin10: number;
}

const rows: Row[] = [];
for (let i = 0; i < runs; i += 1) {
  const seed = seedBase + i * 7919;
  const r = runSurvivalSimulation({
    heroId,
    policy,
    seed,
    maxMinutes: minutes,
    diagnostics: true,
    experiments,
  });
  const d = r.diag!;
  const at = (t: number): number => {
    const s = [...d.samples].reverse().find((x) => x.time <= t);
    return s ? s.portfolio.length : 0;
  };
  rows.push({
    seed,
    survivalTime: r.survivalTime,
    early: r.survivalTime < EARLY - 1e-6,
    kills: r.kills,
    deathSource: r.deathSource,
    railShots: d.rail.shots,
    railEmpty: d.rail.emptyShots,
    railIntersections: d.rail.intersections,
    railKills: d.rail.kills,
    railDamage: d.rail.damage,
    railOverkill: d.rail.overkill,
    bossOverrides: d.rail.bossOverrides,
    chosenScore: d.rail.chosenScore,
    sweepScore: d.rail.sweepBestScore,
    bossOverrideLost: d.rail.bossOverrideLost,
    totalLost: d.rail.totalLost,
    selections: d.offers.map((o) =>
      o.selectedIsProgression
        ? 'progression'
        : o.selectedIsAcquisition
          ? 'acquisition'
          : (o.selectedKind ?? 'none'),
    ),
    selectionTimes: d.offers.map((o) => o.time),
    selectionLevels: d.offers.map((o) => o.level),
    acquisitionOffered: d.offers.slice(0, 3).map((o) => o.offeredKinds.includes('acquisition')),
    weaponsAt120: at(120),
    weaponsAt300: at(300),
    meanEnclosure: d.samples.length
      ? d.samples.reduce((a, s) => a + s.enclosure, 0) / d.samples.length
      : 0,
    peakEnclosure: d.samples.reduce((a, s) => Math.max(a, s.enclosure), 0),
    meanWithin10: d.samples.length
      ? d.samples.reduce((a, s) => a + s.within10, 0) / d.samples.length
      : 0,
  });
}

const early = rows.filter((r) => r.early);
const late = rows.filter((r) => !r.early);
const mean = (xs: number[]): number => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : NaN);
const sum = (xs: number[]): number => xs.reduce((a, b) => a + b, 0);

console.log(`# Fitzwilliam diagnostic — ${label}`);
console.log(
  `hero=${heroId} policy=${policy} runs=${runs} minutes=${minutes} seedBase=0x${seedBase.toString(16)}` +
    ` experiments=${JSON.stringify(experiments)}`,
);
console.log(`\nunder-${minutes}:00  ${early.length}/${rows.length}  ${pct(early.length / rows.length)}`);

const group = (name: string, set: Row[]): void => {
  if (!set.length) return;
  const shots = sum(set.map((r) => r.railShots));
  const inter = sum(set.map((r) => r.railIntersections));
  const empty = sum(set.map((r) => r.railEmpty));
  const chosen = sum(set.map((r) => r.chosenScore));
  const sweep = sum(set.map((r) => r.sweepScore));
  const ovr = sum(set.map((r) => r.bossOverrides));
  console.log(`\n## ${name}  (n=${set.length})`);
  console.log(`  survival mean            ${num(mean(set.map((r) => r.survivalTime)), 1)}s`);
  console.log(`  kills mean               ${num(mean(set.map((r) => r.kills)), 1)}`);
  console.log(`  rail shots / run         ${num(shots / set.length, 1)}`);
  console.log(`  enemies intersected/shot ${num(inter / Math.max(1, shots), 3)}`);
  console.log(`  shots hitting nothing    ${pct(empty / Math.max(1, shots))}`);
  console.log(`  rail kills / run         ${num(sum(set.map((r) => r.railKills)) / set.length, 1)}`);
  console.log(
    `  overkill share           ${pct(sum(set.map((r) => r.railOverkill)) / Math.max(1, sum(set.map((r) => r.railDamage))))}`,
  );
  console.log(`  chosen line score/shot   ${num(chosen / Math.max(1, shots), 3)}`);
  console.log(`  sweep-best score/shot    ${num(sweep / Math.max(1, shots), 3)}`);
  console.log(
    `  targeting headroom       ${num(sum(set.map((r) => r.totalLost)) / Math.max(1, shots), 3)} per shot ` +
      `(${pct(sum(set.map((r) => r.totalLost)) / Math.max(1e-9, sweep))} of available)`,
  );
  console.log(`  boss-override shots      ${pct(ovr / Math.max(1, shots))}`);
  console.log(
    `  horde value lost to it   ${num(sum(set.map((r) => r.bossOverrideLost)) / Math.max(1, ovr), 3)} per override shot`,
  );
  console.log(`  mean enclosure           ${pct(mean(set.map((r) => r.meanEnclosure)))}`);
  console.log(`  peak enclosure           ${pct(mean(set.map((r) => r.peakEnclosure)))}`);
  console.log(`  mean enemies within 10   ${num(mean(set.map((r) => r.meanWithin10)), 1)}`);
  console.log(`  weapons held at 2:00     ${num(mean(set.map((r) => r.weaponsAt120)), 2)}`);
};

group('runs ending before the horizon', early);
group('runs surviving the horizon', late);

console.log('\n## selection composition');
const firstThree = [0, 1, 2];
for (const k of firstThree) {
  const withOffer = rows.filter((r) => r.acquisitionOffered[k] === true);
  const took = withOffer.filter((r) => r.selections[k] === 'acquisition');
  const anySel = rows.filter((r) => r.selections[k] != null);
  const counts = new Map<string, number>();
  for (const r of anySel) counts.set(r.selections[k]!, (counts.get(r.selections[k]!) ?? 0) + 1);
  console.log(
    `  selection ${k + 1}: ` +
      [...counts.entries()].sort((a, b) => b[1] - a[1]).map(([n, c]) => `${n} ${c}`).join(', ') +
      `  | acquisition offered ${withOffer.length}/${anySel.length}, taken ${took.length} ` +
      `(${pct(took.length / Math.max(1, withOffer.length))} of offers)`,
  );
}

const allSel = rows.flatMap((r) => r.selections);
const allCounts = new Map<string, number>();
for (const s of allSel) allCounts.set(s, (allCounts.get(s) ?? 0) + 1);
console.log(
  `  all selections: ` +
    [...allCounts.entries()].sort((a, b) => b[1] - a[1]).map(([n, c]) => `${n} ${c} (${pct(c / allSel.length)})`).join(', '),
);

console.log('\n## survival conditional on early selections');
for (const k of firstThree) {
  const kinds = [...new Set(rows.map((r) => r.selections[k]).filter(Boolean))] as string[];
  const parts = kinds.map((kind) => {
    const set = rows.filter((r) => r.selections[k] === kind);
    return `${kind} n=${set.length} under=${pct(set.filter((r) => r.early).length / set.length)}`;
  });
  console.log(`  selection ${k + 1}: ${parts.join('  |  ')}`);
}

console.log('\n## death sources (early runs)');
const ds = new Map<string, number>();
for (const r of early) ds.set(r.deathSource, (ds.get(r.deathSource) ?? 0) + 1);
console.log(
  '  ' + [...ds.entries()].sort((a, b) => b[1] - a[1]).map(([n, c]) => `${n} ${c}`).join(', '),
);

if (jsonOut) {
  writeFileSync(jsonOut, `${JSON.stringify({ label, heroId, policy, runs, minutes, seedBase, rows }, null, 2)}\n`);
  console.log(`\nwrote ${jsonOut}`);
}

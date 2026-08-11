/** Generate the repair-economy benchmark report and raw snapshot. */
import { mkdirSync, writeFileSync } from 'node:fs';
import { SURVIVOR_BALANCE_VERSION } from '../src/game/modes/survivor/survivorContent';
import {
  runRepairBenchmark,
  type RepairBenchmarkResult,
} from '../src/game/modes/survivor/survivorRepairBenchmark';

function arg(name: string, fallback: string): string {
  const prefix = `--${name}=`;
  return process.argv.find((v) => v.startsWith(prefix))?.slice(prefix.length) ?? fallback;
}

const seeds = Math.max(1, Number.parseInt(arg('seeds', '8'), 10));
const label = arg('label', 'current');
const snapshot = arg('snapshot', '');

const result = runRepairBenchmark({
  label,
  balanceVersion: SURVIVOR_BALANCE_VERSION,
  seedsPerScenario: seeds,
});

const n1 = (v: number) => (Number.isFinite(v) ? v.toFixed(1) : '—');
const n0 = (v: number) => (Number.isFinite(v) ? Math.round(v).toString() : '—');

function markdown(r: RepairBenchmarkResult): string {
  const L: string[] = [];
  L.push('# Repair Economy Benchmark');
  L.push('');
  L.push(`Balance version: \`${r.balanceVersion}\``);
  L.push(`Experiment: \`${r.label}\``);
  L.push(`Policy: \`${r.policy}\`; ${r.seedsPerScenario} seeds per scenario.`);
  L.push('');
  L.push('**This file is generated.** Regenerate it with `npm run bench:repair`.');
  L.push('');
  L.push('Scenarios are windows onto the real simulation at controlled kill rates, so a');
  L.push('healing faucet can be rejected before a 96-run survival benchmark is spent on it.');
  L.push('Snapshots are only comparable when generated on the same machine and Node build;');
  L.push('see the portability guardrail in `SURVIVAL_EXPERIMENTS.md`.');
  L.push('');
  L.push('## Supply and flow');
  L.push('');
  L.push('| Scenario | Kills/min | Ordinary | Premium | Kills per ordinary drop | Healing/active min |');
  L.push('| --- | ---: | ---: | ---: | ---: | ---: |');
  for (const x of r.rows) {
    L.push(
      `| \`${x.scenarioId}\` | ${n1(x.killsPerMinute)} | ${n1(x.ordinarySpawned)} | ${n1(x.premiumSpawned)} | ` +
        `${n1(x.killsPerOrdinaryDrop)} | ${n1(x.healingPerActiveMinute)} |`,
    );
  }
  L.push('');
  L.push('## Orb outcomes');
  L.push('');
  L.push('| Scenario | Collected | Expired | Expired at full | Delivered | Overheal |');
  L.push('| --- | ---: | ---: | ---: | ---: | ---: |');
  for (const x of r.rows) {
    L.push(
      `| \`${x.scenarioId}\` | ${n1(x.collected)} | ${n1(x.expired)} | ${n1(x.expiredAtFullHealth)} | ` +
        `${n0(x.healingDelivered)} | ${n0(x.overheal)} |`,
    );
  }
  L.push('');
  L.push('## Availability and pressure');
  L.push('');
  L.push('| Scenario | Mean active | Peak active | Mean nearest | Longest kill drought | Longest time drought | <75% | <50% | <25% | Deaths (no orb) |');
  L.push('| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |');
  for (const x of r.rows) {
    L.push(
      `| \`${x.scenarioId}\` | ${n1(x.meanActiveOrbs)} | ${n0(x.peakActiveOrbs)} | ${n1(x.meanNearestDistance)} | ` +
        `${n0(x.longestKillDryStreak)} | ${n1(x.longestTimeDryStreak)}s | ${n0(x.timeBelow75)}s | ` +
        `${n0(x.timeBelow50)}s | ${n0(x.timeBelow25)}s | ${x.deaths} (${x.deathsWithNoOrbAvailable}) |`,
    );
  }
  L.push('');
  L.push('## Scenarios');
  L.push('');
  for (const x of r.rows) {
    L.push(`- \`${x.scenarioId}\` — ${x.description} ${x.windowSeconds}s window.`);
  }
  L.push('');
  L.push('## Reading this');
  L.push('');
  L.push('- **Kills per ordinary drop** is the tap width. A kill-driven economy should hold this');
  L.push('  roughly stable across scenarios; a number that falls as kill rate rises is a faucet.');
  L.push('- **Healing per active minute** is the flow. It may rise with kill rate, but it becomes');
  L.push('  a faucet when it outruns the damage the same horde inflicts.');
  L.push('- **Expired at full** is not waste. It is the player banking an orb for later, which is');
  L.push('  the intended affordance.');
  L.push('- **Deaths (no orb)** counts runs that ended with no ordinary orb anywhere. A non-zero');
  L.push('  value means availability, not player skill, decided the run.');
  L.push('');
  L.push(`Generated: ${r.generatedAt}`);
  return `${L.join('\n')}\n`;
}

mkdirSync('docs/generated', { recursive: true });
writeFileSync('docs/REPAIR_BENCHMARK.md', markdown(result));
writeFileSync('docs/generated/repair-benchmark.json', `${JSON.stringify(result, null, 2)}\n`);
if (snapshot) {
  const safe = snapshot.replace(/[^a-zA-Z0-9._-]/g, '-');
  mkdirSync('docs/generated/baselines', { recursive: true });
  writeFileSync(`docs/generated/baselines/${safe}.json`, `${JSON.stringify(result, null, 2)}\n`);
}
process.stdout.write(`docs/REPAIR_BENCHMARK.md generated from ${result.rows.length} scenarios\n`);

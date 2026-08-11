/** Generate the boss damage benchmark report and raw snapshot. */
import { mkdirSync, writeFileSync } from 'node:fs';
import { SURVIVOR_BALANCE_VERSION } from '../src/game/modes/survivor/survivorContent';
import {
  runBossDamageBenchmark,
  type BossDamageBenchmarkResult,
} from '../src/game/modes/survivor/survivorBossDamageBenchmark';

function arg(name: string, fallback: string): string {
  const prefix = `--${name}=`;
  return process.argv.find((v) => v.startsWith(prefix))?.slice(prefix.length) ?? fallback;
}

const label = arg('label', 'current');
const snapshot = arg('snapshot', '');
const maxBossIndex = Math.max(1, Number.parseInt(arg('bosses', '13'), 10));
const censusSeeds = Math.max(1, Number.parseInt(arg('census-seeds', '6'), 10));

const result = runBossDamageBenchmark({
  label,
  balanceVersion: SURVIVOR_BALANCE_VERSION,
  maxBossIndex,
  censusSeeds,
});

const n1 = (v: number) => (Number.isFinite(v) ? v.toFixed(1) : '—');
const n2 = (v: number) => (Number.isFinite(v) ? v.toFixed(2) : '—');
const n3 = (v: number) => (Number.isFinite(v) ? v.toFixed(3) : '—');

function markdown(r: BossDamageBenchmarkResult): string {
  const L: string[] = [];
  L.push('# Boss Damage Benchmark');
  L.push('');
  L.push(`Balance version: \`${r.balanceVersion}\``);
  L.push(`Experiment: \`${r.label}\``);
  L.push('');
  L.push('**This file is generated.** Regenerate it with `npm run bench:bossdamage`.');
  L.push('');
  L.push('Boss fairness has two questions. Whether the physical hierarchy is real at every');
  L.push('boss index — which a table of authored constants only answers for boss 1 — and');
  L.push('whether one committed action lands one impact, which a table cannot answer at all.');
  L.push('The scaling section below evaluates the shared damage law across the ladder; the');
  L.push('census section drives the real simulation and counts what the player was billed.');
  L.push('');
  L.push('## Physical hierarchy');
  L.push('');
  L.push(
    `Body and charge are authored against the representative ranged impact ` +
      `(\`projectile\`, ${n1(r.referenceRangedDamage)} at boss 1).`,
  );
  L.push('');
  L.push(`| Tier | Band | Observed (all indexes/phases) |`);
  L.push('| --- | ---: | ---: |');
  const bodyRatios = r.scaling.map((s) => s.bodyRatio);
  const chargeRatios = r.scaling.map((s) => s.chargeRatio);
  const span = (v: number[]) =>
    Math.max(...v) - Math.min(...v) < 1e-9 ? n3(v[0]!) : `${n3(Math.min(...v))}–${n3(Math.max(...v))}`;
  L.push(`| Body | ${n2(r.bodyBand[0])}–${n2(r.bodyBand[1])}x | ${span(bodyRatios)}x |`);
  L.push(`| Telegraphed charge | ${n2(r.chargeBand[0])}–${n2(r.chargeBand[1])}x | ${span(chargeRatios)}x |`);
  L.push('');
  L.push('A single value in the observed column means the ratio is constant across every');
  L.push('boss index and phase, which is the point: one scaling law, applied once.');
  L.push('');
  L.push('## Scaling ladder (phase 1)');
  L.push('');
  L.push('| Boss | Mega | Damage x | Projectile | Beam | Radial | Puddle | Body | Charge |');
  L.push('| ---: | :-: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |');
  for (const s of r.scaling.filter((x) => x.phase === 1)) {
    L.push(
      `| ${s.index} | ${s.isMega ? 'Y' : ''} | ${n2(s.damageMul)} | ${n1(s.categories.projectile)} | ` +
        `${n1(s.categories.beam)} | ${n1(s.categories.radial)} | ${n1(s.categories.puddle)} | ` +
        `${n1(s.categories.body)} | ${n1(s.categories.charge)} |`,
    );
  }
  L.push('');
  L.push('## Committed traversal census');
  L.push('');
  L.push('The player is parked stationary in the path of a charge or strafing leap and the');
  L.push('production simulation is stepped. **Primary** counts impacts of the traversal\'s own');
  L.push('damage kind and must be exactly 1. **Trailing** counts everything the traversal');
  L.push('leaves behind — the charge\'s fissures — which is a separate, escapable mechanic.');
  L.push('');
  L.push('| Pattern | Boss | Seeds | Primary | Trailing | Kinds | Max single hit | Worst-case total | x single |');
  L.push('| --- | ---: | ---: | ---: | ---: | --- | ---: | ---: | ---: |');
  for (const c of r.census) {
    const primary =
      c.minPrimary === c.maxPrimary ? `${c.maxPrimary}` : `${c.minPrimary}–${c.maxPrimary}`;
    L.push(
      `| \`${c.pattern}\` | ${c.bossIndex} | ${c.seeds} | ${primary} | ${c.maxSecondary} | ` +
        `${c.sourceKinds.map((k) => `\`${k}\``).join(', ')} | ${n1(c.maxSingleHit)} | ` +
        `${n1(c.maxTraversalTotal)} | ${n2(c.worstCaseMultiple)} |`,
    );
  }
  L.push('');
  L.push('## Pattern damage kinds');
  L.push('');
  L.push('| Pattern | Reports as | Authored |');
  L.push('| --- | --- | ---: |');
  for (const p of r.patternCategories) {
    L.push(
      `| \`${p.pattern}\` | ${p.category ? `\`${p.category}\`` : '—'} | ${p.authored == null ? '—' : n1(p.authored)} |`,
    );
  }
  L.push('');
  L.push('## Reading this');
  L.push('');
  L.push('- **Primary must be 1.** More than one means a committed action is billing the player');
  L.push('  twice for the same commitment, which no telegraph can make fair.');
  L.push('- **Kinds** name what the death log will say. A traversal that bills `boss-body`');
  L.push('  instead of its own kind means the mechanic the player was shown is not the');
  L.push('  mechanic that hurt them. endless-2.7.0 did exactly that for the strafing leap.');
  L.push('- **Worst-case total** assumes the player never moves. It is an upper bound on a');
  L.push('  mistake, not the expected cost.');
  L.push('');
  L.push(`Generated: ${r.generatedAt}`);
  return `${L.join('\n')}\n`;
}

mkdirSync('docs/generated', { recursive: true });
writeFileSync('docs/BOSS_DAMAGE_BENCHMARK.md', markdown(result));
writeFileSync('docs/generated/boss-damage-benchmark.json', `${JSON.stringify(result, null, 2)}\n`);
if (snapshot) {
  const safe = snapshot.replace(/[^a-zA-Z0-9._-]/g, '-');
  // Its own directory: `docs/generated/baselines` is globbed by the survival history
  // generator, which reasonably expects every file there to be a survival snapshot.
  mkdirSync('docs/generated/boss-damage', { recursive: true });
  writeFileSync(`docs/generated/boss-damage/${safe}.json`, `${JSON.stringify(result, null, 2)}\n`);
}
process.stdout.write(
  `docs/BOSS_DAMAGE_BENCHMARK.md generated from ${result.scaling.length} scaling rows and ${result.census.length} census rows\n`,
);

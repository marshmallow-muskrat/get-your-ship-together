/**
 * Benchmark reporter and documentation generator.
 *
 * `docs/WEAPON_BENCHMARK.md` is written from `formatMarkdown()` — every number in
 * that file comes from this harness. Never hand-edit those numbers; regenerate with
 * `npm run bench:doc`.
 */
import {
  ALL_SCENARIOS,
  BENCH_WINDOW,
  BREAKPOINT_LEVEL,
  INTENDED_SCENARIO,
  PROGRESSION_BOUNDS,
  SCENARIO_WEIGHTS,
  STARTER_BAND,
  allBenchmarkedWeapons,
  benchmarkHeroStarters,
  levelCurve,
  levelGains,
  runWeaponBenchmark,
  type BenchmarkScenario,
} from './survivorWeaponBenchmark';
import { WEAPONS, type WeaponId } from './survivorContent';

export interface WeaponReport {
  weaponId: WeaponId;
  name: string;
  intended: BenchmarkScenario | 'general';
  curve: number[];
  gains: number[];
  ratio: number;
  byScenarioL1: Record<string, number>;
  byScenarioL5: Record<string, number>;
}

export function buildWeaponReports(): WeaponReport[] {
  return allBenchmarkedWeapons().map((weaponId) => {
    const curve = levelCurve(weaponId);
    const gains = levelGains(weaponId);
    const byScenarioL1: Record<string, number> = {};
    const byScenarioL5: Record<string, number> = {};
    for (const s of ALL_SCENARIOS) {
      byScenarioL1[s] = runWeaponBenchmark(weaponId, 1, s, 14).damageDealt;
      byScenarioL5[s] = runWeaponBenchmark(weaponId, 5, s, 14).damageDealt;
    }
    return {
      weaponId,
      name: WEAPONS[weaponId]!.name,
      intended: INTENDED_SCENARIO[weaponId],
      curve,
      gains,
      ratio: curve[0]! > 0 ? curve[4]! / curve[0]! : 0,
      byScenarioL1,
      byScenarioL5,
    };
  });
}

export function formatReport(): string {
  const lines: string[] = [];
  const reports = buildWeaponReports();
  lines.push('WEAPON  INTENDED         L1      L2      L3      L4      L5     L5/L1  GAINS');
  for (const r of reports) {
    const curve = r.curve.map((v) => v.toFixed(0).padStart(7)).join('');
    const gains = r.gains.map((g) => `${(g * 100).toFixed(0)}%`).join(' ');
    lines.push(
      `${r.weaponId.padEnd(11)} ${String(r.intended).padEnd(15)}${curve}  ${r.ratio.toFixed(2)}  ${gains}`,
    );
  }
  lines.push('');
  const starters = benchmarkHeroStarters();
  const mean = starters.reduce((a, s) => a + s.weighted, 0) / starters.length;
  lines.push(`STARTERS (weighted, mean ${mean.toFixed(0)})`);
  for (const s of starters) {
    lines.push(
      `  ${s.heroId.padEnd(11)} ${s.weaponId.padEnd(11)} ${s.weighted.toFixed(0).padStart(8)}  ${(
        (s.weighted / mean) * 100
      ).toFixed(1)}%`,
    );
  }
  lines.push('');
  lines.push(`SCENARIO WEIGHTS: ${ALL_SCENARIOS.map((s) => `${s}=${SCENARIO_WEIGHTS[s]}`).join(' ')}`);
  return lines.join('\n');
}

const PCT = (v: number): string => `${(v * 100).toFixed(0)}%`;

/** Full markdown document — the sole source of docs/WEAPON_BENCHMARK.md. */
export function formatMarkdown(balanceVersion: string): string {
  const reports = buildWeaponReports();
  const starters = benchmarkHeroStarters();
  const mean = starters.reduce((a, s) => a + s.weighted, 0) / starters.length;
  const L: string[] = [];

  L.push('# Weapon Benchmark');
  L.push('');
  L.push(`Balance version: \`${balanceVersion}\``);
  L.push('');
  L.push('**This file is generated.** Every number below is produced by');
  L.push('`src/game/modes/survivor/survivorWeaponBenchmark.ts` and printed by');
  L.push('`src/game/modes/survivor/benchReport.ts`. Regenerate with `npm run bench:doc`.');
  L.push('Do not hand-edit the tables.');
  L.push('');
  L.push('## Methodology');
  L.push('');
  L.push('- Deterministic fixed-step simulation, seeded from `(weapon, level, scenario)`.');
  L.push(`- Measurement window: ${BENCH_WINDOW}s per level.`);
  L.push('- Targets are **not** static dummies. They run their normal pursuit AI at their');
  L.push('  real role speeds while the player kites a circle, so homing, prediction and');
  L.push('  off-axis tracking are credited for what they actually do in a run.');
  L.push('- The kite completes a whole number of laps inside the window, removing');
  L.push('  partial-lap bias.');
  L.push('- Target HP is set high enough that nothing dies inside the window, so the');
  L.push('  measurement is raw effective output rather than a kill-rate cap.');
  L.push('- Ground truth is summed HP delta, which cannot double-count splash.');
  L.push('- Prototypes are benchmarked at their unlock time (Arc 5:00, Orbital 15:00).');
  L.push('');
  L.push('## Scenarios');
  L.push('');
  L.push('| Scenario | Shape | Starter weight |');
  L.push('| --- | --- | --- |');
  const SHAPE: Record<string, string> = {
    'single-boss': 'one durable boss-sized target',
    sparse: 'six mobile enemies spread around the player',
    dense: 'a closing ring of forty fodder',
    'mixed-elite': 'sixteen sprinters plus an elite and a bruiser',
    'mobile-offaxis': 'targets beside and behind the player facing',
    'lined-up': 'a marching column of ten',
    clustered: 'one tight blob of twelve',
  };
  for (const s of ALL_SCENARIOS) {
    L.push(`| \`${s}\` | ${SHAPE[s]} | ${SCENARIO_WEIGHTS[s]} |`);
  }
  L.push('');
  L.push('## Acceptance bounds');
  L.push('');
  L.push(`- Intended-scenario **L5/L1: ${PROGRESSION_BOUNDS.ratioMin}–${PROGRESSION_BOUNDS.ratioMax}**.`);
  L.push(`- Ordinary per-level gain: **${PCT(PROGRESSION_BOUNDS.typicalGainMin)}–${PCT(PROGRESSION_BOUNDS.typicalGainMax)}**.`);
  L.push(`- Exactly one declared mechanical breakpoint per weapon may reach **${PCT(PROGRESSION_BOUNDS.breakpointGainMax)}**.`);
  L.push(`- Hero starter weighted output: within **±${PCT(STARTER_BAND.max - 1)}** of the four-starter mean.`);
  L.push('- No level may be a downgrade in its intended scenario.');
  L.push('- Authored per-shot damage never decreases, so every upgrade card reads as a gain.');
  L.push('');
  L.push('## Progression in the intended scenario');
  L.push('');
  L.push('| Weapon | Intended scenario | L1 | L2 | L3 | L4 | L5 | L5/L1 | L2 | L3 | L4 | L5 | Breakpoint |');
  L.push('| --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | --- |');
  for (const r of reports) {
    const c = r.curve.map((v) => v.toFixed(0)).join(' | ');
    const g = r.gains.map((v) => PCT(v)).join(' | ');
    L.push(
      `| ${r.name} | \`${r.intended}\` | ${c} | ${r.ratio.toFixed(2)} | ${g} | L${BREAKPOINT_LEVEL[r.weaponId]} |`,
    );
  }
  L.push('');
  L.push('## Hero starter parity (L1, weighted)');
  L.push('');
  L.push('| Hero | Starter | Weighted output | vs mean |');
  L.push('| --- | --- | ---: | ---: |');
  for (const s of starters) {
    L.push(`| ${s.heroId} | ${s.weaponId} | ${s.weighted.toFixed(0)} | ${((s.weighted / mean) * 100).toFixed(1)}% |`);
  }
  L.push('');
  L.push(`Mean weighted output: ${mean.toFixed(0)}.`);
  L.push('');
  L.push('## Starter firing geometry (L1)');
  L.push('');
  L.push('| Hero | Signature | Volley interval | Volleys/s | Shots/volley | Shots/s | Identity |');
  L.push('| --- | --- | ---: | ---: | ---: | ---: | --- |');
  for (const s of starters) {
    const family = WEAPONS[s.weaponId]!;
    const l1 = family.levels[0]!;
    L.push(
      `| ${s.heroId} | ${family.name} | ${l1.cadence.toFixed(2)}s | ${(1 / l1.cadence).toFixed(2)} | ${l1.count} | ${(l1.count / l1.cadence).toFixed(2)} | ${family.description} |`,
    );
  }
  L.push('');
  L.push('Shots/s is presentation cadence, not a DPS ranking: Rail pierces full lines,');
  L.push('Bio-Plasma chains splash/corrosion, and rockets distribute area explosions.');
  L.push('');
  L.push('## Per-scenario output (L1 → L5)');
  L.push('');
  L.push(`| Weapon | ${ALL_SCENARIOS.map((s) => s).join(' | ')} |`);
  L.push(`| --- | ${ALL_SCENARIOS.map(() => '---:').join(' | ')} |`);
  for (const r of reports) {
    const cells = ALL_SCENARIOS.map(
      (s) => `${r.byScenarioL1[s]!.toFixed(0)} → ${r.byScenarioL5[s]!.toFixed(0)}`,
    );
    L.push(`| ${r.name} | ${cells.join(' | ')} |`);
  }
  L.push('');
  L.push('## Endless progression beyond L5');
  L.push('');
  L.push('Levels 6+ display normally (L6, L7, ...) and apply repeatable Overclock scaling:');
  L.push('additive damage growth per displayed level, never compounding, with no cap on the');
  L.push('number of Overclock levels. Safety caps on cooldown, area, projectile count,');
  L.push('pickup reach, transformation duration and damage reduction remain in force, and');
  L.push('one upgrade card still grants exactly one level.');
  L.push('');
  return L.join('\n');
}

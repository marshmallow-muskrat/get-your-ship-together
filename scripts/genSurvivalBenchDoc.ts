/** Generate the full-run survival benchmark, raw snapshot, Markdown and SVG. */
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { SURVIVOR_BALANCE_VERSION } from '../src/game/modes/survivor/survivorContent';
import {
  runSurvivalBenchmark,
  type SurvivalPolicyId,
} from '../src/game/modes/survivor/survivorSurvivalBenchmark';
import {
  formatSurvivalMarkdown,
  formatSurvivalHistory,
  formatSurvivalSvg,
} from '../src/game/modes/survivor/survivalReport';

function arg(name: string, fallback: string): string {
  const prefix = `--${name}=`;
  return process.argv.find((v) => v.startsWith(prefix))?.slice(prefix.length) ?? fallback;
}

const runs = Math.max(1, Number.parseInt(arg('runs', '24'), 10));
const maxMinutes = Math.max(1, Number.parseFloat(arg('max-minutes', '60')));
const policy = arg('policy', 'competent') as SurvivalPolicyId;
const label = arg('label', 'current');
const snapshot = arg('snapshot', '');
if (!['novice', 'competent', 'expert'].includes(policy)) {
  throw new Error(`Unknown policy: ${policy}`);
}

const result = runSurvivalBenchmark({
  label,
  balanceVersion: SURVIVOR_BALANCE_VERSION,
  policy,
  runsPerHero: runs,
  maxMinutes,
});

mkdirSync('docs/generated', { recursive: true });
writeFileSync('docs/SURVIVAL_BENCHMARK.md', formatSurvivalMarkdown(result));
writeFileSync('docs/generated/survival-time-standard-deviation.svg', formatSurvivalSvg(result));
writeFileSync('docs/generated/survival-benchmark.json', `${JSON.stringify(result, null, 2)}\n`);
if (snapshot) {
  const safe = snapshot.replace(/[^a-zA-Z0-9._-]/g, '-');
  mkdirSync('docs/generated/baselines', { recursive: true });
  writeFileSync(`docs/generated/baselines/${safe}.json`, `${JSON.stringify(result, null, 2)}\n`);
}
const baselineDir = 'docs/generated/baselines';
if (existsSync(baselineDir)) {
  /*
   * The baselines directory is shared by every benchmark that preserves a snapshot, so
   * this glob must not assume everything in it is a survival run. endless-2.8.0 added a
   * boss-damage snapshot with an entirely different shape and the history formatter
   * crashed on it *after* writing the survival snapshot — which is the worst failure
   * mode available, because the run looked complete and the exit code did not.
   */
  const isSurvivalSnapshot = (entry: unknown): boolean => {
    const e = entry as { runs?: unknown; policy?: unknown; label?: unknown };
    return Array.isArray(e?.runs) && typeof e?.policy === 'string' && typeof e?.label === 'string';
  };
  const history = readdirSync(baselineDir)
    .filter((name) => name.endsWith('.json'))
    .map((name) => JSON.parse(readFileSync(`${baselineDir}/${name}`, 'utf8')))
    .filter(isSurvivalSnapshot);
  // Include the just-generated result even when the caller did not preserve it.
  if (!history.some((entry) => entry.label === result.label && entry.policy === result.policy)) {
    history.push(result);
  }
  writeFileSync('docs/SURVIVAL_EXPERIMENTS.md', formatSurvivalHistory(history));
}
process.stdout.write(`docs/SURVIVAL_BENCHMARK.md generated from ${result.runs.length} runs\n`);

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

/*
 * Everything that can fail runs BEFORE anything is written.
 *
 * endless-2.8.0 hit the worst version of this: the survival snapshot was written, then
 * the history formatter crashed on a differently-shaped file in the shared baselines
 * directory. The run looked complete, the snapshot was on disk, and the exit code lied.
 * Rendering first and writing last means a failed generator leaves no artefact claiming
 * to be a finished experiment.
 */
const markdown = formatSurvivalMarkdown(result);
const svg = formatSurvivalSvg(result);
const snapshotJson = `${JSON.stringify(result, null, 2)}\n`;

const isSurvivalSnapshot = (entry: unknown): boolean => {
  const e = entry as { runs?: unknown; policy?: unknown; label?: unknown };
  return Array.isArray(e?.runs) && typeof e?.policy === 'string' && typeof e?.label === 'string';
};

const baselineDir = 'docs/generated/baselines';
let historyMarkdown: string | null = null;
if (existsSync(baselineDir)) {
  const history = readdirSync(baselineDir)
    .filter((name) => name.endsWith('.json'))
    .map((name) => JSON.parse(readFileSync(`${baselineDir}/${name}`, 'utf8')))
    .filter(isSurvivalSnapshot);
  // Include the just-generated result even when the caller did not preserve it.
  if (!history.some((entry) => entry.label === result.label && entry.policy === result.policy)) {
    history.push(result);
  }
  historyMarkdown = formatSurvivalHistory(history);
}

mkdirSync('docs/generated', { recursive: true });
writeFileSync('docs/SURVIVAL_BENCHMARK.md', markdown);
writeFileSync('docs/generated/survival-time-standard-deviation.svg', svg);
writeFileSync('docs/generated/survival-benchmark.json', snapshotJson);
if (snapshot) {
  const safe = snapshot.replace(/[^a-zA-Z0-9._-]/g, '-');
  mkdirSync(baselineDir, { recursive: true });
  writeFileSync(`${baselineDir}/${safe}.json`, snapshotJson);
}
if (historyMarkdown !== null) writeFileSync('docs/SURVIVAL_EXPERIMENTS.md', historyMarkdown);
process.stdout.write(`docs/SURVIVAL_BENCHMARK.md generated from ${result.runs.length} runs\n`);

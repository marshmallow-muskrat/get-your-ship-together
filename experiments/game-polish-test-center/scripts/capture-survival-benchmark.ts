import { mkdirSync, writeFileSync } from 'node:fs';
import { SURVIVOR_BALANCE_VERSION } from '../../../src/game/modes/survivor/survivorContent';
import { runSurvivalBenchmark } from '../../../src/game/modes/survivor/survivorSurvivalBenchmark';

const label = process.argv[2] ?? 'candidate';
const safe = label.replace(/[^a-zA-Z0-9._-]/g, '-');
const result = runSurvivalBenchmark({
  label: safe,
  balanceVersion: SURVIVOR_BALANCE_VERSION,
  policy: 'competent',
  runsPerHero: 8,
  maxMinutes: 30,
});

mkdirSync('experiments/game-polish-test-center/reports', { recursive: true });
writeFileSync(
  `experiments/game-polish-test-center/reports/${safe}-survival.json`,
  `${JSON.stringify(result, null, 2)}\n`,
);

process.stdout.write(
  `${safe}: ${result.runs.length} runs, mean ${result.overall.mean.toFixed(1)}s, ` +
    `median ${result.overall.median.toFixed(1)}s\n`,
);

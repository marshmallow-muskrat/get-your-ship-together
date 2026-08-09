/**
 * Regenerates docs/WEAPON_BENCHMARK.md from the live benchmark harness.
 * Run with: npm run bench:doc
 */
import { writeFileSync } from 'node:fs';
import { formatMarkdown } from '../src/game/modes/survivor/benchReport';
import { SURVIVOR_BALANCE_VERSION } from '../src/game/modes/survivor/survivorContent';

writeFileSync('docs/WEAPON_BENCHMARK.md', `${formatMarkdown(SURVIVOR_BALANCE_VERSION)}\n`);
process.stdout.write('docs/WEAPON_BENCHMARK.md regenerated\n');

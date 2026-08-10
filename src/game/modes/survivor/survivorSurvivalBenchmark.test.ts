import { describe, expect, it } from 'vitest';
import {
  runSurvivalSimulation,
  summarizeDistribution,
  summarizeHeroRuns,
} from './survivorSurvivalBenchmark';
import { formatSurvivalMarkdown, formatSurvivalSvg } from './survivalReport';

describe('full-run survival benchmark', () => {
  it('computes sample standard deviation, percentiles and confidence bounds', () => {
    const s = summarizeDistribution([60, 120, 180, 240]);
    expect(s.mean).toBe(150);
    expect(s.standardDeviation).toBeCloseTo(77.4597, 3);
    expect(s.median).toBe(150);
    expect(s.p25).toBe(105);
    expect(s.p75).toBe(195);
    expect(s.confidence95Low).toBeLessThan(s.mean);
    expect(s.confidence95High).toBeGreaterThan(s.mean);
  });

  it('replays the same hero, policy and seed exactly', () => {
    const opts = { heroId: 'bee' as const, policy: 'competent' as const, seed: 4441, maxMinutes: 1.5 };
    const a = runSurvivalSimulation(opts);
    const b = runSurvivalSimulation(opts);
    expect(b).toEqual(a);
  });

  it('reports real pressure, actions and terminal/censored status', () => {
    const run = runSurvivalSimulation({
      heroId: 'frog',
      policy: 'competent',
      seed: 991,
      maxMinutes: 2,
    });
    expect(run.survivalTime).toBeGreaterThan(0);
    expect(run.kills).toBeGreaterThan(0);
    expect(run.peakLivingElites).toBeGreaterThanOrEqual(0);
    expect(run.mechUptime).toBeGreaterThanOrEqual(0);
    expect(run.mechUptime).toBeLessThanOrEqual(1);
    expect(run.deathSource.length).toBeGreaterThan(0);
  });

  it('formats a generated Markdown report and an embeddable SVG chart', () => {
    const run = runSurvivalSimulation({
      heroId: 'bee',
      policy: 'novice',
      seed: 72,
      maxMinutes: 1,
    });
    const hero = summarizeHeroRuns('bee', 'novice', [run]);
    const result = {
      label: 'test',
      balanceVersion: 'test-balance',
      policy: 'novice' as const,
      runsPerHero: 1,
      maxMinutes: 1,
      generatedAt: '2026-01-01T00:00:00.000Z',
      runs: [run],
      heroes: [hero],
      overall: summarizeDistribution([run.survivalTime], run.censored ? 1 : 0),
    };
    expect(formatSurvivalMarkdown(result)).toContain('Mean ± SD');
    expect(formatSurvivalMarkdown(result)).toContain('generated/survival-time-standard-deviation.svg');
    expect(formatSurvivalSvg(result)).toContain('<svg');
    expect(formatSurvivalSvg(result)).toContain('Boswell');
  });
});

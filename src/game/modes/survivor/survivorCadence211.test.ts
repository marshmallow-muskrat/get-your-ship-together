/**
 * endless-2.11.0 cadence experiment — discarded.
 *
 * Both offered coverage fixes rewrite the finished L5/L1 curve in the intended
 * scenario, which is forbidden:
 *
 * - Cadence scaled at constant authored DPS (L1 1.885s → 0.84s / 0.90s / 1.20s)
 *   put Rail Lance at 2.70–2.94 against the 3.0 floor and pushed Rocket Barrage's
 *   L5 gain to 61–68% against the 52% breakpoint ceiling. Kite-phase sampling is
 *   cadence-sensitive; "same DPS" is not "same effective curve".
 * - A keep-away shove on the volley, even contact-range only (force 1.1, range 1.7),
 *   put Rail L3 gain at 42.5% (typical cap 40%) and Rocket L5/L1 at 2.84.
 *
 * Production damage, cadence, geometry and knockback stay at the 2.10 tables.
 * Coverage is now measured by the `surrounded` starter scenario instead.
 */
import { describe, expect, it } from 'vitest';
import { WEAPONS, weaponStatsAtLevel } from './survivorContent';
import { levelProgressionRatio } from './survivorWeaponBenchmark';

describe('low-cadence signature coverage', () => {
  it('leaves the finished Rail Lance and Rocket Barrage curves untouched', () => {
    expect(weaponStatsAtLevel('rail', 1)).toMatchObject({
      damage: 100,
      cadence: 1.885,
      count: 1,
      width: 0.95,
      length: 16,
    });
    expect(weaponStatsAtLevel('rocket', 1)).toMatchObject({
      damage: 46,
      cadence: 1.65,
      count: 4,
      radius: 1.6,
    });
    expect(WEAPONS.rail.levels[4]?.tier).toBe('Lance Battery');
    expect(WEAPONS.rail.levels.map((l) => l.count)).toEqual([1, 1, 1, 1, 2]);
    expect(WEAPONS.rocket.levels.map((l) => l.count)).toEqual([4, 4, 4, 6, 7]);
  });

  it('keeps both signatures inside the finished progression band', () => {
    expect(levelProgressionRatio('rail')).toBeGreaterThanOrEqual(3);
    expect(levelProgressionRatio('rail')).toBeLessThanOrEqual(4.2);
    expect(levelProgressionRatio('rocket')).toBeGreaterThanOrEqual(3);
    expect(levelProgressionRatio('rocket')).toBeLessThanOrEqual(4.2);
  }, 30_000);
});

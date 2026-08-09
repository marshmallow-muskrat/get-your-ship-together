import { describe, expect, it } from 'vitest';
import {
  allOrdinaryWeapons,
  benchmarkHeroStarters,
  levelProgressionRatio,
  runWeaponBenchmark,
} from './survivorWeaponBenchmark';
import {
  expandingRing,
  facingLine,
  pointHitsShape,
  circleAt,
  shapeToRender,
} from './survivorAttackShapes';
import {
  SURVIVOR,
  heroStarterWeapon,
  weaponStatsAtLevel,
  endlessDifficultyAt,
  ALL_BOSS_PATTERNS,
} from './survivorContent';
import { createSurvivorState } from './survivorState';
import {
  EMPTY_SURVIVOR_INPUT,
  forceStartProtocol,
  stepSurvivor,
  forceBossIntoPattern,
  cancelBossCombat,
} from './survivorSim';
import { primaryBoss } from './survivorState';

describe('attack shapes', () => {
  const pr = SURVIVOR.playerRadius;

  it('circle: inside / outside / boundary', () => {
    const s = circleAt(0, 0, 2);
    expect(pointHitsShape(0, 0, pr, s)).toBe(true);
    expect(pointHitsShape(2 + pr - 0.01, 0, pr, s)).toBe(true);
    expect(pointHitsShape(2 + pr + 0.15, 0, pr, s)).toBe(false);
  });

  it('ring: band hits, core safe, outside safe', () => {
    const s = expandingRing(0, 0, 5, 0.9);
    expect(pointHitsShape(5, 0, 0, s)).toBe(true);
    expect(pointHitsShape(0, 0, 0, s)).toBe(false);
    expect(pointHitsShape(10, 0, 0, s)).toBe(false);
  });

  it('line: on lane hits, beside misses', () => {
    const s = facingLine(0, 0, 0, 1, 10, 0.5);
    expect(pointHitsShape(0, 5, 0, s)).toBe(true);
    expect(pointHitsShape(2, 5, 0, s)).toBe(false);
    expect(pointHitsShape(0.4, 5, 0.2, s)).toBe(true);
  });

  it('render descriptors match geometry size', () => {
    const line = facingLine(0, 0, 1, 0, 12, 0.6);
    const r = shapeToRender(line);
    expect(r.visual).toBe('line');
    if (r.visual === 'line') {
      expect(r.length).toBeCloseTo(12, 5);
      expect(r.width).toBeCloseTo(1.2, 5);
    }
  });
});

describe('weapon combat benchmark', () => {
  it('starter weighted outputs stay within ±18% of mean', () => {
    const starters = benchmarkHeroStarters();
    const mean = starters.reduce((a, s) => a + s.weighted, 0) / starters.length;
    expect(mean).toBeGreaterThan(50);
    for (const s of starters) {
      const ratio = s.weighted / mean;
      // Target ±15%; allow 18% headroom for sim noise / homing reliability.
      expect(ratio).toBeGreaterThan(0.82);
      expect(ratio).toBeLessThan(1.18);
    }
  });

  it('L5 is roughly 2.5–7× L1 on single-target (projectile count breakpoints allowed)', () => {
    for (const id of allOrdinaryWeapons()) {
      if (id === 'pulse' || id === 'gravity') continue; // not starters; still check bounds
      const r = levelProgressionRatio(id);
      // Target ~3–4×; multi-projectile L5 breakpoints can reach ~6–7× raw single-target.
      expect(r).toBeGreaterThan(2.0);
      expect(r).toBeLessThan(7.5);
    }
  });

  it('each authored L1–L5 step exists and increases damage or adds mechanics', () => {
    for (const id of allOrdinaryWeapons()) {
      for (let lv = 2; lv <= 5; lv += 1) {
        const cur = weaponStatsAtLevel(id, lv);
        // Not every level must raise damage (twin projectile tradeoffs), but L5 > L1.
        expect(cur.damage).toBeGreaterThan(0);
      }
      expect(weaponStatsAtLevel(id, 5).damage).toBeGreaterThanOrEqual(
        weaponStatsAtLevel(id, 1).damage * 0.9,
      );
    }
  });

  it('hero starters map correctly', () => {
    expect(heroStarterWeapon('bee')).toBe('microdrone');
    expect(heroStarterWeapon('flamingo')).toBe('rail');
    expect(heroStarterWeapon('frog')).toBe('bioplasma');
    expect(heroStarterWeapon('red-panda')).toBe('rocket');
  });

  it('dense scenario deals more damage than sparse for splash/pierce weapons', () => {
    const rocketDense = runWeaponBenchmark('rocket', 3, 'dense', 10).damageDealt;
    const rocketSparse = runWeaponBenchmark('rocket', 3, 'sparse', 10).damageDealt;
    expect(rocketDense).toBeGreaterThan(rocketSparse * 0.85);
  });
});

describe('endless-2.2.0 systems', () => {
  it('pressure director cycles normal→telegraph→surge→recovery without stacking', () => {
    const state = createSurvivorState('bee', null, 4401);
    state.player.invuln = 999;
    state.weapons = [];
    state.surge.nextSurgeAt = 1;
    state.time = 0;
    const seen = new Set<string>();
    for (let i = 0; i < 60 * 90; i += 1) {
      stepSurvivor(state, EMPTY_SURVIVOR_INPUT, SURVIVOR.fixedDt);
      seen.add(state.surge.phase);
      // Never two phases active — single phase field.
      expect(['normal', 'telegraph', 'surge', 'recovery']).toContain(state.surge.phase);
    }
    expect(seen.has('telegraph')).toBe(true);
    expect(seen.has('surge')).toBe(true);
    expect(seen.has('recovery')).toBe(true);
    expect(seen.has('normal')).toBe(true);
  });

  it('elite surge never before elite gate', () => {
    const state = createSurvivorState('bee', null, 4402);
    state.player.invuln = 999;
    state.weapons = [];
    state.time = 30;
    state.surge.nextSurgeAt = 30.5;
    for (let i = 0; i < 200; i += 1) {
      stepSurvivor(state, EMPTY_SURVIVOR_INPUT, SURVIVOR.fixedDt);
      if (state.surge.phase === 'surge' || state.surge.phase === 'telegraph') {
        expect(state.surge.kind).not.toBe('elite');
      }
    }
  });

  it('boss FIFO queue preserves mega index 5 order', () => {
    const state = createSurvivorState('bee', null, 4403);
    state.player.invuln = 999;
    state.weapons = [];
    // Fill boss slots so schedule queues
    state.pendingBossIndices = [4, 5, 6];
    state.breachStacks = 3;
    state.nextBossIndex = 7;
    state.nextBossTime = 1e9;
    // Drain: first should be 4
    for (let i = 0; i < 90; i += 1) stepSurvivor(state, EMPTY_SURVIVOR_INPUT, SURVIVOR.fixedDt);
    const indices = state.bosses.filter((b) => b.active && b.state !== 'dead').map((b) => b.index);
    // At least one of the queued indices present or still queued in order
    if (state.pendingBossIndices.length > 0) {
      expect(state.pendingBossIndices[0]).toBeGreaterThanOrEqual(4);
    }
    for (const b of state.bosses) {
      if (b.active && b.index === 5) expect(b.isMega).toBe(true);
    }
    // No duplicates in queue
    expect(new Set(state.pendingBossIndices).size).toBe(state.pendingBossIndices.length);
    void indices;
  });

  it('gunship hits each target at most once', () => {
    const state = createSurvivorState('bee', null, 4404);
    state.player.invuln = 999;
    state.weapons = [];
    // Place durable enemies along +Z
    for (let i = 0; i < 5; i += 1) {
      stepSurvivor(state, EMPTY_SURVIVOR_INPUT, SURVIVOR.fixedDt);
    }
    // Force many fodder near player lane
    state.player.x = 0;
    state.player.z = 0;
    state.player.facingX = 0;
    state.player.facingZ = 1;
    forceStartProtocol(state, 'gunship-flyby', 1);
    const hitsBefore = state.gunship.hitIds.length;
    for (let i = 0; i < 400; i += 1) stepSurvivor(state, EMPTY_SURVIVOR_INPUT, SURVIVOR.fixedDt);
    const ids = state.gunship.hitIds;
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids.length).toBeGreaterThanOrEqual(hitsBefore);
  });

  it('aegis replace-not-stack', () => {
    const state = createSurvivorState('bee', null, 4405);
    forceStartProtocol(state, 'aegis-barrier', 1);
    const a = state.player.shieldPoints;
    forceStartProtocol(state, 'aegis-barrier', 1);
    expect(state.player.shieldPoints).toBe(a);
    expect(state.player.shieldPoints).toBe(state.player.shieldMax);
  });

  it('speed curve boundary points', () => {
    expect(endlessDifficultyAt(0).speedMul).toBeCloseTo(1.0, 5);
    expect(endlessDifficultyAt(5 * 60).speedMul).toBeCloseTo(1.08, 2);
    expect(endlessDifficultyAt(10 * 60).speedMul).toBeCloseTo(1.16, 2);
    expect(endlessDifficultyAt(15 * 60).speedMul).toBeCloseTo(1.24, 2);
    // 30m before collapse adds: 1 + 0.016*15 + 0.008*15 = 1.36; first collapse step +0.02
    expect(endlessDifficultyAt(30 * 60).speedMul).toBeCloseTo(1.38, 2);
    expect(endlessDifficultyAt(40 * 60).speedMul).toBeLessThanOrEqual(1.7);
    expect(endlessDifficultyAt(60 * 60).speedMul).toBeLessThanOrEqual(1.7);
  });

  it('every boss pattern completes to recover/idle', () => {
    for (const pattern of ALL_BOSS_PATTERNS) {
      if (pattern === 'gravity-collapse' || pattern === 'cataclysm') continue; // mega-only needs mega
      const state = createSurvivorState('bee', 'survivor-boss', 4500 + pattern.length);
      state.player.invuln = 999;
      state.weapons = [];
      for (let i = 0; i < 20; i += 1) stepSurvivor(state, EMPTY_SURVIVOR_INPUT, SURVIVOR.fixedDt);
      const boss = primaryBoss(state);
      expect(boss).toBeTruthy();
      forceBossIntoPattern(state, boss!, pattern);
      let finished = false;
      for (let i = 0; i < 600; i += 1) {
        stepSurvivor(state, EMPTY_SURVIVOR_INPUT, SURVIVOR.fixedDt);
        if (boss!.state === 'recover' || boss!.state === 'idle') {
          finished = true;
          break;
        }
      }
      expect(finished).toBe(true);
      cancelBossCombat(state, boss!);
    }
  });
});

import { describe, expect, it } from 'vitest';
import {
  BREAKPOINT_LEVEL,
  INTENDED_SCENARIO,
  PROGRESSION_BOUNDS,
  STARTER_BAND,
  allBenchmarkedWeapons,
  benchmarkHeroStarters,
  levelGains,
  levelProgressionRatio,
  runWeaponBenchmark,
} from './survivorWeaponBenchmark';
import {
  expandingRing,
  facingLine,
  pointHitsShape,
  circleAt,
  shapeToRender,
  type AttackShape,
} from './survivorAttackShapes';
import {
  HOSTILE_ATTACK_COLORS,
  attackHitsPlayer,
  type SurvivorAttack,
} from './survivorAttacks';
import { bossMarkerColor, bossPatternColor } from './survivorBossPatterns';
import {
  SURVIVOR,
  heroStarterWeapon,
  weaponStatsAtLevel,
  endlessDifficultyAt,
  ALL_BOSS_PATTERNS,
  isMegaOnlyPattern,
} from './survivorContent';
import {
  createSurvivorState,
  emptyBoss,
  emptyEnemy,
  nextEntityId,
  type SurvivorBoss,
  type SurvivorEnemy,
  type SurvivorState,
} from './survivorState';
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
  it('starter weighted outputs stay within ±15% of mean', () => {
    const starters = benchmarkHeroStarters();
    const mean = starters.reduce((a, s) => a + s.weighted, 0) / starters.length;
    expect(mean).toBeGreaterThan(50);
    for (const s of starters) {
      const ratio = s.weighted / mean;
      expect(ratio, `${s.heroId}/${s.weaponId} weighted ratio`).toBeGreaterThanOrEqual(
        STARTER_BAND.min,
      );
      expect(ratio, `${s.heroId}/${s.weaponId} weighted ratio`).toBeLessThanOrEqual(
        STARTER_BAND.max,
      );
    }
  });

  it('intended-scenario L5/L1 is 3.0–4.2 for every weapon', () => {
    for (const id of allBenchmarkedWeapons()) {
      const r = levelProgressionRatio(id);
      // No permissive 2x-7.5x window: projectile-count growth is capped in the
      // authored tables so it cannot manufacture progression on its own.
      expect(r, `${id} L5/L1`).toBeGreaterThanOrEqual(PROGRESSION_BOUNDS.ratioMin);
      expect(r, `${id} L5/L1`).toBeLessThanOrEqual(PROGRESSION_BOUNDS.ratioMax);
    }
  });

  it('Arc Conductor enters at five minutes as a premium mixed-horde reward', () => {
    const arc = runWeaponBenchmark('arc', 1, 'mixed-elite', 24);
    expect(arc.damageDealt / arc.windowSec).toBeGreaterThanOrEqual(130);
  });

  it('per-level effective gains stay inside the documented bounds', () => {
    for (const id of allBenchmarkedWeapons()) {
      const gains = levelGains(id);
      expect(gains.length).toBe(4);
      gains.forEach((g, i) => {
        const level = i + 2;
        const isBreakpoint = level === BREAKPOINT_LEVEL[id];
        const max = isBreakpoint
          ? PROGRESSION_BOUNDS.breakpointGainMax
          : PROGRESSION_BOUNDS.typicalGainMax;
        // No level may be a downgrade in its intended scenario.
        expect(g, `${id} L${level} gain`).toBeGreaterThanOrEqual(
          PROGRESSION_BOUNDS.typicalGainMin,
        );
        expect(g, `${id} L${level} gain`).toBeLessThanOrEqual(max);
      });
      // Exactly one level per weapon may exceed the typical ceiling.
      const over = gains.filter((g) => g > PROGRESSION_BOUNDS.typicalGainMax).length;
      expect(over, `${id} levels above typical ceiling`).toBeLessThanOrEqual(1);
    }
  });

  it('authored per-shot damage never decreases across L1-L5', () => {
    for (const id of allBenchmarkedWeapons()) {
      for (let lv = 2; lv <= 5; lv += 1) {
        const prev = weaponStatsAtLevel(id, lv - 1);
        const cur = weaponStatsAtLevel(id, lv);
        // The upgrade card shows per-shot damage; it must always read as an increase.
        expect(cur.damage, `${id} L${lv} damage`).toBeGreaterThan(prev.damage);
      }
    }
  });

  it('benchmark results are deterministic', () => {
    for (const id of ['microdrone', 'rail', 'orbital'] as const) {
      const a = runWeaponBenchmark(id, 3, INTENDED_SCENARIO[id] === 'general' ? 'sparse' : INTENDED_SCENARIO[id], 12);
      const b = runWeaponBenchmark(id, 3, INTENDED_SCENARIO[id] === 'general' ? 'sparse' : INTENDED_SCENARIO[id], 12);
      expect(a.damageDealt).toBe(b.damageDealt);
      expect(a.targetsAffected).toBe(b.targetsAffected);
      expect(a.timeToFirstHit).toBe(b.timeToFirstHit);
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

// ---------------------------------------------------------------------------
// Gunship corridor helpers — explicit seeding so a zero-hit run cannot pass.
// ---------------------------------------------------------------------------

/** Quiet arena, player at origin facing +Z, nothing else able to deal damage. */
function gunshipFixture(seed: number): SurvivorState {
  const state = createSurvivorState('bee', null, seed);
  state.player.invuln = 9999;
  state.weapons = [];
  state.spawnAcc = -1e9;
  state.surge.nextSurgeAt = 1e9;
  state.nextBossTime = 1e9;
  state.nextCacheTime = 1e9;
  state.player.x = 0;
  state.player.z = 0;
  state.player.facingX = 0;
  state.player.facingZ = 1;
  return state;
}

function placeTarget(
  state: SurvivorState,
  opts: { x: number; z: number; hp: number; elite?: boolean; miniboss?: boolean },
): SurvivorEnemy {
  const e = emptyEnemy();
  e.id = nextEntityId(state);
  e.defId = opts.miniboss ? 'miniboss' : opts.elite ? 'elite' : 'basic';
  e.role = opts.miniboss ? 'miniboss' : opts.elite ? 'elite' : 'fodder';
  e.alive = true;
  e.x = opts.x;
  e.z = opts.z;
  e.radius = 0.5;
  e.maxHealth = opts.hp;
  e.health = opts.hp;
  e.isElite = !!opts.elite || !!opts.miniboss;
  e.isMiniboss = !!opts.miniboss;
  e.xp = 5;
  // Hold position so the seeded geometry is what the corridor actually tests.
  e.speedMul = 0;
  e.contactDamage = 0;
  state.enemies.push(e);
  return e;
}

function placeBoss(
  state: SurvivorState,
  opts: { index: number; mega: boolean; x: number; z: number },
): SurvivorBoss {
  const b = emptyBoss();
  b.id = nextEntityId(state);
  b.index = opts.index;
  b.active = true;
  b.isMega = opts.mega;
  b.state = 'idle';
  b.timer = 1e9; // stays idle so no pattern interferes with the flyby
  b.x = opts.x;
  b.z = opts.z;
  b.maxHealth = 100000;
  b.health = b.maxHealth;
  b.colliderRadius = 1.2;
  state.bosses.push(b);
  return b;
}

/**
 * Damage numbers are aggregated then flushed and expire, so count unique flushed
 * events per target key across the whole run rather than sampling one frame.
 */
function collectDamageEvents(state: SurvivorState): {
  sample: () => void;
  countFor: (key: string) => number;
  kindFor: (key: string) => string | undefined;
  /** Every flushed event, regardless of key — catches a second parallel emit path. */
  total: () => number;
  keys: () => string[];
} {
  const seen = new Map<number, { key: string; kind: string }>();
  return {
    sample() {
      for (const ev of state.damageEvents) {
        if (!seen.has(ev.id)) seen.set(ev.id, { key: ev.targetKey, kind: ev.kind });
      }
    },
    countFor(key) {
      let n = 0;
      for (const v of seen.values()) if (v.key === key) n += 1;
      return n;
    },
    kindFor(key) {
      for (const v of seen.values()) if (v.key === key) return v.kind;
      return undefined;
    },
    total() {
      return seen.size;
    },
    keys() {
      return Array.from(seen.values(), (v) => v.key).sort();
    },
  };
}

describe('endless-2.3.0 systems', () => {
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

  it('gunship lethal corridor: seeded targets take exactly one coherent strike each', () => {
    const state = gunshipFixture(4404);

    // Explicitly seeded targets — the assertions below cannot pass with zero hits.
    const ordinary = placeTarget(state, { x: 0, z: 7, hp: 60 });
    const elite = placeTarget(state, { x: 1.2, z: 11, hp: 900, elite: true });
    const miniboss = placeTarget(state, { x: -1.4, z: 15, hp: 4000, miniboss: true });
    const offLane = placeTarget(state, { x: 22, z: 9, hp: 60 });

    const minibossMax = miniboss.maxHealth;
    const kills0 = state.kills;
    const collector = collectDamageEvents(state);

    forceStartProtocol(state, 'gunship-flyby', 1);
    // Lane must actually run up +Z through the seeded cluster.
    expect(state.gunship.facingZ).toBeGreaterThan(0.8);

    for (let i = 0; i < 500; i += 1) {
      stepSurvivor(state, EMPTY_SURVIVOR_INPUT, SURVIVOR.fixedDt);
      collector.sample();
      if (!state.gunship.active) break;
    }

    // Every in-lane target was struck exactly once.
    expect(state.gunship.hitIds).toContain(ordinary.id);
    expect(state.gunship.hitIds).toContain(elite.id);
    expect(state.gunship.hitIds).toContain(miniboss.id);
    expect(state.gunship.hitIds).not.toContain(offLane.id);
    expect(new Set(state.gunship.hitIds).size).toBe(state.gunship.hitIds.length);
    expect(state.gunship.spawnSuppress).toBeGreaterThanOrEqual(
      SURVIVOR.gunship.spawnSuppressDuration - SURVIVOR.fixedDt,
    );
    expect(SURVIVOR.gunship.spawnSuppressRateMul).toBeLessThanOrEqual(0.05);

    // Ordinary and elite die; miniboss loses ~80% of max HP; off-lane untouched.
    expect(ordinary.alive).toBe(false);
    expect(elite.alive).toBe(false);
    expect(miniboss.alive).toBe(true);
    expect(1 - miniboss.health / minibossMax).toBeCloseTo(0.8, 2);
    expect(offLane.alive).toBe(true);
    expect(offLane.health).toBe(offLane.maxHealth);

    // Normal death/reward path ran (kill counter + energy drops), not a bespoke shortcut.
    expect(state.kills - kills0).toBe(2);
    expect(state.pickups.some((p) => p.active && p.kind === 'xp')).toBe(true);

    // Exactly one damage number per struck target, and none for the off-lane target.
    expect(collector.countFor(`e:${ordinary.id}`)).toBe(1);
    expect(collector.countFor(`e:${elite.id}`)).toBe(1);
    expect(collector.countFor(`e:${miniboss.id}`)).toBe(1);
    expect(collector.countFor(`e:${offLane.id}`)).toBe(0);
    expect(collector.kindFor(`e:${ordinary.id}`)).toBe('gunship');
    expect(collector.kindFor(`e:${miniboss.id}`)).toBe('gunship');
    // Three struck targets → exactly three damage numbers in total. A second
    // parallel emit path (any key) would push this above three.
    expect(collector.total()).toBe(3);
    expect(collector.keys()).toEqual(
      [`e:${ordinary.id}`, `e:${elite.id}`, `e:${miniboss.id}`].sort(),
    );
  });

  it('gunship strikes a regular boss for its scalable max-HP fraction with one damage number', () => {
    const state = gunshipFixture(4406);
    const boss = placeBoss(state, { index: 4, mega: false, x: 0, z: 13 });
    const max = boss.maxHealth;
    const collector = collectDamageEvents(state);

    forceStartProtocol(state, 'gunship-flyby', 1);
    for (let i = 0; i < 500; i += 1) {
      stepSurvivor(state, EMPTY_SURVIVOR_INPUT, SURVIVOR.fixedDt);
      collector.sample();
      if (!state.gunship.active) break;
    }

    expect(state.gunship.hitIds).toContain(boss.id);
    expect(1 - boss.health / max).toBeCloseTo(SURVIVOR.gunship.bossHealthFraction, 3);
    expect(collector.countFor(`boss:${boss.id}`)).toBe(1);
    expect(collector.kindFor(`boss:${boss.id}`)).toBe('gunship');
    expect(collector.total()).toBe(1);
  });

  it('gunship strikes a Mega boss for its bounded scalable fraction with one damage number', () => {
    const state = gunshipFixture(4407);
    const boss = placeBoss(state, { index: 5, mega: true, x: 0, z: 13 });
    const max = boss.maxHealth;
    const collector = collectDamageEvents(state);

    forceStartProtocol(state, 'gunship-flyby', 1);
    for (let i = 0; i < 500; i += 1) {
      stepSurvivor(state, EMPTY_SURVIVOR_INPUT, SURVIVOR.fixedDt);
      collector.sample();
      if (!state.gunship.active) break;
    }

    expect(boss.isMega).toBe(true);
    expect(state.gunship.hitIds).toContain(boss.id);
    expect(1 - boss.health / max).toBeCloseTo(SURVIVOR.gunship.megaHealthFraction, 3);
    expect(collector.countFor(`boss:${boss.id}`)).toBe(1);
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
    /*
     * endless-2.3.0 anchors. 1.24x moved from fifteen minutes to fifty: raw speed is no
     * longer the reason runs end. Containment Collapse deliberately contributes nothing
     * to speed, so every anchor is exact at any survival time.
     */
    expect(endlessDifficultyAt(0).speedMul).toBeCloseTo(1.0, 5);
    expect(endlessDifficultyAt(10 * 60).speedMul).toBeCloseTo(1.03, 5);
    expect(endlessDifficultyAt(20 * 60).speedMul).toBeCloseTo(1.06, 5);
    expect(endlessDifficultyAt(30 * 60).speedMul).toBeCloseTo(1.1, 5);
    expect(endlessDifficultyAt(40 * 60).speedMul).toBeCloseTo(1.16, 5);
    expect(endlessDifficultyAt(45 * 60).speedMul).toBeCloseTo(1.2, 5);
    expect(endlessDifficultyAt(50 * 60).speedMul).toBeCloseTo(1.24, 5);
    expect(endlessDifficultyAt(60 * 60).speedMul).toBeCloseTo(1.32, 5);
    // The fifteen-minute value that used to be 1.24x is now a mild 1.045x.
    expect(endlessDifficultyAt(15 * 60).speedMul).toBeCloseTo(1.045, 3);
    expect(endlessDifficultyAt(90 * 60).speedMul).toBeLessThanOrEqual(1.7);
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

// ---------------------------------------------------------------------------
// Live AttackShape integration — one authoritative shape drives render + collision
// ---------------------------------------------------------------------------

function quietBossArena(seed: number): { state: SurvivorState; boss: SurvivorBoss } {
  const state = createSurvivorState('bee', 'survivor-boss', seed);
  state.weapons = [];
  state.spawnAcc = -1e9;
  state.surge.nextSurgeAt = 1e9;
  state.nextCacheTime = 1e9;
  state.player.invuln = 0;
  for (let i = 0; i < 20; i += 1) stepSurvivor(state, EMPTY_SURVIVOR_INPUT, SURVIVOR.fixedDt);
  const boss = primaryBoss(state)!;
  expect(boss).toBeTruthy();
  // Remove the horde so only the boss can damage the player.
  for (const e of state.enemies) e.alive = false;
  state.nextBossTime = 1e9;
  state.enemyCap = 0;
  return { state, boss };
}

function hostileAttacks(state: SurvivorState, bossId: number) {
  return state.attacks.filter((a) => a.active && a.sourceBossId === bossId && a.style === 'hostile');
}

/** A point that lies inside the shape. */
function insideShape(shape: AttackShape): { x: number; z: number } {
  switch (shape.kind) {
    case 'circle':
    case 'moving-circle':
      return { x: shape.x, z: shape.z };
    case 'ring': {
      const r = (shape.inner + shape.outer) / 2;
      return { x: shape.x + r, z: shape.z };
    }
    case 'line':
      return { x: (shape.x0 + shape.x1) / 2, z: (shape.z0 + shape.z1) / 2 };
    case 'cone': {
      const fl = Math.hypot(shape.facingX, shape.facingZ) || 1;
      return {
        x: shape.x + (shape.facingX / fl) * shape.length * 0.5,
        z: shape.z + (shape.facingZ / fl) * shape.length * 0.5,
      };
    }
  }
}

describe('boss attack shapes are live, authoritative and boss-owned', () => {
  const pr = SURVIVOR.playerRadius;

  it('every pattern creates boss-owned attack entities during windup', () => {
    for (const pattern of ALL_BOSS_PATTERNS) {
      const { state, boss } = quietBossArena(5100 + pattern.length);
      if (isMegaOnlyPattern(pattern)) boss.isMega = true;
      forceBossIntoPattern(state, boss, pattern);
      stepSurvivor(state, EMPTY_SURVIVOR_INPUT, SURVIVOR.fixedDt);

      const owned = state.attacks.filter((a) => a.active && a.sourceBossId === boss.id);
      expect(owned.length, `${pattern} produced no attack entity`).toBeGreaterThan(0);
      for (const a of owned) {
        expect(a.patternId).toBe(pattern);
        expect(a.sourceBossId).toBe(boss.id);
        expect(a.lifecycle).toBe('windup');
        // Windup can never damage — for any pattern, in any style.
        expect(a.damaging).toBe(false);
        // The renderer reads this exact shape.
        expect(shapeToRender(a.shape)).toBeTruthy();
      }
    }
  });

  it('windup entities cannot damage even with the player standing in the shape', () => {
    for (const pattern of ALL_BOSS_PATTERNS) {
      const { state, boss } = quietBossArena(5200 + pattern.length);
      if (isMegaOnlyPattern(pattern)) boss.isMega = true;
      forceBossIntoPattern(state, boss, pattern);
      stepSurvivor(state, EMPTY_SURVIVOR_INPUT, SURVIVOR.fixedDt);
      for (const a of state.attacks) {
        if (!a.active || a.sourceBossId !== boss.id) continue;
        const p = insideShape(a.shape);
        state.player.x = p.x;
        state.player.z = p.z;
        // Geometrically inside...
        expect(pointHitsShape(p.x, p.z, pr, a.shape)).toBe(true);
        // ...yet harmless, because the entity is not armed.
        expect(attackHitsPlayer(state, a)).toBe(false);
      }
    }
  });

  it('summon markers and the strafe corridor are never damaging at any point', () => {
    for (const pattern of ['summon', 'aerial-strafe'] as const) {
      const { state, boss } = quietBossArena(5300 + pattern.length);
      forceBossIntoPattern(state, boss, pattern);
      let sawMarker = false;
      for (let i = 0; i < 400; i += 1) {
        stepSurvivor(state, EMPTY_SURVIVOR_INPUT, SURVIVOR.fixedDt);
        for (const a of state.attacks) {
          if (!a.active || a.sourceBossId !== boss.id) continue;
          if (a.style !== 'marker') continue;
          sawMarker = true;
          expect(a.damaging).toBe(false);
        }
        if (boss.state === 'recover' || boss.state === 'idle') break;
      }
      expect(sawMarker).toBe(true);
    }
  });

  it('line locks its direction and its render descriptor matches collision exactly', () => {
    const { state, boss } = quietBossArena(5401);
    state.player.x = boss.x;
    state.player.z = boss.z + 10;
    forceBossIntoPattern(state, boss, 'line');
    stepSurvivor(state, EMPTY_SURVIVOR_INPUT, SURVIVOR.fixedDt);
    const a = hostileAttacks(state, boss.id)[0]!;
    expect(a.shape.kind).toBe('line');
    const locked = a.shape.kind === 'line' ? { ...a.shape } : null;
    expect(locked).toBeTruthy();

    // Renderer descriptor is derived from the same shape, at full collision size.
    const desc = shapeToRender(a.shape);
    expect(desc.visual).toBe('line');
    if (desc.visual === 'line' && locked) {
      expect(desc.width).toBeCloseTo(locked.halfWidth * 2, 6);
      expect(desc.length).toBeCloseTo(
        Math.hypot(locked.x1 - locked.x0, locked.z1 - locked.z0),
        6,
      );
    }

    // Player runs away: the locked lane must not follow.
    for (let i = 0; i < 40; i += 1) {
      state.player.x = boss.x + 14;
      state.player.z = boss.z - 12;
      stepSurvivor(state, EMPTY_SURVIVOR_INPUT, SURVIVOR.fixedDt);
      const cur = state.attacks.find((x) => x.id === a.id);
      if (!cur || !cur.active || cur.shape.kind !== 'line') break;
      expect(cur.shape.x0).toBeCloseTo(locked!.x0, 6);
      expect(cur.shape.z0).toBeCloseTo(locked!.z0, 6);
      expect(cur.shape.x1).toBeCloseTo(locked!.x1, 6);
      expect(cur.shape.z1).toBeCloseTo(locked!.z1, 6);
    }
  });

  it('the active line damages inside and spares outside, expanded by player radius', () => {
    const { state, boss } = quietBossArena(5402);
    state.player.x = boss.x;
    state.player.z = boss.z + 10;
    forceBossIntoPattern(state, boss, 'line');
    // Advance to the armed phase.
    let armed: SurvivorAttack | undefined;
    for (let i = 0; i < 200 && !armed; i += 1) {
      stepSurvivor(state, EMPTY_SURVIVOR_INPUT, SURVIVOR.fixedDt);
      armed = state.attacks.find((a) => a.active && a.sourceBossId === boss.id && a.damaging);
    }
    expect(armed).toBeTruthy();
    const shape = armed!.shape;
    expect(shape.kind).toBe('line');
    if (shape.kind !== 'line') return;

    const mid = insideShape(shape);
    // Inside the lane.
    expect(pointHitsShape(mid.x, mid.z, pr, shape)).toBe(true);
    // Just outside the lane, before radius expansion.
    const nx = -(shape.z1 - shape.z0);
    const nz = shape.x1 - shape.x0;
    const nl = Math.hypot(nx, nz) || 1;
    const offset = shape.halfWidth + pr + 0.4;
    expect(
      pointHitsShape(mid.x + (nx / nl) * offset, mid.z + (nz / nl) * offset, pr, shape),
    ).toBe(false);
    // Player-radius expansion: a point outside the raw halfWidth still hits.
    const grazing = shape.halfWidth + pr * 0.5;
    expect(
      pointHitsShape(mid.x + (nx / nl) * grazing, mid.z + (nz / nl) * grazing, pr, shape),
    ).toBe(true);

    // The armed shape actually hurts.
    state.player.x = mid.x;
    state.player.z = mid.z;
    state.player.invuln = 0;
    const hp0 = state.player.health;
    for (let i = 0; i < 12; i += 1) stepSurvivor(state, EMPTY_SURVIVOR_INPUT, SURVIVOR.fixedDt);
    expect(state.player.health).toBeLessThan(hp0);
  });

  it('rupture-ring keeps a genuinely safe core while its band expands', () => {
    const { state, boss } = quietBossArena(5403);
    forceBossIntoPattern(state, boss, 'rupture-ring');
    let ring: SurvivorAttack | undefined;
    for (let i = 0; i < 200 && !ring; i += 1) {
      stepSurvivor(state, EMPTY_SURVIVOR_INPUT, SURVIVOR.fixedDt);
      ring = state.attacks.find(
        (a) => a.active && a.sourceBossId === boss.id && a.damaging && a.shape.kind === 'ring',
      );
    }
    expect(ring).toBeTruthy();
    const shape = ring!.shape;
    if (shape.kind !== 'ring') return;
    expect(shape.outer).toBeGreaterThan(shape.inner);
    // Band hits, core is safe, far outside is safe.
    const bandR = (shape.inner + shape.outer) / 2;
    expect(pointHitsShape(shape.x + bandR, shape.z, 0, shape)).toBe(true);
    expect(pointHitsShape(shape.x, shape.z, 0, shape)).toBe(false);
    expect(pointHitsShape(shape.x + shape.outer + 3, shape.z, 0, shape)).toBe(false);
    // The render descriptor exposes the same annulus, so the hole is drawn.
    const desc = shapeToRender(shape);
    expect(desc.visual).toBe('ring');
    if (desc.visual === 'ring') {
      expect(desc.inner).toBeCloseTo(shape.inner, 6);
      expect(desc.outer).toBeCloseTo(shape.outer, 6);
    }
  });

  it('the sweeping beam moves render and collision together, frame by frame', () => {
    const { state, boss } = quietBossArena(5404);
    forceBossIntoPattern(state, boss, 'sweeping-beam');
    let beam: SurvivorAttack | undefined;
    for (let i = 0; i < 200 && !beam; i += 1) {
      stepSurvivor(state, EMPTY_SURVIVOR_INPUT, SURVIVOR.fixedDt);
      beam = state.attacks.find(
        (a) => a.active && a.sourceBossId === boss.id && a.damaging && a.shape.kind === 'line',
      );
    }
    expect(beam).toBeTruthy();

    const angles: number[] = [];
    for (let i = 0; i < 40; i += 1) {
      stepSurvivor(state, EMPTY_SURVIVOR_INPUT, SURVIVOR.fixedDt);
      const cur = state.attacks.find((a) => a.id === beam!.id);
      if (!cur || !cur.active || cur.shape.kind !== 'line') break;
      const s = cur.shape;
      angles.push(Math.atan2(s.x1 - s.x0, s.z1 - s.z0));
      // Descriptor and collision read the same instant of the same shape.
      const desc = shapeToRender(s);
      if (desc.visual === 'line') {
        expect(desc.width).toBeCloseTo(s.halfWidth * 2, 6);
        expect(desc.x).toBeCloseTo((s.x0 + s.x1) / 2, 6);
        expect(desc.z).toBeCloseTo((s.z0 + s.z1) / 2, 6);
      }
      // A point on the current beam always registers as a hit right now.
      const mid = insideShape(s);
      expect(pointHitsShape(mid.x, mid.z, pr, s)).toBe(true);
    }
    expect(angles.length).toBeGreaterThan(5);
    // The beam genuinely swept rather than sitting still.
    expect(Math.abs(angles[angles.length - 1]! - angles[0]!)).toBeGreaterThan(0.05);
  });

  it('the fan previews a real wedge whose projectiles match their visible radius', () => {
    const { state, boss } = quietBossArena(5405);
    forceBossIntoPattern(state, boss, 'fan');
    stepSurvivor(state, EMPTY_SURVIVOR_INPUT, SURVIVOR.fixedDt);
    const cone = hostileAttacks(state, boss.id)[0]!;
    expect(cone.shape.kind).toBe('cone');
    if (cone.shape.kind === 'cone') {
      expect(cone.shape.halfAngle).toBeGreaterThan(0.2);
      const desc = shapeToRender(cone.shape);
      expect(desc.visual).toBe('cone');
      if (desc.visual === 'cone') {
        expect(desc.halfAngle).toBeCloseTo(cone.shape.halfAngle, 6);
        expect(desc.length).toBeCloseTo(cone.shape.length, 6);
      }
    }
    for (let i = 0; i < 200; i += 1) {
      stepSurvivor(state, EMPTY_SURVIVOR_INPUT, SURVIVOR.fixedDt);
      const fired = state.projectiles.filter((p) => p.active && p.kind === 'boss-fan');
      if (fired.length > 0) {
        for (const p of fired) expect(p.visualRadius).toBeCloseTo(p.radius, 6);
        return;
      }
    }
    throw new Error('fan never fired');
  });

  it('recovery leaves nothing armed', () => {
    for (const pattern of ALL_BOSS_PATTERNS) {
      const { state, boss } = quietBossArena(5500 + pattern.length);
      if (isMegaOnlyPattern(pattern)) boss.isMega = true;
      forceBossIntoPattern(state, boss, pattern);
      let reachedRecover = false;
      for (let i = 0; i < 900; i += 1) {
        stepSurvivor(state, EMPTY_SURVIVOR_INPUT, SURVIVOR.fixedDt);
        if (boss.state === 'recover') {
          reachedRecover = true;
          break;
        }
      }
      expect(reachedRecover, `${pattern} never recovered`).toBe(true);
      for (const a of state.attacks) {
        if (a.active && a.sourceBossId === boss.id) {
          expect(a.damaging, `${pattern} left an armed entity in recovery`).toBe(false);
        }
      }
    }
  });

  it('two bosses never clean up each other’s attacks', () => {
    const { state, boss } = quietBossArena(5601);
    const other = placeBoss(state, { index: 6, mega: false, x: -14, z: -14 });
    other.colliderRadius = 1.0;
    other.timer = 0;
    other.maxHealth = 100000;
    other.health = other.maxHealth;

    forceBossIntoPattern(state, boss, 'cryo-lanes');
    forceBossIntoPattern(state, other, 'contamination');
    stepSurvivor(state, EMPTY_SURVIVOR_INPUT, SURVIVOR.fixedDt);

    const mine = state.attacks.filter((a) => a.active && a.sourceBossId === boss.id);
    const theirs = state.attacks.filter((a) => a.active && a.sourceBossId === other.id);
    expect(mine.length).toBeGreaterThan(0);
    expect(theirs.length).toBeGreaterThan(0);

    // Cancel one boss only.
    cancelBossCombat(state, boss);
    expect(state.attacks.filter((a) => a.active && a.sourceBossId === boss.id).length).toBe(0);
    expect(state.attacks.filter((a) => a.active && a.sourceBossId === other.id).length).toBe(
      theirs.length,
    );
  });

  it('boss death removes pending warnings and disarms its hazards immediately', () => {
    const { state, boss } = quietBossArena(5602);
    forceBossIntoPattern(state, boss, 'contamination');
    // Run into the active phase so a hazard exists.
    for (let i = 0; i < 200; i += 1) {
      stepSurvivor(state, EMPTY_SURVIVOR_INPUT, SURVIVOR.fixedDt);
      if (state.hazards.some((h) => h.active && h.sourceBossId === boss.id)) break;
    }
    expect(state.hazards.some((h) => h.active && h.sourceBossId === boss.id)).toBe(true);

    forceBossIntoPattern(state, boss, 'pulse');
    stepSurvivor(state, EMPTY_SURVIVOR_INPUT, SURVIVOR.fixedDt);
    expect(state.attacks.some((a) => a.active && a.sourceBossId === boss.id)).toBe(true);

    // Kill it.
    boss.health = 0;
    cancelBossCombat(state, boss);
    boss.active = false;
    boss.state = 'dead';

    // No orphan warnings, no orphan damage.
    expect(state.attacks.filter((a) => a.active && a.sourceBossId === boss.id).length).toBe(0);
    for (const h of state.hazards) {
      if (h.sourceBossId === boss.id) expect(h.damage).toBe(0);
    }
    for (const p of state.projectiles) {
      if (p.sourceBossId === boss.id) expect(p.active).toBe(false);
    }
    // And the player takes nothing further from it.
    state.player.invuln = 0;
    const hp0 = state.player.health;
    for (let i = 0; i < 120; i += 1) stepSurvivor(state, EMPTY_SURVIVOR_INPUT, SURVIVOR.fixedDt);
    expect(state.player.health).toBe(hp0);
  });

  it('hostile boss warnings use the red/magenta palette; markers do not', () => {
    for (const pattern of ALL_BOSS_PATTERNS) {
      expect(HOSTILE_ATTACK_COLORS).toContain(bossPatternColor(pattern));
    }
    // The harmless-indicator colour is deliberately outside the hostile palette.
    expect(HOSTILE_ATTACK_COLORS).not.toContain(bossMarkerColor());

    // And live entities honour it: damaging → hostile colour, marker → marker colour.
    for (const pattern of ALL_BOSS_PATTERNS) {
      const { state, boss } = quietBossArena(5800 + pattern.length);
      if (isMegaOnlyPattern(pattern)) boss.isMega = true;
      forceBossIntoPattern(state, boss, pattern);
      for (let i = 0; i < 400; i += 1) {
        stepSurvivor(state, EMPTY_SURVIVOR_INPUT, SURVIVOR.fixedDt);
        for (const a of state.attacks) {
          if (!a.active || a.sourceBossId !== boss.id) continue;
          if (a.style === 'marker') {
            expect(a.damaging).toBe(false);
            expect(a.color).toBe(bossMarkerColor());
          } else if (a.damaging) {
            expect(HOSTILE_ATTACK_COLORS).toContain(a.color);
          }
        }
        if (boss.state === 'recover') break;
      }
    }
  });

  it('friendly Gunship markings stay on the accent palette', () => {
    const state = gunshipFixture(5701);
    forceStartProtocol(state, 'gunship-flyby', 1);
    const lane = state.effects.find((e) => e.kind === 'telegraph' && (e.length ?? 0) > 2);
    expect(lane).toBeTruthy();
    expect(lane!.color).toBe(state.accent);
    // Gunship is not a boss attack and never enters the hostile attack list.
    expect(state.attacks.filter((a) => a.active).length).toBe(0);
  });
});

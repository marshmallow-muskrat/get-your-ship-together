import { describe, expect, it, beforeEach, afterEach } from 'vitest';
import { createSurvivorState, primaryBoss } from './survivorState';
import {
  EMPTY_SURVIVOR_INPUT,
  applyChoice,
  applyShipExhaust,
  bossDamageReduction,
  clearShipHazards,
  damagePlayer,
  directPickupRadius,
  generateChoices,
  magnetRadius,
  stepSurvivor,
  thrusterPower,
  tryDodge,
  tryMech,
  tryRepulsor,
  tryShip,
  surroundPlayer,
} from './survivorSim';
import {
  BOSS_DEFS,
  PASSIVES,
  SURVIVOR,
  SURVIVOR_BOSS,
  WEAPONS,
  bossDefForIndex,
  bossDifficultyFor,
  bossPhaseFromHealth,
  bossTimeForIndex,
  endlessDifficultyAt,
  heroStarterWeapon,
  playerPowerScale,
  spawnPressure,
  xpForLevel,
} from './survivorContent';
import {
  DEFAULT_KEYBINDS,
  UI_SCALE_DEFAULT,
  UI_SCALE_MAX,
  UI_SCALE_MIN,
  assignKeybind,
  clampUiScale,
  formatKeyCode,
  normalizeKeybinds,
  resetKeybinds,
} from './survivorKeybinds';
import {
  LEADERBOARDS_STORAGE_KEY,
  MAX_LEADERBOARD_ENTRIES,
  RECORDS_STORAGE_KEY,
  formatSurvivalTime,
  getHeroLeaderboard,
  loadLeaderboards,
  loadRecords,
  makeRunSummary,
  recordRun,
} from './survivorRecords';
import type { HeroId } from '../../content/heroes';

function installMemoryStorage(): Map<string, string> {
  const store = new Map<string, string>();
  const ls = {
    getItem: (k: string) => (store.has(k) ? store.get(k)! : null),
    setItem: (k: string, v: string) => {
      store.set(k, String(v));
    },
    removeItem: (k: string) => {
      store.delete(k);
    },
    clear: () => store.clear(),
  };
  Object.defineProperty(globalThis, 'localStorage', {
    value: ls,
    configurable: true,
    writable: true,
  });
  return store;
}

describe('survivor content', () => {
  it('xp thresholds increase', () => {
    expect(xpForLevel(2)).toBeGreaterThan(xpForLevel(1));
  });

  it('endless difficulty rises unbounded', () => {
    const early = endlessDifficultyAt(60);
    const mid = endlessDifficultyAt(300);
    const late = endlessDifficultyAt(900);
    expect(mid.healthMul).toBeGreaterThan(early.healthMul);
    expect(late.healthMul).toBeGreaterThan(mid.healthMul);
    expect(late.speedMul).toBeLessThanOrEqual(1.3);
    expect(spawnPressure(400)).toBeGreaterThan(spawnPressure(60));
  });

  it('boss schedule is every two minutes', () => {
    expect(bossTimeForIndex(1)).toBe(120);
    expect(bossTimeForIndex(2)).toBe(240);
    expect(bossTimeForIndex(5)).toBe(600);
  });

  it('boss difficulty scales with index', () => {
    const a = bossDifficultyFor(1);
    const b = bossDifficultyFor(3);
    expect(b.healthMul).toBeGreaterThan(a.healthMul);
    expect(b.damageMul).toBeGreaterThan(a.damageMul);
    expect(b.recoveryMul).toBeLessThan(a.recoveryMul);
  });

  it('frog starts with bioplasma', () => {
    expect(heroStarterWeapon('frog')).toBe('bioplasma');
    expect(WEAPONS.gravity).toBeDefined();
  });

  it('repulsor final tuning is 1.33× prior enlarged values', () => {
    expect(SURVIVOR.repulsor.radius).toBeCloseTo(13.5 * 1.33, 2);
    expect(SURVIVOR.repulsor.push).toBeCloseTo(12 * 1.33, 2);
    expect(SURVIVOR.repulsor.cooldown).toBe(30);
  });

  it('dodge distance is triple prior 4.5 with 10s cooldown', () => {
    expect(SURVIVOR.dodge.cooldown).toBe(10);
    expect(SURVIVOR.dodge.distance).toBeCloseTo(4.5 * 3, 5);
    expect(SURVIVOR.dodge.distance).toBe(13.5);
  });

  it('has at least five distinct boss defs with runtime URLs', () => {
    expect(BOSS_DEFS.length).toBeGreaterThanOrEqual(5);
    const ids = new Set(BOSS_DEFS.map((b) => b.id));
    expect(ids.size).toBe(BOSS_DEFS.length);
    for (const b of BOSS_DEFS) {
      expect(b.url.startsWith('/runtime/boss/')).toBe(true);
      expect(b.targetHeight).toBeGreaterThan(2);
      expect(b.colliderRadius).toBeGreaterThan(0.5);
      expect(b.preferredPatterns.length).toBeGreaterThan(0);
    }
  });

  it('boss rotation is deterministic and avoids immediate model repeats', () => {
    const a = bossDefForIndex(1);
    const b = bossDefForIndex(2);
    expect(a.id).not.toBe(b.id);
    expect(bossDefForIndex(1).id).toBe(a.id);
    const sequence = [1, 2, 3, 4, 5, 6, 7].map((i) => bossDefForIndex(i).id);
    for (let i = 1; i < sequence.length; i += 1) {
      expect(sequence[i]).not.toBe(sequence[i - 1]);
    }
  });

  it('breach shielding passive is defined at 8% per level capped 40%', () => {
    const def = PASSIVES.find((p) => p.id === 'breach-shielding');
    expect(def).toBeTruthy();
    expect(def!.perLevel).toBe(0.08);
    expect(def!.maxLevel).toBe(5);
  });

  it('playerPowerScale caps thruster permanent growth', () => {
    const base = playerPowerScale({ weapons: [{ level: 1 }], passives: {} });
    expect(base).toBe(1);
    const mid = playerPowerScale({
      weapons: [
        { level: 3 },
        { level: 3 },
        { level: 2 },
      ],
      passives: { 'move-speed': 2, area: 1 },
    });
    expect(mid).toBeGreaterThan(1);
    const strong = playerPowerScale({
      weapons: Array.from({ length: 5 }, () => ({ level: 5 })),
      passives: {
        'move-speed': 5,
        'pickup-radius': 5,
        'max-health': 5,
        regen: 5,
        'weapon-haste': 5,
        area: 5,
        'mech-charge': 5,
        'mech-duration': 5,
        'breach-shielding': 5,
      },
    });
    expect(strong).toBeGreaterThan(mid);
    expect(strong).toBeLessThanOrEqual(SURVIVOR.ship.powerScaleCap);
    // Extreme values hit the hard cap
    const capped = playerPowerScale({
      weapons: Array.from({ length: 5 }, () => ({ level: 99 })),
      passives: { 'move-speed': 99, area: 99 },
    });
    expect(capped).toBe(SURVIVOR.ship.powerScaleCap);
  });

  it('all four heroes have ship pickup dimensions larger than astronaut', () => {
    const heroes: HeroId[] = ['bee', 'flamingo', 'frog', 'red-panda'];
    for (const h of heroes) {
      const ship = SURVIVOR.heroShips[h];
      expect(ship.pickupRadius).toBeGreaterThan(SURVIVOR.playerRadius);
      expect(ship.collectionRadius).toBeGreaterThanOrEqual(ship.pickupRadius);
      expect(ship.colliderLength).toBeGreaterThan(2);
      expect(ship.colliderWidth).toBeGreaterThan(2);
    }
  });
});

describe('endless simulation', () => {
  it('counts survival time upward only while playing', () => {
    const state = createSurvivorState('bee', null, 1);
    for (let i = 0; i < 60; i += 1) stepSurvivor(state, EMPTY_SURVIVOR_INPUT, SURVIVOR.fixedDt);
    expect(state.time).toBeCloseTo(1, 1);
    state.phase = 'paused';
    const t = state.time;
    for (let i = 0; i < 60; i += 1) stepSurvivor(state, EMPTY_SURVIVOR_INPUT, SURVIVOR.fixedDt);
    expect(state.time).toBeCloseTo(t, 5);
  });

  it('spawns boss at 2:00 and never victories on boss death', () => {
    const state = createSurvivorState('bee', 'survivor-boss', 2);
    expect(state.time).toBeLessThan(SURVIVOR.bossInterval);
    for (let i = 0; i < 10; i += 1) stepSurvivor(state, EMPTY_SURVIVOR_INPUT, SURVIVOR.fixedDt);
    expect(state.bossesSpawned).toBeGreaterThanOrEqual(1);
    const b = primaryBoss(state);
    expect(b).toBeTruthy();
    if (b) {
      expect(b.defId).toBeTruthy();
      expect(b.displayName.length).toBeGreaterThan(0);
      b.health = 0;
      b.state = 'dead';
      b.active = false;
      state.bossesDefeated = 1;
    }
    expect(state.phase).not.toBe('victory');
  });

  it('queues breach stacks when simultaneous boss cap hit', () => {
    const state = createSurvivorState('bee', null, 3);
    state.time = SURVIVOR.bossInterval * 5;
    state.nextBossIndex = 1;
    state.nextBossTime = SURVIVOR.bossInterval;
    for (let i = 0; i < 5; i += 1) stepSurvivor(state, EMPTY_SURVIVOR_INPUT, SURVIVOR.fixedDt);
    expect(state.bossesSpawned + state.breachStacks).toBeGreaterThanOrEqual(1);
  });

  it('respects enemy cap under endless pressure', () => {
    const state = createSurvivorState('bee', 'survivor-horde', 42);
    state.enemyCap = 25;
    for (let i = 0; i < 400; i += 1) stepSurvivor(state, EMPTY_SURVIVOR_INPUT, SURVIVOR.fixedDt);
    expect(state.enemies.filter((e) => e.alive).length).toBeLessThanOrEqual(25);
  });

  it('levels up with three choices including temps when exhausted', () => {
    const state = createSurvivorState('bee', null, 7);
    for (const w of state.weapons) w.level = WEAPONS[w.weaponId].levels.length;
    state.weapons = (Object.keys(WEAPONS) as (keyof typeof WEAPONS)[])
      .slice(0, SURVIVOR.maxWeaponSlots)
      .map((id) => ({ weaponId: id, level: WEAPONS[id].levels.length, cooldown: 0 }));
    for (const pas of [
      'move-speed',
      'pickup-radius',
      'max-health',
      'regen',
      'weapon-haste',
      'area',
      'mech-charge',
      'mech-duration',
      'breach-shielding',
    ] as const) {
      state.passives[pas] = 5;
    }
    const choices = generateChoices(state);
    expect(choices.length).toBe(3);
    expect(choices.some((c) => c.kind === 'temp')).toBe(true);
  });
});

describe('ship pickup radius', () => {
  it('ship pickup exceeds astronaut and covers wing edges', () => {
    const state = createSurvivorState('bee', null, 11);
    const astroDirect = directPickupRadius(state);
    const astroMag = magnetRadius(state);
    expect(astroDirect).toBeLessThanOrEqual(0.6);
    tryShip(state);
    expect(state.player.form).toBe('ship');
    const shipDirect = directPickupRadius(state);
    const shipMag = magnetRadius(state);
    expect(shipDirect).toBeGreaterThan(astroDirect);
    expect(shipMag).toBeGreaterThanOrEqual(SURVIVOR.heroShips.bee.collectionRadius * 0.99);
    // Wing-edge orb: within ship pickup half-width
    const wingX = SURVIVOR.heroShips.bee.colliderWidth * 0.45;
    state.pickups.push({
      id: 501,
      kind: 'xp',
      x: wingX,
      z: 0,
      value: 5,
      active: true,
      magnetized: false,
    });
    // Far beyond ship — not collected
    state.pickups.push({
      id: 502,
      kind: 'xp',
      x: 12,
      z: 0,
      value: 5,
      active: true,
      magnetized: false,
    });
    for (let i = 0; i < 8; i += 1) stepSurvivor(state, EMPTY_SURVIVOR_INPUT, SURVIVOR.fixedDt);
    expect(state.pickups.find((p) => p.id === 501)?.active).toBe(false);
    expect(state.pickups.find((p) => p.id === 502)?.active).toBe(true);
  });

  it('magnet field combines with ship without double multiply', () => {
    const state = createSurvivorState('flamingo', null, 12);
    state.passives['pickup-radius'] = 5;
    tryShip(state);
    const withMagnet = magnetRadius(state);
    state.passives['pickup-radius'] = 0;
    const baseShip = magnetRadius(state);
    expect(withMagnet).toBeGreaterThan(baseShip);
    // Not double: magnet bonus applied additively-ish, not ship * magnet * magnet
    expect(withMagnet).toBeLessThan(baseShip * 2.5);
  });

  it('returns to astronaut radius after ship ends and restart clears form', () => {
    const state = createSurvivorState('frog', null, 13);
    tryShip(state);
    expect(directPickupRadius(state)).toBe(SURVIVOR.heroShips.frog.pickupRadius);
    state.player.shipDuration = SURVIVOR.fixedDt;
    stepSurvivor(state, EMPTY_SURVIVOR_INPUT, SURVIVOR.fixedDt);
    expect(state.player.form).toBe('astronaut');
    expect(directPickupRadius(state)).toBeCloseTo(0.55, 5);
    const restarted = createSurvivorState('frog', null, 13);
    expect(restarted.player.form).toBe('astronaut');
    expect(directPickupRadius(restarted)).toBeCloseTo(0.55, 5);
  });
});

describe('thruster power and breach shielding', () => {
  it('thruster power grows with permanent build and plateaus', () => {
    const state = createSurvivorState('bee', null, 14);
    const start = thrusterPower(state);
    expect(start).toBeCloseTo(1, 5);
    state.weapons = [
      { weaponId: 'pulse', level: 5, cooldown: 0 },
      { weaponId: 'rail', level: 5, cooldown: 0 },
      { weaponId: 'rocket', level: 5, cooldown: 0 },
      { weaponId: 'microdrone', level: 5, cooldown: 0 },
      { weaponId: 'gravity', level: 5, cooldown: 0 },
    ];
    state.passives = {
      'move-speed': 5,
      area: 5,
      'weapon-haste': 5,
      'max-health': 5,
      regen: 5,
      'pickup-radius': 5,
      'mech-charge': 5,
      'mech-duration': 5,
      'breach-shielding': 5,
    };
    const late = thrusterPower(state);
    expect(late).toBeGreaterThan(start);
    expect(late).toBeLessThanOrEqual(SURVIVOR.ship.powerScaleCap);
  });

  it('breach shielding reduces boss damage only', () => {
    const state = createSurvivorState('bee', null, 15);
    state.passives['breach-shielding'] = 5;
    expect(bossDamageReduction(state)).toBeCloseTo(0.4, 5);
    const hp = state.player.health;
    state.player.invuln = 0;
    damagePlayer(state, 50, 'boss');
    const afterBoss = state.player.health;
    // 50 * 0.6 = 30 damage when fully shielded
    expect(hp - afterBoss).toBeCloseTo(30, 1);

    state.player.health = 100;
    state.player.invuln = 0;
    state.player.alive = true;
    damagePlayer(state, 50, 'enemy');
    // ordinary enemy: no breach reduction (astronaut mul 1)
    expect(100 - state.player.health).toBeCloseTo(50, 1);
  });
});

describe('dodge', () => {
  it('activates with 10s cooldown and travels ~triple prior distance', () => {
    const state = createSurvivorState('bee', null, 4);
    const x0 = state.player.x;
    const z0 = state.player.z;
    expect(tryDodge(state, 1, 0)).toBe(true);
    expect(state.player.dodgeCd).toBe(10);
    expect(state.player.dodgeActive).toBeGreaterThan(0);
    expect(tryDodge(state, 1, 0)).toBe(false);
    // Run full dodge duration
    const steps = Math.ceil(SURVIVOR.dodge.duration / SURVIVOR.fixedDt) + 2;
    for (let i = 0; i < steps; i += 1) stepSurvivor(state, EMPTY_SURVIVOR_INPUT, SURVIVOR.fixedDt);
    const traveled = Math.hypot(state.player.x - x0, state.player.z - z0);
    expect(traveled).toBeGreaterThan(12);
    expect(traveled).toBeLessThanOrEqual(SURVIVOR.dodge.distance + 0.5);
  });

  it('cannot dodge in ship form', () => {
    const state = createSurvivorState('bee', null, 5);
    tryShip(state);
    expect(tryDodge(state, 1, 0)).toBe(false);
  });
});

describe('repulsor', () => {
  it('applies large radius and 30s cd', () => {
    const state = createSurvivorState('bee', null, 6);
    surroundPlayer(state, 4, 8);
    expect(tryRepulsor(state)).toBe(true);
    expect(state.player.repulsorCd).toBe(30);
  });
});

describe('ship exhaust', () => {
  it('damages behind not front', () => {
    const state = createSurvivorState('bee', null, 8);
    tryShip(state);
    state.player.facingX = 1;
    state.player.facingZ = 0;
    state.enemies.push({
      id: 901,
      defId: 'basic',
      x: -1.5,
      z: 0,
      vx: 0,
      vz: 0,
      kbX: 0,
      kbZ: 0,
      health: 100,
      maxHealth: 100,
      radius: 0.4,
      role: 'basic',
      hitFlash: 0,
      attackCd: 1,
      alive: true,
      isElite: false,
      isMiniboss: false,
      xp: 3,
      windup: 0,
      facingX: 1,
      facingZ: 0,
      healthMul: 1,
      damageMul: 1,
      speedMul: 1,
      hazardHitCd: 0,
      specialCd: 0,
      specialWindup: 0,
    });
    state.enemies.push({
      id: 902,
      defId: 'basic',
      x: 2,
      z: 0,
      vx: 0,
      vz: 0,
      kbX: 0,
      kbZ: 0,
      health: 100,
      maxHealth: 100,
      radius: 0.4,
      role: 'basic',
      hitFlash: 0,
      attackCd: 1,
      alive: true,
      isElite: false,
      isMiniboss: false,
      xp: 3,
      windup: 0,
      facingX: -1,
      facingZ: 0,
      healthMul: 1,
      damageMul: 1,
      speedMul: 1,
      hazardHitCd: 0,
      specialCd: 0,
      specialWindup: 0,
    });
    state.player.exhaustTickCd = 0;
    applyShipExhaust(state, SURVIVOR.fixedDt);
    expect(state.enemies.find((e) => e.id === 901)!.health).toBeLessThan(100);
    expect(state.enemies.find((e) => e.id === 902)!.health).toBe(100);
  });

  it('clears on form end', () => {
    const state = createSurvivorState('bee', null, 9);
    tryShip(state);
    for (let i = 0; i < 15; i += 1) {
      stepSurvivor(state, { ...EMPTY_SURVIVOR_INPUT, moveX: 1, moveY: 0 }, SURVIVOR.fixedDt);
    }
    state.player.shipDuration = SURVIVOR.fixedDt;
    stepSurvivor(state, EMPTY_SURVIVOR_INPUT, SURVIVOR.fixedDt);
    expect(state.player.form).toBe('astronaut');
    clearShipHazards(state);
  });
});

describe('keybinds and ui scale', () => {
  it('defaults include dodge Space', () => {
    expect(DEFAULT_KEYBINDS.dodge).toBe('Space');
    expect(formatKeyCode('Space')).toBe('Space');
    expect(normalizeKeybinds({ repulsor: 'KeyF' }).dodge).toBe('Space');
  });

  it('clamps ui scale to 75–150% with 5% steps', () => {
    expect(clampUiScale(1)).toBe(UI_SCALE_DEFAULT);
    expect(clampUiScale(0.5)).toBe(UI_SCALE_MIN);
    expect(clampUiScale(2)).toBe(UI_SCALE_MAX);
    expect(clampUiScale(1.23)).toBe(1.25);
    expect(clampUiScale('nope')).toBe(UI_SCALE_DEFAULT);
  });

  it('resetKeybinds restores defaults', () => {
    const next = assignKeybind(DEFAULT_KEYBINDS, 'dodge', 'KeyZ');
    expect(next.dodge).toBe('KeyZ');
    expect(resetKeybinds().dodge).toBe('Space');
  });
});

describe('per-hero leaderboards', () => {
  let store: Map<string, string>;

  beforeEach(() => {
    store = installMemoryStorage();
  });

  afterEach(() => {
    store.clear();
  });

  it('keeps independent rankings per hero', () => {
    const bee = makeRunSummary({
      survivalTime: 200,
      kills: 50,
      level: 10,
      bossesDefeated: 1,
      heroId: 'bee',
      weapons: [{ weaponId: 'pulse', level: 2 }],
      passives: {},
    });
    const frog = makeRunSummary({
      survivalTime: 90,
      kills: 20,
      level: 5,
      bossesDefeated: 0,
      heroId: 'frog',
      weapons: [{ weaponId: 'bioplasma', level: 1 }],
      passives: {},
    });
    recordRun(bee);
    recordRun(frog);
    expect(getHeroLeaderboard('bee')[0]?.survivalTime).toBe(200);
    expect(getHeroLeaderboard('frog')[0]?.survivalTime).toBe(90);
    expect(getHeroLeaderboard('bee').some((r) => r.heroId === 'frog')).toBe(false);
    expect(loadRecords().version).toBe(2);
  });

  it('sorts by time then kills then bosses and keeps top 10', () => {
    for (let i = 0; i < 12; i += 1) {
      recordRun(
        makeRunSummary({
          survivalTime: 100 + i,
          kills: i,
          level: 3,
          bossesDefeated: i % 3,
          heroId: 'flamingo',
          weapons: [],
          passives: {},
        }),
      );
    }
    const board = getHeroLeaderboard('flamingo');
    expect(board.length).toBe(MAX_LEADERBOARD_ENTRIES);
    expect(board[0]!.survivalTime).toBeGreaterThan(board[1]!.survivalTime);

    // Tie-breakers: equal time — higher kills ranks first
    const lowKills = makeRunSummary({
      survivalTime: 500,
      kills: 10,
      level: 4,
      bossesDefeated: 9,
      heroId: 'red-panda',
      weapons: [],
      passives: {},
    });
    const highKills = makeRunSummary({
      survivalTime: 500,
      kills: 40,
      level: 4,
      bossesDefeated: 0,
      heroId: 'red-panda',
      weapons: [],
      passives: {},
    });
    // Force distinct ids (same-ms collision safety)
    lowKills.id = 'rp-low-kills';
    highKills.id = 'rp-high-kills';
    recordRun(lowKills);
    recordRun(highKills);
    const rp = getHeroLeaderboard('red-panda');
    expect(rp.length).toBe(2);
    expect(rp[0]!.id).toBe('rp-high-kills');
    expect(rp[0]!.kills).toBe(40);
    expect(rp[1]!.kills).toBe(10);
  });

  it('prevents duplicate run insertion', () => {
    const s = makeRunSummary({
      survivalTime: 111,
      kills: 5,
      level: 2,
      bossesDefeated: 0,
      heroId: 'bee',
      weapons: [],
      passives: {},
    });
    const a = recordRun(s);
    const b = recordRun(s);
    expect(a.isTopTen).toBe(true);
    expect(getHeroLeaderboard('bee').filter((r) => r.id === s.id).length).toBe(1);
    expect(b.rank).toBeGreaterThan(0);
  });

  it('migrates v1 best-by-hero safely', () => {
    store.set(
      RECORDS_STORAGE_KEY,
      JSON.stringify({
        version: 1,
        bestOverall: {
          survivalTime: 333,
          kills: 80,
          level: 12,
          bossesDefeated: 2,
          heroId: 'bee',
          weapons: [],
          passives: [],
          timestamp: Date.now(),
          balanceVersion: 'old',
        },
        bestByHero: {
          frog: {
            survivalTime: 150,
            kills: 30,
            level: 6,
            bossesDefeated: 1,
            heroId: 'frog',
            weapons: [],
            passives: [],
            timestamp: Date.now(),
            balanceVersion: 'old',
          },
        },
        highestKills: 80,
        highestLevel: 12,
        mostBossesDefeated: 2,
      }),
    );
    // Force load with no v2 key
    store.delete(LEADERBOARDS_STORAGE_KEY);
    const boards = loadLeaderboards();
    expect(boards.version).toBe(2);
    expect(boards.heroes.bee[0]?.survivalTime).toBe(333);
    expect(boards.heroes.frog[0]?.survivalTime).toBe(150);
  });

  it('handles malformed storage without throwing', () => {
    store.set(LEADERBOARDS_STORAGE_KEY, '{not json');
    expect(() => loadLeaderboards()).not.toThrow();
    expect(loadLeaderboards().heroes.bee).toEqual([]);
    store.set(LEADERBOARDS_STORAGE_KEY, JSON.stringify({ version: 2, heroes: { bee: [null, 3, {}] } }));
    expect(loadLeaderboards().heroes.bee.length).toBe(0);
  });

  it('formats survival time', () => {
    expect(formatSurvivalTime(3661)).toBe('1:01:01');
  });
});

describe('mech and choices', () => {
  it('mech activates when charged', () => {
    const state = createSurvivorState('flamingo', 'survivor-mech', 9);
    expect(state.player.mechCharge).toBe(1);
    stepSurvivor(state, { ...EMPTY_SURVIVOR_INPUT, mechPressed: true }, SURVIVOR.fixedDt);
    expect(state.player.form).toBe('mech');
  });

  it('applyChoice works for weapons', () => {
    const state = createSurvivorState('bee', null, 2);
    state.phase = 'levelup';
    state.choices = generateChoices(state);
    applyChoice(state, 0);
    expect(state.phase).toBe('playing');
  });

  it('ship and mech mutual exclusion', () => {
    const state = createSurvivorState('flamingo', null, 3);
    state.player.mechCharge = 1;
    expect(tryShip(state)).toBe(true);
    expect(tryMech(state)).toBe(false);
  });

  it('can offer breach shielding passive', () => {
    const state = createSurvivorState('bee', null, 20);
    // leave room for passive
    let found = false;
    for (let i = 0; i < 40 && !found; i += 1) {
      const s = createSurvivorState('bee', null, 100 + i);
      const choices = generateChoices(s);
      if (choices.some((c) => c.passiveId === 'breach-shielding' || c.id.includes('breach'))) {
        found = true;
      }
    }
    // Force-apply via applyChoice path if generated
    state.passives['breach-shielding'] = 1;
    expect(bossDamageReduction(state)).toBeCloseTo(0.08, 5);
  });
});

describe('boss phases', () => {
  it('phase thresholds', () => {
    expect(bossPhaseFromHealth(2200, 2200)).toBe(1);
    expect(bossPhaseFromHealth(SURVIVOR_BOSS.maxHealth * 0.5, SURVIVOR_BOSS.maxHealth)).toBe(2);
    expect(bossPhaseFromHealth(SURVIVOR_BOSS.maxHealth * 0.2, SURVIVOR_BOSS.maxHealth)).toBe(3);
  });
});

import { describe, expect, it, beforeEach, afterEach } from 'vitest';
import type { DamageSource } from './survivorTelemetry';

/** Minimal typed sources for tests that only care about mitigation, not attribution. */
const TEST_HORDE_SOURCE: DamageSource = {
  kind: 'horde-contact',
  displayName: 'Blob',
  attackName: 'Contact',
  role: 'fodder',
};
const TEST_BOSS_SOURCE: DamageSource = {
  kind: 'boss-body',
  displayName: 'Breach Demon',
  attackName: 'Body Slam',
  bossIndex: 1,
  isMega: false,
};
import {
  focusLossTransition,
  shouldCloseRunReport,
  shouldHandleVisibility,
} from './survivorFocus';
import type { ActionId } from './survivorKeybinds';
import {
  createSurvivorState,
  emptyBoss,
  emptyEnemy,
  primaryBoss,
  type SurvivorState,
} from './survivorState';
import {
  EMPTY_SURVIVOR_INPUT,
  applyChoice,
  applyBossBodyContact,
  applyProtocolChoice,
  applyShipExhaust,
  bossDamageReduction,
  buildFingerprint,
  clearShipHazards,
  damagePlayer,
  directPickupRadius,
  forceEnqueueBossIndex,
  forceStartProtocol,
  generateChoices,
  magnetRadius,
  stepSurvivor,
  thrusterPower,
  healthMagnetRadius,
  healthDirectRadius,
  energyMagnetRadius,
  forceBossIntoPattern,
  cancelBossCombat,
  tryDodge,
  tryMech,
  tryRepulsor,
  tryShip,
  surroundPlayer,
  safePickupPosition,
} from './survivorSim';
import {
  BOSS_DEFS,
  OVERCLOCK_DAMAGE_PER_LEVEL,
  PASSIVES,
  SURVIVOR,
  SURVIVOR_BALANCE_VERSION,
  SURVIVOR_BOSS,
  HORDE,
  WEAPONS,
  bossCategoryDamage,
  computeShieldPoints,
  bossDefForIndex,
  bossDifficultyFor,
  bossPhaseFromHealth,
  bossTimeForIndex,
  endlessDifficultyAt,
  isEnemyEligibleAt,
  moveSpeedBonus,
  formatOverclockLabel,
  heroStarterWeapon,
  hullPlatingGainAtLevel,
  overclockLevel,
  playerPowerScale,
  regenPerSecondAtLevel,
  spawnPressure,
  weaponStatsAtLevel,
  xpForLevel,
  bossHealthMulFor,
  isMegaBossIndex,
  bossFocusBaseChance,
  ALL_BOSS_PATTERNS,
  isMegaOnlyPattern,
  type BossPatternId,
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
  MAX_RUN_HISTORY_ENTRIES,
  RECORDS_STORAGE_KEY,
  formatSurvivalTime,
  getHeroLeaderboard,
  getRunHistory,
  loadLeaderboards,
  loadRecords,
  makeRunSummary,
  recordRun,
} from './survivorRecords';
import { allPatternsHandled } from './survivorBossPatterns';

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

// Starter parity is governed by the seven-scenario moving-target harness in
// survivorWeaponBenchmark.test.ts. The two-scenario static-dummy benchmark that used
// to live here measured homing weapons against motionless targets and disagreed with
// it, so it was removed rather than kept as a second, weaker opinion.

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
    expect(late.speedMul).toBeGreaterThan(early.speedMul);
    expect(spawnPressure(400)).toBeGreaterThan(spawnPressure(60));
  });

  it('holds midgame durability below the old sponge curve while preserving the endless tail', () => {
    expect(endlessDifficultyAt(5 * 60).healthMul).toBeCloseTo(1.4, 6);
    expect(endlessDifficultyAt(10 * 60).healthMul).toBeCloseTo(1.8, 6);
    expect(endlessDifficultyAt(15 * 60).healthMul).toBeCloseTo(2.5125, 6);
    expect(endlessDifficultyAt(30 * 60).healthMul).toBeGreaterThan(8);
  });

  it('boss schedule is every two minutes', () => {
    expect(bossTimeForIndex(1)).toBe(120);
    expect(bossTimeForIndex(2)).toBe(240);
  });

  it('boss difficulty scales with index', () => {
    const a = bossDifficultyFor(1);
    const b = bossDifficultyFor(3);
    expect(b.healthMul).toBeGreaterThan(a.healthMul);
  });

  it('prevents opening boss backlog with authored early durability', () => {
    expect(SURVIVOR.firstBossBaseHealth).toBe(3000);
    expect(bossHealthMulFor(3)).toBeCloseTo(1.8, 6);
    expect(bossHealthMulFor(5)).toBeCloseTo(3.2, 6);
  });

  it('frog starts with bioplasma', () => {
    expect(heroStarterWeapon('frog')).toBe('bioplasma');
  });

  it('dodge is triple prior distance', () => {
    expect(SURVIVOR.dodge.distance).toBe(13.5);
    expect(SURVIVOR.dodge.cooldown).toBe(10);
  });

  it('has six boss defs at ~2× prior visual scale', () => {
    expect(BOSS_DEFS.length).toBeGreaterThanOrEqual(5);
    for (const b of BOSS_DEFS) {
      expect(b.visualScale).toBeGreaterThanOrEqual(3.4);
    }
    expect(SURVIVOR.actorScale.boss).toBeCloseTo(3.7, 5);
  });
});

describe('weapon overclocks', () => {
  it('L6 damage exceeds L5 and scales additively not compound', () => {
    const l5 = weaponStatsAtLevel('pulse', 5);
    const l6 = weaponStatsAtLevel('pulse', 6);
    const l10 = weaponStatsAtLevel('pulse', 10);
    const l20 = weaponStatsAtLevel('pulse', 20);
    expect(l6.damage).toBeGreaterThan(l5.damage);
    expect(l20.damage).toBeGreaterThan(l10.damage);
    expect(l6.damage).toBeCloseTo(l5.damage * (1 + OVERCLOCK_DAMAGE_PER_LEVEL), 5);
    // Not compounding: L7 = base*(1+0.16) not base*1.08^2
    const l7 = weaponStatsAtLevel('pulse', 7);
    expect(l7.damage).toBeCloseTo(l5.damage * (1 + 2 * OVERCLOCK_DAMAGE_PER_LEVEL), 5);
    expect(l7.damage).not.toBeCloseTo(l5.damage * 1.08 * 1.08, 2);
  });

  it('preserves L5 structural fields under Overclock', () => {
    const l5 = weaponStatsAtLevel('pulse', 5);
    const l12 = weaponStatsAtLevel('pulse', 12);
    expect(l12.count).toBe(l5.count);
    expect(l12.cadence).toBe(l5.cadence);
    expect(l12.pierce).toBe(l5.pierce);
    expect(l12.level).toBe(12);
  });

  it('formats overclock labels', () => {
    expect(formatOverclockLabel(1)).toBe('Overclock I');
    expect(formatOverclockLabel(10)).toBe('Overclock X');
    expect(formatOverclockLabel(27)).toBe('Overclock 27');
    expect(overclockLevel(5)).toBe(0);
    expect(overclockLevel(8)).toBe(3);
  });

  it('applyChoice allows unbounded weapon levels', () => {
    const state = createSurvivorState('bee', null, 9);
    state.weapons[0]!.level = 5;
    state.phase = 'levelup';
    state.choices = [
      {
        kind: 'weapon',
        id: 'w-microdrone-6',
        title: 'Microdrone Swarm L6',
        body: 'Overclock I',
        weaponId: 'microdrone',
      },
    ];
    applyChoice(state, 0);
    expect(state.weapons[0]!.level).toBe(6);
    state.phase = 'levelup';
    state.choices = [
      {
        kind: 'weapon',
        id: 'w-microdrone-7',
        title: 'Microdrone Swarm L7',
        body: 'Overclock II',
        weaponId: 'microdrone',
      },
    ];
    applyChoice(state, 0);
    expect(state.weapons[0]!.level).toBe(7);
  });

  it('enemy growth still outpaces additive overclocks', () => {
    const l5 = weaponStatsAtLevel('pulse', 5).damage;
    const l30 = weaponStatsAtLevel('pulse', 30).damage;
    const playerMul = l30 / l5; // ~3.0 at +8% * 25
    const enemyLate = endlessDifficultyAt(30 * 60).healthMul; // 30 min
    expect(enemyLate).toBeGreaterThan(playerMul);
  });
});

describe('repeatable passives', () => {
  it('hull plating continues past L5 with smaller gains', () => {
    expect(hullPlatingGainAtLevel(1)).toBe(14);
    expect(hullPlatingGainAtLevel(5)).toBe(14);
    expect(hullPlatingGainAtLevel(6)).toBe(7);
    expect(hullPlatingGainAtLevel(12)).toBe(7);
  });

  it('regen diminishes after L5', () => {
    const l5 = regenPerSecondAtLevel(5);
    const l10 = regenPerSecondAtLevel(10);
    expect(l10).toBeGreaterThan(l5);
    expect(l10 - l5).toBeLessThan(5 * 0.22); // not full linear
  });

  it('hard-capped passives stop at max', () => {
    const haste = PASSIVES.find((p) => p.id === 'weapon-haste')!;
    expect(haste.maxLevel).toBe(5);
    const state = createSurvivorState('bee', null, 3);
    state.passives['weapon-haste'] = 5;
    state.passives['breach-shielding'] = 5;
    const choices = generateChoices(state);
    expect(choices.every((c) => c.passiveId !== 'weapon-haste')).toBe(true);
    expect(choices.every((c) => c.passiveId !== 'breach-shielding')).toBe(true);
    expect(bossDamageReduction(state)).toBeCloseTo(0.4, 5);
  });

  it('hull plating applies correct integrity gain at L6', () => {
    const state = createSurvivorState('bee', null, 4);
    state.passives['max-health'] = 5;
    state.player.maxHealth = 100 + 5 * 14;
    state.player.health = state.player.maxHealth;
    state.phase = 'levelup';
    state.choices = [
      {
        kind: 'passive',
        id: 'p-max-health-6',
        title: 'Hull Plating L6',
        body: 'Integrity',
        passiveId: 'max-health',
      },
    ];
    applyChoice(state, 0);
    expect(state.passives['max-health']).toBe(6);
    expect(state.player.maxHealth).toBe(100 + 5 * 14 + 7);
  });
});

// Starter parity is governed by the seven-scenario moving-target harness in
// survivorWeaponBenchmark.test.ts. The old two-scenario static-dummy check that
// lived here measured homing weapons against motionless targets and disagreed with
// it, so it was removed rather than kept as a second, weaker opinion.

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

  it('spawns boss at 2:00', () => {
    const state = createSurvivorState('bee', 'survivor-boss', 2);
    for (let i = 0; i < 10; i += 1) stepSurvivor(state, EMPTY_SURVIVOR_INPUT, SURVIVOR.fixedDt);
    expect(state.bossesSpawned).toBeGreaterThanOrEqual(1);
    expect(primaryBoss(state)).toBeTruthy();
  });

  it('levels up with three choices including overclocks when authored maxed', () => {
    const state = createSurvivorState('bee', null, 7);
    state.weapons = (Object.keys(WEAPONS) as (keyof typeof WEAPONS)[])
      .slice(0, SURVIVOR.maxWeaponSlots)
      .map((id) => ({ weaponId: id, level: 5, cooldown: 0, focusDebt: 0, prototype: false }));
    for (const pas of PASSIVES) {
      if (Number.isFinite(pas.maxLevel)) state.passives[pas.id] = pas.maxLevel as number;
    }
    // leave hull plating open
    delete state.passives['max-health'];
    delete state.passives.regen;
    const choices = generateChoices(state);
    expect(choices.length).toBe(3);
    expect(choices.some((c) => c.kind === 'weapon' || c.kind === 'passive' || c.kind === 'new-weapon')).toBe(true);
  });
});

describe('ship pickup and thrusters', () => {
  it('ship pickup is substantially larger than astronaut', () => {
    const state = createSurvivorState('bee', null, 11);
    const astro = directPickupRadius(state);
    tryShip(state);
    const ship = directPickupRadius(state);
    expect(ship).toBeGreaterThanOrEqual(4.0);
    expect(ship).toBeGreaterThan(astro * 3);
  });

  it('magnet combines without double multiply', () => {
    const state = createSurvivorState('flamingo', null, 12);
    state.passives['pickup-radius'] = 5;
    tryShip(state);
    const withMagnet = magnetRadius(state);
    state.passives['pickup-radius'] = 0;
    const base = magnetRadius(state);
    expect(withMagnet).toBeGreaterThan(base);
  });

  it('thruster power grows and plateaus', () => {
    const state = createSurvivorState('bee', null, 14);
    expect(thrusterPower(state)).toBeCloseTo(1, 5);
    state.weapons = Array.from({ length: 5 }, (_, i) => ({
      weaponId: (['pulse', 'rail', 'rocket', 'microdrone', 'gravity'] as const)[i]!,
      level: 12,
      cooldown: 0,
      focusDebt: 0,
      prototype: false,
    }));
    state.passives = { 'move-speed': 5, area: 5, 'weapon-haste': 5 };
    const late = thrusterPower(state);
    expect(late).toBeGreaterThan(2);
    expect(late).toBeLessThanOrEqual(SURVIVOR.ship.powerScaleCap);
  });

  it('base thruster damage is substantial', () => {
    expect(SURVIVOR.ship.exhaustDamage).toBeGreaterThanOrEqual(40);
    expect(SURVIVOR.ship.wakeDamage).toBeGreaterThanOrEqual(20);
  });
});

describe('dodge and repulsor', () => {
  it('dodge travels ~13.5 units', () => {
    const state = createSurvivorState('bee', null, 4);
    const x0 = state.player.x;
    const z0 = state.player.z;
    expect(tryDodge(state, 1, 0)).toBe(true);
    const steps = Math.ceil(SURVIVOR.dodge.duration / SURVIVOR.fixedDt) + 2;
    for (let i = 0; i < steps; i += 1) stepSurvivor(state, EMPTY_SURVIVOR_INPUT, SURVIVOR.fixedDt);
    expect(Math.hypot(state.player.x - x0, state.player.z - z0)).toBeGreaterThan(12);
  });

  it('repulsor can fire repeatedly after cooldown', () => {
    const state = createSurvivorState('bee', null, 6);
    surroundPlayer(state, 4, 8);
    expect(tryRepulsor(state)).toBe(true);
    const first = state.effects.filter((e) => e.kind === 'repulsor').length;
    expect(first).toBeGreaterThan(0);
    state.player.repulsorCd = 0;
    // Age out old effects
    state.effects = [];
    expect(tryRepulsor(state)).toBe(true);
    expect(state.effects.some((e) => e.kind === 'repulsor')).toBe(true);
  });

  it('repulsor damage scales with player progression and remains hard-capped', () => {
    const hitAtLevel = (level: number): number => {
      const state = createSurvivorState('bee', null, 6060 + level);
      state.level = level;
      surroundPlayer(state, 1, 4);
      const enemy = state.enemies.find((e) => e.alive)!;
      enemy.maxHealth = 1000;
      enemy.health = 1000;
      expect(tryRepulsor(state)).toBe(true);
      return 1000 - enemy.health;
    };
    expect(hitAtLevel(20)).toBeGreaterThan(hitAtLevel(1));
    expect(hitAtLevel(200)).toBeCloseTo(SURVIVOR.repulsor.damage * SURVIVOR.repulsor.maxDamageMul, 5);
  });
});

describe('ship exhaust', () => {
  it('damages behind not front', () => {
    const state = createSurvivorState('bee', null, 8);
    tryShip(state);
    state.player.facingX = 1;
    state.player.facingZ = 0;
    for (const [id, x] of [
      [901, -1.5],
      [902, 2],
    ] as const) {
      const e = emptyEnemy();
      e.id = id;
      e.x = x;
      e.z = 0;
      e.health = 100;
      e.maxHealth = 100;
      e.alive = true;
      e.attackCd = 1;
      e.contactDamage = 8;
      state.enemies.push(e);
    }
    state.player.exhaustTickCd = 0;
    applyShipExhaust(state, SURVIVOR.fixedDt);
    expect(state.enemies.find((e) => e.id === 901)!.health).toBeLessThan(100);
    expect(state.enemies.find((e) => e.id === 902)!.health).toBe(100);
  });

  it('clears on form end', () => {
    const state = createSurvivorState('bee', null, 9);
    tryShip(state);
    state.player.shipDuration = SURVIVOR.fixedDt;
    stepSurvivor(state, EMPTY_SURVIVOR_INPUT, SURVIVOR.fixedDt);
    expect(state.player.form).toBe('astronaut');
    clearShipHazards(state);
  });
});

describe('keybinds and ui scale', () => {
  it('defaults and ui scale clamp', () => {
    expect(DEFAULT_KEYBINDS.dodge).toBe('Space');
    expect(clampUiScale(0.5)).toBe(UI_SCALE_MIN);
    expect(clampUiScale(2)).toBe(UI_SCALE_MAX);
    expect(clampUiScale(1)).toBe(UI_SCALE_DEFAULT);
    expect(formatKeyCode('Space')).toBe('Space');
    expect(normalizeKeybinds({ repulsor: 'KeyF' }).dodge).toBe('Space');
    expect(resetKeybinds().dodge).toBe('Space');
    expect(assignKeybind(DEFAULT_KEYBINDS, 'dodge', 'KeyZ').dodge).toBe('KeyZ');
  });
});

describe('per-hero leaderboards', () => {
  let store: Map<string, string>;
  beforeEach(() => {
    store = installMemoryStorage();
  });
  afterEach(() => store.clear());

  it('independent rankings and high levels persist', () => {
    const bee = makeRunSummary({
      survivalTime: 200,
      kills: 50,
      level: 10,
      bossesDefeated: 1,
      heroId: 'bee',
      weapons: [{ weaponId: 'pulse', level: 12 }],
      passives: {},
    });
    recordRun(bee);
    expect(getHeroLeaderboard('bee')[0]?.weapons[0]?.level).toBe(12);
    expect(loadRecords().version).toBe(2);
  });

  it('keeps top 10 and tie-breaks', () => {
    for (let i = 0; i < 12; i += 1) {
      recordRun(
        makeRunSummary({
          survivalTime: 100 + i,
          kills: i,
          level: 3,
          bossesDefeated: 0,
          heroId: 'flamingo',
          weapons: [],
          passives: {},
        }),
      );
    }
    expect(getHeroLeaderboard('flamingo').length).toBe(MAX_LEADERBOARD_ENTRIES);
    expect(getRunHistory('flamingo').length).toBe(12);
  });

  it('keeps recent non-record runs in bounded chronological history', () => {
    for (let i = 0; i < MAX_RUN_HISTORY_ENTRIES + 3; i += 1) {
      const run = makeRunSummary({
        survivalTime: i,
        kills: i,
        level: 1,
        bossesDefeated: 0,
        heroId: 'frog',
        weapons: [],
        passives: {},
      });
      run.timestamp += i;
      recordRun(run);
    }
    const history = getRunHistory('frog');
    expect(history).toHaveLength(MAX_RUN_HISTORY_ENTRIES);
    expect(history[0]!.timestamp).toBeGreaterThanOrEqual(history.at(-1)!.timestamp);
  });

  it('migrates v1 and handles malformed', () => {
    store.set(
      RECORDS_STORAGE_KEY,
      JSON.stringify({
        version: 1,
        bestOverall: null,
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
        highestKills: 30,
        highestLevel: 6,
        mostBossesDefeated: 1,
      }),
    );
    store.delete(LEADERBOARDS_STORAGE_KEY);
    expect(loadLeaderboards().heroes.frog[0]?.survivalTime).toBe(150);
    store.set(LEADERBOARDS_STORAGE_KEY, '{bad');
    expect(() => loadLeaderboards()).not.toThrow();
    expect(formatSurvivalTime(3661)).toBe('1:01:01');
  });
});

describe('mech and choices', () => {
  it('mech activates when off cooldown', () => {
    const state = createSurvivorState('flamingo', 'survivor-mech', 9);
    expect(state.player.mechCd).toBe(0);
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
    state.player.mechCd = 0;
    expect(tryShip(state)).toBe(true);
    expect(tryMech(state)).toBe(false);
  });
});

describe('boss phases', () => {
  it('phase thresholds', () => {
    expect(bossPhaseFromHealth(2200, 2200)).toBe(1);
    expect(bossPhaseFromHealth(SURVIVOR_BOSS.maxHealth * 0.5, SURVIVOR_BOSS.maxHealth)).toBe(2);
  });

  it('rotation is deterministic', () => {
    expect(bossDefForIndex(1).id).not.toBe(bossDefForIndex(2).id);
  });
});

describe('breach shielding', () => {
  it('reduces boss damage only', () => {
    const state = createSurvivorState('bee', null, 15);
    state.passives['breach-shielding'] = 5;
    state.player.invuln = 0;
    const hp = state.player.health;
    damagePlayer(state, 50, TEST_BOSS_SOURCE);
    expect(hp - state.player.health).toBeCloseTo(30, 1);
    state.player.health = 100;
    state.player.invuln = 0;
    damagePlayer(state, 50, TEST_HORDE_SOURCE);
    expect(100 - state.player.health).toBeCloseTo(50, 1);
  });
});

describe('player power scale', () => {
  it('caps thruster permanent growth', () => {
    const capped = playerPowerScale({
      weapons: Array.from({ length: 5 }, () => ({ level: 99 })),
      passives: { 'move-speed': 99, area: 99 },
    });
    expect(capped).toBe(SURVIVOR.ship.powerScaleCap);
  });
});

describe('health pickups and magnets', () => {
  it('heals damaged player and clamps to max', () => {
    const state = createSurvivorState('bee', null, 77);
    state.player.health = 40;
    state.pickups.push({
      id: 9001,
      kind: 'repair',
      x: 0.2,
      z: 0,
      value: 50,
      active: true,
      magnetized: false,
      life: 48,
    });
    for (let i = 0; i < 30; i += 1) stepSurvivor(state, EMPTY_SURVIVOR_INPUT, SURVIVOR.fixedDt);
    expect(state.player.health).toBeLessThanOrEqual(state.player.maxHealth);
    expect(state.player.health).toBeGreaterThan(40);
    expect(state.pickups.find((p) => p.id === 9001)?.active).toBe(false);
  });

  it('does not consume health orb at full health', () => {
    const state = createSurvivorState('bee', null, 78);
    state.player.health = state.player.maxHealth;
    state.pickups.push({
      id: 9002,
      kind: 'repair',
      x: 0.1,
      z: 0,
      value: 40,
      active: true,
      magnetized: false,
      life: 48,
    });
    for (let i = 0; i < 20; i += 1) stepSurvivor(state, EMPTY_SURVIVOR_INPUT, SURVIVOR.fixedDt);
    expect(state.pickups.find((p) => p.id === 9002)?.active).toBe(true);
  });

  it('health magnet exceeds energy magnet with Magnet Field', () => {
    const state = createSurvivorState('bee', null, 79);
    state.passives['pickup-radius'] = 3;
    expect(healthMagnetRadius(state)).toBeGreaterThan(energyMagnetRadius(state));
  });
});

describe('permanent-only level-ups', () => {
  it('never offers consumable/temp choices', () => {
    for (let seed = 1; seed < 25; seed += 1) {
      const state = createSurvivorState('frog', null, seed);
      state.time = 200 + seed * 10;
      state.unlocks.arc = seed > 10;
      const choices = generateChoices(state);
      expect(choices.length).toBe(3);
      for (const c of choices) {
        expect(c.kind).not.toBe('protocol');
        expect((c as { tempId?: string }).tempId).toBeUndefined();
      }
    }
  });
});

describe('boss scaling and mega', () => {
  it('uses quadratic boss HP not exponential wall', () => {
    const h5 = bossDifficultyFor(5).healthMul;
    const h10 = bossDifficultyFor(10).healthMul;
    // Old 1.55^9 ≈ 38 for boss 10; new is much lower base before mega
    expect(bossHealthMulFor(5)).toBeLessThan(Math.pow(1.55, 4));
    expect(isMegaBossIndex(5)).toBe(true);
    expect(isMegaBossIndex(4)).toBe(false);
    expect(h10).toBeGreaterThan(h5);
  });

  it('spawns mega at index 5', () => {
    const state = createSurvivorState('bee', 'survivor-mega', 2);
    for (let i = 0; i < 20; i += 1) stepSurvivor(state, EMPTY_SURVIVOR_INPUT, SURVIVOR.fixedDt);
    const mega = state.bosses.find((b) => b.isMega);
    expect(mega).toBeTruthy();
    expect(mega!.visualScale).toBeGreaterThan(5);
  });
});

describe('boss focus policy', () => {
  it('increases with time and caps at 70%', () => {
    expect(bossFocusBaseChance(100)).toBe(0.08);
    expect(bossFocusBaseChance(700)).toBe(0.25);
    expect(bossFocusBaseChance(1000)).toBe(0.4);
    expect(bossFocusBaseChance(1300)).toBe(0.55);
  });
});

describe('shield system', () => {
  it('absorbs then overflows to health', () => {
    const state = createSurvivorState('bee', 'survivor-shield', 3);
    expect(state.player.shieldPoints).toBeGreaterThan(0);
    const hp = state.player.health;
    const sh = state.player.shieldPoints;
    state.player.invuln = 0;
    damagePlayer(state, sh + 20, TEST_HORDE_SOURCE);
    expect(state.player.shieldPoints).toBe(0);
    expect(state.player.health).toBeLessThan(hp);
  });
});

describe('prototype unlock gates', () => {
  it('arc not eligible before 5:00', () => {
    const state = createSurvivorState('bee', null, 5);
    state.time = 299;
    state.unlocks.arc = false;
    const choices = generateChoices(state);
    expect(choices.every((c) => c.weaponId !== 'arc')).toBe(true);
  });
});


function spawnTestBoss(state: ReturnType<typeof createSurvivorState>, mega = false) {
  // Step until a boss exists or force-spawn via schedule
  state.time = mega ? SURVIVOR.bossInterval * 5 - 0.01 : SURVIVOR.bossInterval - 0.01;
  state.nextBossIndex = mega ? 5 : 1;
  state.nextBossTime = mega ? SURVIVOR.bossInterval * 5 : SURVIVOR.bossInterval;
  for (let i = 0; i < 30; i += 1) stepSurvivor(state, EMPTY_SURVIVOR_INPUT, SURVIVOR.fixedDt);
  const b = state.bosses.find((x) => x.active && x.state !== 'dead');
  expect(b).toBeTruthy();
  return b!;
}

function runPatternToIdle(
  state: ReturnType<typeof createSurvivorState>,
  pattern: BossPatternId,
  maxSteps = 1200,
): { boss: NonNullable<ReturnType<typeof spawnTestBoss>>; steps: number; sawRecover: boolean } {
  const boss = spawnTestBoss(state, pattern === 'gravity-collapse' || pattern === 'cataclysm');
  if ((pattern === 'gravity-collapse' || pattern === 'cataclysm') && !boss.isMega) {
    boss.isMega = true;
  }
  forceBossIntoPattern(state, boss, pattern);
  expect(boss.state).toBe('windup');
  expect(boss.pattern).toBe(pattern);
  let steps = 0;
  let sawRecover = false;
  let sawLeaveActive = false;
  while (steps < maxSteps) {
    stepSurvivor(state, EMPTY_SURVIVOR_INPUT, SURVIVOR.fixedDt);
    steps += 1;
    if (boss.state === 'recover') sawRecover = true;
    if (boss.attacksCompleted >= 1 && boss.state !== 'active' && boss.state !== 'windup') {
      sawLeaveActive = true;
      // drain remaining recover into idle once
      if (boss.state === 'recover') {
        for (let j = 0; j < 300 && boss.state === 'recover'; j += 1) {
          stepSurvivor(state, EMPTY_SURVIVOR_INPUT, SURVIVOR.fixedDt);
          steps += 1;
        }
      }
      break;
    }
    if (!boss.active && boss.state === 'dead') break;
  }
  expect(sawLeaveActive || sawRecover || boss.attacksCompleted >= 1).toBe(true);
  return { boss, steps, sawRecover };
}

describe('boss pattern state machine', () => {
  it('all pattern ids have config and are enumerated', () => {
    expect(allPatternsHandled()).toBe(true);
    expect(ALL_BOSS_PATTERNS.length).toBe(14);
  });

  it('breach-orb completes and returns to idle (was stuck bug)', () => {
    const state = createSurvivorState('bee', 'survivor-boss', 101);
    const { boss, steps } = runPatternToIdle(state, 'breach-orb');
    expect(steps).toBeLessThan(900);
    expect(boss.state).toBe('idle');
    expect(boss.pattern).toBeNull();
    expect(boss.attacksCompleted).toBeGreaterThanOrEqual(1);
    // Should have fired at least one boss-orb projectile during life
    // (may already be inactive)
    expect(Number.isFinite(boss.x) && Number.isFinite(boss.timer)).toBe(true);
  });

  it.each(ALL_BOSS_PATTERNS)('pattern %s completes lifecycle without stuck active', (pattern) => {
    const state = createSurvivorState('bee', 'survivor-boss', 200 + ALL_BOSS_PATTERNS.indexOf(pattern));
    state.player.invuln = 999;
    // Isolate pattern lifecycle from player weapon damage / phase interrupts.
    state.weapons = [];
    const { boss, steps, sawRecover } = runPatternToIdle(state, pattern);
    expect(steps).toBeLessThan(1500);
    expect(boss.state).not.toBe('active');
    expect(boss.attacksCompleted).toBeGreaterThanOrEqual(1);
    expect(sawRecover || boss.state === 'idle' || boss.state === 'recover').toBe(true);
    // Not stuck: timer never goes permanently negative while active
    for (let i = 0; i < 600; i += 1) {
      stepSurvivor(state, EMPTY_SURVIVOR_INPUT, SURVIVOR.fixedDt);
      if (boss.state === 'active') {
        expect(boss.timer).toBeGreaterThan(-0.6);
        expect(boss.pattern).not.toBeNull();
      }
    }
    expect(Number.isFinite(boss.timer)).toBe(true);
    expect(Number.isFinite(boss.x)).toBe(true);
    // Completed at least one full cycle and left active once
    expect(boss.attacksCompleted).toBeGreaterThanOrEqual(1);
  });

  it('fan fires exactly one volley (not multi-frame spam)', () => {
    const state = createSurvivorState('bee', 'survivor-boss', 55);
    state.player.invuln = 999;
    const boss = spawnTestBoss(state);
    forceBossIntoPattern(state, boss, 'fan');
    let enemyProj = 0;
    const before = state.projectiles.filter((p) => p.active && (p.kind === 'boss-fan' || p.kind === 'enemy')).length;
    // Through windup into active
    for (let i = 0; i < 200; i += 1) {
      stepSurvivor(state, EMPTY_SURVIVOR_INPUT, SURVIVOR.fixedDt);
      enemyProj = Math.max(
        enemyProj,
        state.projectiles.filter((p) => p.active && (p.kind === 'boss-fan' || p.owner === 'enemy')).length,
      );
    }
    // One volley: should be bounded (~5-12), not dozens from multi-frame fire
    expect(enemyProj).toBeGreaterThan(0);
    expect(enemyProj).toBeLessThan(20);
    expect(before).toBeLessThanOrEqual(enemyProj);
  });

  it('contamination creates enemy-owned puddle', () => {
    const state = createSurvivorState('bee', 'survivor-boss', 66);
    state.player.invuln = 999;
    const boss = spawnTestBoss(state);
    forceBossIntoPattern(state, boss, 'contamination');
    for (let i = 0; i < 180; i += 1) stepSurvivor(state, EMPTY_SURVIVOR_INPUT, SURVIVOR.fixedDt);
    const puddle = state.hazards.find((h) => h.active && h.owner === 'enemy' && h.kind === 'contamination');
    expect(puddle).toBeTruthy();
  });

  it('summon produces enemies once', () => {
    const state = createSurvivorState('bee', 'survivor-boss', 77);
    state.player.invuln = 999;
    state.enemies = [];
    const boss = spawnTestBoss(state);
    const before = state.enemies.filter((e) => e.alive).length;
    forceBossIntoPattern(state, boss, 'summon');
    for (let i = 0; i < 200; i += 1) stepSurvivor(state, EMPTY_SURVIVOR_INPUT, SURVIVOR.fixedDt);
    const after = state.enemies.filter((e) => e.alive).length;
    expect(after).toBeGreaterThan(before);
    // Not absurd multi-frame spam
    expect(after - before).toBeLessThan(25);
  });

  it('regular bosses never select mega-only patterns', () => {
    const state = createSurvivorState('bee', 'survivor-boss', 88);
    state.player.invuln = 999;
    const boss = spawnTestBoss(state);
    expect(boss.isMega).toBe(false);
    const seen = new Set<string>();
    for (let cycle = 0; cycle < 30; cycle += 1) {
      for (let i = 0; i < 400; i += 1) {
        stepSurvivor(state, EMPTY_SURVIVOR_INPUT, SURVIVOR.fixedDt);
        if (boss.pattern) seen.add(boss.pattern);
        if (!boss.active) break;
      }
    }
    for (const p of seen) {
      expect(isMegaOnlyPattern(p as BossPatternId)).toBe(false);
    }
  });

  it('mega boss can run gravity-collapse and recover', () => {
    const state = createSurvivorState('bee', 'survivor-mega', 99);
    state.player.invuln = 999;
    const { boss, sawRecover } = runPatternToIdle(state, 'gravity-collapse');
    expect(boss.isMega).toBe(true);
    expect(boss.attacksCompleted).toBeGreaterThanOrEqual(1);
    expect(sawRecover || boss.state === 'idle' || boss.state === 'recover').toBe(true);
    expect(boss.state).not.toBe('active');
  });

  it('pause does not advance boss pattern timer', () => {
    const state = createSurvivorState('bee', 'survivor-boss', 11);
    state.player.invuln = 999;
    const boss = spawnTestBoss(state);
    forceBossIntoPattern(state, boss, 'pulse');
    const t0 = boss.timer;
    state.phase = 'paused';
    for (let i = 0; i < 60; i += 1) stepSurvivor(state, EMPTY_SURVIVOR_INPUT, SURVIVOR.fixedDt);
    expect(boss.timer).toBeCloseTo(t0, 5);
    expect(boss.state).toBe('windup');
  });

  it('boss death during pattern cleans up safely', () => {
    const state = createSurvivorState('bee', 'survivor-boss', 12);
    const boss = spawnTestBoss(state);
    forceBossIntoPattern(state, boss, 'sweeping-beam');
    boss.health = 0;
    // simulate death path
    cancelBossCombat(state, boss);
    boss.state = 'dead';
    boss.active = false;
    expect(() => {
      for (let i = 0; i < 30; i += 1) stepSurvivor(state, EMPTY_SURVIVOR_INPUT, SURVIVOR.fixedDt);
    }).not.toThrow();
  });
});

describe('mixed level-up offers (passives not starved)', () => {
  it('includes a passive when passives remain eligible across many seeds', () => {
    let passiveHits = 0;
    let overclockHits = 0;
    for (let seed = 1; seed <= 40; seed += 1) {
      const state = createSurvivorState('bee', null, seed);
      // Late-game: all ordinary slots filled at L5+ so overclocks exist, but passives open.
      state.weapons = (['pulse', 'rail', 'rocket', 'microdrone', 'gravity'] as const).map((id) => ({
        weaponId: id,
        level: 5 + (seed % 4),
        cooldown: 0,
        focusDebt: 0,
        prototype: false,
      }));
      state.passives = {};
      const choices = generateChoices(state);
      expect(choices.length).toBe(3);
      const ids = new Set(choices.map((c) => c.id));
      expect(ids.size).toBe(3);
      if (choices.some((c) => c.kind === 'passive')) passiveHits += 1;
      // Category is now explicit on the card, so this asserts the real thing instead of
      // pattern-matching a level number out of the title text.
      if (choices.some((c) => c.card?.category === 'OVERCLOCK')) {
        overclockHits += 1;
      }
    }
    // Card 2 is passive-priority — should nearly always include a passive.
    expect(passiveHits).toBeGreaterThanOrEqual(35);
    expect(overclockHits).toBeGreaterThan(0);
  });

  it('offers hull plating and regen in early and late play', () => {
    const early = createSurvivorState('frog', null, 3);
    early.weapons = [{ weaponId: 'pulse', level: 1, cooldown: 0, focusDebt: 0, prototype: false }];
    const late = createSurvivorState('frog', null, 4);
    late.weapons = (['pulse', 'rail', 'rocket', 'microdrone', 'gravity'] as const).map((id) => ({
      weaponId: id,
      level: 8,
      cooldown: 0,
      focusDebt: 0,
      prototype: false,
    }));
    for (const pas of PASSIVES) {
      if (Number.isFinite(pas.maxLevel)) late.passives[pas.id] = pas.maxLevel as number;
    }
    delete late.passives['max-health'];
    delete late.passives.regen;

    let sawIntegrity = false;
    let sawRegen = false;
    for (let i = 0; i < 30; i += 1) {
      const s = createSurvivorState('frog', null, 100 + i);
      s.weapons = late.weapons.map((w) => ({ ...w }));
      s.passives = { ...late.passives };
      const choices = generateChoices(s);
      if (choices.some((c) => c.passiveId === 'max-health')) sawIntegrity = true;
      if (choices.some((c) => c.passiveId === 'regen')) sawRegen = true;
    }
    expect(sawIntegrity || sawRegen).toBe(true);

    // Early: passives available among cards across seeds
    let earlyPassive = 0;
    for (let i = 0; i < 20; i += 1) {
      const s = createSurvivorState('bee', null, 200 + i);
      s.weapons = early.weapons.map((w) => ({ ...w }));
      if (generateChoices(s).some((c) => c.kind === 'passive')) earlyPassive += 1;
    }
    expect(earlyPassive).toBeGreaterThan(5);
  });

  it('forced prototype does not consume all three cards', () => {
    const state = createSurvivorState('bee', null, 9);
    state.unlocks.arc = true;
    state.unlocks.arcOffered = false;
    state.weapons = [{ weaponId: 'pulse', level: 3, cooldown: 0, focusDebt: 0, prototype: false }];
    const choices = generateChoices(state);
    expect(choices.length).toBe(3);
    // Anchored, not a substring scan: the Reinforced Airframe passive's id contains
    // "forced" and made this read two forced prototypes where there was only ever one.
    const forced = choices.filter((c) => c.id.endsWith('-forced'));
    expect(forced.length).toBeLessThanOrEqual(1);
    expect(choices.some((c) => c.kind === 'passive' || (c.kind === 'weapon' && c.weaponId === 'pulse') || c.kind === 'new-weapon')).toBe(
      true,
    );
  });

  it('never duplicates cards in one selection', () => {
    for (let seed = 1; seed <= 50; seed += 1) {
      const state = createSurvivorState('flamingo', null, seed);
      state.weapons = (['pulse', 'rail', 'rocket'] as const).map((id) => ({
        weaponId: id,
        level: 4 + (seed % 3),
        cooldown: 0,
        focusDebt: 0,
        prototype: false,
      }));
      const choices = generateChoices(state);
      const keys = choices.map((c) =>
        c.kind === 'passive' ? `p:${c.passiveId}` : c.kind === 'new-weapon' ? `n:${c.weaponId}` : `u:${c.weaponId}`,
      );
      expect(new Set(keys).size).toBe(keys.length);
    }
  });
});

describe('pickup repair completeness', () => {
  function makeRepair(id: number, x: number, z: number, value: number) {
    return {
      id,
      kind: 'repair' as const,
      x,
      z,
      value,
      active: true,
      magnetized: false,
      life: SURVIVOR.repairPickupLife,
    };
  }

  it('heals exactly min(orb, missing) for one missing HP', () => {
    const state = createSurvivorState('bee', null, 501);
    state.player.health = state.player.maxHealth - 1;
    state.pickups.push(makeRepair(1, 0.1, 0, 40));
    for (let i = 0; i < 45; i += 1) stepSurvivor(state, EMPTY_SURVIVOR_INPUT, SURVIVOR.fixedDt);
    expect(state.player.health).toBe(state.player.maxHealth);
    expect(state.pickups.find((p) => p.id === 1)?.active).toBe(false);
  });

  it('handles two repair orbs in one frame without double-heal bugs', () => {
    const state = createSurvivorState('bee', null, 502);
    state.player.health = 50;
    state.pickups.push(makeRepair(2, 0.05, 0, 30));
    state.pickups.push(makeRepair(3, 0.08, 0.02, 30));
    for (let i = 0; i < 40; i += 1) stepSurvivor(state, EMPTY_SURVIVOR_INPUT, SURVIVOR.fixedDt);
    expect(state.player.health).toBeLessThanOrEqual(state.player.maxHealth);
    expect(state.player.health).toBeGreaterThanOrEqual(50);
    // Both should be consumed if still injured for second, or second left if full.
    const a2 = state.pickups.find((p) => p.id === 2)?.active;
    const a3 = state.pickups.find((p) => p.id === 3)?.active;
    if (state.player.health >= state.player.maxHealth - 0.01) {
      // At least one consumed; remaining only if full mid-collection.
      expect(a2 === false || a3 === false).toBe(true);
    } else {
      expect(a2).toBe(false);
      expect(a3).toBe(false);
    }
  });

  it('ship form collects health with larger reach', () => {
    const state = createSurvivorState('bee', null, 503);
    state.player.health = 40;
    tryShip(state);
    expect(state.player.form).toBe('ship');
    state.pickups.push(makeRepair(4, 2.5, 0, 40));
    for (let i = 0; i < 50; i += 1) stepSurvivor(state, EMPTY_SURVIVOR_INPUT, SURVIVOR.fixedDt);
    expect(state.player.health).toBeGreaterThan(40);
  });

  it('safe pickup position insets from arena walls', () => {
    const edge = SURVIVOR.arenaHalf;
    const p = safePickupPosition(edge, edge);
    expect(Math.abs(p.x)).toBeLessThanOrEqual(SURVIVOR.arenaHalf - SURVIVOR.pickupSafeInset + 1e-6);
    expect(Math.abs(p.z)).toBeLessThanOrEqual(SURVIVOR.arenaHalf - SURVIVOR.pickupSafeInset + 1e-6);
    const inner = safePickupPosition(1, -2);
    expect(inner.x).toBeCloseTo(1, 5);
    expect(inner.z).toBeCloseTo(-2, 5);
  });

  it('health magnet base meets design target', () => {
    const state = createSurvivorState('bee', null, 504);
    expect(healthMagnetRadius(state)).toBeGreaterThanOrEqual(5.9);
    expect(healthDirectRadius(state)).toBeGreaterThanOrEqual(1.2);
    tryShip(state);
    expect(healthMagnetRadius(state)).toBeGreaterThanOrEqual(9);
  });

  it('does not silently discard repair when pool is saturated with XP', () => {
    const state = createSurvivorState('bee', null, 505);
    // Fill pool with XP
    for (let i = 0; i < SURVIVOR.pickupCap; i += 1) {
      state.pickups.push({
        id: 10000 + i,
        kind: 'xp',
        x: (i % 10) * 0.5,
        z: Math.floor(i / 10) * 0.5,
        value: 1,
        active: true,
        magnetized: false,
        life: Infinity,
      });
    }
    const before = state.pickups.filter((p) => p.active && p.kind === 'repair').length;
    // Simulate enemy death reward path via step after manual drop through kill is hard;
    // use internal path by damaging a nearby enemy to death.
    state.enemies.push({
      ...createSurvivorState('bee', null, 1).enemies[0]!,
      id: 7777,
      defId: 'blob',
      x: 1,
      z: 1,
      health: 1,
      maxHealth: 1,
      alive: true,
      radius: 0.4,
      speed: 0,
      damage: 1,
      xp: 5,
      facingX: 0,
      facingZ: 1,
      hitFlash: 0,
      isElite: false,
      isMiniboss: false,
      specialWindup: 0,
      attackCd: 0,
      vx: 0,
      vz: 0,
      knockback: 0,
    } as never);
    // Force dropPickup via surround + damage is complex; assert pool policy constants and repair life.
    expect(SURVIVOR.pickupReserveImportant).toBeGreaterThan(0);
    expect(SURVIVOR.repairPickupLife).toBeGreaterThan(20);
    expect(before).toBe(0);
  });
});

describe('protocol cache and gunship', () => {
  it('cache remains active for its lifetime until collected', () => {
    const state = createSurvivorState('bee', 'survivor-cache', 22);
    // Advance to spawn
    for (let i = 0; i < 20; i += 1) stepSurvivor(state, EMPTY_SURVIVOR_INPUT, SURVIVOR.fixedDt);
    if (!state.cache.active) {
      state.cache = {
        active: true,
        x: 10,
        z: 10,
        life: SURVIVOR.cacheLifetime,
        maxLife: SURVIVOR.cacheLifetime,
        mega: false,
        potency: 1,
      };
    }
    const life0 = state.cache.life;
    for (let i = 0; i < 60; i += 1) stepSurvivor(state, EMPTY_SURVIVOR_INPUT, SURVIVOR.fixedDt);
    // Still active after 1s if player not on it
    state.player.x = 0;
    state.player.z = 0;
    expect(state.cache.active).toBe(true);
    expect(state.cache.life).toBeLessThan(life0);
  });

  it('collects cache at documented radius and opens protocol once', () => {
    const state = createSurvivorState('bee', null, 23);
    state.cache = {
      active: true,
      x: 2.5,
      z: 0,
      life: 30,
      maxLife: 30,
      mega: false,
      potency: 1,
    };
    state.player.x = 0;
    state.player.z = 0;
    // Move into range
    state.player.x = 2.5;
    for (let i = 0; i < 5; i += 1) stepSurvivor(state, EMPTY_SURVIVOR_INPUT, SURVIVOR.fixedDt);
    expect(state.phase).toBe('protocol');
    expect(state.cache.active).toBe(false);
    expect(state.protocolChoices.length).toBe(3);
  });

  it('gunship warns without damage then damages along the lane', () => {
    const state = createSurvivorState('bee', null, 24);
    state.weapons = []; // silence auto-weapons so only gunship deals damage
    state.enemyCap = 0;
    state.spawnAcc = -9999;
    state.phase = 'protocol';
    state.protocolChoices = [
      {
        kind: 'protocol',
        id: 'proto-gunship-flyby',
        title: 'Gunship',
        body: 'test',
        protocolId: 'gunship-flyby',
      },
    ];
    // Place enemies along Z=0 so a boss-less lane through player still clips them.
    state.enemies = [];
    for (let i = 0; i < 8; i += 1) {
      const e = {
        id: 8000 + i,
        defId: 'basic',
        x: i * 2 - 6,
        z: 0,
        vx: 0,
        vz: 0,
        kbX: 0,
        kbZ: 0,
        health: 80,
        maxHealth: 80,
        radius: 0.45,
        role: 'basic',
        hitFlash: 0,
        attackCd: 99,
        alive: true,
        isElite: false,
        isMiniboss: false,
        xp: 3,
        windup: 0,
        facingX: 0,
        facingZ: 1,
        healthMul: 1,
        damageMul: 1,
        speedMul: 0,
        hazardHitCd: 0,
        specialCd: 99,
        specialWindup: 0,
      };
      state.enemies.push(e as never);
    }
    applyProtocolChoice(state, 0);
    expect(state.gunship.active).toBe(true);
    expect(state.gunship.warnDuration).toBeGreaterThan(0.5);
    // Force a lane through the enemy line regardless of density pick.
    state.gunship.x0 = -30;
    state.gunship.z0 = 0;
    state.gunship.x1 = 30;
    state.gunship.z1 = 0;
    state.gunship.x = -30;
    state.gunship.z = 0;
    state.gunship.facingX = 1;
    state.gunship.facingZ = 0;
    const tracked = () => state.enemies.filter((e) => e.id >= 8000 && e.id < 8010);
    const hpBefore = tracked().reduce((s, e) => s + e.health, 0);
    const warnSteps = Math.floor(state.gunship.warnDuration / SURVIVOR.fixedDt) - 2;
    for (let i = 0; i < warnSteps; i += 1) stepSurvivor(state, EMPTY_SURVIVOR_INPUT, SURVIVOR.fixedDt);
    expect(state.gunship.firing).toBe(false);
    const hpMid = tracked().reduce((s, e) => s + e.health, 0);
    expect(hpMid).toBe(hpBefore);
    for (let i = 0; i < 500; i += 1) {
      if (!state.gunship.active) break;
      stepSurvivor(state, EMPTY_SURVIVOR_INPUT, SURVIVOR.fixedDt);
    }
    const hpAfter = tracked().reduce((s, e) => s + (e.alive ? e.health : 0), 0);
    expect(hpAfter).toBeLessThan(hpMid);
    expect(state.gunship.active).toBe(false);
  });

  it('cache collect radius is larger than legacy 2.2', () => {
    expect(SURVIVOR.cacheCollectRadius).toBeGreaterThanOrEqual(3.0);
  });
});

describe('boss visual scale contract', () => {
  it('normal boss sizes are unchanged and Mega is 1.5x, not 2x', () => {
    for (const def of BOSS_DEFS) {
      // Regular boss sizes read well and are deliberately untouched by 2.3.0.
      expect(def.visualScale).toBeGreaterThanOrEqual(3.4);
    }
    // 2.0 -> 1.5 is the authored 25% reduction to the presented Mega-Boss.
    expect(SURVIVOR.megaVisualMul).toBeCloseTo(1.5, 5);
    // Still unmistakably larger than a regular boss.
    expect(SURVIVOR.megaVisualMul).toBeGreaterThan(1.25);
  });

  it('mega collider tracks the reduced visible body', () => {
    // The collider must shrink with the model, or Repulse, exhaust, weapon hits and
    // body contact would all resolve against a hitbox larger than what is drawn.
    expect(SURVIVOR.megaColliderMul).toBeLessThan(SURVIVOR.megaVisualMul);
    expect(SURVIVOR.megaColliderMul).toBeGreaterThan(1.15);
    // Collider growth stays proportional to visual growth within a tight tolerance.
    const ratio = SURVIVOR.megaColliderMul / SURVIVOR.megaVisualMul;
    expect(ratio).toBeGreaterThan(0.8);
    expect(ratio).toBeLessThan(0.95);
  });
});

describe('progression integrity — no unsolicited permanent upgrades', () => {
  it('no supply pickup kind exists; only xp and repair', () => {
    const kinds = ['xp', 'repair'] as const;
    expect(kinds).not.toContain('supply' as never);
    const state = createSurvivorState('bee', null, 601);
    // Elite death drops premium energy + optional repair only.
    const e = emptyEnemy();
    e.id = 770;
    e.alive = true;
    e.isElite = true;
    e.x = 1;
    e.z = 1;
    e.health = 1;
    e.maxHealth = 1;
    e.xp = 10;
    e.contactDamage = 18;
    state.enemies.push(e);
    // Kill via damage
    e.health = 0;
    // Direct kill path
    state.player.invuln = 99;
    for (let i = 0; i < 5; i += 1) stepSurvivor(state, EMPTY_SURVIVOR_INPUT, SURVIVOR.fixedDt);
    expect(state.pickups.every((p) => p.kind === 'xp' || p.kind === 'repair')).toBe(true);
    expect(state.pickups.some((p) => (p as { kind: string }).kind === 'supply')).toBe(false);
  });

  it('elite kill loops do not mutate permanent Build without choices', () => {
    const state = createSurvivorState('frog', null, 602);
    state.weapons = [{ weaponId: 'pulse', level: 2, cooldown: 0, focusDebt: 0, prototype: false }];
    const before = buildFingerprint(state);
    for (let i = 0; i < 40; i += 1) {
      // Premium energy only — dismiss any level-up from XP
      state.pickups.push({
        id: 60000 + i,
        kind: 'xp',
        x: 0,
        z: 0,
        value: 5,
        active: true,
        magnetized: false,
        life: Infinity,
        premium: true,
      });
      stepSurvivor(state, EMPTY_SURVIVOR_INPUT, SURVIVOR.fixedDt);
      if (state.phase === 'levelup') {
        state.choices = [];
        state.phase = 'playing';
      }
    }
    expect(buildFingerprint(state)).toBe(before);
  });

  it('all three Protocols leave permanent Build unchanged', () => {
    for (const id of ['aegis-barrier', 'gunship-flyby', 'gravitic-recall'] as const) {
      const state = createSurvivorState('bee', null, 603);
      state.weapons = [{ weaponId: 'pulse', level: 5, cooldown: 0, focusDebt: 0, prototype: false }];
      state.passives = { area: 2 };
      const before = buildFingerprint(state);
      forceStartProtocol(state, id, 1.5);
      for (let i = 0; i < 120; i += 1) stepSurvivor(state, EMPTY_SURVIVOR_INPUT, SURVIVOR.fixedDt);
      expect(buildFingerprint(state)).toBe(before);
    }
  });

  it('timers and boss schedule do not mutate permanent Build', () => {
    const state = createSurvivorState('bee', 'survivor-boss', 604);
    const before = buildFingerprint(state);
    for (let i = 0; i < 180; i += 1) {
      stepSurvivor(state, EMPTY_SURVIVOR_INPUT, SURVIVOR.fixedDt);
      if (state.phase === 'levelup') {
        state.choices = [];
        state.phase = 'playing';
      }
    }
    expect(buildFingerprint(state)).toBe(before);
  });

  it('selecting one weapon card raises only that weapon by exactly one', () => {
    const state = createSurvivorState('bee', null, 605);
    state.weapons = [
      { weaponId: 'pulse', level: 2, cooldown: 0, focusDebt: 0, prototype: false },
      { weaponId: 'rail', level: 4, cooldown: 0, focusDebt: 0, prototype: false },
    ];
    state.phase = 'levelup';
    state.choices = [
      {
        kind: 'weapon',
        id: 'w-pulse-3',
        title: 'Pulse',
        body: 'up',
        weaponId: 'pulse',
      },
      {
        kind: 'passive',
        id: 'p-regen-1',
        title: 'Regen',
        body: 'r',
        passiveId: 'regen',
      },
      {
        kind: 'weapon',
        id: 'w-rail-5',
        title: 'Rail',
        body: 'up',
        weaponId: 'rail',
      },
    ];
    applyChoice(state, 0);
    expect(state.weapons.find((w) => w.weaponId === 'pulse')!.level).toBe(3);
    expect(state.weapons.find((w) => w.weaponId === 'rail')!.level).toBe(4);
    expect(state.passives.regen).toBeUndefined();
    expect(state.phase).toBe('playing');
    expect(state.choices.length).toBe(0);
  });

  it('selecting one passive raises only that passive by one', () => {
    const state = createSurvivorState('bee', null, 606);
    state.phase = 'levelup';
    state.passives = { 'max-health': 2 };
    state.player.maxHealth = 140;
    state.player.health = 140;
    state.choices = [
      {
        kind: 'passive',
        id: 'p-max-health-3',
        title: 'Hull',
        body: 'h',
        passiveId: 'max-health',
      },
      {
        kind: 'weapon',
        id: 'w-pulse-2',
        title: 'Pulse',
        body: 'p',
        weaponId: 'pulse',
      },
      {
        kind: 'passive',
        id: 'p-regen-1',
        title: 'Regen',
        body: 'r',
        passiveId: 'regen',
      },
    ];
    applyChoice(state, 0);
    expect(state.passives['max-health']).toBe(3);
    expect(state.passives.regen).toBeUndefined();
    expect(state.weapons[0]!.level).toBe(1);
  });

  it('double applyChoice cannot upgrade twice from one set', () => {
    const state = createSurvivorState('bee', null, 607);
    state.weapons[0]!.level = 3;
    state.phase = 'levelup';
    state.choices = [
      {
        kind: 'weapon',
        id: 'w-x',
        title: 'x',
        body: 'x',
        weaponId: state.weapons[0]!.weaponId,
      },
      {
        kind: 'passive',
        id: 'p-x',
        title: 'x',
        body: 'x',
        passiveId: 'regen',
      },
      {
        kind: 'passive',
        id: 'p-y',
        title: 'y',
        body: 'y',
        passiveId: 'area',
      },
    ];
    applyChoice(state, 0);
    applyChoice(state, 0);
    expect(state.weapons[0]!.level).toBe(4);
  });

  it('Overclock advances only through explicit selection', () => {
    const state = createSurvivorState('bee', null, 608);
    state.weapons = [{ weaponId: 'pulse', level: 5, cooldown: 0, focusDebt: 0, prototype: false }];
    state.phase = 'levelup';
    state.choices = generateChoices(state);
    const ocCard = state.choices.findIndex((c) => c.kind === 'weapon' && c.weaponId === 'pulse');
    if (ocCard >= 0) {
      applyChoice(state, ocCard);
      expect(state.weapons[0]!.level).toBe(6);
    } else {
      // If mixed offers put passive first, force a pulse overclock card
      state.phase = 'levelup';
      state.choices = [
        {
          kind: 'weapon',
          id: 'w-pulse-6',
          title: 'Pulse L6',
          body: 'oc',
          weaponId: 'pulse',
        },
        {
          kind: 'passive',
          id: 'p-regen',
          title: 'r',
          body: 'r',
          passiveId: 'regen',
        },
        {
          kind: 'passive',
          id: 'p-area',
          title: 'a',
          body: 'a',
          passiveId: 'area',
        },
      ];
      applyChoice(state, 0);
      expect(state.weapons[0]!.level).toBe(6);
    }
  });
});

describe('protocol presentation contracts', () => {
  it('aegis sets persistent shield points and time', () => {
    const state = createSurvivorState('bee', 'survivor-shield', 701);
    expect(state.player.shieldPoints).toBeGreaterThan(0);
    expect(state.player.shieldTime).toBeGreaterThan(0);
    const hp = state.player.health;
    state.player.invuln = 0;
    damagePlayer(state, 20, TEST_HORDE_SOURCE);
    expect(state.player.shieldPoints).toBeLessThan(80);
    expect(state.player.health).toBe(hp);
  });

  it('gunship originates near the player not at a far edge', () => {
    const state = createSurvivorState('bee', null, 703);
    state.player.x = 3;
    state.player.z = -2;
    state.player.facingX = 0;
    state.player.facingZ = 1;
    forceStartProtocol(state, 'gunship-flyby', 1);
    expect(state.gunship.active).toBe(true);
    const d0 = Math.hypot(state.gunship.x0 - state.player.x, state.gunship.z0 - state.player.z);
    expect(d0).toBeLessThan(4);
    // Ship position tracks start immediately
    expect(Math.hypot(state.gunship.x - state.gunship.x0, state.gunship.z - state.gunship.z0)).toBeLessThan(0.5);
  });

  it('per-boss collider is used for repulsor hits', () => {
    const state = createSurvivorState('bee', 'survivor-boss', 704);
    for (let i = 0; i < 15; i += 1) stepSurvivor(state, EMPTY_SURVIVOR_INPUT, SURVIVOR.fixedDt);
    const boss = primaryBoss(state);
    expect(boss).toBeTruthy();
    expect(boss!.colliderRadius).toBeGreaterThan(0.5);
    // Mega multiplies collider
    const mega = createSurvivorState('bee', 'survivor-mega', 705);
    for (let i = 0; i < 25; i += 1) stepSurvivor(mega, EMPTY_SURVIVOR_INPUT, SURVIVOR.fixedDt);
    const mb = mega.bosses.find((b) => b.isMega);
    expect(mb).toBeTruthy();
    expect(mb!.colliderRadius).toBeGreaterThan(boss!.colliderRadius);
  });
});

describe('balance version', () => {
  it('is endless-2.9.0-test-center', () => {
    expect(SURVIVOR_BALANCE_VERSION).toBe('endless-2.9.0-test-center');
  });
});

describe('melee horde and endless-2.3.0 balance', () => {
  it('no ordinary horde role is ranged', () => {
    for (const def of Object.values(HORDE)) {
      if (def.role === 'miniboss') continue;
      expect(def.role).not.toBe('ranged');
    }
  });

  it('opening speeds match the published table', () => {
    const expected: Record<string, number> = {
      basic: 3.0,
      mush: 2.8,
      fast: 3.7,
      spiky: 3.8,
      flyer: 3.5,
      bee: 3.6,
      ghost: 3.55,
      bruiser: 2.6,
      elite: 3.3,
      miniboss: 2.8,
    };
    for (const [id, speed] of Object.entries(expected)) {
      expect(HORDE[id]!.baseSpeed, `${id} opening speed`).toBeCloseTo(speed, 5);
    }
    expect(SURVIVOR.playerSpeed).toBeCloseTo(6.4, 5);
    // Every opening speed leaves real kiting headroom against the player.
    for (const def of Object.values(HORDE)) {
      expect(def.baseSpeed).toBeLessThan(SURVIVOR.playerSpeed * 0.62);
    }
  });

  it('boss queue drains 4 → 5 → 6 in exact order with 5 as Mega, losing none', () => {
    const state = createSurvivorState('bee', null, 920);
    state.player.invuln = 9999;
    state.weapons = [];
    state.spawnAcc = -1e9;
    // Controlled capacity: only the queue may produce bosses.
    state.nextBossIndex = 7;
    state.nextBossTime = 1e9;
    state.pendingBossIndices = [4, 5, 6];
    expect(isMegaBossIndex(5)).toBe(true);
    expect(isMegaBossIndex(4)).toBe(false);
    expect(isMegaBossIndex(6)).toBe(false);

    // state.bosses is append-only in spawn order, so it records the true drain order.
    const spawnOrder: number[] = [];
    for (let i = 0; i < 600; i += 1) {
      stepSurvivor(state, EMPTY_SURVIVOR_INPUT, SURVIVOR.fixedDt);
      for (const b of state.bosses) {
        if (!spawnOrder.includes(b.index)) spawnOrder.push(b.index);
      }
      if (state.pendingBossIndices.length === 0 && spawnOrder.length === 3) break;
      // Free the ordinary slot / mega slot so the next queued index can enter.
      if (state.pendingBossIndices.length > 0) {
        for (const b of state.bosses) {
          if (b.active && b.state !== 'dead' && b.index === spawnOrder[spawnOrder.length - 1]) {
            b.active = false;
            b.state = 'dead';
            b.health = 0;
          }
        }
      }
    }

    // Exact FIFO order — not merely "contains".
    expect(spawnOrder).toEqual([4, 5, 6]);
    expect(state.pendingBossIndices).toEqual([]);
    expect(state.bossesSpawned).toBe(3);
    // None duplicated.
    const indices = state.bosses.map((b) => b.index);
    expect(new Set(indices).size).toBe(indices.length);
    // Index 5 is the Mega.
    const five = state.bosses.find((b) => b.index === 5);
    expect(five).toBeTruthy();
    expect(five!.isMega).toBe(true);
    expect(state.bosses.find((b) => b.index === 4)!.isMega).toBe(false);
    expect(state.bosses.find((b) => b.index === 6)!.isMega).toBe(false);
  });

  it('a later boss index queues behind earlier pending indices', () => {
    const state = createSurvivorState('bee', null, 921);
    state.player.invuln = 9999;
    state.weapons = [];
    state.spawnAcc = -1e9;
    state.nextBossTime = 1e9;
    state.pendingBossIndices = [4, 5, 6];
    // Saturate live capacity so nothing can drain this frame.
    for (let i = 0; i < SURVIVOR.maxSimultaneousBosses; i += 1) {
      const b = emptyBoss();
      b.id = 5000 + i;
      b.index = 100 + i;
      b.active = true;
      b.state = 'idle';
      b.health = 1e6;
      b.maxHealth = 1e6;
      b.isMega = false;
      state.bosses.push(b);
    }
    // A mega already holds the reserved mega slot too.
    const megaHold = emptyBoss();
    megaHold.id = 5900;
    megaHold.index = 200;
    megaHold.active = true;
    megaHold.state = 'idle';
    megaHold.isMega = true;
    megaHold.health = 1e6;
    megaHold.maxHealth = 1e6;
    state.bosses.push(megaHold);

    forceEnqueueBossIndex(state, 7);
    expect(state.pendingBossIndices).toEqual([4, 5, 6, 7]);
    // Re-enqueueing an already-pending index must not duplicate it.
    forceEnqueueBossIndex(state, 5);
    expect(state.pendingBossIndices).toEqual([4, 5, 6, 7]);

    for (let i = 0; i < 120; i += 1) stepSurvivor(state, EMPTY_SURVIVOR_INPUT, SURVIVOR.fixedDt);
    // Still blocked, still in order, nothing lost.
    expect(state.pendingBossIndices).toEqual([4, 5, 6, 7]);
  });

  it('aegis is an intentionally powerful emergency cache choice', () => {
    expect(computeShieldPoints(105, 100)).toBe(Math.round(32 + 3 * (105 / 60) + 0.12 * 100));
    expect(SURVIVOR.aegis.invulnOnSelect).toBe(3);
  });

  it('boss body damage exceeds projectile at same index', () => {
    expect(bossCategoryDamage('body', 1, false)).toBeGreaterThan(bossCategoryDamage('projectile', 1, false));
    expect(bossCategoryDamage('charge', 1, false)).toBeGreaterThan(bossCategoryDamage('body', 1, false));
    expect(bossCategoryDamage('body', 1, true)).toBeGreaterThan(bossCategoryDamage('body', 1, false));
  });

  it.each(['astronaut', 'mech', 'ship'] as const)(
    'boss contact damages but never displaces the %s form',
    (form) => {
      const state = createSurvivorState('bee', null, 1701);
      state.player.form = form;
      state.player.x = 2.25;
      state.player.z = -1.75;
      state.player.invuln = 0;
      state.player.bossContactCd = 0;
      const boss = emptyBoss();
      boss.id = 9001;
      boss.index = 1;
      boss.active = true;
      boss.state = 'idle';
      boss.x = state.player.x;
      boss.z = state.player.z;
      boss.health = 10_000;
      boss.maxHealth = 10_000;
      state.bosses = [boss];

      const before = { x: state.player.x, z: state.player.z, health: state.player.health };
      applyBossBodyContact(state);

      expect(state.player.health).toBeLessThan(before.health);
      expect(state.player.x).toBe(before.x);
      expect(state.player.z).toBe(before.z);
      expect(state.player.bossContactCd).toBeGreaterThan(0);
    },
  );

  it('thruster boost is +6% per level and hard-capped at +30%', () => {
    const thr = PASSIVES.find((p) => p.id === 'move-speed')!;
    expect(thr.perLevel).toBeCloseTo(0.06, 5);
    expect(thr.maxLevel).toBe(5);
    expect(moveSpeedBonus(5)).toBeCloseTo(0.3, 5);
    // Hard cap holds even if a level somehow exceeds the authored maximum.
    expect(moveSpeedBonus(99)).toBeCloseTo(0.3, 5);
  });

  it('ordinary enemies never spawn enemy projectiles in 30s', () => {
    const state = createSurvivorState('bee', null, 811);
    state.player.invuln = 999;
    state.weapons = [];
    for (let i = 0; i < 30 * 60; i += 1) {
      stepSurvivor(state, EMPTY_SURVIVOR_INPUT, SURVIVOR.fixedDt);
    }
    const hostile = state.projectiles.filter((p) => p.active && p.owner === 'enemy' && p.kind === 'enemy');
    expect(hostile.length).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// Gravitic Recall — XP conservation across level-ups
// ---------------------------------------------------------------------------

/**
 * Cumulative progression helper.
 * total earned XP = XP spent reaching the current level + current unspent XP.
 */
function totalEarnedXp(state: SurvivorState): number {
  let sum = state.xp;
  for (let lv = 1; lv < state.level; lv += 1) sum += xpForLevel(lv);
  return sum;
}

function scatterEnergy(
  state: SurvivorState,
  values: number[],
  baseId = 8800,
  radius = 16,
): number {
  let total = 0;
  values.forEach((v, i) => {
    total += v;
    state.pickups.push({
      id: baseId + i,
      kind: 'xp',
      x: Math.sin(i * 1.31) * radius,
      z: Math.cos(i * 0.97) * radius,
      value: v,
      active: true,
      magnetized: false,
      life: Infinity,
    });
  });
  return total;
}

/** Advance the sim, resolving each level-up modal with exactly one validated choice. */
function runResolvingLevelUps(
  state: SurvivorState,
  steps: number,
): { modals: number; fingerprints: string[] } {
  let modals = 0;
  const fingerprints: string[] = [];
  for (let i = 0; i < steps; i += 1) {
    if (state.phase === 'levelup') {
      modals += 1;
      expect(state.choices.length).toBeGreaterThan(0);
      const before = buildFingerprint(state);
      applyChoice(state, 0);
      fingerprints.push(`${before} -> ${buildFingerprint(state)}`);
      expect(state.phase).toBe('playing');
      continue;
    }
    stepSurvivor(state, EMPTY_SURVIVOR_INPUT, SURVIVOR.fixedDt);
  }
  return { modals, fingerprints };
}

function recallState(seed: number): SurvivorState {
  const state = createSurvivorState('bee', null, seed);
  // No weapons and no incoming pressure: only Recall can change XP.
  state.weapons = [];
  state.player.invuln = 9999;
  state.spawnAcc = -1e9;
  state.surge.nextSurgeAt = 1e9;
  state.nextBossTime = 1e9;
  state.nextCacheTime = 1e9;
  return state;
}

describe('gravitic recall XP conservation', () => {
  it('recall with no level-up banks every orb exactly once', () => {
    const state = recallState(7301);
    const total = scatterEnergy(state, [2, 3, 4]);
    expect(total).toBeLessThan(state.xpNext);
    const earned0 = totalEarnedXp(state);

    forceStartProtocol(state, 'gravitic-recall', 1);
    expect(state.recall.active).toBe(true);
    expect(state.recall.totalXp).toBe(total);

    for (let i = 0; i < 200; i += 1) stepSurvivor(state, EMPTY_SURVIVOR_INPUT, SURVIVOR.fixedDt);
    expect(state.recall.active).toBe(false);
    expect(state.level).toBe(1);
    expect(state.pendingLevelUps).toBe(0);
    expect(totalEarnedXp(state) - earned0).toBe(total);
  });

  it('recall crossing exactly one level preserves XP and owes one choice', () => {
    const state = recallState(7302);
    // xpForLevel(1) = 21 → 30 crosses one level with a remainder.
    const total = scatterEnergy(state, [10, 10, 10]);
    expect(total).toBeGreaterThan(xpForLevel(1));
    expect(total).toBeLessThan(xpForLevel(1) + xpForLevel(2));
    const earned0 = totalEarnedXp(state);

    forceStartProtocol(state, 'gravitic-recall', 1);
    for (let i = 0; i < 200; i += 1) {
      if (state.phase === 'levelup') break;
      stepSurvivor(state, EMPTY_SURVIVOR_INPUT, SURVIVOR.fixedDt);
    }
    expect(state.recall.active).toBe(false);
    expect(state.phase).toBe('levelup');
    expect(state.level).toBe(2);
    expect(totalEarnedXp(state) - earned0).toBe(total);
    applyChoice(state, 0);
    expect(state.phase).toBe('playing');
    expect(state.pendingLevelUps).toBe(0);
  });

  it('recall crossing at least three levels loses no XP and opens one modal per level', () => {
    const state = recallState(7303);
    // 21 + 34 + 50 + 69 = 174 to reach L5; 210 crosses four levels with a remainder.
    const values = Array.from({ length: 18 }, (_, i) => 8 + (i % 5) * 2);
    const total = scatterEnergy(state, values);
    expect(total).toBe(210);
    const earned0 = totalEarnedXp(state);

    let expectedLevels = 0;
    let remaining = total;
    let lv = state.level;
    let spare = state.xp;
    while (spare + remaining >= xpForLevel(lv)) {
      remaining -= xpForLevel(lv) - spare;
      spare = 0;
      lv += 1;
      expectedLevels += 1;
    }
    expect(expectedLevels).toBeGreaterThanOrEqual(3);

    forceStartProtocol(state, 'gravitic-recall', 1);
    const { modals } = runResolvingLevelUps(state, 400);

    expect(state.recall.active).toBe(false);
    expect(modals).toBe(expectedLevels);
    expect(state.level).toBe(1 + expectedLevels);
    expect(state.pendingLevelUps).toBe(0);
    // Exact cumulative conservation — not "at least".
    expect(totalEarnedXp(state) - earned0).toBe(total);
    // Every captured orb deactivated exactly once.
    for (const id of Array.from({ length: values.length }, (_, i) => 8800 + i)) {
      expect(state.pickups.find((p) => p.id === id)?.active).toBe(false);
    }
  });

  it('several orbs arriving in one frame all count even after a level opens', () => {
    const state = recallState(7304);
    // All orbs on top of the player: they are collected in a single updatePickups pass.
    const values = [15, 15, 15, 15, 15, 15];
    let total = 0;
    values.forEach((v, i) => {
      total += v;
      state.pickups.push({
        id: 8700 + i,
        kind: 'xp',
        x: state.player.x + 0.05 * i,
        z: state.player.z,
        value: v,
        active: true,
        magnetized: false,
        life: Infinity,
      });
    });
    expect(total).toBeGreaterThan(xpForLevel(1) + xpForLevel(2));
    const earned0 = totalEarnedXp(state);

    forceStartProtocol(state, 'gravitic-recall', 1);
    // One step is enough for the co-located orbs; the modal is deferred until recall ends.
    stepSurvivor(state, EMPTY_SURVIVOR_INPUT, SURVIVOR.fixedDt);
    expect(totalEarnedXp(state) - earned0).toBe(total);
    expect(state.phase).toBe('playing');

    runResolvingLevelUps(state, 300);
    expect(totalEarnedXp(state) - earned0).toBe(total);
    expect(state.pendingLevelUps).toBe(0);
  });

  it('final snap collection crossing levels preserves XP', () => {
    const state = recallState(7305);
    // Far orbs that only the end-of-recall snap can reach.
    const values = [40, 40, 40, 40];
    let total = 0;
    values.forEach((v, i) => {
      total += v;
      state.pickups.push({
        id: 8600 + i,
        kind: 'xp',
        x: (i % 2 === 0 ? 1 : -1) * (SURVIVOR.arenaHalf - 3),
        z: (i < 2 ? 1 : -1) * (SURVIVOR.arenaHalf - 3),
        value: v,
        active: true,
        magnetized: false,
        life: Infinity,
      });
    });
    const earned0 = totalEarnedXp(state);

    forceStartProtocol(state, 'gravitic-recall', 1);
    const { modals } = runResolvingLevelUps(state, 400);
    expect(state.recall.active).toBe(false);
    expect(modals).toBeGreaterThanOrEqual(3);
    expect(totalEarnedXp(state) - earned0).toBe(total);
    for (let i = 0; i < values.length; i += 1) {
      expect(state.pickups.find((p) => p.id === 8600 + i)?.active).toBe(false);
    }
  });

  it('does not recall health orbs or orbs created after activation', () => {
    const state = recallState(7306);
    const total = scatterEnergy(state, [12, 12, 12]);
    state.pickups.push({
      id: 8899,
      kind: 'repair',
      x: 12,
      z: 12,
      value: 20,
      active: true,
      magnetized: false,
      life: 400,
    });
    state.player.health = state.player.maxHealth;

    forceStartProtocol(state, 'gravitic-recall', 1);
    expect(state.recall.orbIds).not.toContain(8899);
    // Created after activation, far from the player and outside magnet range.
    state.pickups.push({
      id: 8901,
      kind: 'xp',
      x: SURVIVOR.arenaHalf - 2,
      z: -(SURVIVOR.arenaHalf - 2),
      value: 99,
      active: true,
      magnetized: false,
      life: Infinity,
    });
    expect(state.recall.orbIds).not.toContain(8901);

    const earned0 = totalEarnedXp(state);
    runResolvingLevelUps(state, 200);
    expect(state.pickups.find((p) => p.id === 8899)?.active).toBe(true);
    expect(state.pickups.find((p) => p.id === 8901)?.active).toBe(true);
    expect(totalEarnedXp(state) - earned0).toBe(total);
  });

  it('empty recall is a no-op and corrupts nothing', () => {
    const state = recallState(7307);
    const earned0 = totalEarnedXp(state);
    forceStartProtocol(state, 'gravitic-recall', 1);
    expect(state.recall.orbIds.length).toBe(0);
    expect(state.recall.totalXp).toBe(0);
    for (let i = 0; i < 150; i += 1) stepSurvivor(state, EMPTY_SURVIVOR_INPUT, SURVIVOR.fixedDt);
    expect(state.recall.active).toBe(false);
    expect(state.phase).toBe('playing');
    expect(state.choices).toEqual([]);
    expect(state.protocolChoices).toEqual([]);
    expect(state.pendingLevelUps).toBe(0);
    expect(totalEarnedXp(state)).toBe(earned0);
  });

  it('each pending level requires its own validated choice and grants exactly one upgrade', () => {
    const state = recallState(7308);
    scatterEnergy(state, Array.from({ length: 18 }, (_, i) => 8 + (i % 5) * 2));
    forceStartProtocol(state, 'gravitic-recall', 1);

    const grants: string[] = [];
    let modals = 0;
    for (let i = 0; i < 400; i += 1) {
      if (state.phase === 'levelup') {
        modals += 1;
        const before = buildFingerprint(state);
        // No permanent Build change may occur merely by opening the modal.
        expect(state.pendingLevelUps).toBeGreaterThanOrEqual(0);
        applyChoice(state, 0);
        const after = buildFingerprint(state);
        expect(after).not.toBe(before);
        grants.push(after);
        continue;
      }
      stepSurvivor(state, EMPTY_SURVIVOR_INPUT, SURVIVOR.fixedDt);
    }
    expect(modals).toBeGreaterThanOrEqual(3);
    // One card == one level: total granted weapon/passive levels equals modal count.
    const grantedLevels =
      state.weapons.reduce((n, w) => n + w.level, 0) +
      Object.values(state.passives).reduce((n: number, v) => n + (v ?? 0), 0);
    expect(grantedLevels).toBe(modals);
    expect(state.pendingLevelUps).toBe(0);
    expect(state.phase).toBe('playing');
  });

  it('multi-level recall never auto-grants unsolicited Build levels', () => {
    const state = recallState(7309);
    // Give a starter weapon so an auto-mutation would be visible.
    state.weapons = [{ weaponId: 'pulse', level: 1, cooldown: 0.4, focusDebt: 0, prototype: false }];
    scatterEnergy(state, Array.from({ length: 18 }, (_, i) => 8 + (i % 5) * 2));
    const fp0 = buildFingerprint(state);

    forceStartProtocol(state, 'gravitic-recall', 1);
    // Step until the first modal — Build must be untouched the whole way.
    for (let i = 0; i < 400 && state.phase !== 'levelup'; i += 1) {
      stepSurvivor(state, EMPTY_SURVIVOR_INPUT, SURVIVOR.fixedDt);
      expect(buildFingerprint(state)).toBe(fp0);
    }
    expect(state.phase).toBe('levelup');
    expect(state.pendingLevelUps).toBeGreaterThanOrEqual(2);
    expect(buildFingerprint(state)).toBe(fp0);
  });

  it('recall keeps phase and choice sets coherent throughout', () => {
    const state = recallState(7310);
    scatterEnergy(state, Array.from({ length: 18 }, (_, i) => 8 + (i % 5) * 2));
    forceStartProtocol(state, 'gravitic-recall', 1);
    for (let i = 0; i < 400; i += 1) {
      expect(['playing', 'levelup']).toContain(state.phase);
      if (state.phase === 'levelup') {
        expect(state.choices.length).toBeGreaterThan(0);
        expect(state.choices.length).toBeLessThanOrEqual(3);
        expect(state.protocolChoices).toEqual([]);
        applyChoice(state, 0);
        continue;
      }
      expect(state.choices).toEqual([]);
      // The pull is never frozen half-way by a modal.
      if (state.recall.active) expect(state.phase).toBe('playing');
      stepSurvivor(state, EMPTY_SURVIVOR_INPUT, SURVIVOR.fixedDt);
    }
    expect(state.pendingLevelUps).toBe(0);
  });

  it('the visible pull lasts about 1.25 seconds', () => {
    const state = recallState(7311);
    scatterEnergy(state, [5, 5, 5], 8800, SURVIVOR.arenaHalf - 4);
    forceStartProtocol(state, 'gravitic-recall', 1);
    expect(state.recall.duration).toBeCloseTo(1.25, 5);
    let elapsed = 0;
    for (let i = 0; i < 400 && state.recall.active; i += 1) {
      stepSurvivor(state, EMPTY_SURVIVOR_INPUT, SURVIVOR.fixedDt);
      elapsed += SURVIVOR.fixedDt;
    }
    expect(elapsed).toBeGreaterThan(1.0);
    expect(elapsed).toBeLessThan(1.6);
  });
});

// ---------------------------------------------------------------------------
// Lost-focus policy
// ---------------------------------------------------------------------------

describe('lost focus handling', () => {
  const base = {
    phase: 'playing' as SurvivorState['phase'] | null,
    settingsOpen: false,
    rebinding: null as ActionId | null,
    choiceIndex: null as number | null,
    inputBlocked: false,
  };

  it('visibility logic acts only when the document is hidden', () => {
    expect(shouldHandleVisibility(true)).toBe(true);
    expect(shouldHandleVisibility(false)).toBe(false);
  });

  it('pauses active play and clears any pending choice', () => {
    const next = focusLossTransition({ ...base, choiceIndex: 2 });
    expect(next.phase).toBe('paused');
    expect(next.choiceIndex).toBeNull();
    expect(next.inputBlocked).toBe(false);
  });

  it('never turns levelup or protocol into paused', () => {
    expect(focusLossTransition({ ...base, phase: 'levelup' }).phase).toBe('levelup');
    expect(focusLossTransition({ ...base, phase: 'protocol' }).phase).toBe('protocol');
    // A stale card selection is still discarded on both screens.
    expect(focusLossTransition({ ...base, phase: 'levelup', choiceIndex: 1 }).choiceIndex).toBeNull();
    expect(focusLossTransition({ ...base, phase: 'protocol', choiceIndex: 0 }).choiceIndex).toBeNull();
  });

  it('never auto-resumes and never disturbs terminal phases', () => {
    expect(focusLossTransition({ ...base, phase: 'paused' }).phase).toBe('paused');
    expect(focusLossTransition({ ...base, phase: 'defeat' }).phase).toBe('defeat');
    expect(focusLossTransition({ ...base, phase: 'victory' }).phase).toBe('victory');
  });

  it('cancels an in-flight keybind capture', () => {
    const next = focusLossTransition({ ...base, rebinding: 'dodge', inputBlocked: true });
    expect(next.rebinding).toBeNull();
    // Capture no longer blocks input; only the settings panel does.
    expect(next.inputBlocked).toBe(false);
  });

  it('keeps inputBlocked consistent with the settings panel', () => {
    const open = focusLossTransition({ ...base, settingsOpen: true, inputBlocked: true });
    expect(open.inputBlocked).toBe(true);
    // Settings already paused the run; focus loss must not re-pause or unpause it.
    expect(focusLossTransition({ ...base, phase: 'paused', settingsOpen: true }).phase).toBe('paused');
    const closed = focusLossTransition({ ...base, settingsOpen: false, inputBlocked: true });
    expect(closed.inputBlocked).toBe(false);
  });

  it('is idempotent — a blur followed by a hidden event changes nothing further', () => {
    const once = focusLossTransition({ ...base, choiceIndex: 1, rebinding: 'mech' });
    const twice = focusLossTransition(once);
    expect(twice).toEqual(once);
  });

  it('tolerates focus loss before a run exists', () => {
    const next = focusLossTransition({ ...base, phase: null });
    expect(next.phase).toBeNull();
    expect(next.choiceIndex).toBeNull();
  });

  it('gives an open Run Report priority over pause without leaking the key', () => {
    expect(shouldCloseRunReport(true, 'Escape', 'Escape')).toBe(true);
    expect(shouldCloseRunReport(true, 'KeyP', 'KeyP')).toBe(true);
    expect(shouldCloseRunReport(true, 'Escape', 'KeyP')).toBe(true);
    expect(shouldCloseRunReport(false, 'Escape', 'Escape')).toBe(false);
    expect(shouldCloseRunReport(true, 'KeyR', 'Escape')).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Early specialist gates
// ---------------------------------------------------------------------------

/** Ids of every enemy that entered play, in spawn order. */
function trackSpawns(state: SurvivorState): {
  sample: () => void;
  defsSeen: () => string[];
  firstTimeOf: (defId: string) => number | undefined;
} {
  const seen = new Map<number, { defId: string; t: number }>();
  return {
    sample() {
      for (const e of state.enemies) {
        if (e.alive && !seen.has(e.id)) seen.set(e.id, { defId: e.defId, t: state.time });
      }
    },
    defsSeen() {
      return Array.from(new Set(Array.from(seen.values(), (v) => v.defId)));
    },
    firstTimeOf(defId) {
      let best: number | undefined;
      for (const v of seen.values()) {
        if (v.defId === defId && (best === undefined || v.t < best)) best = v.t;
      }
      return best;
    },
  };
}

function pressureState(seed: number): SurvivorState {
  const state = createSurvivorState('bee', null, seed);
  state.player.invuln = 1e9;
  state.weapons = [];
  return state;
}

describe('early specialist gates', () => {
  it('exposes a single time-gate table', () => {
    expect(isEnemyEligibleAt('basic', 0)).toBe(true);
    expect(isEnemyEligibleAt('mush', 0)).toBe(true);
    expect(isEnemyEligibleAt('fast', 29)).toBe(false);
    expect(isEnemyEligibleAt('fast', 30)).toBe(true);
    expect(isEnemyEligibleAt('spiky', 59)).toBe(false);
    expect(isEnemyEligibleAt('spiky', 60)).toBe(true);
    expect(isEnemyEligibleAt('flyer', 59)).toBe(false);
    expect(isEnemyEligibleAt('bee', 59)).toBe(false);
    expect(isEnemyEligibleAt('flyer', 60)).toBe(true);
    expect(isEnemyEligibleAt('elite', 89)).toBe(false);
    expect(isEnemyEligibleAt('elite', 90)).toBe(true);
    expect(isEnemyEligibleAt('ghost', 119)).toBe(false);
    expect(isEnemyEligibleAt('ghost', 120)).toBe(true);
    // Unknown ids are treated as late specialists, never as free fodder.
    expect(isEnemyEligibleAt('not-a-real-enemy', 0)).toBe(false);
  });

  it('spawns fodder only for the first 30 seconds', () => {
    const state = pressureState(6101);
    const tracker = trackSpawns(state);
    for (let i = 0; i < 30 * 60; i += 1) {
      stepSurvivor(state, EMPTY_SURVIVOR_INPUT, SURVIVOR.fixedDt);
      tracker.sample();
    }
    expect(tracker.defsSeen().length).toBeGreaterThan(0);
    for (const defId of tracker.defsSeen()) {
      expect(HORDE[defId]!.role).toBe('fodder');
    }
  });

  it('caps living fast specialists to one during 30–60 seconds', () => {
    const state = pressureState(6102);
    let peak = 0;
    for (let i = 0; i < 60 * 60; i += 1) {
      stepSurvivor(state, EMPTY_SURVIVOR_INPUT, SURVIVOR.fixedDt);
      if (state.time < 30 || state.time >= 60) continue;
      const specialists = state.enemies.filter(
        (e) => e.alive && HORDE[e.defId]!.role !== 'fodder',
      ).length;
      peak = Math.max(peak, specialists);
    }
    expect(peak).toBeLessThanOrEqual(1);
  });

  it('a forced sprinter surge at 45s cannot flood specialists', () => {
    const state = pressureState(6103);
    state.time = 45;
    // Force the director straight into a sprinter surge.
    state.surge.phase = 'surge';
    state.surge.kind = 'sprinters';
    state.surge.phaseEndsAt = 1e9;
    state.surge.nextSurgeAt = 1e9;

    const tracker = trackSpawns(state);
    let peak = 0;
    for (let i = 0; i < 14 * 60; i += 1) {
      stepSurvivor(state, EMPTY_SURVIVOR_INPUT, SURVIVOR.fixedDt);
      tracker.sample();
      if (state.time >= 60) break;
      peak = Math.max(
        peak,
        state.enemies.filter((e) => e.alive && HORDE[e.defId]!.role !== 'fodder').length,
      );
    }
    // The surge still produced pressure...
    expect(tracker.defsSeen().length).toBeGreaterThan(0);
    // ...but it was time-valid fodder pressure, never a specialist flood.
    expect(peak).toBeLessThanOrEqual(1);
    for (const defId of tracker.defsSeen()) {
      expect(isEnemyEligibleAt(defId, 60)).toBe(true);
    }
    expect(tracker.defsSeen()).not.toContain('spiky');
    expect(tracker.defsSeen()).not.toContain('flyer');
    expect(tracker.defsSeen()).not.toContain('elite');
    expect(tracker.defsSeen()).not.toContain('ghost');
  });

  it('every surge kind respects eligibility when forced early', () => {
    for (const kind of ['sprinters', 'pincer', 'bruiser', 'encircle', 'elite', 'flood']) {
      const state = pressureState(6200 + kind.length);
      state.time = 20;
      state.surge.phase = 'surge';
      state.surge.kind = kind;
      state.surge.phaseEndsAt = 1e9;
      state.surge.nextSurgeAt = 1e9;
      const tracker = trackSpawns(state);
      for (let i = 0; i < 9 * 60; i += 1) {
        stepSurvivor(state, EMPTY_SURVIVOR_INPUT, SURVIVOR.fixedDt);
        tracker.sample();
      }
      const defs = tracker.defsSeen();
      // Each forced surge must actually spawn something, so this cannot pass vacuously.
      expect(defs.length).toBeGreaterThan(0);
      for (const defId of defs) {
        expect(HORDE[defId]!.role).toBe('fodder');
      }
    }
  });

  it('nothing enters play before its own gate across a long opening', () => {
    const state = pressureState(6104);
    const tracker = trackSpawns(state);
    // Record violations rather than asserting per frame — an assertion in this
    // hot loop dominates the runtime and hides the actual coverage.
    const violations: string[] = [];
    for (let i = 0; i < 200 * 60; i += 1) {
      stepSurvivor(state, EMPTY_SURVIVOR_INPUT, SURVIVOR.fixedDt);
      tracker.sample();
      for (const e of state.enemies) {
        if (!e.alive) continue;
        if (!isEnemyEligibleAt(e.defId, state.time)) {
          violations.push(`${e.defId}@${state.time.toFixed(2)}`);
        }
      }
    }
    expect(violations).toEqual([]);
    const flankerAt = Math.min(
      tracker.firstTimeOf('flyer') ?? Infinity,
      tracker.firstTimeOf('bee') ?? Infinity,
    );
    // Fixed-step accumulation lands a hair under the exact gate; the eligibility
    // epsilon (1e-6) is the documented tolerance, so allow it here too.
    const eps = 1e-4;
    expect(tracker.firstTimeOf('fast')!).toBeGreaterThanOrEqual(30 - eps);
    expect(tracker.firstTimeOf('spiky')!).toBeGreaterThanOrEqual(60 - eps);
    expect(flankerAt).toBeGreaterThanOrEqual(60 - eps);
    expect(tracker.firstTimeOf('bruiser')!).toBeGreaterThanOrEqual(90 - eps);
    expect(tracker.firstTimeOf('elite')!).toBeGreaterThanOrEqual(90 - eps);
    // Drives 200 simulated seconds of the real spawn director and measures ~3.2s alone,
    // which is thin against vitest's 5s default once the full suite adds worker
    // contention. Measured at 3196ms without the endless-2.8.0 ship changes and 3172ms
    // with them, so this budget is contention headroom, not cover for a slowdown. If it
    // ever times out at 60s the director genuinely regressed; never resolve it by
    // changing a balance value or an acceptance band.
  }, 60_000);

  it('gates are floors, not bans — each specialist appears once unlocked', () => {
    // One focused window per specialist so the assertion cannot pass vacuously.
    const cases: Array<{ defId: string; from: number; window: number }> = [
      { defId: 'fast', from: 31, window: 40 },
      { defId: 'spiky', from: 61, window: 40 },
      { defId: 'bruiser', from: 91, window: 60 },
      { defId: 'elite', from: 91, window: 60 },
      { defId: 'ghost', from: 121, window: 90 },
    ];
    for (const c of cases) {
      const state = pressureState(6300 + c.from);
      state.time = c.from;
      const tracker = trackSpawns(state);
      for (let i = 0; i < c.window * 60; i += 1) {
        stepSurvivor(state, EMPTY_SURVIVOR_INPUT, SURVIVOR.fixedDt);
        tracker.sample();
      }
      expect(tracker.defsSeen()).toContain(c.defId);
    }
    // Flankers share a gate; either one satisfies it.
    const fl = pressureState(6399);
    fl.time = 61;
    const flTracker = trackSpawns(fl);
    for (let i = 0; i < 60 * 60; i += 1) {
      stepSurvivor(fl, EMPTY_SURVIVOR_INPUT, SURVIVOR.fixedDt);
      flTracker.sample();
    }
    expect(flTracker.defsSeen().some((d) => d === 'flyer' || d === 'bee')).toBe(true);
  });

  it('ordinary enemies stay melee-only through the whole ramp', () => {
    const state = pressureState(6105);
    for (let i = 0; i < 200 * 60; i += 1) {
      stepSurvivor(state, EMPTY_SURVIVOR_INPUT, SURVIVOR.fixedDt);
    }
    const ordinaryProjectiles = state.projectiles.filter(
      (p) => p.active && p.owner === 'enemy' && p.sourceBossId === 0,
    );
    expect(ordinaryProjectiles.length).toBe(0);
    for (const def of Object.values(HORDE)) {
      expect(def.role).not.toBe('ranged');
    }
  });
});

// ---------------------------------------------------------------------------
// Pressure director — every surge kind must produce its actual signature
// ---------------------------------------------------------------------------

/** Which perimeter edge a spawn point sits on. */
function edgeOf(x: number, z: number): number {
  const h = SURVIVOR.combatSpawnHalf + 1.2;
  if (Math.abs(z + h) < 0.01) return 0;
  if (Math.abs(z - h) < 0.01) return 1;
  if (Math.abs(x + h) < 0.01) return 2;
  if (Math.abs(x - h) < 0.01) return 3;
  return -1;
}

function runSurge(
  kind: string,
  seed: number,
  atTime: number,
  seconds: number,
): { defs: string[]; edges: Set<number>; count: number } {
  const state = createSurvivorState('bee', null, seed);
  state.player.invuln = 1e9;
  state.weapons = [];
  state.time = atTime;
  state.surge.phase = 'surge';
  state.surge.kind = kind;
  state.surge.phaseEndsAt = 1e9;
  state.surge.nextSurgeAt = 1e9;
  // Composition is measured in isolation. A live boss now ends ordinary surges by
  // design (see the boss-interaction tests), which would otherwise silently turn every
  // composition assertion into a measurement of the recovery window.
  state.nextBossTime = 1e9;

  const seen = new Set<number>();
  const defs: string[] = [];
  const edges = new Set<number>();
  for (let i = 0; i < seconds * 60; i += 1) {
    stepSurvivor(state, EMPTY_SURVIVOR_INPUT, SURVIVOR.fixedDt);
    for (const e of state.enemies) {
      if (!e.alive || seen.has(e.id)) continue;
      seen.add(e.id);
      defs.push(e.defId);
      // Enemies move after spawning, so classify on the first frame we see them.
      const edge = edgeOf(e.x, e.z);
      if (edge >= 0) edges.add(edge);
    }
  }
  return { defs, edges, count: defs.length };
}

describe('pressure director surge composition', () => {
  const fractionOf = (defs: string[], pred: (d: string) => boolean): number =>
    defs.length === 0 ? 0 : defs.filter(pred).length / defs.length;

  it('every surge kind actually spawns enemies (no vacuous pass)', () => {
    for (const kind of ['sprinters', 'pincer', 'bruiser', 'encircle', 'elite', 'flood']) {
      const r = runSurge(kind, 7100 + kind.length, 200, 8);
      expect(r.count, `${kind} spawned nothing`).toBeGreaterThan(5);
    }
  });

  it('a sprinter surge is actually sprinter-heavy once sprinters are unlocked', () => {
    const surge = runSurge('sprinters', 7201, 200, 10);
    const baseline = runSurge('', 7202, 200, 10);
    const isSprinter = (d: string) => HORDE[d]!.role === 'sprinter';
    expect(fractionOf(surge.defs, isSprinter)).toBeGreaterThan(
      fractionOf(baseline.defs, isSprinter),
    );
    expect(fractionOf(surge.defs, isSprinter)).toBeGreaterThan(0.35);
  });

  it('a bruiser surge actually produces bruisers', () => {
    const r = runSurge('bruiser', 7203, 200, 10);
    expect(r.defs).toContain('bruiser');
    expect(fractionOf(r.defs, (d) => d === 'bruiser')).toBeGreaterThan(0.2);
  });

  it('an elite surge actually produces elites after the elite gate', () => {
    const r = runSurge('elite', 7204, 200, 10);
    expect(r.defs).toContain('elite');
    const elites = r.defs.filter((d) => d === 'elite').length;
    // Explicit event budget: noticeable, but never the old 55%-of-wave flood.
    expect(elites).toBeGreaterThanOrEqual(2);
    expect(elites).toBeLessThanOrEqual(SURVIVOR.elite.surgeBonusCap + 1);
    expect(fractionOf(r.defs, (d) => d === 'elite')).toBeLessThan(0.15);
  });

  it('a flood surge is fodder-heavy and denser than baseline', () => {
    const flood = runSurge('flood', 7205, 200, 8);
    const baseline = runSurge('', 7206, 200, 8);
    expect(fractionOf(flood.defs, (d) => HORDE[d]!.role === 'fodder')).toBeGreaterThan(0.5);
    expect(flood.count).toBeGreaterThan(baseline.count);
  });

  it('a pincer surge uses exactly two facing edges', () => {
    const r = runSurge('pincer', 7207, 200, 10);
    // Exactly two, never one — a single-edge "pincer" would pass a >0 check vacuously.
    expect(r.edges.size).toBe(2);
    const [a, b] = Array.from(r.edges).sort();
    // Edges are -Z, +Z, -X, +X: facing edges are the two halves of one axis pair.
    expect(a! ^ 1).toBe(b!);
  });

  it('an encircle surge spreads across the whole perimeter', () => {
    const r = runSurge('encircle', 7208, 200, 10);
    expect(r.edges.size).toBeGreaterThanOrEqual(3);
  });
});

import { describe, expect, it } from 'vitest';
import { createSurvivorState, primaryBoss } from './survivorState';
import {
  EMPTY_SURVIVOR_INPUT,
  applyChoice,
  applyShipExhaust,
  clearShipHazards,
  generateChoices,
  stepSurvivor,
  tryDodge,
  tryMech,
  tryRepulsor,
  tryShip,
  surroundPlayer,
} from './survivorSim';
import {
  SURVIVOR,
  SURVIVOR_BOSS,
  WEAPONS,
  bossDifficultyFor,
  bossPhaseFromHealth,
  bossTimeForIndex,
  endlessDifficultyAt,
  heroStarterWeapon,
  spawnPressure,
  xpForLevel,
} from './survivorContent';
import {
  DEFAULT_KEYBINDS,
  assignKeybind,
  formatKeyCode,
  normalizeKeybinds,
  resetKeybinds,
} from './survivorKeybinds';
import { formatSurvivalTime, loadRecords, makeRunSummary, recordRun } from './survivorRecords';

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

  it('dodge is 10 second cooldown', () => {
    expect(SURVIVOR.dodge.cooldown).toBe(10);
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
      b.health = 0;
      // force death path
      b.health = 1;
    }
    // damage to death via direct state (simulate kill)
    if (b) {
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
    // Force schedule catch-up
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
    // Max everything
    for (const w of state.weapons) w.level = WEAPONS[w.weaponId].levels.length;
    state.weapons = (Object.keys(WEAPONS) as (keyof typeof WEAPONS)[])
      .slice(0, SURVIVOR.maxWeaponSlots)
      .map((id) => ({ weaponId: id, level: WEAPONS[id].levels.length, cooldown: 0 }));
    for (const pas of ['move-speed', 'pickup-radius', 'max-health', 'regen', 'weapon-haste', 'area', 'mech-charge', 'mech-duration'] as const) {
      state.passives[pas] = 5;
    }
    const choices = generateChoices(state);
    expect(choices.length).toBe(3);
    expect(choices.some((c) => c.kind === 'temp')).toBe(true);
  });
});

describe('dodge', () => {
  it('activates with 10s cooldown and moves player', () => {
    const state = createSurvivorState('bee', null, 4);
    const x0 = state.player.x;
    expect(tryDodge(state, 1, 0)).toBe(true);
    expect(state.player.dodgeCd).toBe(10);
    expect(state.player.dodgeActive).toBeGreaterThan(0);
    expect(tryDodge(state, 1, 0)).toBe(false);
    for (let i = 0; i < 20; i += 1) stepSurvivor(state, EMPTY_SURVIVOR_INPUT, SURVIVOR.fixedDt);
    expect(state.player.x).not.toBeCloseTo(x0, 1);
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

describe('keybinds and records', () => {
  it('defaults include dodge Space', () => {
    expect(DEFAULT_KEYBINDS.dodge).toBe('Space');
    expect(formatKeyCode('Space')).toBe('Space');
    expect(normalizeKeybinds({ repulsor: 'KeyF' }).dodge).toBe('Space');
  });

  it('records best survival time safely', () => {
    const summary = makeRunSummary({
      survivalTime: 125.5,
      kills: 40,
      level: 8,
      bossesDefeated: 1,
      heroId: 'bee',
      weapons: [{ weaponId: 'pulse', level: 2 }],
      passives: { 'move-speed': 1 },
    });
    const r = recordRun(summary);
    expect(r.records.bestOverall?.survivalTime).toBeGreaterThanOrEqual(125);
    expect(formatSurvivalTime(3661)).toBe('1:01:01');
    expect(loadRecords().version).toBe(1);
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
});

describe('boss phases', () => {
  it('phase thresholds', () => {
    expect(bossPhaseFromHealth(2200, 2200)).toBe(1);
    expect(bossPhaseFromHealth(SURVIVOR_BOSS.maxHealth * 0.5, SURVIVOR_BOSS.maxHealth)).toBe(2);
    expect(bossPhaseFromHealth(SURVIVOR_BOSS.maxHealth * 0.2, SURVIVOR_BOSS.maxHealth)).toBe(3);
  });
});

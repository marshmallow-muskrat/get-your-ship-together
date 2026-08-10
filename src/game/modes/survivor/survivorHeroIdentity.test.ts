import { describe, expect, it } from 'vitest';
import { SURVIVOR, WEAPONS } from './survivorContent';
import {
  createSurvivorState,
  emptyBoss,
  emptyEnemy,
  type SurvivorEnemy,
  type SurvivorState,
} from './survivorState';
import { EMPTY_SURVIVOR_INPUT, stepSurvivor } from './survivorSim';

function isolated(hero: Parameters<typeof createSurvivorState>[0], seed = 1): SurvivorState {
  const state = createSurvivorState(hero, null, seed);
  state.enemyCap = 0;
  state.spawnAcc = -1e9;
  state.nextBossTime = 1e9;
  state.player.invuln = 999;
  return state;
}

function enemy(id: number, x: number, z: number, health = 1_000): SurvivorEnemy {
  const e = emptyEnemy();
  e.id = id;
  e.defId = 'basic';
  e.role = 'fodder';
  e.x = x;
  e.z = z;
  e.health = health;
  e.maxHealth = health;
  e.alive = true;
  e.radius = 0.45;
  e.speedMul = 0;
  e.attackCd = 999;
  return e;
}

describe('endless-2.6.1 hero identity mechanics', () => {
  it('keeps Boswell as the unchanged reference signature', () => {
    expect(WEAPONS.microdrone.levels[0]).toMatchObject({
      damage: 42,
      cadence: 0.72,
      count: 3,
      speed: 19,
      width: 0.7,
    });
  });

  it('Rail Lance selects the line that intersects the pack, not the nearest distraction', () => {
    const state = isolated('flamingo', 101);
    state.weapons = [{ weaponId: 'rail', level: 1, cooldown: 0, focusDebt: 0, prototype: false }];
    const distraction = enemy(100, 0, 2);
    const line = [enemy(101, 3, 0), enemy(102, 6, 0), enemy(103, 9, 0)];
    state.enemies = [distraction, ...line];

    stepSurvivor(state, EMPTY_SURVIVOR_INPUT, SURVIVOR.fixedDt);

    expect(line.every((e) => e.health < e.maxHealth)).toBe(true);
    expect(line.every((e) => Math.hypot(e.kbX, e.kbZ) > 0)).toBe(true);
    expect(distraction.health).toBe(distraction.maxHealth);
  });

  it('a direct Bio-Plasma kill detonates a visible toxic burst into nearby enemies', () => {
    const state = isolated('frog', 102);
    state.weapons = [{ weaponId: 'bioplasma', level: 1, cooldown: 0, focusDebt: 0, prototype: false }];
    const victim = enemy(200, 0, 2, 10);
    const neighbour = enemy(201, 0.8, 2, 500);
    state.enemies = [victim, neighbour];

    for (let i = 0; i < 10; i += 1) stepSurvivor(state, EMPTY_SURVIVOR_INPUT, SURVIVOR.fixedDt);

    expect(victim.alive).toBe(false);
    expect(neighbour.health).toBeLessThan(neighbour.maxHealth);
    expect(state.effects.some((e) => e.kind === 'toxic-burst')).toBe(true);
  });

  it('Bio-Plasma residue slows survivors standing in it', () => {
    const state = isolated('frog', 103);
    state.weapons = [];
    const target = enemy(210, 1.4, 0);
    state.enemies = [target];
    state.hazards.push({
      id: 700,
      kind: 'puddle',
      x: target.x,
      z: target.z,
      radius: 1.5,
      life: 2,
      maxLife: 2,
      damage: 1,
      color: '#5dff6a',
      active: true,
      owner: 'player',
      tickCd: 0,
      armTimer: 0,
      sourceBossId: 0,
      scaleX: 1,
      scaleZ: 1,
      facingX: 0,
      facingZ: 1,
    });

    stepSurvivor(state, EMPTY_SURVIVOR_INPUT, SURVIVOR.fixedDt);

    expect(target.slowTimer).toBeGreaterThan(0);
    expect(target.slowMul).toBeLessThan(1);
  });

  it('Rutherford distributes one salvo toward more than one threat cluster', () => {
    const state = isolated('red-panda', 104);
    state.weapons = [{ weaponId: 'rocket', level: 1, cooldown: 0, focusDebt: 0, prototype: false }];
    state.enemies = [
      enemy(300, -8, 8),
      enemy(301, -7.5, 8.5),
      enemy(302, 8, 8),
      enemy(303, 7.5, 8.5),
    ];

    stepSurvivor(state, EMPTY_SURVIVOR_INPUT, SURVIVOR.fixedDt);

    const rockets = state.projectiles.filter((p) => p.active && p.kind === 'rocket');
    expect(rockets.length).toBe(4);
    expect(rockets.some((p) => p.vx < 0)).toBe(true);
    expect(rockets.some((p) => p.vx > 0)).toBe(true);
  });

  it('a rocket proximity fuse detonates before its authored destination when crossing a target', () => {
    const state = isolated('red-panda', 105);
    state.weapons = [{ weaponId: 'rocket', level: 1, cooldown: 0, focusDebt: 0, prototype: false }];
    const target = enemy(310, 0, 3, 500);
    state.enemies = [target];

    for (let i = 0; i < 24; i += 1) stepSurvivor(state, EMPTY_SURVIVOR_INPUT, SURVIVOR.fixedDt);

    expect(target.health).toBeLessThan(target.maxHealth);
    expect(state.effects.some((e) => e.kind === 'impact' || e.kind === 'pulse')).toBe(true);
  });

  it('Plasma Wake alone remains active in ship form and authors a wide, thin footprint', () => {
    const state = isolated('frog', 106);
    state.weapons = [{ weaponId: 'plasma-wake', level: 1, cooldown: 0, focusDebt: 0, prototype: false }];
    state.player.form = 'ship';
    state.player.shipDuration = 2;

    stepSurvivor(state, { ...EMPTY_SURVIVOR_INPUT, moveX: 1 }, SURVIVOR.fixedDt);

    const plasma = state.hazards.find((h) => h.active && h.kind === 'plasma-wake');
    expect(plasma).toBeTruthy();
    expect(plasma!.scaleX).toBeGreaterThan(plasma!.scaleZ * 3);
    expect(state.effects.some((e) => e.kind === 'plasma-flare')).toBe(true);
  });

  it('the wide Plasma Wake footprint can damage bosses', () => {
    const state = isolated('frog', 107);
    state.weapons = [];
    const boss = emptyBoss();
    boss.id = 800;
    boss.index = 1;
    boss.active = true;
    boss.state = 'idle';
    boss.x = 1.6;
    boss.z = 0;
    boss.health = 1_000;
    boss.maxHealth = 1_000;
    state.bosses = [boss];
    state.hazards.push({
      id: 801,
      kind: 'plasma-wake',
      x: 0,
      z: 0,
      radius: 1.15,
      life: 1,
      maxLife: 1,
      damage: 100,
      color: '#ff6f4d',
      active: true,
      owner: 'player',
      tickCd: 0,
      armTimer: 0,
      sourceBossId: 0,
      scaleX: 1.72,
      scaleZ: 0.48,
      facingX: 0,
      facingZ: 1,
    });

    stepSurvivor(state, EMPTY_SURVIVOR_INPUT, SURVIVOR.fixedDt);

    expect(boss.health).toBeLessThan(1_000);
  });

  it('Rotary Cannon uses its dedicated tracer rather than a generic Boswell bolt', () => {
    const state = isolated('bee', 108);
    state.weapons = [{ weaponId: 'rotary', level: 1, cooldown: 0, focusDebt: 0, prototype: false }];
    state.enemies = [enemy(900, 0, 8)];

    stepSurvivor(state, EMPTY_SURVIVOR_INPUT, SURVIVOR.fixedDt);

    expect(state.projectiles.some((p) => p.active && p.kind === 'rotary-round')).toBe(true);
    expect(state.projectiles.some((p) => p.active && p.kind === 'drone')).toBe(false);
  });
});

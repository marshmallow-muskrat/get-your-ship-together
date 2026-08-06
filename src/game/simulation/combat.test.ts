import { describe, expect, it } from 'vitest';
import { createInitialState } from './createState';
import { stepSimulation, buildHudSnapshot } from './update';
import { EMPTY_INPUT, type InputFrame } from './types';
import { TUNING } from '../content/combatTuning';
import { BOSS_DEMON } from '../content/enemies';

function input(partial: Partial<InputFrame> = {}): InputFrame {
  return { ...EMPTY_INPUT, aimX: 0, aimZ: 10, ...partial };
}

function steps(state: ReturnType<typeof createInitialState>, n: number, frame: InputFrame = input()): void {
  for (let i = 0; i < n; i += 1) stepSimulation(state, frame, TUNING.fixedDt);
}

describe('cooldowns and player kit', () => {
  it('applies dodge invulnerability and cooldown', () => {
    const state = createInitialState({ heroId: 'bee', fixture: 'combat' });
    stepSimulation(state, input({ dodgePressed: true, moveX: 1 }), TUNING.fixedDt);
    expect(state.player.dodgeActive).toBeGreaterThan(0);
    expect(state.player.invulnTimer).toBeGreaterThan(0);
    expect(state.player.dodge.remaining).toBeGreaterThan(0);
    // Cannot re-dodge immediately
    const rem = state.player.dodge.remaining;
    stepSimulation(state, input({ dodgePressed: true }), TUNING.fixedDt);
    expect(state.player.dodge.remaining).toBeLessThanOrEqual(rem);
  });

  it('repairs health and clamps to max with cooldown', () => {
    const state = createInitialState({ heroId: 'frog', fixture: 'combat' });
    state.player.health = 40;
    stepSimulation(state, input({ repairPressed: true }), TUNING.fixedDt);
    expect(state.player.health).toBeCloseTo(40 + TUNING.playerMaxHealth * TUNING.repair.fraction, 5);
    expect(state.player.repair.remaining).toBeCloseTo(TUNING.repair.cooldown, 5);
    const hp = state.player.health;
    stepSimulation(state, input({ repairPressed: true }), TUNING.fixedDt);
    expect(state.player.health).toBe(hp);
    // Clamp
    state.player.repair.remaining = 0;
    state.player.health = 95;
    stepSimulation(state, input({ repairPressed: true }), TUNING.fixedDt);
    expect(state.player.health).toBe(TUNING.playerMaxHealth);
  });

  it('fires projectiles toward aim while held', () => {
    const state = createInitialState({ heroId: 'bee', fixture: 'combat' });
    steps(state, 3, input({ fireHeld: true, aimX: 5, aimZ: 14 }));
    expect(state.projectiles.some((p) => p.owner === 'player')).toBe(true);
  });

  it('enters and exits mech form by duration', () => {
    const state = createInitialState({ heroId: 'flamingo', fixture: 'combat' });
    stepSimulation(state, input({ mechPressed: true }), TUNING.fixedDt);
    expect(state.player.formState).toBe('entering');
    steps(state, Math.ceil(TUNING.mech.enterDuration / TUNING.fixedDt) + 2);
    expect(state.player.form).toBe('mech');
    expect(state.player.formState).toBe('mech');
    // Fast-forward duration
    state.player.mechDuration = TUNING.fixedDt;
    stepSimulation(state, input(), TUNING.fixedDt);
    expect(state.player.formState).toBe('exiting');
    steps(state, Math.ceil(TUNING.mech.exitDuration / TUNING.fixedDt) + 2);
    expect(state.player.form).toBe('astronaut');
    expect(state.player.mech.remaining).toBeGreaterThan(0);
  });
});

describe('abilities', () => {
  it('Boswell launches microdrones', () => {
    const state = createInitialState({ heroId: 'bee', fixture: 'combat' });
    stepSimulation(state, input({ abilityPressed: true }), TUNING.fixedDt);
    expect(state.projectiles.filter((p) => p.kind === 'drone').length).toBeGreaterThanOrEqual(4);
    expect(state.player.ability.remaining).toBeGreaterThan(0);
  });

  it('Fitzwilliam fires rail lance and damages in line', () => {
    const state = createInitialState({ heroId: 'flamingo', fixture: 'combat' });
    state.enemies = [];
    state.enemies.push({
      id: 99,
      defId: 'melee-blob',
      role: 'melee',
      x: state.player.x + 4,
      z: state.player.z,
      facingX: -1,
      facingZ: 0,
      health: 100,
      maxHealth: 100,
      state: 'chase',
      stateTimer: 0,
      attackCd: 1,
      hitFlash: 0,
      slowTimer: 0,
      slowMul: 1,
      spawnTimer: 0,
      radius: 0.4,
    });
    state.player.facingX = 1;
    state.player.facingZ = 0;
    stepSimulation(
      state,
      input({ abilityPressed: true, aimX: state.player.x + 10, aimZ: state.player.z }),
      TUNING.fixedDt,
    );
    expect(state.railSegments.length).toBeGreaterThan(0);
    expect(state.enemies.find((e) => e.id === 99)!.health).toBeLessThan(100);
  });

  it('Fortunato gravity pulse damages nearby', () => {
    const state = createInitialState({ heroId: 'frog', fixture: 'combat' });
    state.enemies = [];
    state.enemies.push({
      id: 7,
      defId: 'melee-blob',
      role: 'melee',
      x: state.player.x + 1,
      z: state.player.z + 1,
      facingX: 0,
      facingZ: -1,
      health: 80,
      maxHealth: 80,
      state: 'chase',
      stateTimer: 0,
      attackCd: 1,
      hitFlash: 0,
      slowTimer: 0,
      slowMul: 1,
      spawnTimer: 0,
      radius: 0.4,
    });
    stepSimulation(state, input({ abilityPressed: true }), TUNING.fixedDt);
    const target = state.enemies.find((e) => e.id === 7)!;
    expect(target.health).toBeLessThan(80);
    expect(target.slowTimer).toBeGreaterThan(0);
  });

  it('Rutherford marks rocket barrage targets', () => {
    const state = createInitialState({ heroId: 'red-panda', fixture: 'combat' });
    stepSimulation(state, input({ abilityPressed: true }), TUNING.fixedDt);
    expect(state.projectiles.filter((p) => p.kind === 'rocket').length).toBeGreaterThanOrEqual(5);
  });
});

describe('boss and encounter', () => {
  it('transitions boss phase below threshold', () => {
    const state = createInitialState({ heroId: 'bee', fixture: 'boss' });
    steps(state, Math.ceil(2 / TUNING.fixedDt));
    state.boss.active = true;
    state.boss.state = 'idle';
    state.boss.health = BOSS_DEMON.maxHealth * BOSS_DEMON.phase2Threshold;
    // Damage once more via projectile
    state.projectiles.push({
      id: 1000,
      kind: 'player',
      x: state.boss.x,
      z: state.boss.z,
      y: 1,
      vx: 0,
      vz: 0,
      damage: 20,
      radius: 2,
      life: 1,
      maxLife: 1,
      owner: 'player',
      pierce: 0,
      homing: false,
      color: '#fff',
      armTimer: 0,
      explodeRadius: 0,
    });
    stepSimulation(state, input(), TUNING.fixedDt);
    expect(state.boss.phase).toBe(2);
  });

  it('boss death spawns ship part and collection completes', () => {
    const state = createInitialState({ heroId: 'bee', fixture: 'boss' });
    state.boss.active = true;
    state.boss.state = 'idle';
    state.boss.health = 5;
    state.phase = 'boss';
    state.projectiles.push({
      id: 1001,
      kind: 'player',
      x: state.boss.x,
      z: state.boss.z,
      y: 1,
      vx: 0,
      vz: 0,
      damage: 50,
      radius: 2,
      life: 1,
      maxLife: 1,
      owner: 'player',
      pierce: 0,
      homing: false,
      color: '#fff',
      armTimer: 0,
      explodeRadius: 0,
    });
    stepSimulation(state, input(), TUNING.fixedDt);
    expect(state.boss.state).toBe('dead');
    // Wait death timer
    steps(state, Math.ceil(2 / TUNING.fixedDt));
    expect(state.shipPart.active).toBe(true);
    state.player.x = state.shipPart.x;
    state.player.z = state.shipPart.z;
    stepSimulation(state, input(), TUNING.fixedDt);
    expect(state.shipPart.collected).toBe(true);
    expect(state.phase).toBe('complete');
    const hud = buildHudSnapshot(state);
    expect(hud.complete).toBe(true);
  });
});

describe('projectile hit resolution', () => {
  it('player bolt damages enemy and is consumed', () => {
    const state = createInitialState({ heroId: 'bee', fixture: 'combat' });
    state.enemies = [];
    state.enemies.push({
      id: 3,
      defId: 'melee-blob',
      role: 'melee',
      x: state.player.x + 1,
      z: state.player.z,
      facingX: 0,
      facingZ: -1,
      health: 40,
      maxHealth: 40,
      state: 'chase',
      stateTimer: 0,
      attackCd: 1,
      hitFlash: 0,
      slowTimer: 0,
      slowMul: 1,
      spawnTimer: 0,
      radius: 0.5,
    });
    state.projectiles.push({
      id: 50,
      kind: 'player',
      x: state.player.x + 1,
      z: state.player.z,
      y: 1,
      vx: 0,
      vz: 0,
      damage: 15,
      radius: 0.3,
      life: 1,
      maxLife: 1,
      owner: 'player',
      pierce: 0,
      homing: false,
      color: '#ff0',
      armTimer: 0,
      explodeRadius: 0,
    });
    stepSimulation(state, input(), TUNING.fixedDt);
    expect(state.enemies.find((e) => e.id === 3)!.health).toBe(25);
    expect(state.projectiles.find((p) => p.id === 50)).toBeUndefined();
  });
});

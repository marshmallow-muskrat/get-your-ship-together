import { describe, expect, it } from 'vitest';
import { SURVIVOR } from './survivorContent';
import { createSurvivorState, emptyEnemy } from './survivorState';
import {
  EMPTY_SURVIVOR_INPUT,
  abilityCooldownMul,
  applyAegisBarrier,
  applyProtocolChoice,
  forceStartProtocol,
  shipCooldownFor,
  stepSurvivor,
} from './survivorSim';

function quietState() {
  const state = createSurvivorState('bee', null, 0x2300);
  state.nextBossTime = 1e9;
  state.nextCacheTime = 1e9;
  state.surge.nextSurgeAt = 1e9;
  state.spawnAcc = -1e9;
  state.player.invuln = 0;
  state.xpNext = 1e9;
  return state;
}

function addEnemy(state: ReturnType<typeof quietState>, x: number, z: number, opts?: { elite?: boolean; miniboss?: boolean }) {
  const e = emptyEnemy();
  e.id = state.nextId++;
  e.alive = true;
  e.x = x;
  e.z = z;
  e.radius = 0.6;
  e.health = e.maxHealth = opts?.miniboss ? 500 : opts?.elite ? 300 : 100;
  e.isElite = !!opts?.elite;
  e.isMiniboss = !!opts?.miniboss;
  e.role = opts?.miniboss ? 'miniboss' : opts?.elite ? 'elite' : 'fodder';
  e.defId = opts?.miniboss ? 'miniboss' : opts?.elite ? 'elite' : 'basic';
  state.enemies.push(e);
  return e;
}

describe('endless-2.3.0 completed Protocol presentation contracts', () => {
  it('ordinary Aegis creates immediate safety as well as a barrier', () => {
    const state = quietState();
    const enemy = addEnemy(state, 3, 0, { elite: true });
    applyAegisBarrier(state);
    expect(state.player.shieldPoints).toBeGreaterThan(0);
    expect(state.player.invuln).toBeGreaterThanOrEqual(SURVIVOR.aegis.invulnOnSelect);
    expect(Math.hypot(enemy.kbX, enemy.kbZ)).toBeGreaterThan(0);
    expect(state.effects.some((e) => e.kind === 'repulsor' && e.radius === SURVIVOR.aegis.pulseRadius)).toBe(true);
    expect(SURVIVOR.aegis.invulnOnSelect).toBe(3);
    expect(state.player.shieldTime).toBe(SURVIVOR.shieldDuration);
  });

  it('Mega Cache offers exactly the three exclusive Mega Protocols', () => {
    const state = quietState();
    state.cache = { active: true, x: 0, z: 0, life: 999, maxLife: 999, mega: true, potency: 1.5 };
    stepSurvivor(state, EMPTY_SURVIVOR_INPUT, SURVIVOR.fixedDt);
    expect(state.phase).toBe('protocol');
    expect(state.protocolChoices.map((c) => c.protocolId)).toEqual([
      'carrier-wing',
      'cleanup-crew',
      'singularity-engine',
    ]);
  });

  it('removes owned armaments from later Mega Cache choices and lets all three stack', () => {
    const state = quietState();
    for (const expected of [
      ['carrier-wing', 'cleanup-crew', 'singularity-engine'],
      ['cleanup-crew', 'singularity-engine'],
      ['singularity-engine'],
    ]) {
      state.phase = 'playing';
      state.cache = { active: true, x: 0, z: 0, life: 999, maxLife: 999, mega: true, potency: 1.5 };
      stepSurvivor(state, EMPTY_SURVIVOR_INPUT, SURVIVOR.fixedDt);
      expect(state.protocolChoices.map((choice) => choice.protocolId)).toEqual(expected);
      applyProtocolChoice(state, 0);
    }
    expect(state.megaProtocol.owned).toEqual([
      'carrier-wing',
      'cleanup-crew',
      'singularity-engine',
    ]);
    expect(state.allies).toHaveLength(3);
    expect(state.megaProtocol.remaining).toBe(Infinity);
  });

  it('does not spend a one-card Mega Cache when a missing number key is pressed', () => {
    const state = quietState();
    forceStartProtocol(state, 'carrier-wing');
    forceStartProtocol(state, 'cleanup-crew');
    state.phase = 'playing';
    state.cache = { active: true, x: 0, z: 0, life: 999, maxLife: 999, mega: true, potency: 1.5 };
    stepSurvivor(state, EMPTY_SURVIVOR_INPUT, SURVIVOR.fixedDt);
    expect(state.protocolChoices.map((choice) => choice.protocolId)).toEqual(['singularity-engine']);
    applyProtocolChoice(state, 1);
    expect(state.phase).toBe('protocol');
    expect(state.protocolChoices).toHaveLength(1);
    expect(state.megaProtocol.owned).not.toContain('singularity-engine');
    applyProtocolChoice(state, 0);
    expect(state.megaProtocol.owned).toContain('singularity-engine');
    expect(state.phase).toBe('playing');
  });

  it('offers only Temporal Refit after all armaments and stacks 10% cooldown cuts to a 50% floor', () => {
    const state = quietState();
    forceStartProtocol(state, 'carrier-wing');
    forceStartProtocol(state, 'cleanup-crew');
    forceStartProtocol(state, 'singularity-engine');
    state.cache = { active: true, x: 0, z: 0, life: 999, maxLife: 999, mega: true, potency: 1.5 };
    stepSurvivor(state, EMPTY_SURVIVOR_INPUT, SURVIVOR.fixedDt);
    expect(state.protocolChoices.map((choice) => choice.protocolId)).toEqual(['mega-cooldown-refit']);
    state.player.mechCd = state.player.mechCdMax = 30;
    state.player.shipCd = 30;
    state.player.dodgeCd = 10;
    state.player.repulsorCd = 12;
    applyProtocolChoice(state, 0);
    expect(state.megaProtocol.cooldownRefits).toBe(1);
    expect(abilityCooldownMul(state)).toBeCloseTo(0.9, 6);
    expect(state.player.shipCd).toBeCloseTo(27, 6);
    expect(state.player.dodgeCd).toBeCloseTo(9, 6);

    for (let i = 0; i < 9; i += 1) forceStartProtocol(state, 'mega-cooldown-refit');
    expect(abilityCooldownMul(state)).toBe(SURVIVOR.megaProtocol.abilityCooldownFloor);
    expect(shipCooldownFor(state)).toBeCloseTo(15, 6);
  });

  it('Cleanup Crew is permanent and leaves ordinary Mech untouched', () => {
    const state = quietState();
    state.player.mechCd = 30;
    state.player.mechCdMax = 45;
    forceStartProtocol(state, 'cleanup-crew', 1.5);
    expect(state.player.form).toBe('astronaut');
    expect(state.player.mechCd).toBe(30);
    stepSurvivor(state, EMPTY_SURVIVOR_INPUT, 0.1);
    expect(state.player.mechCd).toBeCloseTo(29.9, 4);
    expect(state.megaProtocol.remaining).toBe(Infinity);
    expect(state.megaProtocol.owned).toEqual(['cleanup-crew']);
    expect(state.allies).toHaveLength(3);
  });

  it('Fleet Annihilation visibly schedules three passes and erases ordinary targets in a lane', () => {
    const state = quietState();
    const target = addEnemy(state, 0, 0);
    forceStartProtocol(state, 'carrier-wing', 1.5);
    stepSurvivor(state, EMPTY_SURVIVOR_INPUT, SURVIVOR.megaProtocol.fleetWarn + 0.02);
    expect(state.effects.some((e) => e.kind === 'fleet-ship')).toBe(true);
    stepSurvivor(state, EMPTY_SURVIVOR_INPUT, SURVIVOR.megaProtocol.fleetTravel * 0.5 + 0.02);
    expect(target.alive).toBe(false);
    expect(state.megaProtocol.remaining).toBe(Infinity);
  });

  it('Singularity Engine is a permanent damage armament, not an Energy recall', () => {
    const state = quietState();
    state.pickups.push(
      { id: 101, kind: 'xp', x: 8, z: 0, value: 17, active: true, magnetized: false, life: Infinity },
      { id: 102, kind: 'repair', x: 7, z: 0, value: 20, active: true, magnetized: false, life: 48 },
    );
    forceStartProtocol(state, 'singularity-engine', 1.5);
    state.pickups.push({ id: 103, kind: 'xp', x: 7, z: 0, value: 99, active: true, magnetized: false, life: Infinity });
    for (let i = 0; i < 360; i += 1) stepSurvivor(state, EMPTY_SURVIVOR_INPUT, SURVIVOR.fixedDt);
    expect(state.xp).toBe(0);
    expect(state.pickups.find((p) => p.id === 101)?.active).toBe(true);
    expect(state.pickups.find((p) => p.id === 102)?.active).toBe(true);
    expect(state.pickups.find((p) => p.id === 103)?.active).toBe(true);
  });

  it('Singularity Engine pulls first and resolves one visible collapse second', () => {
    const state = quietState();
    state.weapons = [];
    state.player.invuln = 1e9;
    const target = addEnemy(state, 9, 0);
    target.health = target.maxHealth = 10_000;
    forceStartProtocol(state, 'singularity-engine', 1.5);
    const startDistance = Math.hypot(target.x - state.megaProtocol.x, target.z - state.megaProtocol.z);
    const before = target.health;
    for (let i = 0; i < 45; i += 1) stepSurvivor(state, EMPTY_SURVIVOR_INPUT, SURVIVOR.fixedDt);
    expect(state.megaProtocol.singularityPhase).toBe('pull');
    expect(target.health).toBe(before);
    expect(Math.hypot(target.x - state.megaProtocol.x, target.z - state.megaProtocol.z)).toBeLessThan(startDistance);
    for (let i = 0; i < 60; i += 1) stepSurvivor(state, EMPTY_SURVIVOR_INPUT, SURVIVOR.fixedDt);
    expect(target.health).toBeLessThan(before);
    expect(state.effects.some((e) => e.kind === 'singularity-collapse')).toBe(true);
  });

  it('does not block ordinary level-up modals while a Titan armament is active', () => {
    const state = quietState();
    state.xpNext = 5;
    state.pickups.push({ id: 201, kind: 'xp', x: 1, z: 0, value: 20, active: true, magnetized: false, life: Infinity });
    forceStartProtocol(state, 'singularity-engine', 1.5);
    for (let i = 0; i < 120; i += 1) stepSurvivor(state, EMPTY_SURVIVOR_INPUT, SURVIVOR.fixedDt);
    expect(state.megaProtocol.id).toBe('singularity-engine');
    expect(state.phase).toBe('levelup');
  });
});

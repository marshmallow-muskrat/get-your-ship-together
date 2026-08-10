import { describe, expect, it } from 'vitest';
import { SURVIVOR } from './survivorContent';
import { createSurvivorState, emptyEnemy } from './survivorState';
import {
  EMPTY_SURVIVOR_INPUT,
  applyAegisBarrier,
  forceStartProtocol,
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
      'starbreaker-array',
      'singularity-engine',
    ]);
  });

  it('Starbreaker is a five-minute armament and leaves ordinary Mech untouched', () => {
    const state = quietState();
    state.player.mechCd = 30;
    state.player.mechCdMax = 45;
    forceStartProtocol(state, 'starbreaker-array', 1.5);
    expect(state.player.form).toBe('astronaut');
    expect(state.player.mechCd).toBe(30);
    stepSurvivor(state, EMPTY_SURVIVOR_INPUT, 0.1);
    expect(state.player.mechCd).toBeCloseTo(29.9, 4);
    expect(state.megaProtocol.remaining).toBeGreaterThan(299);
    expect(state.effects.some((e) => e.kind === 'rail')).toBe(true);
  });

  it('Fleet Annihilation visibly schedules three passes and erases ordinary targets in a lane', () => {
    const state = quietState();
    const target = addEnemy(state, 0, 0);
    forceStartProtocol(state, 'carrier-wing', 1.5);
    stepSurvivor(state, EMPTY_SURVIVOR_INPUT, SURVIVOR.megaProtocol.fleetWarn + 0.02);
    expect(state.effects.some((e) => e.kind === 'fleet-ship')).toBe(true);
    stepSurvivor(state, EMPTY_SURVIVOR_INPUT, SURVIVOR.megaProtocol.fleetTravel * 0.5 + 0.02);
    expect(target.alive).toBe(false);
    expect(state.megaProtocol.remaining).toBeGreaterThan(298);
  });

  it('Singularity Engine is a non-upgradable five-minute damage armament, not an Energy recall', () => {
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

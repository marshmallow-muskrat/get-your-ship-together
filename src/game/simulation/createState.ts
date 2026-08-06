import { HEROES, type HeroId } from '../content/heroes';
import { BOSS_DEMON, type EnemyDef } from '../content/enemies';
import { TUNING } from '../content/combatTuning';
import { LEVEL } from './levelLayout';
import type { EnemyState, GameState, PlayerState } from './types';

export interface CreateStateOptions {
  heroId: HeroId;
  fixture?: 'combat' | 'boss' | 'mech' | null;
}

function createPlayer(heroId: HeroId): PlayerState {
  const hero = HEROES[heroId];
  return {
    heroId,
    form: 'astronaut',
    formState: 'astronaut',
    formTimer: 0,
    x: LEVEL.spawn.x,
    z: LEVEL.spawn.z,
    facingX: 1,
    facingZ: 0,
    vx: 0,
    vz: 0,
    health: TUNING.playerMaxHealth,
    maxHealth: TUNING.playerMaxHealth,
    invulnTimer: 0,
    fireCooldown: 0,
    dodge: { remaining: 0, duration: TUNING.dodge.cooldown },
    dodgeActive: 0,
    repair: { remaining: 0, duration: TUNING.repair.cooldown },
    ability: { remaining: 0, duration: hero.abilityCooldown },
    mech: { remaining: 0, duration: TUNING.mech.cooldown },
    mechDuration: 0,
    hitFlash: 0,
    alive: true,
  };
}

export function createInitialState(options: CreateStateOptions): GameState {
  const hero = HEROES[options.heroId];
  const state: GameState = {
    time: 0,
    tick: 0,
    seed: 1,
    phase: 'intro',
    phaseTimer: 0,
    objective: 'Explore the facility. Stay sharp.',
    player: createPlayer(options.heroId),
    enemies: [],
    boss: {
      active: false,
      x: LEVEL.bossSpawn.x,
      z: LEVEL.bossSpawn.z,
      facingX: -1,
      facingZ: 0,
      health: BOSS_DEMON.maxHealth,
      maxHealth: BOSS_DEMON.maxHealth,
      phase: 1,
      state: 'intro',
      pattern: null,
      stateTimer: 0,
      patternTimer: 0,
      chargeDirX: -1,
      chargeDirZ: 0,
      hitFlash: 0,
      telegraphRadius: 0,
    },
    projectiles: [],
    effects: [],
    shipPart: {
      active: false,
      collected: false,
      x: LEVEL.shipPart.x,
      z: LEVEL.shipPart.z,
      radius: 0.9,
    },
    obstacles: LEVEL.obstacles.map((o) => ({ ...o })),
    walkable: LEVEL.walkable.map((w) => ({ ...w })),
    hitstop: 0,
    paused: false,
    muted: false,
    checkpoint: 'start',
    nextEntityId: 1,
    killCount: 0,
    waveIndex: 0,
    bossGateOpen: false,
    railSegments: [],
    abilityId: hero.abilityId,
    accent: hero.accent,
  };

  applyFixture(state, options.fixture ?? null);
  return state;
}

export function spawnWave(state: GameState, waveIndex0: number): void {
  const wave = LEVEL.waves[waveIndex0];
  if (!wave) return;
  state.waveIndex = waveIndex0 + 1;
  state.objective = wave.objective;
  state.phaseTimer = 0;
  for (const s of wave.spawns) {
    pushEnemy(state, s.def, s.x, s.z);
  }
}

function pushEnemy(state: GameState, def: EnemyDef, x: number, z: number): void {
  state.enemies.push(makeEnemy(state.nextEntityId++, def, x, z));
}

function applyFixture(state: GameState, fixture: CreateStateOptions['fixture']): void {
  if (!fixture) return;
  if (fixture === 'combat') {
    state.phase = 'wave';
    state.player.x = 26;
    state.player.z = 0;
    state.player.invulnTimer = 8;
    spawnWave(state, 0);
  } else if (fixture === 'boss') {
    state.phase = 'boss_intro';
    state.phaseTimer = 0;
    state.objective = 'Defeat the facility warden.';
    state.player.x = 50;
    state.player.z = 0;
    state.player.invulnTimer = 8;
    state.bossGateOpen = true;
    state.checkpoint = 'pre_boss';
    state.boss.active = true;
    state.boss.state = 'intro';
    state.boss.stateTimer = 1.8;
  } else if (fixture === 'mech') {
    state.phase = 'explore';
    state.player.x = 26;
    state.player.z = 0;
    state.player.form = 'mech';
    state.player.formState = 'mech';
    state.player.mechDuration = TUNING.mech.duration;
    state.player.mech.remaining = 0;
  }
}

export function restartFromCheckpoint(state: GameState): GameState {
  const next = createInitialState({
    heroId: state.player.heroId,
    fixture: state.checkpoint === 'pre_boss' ? 'boss' : null,
  });
  next.muted = state.muted;
  return next;
}

function makeEnemy(id: number, def: EnemyDef, x: number, z: number): EnemyState {
  return {
    id,
    defId: def.id,
    role: def.role,
    x,
    z,
    facingX: -1,
    facingZ: 0,
    health: def.maxHealth,
    maxHealth: def.maxHealth,
    state: 'spawn',
    stateTimer: 0.45,
    attackCd: 1.4,
    hitFlash: 0,
    slowTimer: 0,
    slowMul: 1,
    spawnTimer: 0.45,
    radius: def.colliderRadius,
  };
}

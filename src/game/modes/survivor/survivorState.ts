import type { HeroId, PlayerForm } from '../../content/heroes';
import { HEROES } from '../../content/heroes';
import {
  SURVIVOR,
  type PassiveId,
  type SurvivorFixture,
  type WeaponId,
  heroStarterWeapon,
} from './survivorContent';

export type SurvivorPhase = 'playing' | 'levelup' | 'supply' | 'victory' | 'defeat' | 'paused';

export interface SurvivorEnemy {
  id: number;
  defId: string;
  x: number;
  z: number;
  vx: number;
  vz: number;
  health: number;
  maxHealth: number;
  radius: number;
  role: string;
  hitFlash: number;
  attackCd: number;
  alive: boolean;
  isElite: boolean;
  xp: number;
  /** For ranged windup */
  windup: number;
  facingX: number;
  facingZ: number;
}

export interface SurvivorProjectile {
  id: number;
  kind: 'bolt' | 'drone' | 'rocket' | 'enemy';
  weaponId: WeaponId | null;
  x: number;
  z: number;
  vx: number;
  vz: number;
  damage: number;
  radius: number;
  life: number;
  pierce: number;
  homing: boolean;
  owner: 'player' | 'enemy';
  color: string;
  armTimer: number;
  explodeRadius: number;
  active: boolean;
}

export interface SurvivorPickup {
  id: number;
  kind: 'xp' | 'repair' | 'supply';
  x: number;
  z: number;
  value: number;
  active: boolean;
  magnetized: boolean;
}

export interface SurvivorWeaponSlot {
  weaponId: WeaponId;
  level: number;
  cooldown: number;
}

export interface SurvivorEffect {
  id: number;
  kind: 'impact' | 'death' | 'pulse' | 'rail' | 'levelup' | 'pickup' | 'transform' | 'telegraph' | 'muzzle';
  x: number;
  z: number;
  life: number;
  maxLife: number;
  color: string;
  scale: number;
  radius?: number;
  facingX?: number;
  facingZ?: number;
  length?: number;
  width?: number;
}

export interface UpgradeChoice {
  kind: 'weapon' | 'passive' | 'new-weapon';
  id: string;
  title: string;
  body: string;
  weaponId?: WeaponId;
  passiveId?: PassiveId;
}

export interface SurvivorBoss {
  active: boolean;
  x: number;
  z: number;
  health: number;
  maxHealth: number;
  state: 'idle' | 'windup' | 'active' | 'recover' | 'dead';
  pattern: 'pulse' | 'line' | 'fan' | 'summon' | null;
  timer: number;
  facingX: number;
  facingZ: number;
  telegraphR: number;
  chargeX: number;
  chargeZ: number;
  hitFlash: number;
}

export interface SurvivorState {
  heroId: HeroId;
  accent: string;
  time: number;
  seed: number;
  rng: number;
  phase: SurvivorPhase;
  player: {
    x: number;
    z: number;
    facingX: number;
    facingZ: number;
    health: number;
    maxHealth: number;
    form: PlayerForm;
    formTimer: number;
    mechCharge: number;
    mechDuration: number;
    invuln: number;
    hitFlash: number;
    alive: boolean;
  };
  weapons: SurvivorWeaponSlot[];
  passives: Partial<Record<PassiveId, number>>;
  enemies: SurvivorEnemy[];
  projectiles: SurvivorProjectile[];
  pickups: SurvivorPickup[];
  effects: SurvivorEffect[];
  rails: Array<{ x0: number; z0: number; x1: number; z1: number; life: number; color: string }>;
  boss: SurvivorBoss;
  level: number;
  xp: number;
  xpNext: number;
  kills: number;
  choices: UpgradeChoice[];
  spawnAcc: number;
  eliteTimer: number;
  nextId: number;
  enemyCap: number;
  muted: boolean;
  metrics: {
    fps: number;
    frameMs: number;
    enemies: number;
    projectiles: number;
    pickups: number;
  };
}

export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function createSurvivorState(
  heroId: HeroId,
  fixture: SurvivorFixture,
  seed = 0x5a17,
): SurvivorState {
  const hero = HEROES[heroId];
  const starter = heroStarterWeapon(heroId);
  const state: SurvivorState = {
    heroId,
    accent: hero.accent,
    time: 0,
    seed,
    rng: seed,
    phase: 'playing',
    player: {
      x: 0,
      z: 0,
      facingX: 1,
      facingZ: 0,
      health: SURVIVOR.playerMaxHealth,
      maxHealth: SURVIVOR.playerMaxHealth,
      form: 'astronaut',
      formTimer: 0,
      mechCharge: 0,
      mechDuration: 0,
      invuln: 1.2,
      hitFlash: 0,
      alive: true,
    },
    weapons: [{ weaponId: starter, level: 1, cooldown: 0.4 }],
    passives: {},
    enemies: [],
    projectiles: [],
    pickups: [],
    effects: [],
    rails: [],
    boss: {
      active: false,
      x: 0,
      z: 0,
      health: 0,
      maxHealth: 0,
      state: 'idle',
      pattern: null,
      timer: 0,
      facingX: -1,
      facingZ: 0,
      telegraphR: 0,
      chargeX: 0,
      chargeZ: 0,
      hitFlash: 0,
    },
    level: 1,
    xp: 0,
    xpNext: 12,
    kills: 0,
    choices: [],
    spawnAcc: 0,
    eliteTimer: 18,
    nextId: 1,
    enemyCap: SURVIVOR.enemyCap,
    muted: false,
    metrics: { fps: 60, frameMs: 16, enemies: 0, projectiles: 0, pickups: 0 },
  };

  applyFixture(state, fixture);
  return state;
}

function applyFixture(state: SurvivorState, fixture: SurvivorFixture): void {
  if (!fixture || fixture === 'survivor-start') return;
  if (fixture === 'survivor-levelup') {
    state.xp = state.xpNext;
    // Choices filled on first sim step via openLevelUp path.
  } else if (fixture === 'survivor-horde') {
    state.time = 300;
    state.enemyCap = 200;
  } else if (fixture === 'survivor-mech') {
    state.player.mechCharge = 1;
    state.time = 120;
  } else if (fixture === 'survivor-boss') {
    state.time = SURVIVOR.bossTime;
  }
}

export function nextEntityId(state: SurvivorState): number {
  const id = state.nextId;
  state.nextId += 1;
  return id;
}

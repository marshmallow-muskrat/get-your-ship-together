import type { HeroId } from '../../content/heroes';
import { HEROES } from '../../content/heroes';
import {
  SURVIVOR,
  type BossPhase,
  type PassiveId,
  type SurvivorFixture,
  type SurvivorForm,
  type WeaponId,
  heroStarterWeapon,
  xpForLevel,
} from './survivorContent';

export type SurvivorPhase = 'playing' | 'levelup' | 'supply' | 'victory' | 'defeat' | 'paused';

export interface SurvivorEnemy {
  id: number;
  defId: string;
  x: number;
  z: number;
  vx: number;
  vz: number;
  /** Knockback impulse (damps over time). */
  kbX: number;
  kbZ: number;
  health: number;
  maxHealth: number;
  radius: number;
  role: string;
  hitFlash: number;
  attackCd: number;
  alive: boolean;
  isElite: boolean;
  isMiniboss: boolean;
  xp: number;
  windup: number;
  facingX: number;
  facingZ: number;
  /** Spawned difficulty multipliers. */
  healthMul: number;
  damageMul: number;
  speedMul: number;
  /** Cooldown before hazard (wake/puddle) can re-hit this enemy. */
  hazardHitCd: number;
  /** Miniboss special telegraph timer. */
  specialCd: number;
  specialWindup: number;
}

export type ProjectileKind = 'bolt' | 'drone' | 'rocket' | 'enemy' | 'bioplasma';

export interface SurvivorProjectile {
  id: number;
  kind: ProjectileKind;
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
  splash: number;
  puddleRadius: number;
  puddleLife: number;
  puddleDamage: number;
  bounceLeft: number;
  splitOnHit: number;
  active: boolean;
}

export type HazardKind = 'wake' | 'puddle';

export interface SurvivorHazard {
  id: number;
  kind: HazardKind;
  x: number;
  z: number;
  radius: number;
  life: number;
  maxLife: number;
  damage: number;
  color: string;
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
  kind:
    | 'impact'
    | 'death'
    | 'pulse'
    | 'rail'
    | 'levelup'
    | 'pickup'
    | 'transform'
    | 'telegraph'
    | 'muzzle'
    | 'repulsor'
    | 'wake';
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
  phase: BossPhase;
  repulsorCd: number;
  phaseAnnounced: number;
}

export interface SurvivorMiniboss {
  spawned: boolean;
  alive: boolean;
  enemyId: number;
  name: string;
  health: number;
  maxHealth: number;
}

/** Presentation-only damage event (does not affect sim authority). */
export type DamageNumberKind = 'enemy' | 'player' | 'boss' | 'large' | 'ability' | 'kill';

export interface DamageEvent {
  id: number;
  x: number;
  z: number;
  amount: number;
  kind: DamageNumberKind;
  life: number;
  maxLife: number;
  /** Aggregate key while buffering. */
  targetKey: string;
  /** Presentation scale pop intensity 0–1 */
  pop: number;
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
    form: SurvivorForm;
    formTimer: number;
    mechCharge: number;
    mechDuration: number;
    shipDuration: number;
    repulsorCd: number;
    shipCd: number;
    wakeTimer: number;
    bodyHitCd: number;
    exhaustTickCd: number;
    invuln: number;
    hitFlash: number;
    alive: boolean;
  };
  weapons: SurvivorWeaponSlot[];
  passives: Partial<Record<PassiveId, number>>;
  enemies: SurvivorEnemy[];
  projectiles: SurvivorProjectile[];
  hazards: SurvivorHazard[];
  pickups: SurvivorPickup[];
  effects: SurvivorEffect[];
  rails: Array<{ x0: number; z0: number; x1: number; z1: number; life: number; color: string }>;
  boss: SurvivorBoss;
  miniboss: SurvivorMiniboss;
  damageEvents: DamageEvent[];
  /** Pending damage aggregation buffer. */
  damageAgg: Map<
    string,
    { amount: number; x: number; z: number; kind: DamageEvent['kind']; timer: number; pop: number }
  >;
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

function emptyEnemy(): SurvivorEnemy {
  return {
    id: 0,
    defId: 'basic',
    x: 0,
    z: 0,
    vx: 0,
    vz: 0,
    kbX: 0,
    kbZ: 0,
    health: 1,
    maxHealth: 1,
    radius: 0.4,
    role: 'basic',
    hitFlash: 0,
    attackCd: 0,
    alive: false,
    isElite: false,
    isMiniboss: false,
    xp: 1,
    windup: 0,
    facingX: 0,
    facingZ: -1,
    healthMul: 1,
    damageMul: 1,
    speedMul: 1,
    hazardHitCd: 0,
    specialCd: 0,
    specialWindup: 0,
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
      shipDuration: 0,
      repulsorCd: 0,
      shipCd: 0,
      wakeTimer: 0,
      bodyHitCd: 0,
      exhaustTickCd: 0,
      invuln: 1.2,
      hitFlash: 0,
      alive: true,
    },
    weapons: [{ weaponId: starter, level: 1, cooldown: 0.4 }],
    passives: {},
    enemies: [],
    projectiles: [],
    hazards: [],
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
      phase: 1,
      repulsorCd: 0,
      phaseAnnounced: 1,
    },
    miniboss: {
      spawned: false,
      alive: false,
      enemyId: -1,
      name: 'Containment Warden',
      health: 0,
      maxHealth: 0,
    },
    damageEvents: [],
    damageAgg: new Map(),
    level: 1,
    xp: 0,
    xpNext: xpForLevel(1),
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

function grantBuild(
  state: SurvivorState,
  weapons: Array<{ id: WeaponId; level: number }>,
  passives: Partial<Record<PassiveId, number>> = {},
  level = 8,
): void {
  state.weapons = weapons.map((w) => ({ weaponId: w.id, level: w.level, cooldown: 0.2 }));
  state.passives = { ...passives };
  state.level = level;
  state.xp = 0;
  state.xpNext = xpForLevel(level);
  if (passives['max-health']) {
    const bonus = (passives['max-health'] ?? 0) * 20;
    state.player.maxHealth = SURVIVOR.playerMaxHealth + bonus;
    state.player.health = state.player.maxHealth;
  }
}

function applyFixture(state: SurvivorState, fixture: SurvivorFixture): void {
  if (!fixture || fixture === 'survivor-start') return;
  if (fixture === 'survivor-levelup') {
    state.xp = state.xpNext;
  } else if (fixture === 'survivor-horde') {
    state.time = 300;
    state.enemyCap = 200;
    grantBuild(
      state,
      [
        { id: state.weapons[0]!.weaponId, level: 3 },
        { id: 'pulse', level: 2 },
      ],
      { 'weapon-haste': 1, area: 1 },
      6,
    );
  } else if (fixture === 'survivor-mech') {
    state.player.mechCharge = 1;
    state.time = 120;
  } else if (fixture === 'survivor-boss') {
    state.time = SURVIVOR.bossTime;
    grantBuild(
      state,
      [
        { id: heroStarterWeapon(state.heroId), level: 4 },
        { id: 'pulse', level: 3 },
        { id: 'microdrone', level: 2 },
        { id: 'rail', level: 2 },
      ],
      { 'max-health': 2, 'weapon-haste': 2, area: 2, 'move-speed': 1 },
      12,
    );
    state.player.health = state.player.maxHealth;
    state.player.mechCharge = 0.85;
    state.player.invuln = 3;
  } else if (fixture === 'survivor-repulsor') {
    state.player.repulsorCd = 0;
    state.player.invuln = 8;
    state.time = 90;
  } else if (fixture === 'survivor-ship') {
    state.player.shipCd = 0;
    state.player.invuln = 6;
    state.time = 60;
  } else if (fixture === 'survivor-damage') {
    state.time = 100;
    state.player.invuln = 5;
    grantBuild(state, [{ id: 'pulse', level: 4 }, { id: 'bioplasma', level: 3 }], {}, 5);
  } else if (fixture === 'survivor-miniboss') {
    // Start just past the spawn threshold so the first sim step can ensure it
    state.time = SURVIVOR.minibossTime;
    state.player.invuln = 4;
    grantBuild(
      state,
      [
        { id: heroStarterWeapon(state.heroId), level: 3 },
        { id: 'pulse', level: 2 },
      ],
      { 'max-health': 1, area: 1 },
      7,
    );
  }
}

export function nextEntityId(state: SurvivorState): number {
  const id = state.nextId;
  state.nextId += 1;
  return id;
}

export { emptyEnemy };

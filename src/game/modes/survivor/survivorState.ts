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

export type SurvivorPhase = 'playing' | 'levelup' | 'protocol' | 'supply' | 'victory' | 'defeat' | 'paused';

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

export type ProjectileKind =
  | 'bolt'
  | 'drone'
  | 'rocket'
  | 'enemy'
  | 'bioplasma'
  | 'boss-orb'
  | 'boss-fan'
  | 'orbital-marker';

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
  /** Visual scale for rendering (may exceed collision radius). */
  visualRadius: number;
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
  /** Boss that spawned this projectile (for cleanup). */
  sourceBossId: number;
  /** One-hit flag for orbs. */
  hitPlayer: boolean;
  splitDone: boolean;
}

export type HazardKind = 'wake' | 'puddle' | 'contamination' | 'spore' | 'fissure';

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
  owner: 'player' | 'enemy';
  tickCd: number;
  armTimer: number;
}

export interface SurvivorPickup {
  id: number;
  kind: 'xp' | 'repair' | 'supply';
  x: number;
  z: number;
  value: number;
  active: boolean;
  magnetized: boolean;
  /** Remaining life for expiring pickups (repair). Infinity for non-expiring. */
  life: number;
}

export interface SurvivorWeaponSlot {
  weaponId: WeaponId;
  level: number;
  cooldown: number;
  /** Deterministic boss-focus debt accumulator [0,1). */
  focusDebt: number;
  prototype: boolean;
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
    | 'wake'
    | 'heal'
    | 'shield'
    | 'arc'
    | 'orbital'
    | 'cache'
    | 'mega'
    | 'beam'
    | 'gunship';
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

export type UpgradeChoiceKind = 'weapon' | 'passive' | 'new-weapon' | 'protocol';

export interface UpgradeChoice {
  kind: UpgradeChoiceKind;
  id: string;
  title: string;
  body: string;
  weaponId?: WeaponId;
  passiveId?: PassiveId;
  protocolId?: import('./survivorContent').ProtocolId;
}

export interface ActiveTempBuff {
  id: import('./survivorContent').TempBuffId;
  remaining: number;
  stacks: number;
}

export interface SurvivorBoss {
  id: number;
  /** 1-based schedule index */
  index: number;
  defId: string;
  displayName: string;
  active: boolean;
  isMega: boolean;
  spawnTime: number;
  x: number;
  z: number;
  health: number;
  maxHealth: number;
  state: 'idle' | 'windup' | 'active' | 'recover' | 'dead';
  pattern: import('./survivorContent').BossPatternId | null;
  timer: number;
  facingX: number;
  facingZ: number;
  telegraphR: number;
  /** Locked telegraph origin/direction (must not retarget after windup). */
  lockX: number;
  lockZ: number;
  lockFx: number;
  lockFz: number;
  chargeX: number;
  chargeZ: number;
  hitFlash: number;
  phase: BossPhase;
  repulsorCd: number;
  phaseAnnounced: number;
  healthMul: number;
  damageMul: number;
  recoveryMul: number;
  moveMul: number;
  fanAdd: number;
  summonAdd: number;
  breachEmpower: number;
  colliderRadius: number;
  visualScale: number;
  uniquePattern: import('./survivorContent').BossPatternId;
  /** Generic scalar for sweep progress / sequence index */
  patternParam: number;
  /** One-shot action flag within active phase (fan volley, summon, etc.). */
  patternTriggered: boolean;
  /** Elapsed time in current pattern phase (windup/active). */
  patternElapsed: number;
  /** Per-pattern hit throttle for continuous beams/rings. */
  patternHitCd: number;
  /** Attacks completed since last unique-pattern use. */
  attacksSinceUnique: number;
  /** Attacks completed since last mega-only pattern. */
  attacksSinceMega: number;
  /** Previous completed pattern id for anti-repeat. */
  previousPattern: import('./survivorContent').BossPatternId | null;
  /** Total attack cycles completed this life. */
  attacksCompleted: number;
  /** Cataclysm / multi-zone payload (up to 5 zones). */
  zones: Array<{ x: number; z: number; r: number; detonated: boolean }>;
  /** Spore mine / sequence entity ids owned by this boss for cleanup. */
  ownedMineIds: number[];
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
export type DamageNumberKind = 'enemy' | 'player' | 'boss' | 'large' | 'ability' | 'kill' | 'heal' | 'absorb';

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
    dodgeCd: number;
    dodgeActive: number;
    dodgeDirX: number;
    dodgeDirZ: number;
    wakeTimer: number;
    bodyHitCd: number;
    exhaustTickCd: number;
    invuln: number;
    hitFlash: number;
    alive: boolean;
    /** @deprecated hit-count barrier removed; use shieldPoints. */
    barrierHits: number;
    shieldPoints: number;
    shieldMax: number;
    shieldTime: number;
    damageMul: number;
    mechReadyAnnounced: boolean;
    slowTimer: number;
    slowMul: number;
  };
  weapons: SurvivorWeaponSlot[];
  /** Ordinary + prototype weapons (prototypes flagged on slot). */
  passives: Partial<Record<PassiveId, number>>;
  tempBuffs: ActiveTempBuff[];
  protocolActive: Array<{ id: import('./survivorContent').ProtocolId; remaining: number; potency: number }>;
  protocolChoices: UpgradeChoice[];
  cache: {
    active: boolean;
    x: number;
    z: number;
    life: number;
    maxLife: number;
    mega: boolean;
    potency: number;
  };
  nextCacheTime: number;
  unlocks: {
    arc: boolean;
    orbital: boolean;
    arcOffered: boolean;
    orbitalOffered: boolean;
    arcBanner: number;
    orbitalBanner: number;
  };
  megaBanner: number;
  megasDefeated: number;
  /** Temporary gunship presentation state. */
  gunship: {
    active: boolean;
    t: number;
    /** Total lifecycle including warning. */
    duration: number;
    /** Time spent in warning lane before damage. */
    warnDuration: number;
    x0: number;
    z0: number;
    x1: number;
    z1: number;
    fireCd: number;
    potency: number;
    /** World-space ship position for renderer. */
    x: number;
    z: number;
    facingX: number;
    facingZ: number;
    /** True while damage pulses are active. */
    firing: boolean;
  };
  rocketProtocol: { active: boolean; remaining: number; fireCd: number; potency: number };

  enemies: SurvivorEnemy[];
  projectiles: SurvivorProjectile[];
  hazards: SurvivorHazard[];
  pickups: SurvivorPickup[];
  effects: SurvivorEffect[];
  rails: Array<{ x0: number; z0: number; x1: number; z1: number; life: number; color: string }>;
  /** Concurrent bosses (cap SURVIVOR.maxSimultaneousBosses). */
  bosses: SurvivorBoss[];
  /** Owed bosses that could not spawn due to cap — never silently dropped. */
  breachStacks: number;
  nextBossIndex: number;
  nextBossTime: number;
  bossesSpawned: number;
  bossesDefeated: number;
  /** @deprecated Prefer bosses[]; kept as primary-boss mirror for gradual migration. */
  boss: SurvivorBoss;
  miniboss: SurvivorMiniboss;
  damageEvents: DamageEvent[];
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
  /** Set once when defeat is recorded to local high scores. */
  runRecorded: boolean;
  inboundBanner: number;
  metrics: {
    fps: number;
    frameMs: number;
    enemies: number;
    projectiles: number;
    pickups: number;
  };
}

export function emptyBoss(): SurvivorBoss {
  return {
    id: 0,
    index: 0,
    defId: 'blue-demon',
    displayName: 'Breach Demon',
    active: false,
    isMega: false,
    spawnTime: 0,
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
    lockX: 0,
    lockZ: 0,
    lockFx: 0,
    lockFz: 1,
    chargeX: 0,
    chargeZ: 0,
    hitFlash: 0,
    phase: 1,
    repulsorCd: 0,
    phaseAnnounced: 1,
    healthMul: 1,
    damageMul: 1,
    recoveryMul: 1,
    moveMul: 1,
    fanAdd: 0,
    summonAdd: 0,
    breachEmpower: 0,
    colliderRadius: 0.95,
    visualScale: 3.7,
    uniquePattern: 'rupture-ring',
    patternParam: 0,
    patternTriggered: false,
    patternElapsed: 0,
    patternHitCd: 0,
    attacksSinceUnique: 0,
    attacksSinceMega: 0,
    previousPattern: null,
    attacksCompleted: 0,
    zones: [],
    ownedMineIds: [],
  };
}

/** Newest alive boss, or null. */
export function primaryBoss(state: SurvivorState): SurvivorBoss | null {
  for (let i = state.bosses.length - 1; i >= 0; i -= 1) {
    const b = state.bosses[i]!;
    if (b.active && b.state !== 'dead') return b;
  }
  return null;
}

export function aliveBossCount(state: SurvivorState): number {
  let n = 0;
  for (const b of state.bosses) {
    if (b.active && b.state !== 'dead') n += 1;
  }
  return n;
}

/** Sync deprecated state.boss mirror from primary. */
export function syncPrimaryBossMirror(state: SurvivorState): void {
  const p = primaryBoss(state);
  if (p) {
    state.boss = p;
  } else if (!state.boss.active || state.boss.state === 'dead') {
    // leave last dead stats for HUD fade if needed
  }
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
      dodgeCd: 0,
      dodgeActive: 0,
      dodgeDirX: 1,
      dodgeDirZ: 0,
      wakeTimer: 0,
      bodyHitCd: 0,
      exhaustTickCd: 0,
      invuln: 1.2,
      hitFlash: 0,
      alive: true,
      barrierHits: 0,
      shieldPoints: 0,
      shieldMax: 0,
      shieldTime: 0,
      damageMul: 1,
      mechReadyAnnounced: false,
      slowTimer: 0,
      slowMul: 1,
    },
    weapons: [{ weaponId: starter, level: 1, cooldown: 0.4, focusDebt: 0, prototype: false }],
    passives: {},
    tempBuffs: [],
    protocolActive: [],
    protocolChoices: [],
    cache: {
      active: false,
      x: 0,
      z: 0,
      life: 0,
      maxLife: SURVIVOR.cacheLifetime,
      mega: false,
      potency: 1,
    },
    nextCacheTime: SURVIVOR.bossInterval - SURVIVOR.cacheLeadBeforeBoss,
    unlocks: {
      arc: false,
      orbital: false,
      arcOffered: false,
      orbitalOffered: false,
      arcBanner: 0,
      orbitalBanner: 0,
    },
    megaBanner: 0,
    megasDefeated: 0,
    gunship: {
      active: false,
      t: 0,
      duration: 0,
      warnDuration: 0,
      x0: 0,
      z0: 0,
      x1: 0,
      z1: 0,
      fireCd: 0,
      potency: 1,
      x: 0,
      z: 0,
      facingX: 0,
      facingZ: 1,
      firing: false,
    },
    rocketProtocol: { active: false, remaining: 0, fireCd: 0, potency: 1 },
    enemies: [],
    projectiles: [],
    hazards: [],
    pickups: [],
    effects: [],
    rails: [],
    bosses: [],
    breachStacks: 0,
    nextBossIndex: 1,
    nextBossTime: SURVIVOR.bossInterval,
    bossesSpawned: 0,
    bossesDefeated: 0,
    boss: emptyBoss(),
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
    runRecorded: false,
    inboundBanner: 0,
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
  state.weapons = weapons.map((w) => ({
    weaponId: w.id,
    level: w.level,
    cooldown: 0.2,
    focusDebt: 0,
    prototype: false,
  }));
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
  } else if (fixture === 'survivor-pickups') {
    state.player.health = state.player.maxHealth * 0.45;
    state.player.invuln = 8;
  } else if (fixture === 'survivor-arc') {
    state.time = SURVIVOR.arcUnlockTime - 0.05;
    state.xp = state.xpNext;
  } else if (fixture === 'survivor-orbital') {
    state.time = SURVIVOR.orbitalUnlockTime - 0.05;
    grantBuild(state, [{ id: state.weapons[0]!.weaponId, level: 4 }, { id: 'pulse', level: 3 }], {}, 10);
    state.xp = state.xpNext;
  } else if (fixture === 'survivor-mega') {
    state.time = SURVIVOR.bossInterval * 5 - 0.05;
    state.nextBossIndex = 5;
    state.nextBossTime = SURVIVOR.bossInterval * 5;
    grantBuild(
      state,
      [
        { id: state.weapons[0]!.weaponId, level: 5 },
        { id: 'pulse', level: 4 },
        { id: 'rail', level: 3 },
      ],
      { 'weapon-haste': 2, area: 2, 'max-health': 2 },
      12,
    );
  } else if (fixture === 'survivor-cache') {
    state.time = SURVIVOR.bossInterval - SURVIVOR.cacheLeadBeforeBoss - 0.05;
    state.nextCacheTime = SURVIVOR.bossInterval - SURVIVOR.cacheLeadBeforeBoss;
    state.player.invuln = 10;
  } else if (fixture === 'survivor-shield') {
    state.player.shieldPoints = 80;
    state.player.shieldMax = 80;
    state.player.shieldTime = 60;
    state.player.invuln = 0;
  } else if (fixture === 'survivor-boss') {
    // Just before first endless boss at 2:00 with a representative mid-run build
    state.time = SURVIVOR.bossInterval - 0.05;
    state.nextBossIndex = 1;
    state.nextBossTime = SURVIVOR.bossInterval;
    grantBuild(
      state,
      [
        { id: heroStarterWeapon(state.heroId), level: 3 },
        { id: 'pulse', level: 2 },
        { id: 'microdrone', level: 2 },
      ],
      { 'max-health': 1, 'weapon-haste': 1, area: 1, 'move-speed': 1 },
      8,
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
    // Legacy fixture: treat as second-boss window (~4:00) with a solid build
    state.time = SURVIVOR.bossInterval * 2 - 0.05;
    state.nextBossIndex = 2;
    state.nextBossTime = SURVIVOR.bossInterval * 2;
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

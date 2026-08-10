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
import { createTelemetry } from './survivorTelemetry';

export type SurvivorPhase = 'playing' | 'levelup' | 'protocol' | 'victory' | 'defeat' | 'paused';

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
  /** Role base contact damage at spawn. */
  contactDamage: number;
  /** Cooldown before hazard (wake/puddle) can re-hit this enemy. */
  hazardHitCd: number;
  /** Miniboss special telegraph timer. */
  specialCd: number;
  specialWindup: number;
  /** Elite/hunter lunge state. */
  lungeCd: number;
  lungeTimer: number;
  lungeFx: number;
  lungeFz: number;
  /** Flanker intercept recompute timer. */
  interceptTimer: number;
  interceptX: number;
  interceptZ: number;
  /** Hunter momentum 0–1. */
  huntMomentum: number;
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
  /** Owning boss for cleanup; 0 = none. */
  sourceBossId: number;
}

export interface SurvivorPickup {
  id: number;
  kind: 'xp' | 'repair';
  x: number;
  z: number;
  value: number;
  active: boolean;
  magnetized: boolean;
  /** Remaining life for expiring pickups (repair). Infinity for non-expiring. */
  life: number;
  /** High-value energy bundle (same type, larger visual). */
  premium?: boolean;
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
    | 'orbital-strike'
    | 'cache'
    | 'mega'
    | 'gunship'
    | 'fleet-ship'
    | 'singularity'
    | 'titan-deploy'
    | 'elite-aura';
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
  /**
   * Full card copy: category badge, parent name, level transition, named upgrade,
   * plain-language summary, numeric diffs and any tradeoff. The HUD renders this; the
   * flattened `title`/`body` remain for fixtures and older assertions.
   */
  card?: import('./survivorUpgradeCards').UpgradeCardCopy;
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
  /**
   * A phase threshold was crossed while an attack was live.
   *
   * Consumed once the current attack finishes, so crossing 66%/33% can never cancel a
   * live attack into a harmless recovery window.
   */
  pendingPhaseTransition: boolean;
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
export type DamageNumberKind =
  | 'enemy'
  | 'player'
  | 'boss'
  | 'large'
  | 'ability'
  | 'kill'
  | 'heal'
  | 'absorb'
  /** Orbital Gunship strike — one large gold number per target. */
  | 'gunship';

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
    /**
     * Remaining Mech cooldown in seconds.
     *
     * Replaces the removed `mechCharge` kill meter. Set on activation and counted down
     * every frame including while Mech is active, so the cycle is activation-to-activation.
     */
    mechCd: number;
    /** Cooldown length used for the current cycle (HUD readiness ring). */
    mechCdMax: number;
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
    /** 0–1 bite the last hit took out of the hull; drives feedback intensity. */
    hitSeverity: number;
    /** Remaining red screen-edge vignette (seconds). Brief and strong, never opaque. */
    hitVignette: number;
    /** Remaining camera impulse (seconds). Only major specialist/boss physical hits. */
    hitShake: number;
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
    /** Deterministic movement flag for idle/run animation. */
    isMoving: boolean;
    /** Remaining pause before Nanite Bleed resumes after damage. */
    regenPause: number;
    /** Shared boss body/charge contact throttle. */
    bossContactCd: number;
  };
  /**
   * Pressure director:
   * normal → telegraph → surge → recovery → normal
   *
   * A surge is a readable event, not a background modifier. The telegraph is long
   * enough to save a defensive cooldown for, the active window is bounded, and
   * recovery is a genuine lull created by withholding replacements — never by
   * despawning living enemies.
   */
  surge: {
    phase: 'normal' | 'telegraph' | 'surge' | 'recovery';
    kind: string;
    phaseEndsAt: number;
    nextSurgeAt: number;
    /** Geometry hint for spawns (edge index / pair). */
    edgeA: number;
    edgeB: number;
    /**
     * Rotating perimeter cursor for geometry surges.
     * Encircle must step around the arena across frames — using the within-frame
     * spawn index alone left it pinned to a single edge.
     */
    edgeCursor: number;
    /** Edges this surge actually uses, for arrows and edge illumination. */
    activeEdges: number[];
    /** Population the recovery window drains toward before replacements resume. */
    recoveryTarget: number;
    /** Banner presentation timer (seconds remaining). */
    banner: number;
    /** Extra elites authored by the current Elite Surge (ordinary budget excluded). */
    eliteBonusSpawned: number;
  };
  /**
   * Bounded repair economy (see SURVIVOR.repair).
   * Ordinary repair orbs are paced by elapsed time with a pity floor, never by an
   * independent per-kill roll that scales with kill rate.
   */
  repairEconomy: {
    /** Seconds since the last ordinary repair drop. */
    sinceDrop: number;
    /** Seconds spent meaningfully injured since the last ordinary drop. */
    injuredFor: number;
    /** Ordinary repair orbs produced this run (telemetry / tests). */
    drops: number;
  };
  /** Ordered FIFO of deferred boss schedule indices (1-based). */
  pendingBossIndices: number[];
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
    /** Enemy/boss entity IDs already struck once this flyby. */
    hitIds: number[];
    /** Temporary spawn suppression after corridor clear. */
    spawnSuppress: number;
  };
  /** Gravitic Recall: energy orb ids mid-pull. */
  recall: {
    active: boolean;
    t: number;
    duration: number;
    orbIds: number[];
    totalXp: number;
  };
  /** Exclusive Mega-Cache effects. Ordinary Cache state remains separate. */
  megaProtocol: {
    id: 'titan-protocol' | 'fleet-annihilation' | 'singularity-event' | null;
    remaining: number;
    elapsed: number;
    /** Titan leaves the ordinary Mech cooldown schedule untouched. */
    titanActive: boolean;
    /** Fleet pass index scheduled next (0..2). */
    fleetNextPass: number;
    fleetTelegraphed: number;
    fleetNextAt: number;
    fleetDamageDue: Array<{ pass: number; at: number }>;
    /** Singularity center and damage cadence. */
    x: number;
    z: number;
    tickCd: number;
    /** Current Energy snapshot; later spawns are excluded. */
    orbIds: number[];
    hitIds: number[];
  };

  enemies: SurvivorEnemy[];
  projectiles: SurvivorProjectile[];
  hazards: SurvivorHazard[];
  pickups: SurvivorPickup[];
  effects: SurvivorEffect[];
  /**
   * Boss attack/telegraph entities. Each owns the one authoritative AttackShape that
   * both the renderer and collision read — see survivorAttacks.ts.
   */
  attacks: import('./survivorAttacks').SurvivorAttack[];
  rails: Array<{ x0: number; z0: number; x1: number; z1: number; life: number; color: string }>;
  /** Concurrent bosses (cap SURVIVOR.maxSimultaneousBosses). */
  bosses: SurvivorBoss[];
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
  /** Run telemetry: exact death attribution and the Recount-style damage report. */
  telemetry: import('./survivorTelemetry').RunTelemetry;
  level: number;
  xp: number;
  xpNext: number;
  /**
   * Levels earned but not yet resolved by a validated choice card.
   * XP accumulation raises this; only `openPendingLevelUp` consumes it, one modal at a time.
   */
  pendingLevelUps: number;
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
    /** Renderer resource counters, published by the runtime for the F3 overlay. */
    geometries: number;
    textures: number;
    programs: number;
    drawCalls: number;
    effects: number;
    attacks: number;
    railPool: number;
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
    pendingPhaseTransition: false,
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
    role: 'fodder',
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
    contactDamage: 8,
    hazardHitCd: 0,
    specialCd: 0,
    specialWindup: 0,
    lungeCd: 0,
    lungeTimer: 0,
    lungeFx: 0,
    lungeFz: 0,
    interceptTimer: 0,
    interceptX: 0,
    interceptZ: 0,
    huntMomentum: 0,
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
      // The run opens with Mech unavailable; first readiness is one full cooldown in.
      mechCd: SURVIVOR.mech.initialCooldown,
      mechCdMax: SURVIVOR.mech.initialCooldown,
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
      hitSeverity: 0,
      hitVignette: 0,
      hitShake: 0,
      alive: true,
      barrierHits: 0,
      shieldPoints: 0,
      shieldMax: 0,
      shieldTime: 0,
      damageMul: 1,
      mechReadyAnnounced: false,
      isMoving: false,
      regenPause: 0,
      bossContactCd: 0,
      slowTimer: 0,
      slowMul: 1,
    },
    weapons: [{ weaponId: starter, level: 1, cooldown: 0.4, focusDebt: 0, prototype: false }],
    passives: {},
    tempBuffs: [],
    protocolActive: [],
    protocolChoices: [],
    surge: {
      phase: 'normal',
      kind: '',
      phaseEndsAt: 0,
      nextSurgeAt: SURVIVOR.surgeIntervalMin,
      edgeA: 0,
      // Facing edge of the same axis pair (-Z/+Z), matching the director's pairing.
      edgeB: 1,
      edgeCursor: 0,
      activeEdges: [],
      recoveryTarget: 0,
      banner: 0,
      eliteBonusSpawned: 0,
    },
    repairEconomy: { sinceDrop: 0, injuredFor: 0, drops: 0 },
    pendingBossIndices: [],
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
      hitIds: [],
      spawnSuppress: 0,
    },
    recall: { active: false, t: 0, duration: SURVIVOR.recallDuration, orbIds: [], totalXp: 0 },
    megaProtocol: {
      id: null,
      remaining: 0,
      elapsed: 0,
      titanActive: false,
      fleetNextPass: 0,
      fleetTelegraphed: 0,
      fleetNextAt: 0,
      fleetDamageDue: [],
      x: 0,
      z: 0,
      tickCd: 0,
      orbIds: [],
      hitIds: [],
    },
    enemies: [],
    projectiles: [],
    hazards: [],
    pickups: [],
    effects: [],
    attacks: [],
    rails: [],
    bosses: [],
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
    telemetry: createTelemetry(),
    level: 1,
    xp: 0,
    xpNext: xpForLevel(1),
    pendingLevelUps: 0,
    kills: 0,
    choices: [],
    spawnAcc: 0,
    eliteTimer: 18,
    nextId: 1,
    enemyCap: SURVIVOR.enemyCap,
    muted: false,
    runRecorded: false,
    inboundBanner: 0,
    metrics: {
      fps: 60,
      frameMs: 16,
      enemies: 0,
      projectiles: 0,
      pickups: 0,
      geometries: 0,
      textures: 0,
      programs: 0,
      drawCalls: 0,
      effects: 0,
      attacks: 0,
      railPool: 0,
    },
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

function seedFixtureHorde(state: SurvivorState, count: number, radius: number): void {
  for (let i = 0; i < count; i += 1) {
    const e = emptyEnemy();
    const a = (i / count) * Math.PI * 2;
    e.id = state.nextId++;
    e.alive = true;
    e.x = Math.cos(a) * (radius + (i % 3) * 0.8);
    e.z = Math.sin(a) * (radius + (i % 3) * 0.8);
    e.defId = i % 7 === 0 ? 'elite' : i % 4 === 0 ? 'bruiser' : 'basic';
    e.role = e.defId === 'elite' ? 'elite' : e.defId === 'bruiser' ? 'bruiser' : 'fodder';
    e.isElite = e.defId === 'elite';
    e.health = e.maxHealth = e.isElite ? 900 : e.defId === 'bruiser' ? 280 : 130;
    e.radius = e.isElite ? 0.85 : 0.58;
    e.xp = 0;
    state.enemies.push(e);
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
    // Mech immediately available for the fixture.
    state.player.mechCd = 0;
    state.time = 120;
  } else if (fixture === 'survivor-pickups') {
    state.player.health = state.player.maxHealth * 0.45;
    state.player.invuln = 8;
  } else if (fixture === 'survivor-arc') {
    state.time = SURVIVOR.arcUnlockTime;
    grantBuild(state, [{ id: 'arc', level: 5 }], { area: 2, 'weapon-haste': 2 }, 14);
    state.weapons[0]!.prototype = true;
    state.unlocks.arc = true;
    state.unlocks.arcOffered = true;
    state.player.invuln = 30;
    state.nextBossTime = 1e9;
    state.nextCacheTime = 1e9;
    state.surge.nextSurgeAt = 1e9;
    seedFixtureHorde(state, 18, 7);
  } else if (fixture === 'survivor-orbital') {
    state.time = SURVIVOR.orbitalUnlockTime;
    grantBuild(state, [{ id: 'orbital', level: 5 }], { area: 2, 'weapon-haste': 2 }, 24);
    state.weapons[0]!.prototype = true;
    state.unlocks.orbital = true;
    state.unlocks.orbitalOffered = true;
    state.unlocks.arc = true;
    state.unlocks.arcOffered = true;
    state.player.invuln = 30;
    state.nextBossTime = 1e9;
    state.nextCacheTime = 1e9;
    state.surge.nextSurgeAt = 1e9;
    seedFixtureHorde(state, 22, 9);
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
  } else if (fixture === 'survivor-mega-cache') {
    state.time = SURVIVOR.bossInterval * 5 + 5;
    state.nextBossTime = 1e9;
    state.nextCacheTime = 1e9;
    state.surge.nextSurgeAt = 1e9;
    state.unlocks.arc = true;
    state.unlocks.arcOffered = true;
    state.player.invuln = 60;
    state.cache = { active: true, x: 0, z: 0, life: 999, maxLife: 999, mega: true, potency: 1.5 };
    seedFixtureHorde(state, 28, 11);
    for (let i = 0; i < 20; i += 1) {
      const a = (i / 20) * Math.PI * 2;
      state.pickups.push({
        id: 9700 + i,
        kind: 'xp',
        x: Math.cos(a) * (13 + (i % 4)),
        z: Math.sin(a) * (13 + (i % 4)),
        value: 6,
        active: true,
        magnetized: false,
        life: Infinity,
      });
    }
  } else if (fixture === 'survivor-cache') {
    state.time = SURVIVOR.bossInterval - SURVIVOR.cacheLeadBeforeBoss - 0.05;
    state.nextCacheTime = SURVIVOR.bossInterval - SURVIVOR.cacheLeadBeforeBoss;
    state.player.invuln = 10;
  } else if (fixture === 'survivor-shield') {
    state.player.shieldPoints = 80;
    state.player.shieldMax = 80;
    state.player.shieldTime = 60;
    state.player.invuln = 0;
  } else if (fixture === 'survivor-recall') {
    state.time = 90;
    state.player.invuln = 30;
    state.weapons = [];
    // Real level thresholds: this payload crosses four levels so Recall conservation is
    // exercised for real instead of being hidden behind an unreachable xpNext.
    for (let i = 0; i < 18; i += 1) {
      state.pickups.push({
        id: 9200 + i,
        kind: 'xp',
        x: Math.sin(i * 1.7) * 18,
        z: Math.cos(i * 1.3) * 18,
        value: 8 + (i % 5) * 2,
        active: true,
        magnetized: false,
        life: Infinity,
      });
    }
    // One health orb proves Recall never pulls repair pickups.
    state.pickups.push({
      id: 9299,
      kind: 'repair',
      x: 14,
      z: -14,
      value: 25,
      active: true,
      magnetized: false,
      life: Infinity,
    });
  } else if (fixture === 'survivor-gunship') {
    state.time = 90;
    state.player.invuln = 30;
    state.weapons = [];
    state.player.x = 0;
    state.player.z = 0;
    state.player.facingX = 0;
    state.player.facingZ = 1;
    for (let i = 0; i < 10; i += 1) {
      const e = emptyEnemy();
      e.id = 9000 + i;
      e.alive = true;
      e.x = (i - 4.5) * 1.5;
      e.z = 8 + (i % 3);
      e.health = 40;
      e.maxHealth = 40;
      e.defId = 'basic';
      e.role = 'basic';
      e.xp = 0;
      state.enemies.push(e);
    }
    state.gunship = {
      active: true,
      t: 0,
      duration: 0.55 + 4.6,
      warnDuration: 0.55,
      x0: -1.2,
      z0: -1.2,
      x1: 0,
      z1: SURVIVOR.arenaHalf * 0.95,
      fireCd: 0,
      potency: 1,
      x: -1.2,
      z: -1.2,
      facingX: 0,
      facingZ: 1,
      firing: false,
      hitIds: [],
      spawnSuppress: 0,
    };
  } else if (fixture === 'survivor-stress') {
    // Worst-case presentation load: full enemy cap, every weapon at L5, all abilities
    // ready and the boss schedule already deep. Used for the GPU stability procedure
    // in docs/CONTAINMENT_PROTOCOL.md.
    state.time = 10 * 60;
    state.enemyCap = SURVIVOR.enemyCap;
    state.player.invuln = 1e9;
    state.nextBossIndex = 5;
    state.nextBossTime = state.time + 1.5;
    state.nextCacheTime = state.time + 3;
    state.surge.nextSurgeAt = state.time + 2;
    grantBuild(
      state,
      [
        { id: heroStarterWeapon(state.heroId), level: 5 },
        { id: 'pulse', level: 5 },
        { id: 'rail', level: 5 },
        { id: 'gravity', level: 5 },
        { id: 'bioplasma', level: 5 },
      ],
      { 'weapon-haste': 3, area: 3, 'max-health': 3, 'pickup-radius': 3 },
      20,
    );
    state.unlocks.arc = true;
    state.unlocks.orbital = true;
    state.player.mechCd = 0;
    state.player.repulsorCd = 0;
    state.player.shipCd = 0;
    // Prime the arena so the first frames are already at load.
    for (let i = 0; i < 90; i += 1) {
      const a = (i / 90) * Math.PI * 2;
      const r = 6 + (i % 7) * 2.2;
      const e = emptyEnemy();
      e.id = 9500 + i;
      e.alive = true;
      e.defId = i % 9 === 0 ? 'elite' : i % 3 === 0 ? 'bruiser' : 'basic';
      e.role = i % 9 === 0 ? 'elite' : i % 3 === 0 ? 'bruiser' : 'fodder';
      e.isElite = i % 9 === 0;
      e.x = Math.cos(a) * r;
      e.z = Math.sin(a) * r;
      e.health = 900;
      e.maxHealth = 900;
      e.radius = 0.5;
      e.xp = 4;
      state.enemies.push(e);
    }
    for (let i = 0; i < 40; i += 1) {
      state.pickups.push({
        id: 9700 + i,
        kind: 'xp',
        x: Math.sin(i * 1.9) * 20,
        z: Math.cos(i * 1.4) * 20,
        value: 6,
        active: true,
        magnetized: false,
        life: Infinity,
      });
    }
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
    state.player.mechCd = 6;
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

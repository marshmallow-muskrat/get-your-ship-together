import type { HeroId } from '../../content/heroes';
import {
  MELEE_BLOB,
  MELEE_SPIKY,
  MELEE_ALIEN,
  MELEE_ORC,
  MELEE_MUSHNUB,
  RANGED_GOLELING,
  RANGED_GHOST,
  RANGED_ARMABEE,
  RANGED_SQUIDLE,
  BOSS_DEMON,
  type EnemyDef,
} from '../../content/enemies';

/** Balance/game version stamped into local high scores. */
export const SURVIVOR_BALANCE_VERSION = 'endless-2.0.1';

/** Additive Overclock damage growth per level past L5. */
export const OVERCLOCK_DAMAGE_PER_LEVEL = 0.08;

/** Centralized Containment Protocol tuning (endless high-score mode). */
export const SURVIVOR = {
  /** Endless — no run-length victory. */
  endless: true,
  bossInterval: 120, // every 2 minutes
  maxSimultaneousBosses: 3,
  firstBossBaseHealth: 2200,
  arenaHalf: 32, // 64×64 playable
  cameraHalf: 12,
  actorScale: {
    player: 1.5,
    enemy: 1.5,
    elite: 1.5,
    miniboss: 2.1,
    /** Doubled from prior 1.85 so bosses read as major threats. */
    boss: 3.7,
    ship: 1.35,
  },
  playerMaxHealth: 100,
  playerSpeed: 6.4,
  playerRadius: 0.55,
  playerInvuln: 0.38,
  xpMagnetBase: 3.2,
  /** Magnet Field energy gain per level. */
  xpMagnetPerLevel: 0.35,
  /** Health/repair magnet base — larger than energy. */
  healthMagnetBase: 4.25,
  healthMagnetPerLevel: 0.6,
  healthDirectRadius: 0.8,
  healthMagnetSpeed: 20,
  xpMagnetSpeed: 14,
  healthShipMagnet: 6.5,
  healthMechMagnetMul: 1.25,
  enemyCap: 160,
  projectileCap: 220,
  pickupCap: 120,
  hazardCap: 80,
  damageEventCap: 48,
  maxWeaponSlots: 5,
  /** Prototype weapons (arc/orbital) do not consume ordinary slots. */
  maxPrototypeSlots: 2,
  arcUnlockTime: 300,
  orbitalUnlockTime: 900,
  cacheInterval: 120,
  cacheLeadBeforeBoss: 15,
  cacheLifetime: 38,
  cacheOfferDuration: 0,
  shieldDuration: 60,
  megaEvery: 5,
  megaHealthMul: 2.2,
  megaDamageMul: 1.25,
  megaVisualMul: 2.0,
  megaColliderMul: 1.55,
  megaMoveMul: 0.85,
  fixedDt: 1 / 60,
  repairDropChance: 0.04,
  regenPerLevel: 0.45,
  dodge: {
    cooldown: 10,
    /** Distance tripled from prior 4.5 → 13.5 */
    duration: 0.42,
    invuln: 0.42,
    distance: 13.5,
  },
  mech: {
    duration: 14,
    chargePerKill: 0.012,
    chargePerElite: 0.08,
    chargePerMiniboss: 0.35,
    chargePerBoss: 0.25,
    damageTakenMul: 0.65,
  },
  repulsor: {
    /** Final: prior 13.5/12 × 1.33, 30s CD */
    cooldown: 30,
    radius: 17.955,
    damage: 20,
    push: 15.96,
    elitePushMul: 0.4,
    minibossPushMul: 0.18,
    mechRadiusMul: 1.25,
    mechDamageMul: 1.35,
    mechPushMul: 1.2,
    knockbackDuration: 0.48,
    bossStagger: 0.55,
    bossInternalCd: 6.5,
    effectLife: 0.72,
  },
  ship: {
    duration: 2.5,
    cooldown: 16,
    speedMul: 2.6,
    damageTakenMul: 0.6,
    wakeInterval: 0.14,
    wakeLife: 1.25,
    wakeRadius: 1.15,
    wakeDamage: 28,
    wakeTickCd: 0.28,
    bodyDamage: 18,
    bodyPush: 1.2,
    bodyTickCd: 0.35,
    radius: 0.7,
    /** Continuous rear exhaust jet — more visible and lethal */
    exhaustLength: 5.2,
    exhaustWidth: 2.0,
    /** Level-1 base: strong enough to shred early basics in the plume. */
    exhaustDamage: 42,
    exhaustTickCd: 0.2,
    exhaustEliteMul: 0.55,
    exhaustBossMul: 0.45,
    exhaustVisualScale: 1.85,
    /** Power scale caps thruster damage growth with permanent build. */
    powerScaleCap: 10.0,
  },
  /** Per-hero ship dimensions for pickup/exhaust (world units). Substantially larger reach. */
  heroShips: {
    bee: { pickupRadius: 4.2, collectionRadius: 5.0, colliderLength: 4.6, colliderWidth: 4.0 },
    flamingo: { pickupRadius: 4.5, collectionRadius: 5.3, colliderLength: 5.0, colliderWidth: 4.3 },
    frog: { pickupRadius: 4.3, collectionRadius: 5.1, colliderLength: 4.7, colliderWidth: 4.1 },
    'red-panda': { pickupRadius: 4.4, collectionRadius: 5.2, colliderLength: 4.8, colliderWidth: 4.2 },
  } as Record<HeroId, { pickupRadius: number; collectionRadius: number; colliderLength: number; colliderWidth: number }>,
  damageNumbers: {
    aggregateWindow: 0.15,
    life: 0.85,
    heavyLife: 1.05,
    largeThreshold: 36,
    heavyThreshold: 55,
    /** Multiplier applied to rendered font sizes (1.5× prior). */
    sizeScale: 1.5,
  },
  tempBuff: {
    overchargeDuration: 20,
    overchargeDamageMul: 1.35,
    thrusterDuration: 12,
    thrusterSpeedMul: 1.35,
    barrierHits: 1,
    repairAmount: 40,
  },
} as const;

export type SurvivorForm = 'astronaut' | 'ship' | 'mech';

export type WeaponId =
  | 'pulse'
  | 'microdrone'
  | 'rail'
  | 'gravity'
  | 'rocket'
  | 'bioplasma'
  | 'arc'
  | 'orbital';

export interface WeaponLevelDef {
  level: number;
  label: string;
  damage: number;
  cadence: number;
  count: number;
  speed?: number;
  radius?: number;
  pierce?: number;
  life?: number;
  width?: number;
  length?: number;
  splash?: number;
  puddleRadius?: number;
  puddleLife?: number;
  puddleDamage?: number;
  bounce?: number;
  split?: number;
}

export interface WeaponFamily {
  id: WeaponId;
  name: string;
  description: string;
  color: string;
  levels: WeaponLevelDef[];
  /** Time-gated prototype weapon; does not consume ordinary slots. */
  prototype?: boolean;
  unlockTime?: number;
}

export const WEAPONS: Record<WeaponId, WeaponFamily> = {
  pulse: {
    id: 'pulse',
    name: 'Pulse Blaster',
    description: 'Auto-locks nearest hostiles with rapid bolts.',
    color: '#88d4ff',
    levels: [
      { level: 1, label: 'Pulse Blaster I', damage: 14, cadence: 0.32, count: 1, speed: 26, pierce: 0, life: 1.0, radius: 0.2 },
      { level: 2, label: 'Pulse Blaster II', damage: 18, cadence: 0.28, count: 1, speed: 28, pierce: 0, life: 1.0, radius: 0.22 },
      { level: 3, label: 'Twin Pulse', damage: 18, cadence: 0.26, count: 2, speed: 28, pierce: 0, life: 1.0, radius: 0.22 },
      { level: 4, label: 'Penetrator', damage: 22, cadence: 0.24, count: 2, speed: 30, pierce: 1, life: 1.1, radius: 0.24 },
      { level: 5, label: 'Pulse Storm', damage: 26, cadence: 0.2, count: 3, speed: 32, pierce: 1, life: 1.15, radius: 0.26 },
    ],
  },
  microdrone: {
    id: 'microdrone',
    name: 'Microdrone Swarm',
    description: 'Homing drones that hunt nearby threats.',
    color: '#f5ae42',
    levels: [
      { level: 1, label: 'Microdrone I', damage: 22, cadence: 1.8, count: 3, speed: 11, life: 2.2, radius: 0.18 },
      { level: 2, label: 'Microdrone II', damage: 26, cadence: 1.6, count: 4, speed: 12, life: 2.3, radius: 0.18 },
      { level: 3, label: 'Swarm Cadre', damage: 28, cadence: 1.45, count: 5, speed: 13, life: 2.4, radius: 0.2 },
      { level: 4, label: 'Hunter Net', damage: 32, cadence: 1.3, count: 6, speed: 14, life: 2.5, radius: 0.2 },
      { level: 5, label: 'Hive Overdrive', damage: 38, cadence: 1.15, count: 8, speed: 15, life: 2.6, radius: 0.22 },
    ],
  },
  rail: {
    id: 'rail',
    name: 'Rail Lance',
    description: 'Piercing line that cuts through dense packs.',
    color: '#ff7ab8',
    levels: [
      // L1 tuned for early reliability: faster cycle, wider beam, higher damage
      { level: 1, label: 'Rail Lance I', damage: 72, cadence: 1.75, count: 1, width: 0.62, length: 15 },
      { level: 2, label: 'Rail Lance II', damage: 88, cadence: 1.6, count: 1, width: 0.7, length: 16 },
      { level: 3, label: 'Twin Rails', damage: 88, cadence: 1.5, count: 2, width: 0.62, length: 16 },
      { level: 4, label: 'Wide Beam', damage: 108, cadence: 1.4, count: 2, width: 0.82, length: 17 },
      { level: 5, label: 'Lance Battery', damage: 128, cadence: 1.25, count: 3, width: 0.75, length: 18 },
    ],
  },
  gravity: {
    id: 'gravity',
    name: 'Gravity Pulse',
    description: 'Circular field that damages and slows.',
    color: '#9b7bff',
    levels: [
      { level: 1, label: 'Gravity Pulse I', damage: 40, cadence: 2.4, count: 1, radius: 2.6, life: 0.35 },
      { level: 2, label: 'Gravity Pulse II', damage: 52, cadence: 2.2, count: 1, radius: 3.0, life: 0.4 },
      { level: 3, label: 'Deep Well', damage: 60, cadence: 2.0, count: 1, radius: 3.5, life: 0.45 },
      { level: 4, label: 'Double Pulse', damage: 60, cadence: 1.85, count: 2, radius: 3.4, life: 0.4 },
      { level: 5, label: 'Event Horizon', damage: 78, cadence: 1.65, count: 2, radius: 4.0, life: 0.5 },
    ],
  },
  rocket: {
    id: 'rocket',
    name: 'Rocket Barrage',
    description: 'Delayed area strikes on dense clusters.',
    color: '#ff8a4a',
    levels: [
      // L1: shorter arm time (life), faster cadence, stronger splash clusters
      { level: 1, label: 'Rocket Barrage I', damage: 58, cadence: 2.05, count: 4, radius: 1.55, life: 0.38 },
      { level: 2, label: 'Rocket Barrage II', damage: 68, cadence: 1.9, count: 5, radius: 1.65, life: 0.36 },
      { level: 3, label: 'Salvo', damage: 74, cadence: 1.75, count: 6, radius: 1.75, life: 0.34 },
      { level: 4, label: 'Cluster', damage: 82, cadence: 1.6, count: 7, radius: 1.85, life: 0.32 },
      { level: 5, label: 'Carpet Fire', damage: 94, cadence: 1.45, count: 9, radius: 2.0, life: 0.3 },
    ],
  },
  bioplasma: {
    id: 'bioplasma',
    name: 'Bio-Plasma Glob',
    description: 'Toxic green globs that splash and leave corrosive residue.',
    color: '#5dff6a',
    levels: [
      {
        level: 1,
        label: 'Bio-Plasma Glob I',
        damage: 38,
        cadence: 0.78,
        count: 1,
        speed: 20,
        radius: 0.32,
        life: 1.45,
        splash: 1.7,
        puddleRadius: 1.45,
        puddleLife: 2.1,
        puddleDamage: 12,
      },
      {
        level: 2,
        label: 'Bio-Plasma Glob II',
        damage: 46,
        cadence: 0.74,
        count: 1,
        speed: 21,
        radius: 0.34,
        life: 1.5,
        splash: 1.9,
        puddleRadius: 1.55,
        puddleLife: 2.3,
        puddleDamage: 13,
      },
      {
        level: 3,
        label: 'Corrosive Glob',
        damage: 50,
        cadence: 0.7,
        count: 1,
        speed: 21.5,
        radius: 0.36,
        life: 1.55,
        splash: 2.0,
        puddleRadius: 1.85,
        puddleLife: 2.9,
        puddleDamage: 15,
      },
      {
        level: 4,
        label: 'Twin Globs',
        damage: 48,
        cadence: 0.68,
        count: 2,
        speed: 22,
        radius: 0.34,
        life: 1.55,
        splash: 1.85,
        puddleRadius: 1.65,
        puddleLife: 2.5,
        puddleDamage: 14,
      },
      {
        level: 5,
        label: 'Virulent Cascade',
        damage: 54,
        cadence: 0.62,
        count: 2,
        speed: 22.5,
        radius: 0.36,
        life: 1.6,
        splash: 2.05,
        puddleRadius: 2.1,
        puddleLife: 3.2,
        puddleDamage: 17,
        bounce: 1,
        split: 1,
      },
    ],
  },

  arc: {
    id: 'arc',
    name: 'Arc Conductor',
    description: 'Chain lightning that jumps between hostiles and bosses.',
    color: '#88eeff',
    prototype: true,
    unlockTime: 300,
    levels: [
      { level: 1, label: 'Arc Conductor I', damage: 34, cadence: 1.15, count: 1, radius: 3.2, pierce: 2 },
      { level: 2, label: 'Arc Conductor II', damage: 42, cadence: 1.05, count: 1, radius: 3.6, pierce: 2 },
      { level: 3, label: 'Arc Conductor III', damage: 48, cadence: 0.95, count: 1, radius: 4.0, pierce: 3 },
      { level: 4, label: 'Arc Conductor IV', damage: 56, cadence: 0.88, count: 1, radius: 4.4, pierce: 3 },
      { level: 5, label: 'Arc Storm', damage: 68, cadence: 0.78, count: 1, radius: 5.0, pierce: 4, splash: 1.2 },
    ],
  },
  orbital: {
    id: 'orbital',
    name: 'Orbital Lance',
    description: 'Delayed orbital strike that prefers bosses and dense elites.',
    color: '#ffd46a',
    prototype: true,
    unlockTime: 900,
    levels: [
      { level: 1, label: 'Orbital Lance I', damage: 140, cadence: 4.2, count: 1, radius: 1.6, life: 0.85 },
      { level: 2, label: 'Orbital Lance II', damage: 170, cadence: 3.9, count: 1, radius: 1.85, life: 0.8 },
      { level: 3, label: 'Orbital Lance III', damage: 190, cadence: 3.6, count: 2, radius: 1.75, life: 0.75 },
      { level: 4, label: 'Orbital Lance IV', damage: 220, cadence: 3.35, count: 2, radius: 2.0, life: 0.7 },
      { level: 5, label: 'Judgment Array', damage: 260, cadence: 3.0, count: 3, radius: 2.15, life: 0.65 },
    ],
  },

};

export type PassiveId =
  | 'move-speed'
  | 'pickup-radius'
  | 'max-health'
  | 'regen'
  | 'weapon-haste'
  | 'area'
  | 'mech-charge'
  | 'mech-duration'
  | 'breach-shielding';

export interface PassiveDef {
  id: PassiveId;
  name: string;
  description: string;
  /** Hard cap; Infinity for safe repeatable passives. */
  maxLevel: number;
  perLevel: number;
  /** When true, levels past 5 use diminishing gains and display forever. */
  repeatable?: boolean;
}

export const PASSIVES: PassiveDef[] = [
  { id: 'move-speed', name: 'Thruster Boost', description: 'Move faster through the horde.', maxLevel: 5, perLevel: 0.08 },
  { id: 'pickup-radius', name: 'Magnet Field', description: 'Pull energy cells from farther away.', maxLevel: 5, perLevel: 0.35 },
  {
    id: 'max-health',
    name: 'Hull Plating',
    description: 'Increase max integrity.',
    maxLevel: Infinity,
    perLevel: 20,
    repeatable: true,
  },
  {
    id: 'regen',
    name: 'Nanite Bleed',
    description: 'Slow automatic repair over time.',
    maxLevel: Infinity,
    perLevel: 0.45,
    repeatable: true,
  },
  { id: 'weapon-haste', name: 'Weapon Overclock', description: 'All weapons fire faster.', maxLevel: 5, perLevel: 0.08 },
  { id: 'area', name: 'Containment Field', description: 'Larger weapon areas and blasts.', maxLevel: 5, perLevel: 0.1 },
  { id: 'mech-charge', name: 'Core Siphon', description: 'Mech meter fills faster from kills.', maxLevel: 5, perLevel: 0.15 },
  { id: 'mech-duration', name: 'Reactor Hold', description: 'Longer mech transform window.', maxLevel: 5, perLevel: 0.12 },
  {
    id: 'breach-shielding',
    name: 'Breach Shielding',
    description: 'Reduces damage from boss attacks by 8% per level (max 40%).',
    maxLevel: 5,
    perLevel: 0.08,
  },
];

/** Integrity gained when taking Hull Plating to the given absolute level. */
export function hullPlatingGainAtLevel(level: number): number {
  if (level <= 0) return 0;
  if (level <= 5) return 20;
  // L6+: smaller linear gains
  return 10;
}

/** Total max-health from N levels of Hull Plating. */
export function hullPlatingTotal(levels: number): number {
  let t = 0;
  for (let i = 1; i <= levels; i += 1) t += hullPlatingGainAtLevel(i);
  return t;
}

/** Regen per second at a given Nanite Bleed level (diminishing after 5). */
export function regenPerSecondAtLevel(level: number): number {
  if (level <= 0) return 0;
  if (level <= 5) return level * 0.45;
  // L1–5 full rate + sqrt growth beyond
  return 5 * 0.45 + Math.sqrt(level - 5) * 0.35;
}

/** Capped permanent-build power scale for thruster/wake damage. */
export function playerPowerScale(input: {
  weapons: Array<{ level: number }>;
  passives: Partial<Record<PassiveId, number>>;
}): number {
  const owned = Math.max(1, input.weapons.length);
  const totalWeaponLevels = input.weapons.reduce((n, w) => n + w.level, 0);
  const weaponGrowth = Math.max(0, totalWeaponLevels - owned);
  // Cap passive contribution so endless plating doesn't infinitely thruster-scale
  const passiveGrowth = Math.min(
    40,
    Object.values(input.passives).reduce((n, v) => n + (v ?? 0), 0),
  );
  // Stronger growth so thrusters stay relevant midgame (still hard-capped)
  return Math.min(SURVIVOR.ship.powerScaleCap, 1 + 0.18 * weaponGrowth + 0.05 * passiveGrowth);
}

export type BossRole = 'brute' | 'charger' | 'caster' | 'summoner' | 'flyer';

export interface BossDef {
  id: string;
  displayName: string;
  url: string;
  targetHeight: number;
  colliderRadius: number;
  visualScale: number;
  role: BossRole;
  accent: string;
  anim: {
    idle: string[];
    walk: string[];
    attack: string[];
    hit: string[];
    death: string[];
  };
  preferredPatterns: Array<BossPatternId>;
  uniquePattern: BossPatternId;
}

export type BossPatternId =
  | 'pulse'
  | 'line'
  | 'fan'
  | 'summon'
  | 'breach-orb'
  | 'contamination'
  | 'rupture-ring'
  | 'cryo-lanes'
  | 'ravage-charge'
  | 'sweeping-beam'
  | 'aerial-strafe'
  | 'spore-bloom'
  | 'gravity-collapse'
  | 'cataclysm';

/** Authoritative list for exhaustive tests/handlers. */
export const ALL_BOSS_PATTERNS: readonly BossPatternId[] = [
  'pulse',
  'line',
  'fan',
  'summon',
  'breach-orb',
  'contamination',
  'rupture-ring',
  'cryo-lanes',
  'ravage-charge',
  'sweeping-beam',
  'aerial-strafe',
  'spore-bloom',
  'gravity-collapse',
  'cataclysm',
] as const;

export const MEGA_ONLY_PATTERNS: readonly BossPatternId[] = ['gravity-collapse', 'cataclysm'] as const;

export function isMegaOnlyPattern(id: BossPatternId): boolean {
  return id === 'gravity-collapse' || id === 'cataclysm';
}

export function assertNever(x: never): never {
  throw new Error(`Unhandled boss pattern: ${String(x)}`);
}


export const BOSS_DEFS: BossDef[] = [
  {
    id: 'blue-demon',
    displayName: 'Breach Demon',
    url: '/runtime/boss/blue-demon.gltf',
    targetHeight: 3.6,
    colliderRadius: 0.95,
    visualScale: 3.7,
    role: 'brute',
    accent: '#ff4455',
    anim: { idle: ['Idle'], walk: ['Walk', 'Run'], attack: ['Punch', 'Weapon', 'Jump'], hit: ['HitReact'], death: ['Death'] },
    preferredPatterns: ['pulse', 'line', 'fan', 'summon', 'breach-orb', 'contamination'],
    uniquePattern: 'rupture-ring',
  },
  {
    id: 'yeti',
    displayName: 'Frost Warden',
    url: '/runtime/boss/yeti.gltf',
    targetHeight: 3.8,
    colliderRadius: 1.05,
    visualScale: 3.8,
    role: 'brute',
    accent: '#88c8ff',
    anim: { idle: ['Idle'], walk: ['Walk', 'Run'], attack: ['Punch', 'Weapon', 'Jump'], hit: ['HitReact'], death: ['Death'] },
    preferredPatterns: ['pulse', 'line', 'summon', 'breach-orb', 'contamination'],
    uniquePattern: 'cryo-lanes',
  },
  {
    id: 'dino',
    displayName: 'Containment Saurian',
    url: '/runtime/boss/dino.gltf',
    targetHeight: 3.5,
    colliderRadius: 1.0,
    visualScale: 3.6,
    role: 'charger',
    accent: '#7dff9a',
    anim: { idle: ['Idle'], walk: ['Walk', 'Run'], attack: ['Punch', 'Bite_Front', 'Jump'], hit: ['HitReact'], death: ['Death'] },
    preferredPatterns: ['line', 'pulse', 'fan', 'breach-orb', 'contamination'],
    uniquePattern: 'ravage-charge',
  },
  {
    id: 'demon',
    displayName: 'Crimson Overseer',
    url: '/runtime/boss/demon.gltf',
    targetHeight: 3.7,
    colliderRadius: 0.98,
    visualScale: 3.76,
    role: 'caster',
    accent: '#ff3366',
    anim: { idle: ['Idle'], walk: ['Walk', 'Run'], attack: ['Punch', 'Weapon', 'Jump'], hit: ['HitReact'], death: ['Death'] },
    preferredPatterns: ['fan', 'pulse', 'line', 'breach-orb', 'contamination'],
    uniquePattern: 'sweeping-beam',
  },
  {
    id: 'dragon',
    displayName: 'Void Drake',
    url: '/runtime/boss/dragon.gltf',
    targetHeight: 3.4,
    colliderRadius: 1.1,
    visualScale: 3.5,
    role: 'flyer',
    accent: '#c080ff',
    anim: { idle: ['Flying_Idle', 'Idle'], walk: ['Fast_Flying', 'Fly'], attack: ['Punch', 'Headbutt', 'Attack'], hit: ['HitReact'], death: ['Death'] },
    preferredPatterns: ['fan', 'line', 'summon', 'breach-orb', 'contamination'],
    uniquePattern: 'aerial-strafe',
  },
  {
    id: 'mushroom-king',
    displayName: 'Spore Sovereign',
    url: '/runtime/boss/mushroom-king.gltf',
    targetHeight: 3.5,
    colliderRadius: 1.15,
    visualScale: 3.9,
    role: 'summoner',
    accent: '#ffaa44',
    anim: { idle: ['Idle'], walk: ['Walk', 'Run'], attack: ['Punch', 'Weapon', 'Jump'], hit: ['HitReact'], death: ['Death'] },
    preferredPatterns: ['summon', 'pulse', 'fan', 'breach-orb', 'contamination'],
    uniquePattern: 'spore-bloom',
  },
];

/** Deterministic boss model for schedule index n (1-based). Avoids immediate repeats. */
export function bossDefForIndex(index: number): BossDef {
  const n = Math.max(1, Math.floor(index));
  const len = BOSS_DEFS.length;
  // Rotate with offset so consecutive bosses differ
  const idx = (n - 1 + Math.floor((n - 1) / len)) % len;
  return BOSS_DEFS[idx]!;
}

export function heroStarterWeapon(heroId: HeroId): WeaponId {
  switch (heroId) {
    case 'bee':
      return 'microdrone';
    case 'flamingo':
      return 'rail';
    case 'frog':
      return 'bioplasma';
    case 'red-panda':
      return 'rocket';
  }
}

/** Authored L1–L5 only (clamped). Prefer weaponStatsAtLevel for combat. */
export function weaponLevelDef(weaponId: WeaponId, level: number): WeaponLevelDef {
  const fam = WEAPONS[weaponId];
  const idx = Math.max(0, Math.min(fam.levels.length - 1, level - 1));
  return fam.levels[idx]!;
}

export function overclockLevel(displayedLevel: number): number {
  return Math.max(0, Math.floor(displayedLevel) - 5);
}

/** Overclock I…X then Arabic for larger values. */
export function formatOverclockLabel(oc: number): string {
  if (oc <= 0) return '';
  if (oc <= 10) {
    const romans = ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X'];
    return `Overclock ${romans[oc - 1]}`;
  }
  return `Overclock ${oc}`;
}

/**
 * Complete weapon stats at any displayed level.
 * L1–L5: authored definitions.
 * L6+: Level-5 structure + additive damage Overclocks (never mutates authored data).
 */
export function weaponStatsAtLevel(weaponId: WeaponId, displayedLevel: number): WeaponLevelDef {
  const fam = WEAPONS[weaponId];
  const level = Math.max(1, Math.floor(displayedLevel));
  if (level <= fam.levels.length) {
    return { ...fam.levels[level - 1]! };
  }
  const base = fam.levels[fam.levels.length - 1]!;
  const oc = overclockLevel(level);
  const mul = 1 + OVERCLOCK_DAMAGE_PER_LEVEL * oc;
  return {
    ...base,
    level,
    label: `${fam.name} L${level}`,
    damage: base.damage * mul,
    puddleDamage: base.puddleDamage != null ? base.puddleDamage * mul : undefined,
  };
}

/** Primary damage delta text for upgrade cards. */
export function weaponDamagePreview(weaponId: WeaponId, fromLevel: number, toLevel: number): string {
  const a = weaponStatsAtLevel(weaponId, fromLevel);
  const b = weaponStatsAtLevel(weaponId, toLevel);
  const lines: string[] = [];
  const dmgA = Math.round(a.damage);
  const dmgB = Math.round(b.damage);
  if (dmgA !== dmgB) {
    const label = weaponId === 'bioplasma' ? 'Impact' : 'Damage';
    lines.push(`${label} ${dmgA} → ${dmgB}`);
  }
  if (a.puddleDamage != null && b.puddleDamage != null) {
    const pa = Math.round(a.puddleDamage);
    const pb = Math.round(b.puddleDamage);
    if (pa !== pb) lines.push(`Puddle ${pa} → ${pb}`);
  }
  if (lines.length === 0) lines.push(WEAPONS[weaponId].description);
  return lines.join('\n');
}

export function isPassiveAvailable(id: PassiveId, currentLevel: number): boolean {
  const def = PASSIVES.find((p) => p.id === id);
  if (!def) return false;
  if (!Number.isFinite(def.maxLevel)) return true;
  return currentLevel < def.maxLevel;
}

export function xpForLevel(level: number): number {
  return Math.floor(12 + level * 8 + level * level * 1.6);
}

export type HordeRole = 'basic' | 'fast' | 'ranged' | 'bruiser' | 'elite' | 'miniboss';

export interface HordeEnemyDef {
  id: string;
  role: HordeRole;
  visual: EnemyDef;
  xp: number;
  isElite?: boolean;
  isMiniboss?: boolean;
}

export const HORDE: Record<string, HordeEnemyDef> = {
  basic: { id: 'basic', role: 'basic', visual: MELEE_BLOB, xp: 3 },
  mush: { id: 'mush', role: 'basic', visual: MELEE_MUSHNUB, xp: 3 },
  fast: { id: 'fast', role: 'fast', visual: MELEE_ALIEN, xp: 4 },
  spiky: { id: 'spiky', role: 'fast', visual: MELEE_SPIKY, xp: 5 },
  flyer: { id: 'flyer', role: 'ranged', visual: RANGED_GOLELING, xp: 6 },
  ghost: { id: 'ghost', role: 'ranged', visual: RANGED_GHOST, xp: 6 },
  bee: { id: 'bee', role: 'ranged', visual: RANGED_ARMABEE, xp: 5 },
  bruiser: { id: 'bruiser', role: 'bruiser', visual: MELEE_ORC, xp: 12 },
  elite: { id: 'elite', role: 'elite', visual: RANGED_SQUIDLE, xp: 28, isElite: true },
  /** Visually distinct miniboss (orc scaled up). */
  miniboss: {
    id: 'miniboss',
    role: 'miniboss',
    visual: MELEE_ORC,
    xp: 120,
    isElite: true,
    isMiniboss: true,
  },
};

export const MINIBOSS = {
  id: 'miniboss',
  name: 'Containment Warden',
  healthMul: 18,
  damageMul: 2.4,
  radiusMul: 2.0,
  speedMul: 0.85,
  xp: 140,
  specialWindup: 0.9,
  specialRadius: 4.2,
  specialDamage: 22,
  specialCd: 5.5,
} as const;

export type BossPhase = 1 | 2 | 3;

export const SURVIVOR_BOSS = {
  ...BOSS_DEMON,
  /** Base health for first endless boss; scaled by bossDifficultyFor(n). */
  maxHealth: 2200,
  phase2Threshold: 0.65,
  phase3Threshold: 0.35,
  patterns: {
    pulse: { windup: 1.0, active: 0.7, recovery: 0.85, damage: 16, maxRadius: 8 },
    line: { windup: 0.9, active: 0.45, recovery: 0.95, damage: 20, length: 20, width: 1.25 },
    fan: { windup: 1.05, active: 0.18, recovery: 0.95, damage: 12, count: 5, speed: 10 },
    summon: { windup: 0.95, active: 0.12, recovery: 1.15, count: 5 },
    'breach-orb': { windup: 1.1, active: 0.2, recovery: 1.0, damage: 18, speed: 7 },
    contamination: { windup: 1.0, active: 0.35, recovery: 1.05, damage: 10, radius: 3.0, life: 6 },
    'rupture-ring': { windup: 1.15, active: 0.9, recovery: 1.1, damage: 18, maxRadius: 10 },
    'cryo-lanes': { windup: 1.1, active: 0.7, recovery: 1.15, damage: 14, length: 22, width: 1.1 },
    'ravage-charge': { windup: 1.2, active: 0.55, recovery: 1.2, damage: 22, length: 28, width: 1.4 },
    'sweeping-beam': { windup: 1.15, active: 1.4, recovery: 1.1, damage: 16, length: 24, width: 1.0 },
    'aerial-strafe': { windup: 1.0, active: 1.1, recovery: 1.0, damage: 14, length: 30, width: 1.6 },
    'spore-bloom': { windup: 1.05, active: 0.4, recovery: 1.2, damage: 12, count: 5, radius: 1.4 },
    'gravity-collapse': { windup: 1.3, active: 1.5, recovery: 1.3, damage: 22, maxRadius: 11 },
    cataclysm: { windup: 1.2, active: 2.0, recovery: 1.4, damage: 20, count: 4, radius: 3.2 },
  },
  phaseMods: {
    1: { recoveryMul: 1.0, damageMul: 1.0, fanCountAdd: 0, summonCount: 3, idleGap: 0.55 },
    2: { recoveryMul: 0.72, damageMul: 1.2, fanCountAdd: 2, summonCount: 5, idleGap: 0.38 },
    3: { recoveryMul: 0.55, damageMul: 1.4, fanCountAdd: 3, summonCount: 7, idleGap: 0.22 },
  },
} as const;

export interface EndlessDifficulty {
  healthMul: number;
  damageMul: number;
  speedMul: number;
  attackRateMul: number;
  targetActive: number;
  eliteChance: number;
  spawnRate: number;
  populationMin: number;
  populationMax: number;
}

/** Unbounded endless enemy difficulty (pure). m = minutes elapsed. */
export function endlessDifficultyAt(timeSec: number): EndlessDifficulty {
  const m = Math.max(0, timeSec / 60);
  const late = Math.max(0, m - 5);
  // Stronger late enemy HP so basics stop being permanent one-shots
  const healthMul = 1 + 0.18 * m + 0.035 * late * late;
  const damageMul = 1 + 0.07 * m + 0.04 * Math.max(0, m - 10);
  const speedMul = Math.min(1.28, 1 + 0.014 * m);
  const attackRateMul = Math.min(1.7, 1 + 0.025 * m);
  const targetActive = Math.min(SURVIVOR.enemyCap, Math.floor(18 + 8 * m));
  const eliteChance = Math.min(0.45, 0.02 + 0.015 * m);
  const spawnRate = Math.min(6.5, 1.4 + 0.35 * m);
  return {
    healthMul,
    damageMul,
    speedMul,
    attackRateMul,
    targetActive,
    eliteChance,
    spawnRate,
    populationMin: Math.max(8, Math.floor(targetActive * 0.7)),
    populationMax: targetActive,
  };
}

/** @deprecated Use endlessDifficultyAt — kept for tests compatibility. */
export function difficultyAt(time: number): EndlessDifficulty {
  return endlessDifficultyAt(time);
}

export function spawnPressure(t: number): number {
  return endlessDifficultyAt(t).spawnRate / 6.5;
}

export interface BossDifficulty {
  index: number;
  healthMul: number;
  damageMul: number;
  recoveryMul: number;
  moveMul: number;
  fanAdd: number;
  summonAdd: number;
}

/** Boss index n begins at 1. */
/** Quadratic regular boss HP growth (replaces 1.55^n exponential wall). */
export function bossHealthMulFor(index: number): number {
  const n = Math.max(1, Math.floor(index));
  const k = n - 1;
  return 1 + 0.65 * k + 0.1 * k * k;
}

export function isMegaBossIndex(index: number): boolean {
  const n = Math.max(1, Math.floor(index));
  return n % SURVIVOR.megaEvery === 0;
}

export function bossDifficultyFor(index: number): BossDifficulty {
  const n = Math.max(1, Math.floor(index));
  const mega = isMegaBossIndex(n);
  const healthMul = bossHealthMulFor(n) * (mega ? SURVIVOR.megaHealthMul : 1);
  const damageMul = (1 + 0.12 * (n - 1)) * (mega ? SURVIVOR.megaDamageMul : 1);
  return {
    index: n,
    healthMul,
    damageMul: Math.min(mega ? 4.5 : 3.2, damageMul),
    recoveryMul: Math.max(0.5, Math.pow(0.95, n - 1)),
    moveMul: Math.min(1.25, 1 + 0.03 * (n - 1)) * (mega ? SURVIVOR.megaMoveMul : 1),
    fanAdd: Math.min(6, Math.floor((n - 1) * 0.55)),
    summonAdd: Math.min(6, Math.floor((n - 1) * 0.4)),
  };
}

/** Schedule time for boss index n (1-based): 120, 240, 360… */
export function bossTimeForIndex(index: number): number {
  return Math.max(1, Math.floor(index)) * SURVIVOR.bossInterval;
}

export function compositionAt(t: number): Array<{ id: string; weight: number }> {
  if (t < 60) return [{ id: 'basic', weight: 8 }, { id: 'mush', weight: 2 }];
  if (t < 180)
    return [
      { id: 'basic', weight: 5 },
      { id: 'fast', weight: 3 },
      { id: 'flyer', weight: 2 },
      { id: 'mush', weight: 1 },
    ];
  if (t < 300)
    return [
      { id: 'basic', weight: 4 },
      { id: 'spiky', weight: 3 },
      { id: 'ghost', weight: 2 },
      { id: 'bee', weight: 2 },
      { id: 'bruiser', weight: 1 },
      { id: 'elite', weight: 0.5 },
    ];
  if (t < 480)
    return [
      { id: 'basic', weight: 3 },
      { id: 'fast', weight: 3 },
      { id: 'spiky', weight: 2 },
      { id: 'flyer', weight: 2 },
      { id: 'ghost', weight: 2 },
      { id: 'bruiser', weight: 2 },
      { id: 'elite', weight: 1.2 },
    ];
  // Late endless — fewer trivials, more bruisers/elites/ranged
  return [
    { id: 'basic', weight: 1 },
    { id: 'fast', weight: 2 },
    { id: 'spiky', weight: 2 },
    { id: 'flyer', weight: 3 },
    { id: 'ghost', weight: 3 },
    { id: 'bruiser', weight: 4 },
    { id: 'elite', weight: 3.2 },
    { id: 'bee', weight: 1.5 },
  ];
}

export type TempBuffId =
  | 'emergency-repair'
  | 'weapon-overcharge'
  | 'cooldown-flush'
  | 'emergency-barrier'
  | 'thruster-surge';

export interface TempBuffDef {
  id: TempBuffId;
  title: string;
  body: string;
}

/** Legacy list — no longer offered on normal level-ups. Protocol Cache uses PROTOCOLS. */
export const TEMP_BUFFS: TempBuffDef[] = [
  { id: 'emergency-repair', title: 'Emergency Repair', body: 'Restore integrity immediately.' },
  { id: 'weapon-overcharge', title: 'Weapon Overcharge', body: 'Temporary damage boost (~20s).' },
  { id: 'cooldown-flush', title: 'Cooldown Flush', body: 'Reduce Dodge, Repulsor, and Ship cooldowns.' },
  { id: 'emergency-barrier', title: 'Emergency Barrier', body: 'Absorb the next hit.' },
  { id: 'thruster-surge', title: 'Thruster Surge', body: 'Temporary move-speed boost.' },
];

export type ProtocolId = 'aegis-barrier' | 'rocket-barrage' | 'gunship-flyby';

export interface ProtocolDef {
  id: ProtocolId;
  title: string;
  body: string;
  duration: number;
}

export const PROTOCOLS: ProtocolDef[] = [
  {
    id: 'aegis-barrier',
    title: 'Aegis Barrier',
    body: 'Deploy a scalable shield that absorbs incoming damage first.',
    duration: 60,
  },
  {
    id: 'rocket-barrage',
    title: 'Rocket Barrage',
    body: 'Call a temporary rocket battery that prioritizes bosses (~15s).',
    duration: 15,
  },
  {
    id: 'gunship-flyby',
    title: 'Gunship Flyby',
    body: 'Your ship strafes the arena, raining fire along a telegraphed lane.',
    duration: 6,
  },
];

/** Shield points granted by Aegis Barrier at acquisition time. */
export function computeShieldPoints(elapsedSec: number, maxHealth: number): number {
  const m = Math.max(0, elapsedSec / 60);
  return Math.round(35 + 6 * m + 0.08 * maxHealth);
}

/** Boss-focus base probability from elapsed time (before modifiers). */
export function bossFocusBaseChance(timeSec: number): number {
  if (timeSec < 600) return 0.08;
  if (timeSec < 900) return 0.25;
  if (timeSec < 1200) return 0.4;
  return 0.55;
}

export function isPrototypeWeapon(id: WeaponId): boolean {
  return !!WEAPONS[id]?.prototype;
}

export function ordinaryWeaponIds(): WeaponId[] {
  return (Object.keys(WEAPONS) as WeaponId[]).filter((id) => !WEAPONS[id]!.prototype);
}


export function bossPhaseFromHealth(health: number, maxHealth: number): BossPhase {
  if (maxHealth <= 0) return 1;
  const r = health / maxHealth;
  if (r <= SURVIVOR_BOSS.phase3Threshold) return 3;
  if (r <= SURVIVOR_BOSS.phase2Threshold) return 2;
  return 1;
}

export type SurvivorFixture =
  | 'survivor-start'
  | 'survivor-levelup'
  | 'survivor-horde'
  | 'survivor-mech'
  | 'survivor-boss'
  | 'survivor-repulsor'
  | 'survivor-ship'
  | 'survivor-damage'
  | 'survivor-miniboss'
  | 'survivor-pickups'
  | 'survivor-arc'
  | 'survivor-orbital'
  | 'survivor-mega'
  | 'survivor-cache'
  | 'survivor-shield'
  | null;

export const ALL_SURVIVOR_FIXTURES: Exclude<SurvivorFixture, null>[] = [
  'survivor-start',
  'survivor-levelup',
  'survivor-horde',
  'survivor-mech',
  'survivor-boss',
  'survivor-repulsor',
  'survivor-ship',
  'survivor-damage',
  'survivor-miniboss',
  'survivor-pickups',
  'survivor-arc',
  'survivor-orbital',
  'survivor-mega',
  'survivor-cache',
  'survivor-shield',
];

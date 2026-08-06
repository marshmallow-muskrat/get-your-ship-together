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

/** Centralized Containment Protocol tuning. */
export const SURVIVOR = {
  runDuration: 480,
  bossTime: 480,
  minibossTime: 240,
  arenaHalf: 32, // 64×64 playable
  cameraHalf: 12,
  actorScale: {
    player: 1.5,
    enemy: 1.5,
    elite: 1.5,
    miniboss: 2.1,
    boss: 1.85,
    ship: 1.35,
  },
  playerMaxHealth: 100,
  playerSpeed: 6.4,
  playerRadius: 0.55,
  playerInvuln: 0.38,
  xpMagnetBase: 3.2,
  enemyCap: 160,
  projectileCap: 220,
  pickupCap: 120,
  hazardCap: 80,
  damageEventCap: 48,
  fixedDt: 1 / 60,
  repairDropChance: 0.04,
  regenPerLevel: 0.45, // Nanite Bleed — reduced so late run isn't trivial
  mech: {
    duration: 14,
    chargePerKill: 0.012,
    chargePerElite: 0.08,
    chargePerMiniboss: 0.35,
    damageTakenMul: 0.65,
  },
  repulsor: {
    cooldown: 8,
    radius: 4.5,
    damage: 14,
    push: 4.0,
    elitePushMul: 0.4,
    minibossPushMul: 0.18,
    mechRadiusMul: 1.25,
    mechDamageMul: 1.35,
    mechPushMul: 1.2,
    knockbackDuration: 0.28,
    bossStagger: 0.55,
    bossInternalCd: 6.5,
  },
  ship: {
    duration: 2.5,
    cooldown: 16,
    speedMul: 2.6,
    damageTakenMul: 0.6,
    wakeInterval: 0.14,
    wakeLife: 1.25,
    wakeRadius: 1.0,
    wakeDamage: 10,
    wakeTickCd: 0.28,
    bodyDamage: 8,
    bodyPush: 1.2,
    bodyTickCd: 0.35,
    radius: 0.7,
  },
  damageNumbers: {
    aggregateWindow: 0.15,
    life: 0.7,
    largeThreshold: 40,
  },
} as const;

export type SurvivorForm = 'astronaut' | 'ship' | 'mech';

export type WeaponId = 'pulse' | 'microdrone' | 'rail' | 'gravity' | 'rocket' | 'bioplasma';

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
      { level: 1, label: 'Rail Lance I', damage: 55, cadence: 2.2, count: 1, width: 0.45, length: 14 },
      { level: 2, label: 'Rail Lance II', damage: 70, cadence: 2.0, count: 1, width: 0.55, length: 15 },
      { level: 3, label: 'Twin Rails', damage: 70, cadence: 1.85, count: 2, width: 0.5, length: 15 },
      { level: 4, label: 'Wide Beam', damage: 90, cadence: 1.7, count: 2, width: 0.7, length: 16 },
      { level: 5, label: 'Lance Battery', damage: 110, cadence: 1.5, count: 3, width: 0.65, length: 17 },
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
      { level: 1, label: 'Rocket Barrage I', damage: 48, cadence: 2.6, count: 3, radius: 1.3, life: 0.55 },
      { level: 2, label: 'Rocket Barrage II', damage: 58, cadence: 2.4, count: 4, radius: 1.4, life: 0.55 },
      { level: 3, label: 'Salvo', damage: 62, cadence: 2.2, count: 5, radius: 1.5, life: 0.5 },
      { level: 4, label: 'Cluster', damage: 70, cadence: 2.0, count: 6, radius: 1.6, life: 0.5 },
      { level: 5, label: 'Carpet Fire', damage: 82, cadence: 1.8, count: 8, radius: 1.75, life: 0.45 },
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
        damage: 30,
        cadence: 0.9,
        count: 1,
        speed: 16,
        radius: 0.28,
        life: 1.4,
        splash: 1.35,
        puddleRadius: 1.1,
        puddleLife: 1.6,
        puddleDamage: 8,
      },
      {
        level: 2,
        label: 'Bio-Plasma Glob II',
        damage: 38,
        cadence: 0.85,
        count: 1,
        speed: 17,
        radius: 0.3,
        life: 1.45,
        splash: 1.65,
        puddleRadius: 1.2,
        puddleLife: 1.8,
        puddleDamage: 9,
      },
      {
        level: 3,
        label: 'Corrosive Glob',
        damage: 42,
        cadence: 0.8,
        count: 1,
        speed: 17.5,
        radius: 0.32,
        life: 1.5,
        splash: 1.7,
        puddleRadius: 1.55,
        puddleLife: 2.6,
        puddleDamage: 12,
      },
      {
        level: 4,
        label: 'Twin Globs',
        damage: 40,
        cadence: 0.78,
        count: 2,
        speed: 18,
        radius: 0.3,
        life: 1.5,
        splash: 1.55,
        puddleRadius: 1.4,
        puddleLife: 2.2,
        puddleDamage: 11,
      },
      {
        level: 5,
        label: 'Virulent Cascade',
        damage: 46,
        cadence: 0.72,
        count: 2,
        speed: 18.5,
        radius: 0.32,
        life: 1.55,
        splash: 1.75,
        puddleRadius: 1.85,
        puddleLife: 3.0,
        puddleDamage: 14,
        bounce: 1,
        split: 1,
      },
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
  | 'mech-duration';

export interface PassiveDef {
  id: PassiveId;
  name: string;
  description: string;
  maxLevel: number;
  perLevel: number;
}

export const PASSIVES: PassiveDef[] = [
  { id: 'move-speed', name: 'Thruster Boost', description: 'Move faster through the horde.', maxLevel: 5, perLevel: 0.08 },
  { id: 'pickup-radius', name: 'Magnet Field', description: 'Pull energy cells from farther away.', maxLevel: 5, perLevel: 0.35 },
  { id: 'max-health', name: 'Hull Plating', description: 'Increase max integrity.', maxLevel: 5, perLevel: 20 },
  { id: 'regen', name: 'Nanite Bleed', description: 'Slow automatic repair over time.', maxLevel: 5, perLevel: 0.45 },
  { id: 'weapon-haste', name: 'Overclock', description: 'All weapons fire faster.', maxLevel: 5, perLevel: 0.08 },
  { id: 'area', name: 'Containment Field', description: 'Larger weapon areas and blasts.', maxLevel: 5, perLevel: 0.1 },
  { id: 'mech-charge', name: 'Core Siphon', description: 'Mech meter fills faster from kills.', maxLevel: 5, perLevel: 0.15 },
  { id: 'mech-duration', name: 'Reactor Hold', description: 'Longer mech transform window.', maxLevel: 5, perLevel: 0.12 },
];

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

export function weaponLevelDef(weaponId: WeaponId, level: number): WeaponLevelDef {
  const fam = WEAPONS[weaponId];
  const idx = Math.max(0, Math.min(fam.levels.length - 1, level - 1));
  return fam.levels[idx]!;
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
  maxHealth: 7600,
  phase2Threshold: 0.65,
  phase3Threshold: 0.35,
  patterns: {
    pulse: { windup: 1.0, active: 0.7, recovery: 0.85, damage: 20, maxRadius: 8 },
    line: { windup: 0.9, active: 0.45, recovery: 0.95, damage: 26, length: 20, width: 1.25 },
    fan: { windup: 0.75, active: 0.15, recovery: 0.9, damage: 14, count: 7, speed: 14 },
    summon: { windup: 0.95, active: 0.12, recovery: 1.15, count: 6 },
  },
  phaseMods: {
    1: { recoveryMul: 1.0, damageMul: 1.0, fanCountAdd: 0, summonCount: 4, idleGap: 0.55 },
    2: { recoveryMul: 0.72, damageMul: 1.2, fanCountAdd: 2, summonCount: 7, idleGap: 0.38 },
    3: { recoveryMul: 0.55, damageMul: 1.4, fanCountAdd: 4, summonCount: 10, idleGap: 0.22 },
  },
} as const;

export interface DifficultyTier {
  t0: number;
  t1: number;
  populationMin: number;
  populationMax: number;
  healthMul: number;
  damageMul: number;
  speedMul: number;
  spawnRate: number;
}

/** Time-based difficulty director (pure). */
export function difficultyAt(time: number): DifficultyTier {
  if (time < 60) {
    return {
      t0: 0,
      t1: 60,
      populationMin: 15,
      populationMax: 25,
      healthMul: 1.0,
      damageMul: 1.0,
      speedMul: 1.0,
      spawnRate: 1.6,
    };
  }
  if (time < 180) {
    return {
      t0: 60,
      t1: 180,
      populationMin: 30,
      populationMax: 50,
      healthMul: 1.1,
      damageMul: 1.1,
      speedMul: 1.02,
      spawnRate: 2.4,
    };
  }
  if (time < 300) {
    return {
      t0: 180,
      t1: 300,
      populationMin: 55,
      populationMax: 80,
      healthMul: 1.3,
      damageMul: 1.2,
      speedMul: 1.04,
      spawnRate: 3.2,
    };
  }
  if (time < 420) {
    return {
      t0: 300,
      t1: 420,
      populationMin: 80,
      populationMax: 120,
      healthMul: 1.55,
      damageMul: 1.35,
      speedMul: 1.07,
      spawnRate: 4.0,
    };
  }
  if (time < 480) {
    return {
      t0: 420,
      t1: 480,
      populationMin: 120,
      populationMax: 160,
      healthMul: 1.8,
      damageMul: 1.5,
      speedMul: 1.1,
      spawnRate: 4.8,
    };
  }
  // Boss window — reduced pressure
  return {
    t0: 480,
    t1: 9999,
    populationMin: 25,
    populationMax: 55,
    healthMul: 1.85,
    damageMul: 1.55,
    speedMul: 1.08,
    spawnRate: 1.4,
  };
}

/** Spawn intensity 0–1 over run time (legacy helper; director prefers difficultyAt). */
export function spawnPressure(t: number): number {
  return difficultyAt(t).spawnRate / 4.8;
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
      { id: 'elite', weight: 0.4 },
    ];
  if (t < 420)
    return [
      { id: 'basic', weight: 3 },
      { id: 'fast', weight: 3 },
      { id: 'spiky', weight: 2 },
      { id: 'flyer', weight: 2 },
      { id: 'ghost', weight: 2 },
      { id: 'bruiser', weight: 2 },
      { id: 'elite', weight: 1 },
    ];
  return [
    { id: 'basic', weight: 2 },
    { id: 'fast', weight: 3 },
    { id: 'spiky', weight: 2 },
    { id: 'flyer', weight: 2 },
    { id: 'ghost', weight: 2 },
    { id: 'bruiser', weight: 2 },
    { id: 'elite', weight: 1.5 },
    { id: 'bee', weight: 1 },
  ];
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
];

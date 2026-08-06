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

export const SURVIVOR = {
  runDuration: 480, // 8 minutes
  bossTime: 480,
  arenaHalf: 16, // 32×32 playable
  playerMaxHealth: 100,
  playerSpeed: 5.8,
  playerRadius: 0.42,
  xpMagnetBase: 2.8,
  enemyCap: 160,
  projectileCap: 220,
  pickupCap: 120,
  fixedDt: 1 / 60,
  mech: {
    duration: 14,
    chargePerKill: 0.012,
    chargePerElite: 0.08,
    damageTakenMul: 0.65,
  },
} as const;

export type WeaponId = 'pulse' | 'microdrone' | 'rail' | 'gravity' | 'rocket';

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
}

export interface WeaponFamily {
  id: WeaponId;
  name: string;
  description: string;
  levels: WeaponLevelDef[];
}

export const WEAPONS: Record<WeaponId, WeaponFamily> = {
  pulse: {
    id: 'pulse',
    name: 'Pulse Blaster',
    description: 'Auto-locks nearest hostiles with rapid bolts.',
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
    levels: [
      { level: 1, label: 'Rocket Barrage I', damage: 48, cadence: 2.6, count: 3, radius: 1.3, life: 0.55 },
      { level: 2, label: 'Rocket Barrage II', damage: 58, cadence: 2.4, count: 4, radius: 1.4, life: 0.55 },
      { level: 3, label: 'Salvo', damage: 62, cadence: 2.2, count: 5, radius: 1.5, life: 0.5 },
      { level: 4, label: 'Cluster', damage: 70, cadence: 2.0, count: 6, radius: 1.6, life: 0.5 },
      { level: 5, label: 'Carpet Fire', damage: 82, cadence: 1.8, count: 8, radius: 1.75, life: 0.45 },
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
  /** Per-level effect magnitudes. */
  perLevel: number;
}

export const PASSIVES: PassiveDef[] = [
  { id: 'move-speed', name: 'Thruster Boost', description: 'Move faster through the horde.', maxLevel: 5, perLevel: 0.08 },
  { id: 'pickup-radius', name: 'Magnet Field', description: 'Pull energy cells from farther away.', maxLevel: 5, perLevel: 0.35 },
  { id: 'max-health', name: 'Hull Plating', description: 'Increase max integrity.', maxLevel: 5, perLevel: 20 },
  { id: 'regen', name: 'Nanite Bleed', description: 'Slow automatic repair over time.', maxLevel: 5, perLevel: 0.8 },
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
      return 'gravity';
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
  // ~12–15 levels in 8 minutes with dense kills
  return Math.floor(12 + level * 8 + level * level * 1.6);
}

export type HordeRole = 'basic' | 'fast' | 'ranged' | 'bruiser' | 'elite';

export interface HordeEnemyDef {
  id: string;
  role: HordeRole;
  visual: EnemyDef;
  xp: number;
  isElite?: boolean;
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
};

export const SURVIVOR_BOSS = {
  ...BOSS_DEMON,
  maxHealth: 4200,
  patterns: {
    pulse: { windup: 1.0, active: 0.7, recovery: 0.8, damage: 18, maxRadius: 8 },
    line: { windup: 0.85, active: 0.45, recovery: 0.9, damage: 22, length: 18, width: 1.2 },
    fan: { windup: 0.7, active: 0.15, recovery: 0.85, damage: 12, count: 7, speed: 14 },
    summon: { windup: 0.9, active: 0.1, recovery: 1.1, count: 8 },
  },
} as const;

/** Spawn intensity 0–1 over run time. */
export function spawnPressure(t: number): number {
  if (t < 120) return 0.15 + (t / 120) * 0.2;
  if (t < 240) return 0.35 + ((t - 120) / 120) * 0.2;
  if (t < 360) return 0.55 + ((t - 240) / 120) * 0.2;
  if (t < 480) return 0.75 + ((t - 360) / 120) * 0.25;
  return 0.35; // during boss, reduced
}

export function compositionAt(t: number): Array<{ id: string; weight: number }> {
  if (t < 90) return [{ id: 'basic', weight: 8 }, { id: 'mush', weight: 2 }];
  if (t < 180)
    return [
      { id: 'basic', weight: 5 },
      { id: 'fast', weight: 3 },
      { id: 'flyer', weight: 2 },
    ];
  if (t < 300)
    return [
      { id: 'basic', weight: 4 },
      { id: 'spiky', weight: 3 },
      { id: 'ghost', weight: 2 },
      { id: 'bee', weight: 2 },
      { id: 'bruiser', weight: 1 },
    ];
  return [
    { id: 'basic', weight: 3 },
    { id: 'fast', weight: 3 },
    { id: 'spiky', weight: 2 },
    { id: 'flyer', weight: 2 },
    { id: 'ghost', weight: 2 },
    { id: 'bruiser', weight: 2 },
    { id: 'elite', weight: 1 },
  ];
}

export type SurvivorFixture =
  | 'survivor-start'
  | 'survivor-levelup'
  | 'survivor-horde'
  | 'survivor-mech'
  | 'survivor-boss'
  | null;

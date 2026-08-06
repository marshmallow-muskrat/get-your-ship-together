export type EnemyRole = 'melee' | 'ranged';

export interface EnemyDef {
  id: string;
  role: EnemyRole;
  url: string;
  targetHeight: number;
  colliderRadius: number;
  maxHealth: number;
  moveSpeed: number;
  damage: number;
  attackRange: number;
  windup: number;
  active: number;
  recovery: number;
  attackCooldown: number;
  separation: number;
  projectileSpeed?: number;
  projectileRadius?: number;
  anim: {
    idle: string[];
    walk: string[];
    attack: string[];
    hit: string[];
    death: string[];
  };
}

const BLOB_ANIM: EnemyDef['anim'] = {
  idle: ['Idle'],
  walk: ['Walk', 'Jump'],
  attack: ['Bite_Front', 'Jump'],
  hit: ['HitRecieve', 'No'],
  death: ['Death'],
};

const FLY_ANIM: EnemyDef['anim'] = {
  idle: ['Flying_Idle', 'Idle'],
  walk: ['Fast_Flying', 'Flying_Idle'],
  attack: ['Punch', 'Headbutt'],
  hit: ['HitReact', 'No'],
  death: ['Death'],
};

export const MELEE_BLOB: EnemyDef = {
  id: 'melee-blob',
  role: 'melee',
  url: '/runtime/enemies/melee-blob.gltf',
  targetHeight: 1.15,
  colliderRadius: 0.42,
  maxHealth: 55,
  moveSpeed: 3.2,
  damage: 8,
  attackRange: 1.15,
  windup: 0.55,
  active: 0.18,
  recovery: 0.65,
  attackCooldown: 1.55,
  separation: 1.15,
  anim: { ...BLOB_ANIM },
};

export const MELEE_SPIKY: EnemyDef = {
  id: 'melee-spiky',
  role: 'melee',
  url: '/runtime/enemies/melee-spiky.gltf',
  targetHeight: 1.25,
  colliderRadius: 0.48,
  maxHealth: 75,
  moveSpeed: 2.7,
  damage: 12,
  attackRange: 1.25,
  windup: 0.62,
  active: 0.2,
  recovery: 0.75,
  attackCooldown: 1.7,
  separation: 1.25,
  anim: { ...BLOB_ANIM },
};

export const MELEE_ALIEN: EnemyDef = {
  id: 'melee-alien',
  role: 'melee',
  url: '/runtime/enemies/melee-alien.gltf',
  targetHeight: 1.35,
  colliderRadius: 0.45,
  maxHealth: 65,
  moveSpeed: 3.6,
  damage: 9,
  attackRange: 1.2,
  windup: 0.48,
  active: 0.16,
  recovery: 0.55,
  attackCooldown: 1.35,
  separation: 1.1,
  anim: { ...BLOB_ANIM },
};

export const MELEE_ORC: EnemyDef = {
  id: 'melee-orc',
  role: 'melee',
  url: '/runtime/enemies/melee-orc.gltf',
  targetHeight: 1.55,
  colliderRadius: 0.55,
  maxHealth: 95,
  moveSpeed: 2.4,
  damage: 14,
  attackRange: 1.35,
  windup: 0.7,
  active: 0.22,
  recovery: 0.85,
  attackCooldown: 1.9,
  separation: 1.4,
  anim: { ...BLOB_ANIM },
};

export const MELEE_MUSHNUB: EnemyDef = {
  id: 'melee-mushnub',
  role: 'melee',
  url: '/runtime/enemies/melee-mushnub.gltf',
  targetHeight: 1.05,
  colliderRadius: 0.4,
  maxHealth: 48,
  moveSpeed: 3.0,
  damage: 7,
  attackRange: 1.1,
  windup: 0.5,
  active: 0.16,
  recovery: 0.6,
  attackCooldown: 1.45,
  separation: 1.05,
  anim: { ...BLOB_ANIM },
};

export const RANGED_GOLELING: EnemyDef = {
  id: 'ranged-goleling',
  role: 'ranged',
  url: '/runtime/enemies/ranged-goleling.gltf',
  targetHeight: 1.35,
  colliderRadius: 0.4,
  maxHealth: 40,
  moveSpeed: 2.6,
  damage: 7,
  attackRange: 8.5,
  windup: 0.65,
  active: 0.12,
  recovery: 0.75,
  attackCooldown: 2.1,
  separation: 1.4,
  projectileSpeed: 12,
  projectileRadius: 0.2,
  anim: { ...FLY_ANIM },
};

export const RANGED_GHOST: EnemyDef = {
  id: 'ranged-ghost',
  role: 'ranged',
  url: '/runtime/enemies/ranged-ghost.gltf',
  targetHeight: 1.45,
  colliderRadius: 0.42,
  maxHealth: 38,
  moveSpeed: 3.0,
  damage: 8,
  attackRange: 9.0,
  windup: 0.55,
  active: 0.12,
  recovery: 0.7,
  attackCooldown: 1.85,
  separation: 1.5,
  projectileSpeed: 14,
  projectileRadius: 0.18,
  anim: { ...FLY_ANIM },
};

export const RANGED_ARMABEE: EnemyDef = {
  id: 'ranged-armabee',
  role: 'ranged',
  url: '/runtime/enemies/ranged-armabee.gltf',
  targetHeight: 1.2,
  colliderRadius: 0.38,
  maxHealth: 34,
  moveSpeed: 3.4,
  damage: 6,
  attackRange: 7.5,
  windup: 0.45,
  active: 0.1,
  recovery: 0.55,
  attackCooldown: 1.55,
  separation: 1.25,
  projectileSpeed: 15,
  projectileRadius: 0.16,
  anim: { ...FLY_ANIM },
};

export const RANGED_SQUIDLE: EnemyDef = {
  id: 'ranged-squidle',
  role: 'ranged',
  url: '/runtime/enemies/ranged-squidle.gltf',
  targetHeight: 1.5,
  colliderRadius: 0.5,
  maxHealth: 52,
  moveSpeed: 2.3,
  damage: 10,
  attackRange: 9.5,
  windup: 0.75,
  active: 0.14,
  recovery: 0.9,
  attackCooldown: 2.3,
  separation: 1.6,
  projectileSpeed: 11,
  projectileRadius: 0.24,
  anim: { ...FLY_ANIM },
};

export const ALL_ENEMIES: EnemyDef[] = [
  MELEE_BLOB,
  MELEE_SPIKY,
  MELEE_ALIEN,
  MELEE_ORC,
  MELEE_MUSHNUB,
  RANGED_GOLELING,
  RANGED_GHOST,
  RANGED_ARMABEE,
  RANGED_SQUIDLE,
];

export const ENEMY_BY_ID: Record<string, EnemyDef> = Object.fromEntries(
  ALL_ENEMIES.map((e) => [e.id, e]),
);

export const BOSS_DEMON = {
  id: 'blue-demon',
  url: '/runtime/boss/blue-demon.gltf',
  targetHeight: 3.6,
  colliderRadius: 0.95,
  maxHealth: 1100,
  moveSpeed: 2.6,
  phase2Threshold: 0.5,
  damageTakenMul: 1,
  anim: {
    idle: ['Idle'],
    walk: ['Walk', 'Run'],
    attack: ['Punch', 'Weapon', 'Jump'],
    hit: ['HitReact'],
    death: ['Death'],
  },
  patterns: {
    slam: { windup: 0.85, active: 0.22, recovery: 0.7, damage: 18, range: 3.2, angle: Math.PI * 0.55 },
    pulse: { windup: 0.95, active: 0.55, recovery: 0.6, damage: 14, maxRadius: 5.2 },
    charge: { windup: 0.7, active: 0.55, recovery: 0.85, damage: 20, speed: 12, width: 1.1 },
  },
} as const;

export type BossPatternId = keyof typeof BOSS_DEMON.patterns;

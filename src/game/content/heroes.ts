export type HeroId = 'bee' | 'flamingo' | 'frog' | 'red-panda';
export type PlayerForm = 'astronaut' | 'mech';

export interface FormProfile {
  modelId: string;
  url: string;
  /** Visual height target in world units. */
  targetHeight: number;
  forwardYaw: number;
  groundOffset: number;
  colliderRadius: number;
  muzzleOffset: { x: number; y: number; z: number };
  moveSpeed: number;
  primary: WeaponDef;
  abilityDamageMul: number;
  damageTakenMul: number;
  anim: AnimationAliases;
}

export interface WeaponDef {
  cadence: number;
  projectileSpeed: number;
  damage: number;
  radius: number;
  lifetime: number;
  spread: number;
  bolts: number;
}

export interface AnimationAliases {
  idle: string[];
  walk: string[];
  run: string[];
  shoot: string[];
  dodge: string[];
  hit: string[];
  death: string[];
  ability: string[];
}

export interface HeroDef {
  id: HeroId;
  name: string;
  species: string;
  accent: string;
  fullName: string;
  shipUrl: string;
  astronaut: FormProfile;
  mech: FormProfile;
  abilityId: AbilityId;
  abilityCooldown: number;
}

export type AbilityId = 'microdrone' | 'rail-lance' | 'gravity-pulse' | 'rocket-barrage';

const ASTRONAUT_ANIM: AnimationAliases = {
  idle: ['Idle_Gun', 'Idle'],
  walk: ['Walk_Gun', 'Walk', 'Run_Gun'],
  run: ['Run_Gun', 'Run', 'Walk_Gun'],
  shoot: ['Run_Gun_Shoot', 'Weapon', 'Punch'],
  dodge: ['Duck', 'Jump', 'Run'],
  hit: ['HitReact', 'Duck'],
  death: ['Death'],
  ability: ['Weapon', 'Punch', 'Wave'],
};

const MECH_ANIM: AnimationAliases = {
  idle: ['Idle'],
  walk: ['Walk', 'Run'],
  run: ['Run', 'Walk'],
  shoot: ['Shoot_Small', 'Shoot_Big', 'Kick'],
  dodge: ['Jump_NoHeight', 'Jump', 'Run'],
  hit: ['HitRecieve_1', 'HitRecieve_2'],
  death: ['Death'],
  ability: ['Shoot_Big', 'Kick', 'Hello'],
};

const blaster: WeaponDef = {
  cadence: 0.18,
  projectileSpeed: 28,
  damage: 12,
  radius: 0.22,
  lifetime: 1.1,
  spread: 0,
  bolts: 1,
};

const heavyBlaster: WeaponDef = {
  cadence: 0.12,
  projectileSpeed: 32,
  damage: 18,
  radius: 0.28,
  lifetime: 1.2,
  spread: 0.04,
  bolts: 2,
};

function astronautForm(modelId: string, url: string): FormProfile {
  return {
    modelId,
    url,
    targetHeight: 1.95,
    forwardYaw: 0,
    groundOffset: 0,
    colliderRadius: 0.4,
    muzzleOffset: { x: 0.3, y: 1.2, z: 0.5 },
    moveSpeed: 6.4,
    primary: blaster,
    abilityDamageMul: 1,
    damageTakenMul: 1,
    anim: ASTRONAUT_ANIM,
  };
}

function mechForm(modelId: string, url: string): FormProfile {
  return {
    modelId,
    url,
    targetHeight: 2.95,
    forwardYaw: 0,
    groundOffset: 0,
    colliderRadius: 0.6,
    muzzleOffset: { x: 0.5, y: 1.75, z: 0.8 },
    moveSpeed: 5.5,
    primary: heavyBlaster,
    abilityDamageMul: 1.55,
    damageTakenMul: 0.72,
    anim: MECH_ANIM,
  };
}

const root = '/runtime/heroes';

export const HEROES: Record<HeroId, HeroDef> = {
  bee: {
    id: 'bee',
    name: 'Boswell',
    species: 'The Bee',
    fullName: 'Boswell the Bee',
    accent: '#f5ae42',
    shipUrl: `${root}/ship-bee.gltf`,
    astronaut: astronautForm('astronaut-bee', `${root}/astronaut-bee.gltf`),
    mech: mechForm('mech-bee', `${root}/mech-bee.gltf`),
    abilityId: 'microdrone',
    abilityCooldown: 6,
  },
  flamingo: {
    id: 'flamingo',
    name: 'Fitzwilliam',
    species: 'The Flamingo',
    fullName: 'Fitzwilliam the Flamingo',
    accent: '#ff7c9a',
    shipUrl: `${root}/ship-flamingo.gltf`,
    astronaut: astronautForm('astronaut-flamingo', `${root}/astronaut-flamingo.gltf`),
    mech: mechForm('mech-flamingo', `${root}/mech-flamingo.gltf`),
    abilityId: 'rail-lance',
    abilityCooldown: 6,
  },
  frog: {
    id: 'frog',
    name: 'Fortunato',
    species: 'The Frog',
    fullName: 'Fortunato the Frog',
    accent: '#71f6da',
    shipUrl: `${root}/ship-frog.gltf`,
    astronaut: astronautForm('astronaut-frog', `${root}/astronaut-frog.gltf`),
    mech: mechForm('mech-frog', `${root}/mech-frog.gltf`),
    abilityId: 'gravity-pulse',
    abilityCooldown: 6,
  },
  'red-panda': {
    id: 'red-panda',
    name: 'Rutherford',
    species: 'The Red Panda',
    fullName: 'Rutherford the Red Panda',
    accent: '#ff876b',
    shipUrl: `${root}/ship-red-panda.gltf`,
    astronaut: astronautForm('astronaut-red-panda', `${root}/astronaut-red-panda.gltf`),
    mech: mechForm('mech-red-panda', `${root}/mech-red-panda.gltf`),
    abilityId: 'rocket-barrage',
    abilityCooldown: 6,
  },
};

export const HERO_LIST: HeroDef[] = [
  HEROES.bee,
  HEROES.flamingo,
  HEROES.frog,
  HEROES['red-panda'],
];

export function isHeroId(value: string): value is HeroId {
  return value in HEROES;
}

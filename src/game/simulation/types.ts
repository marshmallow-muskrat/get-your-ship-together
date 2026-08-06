import type { AbilityId, HeroId, PlayerForm } from '../content/heroes';
import type { BossPatternId, EnemyRole } from '../content/enemies';

export type Vec2 = { x: number; z: number };

export type EncounterPhase =
  | 'intro'
  | 'explore'
  | 'wave'
  | 'boss_gate'
  | 'boss_intro'
  | 'boss'
  | 'reward'
  | 'complete'
  | 'dead';

export type FormState = 'astronaut' | 'entering' | 'mech' | 'exiting';

export type EnemyAiState = 'spawn' | 'idle' | 'chase' | 'windup' | 'active' | 'recover' | 'hit' | 'dead';

export type BossAiState =
  | 'intro'
  | 'idle'
  | 'windup'
  | 'active'
  | 'recover'
  | 'phase_shift'
  | 'dead';

export interface CooldownState {
  remaining: number;
  duration: number;
}

export interface PlayerState {
  heroId: HeroId;
  form: PlayerForm;
  formState: FormState;
  formTimer: number;
  x: number;
  z: number;
  facingX: number;
  facingZ: number;
  vx: number;
  vz: number;
  health: number;
  maxHealth: number;
  invulnTimer: number;
  fireCooldown: number;
  dodge: CooldownState;
  dodgeActive: number;
  repair: CooldownState;
  ability: CooldownState;
  mech: CooldownState;
  mechDuration: number;
  hitFlash: number;
  alive: boolean;
}

export interface EnemyState {
  id: number;
  defId: string;
  role: EnemyRole;
  x: number;
  z: number;
  facingX: number;
  facingZ: number;
  health: number;
  maxHealth: number;
  state: EnemyAiState;
  stateTimer: number;
  attackCd: number;
  hitFlash: number;
  slowTimer: number;
  slowMul: number;
  spawnTimer: number;
  radius: number;
}

export interface BossState {
  active: boolean;
  x: number;
  z: number;
  facingX: number;
  facingZ: number;
  health: number;
  maxHealth: number;
  phase: 1 | 2;
  state: BossAiState;
  pattern: BossPatternId | null;
  stateTimer: number;
  patternTimer: number;
  chargeDirX: number;
  chargeDirZ: number;
  hitFlash: number;
  telegraphRadius: number;
}

export interface ProjectileState {
  id: number;
  kind: 'player' | 'enemy' | 'drone' | 'rocket';
  x: number;
  z: number;
  y: number;
  vx: number;
  vz: number;
  damage: number;
  radius: number;
  life: number;
  maxLife: number;
  owner: 'player' | 'enemy' | 'boss';
  pierce: number;
  homing: boolean;
  color: string;
  /** Rocket delay before arming. */
  armTimer: number;
  explodeRadius: number;
}

export interface EffectEvent {
  id: number;
  kind:
    | 'muzzle'
    | 'impact'
    | 'death'
    | 'spawn'
    | 'repair'
    | 'transform'
    | 'pulse'
    | 'rail'
    | 'rocket'
    | 'pickup'
    | 'shake'
    | 'damage_number'
    | 'telegraph';
  x: number;
  z: number;
  y?: number;
  color?: string;
  scale?: number;
  life: number;
  maxLife: number;
  text?: string;
  /** For telegraphs: cone, circle, line */
  shape?: 'cone' | 'circle' | 'line';
  angle?: number;
  facingX?: number;
  facingZ?: number;
  radius?: number;
  length?: number;
  width?: number;
}

export interface ShipPartState {
  active: boolean;
  collected: boolean;
  x: number;
  z: number;
  radius: number;
}

export interface ArenaBounds {
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
}

export interface Obstacle {
  x: number;
  z: number;
  halfW: number;
  halfD: number;
}

export interface GameState {
  time: number;
  tick: number;
  seed: number;
  phase: EncounterPhase;
  phaseTimer: number;
  objective: string;
  player: PlayerState;
  enemies: EnemyState[];
  boss: BossState;
  projectiles: ProjectileState[];
  effects: EffectEvent[];
  shipPart: ShipPartState;
  obstacles: Obstacle[];
  walkable: ArenaBounds[];
  hitstop: number;
  paused: boolean;
  muted: boolean;
  checkpoint: 'start' | 'pre_boss';
  nextEntityId: number;
  killCount: number;
  /** 0 = not started; 1..N = active/cleared wave index (1-based). */
  waveIndex: number;
  bossGateOpen: boolean;
  railSegments: Array<{ x0: number; z0: number; x1: number; z1: number; life: number; color: string }>;
  abilityId: AbilityId;
  accent: string;
}

export interface InputFrame {
  moveX: number;
  moveZ: number;
  aimX: number;
  aimZ: number;
  fireHeld: boolean;
  firePressed: boolean;
  dodgePressed: boolean;
  abilityPressed: boolean;
  repairPressed: boolean;
  mechPressed: boolean;
  pausePressed: boolean;
  mutePressed: boolean;
  interactPressed: boolean;
}

export const EMPTY_INPUT: InputFrame = {
  moveX: 0,
  moveZ: 0,
  aimX: 0,
  aimZ: 1,
  fireHeld: false,
  firePressed: false,
  dodgePressed: false,
  abilityPressed: false,
  repairPressed: false,
  mechPressed: false,
  pausePressed: false,
  mutePressed: false,
  interactPressed: false,
};

export interface HudSnapshot {
  heroName: string;
  accent: string;
  health: number;
  maxHealth: number;
  form: PlayerForm;
  formState: FormState;
  dodgeReady: number;
  abilityReady: number;
  repairReady: number;
  mechReady: number;
  mechDuration: number;
  mechMaxDuration: number;
  objective: string;
  phase: EncounterPhase;
  bossActive: boolean;
  bossHealth: number;
  bossMaxHealth: number;
  bossPhase: number;
  paused: boolean;
  dead: boolean;
  complete: boolean;
  muted: boolean;
}

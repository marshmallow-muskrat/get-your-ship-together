/**
 * Simulation-owned attack entities.
 *
 * An attack entity carries the single authoritative `AttackShape` for one danger zone.
 * The renderer draws that exact shape via `shapeToRender`; collision tests that exact
 * shape via `pointHitsShape`. Neither side reconstructs its own approximate geometry.
 */
import { SURVIVOR } from './survivorContent';
import { pointHitsShape, type AttackShape } from './survivorAttackShapes';
import { nextEntityId, type SurvivorState } from './survivorState';

export type AttackLifecycle = 'windup' | 'active' | 'fade';

/**
 * Presentation intent.
 * `hostile` reads red/magenta, `marker` is an explicitly harmless indicator
 * (summon points, gravity pull core), `friendly` is player-side gold/cyan/accent.
 */
export type AttackStyle = 'hostile' | 'marker' | 'friendly';

export interface SurvivorAttack {
  id: number;
  /** Owning boss; 0 when not boss-owned. Cleanup is always scoped by this. */
  sourceBossId: number;
  patternId: string;
  /** Distinguishes sibling entities of one pattern (lane index, zone index). */
  slot: number;
  /** Authoritative geometry for both rendering and collision. */
  shape: AttackShape;
  lifecycle: AttackLifecycle;
  remaining: number;
  maxRemaining: number;
  /** Only true while this entity may damage. Windup and fade are never damaging. */
  damaging: boolean;
  /** Set once this entity has landed its single hit (lanes, detonations). */
  hasHit: boolean;
  style: AttackStyle;
  color: string;
  active: boolean;
}

export const ATTACK_CAP = 48;

/** Hostile boss warnings are red/magenta; markers and friendly markings are not. */
export const HOSTILE_ATTACK_COLORS = [
  '#ff5533',
  '#ff4455',
  '#ff6688',
  '#ff4466',
  '#ff2244',
  '#cc44ff',
  '#ff5599',
  '#ff5566',
  '#ff3366',
  '#ff44aa',
  '#ff7755',
  '#ff66aa',
  '#ff88cc',
] as const;

function acquireAttack(state: SurvivorState): SurvivorAttack | null {
  for (const a of state.attacks) {
    if (!a.active) return a;
  }
  if (state.attacks.length >= ATTACK_CAP) return null;
  const a: SurvivorAttack = {
    id: 0,
    sourceBossId: 0,
    patternId: '',
    slot: 0,
    shape: { kind: 'circle', x: 0, z: 0, radius: 1 },
    lifecycle: 'windup',
    remaining: 0,
    maxRemaining: 0,
    damaging: false,
    hasHit: false,
    style: 'hostile',
    color: '#ff4455',
    active: false,
  };
  state.attacks.push(a);
  return a;
}

export function spawnAttack(
  state: SurvivorState,
  opts: {
    sourceBossId: number;
    patternId: string;
    shape: AttackShape;
    duration: number;
    slot?: number;
    lifecycle?: AttackLifecycle;
    damaging?: boolean;
    style?: AttackStyle;
    color?: string;
  },
): SurvivorAttack | null {
  const a = acquireAttack(state);
  if (!a) return null;
  a.id = nextEntityId(state);
  a.sourceBossId = opts.sourceBossId;
  a.patternId = opts.patternId;
  a.slot = opts.slot ?? 0;
  a.shape = opts.shape;
  a.lifecycle = opts.lifecycle ?? 'windup';
  a.remaining = opts.duration;
  a.maxRemaining = Math.max(0.0001, opts.duration);
  a.damaging = opts.damaging ?? false;
  a.hasHit = false;
  a.style = opts.style ?? 'hostile';
  a.color = opts.color ?? '#ff4455';
  a.active = true;
  return a;
}

/** Active attack entities owned by one boss, in creation order. */
export function bossAttacks(state: SurvivorState, bossId: number): SurvivorAttack[] {
  const out: SurvivorAttack[] = [];
  for (const a of state.attacks) {
    if (a.active && a.sourceBossId === bossId) out.push(a);
  }
  return out;
}

export function bossAttacksOfPattern(
  state: SurvivorState,
  bossId: number,
  patternId: string,
): SurvivorAttack[] {
  return bossAttacks(state, bossId).filter((a) => a.patternId === patternId);
}

/** Promote a boss's windup entities into their damaging phase. */
export function activateBossAttacks(
  state: SurvivorState,
  bossId: number,
  duration: number,
  opts?: { damaging?: boolean },
): void {
  for (const a of bossAttacks(state, bossId)) {
    if (a.lifecycle !== 'windup') continue;
    a.lifecycle = 'active';
    // Markers are declared harmless at creation and stay that way.
    a.damaging = a.style === 'marker' ? false : (opts?.damaging ?? true);
    a.remaining = duration;
    a.maxRemaining = Math.max(0.0001, duration);
  }
}

/**
 * End a boss's attack entities.
 * They stop damaging immediately and only linger as a short visual fade —
 * there is never an invisible orphan that can still hurt the player.
 */
export function fadeBossAttacks(state: SurvivorState, bossId: number, fade = 0.18): void {
  for (const a of bossAttacks(state, bossId)) {
    a.damaging = false;
    a.lifecycle = 'fade';
    a.remaining = Math.min(a.remaining, fade);
    a.maxRemaining = Math.max(0.0001, fade);
  }
}

/** Remove a boss's attack entities outright (death / hard cancel). */
export function clearBossAttacks(state: SurvivorState, bossId: number): void {
  for (const a of state.attacks) {
    if (a.active && a.sourceBossId === bossId) {
      a.damaging = false;
      a.active = false;
    }
  }
}

/** Does this attack currently overlap the player? Uses the authoritative shape only. */
export function attackHitsPlayer(state: SurvivorState, a: SurvivorAttack): boolean {
  if (!a.active || !a.damaging) return false;
  return pointHitsShape(state.player.x, state.player.z, SURVIVOR.playerRadius, a.shape);
}

/** Tick lifetimes; expired entities are released back to the pool. */
export function updateAttacks(state: SurvivorState, dt: number): void {
  for (const a of state.attacks) {
    if (!a.active) continue;
    a.remaining -= dt;
    if (a.remaining <= 0) {
      if (a.lifecycle === 'fade') {
        a.active = false;
        a.damaging = false;
      } else {
        // A pattern that never explicitly ended still cannot linger as live damage.
        a.damaging = false;
        a.lifecycle = 'fade';
        a.remaining = 0.12;
        a.maxRemaining = 0.12;
      }
    }
  }
}

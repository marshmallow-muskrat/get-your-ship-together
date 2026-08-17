import { HORDE, bossFocusBaseChance } from './survivorContent';
import type { SurvivorBoss, SurvivorEnemy, SurvivorState, SurvivorWeaponSlot } from './survivorState';
import { aliveBossCount } from './survivorState';

export type AimTarget =
  | { kind: 'enemy'; enemy: SurvivorEnemy }
  | { kind: 'boss'; boss: SurvivorBoss }
  | null;

function dist2(ax: number, az: number, bx: number, bz: number): number {
  const dx = ax - bx;
  const dz = az - bz;
  return dx * dx + dz * dz;
}

export function bossFocusChance(state: SurvivorState): number {
  let c = bossFocusBaseChance(state.time);
  const n = aliveBossCount(state);
  if (n >= 2) c += 0.1;
  let oldest = 0;
  for (const b of state.bosses) {
    if (!b.active || b.state === 'dead') continue;
    oldest = Math.max(oldest, state.time - b.spawnTime);
  }
  if (oldest >= 45) c += 0.1;
  return Math.min(0.7, c);
}

/** Deterministic focus: accumulate debt; fire boss when debt crosses 1. */
export function consumeBossFocus(slot: SurvivorWeaponSlot, chance: number): boolean {
  if (chance <= 0) return false;
  slot.focusDebt += chance;
  if (slot.focusDebt >= 1) {
    slot.focusDebt -= 1;
    return true;
  }
  return false;
}

export function livingBosses(state: SurvivorState): SurvivorBoss[] {
  return state.bosses.filter((b) => b.active && b.state !== 'dead' && b.health > 0);
}

export function nearestBoss(
  state: SurvivorState,
  x: number,
  z: number,
  maxR: number,
): SurvivorBoss | null {
  const maxD = maxR * maxR;
  let best: SurvivorBoss | null = null;
  let bestD = maxD;
  for (const b of livingBosses(state)) {
    const d = dist2(x, z, b.x, b.z);
    if (d < bestD) {
      bestD = d;
      best = b;
    }
  }
  return best;
}

export function nearestEnemyOnly(
  state: SurvivorState,
  x: number,
  z: number,
  maxR: number,
): SurvivorEnemy | null {
  const maxD = maxR * maxR;
  let best: SurvivorEnemy | null = null;
  let bestD = maxD;
  for (const e of state.enemies) {
    if (!e.alive) continue;
    const d = dist2(x, z, e.x, e.z);
    if (d < bestD) {
      bestD = d;
      best = e;
    }
  }
  return best;
}

export function nearestElite(
  state: SurvivorState,
  x: number,
  z: number,
  maxR: number,
): SurvivorEnemy | null {
  const maxD = maxR * maxR;
  let best: SurvivorEnemy | null = null;
  let bestD = maxD;
  for (const e of state.enemies) {
    if (!e.alive || (!e.isElite && !e.isMiniboss)) continue;
    const d = dist2(x, z, e.x, e.z);
    if (d < bestD) {
      bestD = d;
      best = e;
    }
  }
  return best;
}

const CLOSE_THREAT_RANGE = 3.25;

/**
 * Shared boss-aware target selection for automatic weapons.
 *
 * Live play shoots a close threat first, then the boss, then elites. Isolated
 * benches keep the published nearest-enemy / focus-debt lottery.
 */
export function selectWeaponTarget(
  state: SurvivorState,
  slot: SurvivorWeaponSlot,
  x: number,
  z: number,
  maxR: number,
  opts?: { forceBoss?: boolean },
): AimTarget {
  const boss = nearestBoss(state, x, z, maxR);
  const enemy = nearestEnemyOnly(state, x, z, maxR);
  if (!boss && !enemy) return null;
  if (state.isolateLiveTravel || state.isolatePublishedWeapons) {
    if (!boss) return { kind: 'enemy', enemy: enemy! };
    if (!enemy) return { kind: 'boss', boss };
    const wantBoss = opts?.forceBoss || consumeBossFocus(slot, bossFocusChance(state));
    if (wantBoss) return { kind: 'boss', boss };
    return { kind: 'enemy', enemy };
  }
  const close = nearestEnemyOnly(state, x, z, CLOSE_THREAT_RANGE);
  if (close) return { kind: 'enemy', enemy: close };
  if (boss) return { kind: 'boss', boss };
  const elite = nearestElite(state, x, z, maxR);
  if (elite) return { kind: 'enemy', enemy: elite };
  return { kind: 'enemy', enemy: enemy! };
}

export function targetPosition(t: AimTarget): { x: number; z: number } | null {
  if (!t) return null;
  if (t.kind === 'boss') return { x: t.boss.x, z: t.boss.z };
  return { x: t.enemy.x, z: t.enemy.z };
}

/**
 * Aim point for delayed strikes, led by the target's current motion.
 *
 * Without this an orbital strike lands where the target *was*, which against anything
 * that walks is a clean miss — the reason the weapon measured near zero on moving
 * targets while looking fine against a stationary dummy.
 */
export function leadTargetPosition(
  t: AimTarget,
  delaySec: number,
): { x: number; z: number } | null {
  if (!t) return null;
  if (t.kind === 'boss') {
    // Bosses close on the player along their facing at their move speed.
    return { x: t.boss.x, z: t.boss.z };
  }
  // Enemy movement is integrated straight into x/z, so derive velocity from the
  // maintained facing and the role's live speed rather than from a stale vx/vz.
  const e = t.enemy;
  const speed = (HORDE[e.defId]?.baseSpeed ?? 4) * e.speedMul;
  const fl = Math.hypot(e.facingX, e.facingZ) || 1;
  return {
    x: e.x + (e.facingX / fl) * speed * delaySec,
    z: e.z + (e.facingZ / fl) * speed * delaySec,
  };
}

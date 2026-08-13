/**
 * Ground-effect geometry contract (endless-2.8.0 presentation pass).
 *
 * A visual that represents a **gameplay boundary** — a telegraph the player reads to
 * find safe ground, a blast ring that says "this is what was hit" — must be drawn at
 * the radius the simulation actually used. Before this module the renderer applied one
 * generic ramp to every ring it did not special-case:
 *
 *     obj.scale.setScalar(0.5 + t * 1.4)      // t: 0 -> 1 across the effect's life
 *
 * so every `pulse`, `impact` and radius-form `telegraph` opened at **half** its authored
 * radius and finished at **1.9x** it. A Pulsar Core discharge authored at radius 8.0 —
 * the number Containment Field scales — was drawn sweeping out to 15.2. The Containment
 * Warden's Ground Slam telegraph, whose whole job is to show the player where not to
 * stand, spent its 0.95s windup passing through the true 4.2 radius exactly once, on the
 * way to 8.0. Neither reading is recoverable by a player.
 *
 * The rules here are deliberately small:
 *
 * - `static` — the shape is a boundary for its whole window. Drawn at 1.0, always.
 *   A telegraph is the canonical case: it is an instruction, not an animation.
 * - `expanding` — the shape genuinely travels outward, and **stops at the boundary**.
 *   It opens small and ends at exactly 1.0, never beyond.
 * - `settling` — residue that has already resolved. Holds ~1.0 and relaxes slightly
 *   inward, never outward.
 * - `decorative` — muzzle flashes, sparks, transformation flares. These represent no
 *   gameplay boundary at all, so they keep the legacy ramp; constraining them would be
 *   pure churn.
 *
 * Pure and free of Three.js so the renderer, the simulation and the tests can all state
 * the same contract.
 */

/** How an effect's drawn radius relates to its authored gameplay radius over its life. */
export type GroundEffectMotion = 'static' | 'expanding' | 'settling' | 'decorative';

/** Effect kinds whose drawn radius is a gameplay boundary, and how each behaves. */
const MOTION: Record<string, GroundEffectMotion> = {
  // Warnings. The edge is the instruction; it must not move.
  telegraph: 'static',
  // The Orbital Lance targeting marker is a warning too: it shows the core radius for
  // the whole arming delay and must show the same one at the end that it showed at the
  // start. Same for the descending beam it resolves into.
  orbital: 'static',
  'orbital-strike': 'static',
  // Authored-length shapes: the arc's own geometry is built at the true jump length,
  // and the Titan deploy column at its true footprint. Neither is a ramp.
  arc: 'static',
  'titan-deploy': 'static',
  // Resolved blasts. They expand to the boundary and stop there.
  pulse: 'expanding',
  pulsar: 'expanding',
  'gravity-collapse': 'expanding',
  'singularity-collapse': 'expanding',
  'boomerang-rift': 'expanding',
  impact: 'expanding',
  repulsor: 'expanding',
  'orbital-shock': 'expanding',
  // Residue.
  'orbital-scorch': 'settling',
};

/** Opening fraction for each expanding kind, so a blast still reads as a blast. */
const EXPAND_FROM: Record<string, number> = {
  pulse: 0.3,
  pulsar: 0.08,
  'gravity-collapse': 0.18,
  'singularity-collapse': 0.06,
  'boomerang-rift': 0.2,
  impact: 0.35,
  repulsor: 0.12,
  'orbital-shock': 0.28,
};

export function groundEffectMotion(kind: string): GroundEffectMotion {
  return MOTION[kind] ?? 'decorative';
}

/**
 * Drawn radius as a multiple of the effect's authored radius.
 *
 * `t` is normalised age in `[0,1]` (0 at spawn, 1 at expiry) — the same value the
 * renderer already computes for its opacity fade.
 *
 * The invariant every caller may rely on: for any kind that represents a gameplay
 * boundary, the result is **never greater than 1**. A player is never shown a danger
 * ring wider than the region that can actually damage them.
 */
export function groundEffectScale(kind: string, t: number): number {
  const k = t < 0 ? 0 : t > 1 ? 1 : t;
  switch (groundEffectMotion(kind)) {
    case 'static':
      return 1;
    case 'expanding': {
      const from = EXPAND_FROM[kind] ?? 0.3;
      return from + (1 - from) * k;
    }
    case 'settling':
      // Residue has already resolved: it starts at the boundary and relaxes inward.
      return 1 - k * 0.06;
    default:
      // Legacy decorative ramp, unchanged.
      return 0.5 + k * 1.4;
  }
}

/** Effect kinds that are gameplay boundaries and must never over-draw their radius. */
export function isBoundaryEffect(kind: string): boolean {
  return groundEffectMotion(kind) !== 'decorative';
}

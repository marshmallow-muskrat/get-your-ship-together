/**
 * Shared boss attack shapes: telegraph and collision use the same geometry.
 * All tests treat player as a circle of `playerRadius` expanded into the shape.
 */

export type AttackShape =
  | { kind: 'circle'; x: number; z: number; radius: number }
  | { kind: 'ring'; x: number; z: number; inner: number; outer: number }
  | { kind: 'line'; x0: number; z0: number; x1: number; z1: number; halfWidth: number }
  | {
      kind: 'cone';
      x: number;
      z: number;
      facingX: number;
      facingZ: number;
      length: number;
      halfAngle: number;
    }
  | { kind: 'moving-circle'; x: number; z: number; radius: number };

export type ShapeRenderDesc =
  | { visual: 'circle'; x: number; z: number; radius: number }
  | { visual: 'ring'; x: number; z: number; inner: number; outer: number }
  | {
      visual: 'line';
      x: number;
      z: number;
      length: number;
      width: number;
      facingX: number;
      facingZ: number;
    }
  | {
      visual: 'cone';
      x: number;
      z: number;
      length: number;
      halfAngle: number;
      facingX: number;
      facingZ: number;
    };

/** Distance from point to segment. */
export function distPointToSegment(
  px: number,
  pz: number,
  x0: number,
  z0: number,
  x1: number,
  z1: number,
): number {
  const dx = x1 - x0;
  const dz = z1 - z0;
  const len2 = dx * dx + dz * dz;
  if (len2 < 1e-12) return Math.hypot(px - x0, pz - z0);
  let t = ((px - x0) * dx + (pz - z0) * dz) / len2;
  t = Math.max(0, Math.min(1, t));
  return Math.hypot(px - (x0 + dx * t), pz - (z0 + dz * t));
}

/** Point-in-shape with player radius expansion (collision contracts by expanding the test point). */
export function pointHitsShape(
  px: number,
  pz: number,
  playerRadius: number,
  shape: AttackShape,
): boolean {
  switch (shape.kind) {
    case 'circle':
    case 'moving-circle': {
      const d = Math.hypot(px - shape.x, pz - shape.z);
      return d <= shape.radius + playerRadius;
    }
    case 'ring': {
      const d = Math.hypot(px - shape.x, pz - shape.z);
      // Expand outer, contract inner by player radius
      return d <= shape.outer + playerRadius && d >= Math.max(0, shape.inner - playerRadius);
    }
    case 'line': {
      const d = distPointToSegment(px, pz, shape.x0, shape.z0, shape.x1, shape.z1);
      return d <= shape.halfWidth + playerRadius;
    }
    case 'cone': {
      const dx = px - shape.x;
      const dz = pz - shape.z;
      const dist = Math.hypot(dx, dz);
      if (dist > shape.length + playerRadius) return false;
      if (dist < 1e-6) return true;
      const fl = Math.hypot(shape.facingX, shape.facingZ) || 1;
      const fx = shape.facingX / fl;
      const fz = shape.facingZ / fl;
      const cosA = (dx * fx + dz * fz) / dist;
      // Angular half-width expanded by approx playerRadius / max(dist, 0.5)
      const angExpand = Math.atan2(playerRadius, Math.max(dist, 0.5));
      return cosA >= Math.cos(shape.halfAngle + angExpand);
    }
    default:
      return false;
  }
}

/** Convert an attack shape into a render descriptor for telegraphs / beams. */
export function shapeToRender(shape: AttackShape): ShapeRenderDesc {
  switch (shape.kind) {
    case 'circle':
    case 'moving-circle':
      return { visual: 'circle', x: shape.x, z: shape.z, radius: shape.radius };
    case 'ring':
      return { visual: 'ring', x: shape.x, z: shape.z, inner: shape.inner, outer: shape.outer };
    case 'line': {
      const dx = shape.x1 - shape.x0;
      const dz = shape.z1 - shape.z0;
      const len = Math.hypot(dx, dz) || 0.01;
      return {
        visual: 'line',
        x: (shape.x0 + shape.x1) / 2,
        z: (shape.z0 + shape.z1) / 2,
        length: len,
        width: shape.halfWidth * 2,
        facingX: dx / len,
        facingZ: dz / len,
      };
    }
    case 'cone':
      return {
        visual: 'cone',
        x: shape.x,
        z: shape.z,
        length: shape.length,
        halfAngle: shape.halfAngle,
        facingX: shape.facingX,
        facingZ: shape.facingZ,
      };
    default:
      return { visual: 'circle', x: 0, z: 0, radius: 1 };
  }
}

/** Expanding ring band for pulse / rupture / gravity shockwave. */
export function expandingRing(
  x: number,
  z: number,
  radius: number,
  halfBand: number,
): AttackShape {
  return {
    kind: 'ring',
    x,
    z,
    inner: Math.max(0, radius - halfBand),
    outer: radius + halfBand,
  };
}

/** Capsule / lane from origin along facing. */
export function facingLine(
  x: number,
  z: number,
  facingX: number,
  facingZ: number,
  length: number,
  halfWidth: number,
): AttackShape {
  const fl = Math.hypot(facingX, facingZ) || 1;
  return {
    kind: 'line',
    x0: x,
    z0: z,
    x1: x + (facingX / fl) * length,
    z1: z + (facingZ / fl) * length,
    halfWidth,
  };
}

/** Axis-aligned circle at point. */
export function circleAt(x: number, z: number, radius: number): AttackShape {
  return { kind: 'circle', x, z, radius };
}

/** Cone wedge from an origin along a facing direction. */
export function facingCone(
  x: number,
  z: number,
  facingX: number,
  facingZ: number,
  length: number,
  halfAngle: number,
): AttackShape {
  return { kind: 'cone', x, z, facingX, facingZ, length, halfAngle };
}

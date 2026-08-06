import type { ArenaBounds, Obstacle, Vec2 } from './types';

export function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

export function length2(x: number, z: number): number {
  return Math.hypot(x, z);
}

export function normalize2(x: number, z: number): Vec2 {
  const len = Math.hypot(x, z);
  if (len < 1e-6) return { x: 0, z: 1 };
  return { x: x / len, z: z / len };
}

export function circleCircleHit(
  ax: number,
  az: number,
  ar: number,
  bx: number,
  bz: number,
  br: number,
): boolean {
  const dx = ax - bx;
  const dz = az - bz;
  const r = ar + br;
  return dx * dx + dz * dz <= r * r;
}

export function pointInBounds(x: number, z: number, bounds: ArenaBounds): boolean {
  return x >= bounds.minX && x <= bounds.maxX && z >= bounds.minZ && z <= bounds.maxZ;
}

export function pointInAnyBounds(x: number, z: number, regions: ArenaBounds[]): boolean {
  for (const region of regions) {
    if (pointInBounds(x, z, region)) return true;
  }
  return false;
}

/** Push a circle out of axis-aligned rectangles. */
export function resolveCircleObstacles(
  x: number,
  z: number,
  radius: number,
  obstacles: Obstacle[],
): Vec2 {
  let px = x;
  let pz = z;
  for (const obs of obstacles) {
    const nearestX = clamp(px, obs.x - obs.halfW, obs.x + obs.halfW);
    const nearestZ = clamp(pz, obs.z - obs.halfD, obs.z + obs.halfD);
    let dx = px - nearestX;
    let dz = pz - nearestZ;
    const distSq = dx * dx + dz * dz;
    if (distSq >= radius * radius) continue;
    if (distSq < 1e-8) {
      // Center inside box — push along shortest axis.
      const left = Math.abs(px - (obs.x - obs.halfW));
      const right = Math.abs(px - (obs.x + obs.halfW));
      const bottom = Math.abs(pz - (obs.z - obs.halfD));
      const top = Math.abs(pz - (obs.z + obs.halfD));
      const m = Math.min(left, right, bottom, top);
      if (m === left) px = obs.x - obs.halfW - radius;
      else if (m === right) px = obs.x + obs.halfW + radius;
      else if (m === bottom) pz = obs.z - obs.halfD - radius;
      else pz = obs.z + obs.halfD + radius;
      continue;
    }
    const dist = Math.sqrt(distSq);
    const push = (radius - dist) / dist;
    px += dx * push;
    pz += dz * push;
  }
  return { x: px, z: pz };
}

/** Soft-clamp movement into the union of walkable regions. */
export function clampToWalkable(
  x: number,
  z: number,
  radius: number,
  regions: ArenaBounds[],
): Vec2 {
  if (regions.length === 0) return { x, z };
  if (pointInAnyBounds(x, z, regions)) {
    // Still keep a little margin from outer envelope.
    return { x, z };
  }
  // Project to nearest region center-edge.
  let bestX = x;
  let bestZ = z;
  let bestDist = Infinity;
  for (const r of regions) {
    const cx = clamp(x, r.minX + radius, r.maxX - radius);
    const cz = clamp(z, r.minZ + radius, r.maxZ - radius);
    const d = (cx - x) ** 2 + (cz - z) ** 2;
    if (d < bestDist) {
      bestDist = d;
      bestX = cx;
      bestZ = cz;
    }
  }
  return { x: bestX, z: bestZ };
}

export function segmentCircleHit(
  x0: number,
  z0: number,
  x1: number,
  z1: number,
  cx: number,
  cz: number,
  radius: number,
): boolean {
  const dx = x1 - x0;
  const dz = z1 - z0;
  const lenSq = dx * dx + dz * dz;
  if (lenSq < 1e-8) return circleCircleHit(x0, z0, 0, cx, cz, radius);
  let t = ((cx - x0) * dx + (cz - z0) * dz) / lenSq;
  t = clamp(t, 0, 1);
  const px = x0 + dx * t;
  const pz = z0 + dz * t;
  return circleCircleHit(px, pz, 0, cx, cz, radius);
}

export function coneContains(
  originX: number,
  originZ: number,
  dirX: number,
  dirZ: number,
  halfAngle: number,
  range: number,
  px: number,
  pz: number,
  pr: number,
): boolean {
  const dx = px - originX;
  const dz = pz - originZ;
  const dist = Math.hypot(dx, dz);
  if (dist > range + pr) return false;
  if (dist < 1e-6) return true;
  const nd = normalize2(dirX, dirZ);
  const nx = dx / dist;
  const nz = dz / dist;
  const dot = nd.x * nx + nd.z * nz;
  return dot >= Math.cos(halfAngle);
}

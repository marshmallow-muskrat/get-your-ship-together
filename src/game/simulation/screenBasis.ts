import type { Vec2 } from './types';

/**
 * Screen-space basis for the isometric camera at offset (+,+,+).
 * Matches Gloamreach: W/S = screen up/down, A/D = screen left/right.
 */
export const SCREEN_FORWARD: Vec2 = { x: -Math.SQRT1_2, z: -Math.SQRT1_2 };
export const SCREEN_RIGHT: Vec2 = { x: Math.SQRT1_2, z: -Math.SQRT1_2 };

/** Convert screen-space stick (sx right, sy up) into world XZ. */
export function screenToWorldMove(sx: number, sy: number): Vec2 {
  return {
    x: SCREEN_RIGHT.x * sx + SCREEN_FORWARD.x * sy,
    z: SCREEN_RIGHT.z * sx + SCREEN_FORWARD.z * sy,
  };
}

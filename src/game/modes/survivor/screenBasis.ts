/** Screen-space basis for the isometric camera at offset (+,+,+). */

export interface ScreenVec2 {
  x: number;
  z: number;
}

export const SCREEN_FORWARD: ScreenVec2 = { x: -Math.SQRT1_2, z: -Math.SQRT1_2 };
export const SCREEN_RIGHT: ScreenVec2 = { x: Math.SQRT1_2, z: -Math.SQRT1_2 };

/** Convert screen-space stick (sx right, sy up) into world XZ. */
export function screenToWorldMove(sx: number, sy: number): ScreenVec2 {
  return {
    x: SCREEN_RIGHT.x * sx + SCREEN_FORWARD.x * sy,
    z: SCREEN_RIGHT.z * sx + SCREEN_FORWARD.z * sy,
  };
}

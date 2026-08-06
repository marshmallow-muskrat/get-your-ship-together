import type { ArenaBounds, Obstacle } from './types';
import type { EnemyDef } from '../content/enemies';
import {
  MELEE_ALIEN,
  MELEE_BLOB,
  MELEE_MUSHNUB,
  MELEE_ORC,
  MELEE_SPIKY,
  RANGED_ARMABEE,
  RANGED_GHOST,
  RANGED_GOLELING,
  RANGED_SQUIDLE,
} from '../content/enemies';

/**
 * Bigger, cleaner left→right facility.
 * Progress along +X; lateral play space on Z.
 * Sparse obstacles — cover without clutter.
 */
export const LEVEL = {
  spawn: { x: 0, z: 0 },
  bossSpawn: { x: 58, z: 0 },
  shipPart: { x: 58, z: 0 },
  bossGateX: 46,
  walkable: [
    // Arrival plaza
    { minX: -8, maxX: 10, minZ: -11, maxZ: 11 },
    // Approach hall
    { minX: 10, maxX: 20, minZ: -8, maxZ: 8 },
    // Combat atrium (main fight space)
    { minX: 20, maxX: 46, minZ: -12, maxZ: 12 },
    // Boss chamber
    { minX: 46, maxX: 70, minZ: -13, maxZ: 13 },
  ] satisfies ArenaBounds[],
  /** Few intentional blockers — lanes stay open. */
  obstacles: [
    { x: 24, z: -8.5, halfW: 0.9, halfD: 0.9 },
    { x: 28, z: 8.5, halfW: 0.9, halfD: 0.9 },
    { x: 36, z: -7.5, halfW: 1.0, halfD: 0.75 },
    { x: 40, z: 7.5, halfW: 0.85, halfD: 0.95 },
    // Boss pillars
    { x: 50, z: -9.5, halfW: 0.75, halfD: 0.75 },
    { x: 50, z: 9.5, halfW: 0.75, halfD: 0.75 },
    { x: 64, z: -9.5, halfW: 0.75, halfD: 0.75 },
    { x: 64, z: 9.5, halfW: 0.75, halfD: 0.75 },
  ] satisfies Obstacle[],
  landmarks: {
    crashWreck: { x: -3, z: -6 },
    beacon: { x: -2, z: 6 },
    facilityDoor: { x: 19.5, z: 0 },
    bossThreshold: { x: 46, z: 0 },
  },
  /**
   * Authored waves — each entry is one spawn. Cleared before next wave.
   * More waves, more monster diversity; still small packs for readability.
   */
  waves: [
    {
      objective: 'Wave 1 — scouts inbound.',
      spawns: [
        { def: MELEE_BLOB, x: 24, z: -4 },
        { def: MELEE_BLOB, x: 25, z: 4 },
        { def: MELEE_MUSHNUB, x: 27, z: 0 },
      ],
    },
    {
      objective: 'Wave 2 — aerial support.',
      spawns: [
        { def: MELEE_ALIEN, x: 26, z: -5 },
        { def: RANGED_GOLELING, x: 30, z: 5 },
        { def: RANGED_ARMABEE, x: 31, z: -3 },
      ],
    },
    {
      objective: 'Wave 3 — heavy contact.',
      spawns: [
        { def: MELEE_SPIKY, x: 28, z: 0 },
        { def: MELEE_BLOB, x: 30, z: -6 },
        { def: MELEE_BLOB, x: 30, z: 6 },
        { def: RANGED_GHOST, x: 34, z: -2 },
        { def: RANGED_GHOST, x: 34, z: 3 },
      ],
    },
    {
      objective: 'Wave 4 — breach team.',
      spawns: [
        { def: MELEE_ORC, x: 32, z: -3 },
        { def: MELEE_ALIEN, x: 33, z: 4 },
        { def: MELEE_MUSHNUB, x: 29, z: 0 },
        { def: RANGED_SQUIDLE, x: 36, z: 0 },
        { def: RANGED_ARMABEE, x: 35, z: -5 },
        { def: RANGED_GOLELING, x: 35, z: 5 },
      ],
    },
    {
      objective: 'Wave 5 — last stand before the warden.',
      spawns: [
        { def: MELEE_SPIKY, x: 34, z: -4 },
        { def: MELEE_SPIKY, x: 34, z: 4 },
        { def: MELEE_ORC, x: 36, z: 0 },
        { def: RANGED_SQUIDLE, x: 38, z: -3 },
        { def: RANGED_GHOST, x: 38, z: 3 },
        { def: RANGED_ARMABEE, x: 37, z: -6 },
        { def: RANGED_GOLELING, x: 37, z: 6 },
      ],
    },
  ] as Array<{ objective: string; spawns: Array<{ def: EnemyDef; x: number; z: number }> }>,
} as const;

export type LevelLayout = typeof LEVEL;

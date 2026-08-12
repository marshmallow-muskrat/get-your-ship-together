/**
 * Benchmark-only diagnostics for Containment Protocol.
 *
 * A recorder is attached to a state by whatever harness asked for it and is `undefined`
 * everywhere else, so the shipping simulation allocates nothing and the hot loops carry a
 * single null check. This deliberately does not live in `survivorTelemetry`: telemetry is
 * a player-facing damage ledger that ships with the game, while these counters exist to
 * answer one balance question and would be dead weight in a build.
 *
 * Everything here is derived from state the simulation already owns, on the simulation's
 * own fixed step, so a diagnosed run is bit-identical to an undiagnosed one. Nothing in
 * this module may draw from a random stream or write to game state.
 *
 * Introduced for the endless-2.8.0 stabilization to separate three candidate explanations
 * for Fitzwilliam's early-death rate that a survival time alone cannot distinguish:
 * benchmark-policy failure (he is offered breadth and declines it), targeting failure (the
 * line he fires is not the line available), and weapon-geometry failure (no line is enough
 * against an early surround).
 */
import type { SurvivorState } from './survivorState';

/** One upgrade presentation: what was on the table, and what was taken. */
export interface OfferRecord {
  time: number;
  level: number;
  /** Choice ids as offered, in card order. */
  offered: string[];
  /** Category of each offered card, parallel to `offered`. */
  offeredKinds: string[];
  selected: string | null;
  selectedKind: string | null;
  /** True when the selection raised the level of an already-equipped weapon. */
  selectedIsProgression: boolean;
  /** True when the selection added a weapon the build did not have. */
  selectedIsAcquisition: boolean;
  /** Ordinary (non-prototype) weapons equipped at the moment of the offer. */
  weaponsHeld: number;
}

/** Periodic sample of build state and the pressure it is under. */
export interface PressureSample {
  time: number;
  level: number;
  health: number;
  /** `weaponId:level` pairs, so a portfolio can be reconstructed over time. */
  portfolio: string[];
  within6: number;
  within10: number;
  within16: number;
  /**
   * Angular enclosure: the fraction of twelve 30-degree sectors around the player that
   * contain at least one living enemy within 12 units. A line weapon can answer one
   * sector per shot, so this is the measure that decides whether linear coverage is
   * intrinsically sufficient.
   */
  enclosure: number;
}

/** Aggregate over every Rail Lance shot in a run. */
export interface RailAccounting {
  shots: number;
  /** Shots that intersected nothing at all. */
  emptyShots: number;
  /** Total enemy+boss intersections summed over shots. */
  intersections: number;
  kills: number;
  damage: number;
  /** Damage past a target's remaining health, i.e. wasted by the line. */
  overkill: number;
  /** Shots where `selectWeaponTarget` returned a boss and overrode the line search. */
  bossOverrides: number;
  /** Weighted line score actually fired. */
  chosenScore: number;
  /**
   * Weighted line score of the best bearing found by a bounded angular sweep, which is a
   * much more complete search than the shipping nearest-24 candidate list.
   */
  sweepBestScore: number;
  /**
   * Sweep-best minus chosen, summed only over shots where the boss override fired. This
   * is the horde value the unconditional override discards.
   */
  bossOverrideLost: number;
  /** Sweep-best minus chosen over all shots, i.e. total targeting headroom. */
  totalLost: number;
}

export interface SurvivorDiagnostics {
  offers: OfferRecord[];
  samples: PressureSample[];
  rail: RailAccounting;
  /** Seconds between pressure samples. */
  readonly sampleInterval: number;
  /** Internal countdown; not part of the report. */
  sampleIn: number;
}

export function createDiagnostics(sampleInterval = 5): SurvivorDiagnostics {
  return {
    offers: [],
    samples: [],
    rail: {
      shots: 0,
      emptyShots: 0,
      intersections: 0,
      kills: 0,
      damage: 0,
      overkill: 0,
      bossOverrides: 0,
      chosenScore: 0,
      sweepBestScore: 0,
      bossOverrideLost: 0,
      totalLost: 0,
    },
    sampleInterval,
    sampleIn: 0,
  };
}

/** Sector count for the enclosure measure. Twelve keeps each bucket 30 degrees wide. */
const ENCLOSURE_SECTORS = 12;
const ENCLOSURE_RADIUS = 12;

export function sampleDiagnostics(state: SurvivorState): void {
  const d = state.diag;
  if (!d) return;
  d.sampleIn -= 1 / 60;
  if (d.sampleIn > 0) return;
  d.sampleIn += d.sampleInterval;

  const p = state.player;
  let within6 = 0;
  let within10 = 0;
  let within16 = 0;
  const sectors = new Array<boolean>(ENCLOSURE_SECTORS).fill(false);
  for (const e of state.enemies) {
    if (!e.alive) continue;
    const dx = e.x - p.x;
    const dz = e.z - p.z;
    const d2 = dx * dx + dz * dz;
    if (d2 <= 36) within6 += 1;
    if (d2 <= 100) within10 += 1;
    if (d2 <= 256) within16 += 1;
    if (d2 <= ENCLOSURE_RADIUS * ENCLOSURE_RADIUS) {
      const a = Math.atan2(dz, dx) + Math.PI;
      const s = Math.min(ENCLOSURE_SECTORS - 1, Math.floor((a / (Math.PI * 2)) * ENCLOSURE_SECTORS));
      sectors[s] = true;
    }
  }
  d.samples.push({
    time: state.time,
    level: state.level,
    health: p.health / Math.max(1, p.maxHealth),
    portfolio: state.weapons.map((w) => `${w.weaponId}:${w.level}`),
    within6,
    within10,
    within16,
    enclosure: sectors.filter(Boolean).length / ENCLOSURE_SECTORS,
  });
}

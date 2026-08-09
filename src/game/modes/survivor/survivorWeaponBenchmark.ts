/**
 * Deterministic combat benchmark for authored weapon L1–L5 and hero starters.
 *
 * Targets move the way they do in a real run — they close on the player from their
 * spawn geometry — so homing, penetration and splash identities are measured against
 * live behaviour rather than against a static test dummy that flatters straight shots.
 *
 * Every scenario is seeded from (weapon, level, scenario), so results are reproducible.
 */
import type { HeroId } from '../../content/heroes';
import {
  HORDE,
  SURVIVOR,
  WEAPONS,
  heroStarterWeapon,
  weaponStatsAtLevel,
  type WeaponId,
} from './survivorContent';
import { createSurvivorState, emptyEnemy, nextEntityId, type SurvivorState } from './survivorState';
import { EMPTY_SURVIVOR_INPUT, stepSurvivor } from './survivorSim';

export type BenchmarkScenario =
  /** One durable boss-sized target: sustained single-target output. */
  | 'single-boss'
  /** A handful of mobile enemies spread around the player. */
  | 'sparse'
  /** A closing ring of fodder: area control. */
  | 'dense'
  /** Mixed horde with an elite and a bruiser. */
  | 'mixed-elite'
  /** Targets beside and behind the player's facing: tracking reliability. */
  | 'mobile-offaxis'
  /** A marching column: penetration value. */
  | 'lined-up'
  /** A tight blob: splash value. */
  | 'clustered';

export const ALL_SCENARIOS: BenchmarkScenario[] = [
  'single-boss',
  'sparse',
  'dense',
  'mixed-elite',
  'mobile-offaxis',
  'lined-up',
  'clustered',
];

/**
 * The scenario each weapon is authored to be good at.
 * Progression is judged here, so a weapon is never rewarded for scaling in a
 * situation it was not designed for.
 */
export const INTENDED_SCENARIO: Record<WeaponId, BenchmarkScenario | 'general'> = {
  pulse: 'general',
  microdrone: 'mobile-offaxis',
  rail: 'lined-up',
  gravity: 'dense',
  rocket: 'clustered',
  bioplasma: 'clustered',
  arc: 'mixed-elite',
  orbital: 'single-boss',
};

export interface BenchmarkResult {
  weaponId: WeaponId;
  level: number;
  scenario: BenchmarkScenario;
  damageDealt: number;
  bossDamage: number;
  kills: number;
  hits: number;
  targetsAffected: number;
  hitRate: number;
  timeToFirstHit: number;
  windowSec: number;
}

function seedFor(weaponId: WeaponId, level: number, scenario: BenchmarkScenario): number {
  let h = 17;
  const s = `${weaponId}:${level}:${scenario}`;
  for (let i = 0; i < s.length; i += 1) h = (h * 31 + s.charCodeAt(i)) >>> 0;
  return h || 1;
}

function clearCombatField(state: SurvivorState): void {
  for (const e of state.enemies) e.alive = false;
  for (const b of state.bosses) {
    b.active = false;
    b.state = 'dead';
  }
  for (const p of state.projectiles) p.active = false;
  for (const h of state.hazards) h.active = false;
  for (const a of state.attacks) a.active = false;
  state.effects = [];
  state.rails = [];
  state.damageEvents = [];
}

function placeEnemy(
  state: SurvivorState,
  defId: string,
  x: number,
  z: number,
  opts?: { hp?: number; elite?: boolean; speedMul?: number },
): void {
  const def = HORDE[defId] ?? HORDE.basic!;
  const e = emptyEnemy();
  e.id = nextEntityId(state);
  e.defId = defId;
  e.role = def.role;
  e.alive = true;
  e.x = x;
  e.z = z;
  e.radius = def.visual.colliderRadius * 1.25;
  e.maxHealth = opts?.hp ?? Math.max(40, def.visual.maxHealth * (def.healthScale ?? 1) * 2);
  e.health = e.maxHealth;
  e.contactDamage = def.contactDamage;
  // Live-like movement: enemies close on the player at their real role speed.
  e.speedMul = opts?.speedMul ?? 1;
  e.damageMul = 1;
  e.isElite = !!opts?.elite;
  e.xp = 1;
  state.enemies.push(e);
}

function setupScenario(state: SurvivorState, scenario: BenchmarkScenario): void {
  clearCombatField(state);
  state.player.x = 0;
  state.player.z = 0;
  state.player.facingX = 0;
  state.player.facingZ = 1;
  state.player.invuln = 1e9;
  state.player.health = state.player.maxHealth;
  state.phase = 'playing';
  // Freeze every schedule so only the weapon under test changes the outcome.
  state.nextBossTime = 1e9;
  state.nextCacheTime = 1e9;
  state.surge.nextSurgeAt = 1e9;
  state.spawnAcc = -1e9;
  state.enemyCap = 200;

  if (scenario === 'single-boss') {
    // Durable boss-sized target that walks in — HP high enough that L5 still scales.
    placeEnemy(state, 'bruiser', 0, 11, { hp: 4_000_000 });
  } else if (scenario === 'sparse') {
    for (let i = 0; i < 6; i += 1) {
      const a = (i / 6) * Math.PI * 2;
      placeEnemy(state, 'basic', Math.cos(a) * 11, Math.sin(a) * 11, { hp: 400_000 });
    }
  } else if (scenario === 'dense') {
    for (let i = 0; i < 40; i += 1) {
      const a = (i / 40) * Math.PI * 2;
      const r = 6 + (i % 5) * 1.3;
      placeEnemy(state, i % 3 === 0 ? 'mush' : 'basic', Math.cos(a) * r, Math.sin(a) * r, {
        hp: 400_000,
      });
    }
  } else if (scenario === 'mixed-elite') {
    for (let i = 0; i < 16; i += 1) {
      const a = (i / 16) * Math.PI * 2;
      placeEnemy(state, 'fast', Math.cos(a) * 9, Math.sin(a) * 9, { hp: 400_000 });
    }
    placeEnemy(state, 'elite', 2, 12, { hp: 1_000_000, elite: true });
    placeEnemy(state, 'bruiser', -3, 11, { hp: 1_000_000 });
  } else if (scenario === 'mobile-offaxis') {
    // Beside and behind the player's facing, at their real speeds.
    placeEnemy(state, 'fast', 10, 2, { hp: 400_000 });
    placeEnemy(state, 'fast', -9, 3, { hp: 400_000 });
    placeEnemy(state, 'spiky', 6, -8, { hp: 400_000 });
    placeEnemy(state, 'spiky', -5, -9, { hp: 400_000 });
    placeEnemy(state, 'ghost', 0, -11, { hp: 400_000 });
  } else if (scenario === 'lined-up') {
    // A marching column: they approach along the same bearing and stay collinear.
    for (let i = 0; i < 10; i += 1) {
      placeEnemy(state, 'basic', 0, 7 + i * 1.5, { hp: 400_000 });
    }
  } else {
    // clustered: one tight blob that closes together.
    for (let i = 0; i < 12; i += 1) {
      const a = (i / 12) * Math.PI * 2;
      const r = 0.9 + (i % 3) * 0.5;
      placeEnemy(state, 'basic', 9 + Math.cos(a) * r, 9 + Math.sin(a) * r, { hp: 400_000 });
    }
  }
}

/** Player hero whose kit does not distort the weapon under test. */
function benchHeroFor(weaponId: WeaponId): HeroId {
  if (weaponId === 'microdrone') return 'bee';
  if (weaponId === 'rail') return 'flamingo';
  if (weaponId === 'bioplasma') return 'frog';
  if (weaponId === 'rocket') return 'red-panda';
  return 'bee';
}

/**
 * Run a fixed-window combat benchmark for one weapon level.
 * The player is invulnerable and stationary; enemy AI runs freely.
 */
export function runWeaponBenchmark(
  weaponId: WeaponId,
  level: number,
  scenario: BenchmarkScenario,
  windowSec = 12,
): BenchmarkResult {
  const state = createSurvivorState(
    benchHeroFor(weaponId),
    null,
    seedFor(weaponId, level, scenario),
  );
  const fam = WEAPONS[weaponId];
  // Prototypes are judged at their unlock time, where they are actually acquired.
  const startTime = fam?.unlockTime ?? 0;
  state.time = startTime;
  state.weapons = [
    {
      weaponId,
      level,
      cooldown: 0,
      focusDebt: 0,
      prototype: !!fam?.prototype,
    },
  ];
  setupScenario(state, scenario);
  state.time = startTime;

  const hp0 = new Map<number, number>();
  for (const e of state.enemies) {
    if (e.alive) hp0.set(e.id, e.health);
  }

  let firstHitAt = -1;
  const steps = Math.floor(windowSec / SURVIVOR.fixedDt);
  const input = { ...EMPTY_SURVIVOR_INPUT };
  for (let i = 0; i < steps; i += 1) {
    // Keep spawn frozen for the whole window.
    state.spawnAcc = -1e9;
    const ang = i * SURVIVOR.fixedDt * KITE_RATE;
    input.moveX = Math.cos(ang);
    input.moveY = Math.sin(ang);
    stepSurvivor(state, input, SURVIVOR.fixedDt);
    if (firstHitAt < 0) {
      for (const e of state.enemies) {
        const h0 = hp0.get(e.id);
        if (h0 != null && e.health < h0 - 0.5) {
          firstHitAt = i * SURVIVOR.fixedDt;
          break;
        }
      }
    }
  }

  // HP delta is the ground truth: it cannot double-count splash or overkill.
  let damageDealt = 0;
  let targetsAffected = 0;
  let kills = 0;
  for (const e of state.enemies) {
    const h0 = hp0.get(e.id);
    if (h0 == null) continue;
    const lost = Math.max(0, h0 - Math.max(0, e.health));
    if (lost > 0.5) {
      targetsAffected += 1;
      damageDealt += lost;
    }
    if (!e.alive) kills += 1;
  }
  const seeded = state.enemies.filter((e) => hp0.has(e.id)).length;

  // Stats prove authored values resolve.
  void weaponStatsAtLevel(weaponId, level);

  return {
    weaponId,
    level,
    scenario,
    damageDealt,
    bossDamage: scenario === 'single-boss' ? damageDealt : 0,
    kills,
    hits: targetsAffected,
    targetsAffected,
    hitRate: seeded > 0 ? targetsAffected / seeded : 0,
    timeToFirstHit: firstHitAt < 0 ? windowSec : firstHitAt,
    windowSec,
  };
}

/**
 * Measurement window. Long enough that slow-cadence weapons fire many times
 * (so shot quantisation stays small) and short enough to stay live-like.
 */
export const BENCH_WINDOW = 48;

/**
 * Angular rate of the player's kiting circle.
 *
 * Nothing about the targets is scripted: they run their normal pursuit AI at their
 * real speeds. The player kites instead, which is what a real run looks like, and it
 * keeps the horde spread and off-axis rather than piled onto a stationary statue.
 * The rate is chosen so the window is exactly four laps, removing partial-lap bias.
 */
const KITE_RATE = (Math.PI * 2 * 4) / BENCH_WINDOW;

export interface StarterScore {
  heroId: HeroId;
  weaponId: WeaponId;
  weighted: number;
  byScenario: Record<BenchmarkScenario, number>;
}

/**
 * Scenario weights for the starter fairness check.
 * Weighted so no single specialty can carry a weapon: an AOE monster still has to
 * show up on single targets, and a single-target weapon still has to handle a crowd.
 */
export const SCENARIO_WEIGHTS: Record<BenchmarkScenario, number> = {
  'single-boss': 0.18,
  sparse: 0.16,
  dense: 0.14,
  'mixed-elite': 0.16,
  'mobile-offaxis': 0.16,
  'lined-up': 0.10,
  clustered: 0.10,
};

/** Weighted starter output across scenarios (L1, 12s windows). */
export function benchmarkHeroStarters(): StarterScore[] {
  const heroes: HeroId[] = ['bee', 'flamingo', 'frog', 'red-panda'];
  return heroes.map((heroId) => {
    const weaponId = heroStarterWeapon(heroId);
    const byScenario = {} as Record<BenchmarkScenario, number>;
    let weighted = 0;
    for (const scenario of ALL_SCENARIOS) {
      const r = runWeaponBenchmark(weaponId, 1, scenario, 12);
      byScenario[scenario] = r.damageDealt;
      weighted += r.damageDealt * SCENARIO_WEIGHTS[scenario];
    }
    return { heroId, weaponId, weighted, byScenario };
  });
}

/**
 * Effective value of a weapon level in the situation it is authored for.
 * `pulse` is general-purpose, so its score is the weighted mean of every scenario.
 */
export function intendedScore(weaponId: WeaponId, level: number, windowSec = BENCH_WINDOW): number {
  const intended = INTENDED_SCENARIO[weaponId];
  if (intended === 'general') {
    let sum = 0;
    for (const scenario of ALL_SCENARIOS) {
      sum += runWeaponBenchmark(weaponId, level, scenario, windowSec).damageDealt *
        SCENARIO_WEIGHTS[scenario];
    }
    return sum;
  }
  return runWeaponBenchmark(weaponId, level, intended, windowSec).damageDealt;
}

/** L5 / L1 effective ratio in the weapon's intended scenario. */
export function levelProgressionRatio(weaponId: WeaponId): number {
  const l1 = intendedScore(weaponId, 1);
  const l5 = intendedScore(weaponId, 5);
  return l1 > 0 ? l5 / l1 : 0;
}

/** Per-level effective scores L1..L5 in the intended scenario. */
export function levelCurve(weaponId: WeaponId): number[] {
  return [1, 2, 3, 4, 5].map((lv) => intendedScore(weaponId, lv));
}

/** Consecutive per-level gains as fractions (L2/L1 - 1, ...). */
export function levelGains(weaponId: WeaponId): number[] {
  const curve = levelCurve(weaponId);
  const gains: number[] = [];
  for (let i = 1; i < curve.length; i += 1) {
    gains.push(curve[i - 1]! > 0 ? curve[i]! / curve[i - 1]! - 1 : 0);
  }
  return gains;
}

/**
 * Documented progression contract, enforced by the test suite and reproduced in
 * `docs/WEAPON_BENCHMARK.md`. These are the acceptance bounds — not a range widened
 * to fit whatever the weapons happen to do.
 */
export const PROGRESSION_BOUNDS = {
  /** Intended-scenario L5/L1 effective ratio. */
  ratioMin: 3.0,
  ratioMax: 4.2,
  /** Every ordinary level step. */
  typicalGainMin: 0.15,
  typicalGainMax: 0.4,
  /** The one declared mechanical breakpoint per weapon. */
  breakpointGainMax: 0.52,
} as const;

/**
 * The single level per weapon allowed to exceed `typicalGainMax`.
 * Each is the level that adds the weapon's signature mechanic.
 */
export const BREAKPOINT_LEVEL: Record<WeaponId, number> = {
  pulse: 5, // Pulse Storm — second bolt stream at full cadence
  microdrone: 5, // Hive Overdrive — sixth drone
  rail: 5, // Lance Battery — second rail
  gravity: 5, // Event Horizon — second well
  rocket: 5, // Carpet Fire — six-rocket salvo
  bioplasma: 5, // Virulent Cascade — bounce + split
  arc: 5, // Arc Storm — fourth chain plus discharge
  orbital: 5, // Judgment Array — second lance
};

/** Starter fairness band: weighted L1 output versus the four-starter mean. */
export const STARTER_BAND = { min: 0.85, max: 1.15 } as const;

export function allOrdinaryWeapons(): WeaponId[] {
  return (Object.keys(WEAPONS) as WeaponId[]).filter((id) => !WEAPONS[id]!.prototype);
}

export function allBenchmarkedWeapons(): WeaponId[] {
  return Object.keys(WEAPONS) as WeaponId[];
}

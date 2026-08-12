/**
 * Headless, seeded full-run benchmark for Containment Protocol.
 *
 * This is not an oracle for fun. It is a repeatable balance instrument: the same
 * game code, seeds and bounded player policies can be run before and after a change
 * so the delta is attributable instead of anecdotal.
 */
import type { HeroId } from '../../content/heroes';
import { COVERAGE_BREADTH, SURVIVOR, WEAPONS } from './survivorContent';
import { createDiagnostics, type SurvivorDiagnostics } from './survivorDiagnostics';
import {
  EMPTY_SURVIVOR_INPUT,
  stepSurvivor,
  type SurvivorInput,
} from './survivorSim';
import {
  createSurvivorState,
  type SurvivorState,
  type UpgradeChoice,
} from './survivorState';
import { totalOutgoing } from './survivorTelemetry';

export const SURVIVAL_BENCH_HEROES: readonly HeroId[] = [
  'bee',
  'flamingo',
  'frog',
  'red-panda',
] as const;

export type SurvivalPolicyId = 'novice' | 'competent' | 'expert';

interface PolicyTuning {
  reaction: number;
  dodgeThreats: number;
  repulsorThreats: number;
  shipThreats: number;
  shipHealth: number;
  mechThreats: number;
  upgradeNoise: number;
}

const POLICY: Record<SurvivalPolicyId, PolicyTuning> = {
  novice: {
    reaction: 0.42,
    dodgeThreats: 4,
    repulsorThreats: 8,
    shipThreats: 10,
    shipHealth: 0.42,
    mechThreats: 12,
    upgradeNoise: 55,
  },
  competent: {
    reaction: 0.18,
    dodgeThreats: 2,
    repulsorThreats: 5,
    shipThreats: 7,
    shipHealth: 0.62,
    mechThreats: 8,
    upgradeNoise: 18,
  },
  expert: {
    reaction: 0.08,
    dodgeThreats: 1,
    repulsorThreats: 3,
    shipThreats: 5,
    shipHealth: 0.76,
    mechThreats: 5,
    upgradeNoise: 5,
  },
};

export interface SurvivalRunResult {
  /** Present only when the run was asked for diagnostics. Never serialized by default. */
  diag?: SurvivorDiagnostics;
  heroId: HeroId;
  policy: SurvivalPolicyId;
  seed: number;
  survivalTime: number;
  censored: boolean;
  kills: number;
  eliteKills: number;
  peakLivingElites: number;
  meanLivingElites: number;
  bossesDefeated: number;
  megasDefeated: number;
  level: number;
  mechUptime: number;
  shipUptime: number;
  mechActivations: number;
  shipActivations: number;
  repulsorActivations: number;
  dodgeActivations: number;
  gunshipUses: number;
  gunshipDamage: number;
  gunshipKills: number;
  deathSource: string;
  /**
   * Outgoing damage by telemetry source for this run.
   *
   * Required to attribute a distribution shift to a specific mechanic instead of
   * guessing: a change to the upper tail is only actionable if you can see which source
   * grew in the runs that produced it.
   */
  sourceDamage: Record<string, number>;
  totalDamage: number;
  /** Damage by player form, for form-uptime attribution. */
  formDamage: Record<string, number>;
}

export interface DistributionSummary {
  n: number;
  censored: number;
  mean: number;
  standardDeviation: number;
  standardError: number;
  confidence95Low: number;
  confidence95High: number;
  min: number;
  p10: number;
  p25: number;
  median: number;
  p75: number;
  p90: number;
  p95: number;
  max: number;
}

export interface HeroSurvivalSummary extends DistributionSummary {
  heroId: HeroId;
  policy: SurvivalPolicyId;
  meanKills: number;
  meanEliteKills: number;
  meanPeakLivingElites: number;
  meanLivingElites: number;
  meanBossesDefeated: number;
  meanMechUptime: number;
  meanGunshipUses: number;
  meanGunshipDamage: number;
  meanGunshipKills: number;
  deaths: Record<string, number>;
}

export interface SurvivalBenchmarkResult {
  label: string;
  balanceVersion: string;
  policy: SurvivalPolicyId;
  runsPerHero: number;
  maxMinutes: number;
  generatedAt: string;
  /**
   * What produced this snapshot. Optional so snapshots preserved before endless-2.8.0
   * stabilization still parse — their absence is itself the useful signal that they
   * predate stream separation and are not directly comparable.
   */
  provenance?: SnapshotProvenance;
  runs: SurvivalRunResult[];
  heroes: HeroSurvivalSummary[];
  overall: DistributionSummary;
}

function policyRandom(seed: number): () => number {
  let x = (seed ^ 0x9e3779b9) | 0;
  return () => {
    x ^= x << 13;
    x ^= x >>> 17;
    x ^= x << 5;
    return (x >>> 0) / 4294967296;
  };
}

function worldToScreenMove(x: number, z: number): { x: number; y: number } {
  return {
    x: (x - z) * Math.SQRT1_2,
    y: -(x + z) * Math.SQRT1_2,
  };
}

function normalize(x: number, z: number): { x: number; z: number } {
  const d = Math.hypot(x, z);
  return d > 1e-6 ? { x: x / d, z: z / d } : { x: 0, z: 0 };
}

function threatWeight(e: SurvivorState['enemies'][number]): number {
  if (e.isMiniboss) return 4;
  if (e.isElite) return 3.2;
  if (e.role === 'bruiser' || e.role === 'hunter') return 1.8;
  if (e.role === 'sprinter' || e.role === 'flanker') return 1.35;
  return 1;
}

function livingThreatsWithin(state: SurvivorState, radius: number): number {
  const r2 = radius * radius;
  let score = 0;
  for (const e of state.enemies) {
    if (!e.alive) continue;
    const dx = e.x - state.player.x;
    const dz = e.z - state.player.z;
    if (dx * dx + dz * dz <= r2) score += threatWeight(e);
  }
  for (const b of state.bosses) {
    if (!b.active || b.state === 'dead') continue;
    const dx = b.x - state.player.x;
    const dz = b.z - state.player.z;
    if (dx * dx + dz * dz <= r2) score += b.isMega ? 7 : 4.5;
  }
  return score;
}

/**
 * Experimental policy levers (endless-2.8.0 stabilization).
 *
 * These change how the *simulated player* decides, never what the game offers. Keeping
 * them here rather than in the shipping offer system is the point: a benchmark that fails
 * because its policy is incompetent must be fixed in the policy, not by distorting the
 * cards a human sees.
 */
export interface PolicyExperiments {
  /**
   * Value acquiring a complementary coverage class over further depth in a weapon whose
   * geometry the build already has. Bounded to the early game and to builds that are
   * genuinely narrow; a build that already spans classes scores exactly as before.
   */
  coverageAware?: boolean;
  /**
   * Upper-bound control: take the first offered acquisition that adds a coverage class the
   * build lacks, once per run. Deliberately cruder than `coverageAware` — it exists to
   * bound how much of the gap breadth can possibly close, and is not a shipping candidate.
   */
  forceEarlyAcquisition?: boolean;
}

const NO_EXPERIMENTS: PolicyExperiments = {};

/**
 * How much of the surrounding neighbourhood the current build can answer, combining the
 * equipped coverage classes as independent partial cover rather than summing them.
 */
function portfolioBreadth(state: SurvivorState): number {
  let uncovered = 1;
  for (const w of state.weapons) {
    uncovered *= 1 - COVERAGE_BREADTH[WEAPONS[w.weaponId].coverage];
  }
  return 1 - uncovered;
}

function heldCoverageClasses(state: SurvivorState): Set<string> {
  return new Set(state.weapons.map((w) => WEAPONS[w.weaponId].coverage));
}

/** A narrow build is one a single bearing still has to answer. */
const NARROW_BUILD_BREADTH = 0.4;

function upgradeScore(
  state: SurvivorState,
  choice: UpgradeChoice,
  experiments: PolicyExperiments = NO_EXPERIMENTS,
): number {
  const hp = state.player.health / Math.max(1, state.player.maxHealth);
  const narrowEarly =
    experiments.coverageAware === true &&
    state.time < SURVIVOR.earlyOfferHorizon &&
    portfolioBreadth(state) < NARROW_BUILD_BREADTH;
  if (choice.kind === 'weapon' && choice.weaponId) {
    const owned = state.weapons.find((w) => w.weaponId === choice.weaponId);
    const authored = owned && owned.level < WEAPONS[choice.weaponId].levels.length;
    const base = (authored ? 132 : 104) + (owned?.level === 1 ? 12 : 0);
    // Depth in a class the build is already committed to buys no new approach angles.
    return narrowEarly ? base - 34 : base;
  }
  if (choice.kind === 'new-weapon' && choice.weaponId) {
    if (WEAPONS[choice.weaponId].prototype) return 145;
    const base = state.weapons.length < 3 ? 116 : 88;
    if (!narrowEarly) return base;
    const adds = !heldCoverageClasses(state).has(WEAPONS[choice.weaponId].coverage);
    return base + (adds ? 26 * COVERAGE_BREADTH[WEAPONS[choice.weaponId].coverage] * 2 : 0);
  }
  if (choice.kind === 'passive') {
    switch (choice.passiveId) {
      case 'max-health': return hp < 0.6 ? 142 : 104;
      case 'regen': return hp < 0.8 ? 130 : 98;
      case 'weapon-haste': return 124;
      case 'area': return 116;
      // One consolidated Mech passive replaces the two former weak ones. Weighted a
      // little above their individual weights because it now moves three properties.
      case 'overdrive-systems': return 118;
      case 'move-speed': return 102;
      case 'pickup-radius': return 94;
      case 'breach-shielding': return state.bosses.some((b) => b.active) ? 122 : 96;
      default: return 90;
    }
  }
  return 70;
}

function selectUpgrade(
  state: SurvivorState,
  policy: SurvivalPolicyId,
  random: () => number,
  experiments: PolicyExperiments,
  forcedAcquisitionSpent: { value: boolean },
): number {
  if (policy === 'novice') return Math.floor(random() * Math.max(1, state.choices.length));

  if (
    experiments.forceEarlyAcquisition === true &&
    !forcedAcquisitionSpent.value &&
    state.time < SURVIVOR.earlyOfferHorizon
  ) {
    const held = heldCoverageClasses(state);
    const i = state.choices.findIndex(
      (c) =>
        c.kind === 'new-weapon' &&
        c.weaponId != null &&
        !WEAPONS[c.weaponId].prototype &&
        !held.has(WEAPONS[c.weaponId].coverage),
    );
    if (i >= 0) {
      forcedAcquisitionSpent.value = true;
      return i;
    }
  }

  const noise = POLICY[policy].upgradeNoise;
  let best = 0;
  let bestScore = -Infinity;
  for (let i = 0; i < state.choices.length; i += 1) {
    const score =
      upgradeScore(state, state.choices[i]!, experiments) + (random() * 2 - 1) * noise;
    if (score > bestScore) {
      bestScore = score;
      best = i;
    }
  }
  return best;
}

function selectProtocol(state: SurvivorState, policy: SurvivalPolicyId): number {
  const ids = state.protocolChoices.map((c) => c.protocolId);
  const hp = state.player.health / Math.max(1, state.player.maxHealth);
  const living = state.enemies.reduce((n, e) => n + (e.alive ? 1 : 0), 0);
  const xpOrbs = state.pickups.reduce((n, p) => n + (p.active && p.kind === 'xp' ? 1 : 0), 0);
  const choose = (id: string): number => {
    const i = ids.indexOf(id as never);
    return i >= 0 ? i : 0;
  };

  if (ids.includes('carrier-wing')) {
    if (living >= 60) return choose('singularity-engine');
    if (state.bosses.some((b) => b.active)) return choose('cleanup-crew');
    return choose('carrier-wing');
  }
  if (policy === 'novice') return state.seed % Math.max(1, ids.length);
  if (hp < (policy === 'expert' ? 0.48 : 0.38)) return choose('aegis-barrier');
  if (living >= (policy === 'expert' ? 42 : 55)) return choose('gunship-flyby');
  if (xpOrbs >= (policy === 'expert' ? 10 : 18)) return choose('gravitic-recall');
  return choose('gunship-flyby');
}

export class SurvivalPolicyController {
  private readonly tuning: PolicyTuning;
  private readonly random: () => number;
  private decisionIn = 0;
  private heldMove = { x: 0, y: 1 };

  private readonly forcedAcquisitionSpent = { value: false };

  constructor(
    private readonly id: SurvivalPolicyId,
    seed: number,
    private readonly experiments: PolicyExperiments = NO_EXPERIMENTS,
  ) {
    this.tuning = POLICY[id];
    this.random = policyRandom(seed);
  }

  input(state: SurvivorState, dt: number): SurvivorInput {
    if (state.phase === 'levelup') {
      return {
        ...EMPTY_SURVIVOR_INPUT,
        choiceIndex: selectUpgrade(
          state,
          this.id,
          this.random,
          this.experiments,
          this.forcedAcquisitionSpent,
        ),
      };
    }
    if (state.phase === 'protocol') {
      return { ...EMPTY_SURVIVOR_INPUT, choiceIndex: selectProtocol(state, this.id) };
    }

    this.decisionIn -= dt;
    if (this.decisionIn > 0) {
      return { ...EMPTY_SURVIVOR_INPUT, moveX: this.heldMove.x, moveY: this.heldMove.y };
    }
    this.decisionIn = this.tuning.reaction;

    const p = state.player;
    let dx = 0;
    let dz = 0;

    // A cache is an explicit side objective. Commit while it can still be reached;
    // otherwise keep surviving instead of walking toward an already-lost beacon.
    if (state.cache.active) {
      const cx = state.cache.x - p.x;
      const cz = state.cache.z - p.z;
      const distance = Math.hypot(cx, cz);
      const travel = distance / Math.max(1, SURVIVOR.playerSpeed);
      if (state.cache.mega || state.cache.life > travel + 2.5) {
        dx += cx * 0.24;
        dz += cz * 0.24;
      }
    }

    // Repair orbs become a meaningful objective only while injured.
    if (p.health < p.maxHealth * 0.72) {
      let nearest: SurvivorState['pickups'][number] | null = null;
      let nearestD2 = Infinity;
      for (const pickup of state.pickups) {
        if (!pickup.active || pickup.kind !== 'repair') continue;
        const px = pickup.x - p.x;
        const pz = pickup.z - p.z;
        const d2 = px * px + pz * pz;
        if (d2 < nearestD2) {
          nearestD2 = d2;
          nearest = pickup;
        }
      }
      if (nearest && nearestD2 < 22 * 22) {
        dx += (nearest.x - p.x) * 0.18;
        dz += (nearest.z - p.z) * 0.18;
      }
    }

    // Local inverse-square avoidance. The controller sees current positions only—no
    // future RNG, spawn edge, target selection or attack outcome.
    for (const e of state.enemies) {
      if (!e.alive) continue;
      const ex = p.x - e.x;
      const ez = p.z - e.z;
      const d2 = ex * ex + ez * ez;
      if (d2 > 13 * 13) continue;
      const w = threatWeight(e) * 18 / Math.max(1.2, d2);
      dx += ex * w;
      dz += ez * w;
    }
    for (const b of state.bosses) {
      if (!b.active || b.state === 'dead') continue;
      const bx = p.x - b.x;
      const bz = p.z - b.z;
      const d2 = bx * bx + bz * bz;
      if (d2 > 16 * 16) continue;
      const w = (b.isMega ? 8 : 5) * 20 / Math.max(2, d2);
      dx += bx * w;
      dz += bz * w;
    }

    // A slow orbit keeps the bot moving and prevents a perfectly symmetric surround
    // from cancelling the avoidance vector to zero.
    const orbitAngle = state.time * 0.14 + (state.seed % 31) * 0.19;
    const orbitRadius = this.id === 'novice' ? 9 : 14;
    const ox = Math.cos(orbitAngle) * orbitRadius;
    const oz = Math.sin(orbitAngle) * orbitRadius;
    dx += (ox - p.x) * 0.16;
    dz += (oz - p.z) * 0.16;

    // Strong, smooth arena-edge correction instead of perfect wall knowledge.
    const edge = SURVIVOR.arenaHalf - 5;
    if (Math.abs(p.x) > edge) dx += -p.x * 1.8;
    if (Math.abs(p.z) > edge) dz += -p.z * 1.8;

    const desired = normalize(dx, dz);
    const screen = worldToScreenMove(desired.x, desired.z);
    this.heldMove = screen;

    const close = livingThreatsWithin(state, 3.2);
    const packed = livingThreatsWithin(state, 5.8);
    const danger = livingThreatsWithin(state, 8.5);
    const hp = p.health / Math.max(1, p.maxHealth);
    const bossAlive = state.bosses.some((b) => b.active && b.state !== 'dead');

    return {
      ...EMPTY_SURVIVOR_INPUT,
      moveX: screen.x,
      moveY: screen.y,
      dodgePressed: p.dodgeCd <= 0 && close >= this.tuning.dodgeThreats,
      repulsorPressed: p.repulsorCd <= 0 && packed >= this.tuning.repulsorThreats,
      shipPressed:
        p.shipCd <= 0 &&
        p.form === 'astronaut' &&
        (hp <= this.tuning.shipHealth || danger >= this.tuning.shipThreats),
      mechPressed:
        p.mechCd <= 0 &&
        p.form === 'astronaut' &&
        (bossAlive || state.surge.phase === 'surge' || danger >= this.tuning.mechThreats),
    };
  }
}

function safeRatio(part: number, whole: number): number {
  return whole > 0 ? part / whole : 0;
}

export function runSurvivalSimulation(opts: {
  heroId: HeroId;
  policy: SurvivalPolicyId;
  seed: number;
  maxMinutes?: number;
  /**
   * Attach the benchmark-only recorder. Off by default and off in every shipping path.
   * A diagnosed run is bit-identical to an undiagnosed one — the recorder only reads —
   * so a diagnostic sweep and a survival snapshot on the same seed describe the same run.
   */
  diagnostics?: boolean;
  /** Experimental policy levers. Default (absent) reproduces the shipping policy exactly. */
  experiments?: PolicyExperiments;
}): SurvivalRunResult {
  const maxMinutes = opts.maxMinutes ?? 60;
  const maxSeconds = maxMinutes * 60;
  const state = createSurvivorState(opts.heroId, null, opts.seed);
  if (opts.diagnostics) state.diag = createDiagnostics();
  const controller = new SurvivalPolicyController(opts.policy, opts.seed, opts.experiments);
  let peakLivingElites = 0;
  let eliteSampleSum = 0;
  let eliteSamples = 0;
  let sampleIn = 0;
  let mechActivations = 0;
  let shipActivations = 0;
  let repulsorActivations = 0;
  let dodgeActivations = 0;
  let previousForm = state.player.form;
  let previousRepulsorCd = state.player.repulsorCd;
  let previousDodgeCd = state.player.dodgeCd;

  // Modal choices do not advance game time, so a generous step guard catches a
  // broken modal loop without imposing an artificial survival outcome.
  const stepLimit = Math.ceil(maxSeconds / SURVIVOR.fixedDt) + 20_000;
  for (let steps = 0; steps < stepLimit; steps += 1) {
    if (state.phase === 'defeat' || !state.player.alive || state.time >= maxSeconds) break;
    const input = controller.input(state, SURVIVOR.fixedDt);
    stepSurvivor(state, input, SURVIVOR.fixedDt);

    if (state.player.form !== previousForm) {
      if (state.player.form === 'mech') mechActivations += 1;
      if (state.player.form === 'ship') shipActivations += 1;
      previousForm = state.player.form;
    }
    if (previousRepulsorCd <= 0 && state.player.repulsorCd > 0) repulsorActivations += 1;
    if (previousDodgeCd <= 0 && state.player.dodgeCd > 0) dodgeActivations += 1;
    previousRepulsorCd = state.player.repulsorCd;
    previousDodgeCd = state.player.dodgeCd;

    sampleIn -= SURVIVOR.fixedDt;
    if (sampleIn <= 0) {
      sampleIn += 1;
      const livingElites = state.enemies.reduce(
        (n, e) => n + (e.alive && e.isElite && !e.isMiniboss ? 1 : 0),
        0,
      );
      peakLivingElites = Math.max(peakLivingElites, livingElites);
      eliteSampleSum += livingElites;
      eliteSamples += 1;
    }
  }

  const elapsed = Math.max(0.001, state.telemetry.elapsed);
  const gunship = state.telemetry.bySource.get('gunship');
  return {
    diag: state.diag,
    heroId: opts.heroId,
    policy: opts.policy,
    seed: opts.seed,
    survivalTime: state.time,
    censored: state.time >= maxSeconds && state.player.alive,
    kills: state.kills,
    eliteKills: state.telemetry.eliteKills,
    peakLivingElites,
    meanLivingElites: safeRatio(eliteSampleSum, eliteSamples),
    bossesDefeated: state.bossesDefeated,
    megasDefeated: state.megasDefeated,
    level: state.level,
    mechUptime: safeRatio(state.telemetry.byForm.mech.time, elapsed),
    shipUptime: safeRatio(state.telemetry.byForm.ship.time, elapsed),
    mechActivations,
    shipActivations,
    repulsorActivations,
    dodgeActivations,
    gunshipUses: state.telemetry.cacheChoices.get('gunship-flyby') ?? 0,
    gunshipDamage: gunship?.damage ?? 0,
    gunshipKills: gunship?.kills ?? 0,
    deathSource: state.telemetry.killingBlow?.source.kind ?? (state.player.alive ? 'censored' : 'unknown'),
    sourceDamage: Object.fromEntries(
      [...state.telemetry.bySource.entries()].map(([id, st]) => [id, st.damage]),
    ),
    totalDamage: totalOutgoing(state.telemetry),
    formDamage: {
      astronaut: state.telemetry.byForm.astronaut.damage,
      mech: state.telemetry.byForm.mech.damage,
      ship: state.telemetry.byForm.ship.damage,
    },
  };
}

function quantile(sorted: readonly number[], q: number): number {
  if (sorted.length === 0) return 0;
  const pos = (sorted.length - 1) * q;
  const low = Math.floor(pos);
  const high = Math.ceil(pos);
  if (low === high) return sorted[low]!;
  const t = pos - low;
  return sorted[low]! * (1 - t) + sorted[high]! * t;
}

export function summarizeDistribution(values: readonly number[], censored = 0): DistributionSummary {
  if (values.length === 0) {
    return {
      n: 0, censored, mean: 0, standardDeviation: 0, standardError: 0,
      confidence95Low: 0, confidence95High: 0, min: 0, p10: 0, p25: 0,
      median: 0, p75: 0, p90: 0, p95: 0, max: 0,
    };
  }
  const sorted = [...values].sort((a, b) => a - b);
  const mean = sorted.reduce((a, b) => a + b, 0) / sorted.length;
  const variance = sorted.length > 1
    ? sorted.reduce((sum, v) => sum + (v - mean) ** 2, 0) / (sorted.length - 1)
    : 0;
  const standardDeviation = Math.sqrt(variance);
  const standardError = standardDeviation / Math.sqrt(sorted.length);
  const margin = standardError * 1.96;
  return {
    n: sorted.length,
    censored,
    mean,
    standardDeviation,
    standardError,
    confidence95Low: Math.max(0, mean - margin),
    confidence95High: mean + margin,
    min: sorted[0]!,
    p10: quantile(sorted, 0.1),
    p25: quantile(sorted, 0.25),
    median: quantile(sorted, 0.5),
    p75: quantile(sorted, 0.75),
    p90: quantile(sorted, 0.9),
    p95: quantile(sorted, 0.95),
    max: sorted.at(-1)!,
  };
}

function average<T>(rows: readonly T[], get: (row: T) => number): number {
  return rows.length > 0 ? rows.reduce((sum, row) => sum + get(row), 0) / rows.length : 0;
}

export function summarizeHeroRuns(
  heroId: HeroId,
  policy: SurvivalPolicyId,
  runs: readonly SurvivalRunResult[],
): HeroSurvivalSummary {
  const rows = runs.filter((r) => r.heroId === heroId && r.policy === policy);
  const base = summarizeDistribution(rows.map((r) => r.survivalTime), rows.filter((r) => r.censored).length);
  const deaths: Record<string, number> = {};
  for (const row of rows) deaths[row.deathSource] = (deaths[row.deathSource] ?? 0) + 1;
  return {
    ...base,
    heroId,
    policy,
    meanKills: average(rows, (r) => r.kills),
    meanEliteKills: average(rows, (r) => r.eliteKills),
    meanPeakLivingElites: average(rows, (r) => r.peakLivingElites),
    meanLivingElites: average(rows, (r) => r.meanLivingElites),
    meanBossesDefeated: average(rows, (r) => r.bossesDefeated),
    meanMechUptime: average(rows, (r) => r.mechUptime),
    meanGunshipUses: average(rows, (r) => r.gunshipUses),
    meanGunshipDamage: average(rows, (r) => r.gunshipDamage),
    meanGunshipKills: average(rows, (r) => r.gunshipKills),
    deaths,
  };
}

/**
 * Snapshot provenance (endless-2.8.0 stabilization).
 *
 * A distribution is only comparable to another one produced under identical conditions,
 * and this release proved how easily that assumption breaks: a content addition displaced
 * the seeded stream and moved a 96-run median by minutes with no balance change at all.
 * Recording what produced a snapshot is what lets a future reader tell a real regression
 * from a differently-sampled one.
 *
 * The commit is read from the environment rather than shelling out, so the benchmark has
 * no dependency on git being present; it records `unknown` rather than guessing.
 */
export interface SnapshotProvenance {
  commit: string;
  nodeVersion: string;
  policyVersion: string;
  seedSet: string;
  streams: string[];
}

/** Bumped when policy behaviour changes, so old snapshots are not silently comparable. */
export const POLICY_VERSION = 'endless-2.8.0-split-streams';

/** Identifies the seed derivation, so a changed seed rule cannot masquerade as balance. */
export const SEED_SET_ID = 'hero-major-1';

export function snapshotProvenance(): SnapshotProvenance {
  // Read defensively: this module is imported by the browser build too, where there is
  // no `process` at all.
  const env = (globalThis as { process?: { env?: Record<string, string | undefined>; version?: string } })
    .process;
  return {
    commit: env?.env?.GIT_COMMIT ?? env?.env?.GITHUB_SHA ?? 'unknown',
    nodeVersion: env?.version ?? 'unknown',
    policyVersion: POLICY_VERSION,
    seedSet: SEED_SET_ID,
    // Naming the streams makes a future split visible in the data rather than only in git.
    streams: ['world', 'offers'],
  };
}

export function runSurvivalBenchmark(opts: {
  label: string;
  balanceVersion: string;
  policy?: SurvivalPolicyId;
  runsPerHero?: number;
  maxMinutes?: number;
  seedBase?: number;
}): SurvivalBenchmarkResult {
  const policy = opts.policy ?? 'competent';
  const runsPerHero = Math.max(1, Math.floor(opts.runsPerHero ?? 24));
  const maxMinutes = Math.max(1, opts.maxMinutes ?? 60);
  const seedBase = opts.seedBase ?? 0x51a700;
  const runs: SurvivalRunResult[] = [];
  for (let i = 0; i < runsPerHero; i += 1) {
    const seed = seedBase + i * 7919;
    // Identical seed for every hero at index i: game RNG schedules are comparable.
    for (const heroId of SURVIVAL_BENCH_HEROES) {
      runs.push(runSurvivalSimulation({ heroId, policy, seed, maxMinutes }));
    }
  }
  return {
    label: opts.label,
    balanceVersion: opts.balanceVersion,
    policy,
    runsPerHero,
    maxMinutes,
    generatedAt: new Date().toISOString(),
    provenance: snapshotProvenance(),
    runs,
    heroes: SURVIVAL_BENCH_HEROES.map((hero) => summarizeHeroRuns(hero, policy, runs)),
    overall: summarizeDistribution(runs.map((r) => r.survivalTime), runs.filter((r) => r.censored).length),
  };
}

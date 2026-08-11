/**
 * Boss damage benchmark.
 *
 * Boss fairness has two questions, and a table of authored constants only answers the
 * first one:
 *
 * 1. **Is the hierarchy real?** Body and charge are supposed to be a stated multiple of
 *    a representative ranged impact, at every boss index, in every phase. Reading the
 *    constants proves that for boss 1 and nothing else — endless-2.7.0 held 1.25x at
 *    boss 1 and drifted past 3x by boss 13 because the physical paths applied the boss
 *    index curve twice.
 * 2. **Does one committed action land one impact?** That cannot be read off a table at
 *    all. A charge that bills its corridor *and* then grinds the player with ordinary
 *    body contact for the rest of the pass is unfair in a way no constant reveals.
 *
 * So this benchmark has two halves. The scaling half evaluates the shared law across the
 * boss ladder. The impact-census half drives the real simulation: it parks the player in
 * the path of a committed traversal, steps production `stepSurvivor`, and counts what
 * the player was actually billed for, from production telemetry. Nothing about damage,
 * collision or pattern lifecycle is reimplemented here.
 */
import {
  ALL_BOSS_PATTERNS,
  BOSS_DAMAGE_BASE,
  BOSS_REFERENCE_RANGED_DAMAGE,
  SURVIVOR,
  SURVIVOR_BOSS,
  bossCategoryDamage,
  bossDifficultyFor,
  isMegaBossIndex,
  type BossDamageCategory,
  type BossPatternId,
  type BossPhase,
} from './survivorContent';
import { forceBossIntoPattern, stepSurvivor, EMPTY_SURVIVOR_INPUT } from './survivorSim';
import { createSurvivorState, emptyBoss, type SurvivorState } from './survivorState';
import type { PlayerDamageSourceKind } from './survivorTelemetry';

/** Fixed step matching the production simulation's fixed-step contract. */
const DT = 1 / 60;

/** Traversal patterns whose one-impact contract the census measures. */
export const TRAVERSAL_PATTERNS: readonly BossPatternId[] = ['ravage-charge', 'aerial-strafe'];

export interface BossScalingRow {
  index: number;
  isMega: boolean;
  phase: BossPhase;
  /** The boss's difficulty multiplier — the only index/mega curve in the law. */
  damageMul: number;
  categories: Record<BossDamageCategory, number>;
  /** Physical tiers expressed against the representative ranged impact. */
  bodyRatio: number;
  chargeRatio: number;
}

export interface TraversalCensusRow {
  pattern: BossPatternId;
  bossIndex: number;
  seeds: number;
  /**
   * Impacts of the traversal's *own* damage kind — the charge corridor, the strafe
   * drops. This is the number the one-impact contract is about, and it must be 1.
   */
  minPrimary: number;
  maxPrimary: number;
  /**
   * Impacts from everything else the traversal leaves behind — the charge's fissure
   * trail. A distinct, persistent, escapable mechanic with its own telemetry kind, so it
   * is counted separately rather than folded into the traversal's impact count.
   */
  maxSecondary: number;
  /** Distinct telemetry kinds that billed the player during the traversal. */
  sourceKinds: string[];
  /** Largest single hit taken during one traversal, raw (pre-mitigation). */
  maxSingleHit: number;
  /** Total raw damage from the worst traversal across seeds, standing still throughout. */
  maxTraversalTotal: number;
  /** Worst-case total as a multiple of the traversal's own single impact. */
  worstCaseMultiple: number;
}

export interface BossDamageBenchmarkResult {
  label: string;
  balanceVersion: string;
  generatedAt: string;
  referenceRangedDamage: number;
  bodyBand: readonly [number, number];
  chargeBand: readonly [number, number];
  scaling: BossScalingRow[];
  census: TraversalCensusRow[];
  patternCategories: Array<{ pattern: BossPatternId; category: BossDamageCategory | null; authored: number | null }>;
}

/** Design bands this release holds the physical tiers to. */
export const BODY_RATIO_BAND = [1.15, 1.3] as const;
export const CHARGE_RATIO_BAND = [1.4, 1.6] as const;

const CATEGORIES: readonly BossDamageCategory[] = [
  'projectile',
  'beam',
  'puddle',
  'radial',
  'body',
  'charge',
];

/** Telemetry kind -> damage category, so the census can name what billed the player. */
const KIND_CATEGORY: Partial<Record<PlayerDamageSourceKind, BossDamageCategory>> = {
  'boss-body': 'body',
  'boss-charge': 'charge',
  'boss-beam': 'beam',
  'boss-projectile': 'projectile',
  'boss-puddle': 'puddle',
  'boss-radial': 'radial',
};

export function bossScalingRows(maxIndex: number): BossScalingRow[] {
  const rows: BossScalingRow[] = [];
  for (let index = 1; index <= maxIndex; index += 1) {
    const isMega = isMegaBossIndex(index);
    for (const phase of [1, 2, 3] as BossPhase[]) {
      const categories = {} as Record<BossDamageCategory, number>;
      for (const c of CATEGORIES) categories[c] = bossCategoryDamage(c, index, isMega, phase);
      rows.push({
        index,
        isMega,
        phase,
        damageMul: bossDifficultyFor(index).damageMul,
        categories,
        bodyRatio: categories.body / categories.projectile,
        chargeRatio: categories.charge / categories.projectile,
      });
    }
  }
  return rows;
}

/**
 * Park the player directly in the path of a traversal and count what it costs.
 *
 * The player is placed on the boss's approach line and left stationary — the worst case,
 * and the one the old body-contact overlap punished repeatedly. Health and max health are
 * raised so a fair single impact cannot end the run and truncate the census.
 */
function censusOne(
  pattern: BossPatternId,
  bossIndex: number,
  seed: number,
): { primary: number; secondary: number; kinds: Set<string>; maxHit: number; total: number } {
  const state = createSurvivorState('bee', null, seed);
  state.phase = 'playing';
  state.player.maxHealth = 100_000;
  state.player.health = state.player.maxHealth;
  state.player.invuln = 0;

  const b = emptyBoss();
  b.id = 8_000 + bossIndex;
  b.index = bossIndex;
  b.active = true;
  b.state = 'idle';
  b.colliderRadius = 2.0;
  b.maxHealth = 50_000_000;
  b.health = b.maxHealth;
  b.isMega = isMegaBossIndex(bossIndex);
  b.damageMul = bossDifficultyFor(bossIndex).damageMul;
  b.moveMul = 0;
  // Approach from a fixed offset so the locked path runs straight through the player.
  b.x = state.player.x - 9;
  b.z = state.player.z;
  /*
   * Traversal patterns lock their heading from the boss's current facing at windup, and
   * facing is normally set by `updateOneBoss` on the frames before the pattern begins.
   * The fixture starts the pattern immediately, so it must aim the boss itself — without
   * this the charge commits along the default heading and misses the player entirely,
   * which would make the census read zero impacts and prove nothing.
   */
  b.facingX = 1;
  b.facingZ = 0;
  state.bosses = [b];

  const seen = state.telemetry.recentHits.length;
  forceBossIntoPattern(state, b, pattern);

  // Run windup + active + a margin, holding the player still and the boss un-killable.
  const cfg = SURVIVOR_BOSS.patterns[pattern] as { windup: number; active: number };
  const steps = Math.ceil(((cfg.windup + cfg.active) * 1.6 + 0.5) / DT);
  for (let i = 0; i < steps; i += 1) {
    // Weapons must not end the boss mid-census; damage taken is the measurement.
    b.health = b.maxHealth;
    stepSurvivor(state, EMPTY_SURVIVOR_INPUT, DT);
    if (!state.player.alive) break;
  }

  const ownKind = PATTERN_KIND[pattern];
  const kinds = new Set<string>();
  let primary = 0;
  let secondary = 0;
  let maxHit = 0;
  let total = 0;
  for (const hit of state.telemetry.recentHits.slice(seen)) {
    if (!hit.source.kind.startsWith('boss-')) continue;
    if (hit.source.kind === ownKind) primary += 1;
    else secondary += 1;
    kinds.add(hit.source.kind);
    maxHit = Math.max(maxHit, hit.raw);
    total += hit.raw;
  }
  return { primary, secondary, kinds, maxHit, total };
}

export function runTraversalCensus(bossIndexes: number[], seeds: number): TraversalCensusRow[] {
  const rows: TraversalCensusRow[] = [];
  for (const pattern of TRAVERSAL_PATTERNS) {
    for (const bossIndex of bossIndexes) {
      let minPrimary = Number.POSITIVE_INFINITY;
      let maxPrimary = 0;
      let maxSecondary = 0;
      let maxHit = 0;
      let maxTotal = 0;
      const kinds = new Set<string>();
      for (let s = 0; s < seeds; s += 1) {
        const r = censusOne(pattern, bossIndex, 41_000 + s * 977 + bossIndex);
        minPrimary = Math.min(minPrimary, r.primary);
        maxPrimary = Math.max(maxPrimary, r.primary);
        maxSecondary = Math.max(maxSecondary, r.secondary);
        maxHit = Math.max(maxHit, r.maxHit);
        maxTotal = Math.max(maxTotal, r.total);
        for (const k of r.kinds) kinds.add(k);
      }
      rows.push({
        pattern,
        bossIndex,
        seeds,
        minPrimary: Number.isFinite(minPrimary) ? minPrimary : 0,
        maxPrimary,
        maxSecondary,
        sourceKinds: [...kinds].sort(),
        maxSingleHit: maxHit,
        maxTraversalTotal: maxTotal,
        worstCaseMultiple: maxHit > 0 ? maxTotal / maxHit : 0,
      });
    }
  }
  return rows;
}

/** What each pattern's authored damage is, and which tier it reports as. */
function patternCategoryTable(): BossDamageBenchmarkResult['patternCategories'] {
  return ALL_BOSS_PATTERNS.map((pattern) => {
    const cfg = SURVIVOR_BOSS.patterns[pattern] as { damage?: number };
    const kind = PATTERN_KIND[pattern];
    return {
      pattern,
      category: kind ? (KIND_CATEGORY[kind] ?? null) : null,
      authored: cfg.damage ?? null,
    };
  });
}

/**
 * Pattern -> telemetry kind, mirroring the pattern machine's own mapping.
 *
 * Kept here as data rather than imported so the benchmark reports what the death log
 * will say, and a divergence between the two shows up as a failing test rather than as
 * a silently agreeing copy.
 */
const PATTERN_KIND: Record<BossPatternId, PlayerDamageSourceKind> = {
  pulse: 'boss-radial',
  line: 'boss-beam',
  fan: 'boss-projectile',
  summon: 'boss-pattern',
  'breach-orb': 'boss-projectile',
  contamination: 'boss-puddle',
  'rupture-ring': 'boss-radial',
  'cryo-lanes': 'boss-beam',
  'ravage-charge': 'boss-charge',
  'sweeping-beam': 'boss-beam',
  'aerial-strafe': 'boss-beam',
  'spore-bloom': 'boss-puddle',
  'gravity-collapse': 'boss-radial',
  cataclysm: 'boss-radial',
};

export function runBossDamageBenchmark(opts: {
  label: string;
  balanceVersion: string;
  maxBossIndex?: number;
  censusIndexes?: number[];
  censusSeeds?: number;
}): BossDamageBenchmarkResult {
  const maxBossIndex = opts.maxBossIndex ?? 13;
  // First boss, a late ordinary boss, the first and second Mega, and the deep ladder —
  // deduped, because `megaEvery` collides with a hand-picked index at the default of 5.
  const censusIndexes = [
    ...new Set(opts.censusIndexes ?? [1, 4, SURVIVOR.megaEvery, SURVIVOR.megaEvery * 2, 13]),
  ].sort((a, b) => a - b);
  return {
    label: opts.label,
    balanceVersion: opts.balanceVersion,
    generatedAt: new Date().toISOString(),
    referenceRangedDamage: BOSS_REFERENCE_RANGED_DAMAGE,
    bodyBand: BODY_RATIO_BAND,
    chargeBand: CHARGE_RATIO_BAND,
    scaling: bossScalingRows(maxBossIndex),
    census: runTraversalCensus(censusIndexes, opts.censusSeeds ?? 6),
    patternCategories: patternCategoryTable(),
  };
}

/** Exported for the contract tests: the tier table the benchmark reports against. */
export function categoryBase(category: BossDamageCategory): number {
  return BOSS_DAMAGE_BASE[category];
}

/** Convenience for tests that need a stationary player in a traversal path. */
export function censusTraversal(
  pattern: BossPatternId,
  bossIndex: number,
  seed: number,
): { primary: number; secondary: number; kinds: string[]; maxHit: number; total: number } {
  const r = censusOne(pattern, bossIndex, seed);
  return {
    primary: r.primary,
    secondary: r.secondary,
    kinds: [...r.kinds].sort(),
    maxHit: r.maxHit,
    total: r.total,
  };
}

/** Re-exported so callers can assert against the same state type the sim uses. */
export type { SurvivorState };

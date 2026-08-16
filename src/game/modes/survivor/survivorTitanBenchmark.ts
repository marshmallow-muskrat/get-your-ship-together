/**
 * Deterministic comparative benchmark for the three Mega (Titan) Protocols.
 *
 * Carrier Wing, Cleanup Crew and Singularity Engine are permanent stackable rewards.
 * This harness grants one at a time over the same finite observation window to isolate
 * relative player value — not to imply that production choices are exclusive. Singularity
 * contributes substantial control that never appears in a damage column, and Carrier Wing
 * converts a percentage of boss max health rather than flat damage.
 *
 * Every protocol is measured against an identical scenario: same hero, same authored
 * build, same elapsed time, same seeded horde, same player policy, same window. The only
 * difference between runs is which protocol was granted.
 */
import type { HeroId } from '../../content/heroes';
import {
  SURVIVOR,
  type PassiveId,
  type ProtocolId,
  type WeaponId,
} from './survivorContent';
import { EMPTY_SURVIVOR_INPUT, forceStartProtocol, stepSurvivor } from './survivorSim';
import { createSurvivorState, type SurvivorState } from './survivorState';
import { isCleanupCrewSource, totalOutgoing } from './survivorTelemetry';

/**
 * How the measurement window is run.
 *
 * `sustained` holds the player alive for the whole five-minute observation window so
 * throughput, clearing and control are measured over a complete sample.
 *
 * `mortal` leaves the player fully damageable, so the metric that matters is how long
 * each protocol keeps them alive. Neither mode is "the" answer: a Titan is judged on
 * total player value across both.
 */
export type TitanBenchmarkMode = 'sustained' | 'mortal';

/** The three unique Mega Protocols, in cache-offer order. */
export const TITAN_PROTOCOLS: readonly ProtocolId[] = [
  'carrier-wing',
  'cleanup-crew',
  'singularity-engine',
] as const;

/** Telemetry buckets each protocol is allowed to fill. */
function isTitanSource(protocol: ProtocolId, sourceId: string): boolean {
  if (protocol === 'carrier-wing') return sourceId === 'titan-carrier';
  if (protocol === 'singularity-engine') return sourceId === 'titan-singularity';
  return isCleanupCrewSource(sourceId);
}

export interface TitanBenchmarkResult {
  protocol: ProtocolId;
  /** Direct damage attributed to the protocol's own telemetry buckets. */
  directDamage: number;
  /** Of that, damage removed from bosses. */
  bossDamage: number;
  /** Ordinary enemies the protocol itself killed. */
  protocolKills: number;
  /** Every kill in the window, including the player's own build. */
  totalKills: number;
  /** Elite and miniboss kills in the window (pressure relief). */
  eliteKills: number;
  minibossKills: number;
  /** Mean living enemies across the window — the control contribution. */
  meanLivingEnemies: number;
  /** Peak living enemies — how badly the field was allowed to build up. */
  peakLivingEnemies: number;
  /** Integrity lost across the window (lower is better: defensive utility). */
  integrityLost: number;
  /** Seconds survived inside the window; equals `windowSec` when the player lives. */
  survivedSeconds: number;
  /** Whole-build damage in the window, for share context. */
  totalDamage: number;
  /** Share of all damage the protocol itself contributed. */
  share: number;
}

/**
 * A representative late-game build.
 *
 * Mega Caches only drop from Mega-Boss deaths, so the earliest a Titan can exist is
 * around ten minutes. This is what a player who has kept pace actually holds then — not
 * a theoretical maximum, and identical for every protocol under test.
 */
const TITAN_BENCH_BUILD: {
  heroId: HeroId;
  atSeconds: number;
  weapons: Array<{ id: WeaponId; level: number }>;
  passives: Partial<Record<PassiveId, number>>;
} = {
  heroId: 'red-panda',
  atSeconds: 15 * 60,
  weapons: [
    { id: 'rocket', level: 5 },
    { id: 'plasma-wake', level: 4 },
    { id: 'pulsar', level: 4 },
    { id: 'gravity', level: 3 },
    { id: 'pulse', level: 3 },
  ],
  passives: {
    'max-health': 5,
    'weapon-haste': 3,
    area: 3,
    'move-speed': 3,
    'overdrive-systems': 3,
    'breach-shielding': 2,
  },
};

/** Deterministic seed per protocol/seed-index pair. */
function seedFor(seedIndex: number): number {
  return 0x71a9 + seedIndex * 7919;
}

function buildTitanState(seedIndex: number): SurvivorState {
  const state = createSurvivorState(TITAN_BENCH_BUILD.heroId, null, seedFor(seedIndex));
  state.time = TITAN_BENCH_BUILD.atSeconds;
  state.weapons = TITAN_BENCH_BUILD.weapons.map((w) => ({
    weaponId: w.id,
    level: w.level,
    cooldown: 0,
    focusDebt: 0,
    prototype: false,
  }));
  state.passives = { ...TITAN_BENCH_BUILD.passives };
  state.player.maxHealth = 170;
  state.player.health = 170;
  state.level = 24;
  /*
   * Advance the boss schedule to match the clock.
   *
   * Jumping `time` forward without this leaves `nextBossTime` in the past, and the
   * scheduler then spawns the entire backlog at once — three bosses land in the opening
   * seconds and the run is over before any protocol has done anything. The window needs
   * one scheduled boss inside it, which is what a real five-minute Titan window contains.
   */
  state.bossesSpawned = Math.floor(TITAN_BENCH_BUILD.atSeconds / SURVIVOR.bossInterval);
  state.nextBossIndex = state.bossesSpawned + 1;
  state.nextBossTime = TITAN_BENCH_BUILD.atSeconds + 60;
  state.pendingBossIndices = [];
  // The window is about the protocol, not about level-up or cache interruptions.
  state.nextCacheTime = 1e9;
  state.unlocks.arcOffered = true;
  state.unlocks.orbitalOffered = true;
  // Protocol value, not live chase speed — keep the published close-rate.
  state.isolateLiveTravel = true;
  return state;
}

/**
 * Run one protocol through the shared five-minute late-game window.
 *
 * The player kites on a fixed deterministic path so movement is identical across
 * protocols; only the granted protocol differs.
 */
export function runTitanBenchmark(
  protocol: ProtocolId,
  seedIndex = 0,
  // Production armaments are permanent. The comparison still uses a finite,
  // identical five-minute observation window so their value is measurable.
  windowSec = 300,
  mode: TitanBenchmarkMode = 'sustained',
): TitanBenchmarkResult {
  const state = buildTitanState(seedIndex);
  const startHealth = state.player.health;
  forceStartProtocol(state, protocol, 1);

  const steps = Math.floor(windowSec / SURVIVOR.fixedDt);
  const input = { ...EMPTY_SURVIVOR_INPUT };
  let livingSum = 0;
  let livingPeak = 0;
  let survived = 0;

  for (let i = 0; i < steps; i += 1) {
    const t = i * SURVIVOR.fixedDt;
    const ang = t * 0.55;
    input.moveX = Math.cos(ang);
    input.moveY = Math.sin(ang);
    input.choiceIndex = state.phase === 'levelup' || state.phase === 'protocol' ? 0 : null;
    // Sustained mode holds the player alive so the full five-minute window is actually
    // measured. Mortal mode leaves damage intact so survival delta is the signal.
    if (mode === 'sustained') state.player.invuln = 1e9;
    stepSurvivor(state, input, SURVIVOR.fixedDt);
    let living = 0;
    for (const e of state.enemies) if (e.alive) living += 1;
    livingSum += living;
    if (living > livingPeak) livingPeak = living;
    if (!state.player.alive) break;
    survived = t + SURVIVOR.fixedDt;
  }

  let direct = 0;
  let bossDamage = 0;
  let protocolKills = 0;
  for (const [id, s] of state.telemetry.bySource) {
    if (!isTitanSource(protocol, id)) continue;
    direct += s.damage;
    bossDamage += s.bossDamage;
    protocolKills += s.kills;
  }
  const totalDamage = totalOutgoing(state.telemetry);

  return {
    protocol,
    directDamage: direct,
    bossDamage,
    protocolKills,
    totalKills: state.kills,
    eliteKills: state.telemetry.eliteKills,
    minibossKills: state.telemetry.minibossKills,
    meanLivingEnemies: livingSum / Math.max(1, steps),
    peakLivingEnemies: livingPeak,
    integrityLost: Math.max(0, startHealth - state.player.health),
    survivedSeconds: survived,
    totalDamage,
    share: totalDamage > 0 ? direct / totalDamage : 0,
  };
}

/** Every protocol across the same seed set. */
export function runTitanComparison(
  seeds = 3,
  windowSec?: number,
  mode: TitanBenchmarkMode = 'sustained',
): TitanBenchmarkResult[] {
  const out: TitanBenchmarkResult[] = [];
  for (const protocol of TITAN_PROTOCOLS) {
    for (let i = 0; i < seeds; i += 1) {
      out.push(runTitanBenchmark(protocol, i, windowSec, mode));
    }
  }
  return out;
}

export interface TitanSummary {
  protocol: ProtocolId;
  runs: number;
  meanDirectDamage: number;
  meanBossDamage: number;
  meanProtocolKills: number;
  meanTotalKills: number;
  meanEliteKills: number;
  meanMinibossKills: number;
  meanLivingEnemies: number;
  meanPeakLivingEnemies: number;
  meanIntegrityLost: number;
  meanShare: number;
}

/** Mean of each metric per protocol across the seed set. */
export function summariseTitanComparison(rows: TitanBenchmarkResult[]): TitanSummary[] {
  return TITAN_PROTOCOLS.map((protocol) => {
    const mine = rows.filter((r) => r.protocol === protocol);
    const n = Math.max(1, mine.length);
    const mean = (pick: (r: TitanBenchmarkResult) => number): number =>
      mine.reduce((acc, r) => acc + pick(r), 0) / n;
    return {
      protocol,
      runs: mine.length,
      meanDirectDamage: mean((r) => r.directDamage),
      meanBossDamage: mean((r) => r.bossDamage),
      meanProtocolKills: mean((r) => r.protocolKills),
      meanTotalKills: mean((r) => r.totalKills),
      meanEliteKills: mean((r) => r.eliteKills),
      meanMinibossKills: mean((r) => r.minibossKills),
      meanLivingEnemies: mean((r) => r.meanLivingEnemies),
      meanPeakLivingEnemies: mean((r) => r.peakLivingEnemies),
      meanIntegrityLost: mean((r) => r.integrityLost),
      meanShare: mean((r) => r.share),
    };
  });
}

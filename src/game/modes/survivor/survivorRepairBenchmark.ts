/**
 * Repair-economy benchmark.
 *
 * Healing is the one system whose failure mode is invisible in a survival
 * median: a faucet does not look like a faucet, it looks like the game got
 * slightly easier. This measures the economy directly, at controlled kill
 * rates, so a bad model is rejected before a 96-run survival benchmark is
 * spent on it.
 *
 * Scenarios are windows onto the real simulation, built the same way the Titan
 * benchmark builds its late-game window: production `stepSurvivor`, production
 * spawn director, production policy. Nothing about drop rules, healing values,
 * or pickup lifetime is reimplemented here, so the benchmark cannot silently
 * disagree with the game.
 *
 * The headline number is healing per active minute measured against kill rate.
 * A kill-driven economy is expected to deliver more healing when the player is
 * killing more; it is a faucet when that scaling outruns the damage the same
 * horde inflicts.
 */
import type { HeroId } from '../../content/heroes';
import { SURVIVOR, type PassiveId, type WeaponId } from './survivorContent';
import { stepSurvivor } from './survivorSim';
import { createSurvivorState, type SurvivorState } from './survivorState';
import { SurvivalPolicyController, type SurvivalPolicyId } from './survivorSurvivalBenchmark';

export interface RepairScenario {
  id: string;
  /** Human-readable intent, carried into the generated report. */
  description: string;
  heroId: HeroId;
  /** Elapsed run time the window opens at, in seconds. */
  atSeconds: number;
  /** Window length in seconds. */
  windowSeconds: number;
  level: number;
  maxHealth: number;
  weapons: Array<{ id: WeaponId; level: number }>;
  passives: Partial<Record<PassiveId, number>>;
}

/**
 * Representative early, mid, late, and dense-late kill rates.
 *
 * Builds strengthen with elapsed time because that is what drives kill rate,
 * and kill rate is the independent variable a kill-driven economy responds to.
 */
export const REPAIR_SCENARIOS: readonly RepairScenario[] = [
  {
    id: 'early-3min',
    description: 'Opening build, low kill rate; the economy must not starve here.',
    heroId: 'bee',
    atSeconds: 3 * 60,
    windowSeconds: 120,
    level: 6,
    maxHealth: 100,
    weapons: [
      { id: 'rocket', level: 2 },
      { id: 'pulse', level: 1 },
    ],
    passives: { 'max-health': 1 },
  },
  {
    id: 'mid-10min',
    description: 'Established build at the survival median; the common case.',
    heroId: 'bee',
    atSeconds: 10 * 60,
    windowSeconds: 120,
    level: 16,
    maxHealth: 140,
    weapons: [
      { id: 'rocket', level: 4 },
      { id: 'pulsar', level: 3 },
      { id: 'pulse', level: 3 },
      { id: 'gravity', level: 2 },
    ],
    passives: { 'max-health': 3, 'weapon-haste': 2, area: 2 },
  },
  {
    id: 'late-20min',
    description: 'Strong build, high kill rate; the historical faucet regime.',
    heroId: 'red-panda',
    atSeconds: 20 * 60,
    windowSeconds: 120,
    level: 26,
    maxHealth: 170,
    weapons: [
      { id: 'rocket', level: 5 },
      { id: 'plasma-wake', level: 4 },
      { id: 'pulsar', level: 4 },
      { id: 'gravity', level: 3 },
      { id: 'pulse', level: 3 },
    ],
    passives: { 'max-health': 5, 'weapon-haste': 3, area: 3, 'move-speed': 3 },
  },
  {
    id: 'dense-late-26min',
    description: 'Peak horde density and kill rate; the hardest faucet test.',
    heroId: 'red-panda',
    atSeconds: 26 * 60,
    windowSeconds: 120,
    level: 32,
    maxHealth: 190,
    weapons: [
      { id: 'rocket', level: 5 },
      { id: 'plasma-wake', level: 5 },
      { id: 'pulsar', level: 5 },
      { id: 'gravity', level: 4 },
      { id: 'pulse', level: 4 },
    ],
    passives: {
      'max-health': 5,
      'weapon-haste': 5,
      area: 4,
      'move-speed': 3,
      'overdrive-systems': 3,
    },
  },
];

export interface RepairBenchmarkRow {
  scenarioId: string;
  description: string;
  seeds: number;
  windowSeconds: number;
  /** Mean per-seed values across the scenario's seed set. */
  kills: number;
  killsPerMinute: number;
  ordinarySpawned: number;
  premiumSpawned: number;
  collected: number;
  expired: number;
  expiredAtFullHealth: number;
  healingDelivered: number;
  overheal: number;
  /** The headline faucet measure. */
  healingPerActiveMinute: number;
  /** Kills the player paid for each ordinary orb; higher means a tighter tap. */
  killsPerOrdinaryDrop: number;
  longestKillDryStreak: number;
  longestTimeDryStreak: number;
  timeBelow75: number;
  timeBelow50: number;
  timeBelow25: number;
  meanActiveOrbs: number;
  peakActiveOrbs: number;
  meanNearestDistance: number;
  deathsWithNoOrbAvailable: number;
  deaths: number;
}

function buildScenarioState(scenario: RepairScenario, seed: number): SurvivorState {
  const state = createSurvivorState(scenario.heroId, null, seed);
  state.time = scenario.atSeconds;
  state.weapons = scenario.weapons.map((w) => ({
    weaponId: w.id,
    level: w.level,
    cooldown: 0,
    focusDebt: 0,
    prototype: false,
  }));
  state.passives = { ...scenario.passives };
  state.player.maxHealth = scenario.maxHealth;
  state.player.health = scenario.maxHealth;
  state.level = scenario.level;
  /*
   * Advance the boss schedule to match the clock. Without this the scheduler
   * treats every boss the jumped-over time should have produced as overdue and
   * spawns the backlog at once, which would measure a pile-up rather than the
   * intended kill rate. One boss inside the window is representative.
   */
  state.bossesSpawned = Math.floor(scenario.atSeconds / SURVIVOR.bossInterval);
  state.nextBossIndex = state.bossesSpawned + 1;
  state.nextBossTime = scenario.atSeconds + 60;
  state.pendingBossIndices = [];
  // Level-up and cache modals would pause the clock and distort rate measures.
  state.nextCacheTime = 1e9;
  state.unlocks.arcOffered = true;
  state.unlocks.orbitalOffered = true;
  return state;
}

function seedFor(scenarioIndex: number, seedIndex: number): number {
  return 0x5eed + scenarioIndex * 104_729 + seedIndex * 7919;
}

/** Run one scenario across its seed set and average the per-seed measures. */
export function runRepairScenario(
  scenario: RepairScenario,
  scenarioIndex: number,
  seeds: number,
  policy: SurvivalPolicyId = 'competent',
): RepairBenchmarkRow {
  const acc = {
    kills: 0,
    ordinarySpawned: 0,
    premiumSpawned: 0,
    collected: 0,
    expired: 0,
    expiredAtFullHealth: 0,
    healingDelivered: 0,
    overheal: 0,
    longestKillDryStreak: 0,
    longestTimeDryStreak: 0,
    timeBelow75: 0,
    timeBelow50: 0,
    timeBelow25: 0,
    meanActive: 0,
    peakActive: 0,
    nearest: 0,
    nearestSeeds: 0,
    activeSeconds: 0,
    deaths: 0,
    deathsNoOrb: 0,
  };

  for (let s = 0; s < seeds; s += 1) {
    const seed = seedFor(scenarioIndex, s);
    const state = buildScenarioState(scenario, seed);
    const controller = new SurvivalPolicyController(policy, seed);
    const endAt = scenario.atSeconds + scenario.windowSeconds;
    const stepLimit = Math.ceil(scenario.windowSeconds / SURVIVOR.fixedDt) + 20_000;
    const killsAtStart = state.kills;

    for (let steps = 0; steps < stepLimit; steps += 1) {
      if (state.phase === 'defeat' || !state.player.alive || state.time >= endAt) break;
      const input = controller.input(state, SURVIVOR.fixedDt);
      stepSurvivor(state, input, SURVIVOR.fixedDt);
    }

    const rs = state.repairStats;
    const elapsed = Math.max(0.001, state.time - scenario.atSeconds);
    const died = !state.player.alive || state.phase === 'defeat';
    if (died) {
      acc.deaths += 1;
      // No ordinary orb anywhere at the moment of death is the sharpest signal
      // that availability, not player skill, decided the run.
      if (rs.activePeak === 0 || rs.nearestSamples === 0) acc.deathsNoOrb += 1;
    }

    acc.kills += state.kills - killsAtStart;
    acc.ordinarySpawned += rs.ordinarySpawned;
    acc.premiumSpawned += rs.premiumSpawned;
    acc.collected += rs.collected;
    acc.expired += rs.expired;
    acc.expiredAtFullHealth += rs.expiredAtFullHealth;
    acc.healingDelivered += rs.healingDelivered;
    acc.overheal += rs.overheal;
    acc.longestKillDryStreak = Math.max(acc.longestKillDryStreak, rs.longestKillDryStreak);
    acc.longestTimeDryStreak = Math.max(acc.longestTimeDryStreak, rs.longestTimeDryStreak);
    acc.timeBelow75 += rs.timeBelow75;
    acc.timeBelow50 += rs.timeBelow50;
    acc.timeBelow25 += rs.timeBelow25;
    acc.meanActive += rs.activeSamples > 0 ? rs.activeSum / rs.activeSamples : 0;
    acc.peakActive = Math.max(acc.peakActive, rs.activePeak);
    if (rs.nearestSamples > 0) {
      acc.nearest += rs.nearestSum / rs.nearestSamples;
      acc.nearestSeeds += 1;
    }
    acc.activeSeconds += elapsed;
  }

  const n = Math.max(1, seeds);
  const activeMinutes = Math.max(0.001, acc.activeSeconds / 60);
  return {
    scenarioId: scenario.id,
    description: scenario.description,
    seeds,
    windowSeconds: scenario.windowSeconds,
    kills: acc.kills / n,
    killsPerMinute: acc.kills / activeMinutes,
    ordinarySpawned: acc.ordinarySpawned / n,
    premiumSpawned: acc.premiumSpawned / n,
    collected: acc.collected / n,
    expired: acc.expired / n,
    expiredAtFullHealth: acc.expiredAtFullHealth / n,
    healingDelivered: acc.healingDelivered / n,
    overheal: acc.overheal / n,
    healingPerActiveMinute: acc.healingDelivered / activeMinutes,
    killsPerOrdinaryDrop: acc.ordinarySpawned > 0 ? acc.kills / acc.ordinarySpawned : Infinity,
    longestKillDryStreak: acc.longestKillDryStreak,
    longestTimeDryStreak: acc.longestTimeDryStreak,
    timeBelow75: acc.timeBelow75 / n,
    timeBelow50: acc.timeBelow50 / n,
    timeBelow25: acc.timeBelow25 / n,
    meanActiveOrbs: acc.meanActive / n,
    peakActiveOrbs: acc.peakActive,
    meanNearestDistance: acc.nearestSeeds > 0 ? acc.nearest / acc.nearestSeeds : Infinity,
    deathsWithNoOrbAvailable: acc.deathsNoOrb,
    deaths: acc.deaths,
  };
}

export interface RepairBenchmarkResult {
  label: string;
  balanceVersion: string;
  policy: SurvivalPolicyId;
  seedsPerScenario: number;
  generatedAt: string;
  rows: RepairBenchmarkRow[];
}

export function runRepairBenchmark(opts: {
  label: string;
  balanceVersion: string;
  policy?: SurvivalPolicyId;
  seedsPerScenario?: number;
}): RepairBenchmarkResult {
  const policy = opts.policy ?? 'competent';
  const seeds = Math.max(1, opts.seedsPerScenario ?? 8);
  return {
    label: opts.label,
    balanceVersion: opts.balanceVersion,
    policy,
    seedsPerScenario: seeds,
    generatedAt: new Date().toISOString(),
    rows: REPAIR_SCENARIOS.map((scenario, i) => runRepairScenario(scenario, i, seeds, policy)),
  };
}

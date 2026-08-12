import type { HeroId } from '../../content/heroes';
import { isHeroId } from '../../content/heroes';
import { SURVIVOR_BALANCE_VERSION, type PassiveId, type WeaponId } from './survivorContent';
import { formReport, sourceReport, type RunTelemetry } from './survivorTelemetry';

export const RECORDS_STORAGE_KEY = 'gyst.survivor.records.v1';
export const LEADERBOARDS_STORAGE_KEY = 'gyst.survivor.leaderboards.v2';
export const RUN_HISTORY_STORAGE_KEY = 'gyst.survivor.run-history.v1';
export const MAX_LEADERBOARD_ENTRIES = 10;
export const MAX_RUN_HISTORY_ENTRIES = 100;

export interface RunSummary {
  id: string;
  survivalTime: number;
  kills: number;
  level: number;
  bossesDefeated: number;
  heroId: HeroId;
  weapons: Array<{ weaponId: string; level: number }>;
  passives: Array<{ id: string; level: number }>;
  timestamp: number;
  balanceVersion: string;
  report?: RunReportSnapshot;
}

export interface RunReportSnapshot {
  sources: Array<{ id: string; damage: number; bossDamage: number; hits: number; kills: number; maxHit: number }>;
  forms: Array<{ form: string; damage: number; time: number }>;
  healedByOrbs: number;
  healedByRegen: number;
  shieldAbsorbed: number;
  eliteKills: number;
  minibossKills: number;
}

export interface HeroLeaderboard {
  heroId: HeroId;
  runs: RunSummary[];
}

export interface SurvivorLeaderboards {
  version: 2;
  heroes: Record<HeroId, RunSummary[]>;
}

/** Legacy v1 shape (migration source). */
export interface SurvivorRecordsV1 {
  version: 1;
  bestOverall: RunSummary | null;
  bestByHero: Partial<Record<HeroId, RunSummary>>;
  highestKills: number;
  highestLevel: number;
  mostBossesDefeated: number;
}

const HEROES: HeroId[] = ['bee', 'flamingo', 'frog', 'red-panda'];

function emptyBoards(): SurvivorLeaderboards {
  return {
    version: 2,
    heroes: {
      bee: [],
      flamingo: [],
      frog: [],
      'red-panda': [],
    },
  };
}

function safeHero(id: unknown): HeroId | null {
  return typeof id === 'string' && isHeroId(id) ? id : null;
}

function ensureId(s: RunSummary): RunSummary {
  if (s.id) return s;
  return {
    ...s,
    id: `${s.heroId}-${s.timestamp}-${Math.floor(s.survivalTime * 100)}`,
  };
}

function normalizeSummary(raw: unknown): RunSummary | null {
  if (!raw || typeof raw !== 'object') return null;
  const o = raw as Record<string, unknown>;
  const heroId = safeHero(o.heroId);
  if (!heroId) return null;
  const survivalTime = Number(o.survivalTime);
  if (!Number.isFinite(survivalTime) || survivalTime < 0) return null;
  const reportRaw = o.report as Record<string, unknown> | undefined;
  const report: RunReportSnapshot | undefined = reportRaw && Array.isArray(reportRaw.sources) && Array.isArray(reportRaw.forms)
    ? {
        sources: reportRaw.sources
          .filter((s): s is Record<string, unknown> => !!s && typeof s === 'object')
          .map((s) => ({
            id: String(s.id ?? 'unknown'),
            damage: Math.max(0, Number(s.damage) || 0),
            bossDamage: Math.max(0, Number(s.bossDamage) || 0),
            hits: Math.max(0, Math.floor(Number(s.hits) || 0)),
            kills: Math.max(0, Math.floor(Number(s.kills) || 0)),
            maxHit: Math.max(0, Number(s.maxHit) || 0),
          })),
        forms: reportRaw.forms
          .filter((f): f is Record<string, unknown> => !!f && typeof f === 'object')
          .map((f) => ({
            form: String(f.form ?? 'astronaut'),
            damage: Math.max(0, Number(f.damage) || 0),
            time: Math.max(0, Number(f.time) || 0),
          })),
        healedByOrbs: Math.max(0, Number(reportRaw.healedByOrbs) || 0),
        healedByRegen: Math.max(0, Number(reportRaw.healedByRegen) || 0),
        shieldAbsorbed: Math.max(0, Number(reportRaw.shieldAbsorbed) || 0),
        eliteKills: Math.max(0, Math.floor(Number(reportRaw.eliteKills) || 0)),
        minibossKills: Math.max(0, Math.floor(Number(reportRaw.minibossKills) || 0)),
      }
    : undefined;
  return ensureId({
    id: typeof o.id === 'string' ? o.id : '',
    survivalTime,
    kills: Math.max(0, Math.floor(Number(o.kills) || 0)),
    level: Math.max(1, Math.floor(Number(o.level) || 1)),
    bossesDefeated: Math.max(0, Math.floor(Number(o.bossesDefeated) || 0)),
    heroId,
    weapons: Array.isArray(o.weapons)
      ? o.weapons
          .filter((w): w is { weaponId: string; level: number } => !!w && typeof w === 'object')
          .map((w) => ({
            weaponId: String((w as { weaponId?: unknown }).weaponId ?? '?'),
            level: Math.max(1, Math.floor(Number((w as { level?: unknown }).level) || 1)),
          }))
      : [],
    passives: Array.isArray(o.passives)
      ? o.passives
          .filter((p): p is { id: string; level: number } => !!p && typeof p === 'object')
          .map((p) => ({
            id: String((p as { id?: unknown }).id ?? '?'),
            level: Math.max(1, Math.floor(Number((p as { level?: unknown }).level) || 1)),
          }))
      : [],
    timestamp: Math.floor(Number(o.timestamp) || Date.now()),
    balanceVersion: String(o.balanceVersion ?? 'unknown'),
    report,
  });
}

function sortRuns(runs: RunSummary[]): RunSummary[] {
  return [...runs].sort((a, b) => {
    if (b.survivalTime !== a.survivalTime) return b.survivalTime - a.survivalTime;
    if (b.kills !== a.kills) return b.kills - a.kills;
    return b.bossesDefeated - a.bossesDefeated;
  });
}

function trim(runs: RunSummary[]): RunSummary[] {
  return sortRuns(runs).slice(0, MAX_LEADERBOARD_ENTRIES);
}

/** Every recent completed run, newest first. Existing top-ten records seed migration. */
export function loadRunHistory(): RunSummary[] {
  try {
    if (typeof localStorage === 'undefined') return [];
    const raw = localStorage.getItem(RUN_HISTORY_STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as unknown;
      if (Array.isArray(parsed)) {
        return parsed
          .map(normalizeSummary)
          .filter((x): x is RunSummary => !!x)
          .sort((a, b) => b.timestamp - a.timestamp)
          .slice(0, MAX_RUN_HISTORY_ENTRIES);
      }
    }
    const seeded = HEROES.flatMap((h) => loadLeaderboards().heroes[h])
      .sort((a, b) => b.timestamp - a.timestamp)
      .slice(0, MAX_RUN_HISTORY_ENTRIES);
    localStorage.setItem(RUN_HISTORY_STORAGE_KEY, JSON.stringify(seeded));
    return seeded;
  } catch {
    return [];
  }
}

function recordRunHistory(summary: RunSummary): void {
  try {
    if (typeof localStorage === 'undefined') return;
    const history = loadRunHistory();
    if (history.some((r) => r.id === summary.id)) return;
    history.unshift(ensureId(summary));
    localStorage.setItem(
      RUN_HISTORY_STORAGE_KEY,
      JSON.stringify(history.slice(0, MAX_RUN_HISTORY_ENTRIES)),
    );
  } catch {
    // quota / private mode
  }
}

export function getRunHistory(heroId?: HeroId): RunSummary[] {
  const history = loadRunHistory();
  return heroId ? history.filter((r) => r.heroId === heroId) : history;
}

/** Migrate v1 bests into v2 boards if needed. */
function migrateFromV1(): SurvivorLeaderboards {
  const boards = emptyBoards();
  try {
    if (typeof localStorage === 'undefined') return boards;
    const raw = localStorage.getItem(RECORDS_STORAGE_KEY);
    if (!raw) return boards;
    const parsed = JSON.parse(raw) as SurvivorRecordsV1;
    if (!parsed || parsed.version !== 1) return boards;
    for (const h of HEROES) {
      const s = normalizeSummary(parsed.bestByHero?.[h] ?? null);
      if (s) boards.heroes[h] = [s];
    }
    if (parsed.bestOverall) {
      const s = normalizeSummary(parsed.bestOverall);
      if (s && boards.heroes[s.heroId].length === 0) {
        boards.heroes[s.heroId] = [s];
      }
    }
  } catch {
    // ignore
  }
  return boards;
}

export function loadLeaderboards(): SurvivorLeaderboards {
  try {
    if (typeof localStorage === 'undefined') return emptyBoards();
    const raw = localStorage.getItem(LEADERBOARDS_STORAGE_KEY);
    if (!raw) {
      const migrated = migrateFromV1();
      saveLeaderboards(migrated);
      return migrated;
    }
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== 'object') return emptyBoards();
    const p = parsed as { version?: unknown; heroes?: unknown };
    if (p.version !== 2 || !p.heroes || typeof p.heroes !== 'object') {
      const migrated = migrateFromV1();
      saveLeaderboards(migrated);
      return migrated;
    }
    const boards = emptyBoards();
    for (const h of HEROES) {
      const list = (p.heroes as Record<string, unknown>)[h];
      if (!Array.isArray(list)) continue;
      boards.heroes[h] = trim(
        list.map(normalizeSummary).filter((x): x is RunSummary => !!x),
      );
    }
    return boards;
  } catch {
    return emptyBoards();
  }
}

export function saveLeaderboards(boards: SurvivorLeaderboards): void {
  try {
    if (typeof localStorage === 'undefined') return;
    localStorage.setItem(LEADERBOARDS_STORAGE_KEY, JSON.stringify(boards));
  } catch {
    // quota / private
  }
}

/** Legacy API used by HUD — returns best overall from leaderboards. */
export function loadRecords(): {
  version: 2;
  bestOverall: RunSummary | null;
  bestByHero: Partial<Record<HeroId, RunSummary>>;
  highestKills: number;
  highestLevel: number;
  mostBossesDefeated: number;
} {
  const boards = loadLeaderboards();
  let bestOverall: RunSummary | null = null;
  const bestByHero: Partial<Record<HeroId, RunSummary>> = {};
  let highestKills = 0;
  let highestLevel = 0;
  let mostBossesDefeated = 0;
  for (const h of HEROES) {
    const top = boards.heroes[h][0];
    if (top) {
      bestByHero[h] = top;
      if (!bestOverall || top.survivalTime > bestOverall.survivalTime) bestOverall = top;
      for (const r of boards.heroes[h]) {
        highestKills = Math.max(highestKills, r.kills);
        highestLevel = Math.max(highestLevel, r.level);
        mostBossesDefeated = Math.max(mostBossesDefeated, r.bossesDefeated);
      }
    }
  }
  return { version: 2, bestOverall, bestByHero, highestKills, highestLevel, mostBossesDefeated };
}

export function formatSurvivalTime(seconds: number): string {
  const s = Math.max(0, Math.floor(seconds));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  if (h > 0) return `${h}:${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}`;
  return `${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}`;
}

export interface RecordResult {
  boards: SurvivorLeaderboards;
  isNewOverall: boolean;
  isNewHeroBest: boolean;
  isTopTen: boolean;
  rank: number;
  previousBest: number;
}

export function makeRunSummary(input: {
  survivalTime: number;
  kills: number;
  level: number;
  bossesDefeated: number;
  heroId: HeroId;
  weapons: Array<{ weaponId: WeaponId; level: number }>;
  passives: Partial<Record<PassiveId, number>>;
  telemetry?: RunTelemetry;
}): RunSummary {
  const timestamp = Date.now();
  return {
    id: `${input.heroId}-${timestamp}-${Math.floor(input.survivalTime * 1000)}`,
    survivalTime: input.survivalTime,
    kills: input.kills,
    level: input.level,
    bossesDefeated: input.bossesDefeated,
    heroId: input.heroId,
    weapons: input.weapons.map((w) => ({ weaponId: w.weaponId, level: w.level })),
    passives: Object.entries(input.passives).map(([id, level]) => ({
      id,
      level: level ?? 1,
    })),
    timestamp,
    balanceVersion: SURVIVOR_BALANCE_VERSION,
    report: input.telemetry
      ? {
          sources: sourceReport(input.telemetry).map(({ id, damage, bossDamage, hits, kills, maxHit }) => ({
            id, damage, bossDamage, hits, kills, maxHit,
          })),
          forms: formReport(input.telemetry).map(({ form, damage, time }) => ({ form, damage, time })),
          healedByOrbs: input.telemetry.healedByOrbs,
          healedByRegen: input.telemetry.healedByRegen,
          shieldAbsorbed: input.telemetry.shieldAbsorbed,
          eliteKills: input.telemetry.eliteKills,
          minibossKills: input.telemetry.minibossKills,
        }
      : undefined,
  };
}

/** Insert a completed run into that hero's top-10. Prevents duplicate ids. */
export function recordRun(summary: RunSummary): RecordResult {
  recordRunHistory(summary);
  const boards = loadLeaderboards();
  const heroRuns = boards.heroes[summary.heroId] ?? [];
  const previousBest = heroRuns[0]?.survivalTime ?? 0;
  const overallBefore = loadRecords().bestOverall?.survivalTime ?? 0;

  if (heroRuns.some((r) => r.id === summary.id)) {
    return {
      boards,
      isNewOverall: false,
      isNewHeroBest: false,
      isTopTen: heroRuns.some((r) => r.id === summary.id),
      rank: heroRuns.findIndex((r) => r.id === summary.id) + 1,
      previousBest,
    };
  }

  const next = trim([...heroRuns, ensureId(summary)]);
  boards.heroes[summary.heroId] = next;
  saveLeaderboards(boards);

  const rank = next.findIndex((r) => r.id === summary.id) + 1;
  const isNewHeroBest = rank === 1 && summary.survivalTime > previousBest;
  const isNewOverall = summary.survivalTime > overallBefore;
  return {
    boards,
    isNewOverall,
    isNewHeroBest,
    isTopTen: rank > 0 && rank <= MAX_LEADERBOARD_ENTRIES,
    rank,
    previousBest,
  };
}

/**
 * Default public leaderboard view for a hero: only runs on the current balance line.
 * Older versions remain stored; pass `includeAll` to inspect archived partitions.
 */
export function getHeroLeaderboard(heroId: HeroId, includeAll = false): RunSummary[] {
  const all = loadLeaderboards().heroes[heroId] ?? [];
  if (includeAll) return all;
  return all.filter((r) => r.balanceVersion === SURVIVOR_BALANCE_VERSION);
}

/** All stored runs for a hero including prior balance versions (archived). */
export function getHeroLeaderboardArchive(heroId: HeroId): RunSummary[] {
  return loadLeaderboards().heroes[heroId] ?? [];
}

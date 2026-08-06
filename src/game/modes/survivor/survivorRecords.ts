import type { HeroId } from '../../content/heroes';
import { isHeroId } from '../../content/heroes';
import { SURVIVOR_BALANCE_VERSION, type PassiveId, type WeaponId } from './survivorContent';

export const RECORDS_STORAGE_KEY = 'gyst.survivor.records.v1';
export const LEADERBOARDS_STORAGE_KEY = 'gyst.survivor.leaderboards.v2';
export const MAX_LEADERBOARD_ENTRIES = 10;

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
  };
}

/** Insert a completed run into that hero's top-10. Prevents duplicate ids. */
export function recordRun(summary: RunSummary): RecordResult {
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

export function getHeroLeaderboard(heroId: HeroId): RunSummary[] {
  return loadLeaderboards().heroes[heroId] ?? [];
}

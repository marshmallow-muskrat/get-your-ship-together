import type { HeroId } from '../../content/heroes';
import { isHeroId } from '../../content/heroes';
import { SURVIVOR_BALANCE_VERSION, type PassiveId, type WeaponId } from './survivorContent';

export const RECORDS_STORAGE_KEY = 'gyst.survivor.records.v1';

export interface RunSummary {
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

export interface SurvivorRecords {
  version: 1;
  bestOverall: RunSummary | null;
  bestByHero: Partial<Record<HeroId, RunSummary>>;
  highestKills: number;
  highestLevel: number;
  mostBossesDefeated: number;
}

function emptyRecords(): SurvivorRecords {
  return {
    version: 1,
    bestOverall: null,
    bestByHero: {},
    highestKills: 0,
    highestLevel: 0,
    mostBossesDefeated: 0,
  };
}

function safeHero(id: unknown): HeroId | null {
  return typeof id === 'string' && isHeroId(id) ? id : null;
}

function normalizeSummary(raw: unknown): RunSummary | null {
  if (!raw || typeof raw !== 'object') return null;
  const o = raw as Record<string, unknown>;
  const heroId = safeHero(o.heroId);
  if (!heroId) return null;
  const survivalTime = Number(o.survivalTime);
  if (!Number.isFinite(survivalTime) || survivalTime < 0) return null;
  return {
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
  };
}

export function loadRecords(): SurvivorRecords {
  try {
    if (typeof localStorage === 'undefined') return emptyRecords();
    const raw = localStorage.getItem(RECORDS_STORAGE_KEY);
    if (!raw) return emptyRecords();
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== 'object') return emptyRecords();
    const p = parsed as Record<string, unknown>;
    if (p.version !== 1) return emptyRecords();
    const bestOverall = normalizeSummary(p.bestOverall);
    const bestByHero: Partial<Record<HeroId, RunSummary>> = {};
    if (p.bestByHero && typeof p.bestByHero === 'object') {
      for (const [k, v] of Object.entries(p.bestByHero as Record<string, unknown>)) {
        const h = safeHero(k);
        const s = normalizeSummary(v);
        if (h && s) bestByHero[h] = s;
      }
    }
    return {
      version: 1,
      bestOverall,
      bestByHero,
      highestKills: Math.max(0, Math.floor(Number(p.highestKills) || 0)),
      highestLevel: Math.max(0, Math.floor(Number(p.highestLevel) || 0)),
      mostBossesDefeated: Math.max(0, Math.floor(Number(p.mostBossesDefeated) || 0)),
    };
  } catch {
    return emptyRecords();
  }
}

export function saveRecords(records: SurvivorRecords): void {
  try {
    if (typeof localStorage === 'undefined') return;
    localStorage.setItem(RECORDS_STORAGE_KEY, JSON.stringify(records));
  } catch {
    // private mode / quota
  }
}

export function formatSurvivalTime(seconds: number): string {
  const s = Math.max(0, Math.floor(seconds));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  if (h > 0) {
    return `${h}:${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}`;
  }
  return `${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}`;
}

export interface RecordResult {
  records: SurvivorRecords;
  isNewOverall: boolean;
  isNewHeroBest: boolean;
  previousBest: number;
}

/** Apply a completed run once; returns whether new records were set. */
export function recordRun(summary: RunSummary): RecordResult {
  const records = loadRecords();
  const previousBest = records.bestOverall?.survivalTime ?? 0;
  let isNewOverall = false;
  let isNewHeroBest = false;

  if (!records.bestOverall || summary.survivalTime > records.bestOverall.survivalTime) {
    records.bestOverall = summary;
    isNewOverall = true;
  }
  const prevHero = records.bestByHero[summary.heroId];
  if (!prevHero || summary.survivalTime > prevHero.survivalTime) {
    records.bestByHero[summary.heroId] = summary;
    isNewHeroBest = true;
  }
  records.highestKills = Math.max(records.highestKills, summary.kills);
  records.highestLevel = Math.max(records.highestLevel, summary.level);
  records.mostBossesDefeated = Math.max(records.mostBossesDefeated, summary.bossesDefeated);
  saveRecords(records);
  return { records, isNewOverall, isNewHeroBest, previousBest };
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
  return {
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
    timestamp: Date.now(),
    balanceVersion: SURVIVOR_BALANCE_VERSION,
  };
}

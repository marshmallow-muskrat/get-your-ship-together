/**
 * Deterministic combat benchmark for authored weapon L1–L5 and hero starters.
 * Measures actual sim damage over fixed windows — not theoretical DPS alone.
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
  | 'single-boss'
  | 'sparse'
  | 'dense'
  | 'mixed-elite'
  | 'mobile-offaxis';

export interface BenchmarkResult {
  weaponId: WeaponId;
  level: number;
  scenario: BenchmarkScenario;
  damageDealt: number;
  bossDamage: number;
  kills: number;
  hits: number;
  overkill: number;
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
  state.effects = [];
  state.rails = [];
  state.damageEvents = [];
}

function placeEnemy(
  state: SurvivorState,
  defId: string,
  x: number,
  z: number,
  opts?: { hp?: number; elite?: boolean },
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
  e.speedMul = 0.05; // nearly stationary so reliability is measurable
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
  state.player.invuln = 999;
  state.player.health = state.player.maxHealth;
  state.phase = 'playing';
  // Freeze schedule pressure
  state.nextBossTime = 1e9;
  state.nextCacheTime = 1e9;
  state.surge.nextSurgeAt = 1e9;
  state.spawnAcc = -1e9;
  state.enemyCap = 160;

  if (scenario === 'single-boss') {
    // Durable boss-sized target at mid range — HP high enough that L5 still scales
    placeEnemy(state, 'bruiser', 0, 8, { hp: 50000 });
  } else if (scenario === 'sparse') {
    for (let i = 0; i < 6; i += 1) {
      const a = (i / 6) * Math.PI * 2;
      placeEnemy(state, 'basic', Math.cos(a) * 9, Math.sin(a) * 9, { hp: 400 });
    }
  } else if (scenario === 'dense') {
    for (let i = 0; i < 40; i += 1) {
      const a = (i / 40) * Math.PI * 2;
      const r = 3 + (i % 5) * 1.1;
      placeEnemy(state, i % 3 === 0 ? 'mush' : 'basic', Math.cos(a) * r, Math.sin(a) * r, {
        hp: 220,
      });
    }
  } else if (scenario === 'mixed-elite') {
    for (let i = 0; i < 18; i += 1) {
      const a = (i / 18) * Math.PI * 2;
      placeEnemy(state, 'fast', Math.cos(a) * 7, Math.sin(a) * 7, { hp: 280 });
    }
    placeEnemy(state, 'elite', 2, 10, { hp: 1200, elite: true });
    placeEnemy(state, 'bruiser', -3, 9, { hp: 900 });
  } else {
    // mobile-offaxis: targets beside/behind player facing
    placeEnemy(state, 'basic', 8, 2, { hp: 500 });
    placeEnemy(state, 'basic', -7, 3, { hp: 500 });
    placeEnemy(state, 'fast', 5, -6, { hp: 500 });
    placeEnemy(state, 'spiky', -4, -7, { hp: 500 });
    placeEnemy(state, 'ghost', 0, -9, { hp: 500 });
  }
}

function sumDamageEvents(state: SurvivorState, fromIndex: number): {
  damage: number;
  hits: number;
  kills: number;
  overkill: number;
} {
  let damage = 0;
  let hits = 0;
  let kills = 0;
  let overkill = 0;
  for (let i = fromIndex; i < state.damageEvents.length; i += 1) {
    const ev = state.damageEvents[i]!;
    if (ev.kind === 'player' || ev.kind === 'absorb' || ev.kind === 'heal') continue;
    damage += ev.amount;
    hits += 1;
    if (ev.kind === 'kill') kills += 1;
    if (ev.pop > 1.5) overkill += ev.amount * 0.1;
  }
  return { damage, hits, kills, overkill };
}

/**
 * Run a fixed-window combat benchmark for one weapon level.
 * Player is invulnerable; enemy AI is free but spawn/boss schedule frozen.
 */
export function runWeaponBenchmark(
  weaponId: WeaponId,
  level: number,
  scenario: BenchmarkScenario,
  windowSec = 12,
): BenchmarkResult {
  const hero: HeroId =
    weaponId === 'microdrone'
      ? 'bee'
      : weaponId === 'rail'
        ? 'flamingo'
        : weaponId === 'bioplasma'
          ? 'frog'
          : weaponId === 'rocket'
            ? 'red-panda'
            : 'bee';
  const state = createSurvivorState(hero, null, seedFor(weaponId, level, scenario));
  state.weapons = [
    {
      weaponId,
      level,
      cooldown: 0,
      focusDebt: 0,
      prototype: !!WEAPONS[weaponId]?.prototype,
    },
  ];
  // Drop any starter extra
  state.weapons = state.weapons.slice(0, 1);
  state.weapons[0]!.weaponId = weaponId;
  state.weapons[0]!.level = level;
  setupScenario(state, scenario);

  const hp0 = new Map<number, number>();
  for (const e of state.enemies) {
    if (e.alive) hp0.set(e.id, e.health);
  }

  const dmgStart = state.damageEvents.length;
  let firstHitAt = -1;
  const steps = Math.floor(windowSec / SURVIVOR.fixedDt);
  for (let i = 0; i < steps; i += 1) {
    // Keep spawn frozen
    state.spawnAcc = -1e9;
    stepSurvivor(state, EMPTY_SURVIVOR_INPUT, SURVIVOR.fixedDt);
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

  let damageDealt = 0;
  let targetsAffected = 0;
  let kills = 0;
  let overkill = 0;
  for (const e of state.enemies) {
    const h0 = hp0.get(e.id);
    if (h0 == null) continue;
    const lost = Math.max(0, h0 - Math.max(0, e.health));
    if (lost > 0.5) {
      targetsAffected += 1;
      damageDealt += lost;
      if (!e.alive) {
        kills += 1;
        // Overkill estimate: residual projectile damage after death is not tracked per-enemy;
        // use zeroed health as lower bound.
      }
    } else if (!e.alive && h0 > 0) {
      kills += 1;
      damageDealt += h0;
      overkill += 0;
    }
  }
  // Include puddle/hazard residual via damage events for player weapons
  const ev = sumDamageEvents(state, dmgStart);
  // Prefer HP-delta as ground truth; events can double-count splash
  const hits = Math.max(ev.hits, targetsAffected);
  const hitRate = hits > 0 ? Math.min(1, targetsAffected / Math.max(1, state.enemies.filter((e) => hp0.has(e.id)).length)) : 0;

  // Boss damage: single durable target scenario uses the one enemy
  const bossDamage = scenario === 'single-boss' ? damageDealt : 0;

  // Stats prove authored values resolve
  void weaponStatsAtLevel(weaponId, level);

  return {
    weaponId,
    level,
    scenario,
    damageDealt,
    bossDamage,
    kills,
    hits,
    overkill,
    targetsAffected,
    hitRate,
    timeToFirstHit: firstHitAt < 0 ? windowSec : firstHitAt,
    windowSec,
  };
}

export interface StarterScore {
  heroId: HeroId;
  weaponId: WeaponId;
  weighted: number;
  byScenario: Record<BenchmarkScenario, number>;
}

const SCENARIO_WEIGHTS: Record<BenchmarkScenario, number> = {
  'single-boss': 0.22,
  sparse: 0.22,
  dense: 0.18, // dense AOE specialists still win here, but cannot dominate mean alone
  'mixed-elite': 0.2,
  'mobile-offaxis': 0.18,
};

/** Weighted starter output across scenarios (L1, 12s windows). */
export function benchmarkHeroStarters(): StarterScore[] {
  const heroes: HeroId[] = ['bee', 'flamingo', 'frog', 'red-panda'];
  return heroes.map((heroId) => {
    const weaponId = heroStarterWeapon(heroId);
    const byScenario = {} as Record<BenchmarkScenario, number>;
    let weighted = 0;
    for (const scenario of Object.keys(SCENARIO_WEIGHTS) as BenchmarkScenario[]) {
      const r = runWeaponBenchmark(weaponId, 1, scenario, 12);
      byScenario[scenario] = r.damageDealt;
      weighted += r.damageDealt * SCENARIO_WEIGHTS[scenario];
    }
    return { heroId, weaponId, weighted, byScenario };
  });
}

/**
 * L5 / L1 effective ratio on a high-HP single target (avoids multi-target HP caps).
 * Dense/splash identity remains covered by scenario benches.
 */
export function levelProgressionRatio(weaponId: WeaponId): number {
  const l1 = runWeaponBenchmark(weaponId, 1, 'single-boss', 14).damageDealt;
  const l5 = runWeaponBenchmark(weaponId, 5, 'single-boss', 14).damageDealt;
  return l1 > 0 ? l5 / l1 : 0;
}

export function allOrdinaryWeapons(): WeaponId[] {
  return (Object.keys(WEAPONS) as WeaponId[]).filter((id) => !WEAPONS[id]!.prototype);
}

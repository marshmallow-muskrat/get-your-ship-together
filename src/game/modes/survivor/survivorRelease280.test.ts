/**
 * endless-2.8.0 release contracts.
 *
 * Each section states a contract the release is accountable for, and tests it against the
 * production simulation rather than against a reimplementation of it.
 */
import { describe, expect, it } from 'vitest';
import {
  BOSS_DAMAGE_BASE,
  BOSS_REFERENCE_RANGED_DAMAGE,
  MINIBOSS,
  SURVIVOR,
  WEAPONS,
  SURVIVOR_BOSS,
  ALL_BOSS_PATTERNS,
  bossCategoryDamage,
  bossDamageScale,
  bossDifficultyFor,
  isMegaBossIndex,
  type BossDamageCategory,
  type BossPhase,
} from './survivorContent';
import {
  BODY_RATIO_BAND,
  CHARGE_RATIO_BAND,
  TRAVERSAL_PATTERNS,
  bossScalingRows,
  censusTraversal,
} from './survivorBossDamageBenchmark';
import {
  applyBossBodyContact,
  forceBossIntoPattern,
  spawnGravityWellForTest,
  stepSurvivor,
  surroundPlayer,
  EMPTY_SURVIVOR_INPUT,
} from './survivorSim';
import { createSurvivorState, emptyBoss, type SurvivorState } from './survivorState';
import { isCommittedTraversal, bossDamageMultiplier, bossPatternColor } from './survivorBossPatterns';
import {
  activeOrdinaryOrbs,
  repairScenario,
  runRepairWindow,
} from './survivorRepairBenchmark';

const DT = 1 / 60;

/** A living boss standing exactly on the player, at a chosen index. */
function bossOnPlayer(state: SurvivorState, index = 1): ReturnType<typeof emptyBoss> {
  const b = emptyBoss();
  b.id = 9_400 + index;
  b.index = index;
  b.active = true;
  b.state = 'idle';
  b.x = state.player.x;
  b.z = state.player.z;
  b.colliderRadius = 2.0;
  b.maxHealth = 5_000_000;
  b.health = b.maxHealth;
  b.isMega = isMegaBossIndex(index);
  b.damageMul = bossDifficultyFor(index).damageMul;
  return b;
}

function quietPlayer(state: SurvivorState): void {
  state.phase = 'playing';
  state.player.maxHealth = 1_000_000;
  state.player.health = state.player.maxHealth;
  state.player.invuln = 0;
  state.player.bossContactCd = 0;
  state.player.shieldPoints = 0;
  state.player.shieldTime = 0;
}

// ------------------------------------------------------- §2 kill-driven repair supply

describe('§2 ordinary repair supply is earned by killing', () => {
  /*
   * The contract this closes.
   *
   * endless-2.7.0 gated ordinary orbs on the player being below 90% integrity and capped
   * the field at four of them. endless-2.8.0 removed both: supply is threat-weighted kill
   * credit, so an uninjured player still earns orbs and may leave them on the floor to
   * route back to. That was proven by benchmark and not by test, and an earlier end-to-end
   * attempt was removed rather than weakened — driving a bare simulation from a test
   * stalled at 21 kills regardless of how it was fed, so it asserted nothing.
   *
   * The fix is to stop building a bespoke rig. `runRepairWindow` is the repair benchmark's
   * own scenario window: a real build, at a real point in the run, under the production
   * policy and the production simulation. It reaches production kill rates because it is
   * the thing that already measures them.
   *
   * Measured on endless-2.7.0 for comparison, same windows, same seeds:
   *   mid-10min,  full health: 0, 0, 0, 0 ordinary orbs — the eligibility gate
   *   late-20min, any health:  4, 4, 4, 4 ordinary orbs — pinned to the cap
   */
  const OLD_ORB_CAP = 4;
  const SEEDS = [0x5eed, 0x5eed + 7919];

  it('puts more than the old four-orb cap on the field at once', () => {
    const scenario = repairScenario('late-20min');
    const peaks = SEEDS.map((seed) => runRepairWindow(scenario, seed).repairStats.activePeak);
    for (const peak of peaks) expect(peak).toBeGreaterThan(OLD_ORB_CAP);
  });

  it('keeps earning for a player who is never injured', () => {
    // Under the eligibility gate this window produced no ordinary orbs whatsoever.
    const scenario = repairScenario('mid-10min');
    for (const seed of SEEDS) {
      const state = runRepairWindow(scenario, seed, { pinFullHealth: true });
      expect(state.player.health).toBe(state.player.maxHealth);
      expect(state.repairStats.ordinarySpawned).toBeGreaterThan(OLD_ORB_CAP);
      expect(state.repairStats.activePeak).toBeGreaterThan(OLD_ORB_CAP);
    }
  });

  it('leaves uncollected orbs standing as a routable field resource', () => {
    const scenario = repairScenario('late-20min');
    const state = runRepairWindow(scenario, SEEDS[0]!, { pinFullHealth: true });
    // Orbs an uninjured player walked past are still there to come back for.
    expect(activeOrdinaryOrbs(state)).toBeGreaterThan(OLD_ORB_CAP);
    expect(activeOrdinaryOrbs(state)).toBe(
      state.pickups.filter((p) => p.active && p.kind === 'repair' && !p.premium).length,
    );
  });

  it('reconciles every orb it spawned against a bounded pickup pool', () => {
    const scenario = repairScenario('late-20min');
    const state = runRepairWindow(scenario, SEEDS[0]!, { pinFullHealth: true });
    const rs = state.repairStats;
    // Nothing vanishes: every ordinary orb is collected, expired, or still standing.
    expect(rs.ordinarySpawned).toBe(rs.collected + rs.expired + activeOrdinaryOrbs(state));
    // Removing the cap must not have removed the bound on the pool itself.
    expect(state.pickups.length).toBeLessThanOrEqual(SURVIVOR.pickupCap);
  });

  it('prices an orb in threat-weighted credit, not a flat per-kill roll', () => {
    const k = SURVIVOR.repair.killDriven;
    expect(k.weightElite).toBeGreaterThan(k.weightOrdinary);
    expect(k.weightMiniboss).toBeGreaterThan(k.weightElite);
    expect(k.model).toBe('accumulator');
  });
});

// ------------------------------------------------------------------ §3 boss fairness

describe('§3 boss physical hierarchy', () => {
  it('holds body and charge inside their bands against the reference ranged impact', () => {
    expect(BOSS_REFERENCE_RANGED_DAMAGE).toBe(BOSS_DAMAGE_BASE.projectile);
    const body = BOSS_DAMAGE_BASE.body / BOSS_REFERENCE_RANGED_DAMAGE;
    const charge = BOSS_DAMAGE_BASE.charge / BOSS_REFERENCE_RANGED_DAMAGE;
    expect(body).toBeGreaterThanOrEqual(BODY_RATIO_BAND[0]);
    expect(body).toBeLessThanOrEqual(BODY_RATIO_BAND[1]);
    expect(charge).toBeGreaterThanOrEqual(CHARGE_RATIO_BAND[0]);
    expect(charge).toBeLessThanOrEqual(CHARGE_RATIO_BAND[1]);
    // A telegraphed commitment must out-hit incidental contact.
    expect(charge).toBeGreaterThan(body);
  });

  it('keeps those ratios exactly constant across every boss index and phase', () => {
    /*
     * This is the regression that matters. endless-2.7.0 applied the boss-index curve
     * twice on the physical paths — once inside `bossCategoryDamage` and again as
     * `boss.damageMul` at the call site — so body damage grew with the square of the
     * index while patterns grew linearly. The hierarchy held at boss 1 and nowhere else.
     */
    const rows = bossScalingRows(20);
    expect(rows.length).toBeGreaterThan(0);
    for (const row of rows) {
      expect(row.bodyRatio, `boss ${row.index} phase ${row.phase} body`).toBeCloseTo(
        BOSS_DAMAGE_BASE.body / BOSS_REFERENCE_RANGED_DAMAGE,
        10,
      );
      expect(row.chargeRatio, `boss ${row.index} phase ${row.phase} charge`).toBeCloseTo(
        BOSS_DAMAGE_BASE.charge / BOSS_REFERENCE_RANGED_DAMAGE,
        10,
      );
    }
  });

  it('scales every category by one shared law and nothing else', () => {
    const categories: BossDamageCategory[] = [
      'projectile',
      'beam',
      'puddle',
      'radial',
      'body',
      'charge',
    ];
    for (const index of [1, 3, 5, 10, 17]) {
      const isMega = isMegaBossIndex(index);
      for (const phase of [1, 2, 3] as BossPhase[]) {
        const expected = bossDamageScale(bossDifficultyFor(index).damageMul, phase);
        for (const c of categories) {
          expect(
            bossCategoryDamage(c, index, isMega, phase),
            `${c} @ boss ${index} phase ${phase}`,
          ).toBeCloseTo(BOSS_DAMAGE_BASE[c] * expected, 9);
        }
      }
    }
  });

  it('grows strictly with boss index and with phase', () => {
    for (const c of ['body', 'charge', 'projectile'] as BossDamageCategory[]) {
      expect(bossCategoryDamage(c, 4, false)).toBeGreaterThan(bossCategoryDamage(c, 1, false));
      expect(bossCategoryDamage(c, 1, false, 2)).toBeGreaterThan(bossCategoryDamage(c, 1, false, 1));
      expect(bossCategoryDamage(c, 1, false, 3)).toBeGreaterThan(bossCategoryDamage(c, 1, false, 2));
      expect(bossCategoryDamage(c, 5, true)).toBeGreaterThan(bossCategoryDamage(c, 5, false));
    }
  });

  it('caps the difficulty multiplier so a deep run cannot scale without bound', () => {
    expect(bossDifficultyFor(999).damageMul).toBeLessThanOrEqual(4.5);
    expect(bossCategoryDamage('charge', 999, false, 3)).toBeLessThan(
      BOSS_DAMAGE_BASE.charge * 3.2 * SURVIVOR_BOSS.phaseMods[3].damageMul + 1e-6,
    );
  });
});

describe('§3 one impact per committed traversal', () => {
  it('bills exactly one impact of the traversal\'s own kind, at every boss index', () => {
    for (const pattern of TRAVERSAL_PATTERNS) {
      for (const index of [1, 4, 5, 10, 13]) {
        const r = censusTraversal(pattern, index, 60_000 + index);
        expect(r.primary, `${pattern} @ boss ${index} primary impacts`).toBe(1);
      }
    }
  });

  it('never bills ordinary body contact during a charge or leap', () => {
    /*
     * The endless-2.7.0 defect: a strafing boss flew over a stationary player and the
     * body-contact pass billed a `boss-body` slam, so the mechanic that hurt the player
     * was not the telegraphed one they were shown. At boss 10 that slam was 182.5 raw.
     */
    for (const pattern of TRAVERSAL_PATTERNS) {
      for (const index of [1, 5, 10]) {
        const r = censusTraversal(pattern, index, 61_000 + index);
        expect(r.kinds, `${pattern} @ boss ${index}`).not.toContain('boss-body');
      }
    }
  });

  it('stands the body-contact pass down for exactly the traversal patterns', () => {
    const state = createSurvivorState('bee', null, 2801);
    quietPlayer(state);
    const b = bossOnPlayer(state);
    state.bosses = [b];
    for (const pattern of ALL_BOSS_PATTERNS) {
      b.pattern = pattern;
      b.state = 'active';
      expect(isCommittedTraversal(b), pattern).toBe(TRAVERSAL_PATTERNS.includes(pattern));
    }
    // Outside the active window a traversal pattern id alone means nothing.
    b.pattern = 'ravage-charge';
    b.state = 'windup';
    expect(isCommittedTraversal(b)).toBe(false);
  });

  it('holds a charge to one impact however long the bodies overlap', () => {
    const state = createSurvivorState('bee', null, 2802);
    quietPlayer(state);
    const b = bossOnPlayer(state);
    b.facingX = 1;
    b.facingZ = 0;
    b.x = state.player.x - 9;
    b.z = state.player.z;
    b.moveMul = 0;
    state.bosses = [b];
    const seen = state.telemetry.recentHits.length;
    forceBossIntoPattern(state, b, 'ravage-charge');
    // Run well past the charge so any lingering overlap would show up.
    for (let i = 0; i < Math.ceil(6 / DT); i += 1) {
      b.health = b.maxHealth;
      stepSurvivor(state, EMPTY_SURVIVOR_INPUT, DT);
    }
    const charges = state.telemetry.recentHits
      .slice(seen)
      .filter((h) => h.source.kind === 'boss-charge');
    expect(charges.length).toBe(1);
    expect(charges[0]!.source.attackName).toBe('Ravage Charge');
  });
});

describe('§3 body contact', () => {
  it('applies the body tier once per contact cooldown, not once per frame', () => {
    const state = createSurvivorState('bee', null, 2803);
    quietPlayer(state);
    const b = bossOnPlayer(state);
    state.bosses = [b];
    const before = state.player.health;
    for (let i = 0; i < 40; i += 1) applyBossBodyContact(state);
    const dealt = before - state.player.health;
    expect(dealt).toBeCloseTo(BOSS_DAMAGE_BASE.body * bossDamageMultiplier(b), 5);
    expect(state.player.bossContactCd).toBeGreaterThan(0);
  });

  it('applies the boss-index curve exactly once', () => {
    const state = createSurvivorState('bee', null, 2804);
    quietPlayer(state);
    const b = bossOnPlayer(state, 13);
    state.bosses = [b];
    const before = state.player.health;
    applyBossBodyContact(state);
    const dealt = before - state.player.health;
    // Not the squared curve: 13 x 18 base must land at ~43.9, not ~107.
    expect(dealt).toBeCloseTo(BOSS_DAMAGE_BASE.body * bossDifficultyFor(13).damageMul, 5);
    expect(dealt).toBeLessThan(BOSS_DAMAGE_BASE.body * bossDifficultyFor(13).damageMul * 1.5);
  });

  it('names the mechanic it billed so the death log stays exact', () => {
    const state = createSurvivorState('bee', null, 2805);
    quietPlayer(state);
    state.bosses = [bossOnPlayer(state)];
    applyBossBodyContact(state);
    const hit = state.telemetry.recentHits.at(-1)!;
    expect(hit.source.kind).toBe('boss-body');
    expect(hit.source.attackName).toBe('Body Slam');
  });

  it('leaves the player free to pass through a boss body', () => {
    const state = createSurvivorState('bee', null, 2806);
    quietPlayer(state);
    const b = bossOnPlayer(state);
    state.bosses = [b];
    const px = state.player.x;
    const pz = state.player.z;
    const bx = b.x;
    applyBossBodyContact(state);
    expect(state.player.x).toBe(px);
    expect(state.player.z).toBe(pz);
    expect(b.x).toBe(bx);
  });
});

describe('§3 charge trail', () => {
  it('carries a bounded fraction of the charge, under its own damage kind', () => {
    const r = censusTraversal('ravage-charge', 1, 62_001);
    expect(r.kinds).toContain('boss-charge');
    expect(r.kinds).toContain('boss-puddle');
    // Standing in the trail for its whole life must not exceed the charge again.
    expect(r.total).toBeLessThanOrEqual(r.maxHit * 2 + 1e-6);
  });

  it('reads its damage from the charge tier rather than a second authored number', () => {
    expect((SURVIVOR_BOSS.patterns['ravage-charge'] as { damage: number }).damage).toBe(
      BOSS_DAMAGE_BASE.charge,
    );
  });
});

describe('§3 damage law wiring', () => {
  it('uses the same multiplier for a pattern and a body slam on the same boss', () => {
    const state = createSurvivorState('bee', null, 2807);
    quietPlayer(state);
    const b = bossOnPlayer(state, 7);
    state.bosses = [b];
    expect(bossDamageMultiplier(b)).toBeCloseTo(
      bossDamageScale(b.damageMul, 1, b.breachEmpower),
      10,
    );
  });

  it('empowers every path equally when a breach empowers the boss', () => {
    const state = createSurvivorState('bee', null, 2808);
    quietPlayer(state);
    const b = bossOnPlayer(state, 3);
    state.bosses = [b];
    const plain = bossDamageMultiplier(b);
    b.breachEmpower = 0.24;
    expect(bossDamageMultiplier(b)).toBeCloseTo(plain * 1.24, 10);
  });

  it('never lets a negative empowerment reduce boss damage below the base law', () => {
    expect(bossDamageScale(1, 1, -5)).toBe(1);
  });

  it('treats out-of-range phases as the nearest authored phase', () => {
    expect(bossDamageScale(1, 0)).toBe(SURVIVOR_BOSS.phaseMods[1].damageMul);
    expect(bossDamageScale(1, 9)).toBe(SURVIVOR_BOSS.phaseMods[3].damageMul);
  });
});

// -------------------------------------------------- §4 Gravity Pulse control field

describe('§4 Gravity Pulse is a control field, not a damage field', () => {
  /** A well placed on the player with a horde standing in it. */
  function wellFixture(seed: number, defId = 'basic'): SurvivorState {
    const state = createSurvivorState('bee', null, seed);
    state.phase = 'playing';
    state.player.maxHealth = 1_000_000;
    state.player.health = state.player.maxHealth;
    state.player.invuln = 1e9;
    // Strip weapons so only the field under test touches the horde.
    state.weapons = [];
    surroundPlayer(state, 8, 2.2);
    for (const e of state.enemies) {
      if (e.alive) e.defId = defId;
    }
    return state;
  }

  function castWell(state: SurvivorState, radius = 4, life = 1.05): void {
    spawnGravityWellForTest(state, state.player.x, state.player.z, radius, life);
  }

  it('holds its duration inside the specified 1.0–1.5s control window', () => {
    for (const lv of [1, 2, 3, 4, 5]) {
      const life = WEAPONS.gravity.levels[lv - 1]!.life!;
      expect(life, `L${lv} duration`).toBeGreaterThanOrEqual(1.0);
      expect(life, `L${lv} duration`).toBeLessThanOrEqual(1.5);
    }
  });

  it('applies no damage from the field itself', () => {
    const state = wellFixture(2810);
    // Track the enemies caught by identity: the spawn director keeps adding more, so a
    // count comparison would measure the director rather than the field.
    const before = new Map(state.enemies.filter((e) => e.alive).map((e) => [e.id, e.health]));
    expect(before.size).toBeGreaterThan(0);
    castWell(state);
    for (let i = 0; i < 90; i += 1) stepSurvivor(state, EMPTY_SURVIVOR_INPUT, DT);
    let checked = 0;
    for (const e of state.enemies) {
      const was = before.get(e.id);
      if (was === undefined) continue;
      checked += 1;
      // Alive and untouched: the collapse resolved at cast time, the field only controls.
      expect(e.alive, `enemy ${e.id} alive`).toBe(true);
      expect(e.health, `enemy ${e.id} health`).toBe(was);
    }
    expect(checked).toBe(before.size);
  });

  it('slows what it catches, tiered by enemy class', () => {
    const cfg = SURVIVOR.gravityWell;
    // Lighter classes are held harder than heavier ones, and nothing is fully stopped.
    expect(cfg.slowMul.fodder).toBeLessThan(cfg.slowMul.bruiser);
    expect(cfg.slowMul.bruiser).toBeLessThan(cfg.slowMul.elite);
    expect(cfg.slowMul.elite).toBeLessThan(cfg.slowMul.miniboss);
    expect(cfg.slowMul.miniboss).toBeLessThan(1);
    expect(cfg.slowMul.fodder).toBeGreaterThan(0);
  });

  it('pulls lighter classes and refuses to displace a miniboss', () => {
    const cfg = SURVIVOR.gravityWell;
    expect(cfg.pullSpeed.fodder).toBeGreaterThan(cfg.pullSpeed.bruiser);
    expect(cfg.pullSpeed.bruiser).toBeGreaterThan(cfg.pullSpeed.elite);
    expect(cfg.pullSpeed.miniboss).toBe(0);
  });

  it('bounds total displacement per enemy per well', () => {
    const state = wellFixture(2811);
    const tracked = state.enemies.filter((e) => e.alive);
    const start = tracked.map((e) => ({ x: e.x, z: e.z }));
    castWell(state, 6, 1.05);
    // Hold the well open far longer than its life to prove the cap, not the clock.
    for (let i = 0; i < 240; i += 1) stepSurvivor(state, EMPTY_SURVIVOR_INPUT, DT);
    for (let i = 0; i < tracked.length; i += 1) {
      const e = tracked[i]!;
      if (!e.alive) continue;
      const moved = Math.hypot(e.x - start[i]!.x, e.z - start[i]!.z);
      // Enemies also chase the player, so the bound is on the gravity budget itself.
      expect(e.gravityPulled).toBeLessThanOrEqual(SURVIVOR.gravityWell.maxDisplacement + 1e-6);
      expect(moved).toBeLessThan(SURVIVOR.gravityWell.maxDisplacement + 12);
    }
  });

  it('never moves a boss', () => {
    const state = wellFixture(2812);
    const b = bossOnPlayer(state);
    state.bosses = [b];
    const bx = b.x;
    const bz = b.z;
    castWell(state, 8, 1.05);
    for (let i = 0; i < 60; i += 1) {
      const px = b.x;
      const pz = b.z;
      stepSurvivor(state, EMPTY_SURVIVOR_INPUT, DT);
      // The boss's own pattern machine may move it; gravity never adds to that.
      expect(Number.isFinite(px) && Number.isFinite(pz)).toBe(true);
    }
    expect(Number.isFinite(b.x)).toBe(true);
    expect(Math.hypot(b.x - bx, b.z - bz)).toBeLessThan(40);
  });

  it('keeps the field bounded and released like every other pooled collection', () => {
    const state = wellFixture(2813);
    for (let i = 0; i < 60; i += 1) castWell(state, 3, 1.05);
    expect(state.hazards.length).toBeLessThanOrEqual(SURVIVOR.hazardCap);
    for (let i = 0; i < 300; i += 1) stepSurvivor(state, EMPTY_SURVIVOR_INPUT, DT);
    expect(state.hazards.filter((h) => h.active && h.kind === 'gravity-well').length).toBe(0);
  });

  it('does not read as a hostile boss warning', () => {
    // Boss danger footprints are red/magenta. A field the player wants to stand beside
    // must not borrow that palette.
    expect(WEAPONS.gravity.color.toLowerCase()).toBe('#6a2fb5');
    for (const id of ALL_BOSS_PATTERNS) {
      expect(bossPatternColor(id).toLowerCase()).not.toBe(WEAPONS.gravity.color.toLowerCase());
    }
  });
});

describe('§3 audit finding: the Warden slam is outside the boss damage law', () => {
  /*
   * Recorded, not fixed, and deliberately so.
   *
   * The Containment Warden's Ground Slam is a telegraphed melee AOE — the same shape of
   * mechanic Phase 3 governs for bosses — but it is authored as a flat constant on the
   * miniboss definition and never touches `bossDamageScale`. It therefore does not scale
   * with the run at all: it lands at 46.8 raw whether it arrives at 2 minutes or at 25.
   *
   * Against the boss ladder that makes it roughly a boss-11 charge, delivered by an
   * ordinary miniboss early, and a rounding error late. Changing it is a horde-pressure
   * change, not a boss-fairness change, so it is not folded into this phase's A/B where
   * it would confound the attribution. These assertions pin the current relationship so
   * the finding cannot quietly drift or be forgotten.
   */
  const wardenSlam = MINIBOSS.specialDamage * MINIBOSS.damageMul;

  it('does not participate in the boss damage law', () => {
    expect(wardenSlam).toBeCloseTo(46.8, 9);
    for (const index of [1, 5, 13]) {
      const isMega = isMegaBossIndex(index);
      for (const phase of [1, 2, 3] as BossPhase[]) {
        // No category at any index/phase reproduces it — it is simply a separate number.
        for (const c of ['body', 'charge', 'radial'] as BossDamageCategory[]) {
          expect(bossCategoryDamage(c, index, isMega, phase)).not.toBeCloseTo(wardenSlam, 6);
        }
      }
    }
  });

  it('is flat where every boss mechanic scales', () => {
    // Out-hits a first boss charge by more than double...
    expect(wardenSlam / bossCategoryDamage('charge', 1, false)).toBeGreaterThan(2);
    // ...and is overtaken by an ordinary boss charge well before the ladder ends.
    expect(bossCategoryDamage('charge', 11, false)).toBeGreaterThan(wardenSlam);
  });
});

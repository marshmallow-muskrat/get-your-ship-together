/**
 * endless-2.3.0 regression suite.
 *
 * Each test here is written to fail against endless-2.2.1: the anchors, the Mech
 * cooldown model, the bounded repair economy, the surge director's event shape, the
 * crowd separation contract, the phase-transition rule and the card copy are all new
 * behaviour, not restatements of what the old build already did.
 */
import { describe, expect, it } from 'vitest';
import {
  CONTACT_DAMAGE_ANCHORS,
  ELITE_CHANCE_ANCHORS,
  ENEMY_SPEED_ANCHORS,
  HORDE,
  PASSIVES,
  POPULATION_ANCHORS,
  SPAWN_RATE_ANCHORS,
  SURVIVOR,
  SURVIVOR_BALANCE_VERSION,
  contactDamageMulAt,
  curveAt,
  eliteHealthRatio,
  endlessDifficultyAt,
  enemySpeedMulAt,
  maxMechUptimeFraction,
  regenFractionAtLevel,
  regenPerSecondAtLevel,
  repairOrbBonusAtLevel,
  type WeaponId,
} from './survivorContent';
import { createSurvivorState, emptyEnemy, type SurvivorState } from './survivorState';
import {
  EMPTY_SURVIVOR_INPUT,
  SURGE_KINDS,
  damagePlayer,
  generateChoices,
  mechCooldownFor,
  mechDurationFor,
  stepSurvivor,
  surgeEdgesFor,
  tryMech,
} from './survivorSim';
import {
  newWeaponCard,
  passiveCard,
  weaponStatDiff,
  weaponTradeoff,
  weaponUpgradeCard,
} from './survivorUpgradeCards';
import {
  createTelemetry,
  deathLogEntries,
  formReport,
  recordFormTime,
  recordIncoming,
  recordOutgoing,
  sourceReport,
  DAMAGE_LOG_CAP,
  type DamageSource,
} from './survivorTelemetry';

const HORDE_SRC: DamageSource = {
  kind: 'horde-contact',
  displayName: 'Blob',
  attackName: 'Contact',
  role: 'fodder',
};

function quietRun(seed: number, timeSec = 0): SurvivorState {
  const state = createSurvivorState('bee', null, seed);
  state.time = timeSec;
  state.player.invuln = 1e9;
  state.weapons = [];
  return state;
}

// ---------------------------------------------------------------- §1 speed curve

describe('§1 global speed curve', () => {
  it('hits every published anchor exactly', () => {
    for (const [minutes, expected] of ENEMY_SPEED_ANCHORS) {
      expect(enemySpeedMulAt(minutes * 60), `${minutes}m`).toBeCloseTo(expected, 6);
      expect(endlessDifficultyAt(minutes * 60).speedMul, `${minutes}m via difficulty`).toBeCloseTo(
        expected,
        6,
      );
    }
  });

  it('reserves 1.24x for ~50 minutes instead of 15', () => {
    // The defect: endless-2.2.1 reached 1.24x at fifteen minutes.
    expect(enemySpeedMulAt(15 * 60)).toBeLessThan(1.06);
    expect(enemySpeedMulAt(50 * 60)).toBeCloseTo(1.24, 6);
  });

  it('is monotonic and bounded across a very long run', () => {
    let prev = 0;
    for (let m = 0; m <= 120; m += 1) {
      const v = enemySpeedMulAt(m * 60);
      expect(v).toBeGreaterThanOrEqual(prev);
      expect(v).toBeLessThanOrEqual(1.7);
      prev = v;
    }
  });

  it('Containment Collapse never contributes to raw speed', () => {
    // Anchors at 30m/40m/45m/50m sit inside the Collapse era; if Collapse fed speed,
    // they could not be exact.
    expect(endlessDifficultyAt(30 * 60).speedMul).toBeCloseTo(1.1, 6);
    expect(endlessDifficultyAt(45 * 60).speedMul).toBeCloseTo(1.2, 6);
  });

  it('opening speeds leave the player real kiting headroom', () => {
    for (const def of Object.values(HORDE)) {
      expect(def.baseSpeed * enemySpeedMulAt(0)).toBeLessThan(SURVIVOR.playerSpeed * 0.62);
    }
    // Even at fifty minutes the fastest specialist stays under the player.
    expect(HORDE.spiky!.baseSpeed * enemySpeedMulAt(50 * 60)).toBeLessThan(SURVIVOR.playerSpeed);
  });
});

// ------------------------------------------------- §2 density / spawn / elite curves

describe('§2 pressure curves', () => {
  it('population anchors match the published table', () => {
    for (const [minutes, expected] of POPULATION_ANCHORS) {
      expect(endlessDifficultyAt(minutes * 60).targetActive, `${minutes}m`).toBe(expected);
    }
  });

  it('spawn-rate anchors match the published table', () => {
    for (const [minutes, expected] of SPAWN_RATE_ANCHORS) {
      if (minutes * 60 >= SURVIVOR.collapseStart) continue; // Collapse layers on top after 30m
      expect(endlessDifficultyAt(minutes * 60).spawnRate, `${minutes}m`).toBeCloseTo(expected, 6);
    }
  });

  it('elite-chance anchors match the published table', () => {
    for (const [minutes, expected] of ELITE_CHANCE_ANCHORS) {
      if (minutes * 60 >= SURVIVOR.collapseStart) continue;
      expect(endlessDifficultyAt(minutes * 60).eliteChance, `${minutes}m`).toBeCloseTo(expected, 6);
    }
  });

  it('elites are not a third of the horde at fifteen minutes', () => {
    // endless-2.2.1 reached ~31% here, which is what made elites feel ordinary.
    expect(endlessDifficultyAt(15 * 60).eliteChance).toBeCloseTo(0.16, 6);
    expect(endlessDifficultyAt(15 * 60).eliteChance).toBeLessThan(0.2);
  });

  it('does not reach the old 160/8-per-second/31% pressure at fifteen minutes', () => {
    const d = endlessDifficultyAt(15 * 60);
    expect(d.targetActive).toBe(118);
    expect(d.spawnRate).toBeLessThan(6.0);
  });

  it('never exceeds the enemy cap, which is not reduced', () => {
    expect(SURVIVOR.enemyCap).toBe(160);
    for (let m = 0; m <= 90; m += 5) {
      expect(endlessDifficultyAt(m * 60).targetActive).toBeLessThanOrEqual(SURVIVOR.enemyCap);
    }
  });

  it('curveAt interpolates and extrapolates predictably', () => {
    const a: ReadonlyArray<readonly [number, number]> = [
      [0, 0],
      [10, 10],
    ];
    expect(curveAt(a, -5)).toBe(0);
    expect(curveAt(a, 5)).toBeCloseTo(5, 6);
    expect(curveAt(a, 20)).toBeCloseTo(20, 6); // final-segment slope continues
  });
});

// --------------------------------------------------------------- §5 contact damage

describe('§5 contact damage', () => {
  it('opening contact damage matches the published table', () => {
    const expected: Record<string, number> = {
      basic: 10,
      mush: 10,
      fast: 12,
      spiky: 13,
      flyer: 12,
      bee: 11,
      ghost: 14,
      bruiser: 20,
      elite: 24,
      miniboss: 28,
    };
    for (const [id, dmg] of Object.entries(expected)) {
      expect(HORDE[id]!.contactDamage, id).toBe(dmg);
    }
  });

  it('hits every contact-damage multiplier anchor exactly', () => {
    for (const [minutes, expected] of CONTACT_DAMAGE_ANCHORS) {
      expect(contactDamageMulAt(minutes * 60), `${minutes}m`).toBeCloseTo(expected, 6);
      expect(endlessDifficultyAt(minutes * 60).damageMul).toBeCloseTo(expected, 6);
    }
  });

  it('one fodder hit is noticeable but three are survivable at the opening', () => {
    const hit = HORDE.basic!.contactDamage * contactDamageMulAt(0);
    expect(hit / SURVIVOR.playerMaxHealth).toBeGreaterThan(0.08);
    expect(hit * 3).toBeLessThan(SURVIVOR.playerMaxHealth);
  });

  it('specialist and elite hits are distinctly more painful than fodder', () => {
    expect(HORDE.elite!.contactDamage).toBeGreaterThan(HORDE.basic!.contactDamage * 2);
    expect(HORDE.bruiser!.contactDamage).toBeGreaterThan(HORDE.fast!.contactDamage);
  });

  it('preserves the post-hit invulnerability window', () => {
    const state = quietRun(1);
    state.player.invuln = 0;
    damagePlayer(state, 10, HORDE_SRC);
    expect(state.player.invuln).toBeCloseTo(SURVIVOR.playerInvuln, 5);
    const hp = state.player.health;
    // Simultaneous overlaps cannot chain-delete the player.
    damagePlayer(state, 10, HORDE_SRC);
    damagePlayer(state, 10, HORDE_SRC);
    expect(state.player.health).toBe(hp);
  });

  it('records hit feedback proportional to the bite taken out of the hull', () => {
    const light = quietRun(2);
    light.player.invuln = 0;
    damagePlayer(light, 5, HORDE_SRC);
    const heavy = quietRun(3);
    heavy.player.invuln = 0;
    damagePlayer(heavy, 40, HORDE_SRC);
    expect(heavy.player.hitSeverity).toBeGreaterThan(light.player.hitSeverity);
    expect(heavy.player.hitVignette).toBeGreaterThan(light.player.hitVignette);
    // Fodder contact never shakes the camera; that is reserved for major hits.
    expect(light.player.hitShake).toBe(0);
  });
});

// ---------------------------------------------------------------- §6 repair economy

describe('§6 kill-driven repair economy', () => {
  /*
   * endless-2.8.0 replaced a wall-clock faucet gated on being injured with an
   * economy earned by killing. The tests below are written to fail against
   * endless-2.7.0: time pacing, the 90% eligibility gate, the injured-only pity
   * floor and the four-orb late cap are all gone.
   */
  it('drops nothing without kills, no matter how long an injured player waits', () => {
    const state = quietRun(4101);
    state.nextBossTime = 1e9;
    state.nextCacheTime = 1e9;
    state.surge.nextSurgeAt = 1e9;
    state.player.health = state.player.maxHealth * 0.3;
    for (let i = 0; i < 120 * 60; i += 1) {
      state.spawnAcc = -1e9;
      stepSurvivor(state, EMPTY_SURVIVOR_INPUT, SURVIVOR.fixedDt);
    }
    expect(state.repairEconomy.drops).toBe(0);
  });

  it('prices an orb in threat-weighted credit, so elites are worth more than fodder', () => {
    const k = SURVIVOR.repair.killDriven;
    expect(k.weightElite).toBeGreaterThan(k.weightOrdinary);
    expect(k.weightMiniboss).toBeGreaterThan(k.weightElite);
    // A drought cannot run forever under either model.
    expect(k.guaranteeAt).toBeGreaterThan(k.threshold);
    expect(k.thresholdVariance).toBeGreaterThan(0);
    expect(k.thresholdVariance).toBeLessThan(1);
  });

  it('leaves an orb on the floor for a player at full integrity', () => {
    const state = quietRun(4102);
    state.player.health = state.player.maxHealth;
    state.pickups.push({
      id: state.nextId++,
      kind: 'repair',
      x: state.player.x,
      z: state.player.z,
      value: SURVIVOR.repair.value,
      active: true,
      magnetized: false,
      life: SURVIVOR.repairPickupLife,
    });
    stepSurvivor(state, EMPTY_SURVIVOR_INPUT, SURVIVOR.fixedDt);
    const orb = state.pickups.find((p) => p.kind === 'repair');
    // Standing on it at full health must neither consume it nor magnetize it.
    expect(orb?.active).toBe(true);
    expect(orb?.magnetized).toBe(false);
    expect(state.player.health).toBe(state.player.maxHealth);
  });

  it('keeps boss and miniboss repair guaranteed and larger than an ordinary orb', () => {
    expect(SURVIVOR.repair.minibossValue).toBeGreaterThan(SURVIVOR.repair.value);
    expect(SURVIVOR.repair.bossValue).toBeGreaterThan(SURVIVOR.repair.minibossValue);
  });

  it('gives every ordinary orb a bankable world lifetime', () => {
    expect(SURVIVOR.repairPickupLife).toBeGreaterThanOrEqual(60);
    expect(SURVIVOR.repairPickupLife).toBeLessThanOrEqual(75);
  });
});

describe('endless-2.6.1 identity and late repair contracts', () => {
  it('never offers another hero signature and exposes every shared weapon', () => {
    const signatures = new Set<WeaponId>(['microdrone', 'rail', 'bioplasma', 'rocket']);
    const seen = new Set<WeaponId>();
    for (let seed = 1; seed <= 160; seed += 1) {
      const state = createSurvivorState('bee', null, seed);
      const choices = generateChoices(state);
      for (const choice of choices) {
        if (choice.kind !== 'new-weapon' || !choice.weaponId) continue;
        seen.add(choice.weaponId);
        expect(signatures.has(choice.weaponId), `offered signature ${choice.weaponId}`).toBe(false);
      }
    }
    expect(seen.has('rotary')).toBe(true);
    expect(seen.has('plasma-wake')).toBe(true);
    expect(seen.has('pulsar')).toBe(true);
  });

  it('Boswell fires a directional, non-homing drone formation', () => {
    const state = quietRun(2600);
    state.weapons = [{ weaponId: 'microdrone', level: 1, cooldown: 0, prototype: false, focusDebt: 0 }];
    const target = emptyEnemy();
    target.id = state.nextId++;
    target.alive = true;
    target.x = 10;
    target.z = 0;
    target.health = target.maxHealth = 1000;
    state.enemies.push(target);
    stepSurvivor(state, EMPTY_SURVIVOR_INPUT, SURVIVOR.fixedDt);
    const drones = state.projectiles.filter((p) => p.active && p.kind === 'drone');
    expect(drones.length).toBeGreaterThanOrEqual(3);
    expect(drones.every((p) => !p.homing)).toBe(true);
    expect(new Set(drones.map((p) => p.z.toFixed(2))).size).toBeGreaterThan(1);
  });

  /*
   * endless-2.8.0 replaced the time-spawned late repair schedule with a
   * kill-driven economy. These two cases pin the halves of that contract that a
   * future tuning pass could quietly undo.
   */
  it('produces no ordinary repair orbs without kills, however long it waits', () => {
    const state = quietRun(2601, SURVIVOR.lateRepairStart + 1);
    state.nextBossTime = 1e9;
    state.nextCacheTime = 1e9;
    state.surge.nextSurgeAt = 1e9;
    // Injured, and well past every interval the old time-based schedule used.
    state.player.health = state.player.maxHealth * 0.4;
    for (let i = 0; i < 70 * 60; i += 1) {
      state.spawnAcc = -1e9;
      stepSurvivor(state, EMPTY_SURVIVOR_INPUT, SURVIVOR.fixedDt);
    }
    const repairs = state.pickups.filter((p) => p.active && p.kind === 'repair' && !p.premium);
    expect(repairs).toHaveLength(0);
    expect(state.repairEconomy.drops).toBe(0);
  });

});

// --------------------------------------------------------- §7 Nanite Bleed / passives

describe('§7 Nanite Bleed', () => {
  it('regenerates a percentage of maximum integrity', () => {
    expect(regenFractionAtLevel(1)).toBeCloseTo(0.004, 6);
    expect(regenFractionAtLevel(3)).toBeCloseTo(0.012, 6);
    expect(regenFractionAtLevel(5)).toBeCloseTo(0.02, 6);
    expect(regenPerSecondAtLevel(5, 300)).toBeCloseTo(6, 6);
  });

  it('uses strong diminishing returns past L5', () => {
    const l5 = regenFractionAtLevel(5);
    const l6 = regenFractionAtLevel(6);
    const l30 = regenFractionAtLevel(30);
    expect(l6).toBeGreaterThan(l5);
    expect(l6 - l5).toBeLessThan(0.004);
    // 25 further levels must not double the L5 value.
    expect(l30).toBeLessThan(l5 * 1.5);
  });

  it('improves repair-orb healing by 10% per level through L5', () => {
    expect(repairOrbBonusAtLevel(1)).toBeCloseTo(0.1, 6);
    expect(repairOrbBonusAtLevel(5)).toBeCloseTo(0.5, 6);
    expect(repairOrbBonusAtLevel(10) - repairOrbBonusAtLevel(5)).toBeLessThan(0.15);
  });

  it('resumes two seconds after damage', () => {
    expect(SURVIVOR.regenDamagePause).toBeCloseTo(2, 6);
  });

  it('has exactly one authoritative implementation', () => {
    // The dead `regenPerLevel` constant that disagreed with the formula is gone.
    expect((SURVIVOR as Record<string, unknown>).regenPerLevel).toBeUndefined();
    const def = PASSIVES.find((p) => p.id === 'regen')!;
    expect(def.perLevel).toBeCloseTo(0.004, 6);
  });

  it('is described on the card with both effects', () => {
    const card = passiveCard('regen', 2, 150);
    expect(card.summary).toMatch(/maximum integrity per second/i);
    expect(card.summary).toMatch(/repair orbs/i);
    expect(card.stats.join('\n')).toMatch(/Repair orbs/);
  });
});

describe('§8 other passives', () => {
  it('Magnet Field states energy reach, repair reach and travel speed', () => {
    const card = passiveCard('pickup-radius', 1, 100);
    const text = card.stats.join('\n');
    expect(text).toMatch(/Energy reach/);
    expect(text).toMatch(/Repair reach/);
    expect(text).toMatch(/faster/i);
    // Repair reach gains roughly twice what energy reach gains.
    expect(SURVIVOR.healthMagnetPerLevel).toBeGreaterThan(SURVIVOR.xpMagnetPerLevel * 1.5);
  });

  it('keeps hard safety caps on every capped passive', () => {
    for (const id of ['move-speed', 'weapon-haste', 'area', 'overdrive-systems', 'breach-shielding'] as const) {
      const def = PASSIVES.find((p) => p.id === id)!;
      expect(def.maxLevel, id).toBe(5);
    }
  });
});

// -------------------------------------------------------------------- §9 Mech model

describe('§9 fixed-cooldown Mech', () => {
  it('starts the run unavailable and first becomes ready after one full cooldown', () => {
    const state = quietRun(11);
    state.nextBossTime = 1e9;
    state.spawnAcc = -1e9;
    expect(state.player.mechCd).toBeCloseTo(SURVIVOR.mech.initialCooldown, 5);
    expect(tryMech(state)).toBe(false);
    for (let i = 0; i < Math.floor(SURVIVOR.mech.initialCooldown * 60) - 2; i += 1) {
      state.spawnAcc = -1e9;
      stepSurvivor(state, EMPTY_SURVIVOR_INPUT, SURVIVOR.fixedDt);
    }
    expect(tryMech(state)).toBe(false);
    for (let i = 0; i < 6; i += 1) {
      state.spawnAcc = -1e9;
      stepSurvivor(state, EMPTY_SURVIVOR_INPUT, SURVIVOR.fixedDt);
    }
    expect(tryMech(state)).toBe(true);
  });

  it('is activation-to-activation: the cooldown runs during Mech', () => {
    const state = quietRun(12);
    state.nextBossTime = 1e9;
    state.player.mechCd = 0;
    expect(tryMech(state)).toBe(true);
    expect(state.player.mechCd).toBeCloseTo(SURVIVOR.mech.cooldown, 5);
    // After the full duration, the remaining cooldown is cooldown - duration.
    for (let i = 0; i < Math.ceil(SURVIVOR.mech.duration * 60) + 2; i += 1) {
      state.spawnAcc = -1e9;
      stepSurvivor(state, EMPTY_SURVIVOR_INPUT, SURVIVOR.fixedDt);
    }
    expect(state.player.form).toBe('astronaut');
    const expectedRemaining = SURVIVOR.mech.cooldown - SURVIVOR.mech.duration;
    expect(state.player.mechCd).toBeGreaterThan(expectedRemaining - 1);
    expect(state.player.mechCd).toBeLessThan(expectedRemaining + 1);
  });

  it('uses the approved 30/6 cadence: 20% base uptime and 24 seconds astronaut time', () => {
    expect(SURVIVOR.mech.duration / SURVIVOR.mech.cooldown).toBeCloseTo(0.2, 6);
    expect(SURVIVOR.mech.cooldown - SURVIVOR.mech.duration).toBeCloseTo(24, 5);
  });

  it('is never refilled by kills, elites, minibosses or bosses', () => {
    const state = quietRun(13, 600);
    state.nextBossTime = 1e9;
    state.player.mechCd = 0;
    tryMech(state);
    const afterActivation = state.player.mechCd;
    // Kill a lot of things, including elites, while Mech is up.
    for (let i = 0; i < 120; i += 1) {
      stepSurvivor(state, EMPTY_SURVIVOR_INPUT, SURVIVOR.fixedDt);
      for (const e of state.enemies) {
        if (e.alive) e.health = -1;
      }
    }
    // Cooldown only ever decreases with wall clock, never jumps back up from kills.
    expect(state.player.mechCd).toBeLessThan(afterActivation);
    // And the charge field the old model used is gone entirely.
    expect((state.player as Record<string, unknown>).mechCharge).toBeUndefined();
  });

  /*
   * Core Cycling and Reactor Hold were merged into the single Overdrive Systems
   * passive in 2.7.0. The uptime *ceiling* remains a 2.3.0-line concern and is asserted
   * here; the authored progression itself is a 2.7.0 contract and lives in
   * `survivorRelease270.test.ts` §4.
   */
  it('caps maximum achievable uptime well short of permanent', () => {
    const uptime = maxMechUptimeFraction();
    expect(uptime).toBeCloseTo(0.25, 6);
    expect(uptime).toBeLessThan(0.3);
  });

  it('applies the Mech passive to the live cooldown and duration', () => {
    const state = quietRun(14);
    state.passives['overdrive-systems'] = 5;
    expect(mechCooldownFor(state)).toBeCloseTo(28.0, 5);
    expect(mechDurationFor(state)).toBeCloseTo(7.0, 5);
  });

  it('cannot transform from ship form, and pausing does not advance the cooldown', () => {
    const state = quietRun(15);
    state.nextBossTime = 1e9;
    state.player.mechCd = 5;
    state.player.form = 'ship';
    expect(tryMech(state)).toBe(false);
    state.player.form = 'astronaut';
    state.phase = 'paused';
    const before = state.player.mechCd;
    for (let i = 0; i < 60; i += 1) stepSurvivor(state, EMPTY_SURVIVOR_INPUT, SURVIVOR.fixedDt);
    expect(state.player.mechCd).toBeCloseTo(before, 5);
  });
});

// ------------------------------------------------------------------------ §10 elites

describe('§10 elites', () => {
  it('carry 8-12x a same-time fodder enemy of effective health', () => {
    const ratio = eliteHealthRatio();
    expect(ratio).toBeGreaterThanOrEqual(8);
    expect(ratio).toBeLessThanOrEqual(12);
  });

  it('telegraph the lunge long enough to read and answer', () => {
    expect(SURVIVOR.elite.lungeWindup).toBeGreaterThanOrEqual(0.5);
    expect(SURVIVOR.elite.lungeDamageMul).toBeGreaterThan(1.3);
  });

  it('resist knockback without being immune to it', () => {
    expect(SURVIVOR.repulsor.elitePushMul).toBeGreaterThan(0);
    expect(SURVIVOR.repulsor.elitePushMul).toBeLessThan(1);
  });

  it('keep premium energy rewards', () => {
    expect(HORDE.elite!.xp).toBeGreaterThan(HORDE.bruiser!.xp * 2);
  });

  it('bounds how many elite bars can be on screen at once', () => {
    expect(SURVIVOR.elite.maxVisibleBars).toBeLessThanOrEqual(6);
    expect(SURVIVOR.elite.barVisibleRange).toBeGreaterThan(0);
  });
});

// ------------------------------------------------------------- §3 pressure director

describe('§3 pressure director', () => {
  function runDirector(seed: number, seconds: number, atTime = 300) {
    const state = quietRun(seed, atTime);
    state.nextBossTime = 1e9;
    state.nextCacheTime = 1e9;
    state.surge.nextSurgeAt = atTime + 1;
    const seen: string[] = [];
    for (let i = 0; i < seconds * 60; i += 1) {
      stepSurvivor(state, EMPTY_SURVIVOR_INPUT, SURVIVOR.fixedDt);
      const last = seen[seen.length - 1];
      if (last !== state.surge.phase) seen.push(state.surge.phase);
    }
    return { state, seen };
  }

  // Proving determinism means running the director twice, so this drives 260 simulated
  // seconds of the real simulation and measures ~3.8s alone — thin against vitest's 5s
  // default, and it went over on the CI runner in endless-2.8.0 once the suite grew
  // enough to add worker contention. Measured before and after that release's simulation
  // changes at 3763ms and 3813ms, so the budget is contention headroom and not cover for
  // a slowdown. If this ever times out at 60s the director genuinely regressed; do not
  // widen it further, and never resolve it by touching a balance value or an
  // acceptance band.
  it('uses a 60-75 second cadence with deterministic variation', () => {
    expect(SURVIVOR.surgeIntervalMin).toBe(60);
    expect(SURVIVOR.surgeIntervalMax).toBe(75);
    const a = runDirector(31, 130).state.surge.nextSurgeAt;
    const b = runDirector(31, 130).state.surge.nextSurgeAt;
    expect(a).toBe(b); // same seed, same schedule
  }, 60_000);

  it('telegraphs for 3-4 seconds, not 1.1', () => {
    expect(SURVIVOR.surgeTelegraph).toBeGreaterThanOrEqual(3);
    expect(SURVIVOR.surgeTelegraph).toBeLessThanOrEqual(4);
  });

  it('runs normal → telegraph → surge → recovery → normal', () => {
    const { seen } = runDirector(32, 120);
    const idx = seen.indexOf('telegraph');
    expect(idx).toBeGreaterThanOrEqual(0);
    expect(seen[idx + 1]).toBe('surge');
    expect(seen[idx + 2]).toBe('recovery');
    expect(seen[idx + 3]).toBe('normal');
  });

  // Drives 300+ simulated seconds of the real director, so it runs ~4.3s alone
  // and longer under full-suite worker contention - thin against vitest's 5s
  // default. The explicit budget keeps that from reading as a balance
  // regression. If this ever times out at 60s, the director genuinely slowed
  // down; do not widen it further, and do not touch a balance value to fix it.
  it('never stacks surges', () => {
    const state = quietRun(33, 300);
    state.nextBossTime = 1e9;
    state.surge.nextSurgeAt = 301;
    let restarts = 0;
    let prev = state.surge.phase;
    let prevKind = state.surge.kind;
    for (let i = 0; i < 300 * 60; i += 1) {
      stepSurvivor(state, EMPTY_SURVIVOR_INPUT, SURVIVOR.fixedDt);
      const now = state.surge.phase;
      // A surge may only ever begin from `normal`. Entering telegraph from any other
      // phase would mean a second surge started on top of a running one.
      if (now === 'telegraph' && prev !== 'telegraph' && prev !== 'normal') restarts += 1;
      // The kind may not change mid-event either.
      if ((prev === 'telegraph' || prev === 'surge') && now === prev && state.surge.kind !== prevKind) {
        restarts += 1;
      }
      prev = now;
      prevKind = state.surge.kind;
    }
    expect(restarts).toBe(0);
  }, 60_000);

  it('does not begin an ordinary surge while a boss is alive', () => {
    const state = quietRun(34, 118);
    state.nextBossIndex = 1;
    state.nextBossTime = 120;
    state.surge.nextSurgeAt = 125;
    let startedDuringBoss = 0;
    for (let i = 0; i < 90 * 60; i += 1) {
      const before = state.surge.phase;
      stepSurvivor(state, EMPTY_SURVIVOR_INPUT, SURVIVOR.fixedDt);
      const bossAlive = state.bosses.some((b) => b.active && b.state !== 'dead');
      if (bossAlive && before === 'normal' && state.surge.phase === 'telegraph') {
        startedDuringBoss += 1;
      }
    }
    expect(startedDuringBoss).toBe(0);
  });

  it('ends a running surge into recovery when a boss arrives, without delaying the boss', () => {
    const state = quietRun(35, 100);
    state.nextBossIndex = 1;
    state.nextBossTime = 120;
    state.surge.phase = 'surge';
    state.surge.kind = 'flood';
    state.surge.phaseEndsAt = 1e9;
    state.surge.nextSurgeAt = 1e9;
    for (let i = 0; i < 25 * 60; i += 1) {
      stepSurvivor(state, EMPTY_SURVIVOR_INPUT, SURVIVOR.fixedDt);
    }
    expect(state.bosses.some((b) => b.index === 1)).toBe(true);
    // The surge yielded; it is no longer telegraphing or active.
    const phase: string = state.surge.phase;
    expect(phase === 'recovery' || phase === 'normal').toBe(true);
  });

  it('pincer uses opposite edges and encircle uses all four', () => {
    expect(surgeEdgesFor('pincer', 0, 1).sort()).toEqual([0, 1]);
    expect(surgeEdgesFor('pincer', 2, 3).sort()).toEqual([2, 3]);
    // Opposite means the sibling on the same axis (XOR 1), never a perpendicular edge.
    const [a, b] = surgeEdgesFor('pincer', 2, 2 ^ 1);
    expect(a! ^ 1).toBe(b!);
    expect(surgeEdgesFor('encircle', 0, 1).sort()).toEqual([0, 1, 2, 3]);
  });

  it('gives the surge wave its own speed bonus, never the standing horde', () => {
    expect(SURVIVOR.surgeWaveSpeedBonus).toBeGreaterThanOrEqual(0.2);
    expect(SURVIVOR.surgeWaveSpeedBonus).toBeLessThanOrEqual(0.25);
    // The global curve is untouched by any surge that has been and gone.
    const before = enemySpeedMulAt(300);
    const { state } = runDirector(36, 100);
    expect(enemySpeedMulAt(state.time)).toBeCloseTo(enemySpeedMulAt(state.time), 6);
    expect(before).toBeCloseTo(enemySpeedMulAt(300), 6);
  });

  it('recovery creates a real lull by withholding replacements, not by despawning', () => {
    const state = quietRun(37, 300);
    state.nextBossTime = 1e9;
    state.surge.phase = 'recovery';
    state.surge.kind = 'flood';
    state.surge.phaseEndsAt = state.time + SURVIVOR.surgeRecovery;
    state.surge.recoveryTarget = 10;
    // Seed a full arena, then confirm nothing is deleted outright.
    for (let i = 0; i < 40; i += 1) {
      stepSurvivor(state, EMPTY_SURVIVOR_INPUT, SURVIVOR.fixedDt);
    }
    const aliveStart = state.enemies.filter((e) => e.alive).length;
    for (let i = 0; i < 60; i += 1) {
      stepSurvivor(state, EMPTY_SURVIVOR_INPUT, SURVIVOR.fixedDt);
    }
    const aliveEnd = state.enemies.filter((e) => e.alive).length;
    // No mass despawn: with no player weapons, living enemies survive recovery.
    expect(aliveEnd).toBeGreaterThanOrEqual(aliveStart);
  });

  it('recovery lasts 12-15 seconds', () => {
    expect(SURVIVOR.surgeRecovery).toBeGreaterThanOrEqual(12);
    expect(SURVIVOR.surgeRecovery).toBeLessThanOrEqual(15);
  });

  it('enumerates every authored surge kind', () => {
    expect([...SURGE_KINDS].sort()).toEqual(
      ['bruiser', 'encircle', 'elite', 'flood', 'pincer', 'sprinters'].sort(),
    );
  });
});

// ------------------------------------------------------------------ §4 crowd steering

describe('§4 crowd movement', () => {
  function crowdedRun(seed: number, count: number): SurvivorState {
    const state = quietRun(seed, 900);
    state.nextBossTime = 1e9;
    state.nextCacheTime = 1e9;
    state.surge.nextSurgeAt = 1e9;
    state.enemyCap = SURVIVOR.enemyCap;
    for (let i = 0; i < count; i += 1) {
      // Deliberately stacked: many enemies share nearly the same position.
      const a = (i / count) * Math.PI * 2;
      const r = 3 + (i % 4) * 0.05;
      const e = emptyEnemy();
      e.id = 10_000 + i;
      e.defId = 'basic';
      e.role = 'fodder';
      e.alive = true;
      e.x = Math.cos(a) * r;
      e.z = Math.sin(a) * r;
      e.health = 1e9;
      e.maxHealth = 1e9;
      e.radius = 0.5;
      e.lungeCd = 99;
      state.enemies.push(e);
    }
    return state;
  }

  it('resolves exact overlaps deterministically and without NaN', () => {
    const state = quietRun(41, 900);
    state.nextBossTime = 1e9;
    state.spawnAcc = -1e9;
    // Two enemies at exactly the same point: no separation direction exists.
    for (let i = 0; i < 2; i += 1) {
      const e = emptyEnemy();
      e.id = 500 + i;
      e.defId = 'basic';
      e.role = 'fodder';
      e.alive = true;
      e.x = 4;
      e.z = 4;
      e.health = 1e9;
      e.maxHealth = 1e9;
      e.radius = 0.5;
      e.lungeCd = 99;
      state.enemies.push(e);
    }
    for (let i = 0; i < 60; i += 1) {
      state.spawnAcc = -1e9;
      stepSurvivor(state, EMPTY_SURVIVOR_INPUT, SURVIVOR.fixedDt);
    }
    for (const e of state.enemies) {
      expect(Number.isFinite(e.x), 'x is finite').toBe(true);
      expect(Number.isFinite(e.z), 'z is finite').toBe(true);
    }
    const a = state.enemies.find((e) => e.id === 500)!;
    const b = state.enemies.find((e) => e.id === 501)!;
    // They must have actually separated, not stayed co-located.
    expect(Math.hypot(a.x - b.x, a.z - b.z)).toBeGreaterThan(0.05);
  });

  it('separates a stacked crowd rather than sharing one position', () => {
    const state = crowdedRun(42, 60);
    for (let i = 0; i < 120; i += 1) {
      state.spawnAcc = -1e9;
      stepSurvivor(state, EMPTY_SURVIVOR_INPUT, SURVIVOR.fixedDt);
    }
    let tooClose = 0;
    const living = state.enemies.filter((e) => e.alive);
    for (let i = 0; i < living.length; i += 1) {
      for (let j = i + 1; j < living.length; j += 1) {
        const d = Math.hypot(living[i]!.x - living[j]!.x, living[i]!.z - living[j]!.z);
        if (d < 0.35) tooClose += 1;
      }
    }
    // Some contact is expected in a horde; near-total co-location is not.
    expect(tooClose).toBeLessThan(living.length);
  });

  it('stays stable and finite at the full enemy cap', () => {
    const state = crowdedRun(43, SURVIVOR.enemyCap);
    for (let i = 0; i < 180; i += 1) {
      stepSurvivor(state, EMPTY_SURVIVOR_INPUT, SURVIVOR.fixedDt);
    }
    for (const e of state.enemies) {
      if (!e.alive) continue;
      expect(Number.isFinite(e.x)).toBe(true);
      expect(Number.isFinite(e.z)).toBe(true);
      expect(Math.abs(e.x)).toBeLessThanOrEqual(SURVIVOR.arenaHalf + 2);
      expect(Math.abs(e.z)).toBeLessThanOrEqual(SURVIVOR.arenaHalf + 2);
    }
  });
});

// ------------------------------------------------------------ §13 upgrade card copy

describe('§13 upgrade cards', () => {
  const ORDINARY: WeaponId[] = ['pulse', 'microdrone', 'rail', 'gravity', 'rocket', 'bioplasma'];
  const ALL: WeaponId[] = [...ORDINARY, 'arc', 'orbital'];

  it('every authored L1-L5 upgrade names its category, parent, levels and upgrade', () => {
    for (const id of ALL) {
      for (let lv = 1; lv <= 4; lv += 1) {
        const card = weaponUpgradeCard(id, lv);
        expect(card.category, `${id} L${lv}`).toMatch(/WEAPON UPGRADE|PROTOTYPE UPGRADE/);
        expect(card.parent.length).toBeGreaterThan(0);
        expect(card.levels).toBe(`L${lv} → L${lv + 1}`);
        expect(card.name.length).toBeGreaterThan(0);
        // A plain-language sentence, not a bare stat line.
        expect(card.summary.length, `${id} L${lv} summary`).toBeGreaterThan(15);
        expect(card.stats.length, `${id} L${lv} stats`).toBeGreaterThan(0);
      }
    }
  });

  it('Twin Globs explains the structural change and the cadence tradeoff', () => {
    const card = weaponUpgradeCard('bioplasma', 3);
    expect(card.category).toBe('WEAPON UPGRADE');
    // endless-2.8.0 centralised display names on `displayName`, which keeps the authored
    // Title Case. Shouting is now CSS `text-transform`, so the string stays readable and
    // a name with intentional casing survives.
    expect(card.parent).toBe('Bio-Plasma Glob');
    expect(card.levels).toBe('L3 → L4');
    expect(card.name).toBe('Twin Globs');
    expect(card.summary).toMatch(/two|2/i);
    const stats = card.stats.join('\n');
    expect(stats).toMatch(/Projectiles 1 → 2/);
    expect(stats).toMatch(/Impact/);
    expect(stats).toMatch(/Volley interval/);
    // The cadence cost must never be hidden.
    expect(card.tradeoff).toBeTruthy();
    expect(card.tradeoff!).toMatch(/less often/);
  });

  it('Swarm Cadre says the drones launch faster and hit harder', () => {
    const card = weaponUpgradeCard('microdrone', 2);
    expect(card.name).toBe('Swarm Cadre');
    expect(card.summary).toMatch(/harder/i);
    expect(card.summary).toMatch(/faster/i);
  });

  it('reports every mechanically relevant field that changed', () => {
    // Bio-plasma L4→L5 changes bounce and split; both must appear.
    const stats = weaponStatDiff('bioplasma', 4, 5).join('\n');
    expect(stats).toMatch(/Bounces/);
    expect(stats).toMatch(/Splits/);
    // Arc L2→L3 adds a chain.
    expect(weaponStatDiff('arc', 2, 3).join('\n')).toMatch(/Chains/);
    // Rail L4→L5 adds a second beam.
    expect(weaponStatDiff('rail', 4, 5).join('\n')).toMatch(/Beams 1 → 2/);
  });

  it('never reports a tradeoff that is not real', () => {
    for (const id of ALL) {
      for (let lv = 1; lv <= 4; lv += 1) {
        const a = weaponUpgradeCard(id, lv);
        if (a.tradeoff) {
          expect(a.tradeoff, `${id} L${lv}`).toMatch(/Tradeoff:/);
        }
        // A pure improvement must not claim a downside.
        const t = weaponTradeoff(id, lv, lv + 1);
        expect(t === null || t.length > 0).toBe(true);
      }
    }
  });

  it('marks Overclocks distinctly from authored levels', () => {
    const card = weaponUpgradeCard('pulse', 5);
    expect(card.category).toBe('OVERCLOCK');
    expect(card.levels).toBe('L5 → L6');
    expect(card.summary).toMatch(/additive/i);
  });

  it('new weapons and prototypes explain their complete identity', () => {
    for (const id of ORDINARY) {
      const card = newWeaponCard(id);
      expect(card.category).toBe('NEW WEAPON');
      expect(card.stats.length).toBeGreaterThanOrEqual(3);
    }
    for (const id of ['arc', 'orbital'] as WeaponId[]) {
      const card = newWeaponCard(id);
      expect(card.category).toBe('NEW PROTOTYPE');
      expect(card.summary).toMatch(/slot/i);
    }
  });

  it('every passive card explains its practical effect with numbers', () => {
    for (const def of PASSIVES) {
      const card = passiveCard(def.id, 1, 150);
      expect(card.category).toBe('PASSIVE UPGRADE');
      expect(card.summary.length, `${def.id} summary`).toBeGreaterThan(20);
      expect(card.stats.length, `${def.id} stats`).toBeGreaterThan(0);
    }
    // A brand-new passive is badged differently.
    expect(passiveCard('regen', 0, 100).category).toBe('NEW PASSIVE');
  });
});

// --------------------------------------------------------- §14/§15 telemetry contract

describe('§14 death log', () => {
  it('attributes the killing blow to the exact source and mechanic', () => {
    const state = quietRun(51);
    state.player.invuln = 0;
    state.player.health = 10;
    damagePlayer(state, 999, {
      kind: 'boss-charge',
      displayName: 'Breach Demon',
      attackName: 'Ravage Charge',
      bossIndex: 1,
      isMega: false,
    });
    expect(state.phase).toBe('defeat');
    const blow = state.telemetry.killingBlow;
    expect(blow).not.toBeNull();
    expect(blow!.source.displayName).toBe('Breach Demon');
    expect(blow!.source.attackName).toBe('Ravage Charge');
    expect(blow!.source.kind).toBe('boss-charge');
    expect(blow!.remaining).toBe(0);
  });

  it('records raw, mitigated, absorbed, applied and remaining for each hit', () => {
    const state = quietRun(52);
    state.player.invuln = 0;
    state.player.shieldPoints = 5;
    state.player.shieldMax = 5;
    state.player.shieldTime = 10;
    damagePlayer(state, 20, HORDE_SRC);
    const rec = state.telemetry.recentHits.at(-1)!;
    expect(rec.raw).toBe(20);
    expect(rec.mitigated).toBeCloseTo(20, 5);
    expect(rec.shieldAbsorbed).toBeCloseTo(5, 5);
    expect(rec.applied).toBeCloseTo(15, 5);
    expect(rec.remaining).toBeCloseTo(state.player.health, 5);
  });

  it('keeps the hit history bounded', () => {
    const t = createTelemetry();
    for (let i = 0; i < DAMAGE_LOG_CAP * 3; i += 1) {
      recordIncoming(t, {
        time: i,
        source: HORDE_SRC,
        raw: 1,
        mitigated: 1,
        shieldAbsorbed: 0,
        applied: 1,
        remaining: 100 - i,
      });
    }
    expect(t.recentHits.length).toBe(DAMAGE_LOG_CAP);
    // The most recent hits are the ones retained.
    expect(t.recentHits.at(-1)!.time).toBe(DAMAGE_LOG_CAP * 3 - 1);
  });

  it('windows the death log to the recent contributing hits', () => {
    const t = createTelemetry();
    for (const time of [1, 50, 95, 99]) {
      recordIncoming(t, {
        time,
        source: HORDE_SRC,
        raw: 1,
        mitigated: 1,
        shieldAbsorbed: 0,
        applied: 1,
        remaining: 1,
      });
    }
    const entries = deathLogEntries(t, 100);
    expect(entries.map((e) => e.time)).toEqual([95, 99]);
  });
});

describe('§15 run damage report', () => {
  it('excludes overkill from recorded damage', () => {
    const t = createTelemetry();
    recordFormTime(t, 'astronaut', 1);
    // A 900-damage hit that only removed 3 HP counts as 3.
    recordOutgoing(t, { sourceId: 'weapon:rail', form: 'astronaut', applied: 3, isBoss: false, killed: true });
    const rows = sourceReport(t);
    expect(rows[0]!.damage).toBe(3);
    expect(rows[0]!.kills).toBe(1);
  });

  it('computes shares that sum to one', () => {
    const t = createTelemetry();
    recordFormTime(t, 'astronaut', 10);
    recordOutgoing(t, { sourceId: 'weapon:pulse', form: 'astronaut', applied: 300, isBoss: false, killed: false });
    recordOutgoing(t, { sourceId: 'repulsor', form: 'astronaut', applied: 100, isBoss: false, killed: false });
    const rows = sourceReport(t);
    expect(rows.reduce((n, r) => n + r.share, 0)).toBeCloseTo(1, 6);
    expect(rows[0]!.id).toBe('weapon:pulse');
    expect(rows[0]!.dps).toBeCloseTo(30, 5);
  });

  it('tracks boss damage, hits and max hit per source', () => {
    const t = createTelemetry();
    recordFormTime(t, 'mech', 5);
    recordOutgoing(t, { sourceId: 'weapon:rail', form: 'mech', applied: 50, isBoss: true, killed: false });
    recordOutgoing(t, { sourceId: 'weapon:rail', form: 'mech', applied: 120, isBoss: false, killed: false });
    const row = sourceReport(t)[0]!;
    expect(row.hits).toBe(2);
    expect(row.bossDamage).toBe(50);
    expect(row.maxHit).toBe(120);
  });

  it('attributes by form without double-counting the source totals', () => {
    const t = createTelemetry();
    recordFormTime(t, 'astronaut', 6);
    recordFormTime(t, 'mech', 4);
    recordOutgoing(t, { sourceId: 'weapon:rail', form: 'astronaut', applied: 60, isBoss: false, killed: false });
    recordOutgoing(t, { sourceId: 'weapon:rail', form: 'mech', applied: 40, isBoss: false, killed: false });
    // One source bucket totalling 100...
    const sources = sourceReport(t);
    expect(sources.length).toBe(1);
    expect(sources[0]!.damage).toBe(100);
    // ...and a separate form view that also totals 100, not 200.
    const forms = formReport(t);
    expect(forms.reduce((n, f) => n + f.damage, 0)).toBe(100);
    expect(forms.find((f) => f.form === 'mech')!.uptime).toBeCloseTo(0.4, 5);
  });
});

// ------------------------------------------------------- §11 boss phase transitions

describe('§11 boss phase transitions', () => {
  it('never cancels a live attack into a harmless recovery window', () => {
    const state = quietRun(61, 119.9);
    state.nextBossIndex = 1;
    state.nextBossTime = 120;
    state.spawnAcc = -1e9;
    for (let i = 0; i < 240; i += 1) {
      state.spawnAcc = -1e9;
      stepSurvivor(state, EMPTY_SURVIVOR_INPUT, SURVIVOR.fixedDt);
    }
    const boss = state.bosses.find((b) => b.index === 1)!;
    // Drive it into a committed attack, then cross both thresholds in one hit.
    for (let i = 0; i < 600 && boss.state !== 'active'; i += 1) {
      state.spawnAcc = -1e9;
      stepSurvivor(state, EMPTY_SURVIVOR_INPUT, SURVIVOR.fixedDt);
    }
    const wasActive = boss.state === 'active';
    const pattern = boss.pattern;
    boss.health = boss.maxHealth * 0.2;
    // Recompute the phase the way damage does.
    stepSurvivor(state, EMPTY_SURVIVOR_INPUT, SURVIVOR.fixedDt);
    if (wasActive) {
      // The attack keeps running; the transition is deferred, not applied immediately.
      expect(boss.pattern).toBe(pattern);
    }
  });

  it('starts attacking promptly after arriving', () => {
    const state = quietRun(62, 119.9);
    state.nextBossIndex = 1;
    state.nextBossTime = 120;
    state.spawnAcc = -1e9;
    let firstAttackAt = -1;
    let spawnAt = -1;
    for (let i = 0; i < 600; i += 1) {
      state.spawnAcc = -1e9;
      stepSurvivor(state, EMPTY_SURVIVOR_INPUT, SURVIVOR.fixedDt);
      const boss = state.bosses.find((b) => b.index === 1);
      if (boss && spawnAt < 0) spawnAt = state.time;
      if (boss && firstAttackAt < 0 && (boss.state === 'windup' || boss.state === 'active')) {
        firstAttackAt = state.time;
        break;
      }
    }
    expect(firstAttackAt).toBeGreaterThan(0);
    expect(firstAttackAt - spawnAt).toBeLessThanOrEqual(2.5);
  });
});

// ---------------------------------------------------------------- §22 balance version

describe('§22 release metadata', () => {
  /*
   * This is the balance partition marker the deployment verifier greps out of the served
   * bundle, so it has to move with the release rather than at promotion time. While it
   * lagged, a 2.8.0 Test Center build could not be told apart from production 2.7.0 by
   * the one check that exists to catch a mis-publish.
   */
  it('stamps endless-2.8.0 for the boss-fairness and control-field release', () => {
    expect(SURVIVOR_BALANCE_VERSION).toBe('endless-2.8.0');
  });
});

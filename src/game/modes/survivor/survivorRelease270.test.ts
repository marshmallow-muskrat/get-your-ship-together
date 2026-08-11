/**
 * `endless-2.7.0` release contracts.
 *
 * One file per release line, mirroring `survivorRelease230.test.ts`. Every section
 * below is a behavioural contract for a 2.7.0 workstream, not a restatement of a
 * constant: where a number appears it is derived through production code paths so the
 * test fails if the mechanism stops producing it, not merely if someone edits a table.
 */
import { describe, expect, it } from 'vitest';
import cssSource from '../../../styles/app.css?raw';
import hudSource from './survivorHud.ts?raw';
import {
  MEGA_PROTOCOLS,
  PASSIVES,
  SHIP_MITIGATION_FLOOR,
  SURVIVOR,
  shipDamageTakenMul,
  WEAPONS,
  heroStarterWeapon,
  isSignatureWeapon,
  maxMechUptimeFraction,
  mechCooldownAtLevel,
  mechDurationAtLevel,
  mechSpeedBonusAtLevel,
  mechUptimeFractionAtLevel,
} from './survivorContent';
import { passiveCard } from './survivorUpgradeCards';
import { createSurvivorState, emptyBoss, emptyEnemy, type SurvivorState } from './survivorState';
import {
  EMPTY_SURVIVOR_INPUT,
  applyBossBodyContact,
  applyShipBossRam,
  damagePlayer,
  forceStartProtocol,
  mechCooldownFor,
  mechDurationFor,
  tryMech,
  tryShip,
  stepSurvivor,
  thrusterPower,
} from './survivorSim';
import { runTitanComparison, summariseTitanComparison } from './survivorTitanBenchmark';
import {
  cleanupCrewRows,
  cleanupCrewTotal,
  formReport,
  sourceFormReport,
  sourceFormRows,
  sourceLabel,
  sourceReport,
  totalOutgoing,
  type DamageSource,
} from './survivorTelemetry';

/** A boss placed exactly on the player, large enough to guarantee overlap. */
function bossOnPlayer(state: SurvivorState, id = 9101): ReturnType<typeof emptyBoss> {
  const b = emptyBoss();
  b.id = id;
  b.index = 1;
  b.active = true;
  b.state = 'idle';
  b.x = state.player.x;
  b.z = state.player.z;
  b.colliderRadius = 2.0;
  b.maxHealth = 5_000_000;
  b.health = b.maxHealth;
  return b;
}

const HORDE_HIT: DamageSource = {
  kind: 'horde-contact',
  displayName: 'Blob',
  attackName: 'Contact',
  role: 'fodder',
};

const BOSS_HIT: DamageSource = {
  kind: 'boss-body',
  displayName: 'Breach Demon',
  attackName: 'Body Slam',
  bossIndex: 1,
};

/** Integrity actually removed by one hit in the given form. */
function appliedDamage(form: 'astronaut' | 'ship' | 'mech', raw: number, source: DamageSource): number {
  const state = createSurvivorState('bee', null, 2701);
  state.player.form = form;
  state.player.invuln = 0;
  state.player.dodgeActive = 0;
  state.player.shieldPoints = 0;
  state.player.shieldTime = 0;
  const before = state.player.health;
  damagePlayer(state, raw, source);
  return before - state.player.health;
}

/**
 * §1 Aegis HUD placement.
 *
 * The 2.6.1 defect: `.sv-aegis-float` was a *sibling* of `.sv-command`, positioned by
 * `bottom: calc(5.6rem * var(--ui-scale) + 0.35rem)` — a hard-coded guess at the deck's
 * height. The deck actually sits at `bottom: 0.85rem` and its height is content-driven,
 * so the guess was wrong at every UI scale and the readout overlapped the deck.
 *
 * A layout assertion needs a real CSS layout engine, which the `node` test environment
 * does not have (and jsdom does not implement either). What is checkable here — and what
 * actually prevents the regression from returning — is the structural contract: the
 * element is a descendant of the deck and is anchored to the deck's own box. Pixel
 * verification at multiple UI scales is performed in the browser QA procedure.
 */
describe('§1 Aegis HUD is structurally anchored to the command deck', () => {
  /** The declaration block for a single selector. */
  function ruleBody(selector: string): string {
    const at = cssSource.indexOf(`${selector} {`);
    expect(at, `missing CSS rule for ${selector}`).toBeGreaterThan(-1);
    return cssSource.slice(at, cssSource.indexOf('}', at));
  }

  it('renders the Aegis readout inside the command deck, not as a sibling', () => {
    const commandAt = hudSource.indexOf('<div class="sv-command">');
    const aegisAt = hudSource.indexOf('id="sv-aegis-float"');
    expect(commandAt).toBeGreaterThan(-1);
    expect(aegisAt).toBeGreaterThan(-1);
    // Inside the deck's element, so `bottom: 100%` resolves against the deck's box.
    expect(aegisAt).toBeGreaterThan(commandAt);

    // ...and specifically before the deck closes: count tag depth from the deck open.
    const between = hudSource.slice(commandAt, aegisAt);
    const opens = (between.match(/<div\b/g) ?? []).length;
    const closes = (between.match(/<\/div>/g) ?? []).length;
    expect(opens - closes).toBeGreaterThanOrEqual(1);
  });

  it('anchors to the deck top edge with bottom: calc(100% + gap)', () => {
    const body = ruleBody('.survivor-hud .sv-aegis-float');
    expect(body).toMatch(/bottom:\s*calc\(100%\s*\+\s*var\(--sv-aegis-gap\)\)/);
    expect(/--sv-aegis-gap:\s*[\d.]+rem/.test(ruleBody('.survivor-hud .sv-command'))).toBe(true);
  });

  it('never reintroduces a hard-coded offset guess at the deck height', () => {
    const body = ruleBody('.survivor-hud .sv-aegis-float');
    // The exact 2.6.1 bug shape: a rem offset multiplied by the UI scale.
    expect(body).not.toMatch(/bottom:\s*calc\([\d.]+rem\s*\*\s*var\(--ui-scale/);
    expect(body).not.toMatch(/bottom:\s*[\d.]+rem/);
  });

  it('stays out of flow so it cannot resize or reflow the command HUD', () => {
    expect(ruleBody('.survivor-hud .sv-aegis-float')).toMatch(/position:\s*absolute/);
  });

  it('does not apply a second UI scale on top of the deck transform', () => {
    // It is a descendant of the scaled deck; scaling again would double-apply.
    const body = ruleBody('.survivor-hud .sv-aegis-float');
    expect(body).not.toMatch(/scale\(var\(--ui-scale/);
    expect(body).toMatch(/transform:\s*translateX\(-50%\)\s*;/);
  });

  it('is bounded by the deck width rather than the raw viewport', () => {
    const body = ruleBody('.survivor-hud .sv-aegis-float');
    expect(body).toMatch(/width:\s*min\([\d.]+rem,\s*100%\)/);
    expect(body).not.toMatch(/100vw/);
  });
});

/**
 * §3 Ship survivability and boss ramming.
 *
 * These assert the *mitigation pipeline* and the *contact bounding*, both measured by
 * running production damage paths, rather than reading the constants back out.
 */
describe('§3 ship form mitigation is earned, and rams bosses', () => {
  /*
   * endless-2.8.0 moved ship survivability behind a passive.
   *
   * The 2.7.0 contract asserted a flat 80% reduction on every activation from the first
   * second of the run. The *pipeline* those tests were really protecting — form applied
   * first, boss reduction second, multiplicatively, never re-ordered — is unchanged and
   * still asserted here. What changed is where the form's number comes from: 50%
   * baseline, rising to the same 75% ceiling only with five levels of Reinforced
   * Airframe. See `shipDamageTakenMul`.
   */
  it('applies the 50% baseline reduction to ordinary horde contact', () => {
    const raw = 40;
    expect(appliedDamage('ship', raw, HORDE_HIT)).toBeCloseTo(raw * 0.5, 6);
  });

  it('applies the same reduction to boss physical attacks, before Breach Shielding', () => {
    const raw = 100;
    // No Breach Shielding invested: ship mitigation alone.
    expect(appliedDamage('ship', raw, BOSS_HIT)).toBeCloseTo(raw * 0.5, 6);
  });

  it('reaches the 75% ceiling only with a fully invested Reinforced Airframe', () => {
    const state = createSurvivorState('bee', null, 2709);
    state.player.form = 'ship';
    state.player.invuln = 0;
    state.player.shieldPoints = 0;
    state.player.shieldTime = 0;
    state.passives['reinforced-airframe'] = 5;
    const before = state.player.health;
    damagePlayer(state, 100, HORDE_HIT);
    expect(before - state.player.health).toBeCloseTo(100 * SHIP_MITIGATION_FLOOR, 6);
    // The ceiling is hard: further levels cannot approach invulnerability.
    expect(shipDamageTakenMul(99)).toBe(SHIP_MITIGATION_FLOOR);
    expect(shipDamageTakenMul(99)).toBeGreaterThan(0);
  });

  it('improves monotonically with each invested level', () => {
    let prev = Infinity;
    for (let lv = 0; lv <= 5; lv += 1) {
      const mul = shipDamageTakenMul(lv);
      expect(mul, `L${lv}`).toBeLessThan(prev);
      prev = mul;
    }
    expect(shipDamageTakenMul(0)).toBeCloseTo(0.5, 6);
    expect(shipDamageTakenMul(5)).toBeCloseTo(0.25, 6);
  });

  it('stacks multiplicatively with Breach Shielding in the established order', () => {
    const state = createSurvivorState('bee', null, 2702);
    state.player.form = 'ship';
    state.player.invuln = 0;
    state.player.shieldPoints = 0;
    state.player.shieldTime = 0;
    state.passives['breach-shielding'] = 5; // 40% boss reduction
    const before = state.player.health;
    damagePlayer(state, 100, BOSS_HIT);
    const applied = before - state.player.health;
    // form (0.50) then boss reduction (1 - 0.40) — not additive, not re-ordered.
    expect(applied).toBeCloseTo(100 * 0.5 * 0.6, 6);
  });

  it('is strictly safer than Mech, which is strictly safer than astronaut', () => {
    const raw = 100;
    const astro = appliedDamage('astronaut', raw, HORDE_HIT);
    const mech = appliedDamage('mech', raw, HORDE_HIT);
    const ship = appliedDamage('ship', raw, HORDE_HIT);
    expect(astro).toBeGreaterThan(mech);
    expect(mech).toBeGreaterThan(ship);
    expect(ship).toBeGreaterThan(0); // ship is not invulnerable
  });

  it('the reference killing sequence is now survivable', () => {
    // The 21:18 run died to a 103-damage Mega Body Slam plus Bruiser contact.
    const state = createSurvivorState('bee', null, 2703);
    state.player.form = 'ship';
    state.player.invuln = 0;
    state.player.shieldPoints = 0;
    state.player.shieldTime = 0;
    state.player.health = 100;
    damagePlayer(state, 103, BOSS_HIT);
    state.player.invuln = 0;
    damagePlayer(state, 40, HORDE_HIT);
    expect(state.player.alive).toBe(true);
    expect(state.player.health).toBeGreaterThan(0);
  });

  it('rams a boss for thruster-scaled damage under an explicit telemetry source', () => {
    const state = createSurvivorState('bee', null, 2704);
    state.player.form = 'ship';
    const boss = bossOnPlayer(state);
    state.bosses = [boss];
    const before = boss.health;

    applyShipBossRam(state);

    const dealt = before - boss.health;
    expect(dealt).toBeCloseTo(SURVIVOR.ship.ramBossDamage * thrusterPower(state), 5);
    const bucket = state.telemetry.bySource.get('ship-ram');
    expect(bucket).toBeDefined();
    expect(bucket!.bossDamage).toBeCloseTo(dealt, 5);
    expect(bucket!.hits).toBe(1);
    expect(bucket!.maxHit).toBeCloseTo(dealt, 5);
  });

  it('emits a dedicated heavy damage number for the ram', () => {
    const state = createSurvivorState('bee', null, 2705);
    state.player.form = 'ship';
    state.bosses = [bossOnPlayer(state)];
    applyShipBossRam(state);
    const keys = [...state.damageAgg.values()];
    expect(keys.some((d) => d.kind === 'large')).toBe(true);
  });

  it('produces exactly one impact per boss per internal cooldown, not one per frame', () => {
    const state = createSurvivorState('bee', null, 2706);
    state.player.form = 'ship';
    const boss = bossOnPlayer(state);
    state.bosses = [boss];

    // 60 overlapping frames with no time advanced: the cooldown must gate all but one.
    for (let i = 0; i < 60; i += 1) applyShipBossRam(state);
    expect(state.telemetry.bySource.get('ship-ram')!.hits).toBe(1);

    // Expire the internal cooldown exactly once and confirm a second impact lands.
    boss.shipRamCd = 0;
    applyShipBossRam(state);
    expect(state.telemetry.bySource.get('ship-ram')!.hits).toBe(2);
  });

  it('credits each overlapped boss separately with its own cooldown', () => {
    const state = createSurvivorState('bee', null, 2707);
    state.player.form = 'ship';
    const a = bossOnPlayer(state, 9201);
    const b = bossOnPlayer(state, 9202);
    state.bosses = [a, b];

    applyShipBossRam(state);
    expect(state.telemetry.bySource.get('ship-ram')!.hits).toBe(2);
    expect(a.shipRamCd).toBeGreaterThan(0);
    expect(b.shipRamCd).toBeGreaterThan(0);
    expect(a.health).toBeLessThan(a.maxHealth);
    expect(b.health).toBeLessThan(b.maxHealth);
  });

  it('never rams outside ship form', () => {
    for (const form of ['astronaut', 'mech'] as const) {
      const state = createSurvivorState('bee', null, 2708);
      state.player.form = form;
      const boss = bossOnPlayer(state);
      state.bosses = [boss];
      applyShipBossRam(state);
      expect(boss.health).toBe(boss.maxHealth);
      expect(state.telemetry.bySource.has('ship-ram')).toBe(false);
    }
  });

  it('does not displace the boss or the player, preserving pass-through', () => {
    const state = createSurvivorState('bee', null, 2709);
    state.player.form = 'ship';
    const boss = bossOnPlayer(state);
    state.bosses = [boss];
    const b0 = { x: boss.x, z: boss.z };
    const p0 = { x: state.player.x, z: state.player.z };

    applyShipBossRam(state);
    applyBossBodyContact(state);

    expect(boss.x).toBe(b0.x);
    expect(boss.z).toBe(b0.z);
    expect(state.player.x).toBe(p0.x);
    expect(state.player.z).toBe(p0.z);
  });

  it('does not consume the incoming boss-contact throttle', () => {
    const state = createSurvivorState('bee', null, 2710);
    state.player.form = 'ship';
    state.player.bossContactCd = 0;
    state.bosses = [bossOnPlayer(state)];
    applyShipBossRam(state);
    // Outgoing ram must not spend the player's incoming-damage cooldown.
    expect(state.player.bossContactCd).toBe(0);
  });

  it('still rams while the player is invulnerable', () => {
    const state = createSurvivorState('bee', null, 2711);
    state.player.form = 'ship';
    state.player.invuln = 5;
    const boss = bossOnPlayer(state);
    state.bosses = [boss];
    applyShipBossRam(state);
    expect(boss.health).toBeLessThan(boss.maxHealth);
  });

  it('does not inflate Ship Wake or Ship Exhaust', () => {
    expect(SURVIVOR.ship.wakeDamage).toBe(28);
    expect(SURVIVOR.ship.exhaustDamage).toBe(42);
    expect(SURVIVOR.ship.bodyDamage).toBe(18);
  });
});

/**
 * §4 Overdrive Systems — the single consolidated Mech passive.
 *
 * Core Cycling and Reactor Hold were each too small to be worth a card slot, so the
 * Mech ultimate was effectively un-upgradable in practice. One passive now moves
 * duration, cooldown and Mech-only movement together.
 */
describe('§4 Overdrive Systems replaces Core Cycling and Reactor Hold', () => {
  it('exposes exactly one Mech passive, capped at L5', () => {
    const mechPassives = PASSIVES.filter((p) => /mech|overdrive/i.test(`${p.id} ${p.name}`));
    expect(mechPassives.map((p) => p.id)).toEqual(['overdrive-systems']);
    expect(mechPassives[0]!.name).toBe('Overdrive Systems');
    expect(mechPassives[0]!.maxLevel).toBe(5);
  });

  it('removes the old passives from all reachable content', () => {
    const ids = PASSIVES.map((p) => p.id as string);
    expect(ids).not.toContain('mech-cycle');
    expect(ids).not.toContain('mech-duration');
    const names = PASSIVES.map((p) => p.name);
    expect(names).not.toContain('Core Cycling');
    expect(names).not.toContain('Reactor Hold');
  });

  it.each([
    [0, 6.0, 30.0, 0],
    [1, 6.2, 29.6, 3],
    [2, 6.4, 29.2, 6],
    [3, 6.6, 28.8, 9],
    [4, 6.8, 28.4, 12],
    [5, 7.0, 28.0, 15],
  ])('level %i authors %ss duration, %ss cooldown, +%i%% Mech speed', (lv, dur, cd, pct) => {
    const state = createSurvivorState('bee', null, 2740);
    state.passives['overdrive-systems'] = lv;
    // Measured through the live build accessors the simulation actually calls.
    expect(mechDurationFor(state)).toBeCloseTo(dur, 6);
    expect(mechCooldownFor(state)).toBeCloseTo(cd, 6);
    expect(mechSpeedBonusAtLevel(lv) * 100).toBeCloseTo(pct, 6);
  });

  it('level 0 agrees with the SURVIVOR.mech baseline', () => {
    expect(mechDurationAtLevel(0)).toBeCloseTo(SURVIVOR.mech.duration, 6);
    expect(mechCooldownAtLevel(0)).toBeCloseTo(SURVIVOR.mech.cooldown, 6);
  });

  it('reaches exactly 25% scheduled uptime at L5', () => {
    expect(mechUptimeFractionAtLevel(5)).toBe(0.25);
    expect(maxMechUptimeFraction()).toBe(0.25);
  });

  it('hard-caps beyond L5 instead of extrapolating', () => {
    expect(mechDurationAtLevel(99)).toBe(mechDurationAtLevel(5));
    expect(mechCooldownAtLevel(99)).toBe(mechCooldownAtLevel(5));
    expect(mechSpeedBonusAtLevel(99)).toBe(mechSpeedBonusAtLevel(5));
  });

  it('improves monotonically on all three properties', () => {
    for (let lv = 1; lv <= 5; lv += 1) {
      expect(mechDurationAtLevel(lv)).toBeGreaterThan(mechDurationAtLevel(lv - 1));
      expect(mechCooldownAtLevel(lv)).toBeLessThan(mechCooldownAtLevel(lv - 1));
      expect(mechSpeedBonusAtLevel(lv)).toBeGreaterThan(mechSpeedBonusAtLevel(lv - 1));
      expect(mechUptimeFractionAtLevel(lv)).toBeGreaterThan(mechUptimeFractionAtLevel(lv - 1));
    }
  });

  /**
   * Movement is measured by actually stepping the simulation and comparing distance
   * travelled, so this fails if the multiplier is applied in the wrong place or the
   * former flat 0.92 Mech drag returns — not merely if a constant changes.
   */
  function distanceInOneSecond(form: 'astronaut' | 'mech', thruster: number, overdrive: number): number {
    const state = createSurvivorState('bee', null, 2741);
    state.passives['move-speed'] = thruster;
    state.passives['overdrive-systems'] = overdrive;
    state.nextBossTime = 1e9;
    state.nextCacheTime = 1e9;
    if (form === 'mech') {
      // Enter Mech through the production activation path, not by assigning the field —
      // the form is owned by the transformation state machine and reverts otherwise.
      state.player.mechCd = 0;
      expect(tryMech(state)).toBe(true);
      expect(state.player.form).toBe('mech');
    }
    const x0 = state.player.x;
    const z0 = state.player.z;
    const input = { ...EMPTY_SURVIVOR_INPUT, moveX: 0, moveY: -1 };
    // 0.5s: comfortably inside even the shortest (6.0s) Mech window.
    for (let i = 0; i < 30; i += 1) stepSurvivor(state, input, 1 / 60);
    expect(state.player.form).toBe(form);
    return Math.hypot(state.player.x - x0, state.player.z - z0);
  }

  it('applies the Mech bonus multiplicatively after Thruster Boost', () => {
    const base = distanceInOneSecond('astronaut', 0, 0);
    const maxed = distanceInOneSecond('mech', 5, 5);
    // 1.30 (Thruster) x 1.15 (Overdrive) = 1.495
    expect(maxed / base).toBeCloseTo(1.495, 3);
  });

  it('leaves an uninvested Mech at plain astronaut speed', () => {
    const astro = distanceInOneSecond('astronaut', 0, 0);
    const mech = distanceInOneSecond('mech', 0, 0);
    expect(mech / astro).toBeCloseTo(1.0, 3);
  });

  it('keeps the Mech bonus out of astronaut form', () => {
    expect(distanceInOneSecond('astronaut', 0, 5)).toBeCloseTo(distanceInOneSecond('astronaut', 0, 0), 5);
  });

  it('presents duration, cooldown, uptime and speed as before → after on one card', () => {
    const card = passiveCard('overdrive-systems', 2, 100);
    const text = [card.summary, ...card.stats].join(' | ');
    expect(text).toMatch(/Mech duration 6\.4s → 6\.6s/);
    expect(text).toMatch(/Mech cooldown 29\.2s → 28\.8s/);
    expect(text).toMatch(/Mech uptime .*% → .*%/);
    expect(text).toMatch(/Mech speed \+6% → \+9%/);
  });

  it('explains activation-to-activation cooldown and shows the exact L5 caps', () => {
    const card = passiveCard('overdrive-systems', 0, 100);
    const text = [card.summary, ...card.stats].join(' | ');
    expect(text).toMatch(/activation-to-activation/i);
    expect(text).toMatch(/during Mech/i);
    expect(text).toMatch(/Hard cap at L5: 7s \/ 28s · 25% uptime · \+15% speed/);
  });
});

/**
 * §6 Orbital Lance two-zone strike.
 *
 * 2.6.1 Orbital hit hard (304 max hit) but covered almost nothing — 2.6% of a 21:18
 * run. 2.7.0 keeps the heavy identity and buys reach instead: a wider core plus a
 * shockwave ring at a fraction of the damage.
 */
describe('§6 Orbital Lance strikes two zones', () => {
  const LANCE = WEAPONS.orbital.levels;

  /**
   * Fire one lance into a row of stationary dummies.
   *
   * The lance chooses its own aim point, so the zones are measured against the impact
   * centre the simulation actually produced (captured from the `orbital-strike`
   * effect) rather than an assumed origin. That makes this a test of the two-zone
   * *rule*, independent of targeting.
   */
  function strikeRow(level: number): Array<{ dist: number; dealt: number }> {
    const state = createSurvivorState('bee', null, 2760);
    state.time = 900;
    state.nextBossTime = 1e9;
    state.nextCacheTime = 1e9;
    state.weapons = [{ weaponId: 'orbital', level, cooldown: 0, focusDebt: 0, prototype: true }];
    state.player.x = 0;
    state.player.z = 0;

    const dummies: ReturnType<typeof emptyEnemy>[] = [];
    for (let i = 0; i < 24; i += 1) {
      const e = emptyEnemy();
      e.id = 7000 + i;
      e.defId = 'basic';
      e.role = 'fodder';
      e.alive = true;
      // Spread along +X well outside the shockwave of each other's centre.
      e.x = 6 + i * 0.75;
      e.z = 0;
      e.radius = 0;
      e.maxHealth = 1e9;
      e.health = e.maxHealth;
      e.contactDamage = 0;
      e.speedMul = 0; // stationary, so the lead point equals the body position
      dummies.push(e);
    }
    // Copy: the simulation pushes freshly spawned enemies into `state.enemies`, so
    // handing it the same array object would grow `dummies` underneath the assertions.
    state.enemies = dummies.slice();

    const before = dummies.map((e) => e.health);
    let cx: number | null = null;
    let cz = 0;
    for (let i = 0; i < 400; i += 1) {
      stepSurvivor(state, EMPTY_SURVIVOR_INPUT, 1 / 60);
      if (cx === null) {
        const hit = state.effects.find((e) => e.kind === 'orbital-strike');
        if (hit) {
          cx = hit.x;
          cz = hit.z;
          break;
        }
      }
    }
    expect(cx, 'lance never detonated').not.toBeNull();
    return dummies.map((e, i) => ({
      dist: Math.hypot(e.x - cx!, e.z - cz),
      dealt: before[i]! - e.health,
    }));
  }

  it.each([
    [1, 3.2],
    [2, 3.45],
    [3, 3.7],
    [4, 3.95],
    [5, 4.25],
  ])('authors a %i-level core radius of %s', (level, radius) => {
    expect(LANCE[level - 1]!.radius).toBeCloseTo(radius, 6);
  });

  it('grows the core radius monotonically across L1→L5', () => {
    for (let i = 1; i < LANCE.length; i += 1) {
      expect(LANCE[i]!.radius!).toBeGreaterThan(LANCE[i - 1]!.radius!);
    }
  });

  it('derives the shockwave at ~1.6x the core radius', () => {
    expect(SURVIVOR.orbital.shockwaveRadiusMul).toBeCloseTo(1.6, 6);
  });

  it('deals 35-40% of central damage in the shockwave', () => {
    expect(SURVIVOR.orbital.shockwaveDamageMul).toBeGreaterThanOrEqual(0.35);
    expect(SURVIVOR.orbital.shockwaveDamageMul).toBeLessThanOrEqual(0.4);
  });

  it('damages the core at full strength and the ring at the reduced rate', () => {
    const core = LANCE[0]!.radius!;
    const shock = core * SURVIVOR.orbital.shockwaveRadiusMul;
    const rows = strikeRow(1);

    const inCore = rows.filter((r) => r.dist < core - 0.05);
    const inRing = rows.filter((r) => r.dist > core + 0.05 && r.dist < shock - 0.05);
    const outside = rows.filter((r) => r.dist > shock + 0.05);

    expect(inCore.length, 'no dummy landed in the core').toBeGreaterThan(0);
    expect(inRing.length, 'no dummy landed in the ring').toBeGreaterThan(0);
    expect(outside.length, 'no dummy landed outside').toBeGreaterThan(0);

    const full = inCore[0]!.dealt;
    expect(full).toBeGreaterThan(0);
    for (const r of inCore) expect(r.dealt).toBeCloseTo(full, 5);
    // The ring is a genuine fraction of the core, not a second full-damage zone.
    for (const r of inRing) {
      expect(r.dealt / full).toBeCloseTo(SURVIVOR.orbital.shockwaveDamageMul, 5);
    }
    for (const r of outside) expect(r.dealt).toBe(0);
  });

  it('damages each target exactly once, never core plus shockwave', () => {
    const rows = strikeRow(1);
    const full = LANCE[0]!.damage;
    const struck = rows.filter((r) => r.dealt > 0);
    expect(struck.length).toBeGreaterThan(0);
    for (const r of struck) {
      // Either exactly the core value or exactly the ring value — never their sum.
      const isCore = Math.abs(r.dealt - full) < 1e-6;
      const isRing = Math.abs(r.dealt - full * SURVIVOR.orbital.shockwaveDamageMul) < 1e-6;
      expect(isCore || isRing, `unexpected ${r.dealt} at ${r.dist}`).toBe(true);
      expect(r.dealt).toBeLessThanOrEqual(full + 1e-6);
    }
  });

  it('covers strictly more ground than the 2.6.1 radii it replaced', () => {
    // 2.6.1 authored 2.1 -> 2.6. Every level must now reach further than the old L5.
    expect(LANCE[0]!.radius!).toBeGreaterThan(2.6);
  });

  it('keeps a distinct friendly telegraph colour from hostile boss patterns', () => {
    expect(WEAPONS.orbital.color).toBe('#ffd46a');
  });
});

/**
 * §7 Source × form telemetry.
 *
 * The 2.6.1 report could not answer "how much of Plasma Wake happened in ship form?"
 * because By Source and By Form were disjoint views. The cross-tab is the joint
 * distribution, and its whole value depends on reconciling exactly with both margins.
 */
describe('§7 source-by-form telemetry reconciles with both existing views', () => {
  /** A real run long enough to exercise every form and several sources. */
  function playedRun(seed: number, seconds: number): SurvivorState {
    const state = createSurvivorState('bee', null, seed);
    let shipAt = 6;
    let mechAt = 32;
    for (let i = 0; i < Math.round(seconds * 60); i += 1) {
      const t = state.time;
      // Use both transformations repeatedly so all three forms accumulate damage.
      if (t >= shipAt && state.player.form === 'astronaut') {
        state.player.shipCd = 0;
        if (tryShip(state)) shipAt = t + 14;
      }
      if (t >= mechAt && state.player.form === 'astronaut') {
        state.player.mechCd = 0;
        if (tryMech(state)) mechAt = t + 26;
      }
      const input = { ...EMPTY_SURVIVOR_INPUT, moveX: Math.sin(t * 1.7), moveY: Math.cos(t * 1.3) };
      stepSurvivor(state, input, 1 / 60);
      if (state.phase === 'levelup' || state.phase === 'protocol') {
        stepSurvivor(state, { ...EMPTY_SURVIVOR_INPUT, choiceIndex: 0 }, 1 / 60);
      }
      if (!state.player.alive) break;
    }
    return state;
  }

  const state = playedRun(2770, 150);
  const t = state.telemetry;

  it('records a non-trivial run across multiple sources and forms', () => {
    expect(t.bySource.size).toBeGreaterThan(1);
    expect(t.bySourceForm.size).toBeGreaterThan(1);
    expect(totalOutgoing(t)).toBeGreaterThan(0);
    const formsUsed = new Set([...t.bySourceForm.values()].map((c) => c.form));
    expect(formsUsed.size).toBeGreaterThan(1);
  });

  it('sums to each By Source row exactly', () => {
    for (const [id, s] of t.bySource) {
      const cells = sourceFormRows(t, id);
      const sum = (pick: (c: (typeof cells)[number]) => number) =>
        cells.reduce((n, c) => n + pick(c), 0);
      expect(sum((c) => c.damage), `${id} damage`).toBeCloseTo(s.damage, 6);
      expect(sum((c) => c.bossDamage), `${id} boss damage`).toBeCloseTo(s.bossDamage, 6);
      expect(sum((c) => c.hits), `${id} hits`).toBe(s.hits);
      expect(sum((c) => c.kills), `${id} kills`).toBe(s.kills);
      // Max hit is a max, not a sum.
      expect(Math.max(0, ...cells.map((c) => c.maxHit)), `${id} max hit`).toBeCloseTo(s.maxHit, 6);
    }
  });

  it('sums to each By Form row exactly', () => {
    for (const form of ['astronaut', 'mech', 'ship'] as const) {
      const sum = [...t.bySourceForm.values()]
        .filter((c) => c.form === form)
        .reduce((n, c) => n + c.damage, 0);
      expect(sum, `${form} damage`).toBeCloseTo(t.byForm[form].damage, 6);
    }
  });

  it('reconciles the whole cross-tab with the grand total', () => {
    const grand = sourceFormReport(t).reduce((n, c) => n + c.damage, 0);
    expect(grand).toBeCloseTo(totalOutgoing(t), 6);
    const formTotal = formReport(t).reduce((n, r) => n + r.damage, 0);
    expect(grand).toBeCloseTo(formTotal, 6);
  });

  it('keeps the existing By Source and By Form views correct', () => {
    const bySourceTotal = sourceReport(t).reduce((n, r) => n + r.damage, 0);
    expect(bySourceTotal).toBeCloseTo(totalOutgoing(t), 6);
    const shares = sourceReport(t).reduce((n, r) => n + r.share, 0);
    expect(shares).toBeCloseTo(1, 5);
  });

  it('stays bounded: at most one cell per source per form', () => {
    expect(t.bySourceForm.size).toBeLessThanOrEqual(t.bySource.size * 3);
  });

  it('excludes overkill, exactly as the source view does', () => {
    // Every cross-tab cell is fed by the same clamped `applied` value.
    for (const c of t.bySourceForm.values()) {
      expect(c.damage).toBeGreaterThanOrEqual(0);
      expect(c.maxHit).toBeLessThanOrEqual(c.damage + 1e-9);
    }
  });

  it('attributes Plasma Wake ship-form damage to the ship row', () => {
    const s = createSurvivorState('bee', null, 2771);
    s.weapons = [{ weaponId: 'plasma-wake', level: 3, cooldown: 0, focusDebt: 0, prototype: false }];
    s.nextBossTime = 1e9;
    s.nextCacheTime = 1e9;
    s.player.x = -20;
    s.player.z = 0;
    // Stationary field spanning the ship's flight path, so the trail it lays down
    // behind itself lands on bodies rather than on empty floor.
    const field: ReturnType<typeof emptyEnemy>[] = [];
    for (let i = 0; i < 60; i += 1) {
      const e = emptyEnemy();
      e.id = 7600 + i;
      e.defId = 'basic';
      e.role = 'fodder';
      e.alive = true;
      e.x = -18 + (i % 20) * 1.8;
      e.z = (Math.floor(i / 20) - 1) * 1.1;
      e.radius = 0.45;
      e.maxHealth = 1e9;
      e.health = e.maxHealth;
      e.contactDamage = 0;
      e.speedMul = 0;
      field.push(e);
    }
    s.enemies = field.slice();
    s.player.shipCd = 0;
    expect(tryShip(s)).toBe(true);
    for (let i = 0; i < 140; i += 1) {
      stepSurvivor(s, { ...EMPTY_SURVIVOR_INPUT, moveX: 1, moveY: 0 }, 1 / 60);
    }
    const rows = sourceFormRows(s.telemetry, 'weapon:plasma-wake');
    const ship = rows.find((r) => r.form === 'ship');
    expect(ship, 'Plasma Wake recorded no ship-form damage').toBeDefined();
    expect(ship!.damage).toBeGreaterThan(0);
  });

  it('attributes the ship boss ram to the ship row only', () => {
    const s = createSurvivorState('bee', null, 2772);
    s.player.form = 'ship';
    s.bosses = [bossOnPlayer(s)];
    applyShipBossRam(s);
    const rows = sourceFormRows(s.telemetry, 'ship-ram');
    expect(rows).toHaveLength(1);
    expect(rows[0]!.form).toBe('ship');
    expect(rows[0]!.shareOfSource).toBeCloseTo(1, 6);
  });
});

/**
 * §2 Plasma Wake trail.
 *
 * 2.6.1 emitted an independent wide/thin ellipse per cadence tick. At astronaut speed
 * the player covered ~2.2 units between emissions while one ellipse reached only ~1.1
 * units forward, so the weapon read and collided as a row of disconnected discs — and
 * at L1 each disc expired after 1.8s. 2.7.0 emits connected capsule segments.
 */
describe('§2 Plasma Wake lays a continuous burning trail', () => {
  /** Drive a run in one direction and collect the live trail segments. */
  function layTrail(opts: {
    level: number;
    form?: 'astronaut' | 'ship' | 'mech';
    seconds?: number;
    seed?: number;
  }): { state: SurvivorState; segs: SurvivorState['hazards'] } {
    const state = createSurvivorState('bee', null, opts.seed ?? 2720);
    state.weapons = [
      { weaponId: 'plasma-wake', level: opts.level, cooldown: 0, focusDebt: 0, prototype: false },
    ];
    state.enemyCap = 0;
    state.spawnAcc = -1e9;
    state.nextBossTime = 1e9;
    state.nextCacheTime = 1e9;
    state.player.invuln = 1e9;
    state.player.x = -25;
    state.player.z = 0;
    if (opts.form === 'ship') {
      state.player.shipCd = 0;
      expect(tryShip(state)).toBe(true);
    } else if (opts.form === 'mech') {
      state.player.mechCd = 0;
      expect(tryMech(state)).toBe(true);
    }
    const frames = Math.round((opts.seconds ?? 2) * 60);
    for (let i = 0; i < frames; i += 1) {
      stepSurvivor(state, { ...EMPTY_SURVIVOR_INPUT, moveX: 1, moveY: 0 }, 1 / 60);
    }
    return { state, segs: state.hazards.filter((h) => h.active && h.kind === 'plasma-wake') };
  }

  it('emits capsule segments, never point footprints', () => {
    const { segs } = layTrail({ level: 1 });
    expect(segs.length).toBeGreaterThan(0);
    for (const s of segs) {
      expect(s.capsule).toBe(true);
      expect(Math.hypot(s.x1 - s.x, s.z1 - s.z)).toBeGreaterThan(0);
    }
  });

  it('chains every segment end-to-start so the trail cannot have gaps', () => {
    for (const form of ['astronaut', 'mech', 'ship'] as const) {
      const { segs } = layTrail({ level: 1, form, seconds: 3 });
      expect(segs.length, `${form} produced no trail`).toBeGreaterThan(1);
      // Order by position along +X, then require each end to meet the next start.
      const ordered = [...segs].sort((a, b) => Math.min(a.x, a.x1) - Math.min(b.x, b.x1));
      for (let i = 1; i < ordered.length; i += 1) {
        const prev = ordered[i - 1]!;
        const cur = ordered[i]!;
        const gap = Math.hypot(cur.x - prev.x1, cur.z - prev.z1);
        expect(gap, `${form} gap between segments`).toBeLessThan(1e-6);
      }
    }
  });

  it('stays continuous at ship speed, which is what broke the disc model', () => {
    const { segs } = layTrail({ level: 5, form: 'ship', seconds: 2.4 });
    expect(segs.length).toBeGreaterThan(1);
    const total = segs.reduce((n, s) => n + Math.hypot(s.x1 - s.x, s.z1 - s.z), 0);
    // Ship covers a lot of ground; the trail must actually span it.
    expect(total).toBeGreaterThan(10);
  });

  it('appears roughly half a second behind the player, not underneath', () => {
    const { state, segs } = layTrail({ level: 1, seconds: 2 });
    expect(segs.length).toBeGreaterThan(0);
    // Newest segment end is the trail head; it must lag the hero along travel.
    const head = segs.reduce((best, s) => (s.x1 > best ? s.x1 : best), -Infinity);
    const lag = state.player.x - head;
    expect(lag).toBeGreaterThan(0);
    // ~0.5s at the current speed, with slack for the emission quantum.
    const speed = SURVIVOR.playerSpeed;
    expect(lag).toBeGreaterThan(speed * SURVIVOR.plasmaTrail.delay * 0.5);
    expect(lag).toBeLessThan(speed * SURVIVOR.plasmaTrail.delay * 2.5);
  });

  it.each([
    [1, 3.6],
    [2, 3.8],
    [3, 4.0],
    [4, 4.2],
    [5, 4.5],
  ])('authors a %i-level lifetime of %ss', (level, life) => {
    expect(WEAPONS['plasma-wake'].levels[level - 1]!.life).toBeCloseTo(life, 6);
    const { segs } = layTrail({ level });
    for (const s of segs) expect(s.maxLife).toBeCloseTo(life, 6);
  });

  it('persists substantially longer than the 2.6.1 lifetimes it replaced', () => {
    // 2.6.1 authored 1.8 -> 2.7; every level must now outlast the old maximum.
    for (const lv of WEAPONS['plasma-wake'].levels) expect(lv.life!).toBeGreaterThan(2.7);
  });

  it('derives collision from the same capsule the renderer draws', () => {
    const { state, segs } = layTrail({ level: 1, seconds: 2 });
    const seg = segs[0]!;
    // A point on the segment's spine is damaging; a point well outside is not.
    const midX = (seg.x + seg.x1) / 2;
    const midZ = (seg.z + seg.z1) / 2;
    const probe = emptyEnemy();
    probe.id = 7900;
    probe.defId = 'basic';
    probe.role = 'fodder';
    probe.alive = true;
    probe.radius = 0;
    probe.maxHealth = 1e9;
    probe.health = probe.maxHealth;
    probe.contactDamage = 0;
    probe.speedMul = 0;
    probe.x = midX;
    probe.z = midZ;
    state.enemies = [probe];
    stepSurvivor(state, EMPTY_SURVIVOR_INPUT, 1 / 60);
    expect(probe.health).toBeLessThan(probe.maxHealth);

    // Now far outside the half-width, perpendicular to the segment.
    const far = emptyEnemy();
    Object.assign(far, probe, { id: 7901, x: midX, z: midZ + seg.radius * 4, health: 1e9 });
    far.hazardHitCd = 0;
    state.enemies = [far];
    const before = far.health;
    stepSurvivor(state, EMPTY_SURVIVOR_INPUT, 1 / 60);
    expect(far.health).toBe(before);
  });

  it('burns down to an ember tail instead of staying at full strength', () => {
    const cfg = SURVIVOR.plasmaTrail;
    expect(cfg.emberFloor).toBeGreaterThan(0);
    expect(cfg.emberFloor).toBeLessThan(1);
    expect(cfg.emberStart).toBeGreaterThan(0);
    expect(cfg.emberStart).toBeLessThan(1);
  });

  it('remains the only ordinary weapon active in ship form', () => {
    const state = createSurvivorState('bee', null, 2723);
    state.weapons = [
      { weaponId: 'plasma-wake', level: 3, cooldown: 0, focusDebt: 0, prototype: false },
      { weaponId: 'pulse', level: 3, cooldown: 0, focusDebt: 0, prototype: false },
    ];
    state.nextBossTime = 1e9;
    state.player.shipCd = 0;
    expect(tryShip(state)).toBe(true);
    for (let i = 0; i < 120; i += 1) {
      stepSurvivor(state, { ...EMPTY_SURVIVOR_INPUT, moveX: 1, moveY: 0 }, 1 / 60);
    }
    expect(state.hazards.some((h) => h.active && h.kind === 'plasma-wake')).toBe(true);
    expect(state.projectiles.some((p) => p.active && p.weaponId === 'pulse')).toBe(false);
  });

  it('is wider in ship form', () => {
    const astro = layTrail({ level: 3, seconds: 2 }).segs[0]!;
    const ship = layTrail({ level: 3, form: 'ship', seconds: 2 }).segs[0]!;
    expect(ship.radius).toBeGreaterThan(astro.radius);
  });

  it('still damages bosses', () => {
    const state = createSurvivorState('bee', null, 2724);
    state.weapons = [{ weaponId: 'plasma-wake', level: 3, cooldown: 0, focusDebt: 0, prototype: false }];
    state.nextBossTime = 1e9;
    state.player.invuln = 1e9;
    const boss = bossOnPlayer(state, 9401);
    boss.colliderRadius = 6;
    state.bosses = [boss];
    for (let i = 0; i < 300; i += 1) {
      const a = i / 20;
      stepSurvivor(state, { ...EMPTY_SURVIVOR_INPUT, moveX: Math.cos(a), moveY: Math.sin(a) }, 1 / 60);
    }
    expect(boss.health).toBeLessThan(boss.maxHealth);
    expect(state.telemetry.bySource.get('weapon:plasma-wake')!.bossDamage).toBeGreaterThan(0);
  });

  it('bounds the number of live segments and releases them on expiry', () => {
    const { state } = layTrail({ level: 5, form: 'ship', seconds: 2.4 });
    const peak = state.hazards.filter((h) => h.active && h.kind === 'plasma-wake').length;
    expect(peak).toBeGreaterThan(0);
    expect(peak).toBeLessThanOrEqual(SURVIVOR.hazardCap);
    // Stand still well past the longest lifetime: every segment must expire.
    for (let i = 0; i < 60 * 8; i += 1) stepSurvivor(state, EMPTY_SURVIVOR_INPUT, 1 / 60);
    expect(state.hazards.filter((h) => h.active && h.kind === 'plasma-wake')).toHaveLength(0);
  });

  it('keeps the pooled hazard array bounded across a long moving run', () => {
    const { state } = layTrail({ level: 5, form: 'ship', seconds: 2.4 });
    for (let i = 0; i < 60 * 60; i += 1) {
      stepSurvivor(state, { ...EMPTY_SURVIVOR_INPUT, moveX: Math.cos(i / 40), moveY: Math.sin(i / 40) }, 1 / 60);
    }
    expect(state.hazards.length).toBeLessThanOrEqual(SURVIVOR.hazardCap);
  });
});

/**
 * §5 Cleanup Crew.
 *
 * Starbreaker Array is deleted; the third Mega Protocol is now a three-hero allied
 * squad. Allies are bounded actors, not duplicate players.
 */
describe('§5 Cleanup Crew replaces Starbreaker Array', () => {
  function crewState(hero: Parameters<typeof createSurvivorState>[0], seed = 2750): SurvivorState {
    const state = createSurvivorState(hero, null, seed);
    state.enemyCap = 0;
    state.spawnAcc = -1e9;
    state.nextBossTime = 1e9;
    state.nextCacheTime = 1e9;
    state.player.invuln = 1e9;
    return state;
  }

  it('offers exactly three Mega Protocols, with Starbreaker gone', () => {
    const ids = MEGA_PROTOCOLS.map((p) => p.id);
    expect(ids).toEqual(['carrier-wing', 'cleanup-crew', 'singularity-engine']);
    expect(ids).not.toContain('starbreaker-array');
  });

  it.each([
    ['bee', ['flamingo', 'frog', 'red-panda']],
    ['flamingo', ['bee', 'frog', 'red-panda']],
    ['frog', ['bee', 'flamingo', 'red-panda']],
    ['red-panda', ['bee', 'flamingo', 'frog']],
  ] as const)('summons the three heroes %s is not using', (hero, expected) => {
    const state = crewState(hero);
    forceStartProtocol(state, 'cleanup-crew', 1);
    expect(state.allies.map((a) => a.heroId)).toEqual([...expected]);
    expect(state.allies).toHaveLength(3);
    expect(state.allies.some((a) => a.heroId === hero)).toBe(false);
  });

  it('gives each ally only that hero’s exclusive signature weapon', () => {
    const state = crewState('bee');
    forceStartProtocol(state, 'cleanup-crew', 1);
    for (const a of state.allies) {
      expect(a.slot.weaponId).toBe(heroStarterWeapon(a.heroId));
      expect(isSignatureWeapon(a.slot.weaponId)).toBe(true);
    }
    // All four signatures are distinct, so the squad covers three different mechanics.
    expect(new Set(state.allies.map((a) => a.slot.weaponId)).size).toBe(3);
  });

  it('lasts five active simulation minutes', () => {
    const state = crewState('bee');
    forceStartProtocol(state, 'cleanup-crew', 1);
    expect(state.megaProtocol.remaining).toBeCloseTo(SURVIVOR.megaProtocol.titanDuration, 3);
    expect(SURVIVOR.megaProtocol.titanDuration).toBe(300);
  });

  it('arrives in ships, then deploys as Mechs', () => {
    const state = crewState('bee');
    forceStartProtocol(state, 'cleanup-crew', 1);
    // Every ally starts in transit, away from the player.
    for (const a of state.allies) {
      expect(a.phase).toBe('arriving');
      expect(Math.hypot(a.x - state.player.x, a.z - state.player.z)).toBeGreaterThan(10);
    }
    const cfg = SURVIVOR.megaProtocol.cleanup;
    const arriveFrames = Math.ceil((cfg.arriveDuration + cfg.arriveStagger * 3 + 0.5) * 60);
    for (let i = 0; i < arriveFrames; i += 1) stepSurvivor(state, EMPTY_SURVIVOR_INPUT, 1 / 60);
    for (const a of state.allies) {
      expect(a.phase).toBe('active');
      // ...and has closed to a readable formation around the player.
      expect(Math.hypot(a.x - state.player.x, a.z - state.player.z)).toBeLessThan(
        cfg.formationRadius * 2,
      );
    }
  });

  it('holds a loose formation with the allies spread apart, not stacked', () => {
    const state = crewState('bee');
    forceStartProtocol(state, 'cleanup-crew', 1);
    for (let i = 0; i < 60 * 8; i += 1) {
      stepSurvivor(state, { ...EMPTY_SURVIVOR_INPUT, moveX: Math.cos(i / 90), moveY: 0.4 }, 1 / 60);
    }
    const [a, b, c] = state.allies;
    for (const [p, q] of [
      [a!, b!],
      [b!, c!],
      [a!, c!],
    ]) {
      expect(Math.hypot(p.x - q.x, p.z - q.z)).toBeGreaterThan(1.5);
    }
  });

  it('departs visibly instead of vanishing at expiry', () => {
    const state = crewState('bee');
    forceStartProtocol(state, 'cleanup-crew', 1);
    for (let i = 0; i < 60 * 6; i += 1) stepSurvivor(state, EMPTY_SURVIVOR_INPUT, 1 / 60);
    state.megaProtocol.remaining = 0;
    stepSurvivor(state, EMPTY_SURVIVOR_INPUT, 1 / 60);
    expect(state.allies.every((a) => a.phase === 'departing')).toBe(true);
    // Still present while the departure plays.
    expect(state.allies.length).toBe(3);
    for (let i = 0; i < 60 * 4; i += 1) stepSurvivor(state, EMPTY_SURVIVOR_INPUT, 1 / 60);
    expect(state.allies).toHaveLength(0);
    expect(state.megaProtocol.id).toBeNull();
  });

  it('deals damage under per-ally telemetry that rolls up to one Cleanup Crew total', () => {
    const state = crewState('bee', 2751);
    state.enemyCap = 160;
    forceStartProtocol(state, 'cleanup-crew', 1);
    for (let i = 0; i < 40; i += 1) {
      const e = emptyEnemy();
      e.id = 8100 + i;
      e.defId = 'basic';
      e.role = 'fodder';
      e.alive = true;
      e.x = Math.cos(i) * 6;
      e.z = Math.sin(i) * 6;
      e.radius = 0.45;
      e.maxHealth = 1e7;
      e.health = e.maxHealth;
      e.contactDamage = 0;
      e.speedMul = 0;
      state.enemies.push(e);
    }
    for (let i = 0; i < 60 * 20; i += 1) stepSurvivor(state, EMPTY_SURVIVOR_INPUT, 1 / 60);

    const rows = cleanupCrewRows(state.telemetry);
    expect(rows.length).toBe(3);
    for (const r of rows) expect(r.damage).toBeGreaterThan(0);
    const total = cleanupCrewTotal(state.telemetry)!;
    expect(total.damage).toBeCloseTo(rows.reduce((n, r) => n + r.damage, 0), 6);
    expect(total.hits).toBe(rows.reduce((n, r) => n + r.hits, 0));
    expect(total.kills).toBe(rows.reduce((n, r) => n + r.kills, 0));
    expect(total.maxHit).toBe(Math.max(...rows.map((r) => r.maxHit)));
  });

  it('labels the squad and each ally in the run report', () => {
    expect(sourceLabel('titan-cleanup', (id) => id)).toBe('Cleanup Crew');
    expect(sourceLabel('titan-cleanup:frog', (id) => id)).toBe('Cleanup Crew · Fortunato');
    expect(sourceLabel('titan-cleanup:flamingo', (id) => id)).toBe('Cleanup Crew · Fitzwilliam');
  });

  it('keeps allies invulnerable and non-colliding: they never displace anything', () => {
    const state = crewState('bee', 2752);
    forceStartProtocol(state, 'cleanup-crew', 1);
    for (let i = 0; i < 60 * 4; i += 1) stepSurvivor(state, EMPTY_SURVIVOR_INPUT, 1 / 60);

    // Park an enemy exactly on an ally and confirm neither is pushed.
    const ally = state.allies[0]!;
    const e = emptyEnemy();
    e.id = 8200;
    e.defId = 'basic';
    e.role = 'fodder';
    e.alive = true;
    e.x = ally.x;
    e.z = ally.z;
    e.radius = 0.45;
    e.maxHealth = 1e7;
    e.health = e.maxHealth;
    e.contactDamage = 0;
    e.speedMul = 0;
    state.enemies.push(e);
    const before = { ex: e.x, ez: e.z };
    stepSurvivor(state, EMPTY_SURVIVOR_INPUT, 1 / 60);
    // The enemy chases the player, so it may move — but never *away* from the player
    // because an ally shoved it.
    const toPlayer = Math.hypot(state.player.x - e.x, state.player.z - e.z);
    const toPlayerBefore = Math.hypot(state.player.x - before.ex, state.player.z - before.ez);
    expect(toPlayer).toBeLessThanOrEqual(toPlayerBefore + 1e-6);
    // Allies carry no health field at all — they cannot be damaged.
    expect((ally as unknown as Record<string, unknown>).health).toBeUndefined();
  });

  it('never touches the player’s Mech cooldown, form, passives or Build', () => {
    const state = crewState('bee', 2753);
    state.player.mechCd = 21;
    state.passives['overdrive-systems'] = 2;
    const weapons = state.weapons.map((w) => `${w.weaponId}:${w.level}`).join(',');
    const passives = JSON.stringify(state.passives);
    forceStartProtocol(state, 'cleanup-crew', 1);
    for (let i = 0; i < 60 * 5; i += 1) stepSurvivor(state, EMPTY_SURVIVOR_INPUT, 1 / 60);
    expect(state.player.form).toBe('astronaut');
    expect(state.weapons.map((w) => `${w.weaponId}:${w.level}`).join(',')).toBe(weapons);
    expect(JSON.stringify(state.passives)).toBe(passives);
    // Cooldown only advanced by wall clock, never reset or refunded by the protocol.
    expect(state.player.mechCd).toBeCloseTo(21 - 5, 1);
  });

  it('is torn down completely when another Titan replaces it', () => {
    const state = crewState('bee', 2754);
    forceStartProtocol(state, 'cleanup-crew', 1);
    expect(state.allies).toHaveLength(3);
    forceStartProtocol(state, 'carrier-wing', 1);
    expect(state.allies).toHaveLength(0);
    expect(state.megaProtocol.id).toBe('carrier-wing');
  });

  it('survives repeated activation and teardown without accumulating actors', () => {
    const state = crewState('bee', 2755);
    for (let cycle = 0; cycle < 6; cycle += 1) {
      forceStartProtocol(state, 'cleanup-crew', 1);
      expect(state.allies.length).toBe(3);
      for (let i = 0; i < 60 * 3; i += 1) stepSurvivor(state, EMPTY_SURVIVOR_INPUT, 1 / 60);
      state.megaProtocol.remaining = 0;
      for (let i = 0; i < 60 * 4; i += 1) stepSurvivor(state, EMPTY_SURVIVOR_INPUT, 1 / 60);
      expect(state.allies.length).toBe(0);
    }
  });
});

/**
 * §5b Comparative Titan Protocol benchmark.
 *
 * Judged on total player value across an identical seeded scenario, not on identical
 * damage numbers — Singularity's contribution is largely control, and Carrier Wing
 * converts boss max-health fractions.
 */
describe('§5b the three Titan Protocols are comparably valuable', () => {
  const rows = runTitanComparison(2);
  const summary = summariseTitanComparison(rows);
  const of = (id: string): (typeof summary)[number] => summary.find((s) => s.protocol === id)!;

  it('measures all three across the same seeds and window', () => {
    expect(summary).toHaveLength(3);
    for (const s of summary) expect(s.runs).toBe(2);
    for (const r of rows) expect(r.survivedSeconds).toBeGreaterThan(0);
  });

  it('keeps Cleanup Crew within a reasonable band of Carrier Wing on direct damage', () => {
    const crew = of('cleanup-crew').meanDirectDamage;
    const carrier = of('carrier-wing').meanDirectDamage;
    expect(crew).toBeGreaterThan(carrier * 0.7);
    expect(crew).toBeLessThan(carrier * 1.3);
  });

  it('gives Cleanup Crew real boss pressure', () => {
    expect(of('cleanup-crew').meanBossDamage).toBeGreaterThan(0);
  });

  it('gives every protocol meaningful horde clearing', () => {
    for (const s of summary) expect(s.meanProtocolKills).toBeGreaterThan(0);
  });

  it('leaves Carrier Wing and Singularity Engine mechanically unchanged', () => {
    // Their configuration is untouched by 2.7.0; these are the values 2.6.1 shipped.
    expect(SURVIVOR.megaProtocol.fleetPasses).toBe(3);
    expect(SURVIVOR.megaProtocol.fleetBossFraction).toBe(0.06);
    expect(SURVIVOR.megaProtocol.singularityRadius).toBe(16);
    expect(SURVIVOR.megaProtocol.singularityDamage).toBe(34);
  });
});

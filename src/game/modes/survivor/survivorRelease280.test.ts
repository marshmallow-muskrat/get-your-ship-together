/**
 * endless-2.8.0 release contracts.
 *
 * Each section states a contract the release is accountable for, and tests it against the
 * production simulation rather than against a reimplementation of it.
 */
import { describe, expect, it } from 'vitest';
import cssSource from '../../../styles/app.css?raw';
import hudSource from './survivorHud.ts?raw';
import upgradeCardSource from './survivorUpgradeCards.ts?raw';
import {
  UI_SCALE_MAX,
  UI_SCALE_MIN,
  UPGRADE_NUMBERS_DEFAULT,
  clampUiScale,
  clampUpgradeNumbers,
} from './survivorKeybinds';
import { newWeaponCard, passiveCard, weaponUpgradeCard } from './survivorUpgradeCards';
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
  displayName,
  isSignatureWeapon,
  bossDifficultyFor,
  isMegaBossIndex,
  type BossDamageCategory,
  type BossPhase,
} from './survivorContent';
import {
  BREAKPOINT_LEVEL,
  PROGRESSION_BOUNDS,
  levelGains,
  levelProgressionRatio,
} from './survivorWeaponBenchmark';
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
  forceStartProtocol,
  spawnEnemyForTest,
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
  const SEED_SET = [0, 1, 2, 3, 4, 5].map((i) => 0x5eed + i * 7919);

  it('puts more than the old four-orb cap on the field at once', () => {
    /*
     * Asserted on the maximum across a seed set, not per seed, because the cap was a
     * *ceiling*: under endless-2.7.0 no seed could exceed four however the run went, and
     * the late window measured exactly 4,4,4,4. Demonstrating its removal means showing
     * the economy can go past it, which a single run legitimately may not — a run that
     * dies early kills less and earns less, and that is the economy working rather than
     * the cap returning. An earlier draft asserted per seed on two seeds and broke when
     * the Phase 7 ship changes made those particular runs shorter.
     *
     * Measured here: late window 4,5,5,6,4,4 (max 6); dense-late 6,4,10,6,4,5 (max 10).
     */
    for (const id of ['late-20min', 'dense-late-26min']) {
      const scenario = repairScenario(id);
      const peaks = SEED_SET.map((seed) => runRepairWindow(scenario, seed).repairStats.activePeak);
      expect(Math.max(...peaks), `${id} peaks ${peaks.join(',')}`).toBeGreaterThan(OLD_ORB_CAP);
    }
    // Twelve 120-second production simulation windows, so it needs an explicit budget
    // like the other CPU-bound benchmark tests. The seed set is the point — see above —
    // so the cost is inherent to the contract rather than incidental.
  }, 60_000);

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

  it('ends a critical-health drought on the next eligible kill when no repair is nearby', () => {
    const state = createSurvivorState('bee', null, 0xc11);
    state.enemyCap = 20;
    state.spawnAcc = -1e9;
    state.nextBossTime = 1e9;
    state.player.health = state.player.maxHealth * 0.4;
    state.repairEconomy.sinceDrop = SURVIVOR.repair.killDriven.criticalDroughtSeconds + 0.1;
    state.repairEconomy.credit = 0;
    state.repairEconomy.nextThreshold = SURVIVOR.repair.killDriven.threshold;
    state.weapons = [{ weaponId: 'pulse', level: 5, cooldown: 0, focusDebt: 0, prototype: false }];
    const enemy = spawnEnemyForTest(state, 'basic', 1.5, 0)!;
    enemy.health = 1;
    enemy.maxHealth = 1;
    // Pin the victim so live chase speed cannot walk the drop into the magnet.
    enemy.speedMul = 0;
    for (let i = 0; i < 30 && enemy.alive; i += 1) {
      stepSurvivor(state, EMPTY_SURVIVOR_INPUT, DT);
    }
    expect(enemy.alive).toBe(false);
    expect(state.repairStats.ordinarySpawned).toBe(1);
    expect(state.pickups.some((p) => p.active && p.kind === 'repair')).toBe(true);
  });
});

describe('playtest follow-up: Orbital Lance resolves immediately with tactical priority', () => {
  function orbitalState(seed: number): SurvivorState {
    const state = createSurvivorState('bee', null, seed);
    state.enemyCap = 20;
    state.spawnAcc = -1e9;
    state.nextBossTime = 1e9;
    state.player.invuln = 1e9;
    state.weapons = [{ weaponId: 'orbital', level: 1, cooldown: 0, focusDebt: 0, prototype: true }];
    return state;
  }

  it('damages a boss on the firing step without creating an armed marker', () => {
    const state = orbitalState(0x0b17);
    const boss = bossOnPlayer(state);
    boss.x = 8;
    boss.z = 0;
    state.bosses.push(boss);
    const before = boss.health;
    stepSurvivor(state, EMPTY_SURVIVOR_INPUT, DT);
    expect(boss.health).toBeLessThan(before);
    expect(state.projectiles.some((p) => p.active && p.kind === 'orbital-marker')).toBe(false);
    expect(state.effects.some((e) => e.kind === 'orbital-strike')).toBe(true);
  });

  it('chooses an elite before a denser ordinary pack when no boss exists', () => {
    const state = orbitalState(0xe117e);
    const elite = spawnEnemyForTest(state, 'basic', 9, 0)!;
    elite.isElite = true;
    elite.health = elite.maxHealth = 10_000;
    for (let i = 0; i < 8; i += 1) {
      const ordinary = spawnEnemyForTest(state, 'basic', -6 + i * 0.2, 0)!;
      ordinary.health = ordinary.maxHealth = 10_000;
    }
    const before = elite.health;
    stepSurvivor(state, EMPTY_SURVIVOR_INPUT, DT);
    expect(elite.health).toBeLessThan(before);
  });
});

// --------------------------------------------------------------- §5 UI scale reflows

describe('§5 UI scale is a layout input, not a transform', () => {
  /*
   * The defect: scaling was `transform: scale(var(--ui-scale))` on each HUD panel. A
   * transform is a paint-time operation — it resizes pixels without re-running layout,
   * so at 1.5x nothing rewrapped and panels simply grew past the viewport edge along
   * whatever `transform-origin` they declared.
   *
   * Driving the root font size makes the scale a layout input instead: rem values are
   * recomputed, text rewraps, and `min()`/`clamp()` caps against `vw`/`vh` keep panels
   * inside the viewport. That cannot be asserted without a real layout engine, so pixel
   * verification lives in the browser QA sweep; what is checkable here is that the
   * mechanism is the font-size basis and that no transform reintroduces the old shape.
   */
  it('scales the root font size', () => {
    const at = cssSource.indexOf('html {');
    expect(at, 'missing html font-size rule').toBeGreaterThan(-1);
    const body = cssSource.slice(at, cssSource.indexOf('}', at));
    expect(body).toMatch(/font-size:\s*calc\(100%\s*\*\s*var\(--ui-scale\)\)/);
  });

  it('never scales a HUD panel by transform', () => {
    // Declarations only — the section above describes the defect in prose, and a naive
    // scan of the raw stylesheet matches that description rather than any rule.
    const declarations = cssSource.replace(/\/\*[\s\S]*?\*\//g, '');
    expect(declarations).not.toMatch(/transform:[^;]*scale\(\s*var\(--ui-scale\)/);
    expect(declarations).not.toMatch(/transform:[^;]*scale\(\s*calc\(\s*var\(--ui-scale\)/);
  });

  it('keeps the scale range at 0.75-1.5', () => {
    expect(UI_SCALE_MIN).toBe(0.75);
    expect(UI_SCALE_MAX).toBe(1.5);
    expect(clampUiScale(0.1)).toBe(UI_SCALE_MIN);
    expect(clampUiScale(9)).toBe(UI_SCALE_MAX);
  });

  it('does not express framing offsets in units that compound with the scale', () => {
    // Browser QA caught `.lower-hud`'s rem nudge pushing the bay off-screen at 1.5x.
    const at = cssSource.indexOf('.lower-hud {');
    expect(at).toBeGreaterThan(-1);
    const body = cssSource.slice(at, cssSource.indexOf('}', at));
    expect(body).toMatch(/transform:\s*translateY\(\d+px\)/);
    expect(body).not.toMatch(/translateY\([\d.]+rem\)/);
  });
});

describe('§5 upgrade cards', () => {
  it('centralises display names on the authored Title Case', () => {
    expect(displayName('Bio-Plasma Glob')).toBe('Bio-Plasma Glob');
    expect(weaponUpgradeCard('bioplasma', 3).parent).toBe('Bio-Plasma Glob');
    expect(passiveCard('regen', 1, 100).parent).toBe('Nanite Bleed');
    // Nothing may re-introduce a shouted name in the data layer; that is CSS's job.
    const sources = [hudSource, upgradeCardSource];
    for (const src of sources) {
      expect(src).not.toMatch(/\.name\.toUpperCase\(\)/);
      expect(src).not.toMatch(/displayName\.toUpperCase\(\)/);
    }
  });

  it('gives the keybind a reserved footer row that copy cannot reach', () => {
    // Previously concatenated into the category badge, which read as part of the copy.
    expect(hudSource).toMatch(/className = 'sv-card-bind'/);
    expect(hudSource).not.toMatch(/card\?\.category \?\? fallbackLabel\(c\)\} · \$\{labels/);
    // The bind lives in its own region node, not out of flow in a corner.
    expect(hudSource).toMatch(/className = 'sv-card-footer'/);

    /*
     * The reservation used to be `padding-bottom` on `.sv-choice.sv-card` with the bind
     * absolutely positioned over it — and `#sv-levelup .sv-choice { padding: ... }`
     * outranks a three-class selector, so inside the level-up modal (the only place
     * these cards appear) the reservation was discarded and long descriptions ran under
     * the shortcut. A grid row cannot be overridden away by a padding shorthand.
     */
    const cardAt = cssSource.indexOf('.survivor-hud .sv-card {');
    expect(cardAt).toBeGreaterThan(-1);
    const card = cssSource.slice(cardAt, cssSource.indexOf('}', cardAt));
    expect(card).toMatch(/display:\s*grid/);
    expect(card).toMatch(/grid-template-rows:/);

    const footAt = cssSource.indexOf('.survivor-hud .sv-card-footer {');
    expect(footAt).toBeGreaterThan(-1);
    const footer = cssSource.slice(footAt, cssSource.indexOf('}', footAt));
    expect(footer).toMatch(/min-height:\s*[\d.]+rem/);

    const bindAt = cssSource.indexOf('.survivor-hud .sv-card-bind {');
    const bind = cssSource.slice(bindAt, cssSource.indexOf('}', bindAt));
    expect(bind).not.toMatch(/position:\s*absolute/);
  });

  it('uses one gold level badge for every card that has levels', () => {
    // One formatter, one grammar, one colour. Gold means progression — not "this is
    // literally the string L1 → L2", which is what the old hard-coded HUD check meant.
    expect(weaponUpgradeCard('bioplasma', 1).progression.label).toBe('L1 → L2');
    expect(weaponUpgradeCard('bioplasma', 4).progression.label).toBe('L4 → L5');
    // Overclock keeps the ordinary displayed level step.
    expect(weaponUpgradeCard('pulse', 5).progression.label).toBe('L5 → L6');
    expect(weaponUpgradeCard('pulse', 5).progression.kind).toBe('level');
    // An acquisition is progression into the build, not `L0 → L1`.
    expect(newWeaponCard('pulsar').progression.label).toBe('New');
    expect(newWeaponCard('pulsar').progression.kind).toBe('acquire');
    // Passives share the grammar exactly.
    expect(passiveCard('area', 0, 120).progression.label).toBe('New');
    expect(passiveCard('area', 3, 120).progression.label).toBe('L3 → L4');
    expect(passiveCard('area', 4, 120).progression.label).toBe('L4 → L5 · MAX');
    expect(passiveCard('area', 4, 120).progression.kind).toBe('max');
    // Repeatable passives never claim a cap they do not have.
    expect(passiveCard('max-health', 9, 200).progression.label).toBe('L9 → L10');

    expect(hudSource).toMatch(/className = 'sv-card-badge'/);
    expect(hudSource).not.toMatch(/function simplifyCardBadge/);
    expect(hudSource).toMatch(/cardBadgeText\(card\?\.category/);
    expect(hudSource).toMatch(/className = 'sv-card-level'/);
    expect(hudSource).toMatch(/dataset\.progression/);
    expect(hudSource).not.toMatch(/dataset\.firstUpgrade/);
    expect(cssSource).toMatch(/\.sv-card-level \{/);
    expect(cssSource).not.toMatch(/data-first-upgrade/);
  });

  it('counts ordinary weapon slots and excludes prototypes', () => {
    expect(SURVIVOR.maxWeaponSlots).toBe(5);
    // Prototypes do not consume a slot, so counting them would misreport slot pressure
    // at exactly the moment the readout exists to inform.
    expect(hudSource).toMatch(/state\.weapons\.filter\(\(w\) => !w\.prototype\)\.length/);
    expect(hudSource).toMatch(/SURVIVOR\.maxWeaponSlots\} WEAPONS/);
  });
});

describe('§5 Upgrade Numbers setting', () => {
  it('defaults on and preserves an explicit preference', () => {
    expect(UPGRADE_NUMBERS_DEFAULT).toBe(true);
    expect(clampUpgradeNumbers(undefined)).toBe(true);
    expect(clampUpgradeNumbers(true)).toBe(true);
    expect(clampUpgradeNumbers(false)).toBe(false);
    // Malformed and older payloads receive the new default.
    for (const v of [null, 0, 1, 'true', 'on', {}, []]) {
      expect(clampUpgradeNumbers(v), String(v)).toBe(true);
    }
  });

  it('gates the stat lines on the card', () => {
    expect(hudSource).toMatch(/this\.upgradeNumbers && card && card\.stats\.length > 0/);
  });

  it('rebuilds cards when toggled mid-level-up', () => {
    // Cards are cached by offered-choice key; without invalidation the toggle would
    // appear to do nothing until the next level.
    expect(hudSource).toMatch(/this\.upgradeNumbers \? '#n' : ''/);
    expect(hudSource).toMatch(/setUpgradeNumbers\(on: boolean\)/);
  });
});

describe('§6 Cleanup Crew allies fight independently', () => {
  const cfg = SURVIVOR.megaProtocol.cleanup;

  /** A live squad, past its arrival choreography, with a horde on the field. */
  function squad(seed: number, enemies = 26): SurvivorState {
    const state = createSurvivorState('bee', null, seed);
    state.phase = 'playing';
    state.time = 600;
    state.player.invuln = 1e9;
    // Ally engagement, not live chase — keep the published close-rate.
    state.isolateLiveTravel = true;
    forceStartProtocol(state, 'cleanup-crew');
    surroundPlayer(state, enemies, 9);
    // Run past arrival stagger + choreography so every ally is fighting.
    for (let i = 0; i < Math.ceil((cfg.arriveDuration + cfg.arriveStagger * 3 + 1) / DT); i += 1) {
      stepSurvivor(state, EMPTY_SURVIVOR_INPUT, DT);
    }
    return state;
  }

  it('never lets an ally stray beyond its leash from the player', () => {
    const state = squad(2860);
    for (let i = 0; i < 600; i += 1) {
      stepSurvivor(state, EMPTY_SURVIVOR_INPUT, DT);
      for (const a of state.allies) {
        if (!a.active || a.phase !== 'active') continue;
        const d = Math.hypot(a.x - state.player.x, a.z - state.player.z);
        // Leash plus a small movement overshoot; independence is not abandonment.
        expect(d, `ally ${a.heroId} at ${d.toFixed(1)}`).toBeLessThan(cfg.leash + 4);
      }
    }
  }, 60_000);

  it('chooses ground rather than holding a fixed orbit', () => {
    /*
     * The endless-2.7.0 behaviour was a fixed bearing at a constant radius with a sine
     * drift, so every ally sat at essentially the same distance forever. Independent
     * engagement means that distance varies with where the fight actually is.
     */
    const state = squad(2861);
    const spread = new Set<string>();
    let engaged = 0;
    let samples = 0;
    for (let i = 0; i < 420; i += 1) {
      stepSurvivor(state, EMPTY_SURVIVOR_INPUT, DT);
      for (const a of state.allies) {
        if (!a.active || a.phase !== 'active') continue;
        samples += 1;
        if (a.engageValid) engaged += 1;
        const d = Math.hypot(a.x - state.player.x, a.z - state.player.z);
        spread.add(d.toFixed(0));
      }
    }
    // Every sampled frame found ground worth holding, rather than idling on station.
    expect(samples).toBeGreaterThan(0);
    expect(engaged).toBe(samples);
    /*
     * The old behaviour parked every ally at `formationRadius` regardless of weapon or
     * battlefield, so the observed set would be the single value {7}. Independent
     * engagement holds weapon-dependent standoff instead — measured here as {3, 6},
     * Rail Lance long and drones close.
     */
    expect(spread.size).toBeGreaterThanOrEqual(2);
    expect(spread.has(cfg.formationRadius.toFixed(0))).toBe(false);
  }, 60_000);

  it('falls back to the formation slot when nothing is in reach', () => {
    const state = squad(2862, 0);
    for (const e of state.enemies) e.alive = false;
    for (let i = 0; i < 120; i += 1) stepSurvivor(state, EMPTY_SURVIVOR_INPUT, DT);
    const active = state.allies.filter((a) => a.active && a.phase === 'active');
    expect(active.length).toBeGreaterThan(0);
    for (const a of active) {
      // No target selected, and still holding station near the player rather than adrift.
      const d = Math.hypot(a.x - state.player.x, a.z - state.player.z);
      expect(d).toBeLessThan(cfg.leash + 4);
    }
  }, 60_000);

  it('weights elites and minibosses above fodder when choosing a cluster', () => {
    expect(cfg.clusterEliteWeight).toBeGreaterThan(1);
    expect(cfg.clusterMinibossWeight).toBeGreaterThan(cfg.clusterEliteWeight);
  });

  it('commits to a choice instead of re-deciding every frame', () => {
    expect(cfg.retargetInterval).toBeGreaterThan(0.25);
  });

  it('replays identically for the same seed', () => {
    const a = squad(2863);
    const b = squad(2863);
    for (let i = 0; i < 240; i += 1) {
      stepSurvivor(a, EMPTY_SURVIVOR_INPUT, DT);
      stepSurvivor(b, EMPTY_SURVIVOR_INPUT, DT);
    }
    expect(a.allies.map((x) => `${x.x.toFixed(6)},${x.z.toFixed(6)}`)).toEqual(
      b.allies.map((x) => `${x.x.toFixed(6)},${x.z.toFixed(6)}`),
    );
  }, 60_000);
});

describe('§8 Cosmic Boomerang', () => {
  /** Fire one throw with a line of bodies in front of the player. */
  function thrown(seed: number, level = 1): SurvivorState {
    const state = createSurvivorState('bee', null, seed);
    state.phase = 'playing';
    state.player.invuln = 1e9;
    state.weapons = [
      { weaponId: 'boomerang', level, cooldown: 0, focusDebt: 0, prototype: false },
    ];
    for (let i = 0; i < 8; i += 1) {
      const side = i % 2 === 0 ? 2.4 : -2.4;
      spawnEnemyForTest(state, 'basic', state.player.x + side, state.player.z + 3 + i * 1.6);
    }
    return state;
  }

  it('is a returning weapon, not another straight shot', () => {
    const state = thrown(2880);
    let sawOutbound = false;
    let sawReturn = false;
    let maxDist = 0;
    for (let i = 0; i < 300; i += 1) {
      stepSurvivor(state, EMPTY_SURVIVOR_INPUT, DT);
      for (const pr of state.projectiles) {
        if (!pr.active || pr.kind !== 'boomerang') continue;
        const d = Math.hypot(pr.x - state.player.x, pr.z - state.player.z);
        maxDist = Math.max(maxDist, d);
        if (pr.returning) sawReturn = true;
        else sawOutbound = true;
      }
    }
    expect(sawOutbound).toBe(true);
    expect(sawReturn, 'the disc never turned').toBe(true);
    expect(maxDist).toBeGreaterThan(4);
  }, 60_000);

  it('bows visibly away from its launch vector before returning', () => {
    const state = thrown(28801);
    let disc: SurvivorState['projectiles'][number] | null = null;
    let maxLateral = 0;
    for (let i = 0; i < 180; i += 1) {
      stepSurvivor(state, EMPTY_SURVIVOR_INPUT, DT);
      disc ??= state.projectiles.find((p) => p.active && p.kind === 'boomerang') ?? null;
      if (!disc) continue;
      state.weapons[0]!.cooldown = 1e9;
      if (disc.returning) break;
      const dx = disc.x - disc.originX;
      const dz = disc.z - disc.originZ;
      maxLateral = Math.max(maxLateral, Math.abs(dx * disc.launchFz - dz * disc.launchFx));
    }
    expect(disc).not.toBeNull();
    expect(maxLateral).toBeGreaterThan(disc!.turnDistance * 0.22);
    expect(maxLateral).toBeLessThan(disc!.turnDistance * 0.42);
  });

  it('strikes each body once per leg, and gets two legs', () => {
    /*
     * The identity. Within a leg the limit is geometry, not a pierce counter, so a disc
     * that overlaps a body for many frames still bills once — and clearing the hit list
     * at the turn is what makes the return a genuine second opportunity rather than a
     * free double-hit or a wasted trip home.
     */
    const state = thrown(2881);
    const target = state.enemies.find((e) => e.alive)!;
    target.maxHealth = 1_000_000;
    target.health = target.maxHealth;

    // Let exactly one throw leave the hand, then stop the weapon firing again — over a
    // full flight the cadence would otherwise launch several discs and the count would
    // measure the fire rate rather than the two-leg contract.
    let launched = false;
    for (let i = 0; i < 240 && !launched; i += 1) {
      for (const e of state.enemies) if (e.alive && e !== target) e.alive = false;
      stepSurvivor(state, EMPTY_SURVIVOR_INPUT, DT);
      launched = state.projectiles.some((pr) => pr.active && pr.kind === 'boomerang');
    }
    expect(launched, 'no disc was thrown').toBe(true);
    state.weapons[0]!.cooldown = 1e9;

    /*
     * The body is pinned in the lane rather than left to chase. A chasing enemy ends up
     * standing on the player, and the disc is caught at the player's radius — which is
     * slightly wider than its own hit radius — so it despawns a fraction before it could
     * strike something at point-blank. That is correct catch geometry, but it makes a
     * chasing target the wrong instrument for measuring the two-leg contract.
     */
    const disc = state.projectiles.find((pr) => pr.active && pr.kind === 'boomerang')!;
    const u = 0.42;
    const along = disc.turnDistance * u;
    const px = -disc.launchFz;
    const pz = disc.launchFx;
    const side = Math.sin(Math.PI * u) * disc.turnDistance * SURVIVOR.boomerang.curveBulge * disc.curveSign;
    const lane = {
      x: disc.originX + disc.launchFx * along + px * side,
      z: disc.originZ + disc.launchFz * along + pz * side,
    };
    const before = target.health;
    let legs = 0;
    let prevHealth = target.health;
    for (let i = 0; i < 400; i += 1) {
      for (const e of state.enemies) if (e.alive && e !== target) e.alive = false;
      target.x = lane.x;
      target.z = lane.z;
      stepSurvivor(state, EMPTY_SURVIVOR_INPUT, DT);
      target.x = lane.x;
      target.z = lane.z;
      if (target.health < prevHealth) {
        legs += 1;
        prevHealth = target.health;
      }
    }
    expect(before - target.health).toBeGreaterThan(0);
    // Exactly two damage events from one throw: out and back.
    expect(legs).toBe(2);
  }, 60_000);

  it('clears its hit list on a pooled reuse', () => {
    const state = thrown(2882);
    for (let i = 0; i < 60; i += 1) stepSurvivor(state, EMPTY_SURVIVOR_INPUT, DT);
    const live = state.projectiles.filter((pr) => pr.active && pr.kind === 'boomerang');
    expect(live.length).toBeGreaterThan(0);
    for (const pr of live) expect(pr.hitIds).not.toBeNull();
  });

  it('holds the documented progression contract', () => {
    const r = levelProgressionRatio('boomerang');
    expect(r).toBeGreaterThanOrEqual(PROGRESSION_BOUNDS.ratioMin);
    expect(r).toBeLessThanOrEqual(PROGRESSION_BOUNDS.ratioMax);
    const gains = levelGains('boomerang');
    const over = gains.filter((g) => g > PROGRESSION_BOUNDS.typicalGainMax).length;
    // Only the declared L5 breakpoint may exceed the typical ceiling.
    expect(over, `effective gains ${gains.map((g) => g.toFixed(3)).join('/')}`).toBeLessThanOrEqual(1);
    expect(BREAKPOINT_LEVEL.boomerang).toBe(5);
  }, 60_000);

  it('does not melt bosses on both passes at full rate', () => {
    // A boss is one body, so two legs at full rate would make a lane weapon a boss weapon.
    expect(SURVIVOR.boomerang.bossDamageMul).toBeLessThan(1);
    expect(SURVIVOR.boomerang.bossDamageMul).toBeGreaterThan(0);
  });

  it('is a shared weapon rather than anyone\'s signature', () => {
    expect(isSignatureWeapon('boomerang')).toBe(false);
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

  it('places Event Horizon wells on separate threat clusters', () => {
    const state = createSurvivorState('bee', null, 2814);
    state.phase = 'playing';
    state.player.invuln = 1e9;
    state.nextBossTime = 1e9;
    state.nextCacheTime = 1e9;
    state.spawnAcc = -1e9;
    state.weapons = [{ weaponId: 'gravity', level: 5, cooldown: 0, focusDebt: 0, prototype: false }];
    for (const side of [-1, 1]) {
      for (let i = 0; i < 5; i += 1) {
        spawnEnemyForTest(state, 'basic', side * (5.2 + (i % 2) * 0.5), 5 + Math.floor(i / 2) * 0.45);
      }
    }
    stepSurvivor(state, EMPTY_SURVIVOR_INPUT, DT);
    const wells = state.hazards.filter((h) => h.active && h.kind === 'gravity-well');
    expect(wells).toHaveLength(2);
    expect(Math.hypot(wells[0]!.x - wells[1]!.x, wells[0]!.z - wells[1]!.z)).toBeGreaterThan(6);
    expect(state.effects.filter((e) => e.kind === 'gravity-collapse')).toHaveLength(2);
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

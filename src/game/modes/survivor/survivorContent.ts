import type { HeroId } from '../../content/heroes';
import {
  MELEE_BLOB,
  MELEE_SPIKY,
  MELEE_ALIEN,
  MELEE_ORC,
  MELEE_MUSHNUB,
  RANGED_GOLELING,
  RANGED_GHOST,
  RANGED_ARMABEE,
  RANGED_SQUIDLE,
  BOSS_DEMON,
  type EnemyDef,
} from '../../content/enemies';

/**
 * Balance/game version stamped into local high scores.
 *
 * This is also the **balance partition marker** the deployment verification procedure
 * greps out of the served bundle to prove which partition is live (see AGENTS.md). It
 * must be bumped as part of the release it names, not at promotion time: while it lagged,
 * a 2.8.0 Test Center build was indistinguishable from production 2.7.0 by exactly the
 * check that exists to catch a mis-publish.
 *
 * Snapshots preserved before this bump (the Phase 2 repair economy and the Phase 3 boss
 * fairness A/B) carry `endless-2.7.0` in their `balanceVersion` field. They are still
 * valid comparisons — experiments are identified by their `label`, and the seeds and
 * policy are unchanged — but their stamp records the partition that was live when they
 * were taken rather than the release they belong to.
 */
export const SURVIVOR_BALANCE_VERSION = 'endless-2.9.0-test-center';

/**
 * Piecewise-linear interpolation over ascending `[x, y]` anchors.
 *
 * Anchors are the authoritative balance contract: `curveAt` reproduces every
 * published table value exactly, so the balance tests assert the same numbers the
 * design tables state. Below the first anchor the first value is held; past the last
 * anchor the final segment's slope continues, which is how the late game keeps
 * escalating without a second hand-authored table.
 */
export function curveAt(anchors: ReadonlyArray<readonly [number, number]>, x: number): number {
  const n = anchors.length;
  if (n === 0) return 0;
  const first = anchors[0]!;
  if (x <= first[0]) return first[1];
  for (let i = 1; i < n; i += 1) {
    const a = anchors[i - 1]!;
    const b = anchors[i]!;
    if (x <= b[0]) {
      const span = b[0] - a[0];
      if (span <= 0) return b[1];
      return a[1] + ((x - a[0]) / span) * (b[1] - a[1]);
    }
  }
  const last = anchors[n - 1]!;
  const prev = anchors[n - 2] ?? last;
  const span = last[0] - prev[0];
  if (span <= 0) return last[1];
  const slope = (last[1] - prev[1]) / span;
  return last[1] + (x - last[0]) * slope;
}

/** Additive Overclock damage growth per level past L5. */
export const OVERCLOCK_DAMAGE_PER_LEVEL = 0.07;

/** Centralized Containment Protocol tuning (endless high-score mode). */
export const SURVIVOR = {
  /** Endless — no run-length victory. */
  endless: true,
  bossInterval: 120, // every 2 minutes
  maxSimultaneousBosses: 3,
  /**
   * First regular boss base health.
   *
   * The isolated boss benchmark understated real-run time-to-kill because it omitted
   * horde target competition. Calibrated full runs showed fewer than one boss killed
   * by 5–7 minutes, so 2.5.0 lowers the opening value to prevent accidental backlog.
   */
  firstBossBaseHealth: 3000,
  /** Doubled Test Center platform: 128 x 128 playable world units. */
  arenaHalf: 64,
  /**
   * Normal waves still enter one legacy-platform half-width from the player.
   *
   * The larger map creates roaming room; it must not turn every encounter into a
   * 60-unit commute from a distant global wall.
   */
  combatSpawnHalf: 32,
  /** Stable boss entry distance, independent of the expanded global platform. */
  bossSpawnRadius: 14,
  cameraHalf: 12,
  actorScale: {
    player: 1.5,
    enemy: 1.5,
    elite: 1.5,
    miniboss: 2.1,
    /** Doubled from prior 1.85 so bosses read as major threats. */
    boss: 3.7,
    ship: 1.35,
  },
  playerMaxHealth: 100,
  playerSpeed: 6.4,
  playerRadius: 0.55,
  playerInvuln: 0.38,
  xpMagnetBase: 3.2,
  /** Magnet Field energy gain per level. */
  xpMagnetPerLevel: 0.35,
  /** Health/repair magnet base — larger than energy for reliable collection. */
  healthMagnetBase: 6.0,
  healthMagnetPerLevel: 0.88,
  healthDirectRadius: 1.25,
  healthMagnetSpeed: 24,
  xpMagnetSpeed: 14,
  healthShipMagnet: 9.0,
  healthMechMagnetMul: 1.4,
  /** Mech direct health collection radius floor. */
  healthMechDirectRadius: 1.5,
  /** Ship direct health collection: max(ship pickupRadius, this). */
  healthShipDirectMin: 3.2,
  enemyCap: 160,
  projectileCap: 220,
  pickupCap: 160,
  /** Reserve free slots so XP cannot starve health/boss rewards. */
  pickupReserveImportant: 24,
  /** Seconds after taking damage before Nanite Bleed resumes. */
  regenDamagePause: 2.0,
  /**
   * Pressure director timing (seconds).
   *
   * A surge is an *event*: long enough to telegraph and react to, followed by a real
   * breathing window. The 1.1s telegraph and 52s cadence of endless-2.2.1 were both
   * shorter than a player's reaction-and-reposition loop, so surges read as noise.
   */
  surgeIntervalMin: 60,
  surgeIntervalMax: 75,
  surgeTelegraph: 3.5,
  surgeDuration: 10,
  surgeRecovery: 13.5,
  /** Surge-spawned enemies only — never the standing horde. */
  surgeWaveSpeedBonus: 0.22,
  /** Recovery holds replacements until population falls to this fraction of target. */
  surgeRecoveryPopulationFactor: 0.55,
  /** Elite specialist earliest appearance (seconds). */
  eliteGateTime: 90,
  /** Visible Gravitic Recall pull window (seconds). */
  recallDuration: 1.25,
  /** Containment Collapse begins at this survival time (seconds). */
  collapseStart: 30 * 60,
  collapseStep: 120,
  /** Ordinary repair orbs expire so full-health players cannot fill the pool forever. */
  repairPickupLife: 70,
  repairPickupWarnLife: 8,
  /** Keep XP from packing against perimeter walls. */
  pickupSafeInset: 2.75,
  hazardCap: 80,
  damageEventCap: 48,
  maxWeaponSlots: 5,
  /** Prototype weapons (arc/orbital) do not consume ordinary slots. */
  maxPrototypeSlots: 2,
  arcUnlockTime: 300,
  orbitalUnlockTime: 900,
  cacheInterval: 120,
  cacheLeadBeforeBoss: 15,
  /** Expanded-station routing window; +7s from the playtest baseline. */
  cacheLifetime: 45,
  cacheOfferDuration: 0,
  /** Collection radius for Protocol Cache (world units). */
  cacheCollectRadius: 3.25,
  /** Normal Aegis duration (enhanced is longer). */
  shieldDuration: 30,
  shieldDurationEnhanced: 45,
  shieldEnhancedMul: 1.35,
  megaEvery: 5,
  megaHealthMul: 1.6,
  megaDamageMul: 1.25,
  /**
   * Mega-Boss size relative to a regular boss.
   *
   * Reduced from 2.0 → 1.5 (a 25% cut to the presented Mega-Boss). Regular boss
   * sizes are unchanged. The collider follows the visible body via `megaColliderMul`
   * so Repulse, exhaust, weapon hits, body contact and telegraph origins stay honest.
   */
  megaVisualMul: 1.5,
  megaColliderMul: 1.32,
  megaMoveMul: 0.85,
  fixedDt: 1 / 60,
  /**
   * Bounded repair economy.
   *
   * A flat per-kill chance turned into an unlimited faucet once kill rate climbed:
   * at late kill rates a 4% roll produced an orb every couple of seconds and erased
   * every chip mistake. Drops are now paced by a timer/budget with a pity floor and
   * are gated on the player actually being injured.
   */
  repair: {
    /** Earliest gap between ordinary repair drops (seconds). */
    minInterval: 12,
    /** Typical gap once the player is meaningfully injured (seconds). */
    targetInterval: 15,
    /** Pity: an injured player is guaranteed an orb by this gap (seconds). */
    pityInterval: 18,
    /** Below this health fraction the drop is considered "meaningfully injured". */
    injuredFraction: 0.9,
    /** Health fraction under which the pity floor tightens toward minInterval. */
    criticalFraction: 0.45,
    /**
     * Kill-driven ordinary supply (endless-2.8.0).
     *
     * Ordinary orbs are earned by killing, not by being hurt and not by the
     * clock. Both candidate models below price an orb in threat-weighted kill
     * credit, so the tap width stays roughly constant as kill rate rises
     * instead of widening into a late-game faucet the way a flat per-kill roll
     * did in endless-2.2.1.
     */
    killDriven: {
      /**
       * Which model is live. Both are implemented so they can be A/B'd on
       * identical seeds; see docs/REPAIR_BENCHMARK.md for the comparison.
       * - `accumulator`: threat credit banks toward a seeded-variance threshold.
       * - `probability`: per-kill roll with escalating bad-luck protection.
       */
      model: 'accumulator' as 'accumulator' | 'probability',
      /** Threat credit contributed per kill, by enemy class. */
      weightOrdinary: 1,
      weightElite: 3,
      weightMiniboss: 8,
      /** Accumulator: mean credit an ordinary orb costs. */
      threshold: 40,
      /** Accumulator: seeded +/- fraction applied to each next threshold. */
      thresholdVariance: 0.25,
      /** Critical, kill-driven drought guard; never emits without an eligible kill. */
      criticalDroughtSeconds: 12,
      /** Existing repair inside this radius suppresses the critical drought guard. */
      criticalNearbyRadius: 14,
      /** Probability model: chance per unit of threat weight. */
      baseChancePerWeight: 1 / 40,
      /**
       * Probability model: once credit passes `escalateAfter`, the effective
       * chance climbs so an unlucky streak is bounded rather than unbounded.
       */
      escalateAfter: 40,
      escalatePerCredit: 0.02,
      /** Probability model: hard guarantee, so no drought can run forever. */
      guaranteeAt: 140,
    },
    /**
     * Ordinary orb value.
     *
     * Lowered from 22 in endless-2.8.0. The kill-driven economy roughly doubles
     * how many ordinary orbs reach the player, so holding face value constant
     * raised healing per active minute by ~60% in the dense-late window. Value
     * is the lever rather than supply: keeping drops frequent and making each
     * one smaller preserves the route-planning choices the redesign exists to
     * create, where thinning supply would remove them again.
     */
    value: 16,
    /** Miniboss guaranteed reward. */
    minibossValue: 45,
    /** Boss guaranteed reward. */
    bossValue: 55,
    megaBonus: 30,
  },
  gunship: {
    /** Warning lane duration before damage begins. */
    warnDuration: 0.9,
    /** Active strafing duration after warning. */
    strafeDuration: 4.6,
    fireInterval: 0.16,
    laneHalfWidth: 6.2,
    enemyDamage: 38,
    bossDamage: 95,
    impactRadius: 3.8,
    flyHeight: 6.5,
    /** Percentage damage scales with every boss health curve automatically. */
    bossHealthFraction: 0.1,
    megaHealthFraction: 0.05,
    /** Earned breathing room after the pass; replacement pressure nearly stops. */
    spawnSuppressDuration: 6.5,
    spawnSuppressRateMul: 0.05,
  },
  dodge: {
    cooldown: 10,
    /** Distance tripled from prior 4.5 → 13.5 */
    duration: 0.42,
    invuln: 0.42,
    distance: 13.5,
  },
  /**
   * Mech Overdrive is a fixed-cooldown ultimate.
   *
   * endless-2.2.1 filled the meter from kills (1.2%/kill, 8%/elite, 35%/miniboss,
   * 25%/boss, plus Core Siphon). At the kill rates this game actually reaches that
   * was near-permanent uptime — the defect was availability, not power. Nothing
   * refills the cooldown now; it is wall-clock only, and it runs *while* Mech is
   * active so a transformation costs 30s of schedule, not 30s of astronaut time.
   */
  mech: {
    duration: 6,
    /** Activation-to-activation. Counts down during Mech, so 24s of non-Mech time. */
    cooldown: 30,
    /** The run opens with Mech unavailable; first readiness is one full cooldown in. */
    initialCooldown: 30,
    damageTakenMul: 0.65,
    weaponDamageMul: 1.35,
    weaponCadenceMul: 1.15,
    weaponAreaMul: 1.15,
  },
  /**
   * Elites are rare, unmistakable and durable.
   *
   * Durability comes from real health and knockback resistance, never from
   * invulnerability windows — a focused, Repulsed or Mech-countered elite still dies.
   */
  elite: {
    /** Telegraph before the lunge commits. Long enough to read and sidestep. */
    lungeWindup: 0.55,
    lungeDash: 0.26,
    lungeSpeed: 15.5,
    lungeRange: 7.5,
    lungeCooldown: 3.2,
    /** Elite lunge impact relative to its ordinary contact damage. */
    lungeDamageMul: 1.6,
    /** Show the compact elite bar within this distance of the player. */
    barVisibleRange: 16,
    /** Concurrent elite bars, nearest first, so the screen never fills with bars. */
    maxVisibleBars: 4,
    /**
     * Ordinary elites are events, not an additive percentage on every high-churn
     * replacement. This is the minimum gap between ordinary elite arrivals.
     */
    spawnIntervalEarly: 18,
    spawnIntervalLate: 10,
    /** If chance has not produced one after this additional gap, drought protection may. */
    droughtGrace: 9,
    /** An Elite Surge may temporarily exceed the ordinary population budget by this cap. */
    surgeBonusCap: 5,
  },
  /**
   * Aegis must be a real emergency button, not just a slab of delayed HP —
   * otherwise Gravitic Recall wins every ordinary Cache by default.
   */
  aegis: {
    invulnOnSelect: 3,
    pulseRadius: 14.5,
    pulseDamage: 12,
    pulsePush: 13.0,
    pulseElitePushMul: 0.45,
    pulseMinibossPushMul: 0.2,
  },
  megaProtocol: {
    /** Mega-Cache armaments persist for five minutes of active simulation time. */
    titanDuration: 5 * 60,
    titanDamageMul: 1.35,
    titanAreaMul: 1.35,
    titanDamageTakenMul: 0.72,
    fleetPasses: 3,
    fleetWarn: 0.8,
    fleetTravel: 1.65,
    fleetGap: 0.55,
    fleetLaneHalfWidth: 4.6,
    fleetMinibossFraction: 0.9,
    fleetBossFraction: 0.06,
    fleetMegaFraction: 0.03,
    singularityDuration: 5.5,
    /** Readable suction window before the collapse resolves damage. */
    singularityPullDuration: 1.3,
    singularityPullSpeed: 7.2,
    singularityElitePullMul: 0.48,
    singularityMinibossPullMul: 0.2,
    singularityRadius: 16,
    singularityTick: 0.25,
    singularityDamage: 34,
    singularityBossFraction: 0.055,
    /**
     * Cleanup Crew (2.7.0) — the third Mega Protocol, replacing the deleted orbital-beam
     * armament.
     *
     * The three heroes the player is *not* using arrive in their own ships, deploy as
     * allied Mechs, fight with only their exclusive signature weapon for five minutes,
     * and then leave the way they came.
     *
     * Allies are bounded actors, not duplicate players: they are invulnerable,
     * non-colliding, never displace anything, and hold no passives, forms or Build.
     */
    cleanup: {
      /** Seconds of arrival choreography before an ally starts fighting. */
      arriveDuration: 1.9,
      /** Stagger between the three arrivals, for a readable sequence. */
      arriveStagger: 0.42,
      /** Seconds of departure choreography at expiry. */
      departDuration: 1.7,
      /**
       * Distance the transport ships fly in from.
       *
       * Kept just inside the isometric camera's reach (`cameraHalf` 12) so the arrival
       * is actually *watched* rather than happening off-screen: at 26 the ships spent
       * almost the whole sequence outside the view and the player only ever saw the
       * landing flash.
       */
      shipEntryDistance: 15,
      /** Loose formation radius around the player; the fallback anchor, not the plan. */
      formationRadius: 7.2,
      /** How quickly an ally closes on its chosen position. */
      followSpeed: 9.4,
      /**
       * Independent engagement (endless-2.8.0).
       *
       * Allies used to orbit a fixed bearing around the player with a sine drift, which
       * made three squadmates read as a rotating decoration: they fired at whatever was
       * nearest, never chose ground, and never reacted to where the fight actually was.
       *
       * Each ally now picks its own target of opportunity — the densest cluster it can
       * reach — and takes a standoff position at its own weapon's preferred range from
       * it. `leash` is what keeps that independence from becoming abandonment: an ally
       * may not stray further than this from the player, so the squad still fights the
       * player's fight. With no target in reach it falls back to its formation slot, so
       * it never looks lost.
       */
      leash: 13.5,
      /** Radius the cluster scan scores threat density within. */
      clusterRadius: 5.0,
      /** Elites and minibosses are worth pursuing more than fodder. */
      clusterEliteWeight: 4,
      clusterMinibossWeight: 9,
      /** Preferred standoff distance from the chosen target, per signature weapon. */
      standoff: {
        rail: 7.5,
        microdrone: 4.5,
        bioplasma: 5.0,
        rocket: 6.5,
      } as Record<string, number>,
      /** Default standoff when a signature is not listed above. */
      standoffDefault: 5.5,
      /** Re-target no more often than this, so allies commit instead of dithering. */
      retargetInterval: 0.85,
      /** Authored ally weapon level. Never the player's own level. */
      weaponLevel: 5,
      /**
       * Titan normalization.
       *
       * Allies do *not* get a free L5 player weapon. Authored L5 mechanics (projectile
       * counts, radii, pierce, splash) are preserved so each signature stays
       * recognisable, while damage and cadence are re-based for a three-actor squad and
       * scaled by the same bounded `playerPowerScale` every other Titan uses.
       *
       * Calibrated against the deterministic Titan comparison so the squad's direct
       * damage lands at parity with Carrier Wing, which the release brief holds fixed as
       * the reference "already feels good" armament.
       */
      damageMul: 0.278,
      cadenceMul: 1.28,
      /** Boss damage multiplier applied on top, matching ordinary weapon boss ratios. */
      bossMul: 0.8,
    },
  },
  /**
   * Plasma Wake trail (2.7.0).
   *
   * 2.6.1 emitted an independent wide/thin ellipse every `cadence` seconds. At any real
   * movement speed the forward extent of one ellipse (~1.1 world units) was smaller than
   * the distance covered between emissions (~2.2 units at astronaut speed), so the
   * weapon read — and collided — as a row of disconnected discs, and at L1 each disc
   * vanished after 1.8s before it could matter.
   *
   * 2.7.0 emits *connected capsule segments*: each new segment starts exactly where the
   * previous one ended, so continuity is structural and no speed can open a gap. Because
   * segments chain, coverage is a function of lifetime and speed rather than of emission
   * frequency, which is why emission can be made much less frequent while the trail gets
   * denser rather than sparser.
   */
  plasmaTrail: {
    /** Seconds the burning trail lags behind the hero. */
    delay: 0.5,
    /** Emission spacing along the travelled path (world units), by form. */
    segmentLength: 3.2,
    shipSegmentLength: 5.5,
    /** Never emit slivers, and never emit more often than this. */
    minSegmentLength: 0.9,
    minInterval: 0.1,
    /** Cross-track half-width = weapon radius x this (preserves the wide/thin identity). */
    widthMul: 1.72,
    /** Ship trails are wider and brighter. */
    shipWidthMul: 1.35,
    /** Lateral offset between Twin Wake ribbons, as a multiple of half-width. */
    twinOffsetMul: 0.95,
    /**
     * Each ribbon narrows when the wake splits.
     *
     * Twin Wake laying two full-width ribbons doubled coverage outright, which made L5
     * a +231% breakpoint. Splitting the wake into two narrower strips keeps the
     * mechanic readable while landing the breakpoint inside the documented band.
     */
    twinWidthMul: 0.72,
    /**
     * Ember phase.
     *
     * A segment burns at full strength for the first `emberStart` of its life, then
     * decays linearly to `emberFloor`. This is simultaneously the readable dissipating
     * tail and the mechanism that stops a much longer lifetime from multiplying
     * late-game damage.
     */
    emberStart: 0.45,
    emberFloor: 0.25,
    /**
     * Per-level integrated-damage normalization.
     *
     * A continuous ribbon covers far more ground than the old disc row, so raw authored
     * damage would inflate every level. These factors re-base the weapon against the
     * deterministic `mobile-offaxis` weapon benchmark, measured L1->L5:
     *
     * ```text
     * endless-2.6.1   2052  2838  3744  4680  6732   (ratio 3.28)
     * endless-2.7.0   2249  2883  3717  4818  6949   (ratio 3.09)
     * ```
     *
     * Late game is held within ~3% of the 2.6.1 baseline, exactly as intended: L4-L5
     * were already strong (Plasma Wake was 15.5% of the reference 21:18 run). The L1
     * gain is deliberately modest in raw damage — its real fix is that the trail is now
     * continuous and lasts 3.6s instead of 1.8s — because the published L5/L1 band of
     * 3.0-4.2 bounds how far L1 can rise while L5 stays at baseline.
     */
    damageNorm: [0.88, 0.92, 0.96, 1.02, 1.194] as readonly number[],
    /** Bosses do not take full horde-clearing trail damage from every swept segment. */
    bossDamageMul: 0.5,
    /** Ship's long, wide wake gets an additional boss-only reduction. */
    shipBossDamageMul: 0.72,
  },
  /**
   * Orbital Lance two-zone strike (2.7.0).
   *
   * The identity — tactical priority and one heavy impact — is unchanged. Damage now
   * resolves immediately. What changes is *coverage*: every strike also lays down
   * a wider shockwave ring. A target is damaged by exactly one zone, the core taking
   * precedence, so a single enemy can never be double-counted and the single-boss
   * benchmark scenario is unaffected by the ring.
   */
  /**
   * Arc Conductor forked conduction (endless-2.8.0).
   *
   * Arc's L1-L4 growth is chain count and range; its L5 was "one more chain, plus a
   * cosmetic discharge ring", which reads as a fifth ordinary level rather than as the
   * transformation every other weapon gets at L5. Twin Orbit visibly becomes two discs;
   * Echo Pulsar visibly becomes two rings; Arc Storm looked exactly like Arc Conductor
   * IV with a slightly longer tail.
   *
   * At `forkLevel` the weapon fires `branches` initial arcs at two distinct targets and
   * each continues into its own, shorter chain. Coverage becomes two bearings instead of
   * one walk, which is the identity change; total output does not grow, because the
   * documented progression contract is not a range to be widened. `damageMul` is the
   * per-hit rebase that keeps the L4 -> L5 effective gain inside it.
   */
  arc: {
    forkLevel: 5,
    /** Initial arcs at the fork level. */
    branches: 2,
    /**
     * Jumps removed from each branch's chain, so a fork is not simply twice the reach.
     *
     * Two. Each arm keeps a primary plus three jumps — four bodies, eight across the
     * volley, against the six one L5 chain used to walk. Removing only one jump put ten
     * bodies in a volley and forced the per-hit rebase down to 0.60 to stay in contract,
     * which turns a transformation into a lot of small numbers. Fewer, harder hits per
     * arm reads better and keeps more of the authored damage intact.
     */
    branchChainReduction: 2,
    /**
     * Per-hit rebase applied only when a second arm actually fires.
     *
     * Measured, not guessed. The fork covers far more of a mixed horde than one chain
     * walk does, so at parity per hit the L4 -> L5 effective gain measured well past the
     * 0.52 breakpoint ceiling. Swept against the real benchmark across both branch
     * lengths: 0.72 lands the gain at **0.440** and L5/L1 at **3.29**, both comfortably
     * inside the contract and close to the **0.493** the old single-chain Arc Storm
     * produced. The transformation is paid for in output *shape* — two bearings covered
     * instead of one walk — not in output size. The bands were not moved.
     */
    damageMul: 0.72,
    /**
     * Minimum bearing separation between the two initial targets, in radians.
     * A fork whose arms overlap is not visibly a fork.
     */
    minBranchSeparation: 0.7,
    /** Chain damage as a fraction of the primary hit. Unchanged from 2.7.0. */
    chainDamageMul: 0.75,
    bossPrimaryMul: 1.15,
    bossChainMul: 0.85,
  },
  orbital: {
    /** Shockwave radius as a multiple of the authored core radius. */
    shockwaveRadiusMul: 1.6,
    /** Shockwave damage as a fraction of the central impact (design band 35-40%). */
    shockwaveDamageMul: 0.375,
  },
  /**
   * Gravity Pulse control field (endless-2.8.0).
   *
   * The well was an instantaneous circle: one frame of damage, one nudge, a fading
   * decal. It read as a small explosion that happened to be purple, and it gave the
   * player no *position* — nothing about where enemies would be a second later.
   *
   * It is now a persistent mini-control field. It still damages exactly once per enemy,
   * so the weapon's damage identity is unchanged, and then spends its life holding what
   * it caught. Control is tiered by enemy class: fodder is genuinely gathered, heavier
   * classes are slowed but barely moved, and nothing that owns a telegraphed commitment
   * — minibosses, bosses — is displaced at all. A control tool that can drag a boss is
   * a control tool that deletes the fight it was supposed to make readable.
   *
   * Displacement is bounded per enemy per well, so no stack of wells can walk the horde
   * across the arena or pin it into the boundary.
   */
  gravityWell: {
    /** Pull speed toward the well centre, in world units per second. */
    pullSpeed: { fodder: 2.9, sprinter: 2.9, flanker: 2.2, hunter: 2.2, bruiser: 1.2, elite: 0.7, miniboss: 0 },
    /** Movement multiplier while held. Never below this floor. */
    slowMul: { fodder: 0.4, sprinter: 0.4, flanker: 0.5, hunter: 0.5, bruiser: 0.62, elite: 0.75, miniboss: 0.88 },
    /** Total displacement one well may apply to one enemy, in world units. */
    maxDisplacement: 1.8,
    /** Enemies stop being pulled inside this fraction of the radius, so they gather rather than stack. */
    coreFraction: 0.28,
    /** Simultaneous wells; a bounded pool like every other collection. */
    maxWells: 12,
    /** Bosses take the damage and are never controlled. */
    bossControl: false,
  },
  /** Gravity Pulse boss damage rate, unchanged from endless-2.7.0. */
  gravityBossDamageMul: 0.7,
  /**
   * Cosmic Boomerang flight (endless-2.8.0).
   *
   * `turnDistance` is how far the disc carves before reversing; it scales with the
   * authored `life` so a longer-lived throw reaches further rather than merely lingering.
   * `bossDamageMul` keeps a lane weapon from being a boss-melting weapon: a boss is one
   * body, so it would otherwise take both passes at full rate for free.
   */
  boomerang: {
    turnDistancePerLife: 4.2,
    /** Maximum lateral bow as a fraction of turn distance. */
    curveBulge: 0.04,
    /** Decorative silhouette only; collision remains the authored projectile radius. */
    visualRadiusMul: 1.55,
    /** Diverging bearing between the pair at Twin Orbit, in radians. */
    twinSpread: 0.42,
    bossDamageMul: 0.75,
  },
  repulsor: {
    /** Final: prior 13.5/12 × 1.33, 30s CD */
    cooldown: 30,
    radius: 17.955,
    damage: 20,
    /** Player progression keeps the 30-second active relevant without clock scaling. */
    damagePerPlayerLevel: 0.05,
    maxDamageMul: 2.5,
    push: 15.96,
    elitePushMul: 0.4,
    minibossPushMul: 0.18,
    mechRadiusMul: 1.25,
    mechDamageMul: 1.35,
    mechPushMul: 1.2,
    knockbackDuration: 0.48,
    bossStagger: 0.55,
    bossInternalCd: 6.5,
    effectLife: 0.72,
  },
  ship: {
    /*
     * Raised from 2.5s in endless-2.8.0.
     *
     * Halving baseline mitigation shortens how much the window can accomplish, because
     * more of it is spent disengaging. A longer window keeps the form's *offensive*
     * identity intact while the survivability change lands on how much punishment it can
     * absorb, so the two do not confound each other in the A/B.
     */
    duration: 3.25,
    cooldown: 16,
    speedMul: 2.6,
    /**
     * Baseline: ship takes 50% of incoming damage (endless-2.8.0, was 0.20).
     *
     * This is the *baseline* only. Reinforced Airframe carries it back down toward 0.25,
     * so the 75% ceiling endless-2.7.0 handed out free is now the top of an investment
     * curve. See `shipDamageTakenMul`, which is the single place the form's mitigation is
     * resolved — nothing reads this constant directly.
     *
     * Ship is still never invulnerable, and Breach Shielding continues to apply on top
     * for boss sources through the established mitigation order (form -> titan -> boss
     * reduction -> shield -> integrity).
     */
    damageTakenMul: 0.5,
    wakeInterval: 0.14,
    wakeLife: 1.25,
    wakeRadius: 1.15,
    wakeDamage: 28,
    wakeTickCd: 0.28,
    bodyDamage: 18,
    bodyPush: 1.2,
    bodyTickCd: 0.35,
    radius: 0.7,
    /** Continuous rear exhaust jet — more visible and lethal */
    exhaustLength: 5.2,
    exhaustWidth: 2.0,
    /** Level-1 base: strong enough to shred early basics in the plume. */
    exhaustDamage: 42,
    exhaustTickCd: 0.2,
    exhaustEliteMul: 0.55,
    exhaustBossMul: 0.45,
    exhaustVisualScale: 1.85,
    /** Power scale caps thruster damage growth with permanent build. */
    powerScaleCap: 10.0,
    /**
     * Boss ram (2.7.0).
     *
     * Ship Body previously dealt exactly zero boss damage: flying through a boss —
     * the single most committal thing ship form can do — was mechanically unrewarded.
     * The ram pays that off with one heavy, well-telegraphed impact.
     *
     * Bounded three ways so it cannot become a boss-melting source:
     *  1. `ramInternalCd` is per boss, so overlapping frames inside one body produce at
     *     most one impact per interval no matter how many frames the overlap spans.
     *  2. Damage rides the existing capped `thrusterPower` scale, not a new curve.
     *  3. Ship form is 2.5s on a 16s cooldown, so contact time is inherently scarce.
     *
     * At the `powerScaleCap` of 10 a single ram applies 420 — a satisfying heavy number
     * comparable to a strong Orbital Lance impact, not a boss deletion.
     */
    ramBossDamage: 42,
    /** Per-boss internal cooldown between ram impacts (seconds). */
    ramInternalCd: 0.75,
  },
  /** Per-hero ship dimensions for pickup/exhaust (world units). Substantially larger reach. */
  heroShips: {
    bee: { pickupRadius: 4.2, collectionRadius: 5.0, colliderLength: 4.6, colliderWidth: 4.0 },
    flamingo: { pickupRadius: 4.5, collectionRadius: 5.3, colliderLength: 5.0, colliderWidth: 4.3 },
    frog: { pickupRadius: 4.3, collectionRadius: 5.1, colliderLength: 4.7, colliderWidth: 4.1 },
    'red-panda': { pickupRadius: 4.4, collectionRadius: 5.2, colliderLength: 4.8, colliderWidth: 4.2 },
  } as Record<HeroId, { pickupRadius: number; collectionRadius: number; colliderLength: number; colliderWidth: number }>,
  damageNumbers: {
    aggregateWindow: 0.15,
    life: 0.85,
    heavyLife: 1.05,
    largeThreshold: 36,
    heavyThreshold: 55,
    /** Multiplier applied to rendered font sizes (1.5× prior). */
    sizeScale: 1.5,
  },
  tempBuff: {
    overchargeDuration: 20,
    overchargeDamageMul: 1.35,
    thrusterDuration: 12,
    thrusterSpeedMul: 1.35,
    barrierHits: 1,
    repairAmount: 40,
  },
} as const;

export type SurvivorForm = 'astronaut' | 'ship' | 'mech';

export type WeaponId =
  | 'pulse'
  | 'microdrone'
  | 'rail'
  | 'gravity'
  | 'rocket'
  | 'bioplasma'
  | 'rotary'
  | 'plasma-wake'
  | 'pulsar'
  /** Cosmic Boomerang (endless-2.8.0): returning lane weapon. */
  | 'boomerang'
  | 'arc'
  | 'orbital';

export interface WeaponLevelDef {
  level: number;
  /**
   * Tier name, present **only** where the level introduces a genuinely transformative
   * mechanic (endless-2.8.0).
   *
   * A weapon's primary name is stable across ordinary levels. Rocket Barrage used to
   * become "Salvo" at L3, "Cluster" at L4 and "Carpet Fire" at L5 while doing nothing
   * but firing more rockets slightly faster — so the player was told their weapon had
   * been replaced three times by upgrades that changed a count. Worse, "Cluster"
   * promised rockets that split, which they do not, and "Carpet Fire" promised area
   * saturation, which it is not.
   *
   * The rule now: an ordinary level keeps the weapon's own name and lets the card's
   * effect sentence say what changed; a tier name is reserved for a level that changes
   * what the weapon *is* — one projectile becoming two, a glob learning to split, a
   * chain learning to fork. Absent means ordinary.
   */
  tier?: string;
  damage: number;
  cadence: number;
  count: number;
  speed?: number;
  radius?: number;
  pierce?: number;
  life?: number;
  width?: number;
  length?: number;
  splash?: number;
  puddleRadius?: number;
  puddleLife?: number;
  puddleDamage?: number;
  bounce?: number;
  split?: number;
}

export interface WeaponFamily {
  id: WeaponId;
  name: string;
  description: string;
  color: string;
  levels: WeaponLevelDef[];
  /** Time-gated prototype weapon; does not consume ordinary slots. */
  prototype?: boolean;
  unlockTime?: number;
}

export const WEAPONS: Record<WeaponId, WeaponFamily> = {
  pulse: {
    id: 'pulse',
    name: 'Pulse Blaster',
    description: 'Auto-locks nearest hostiles with rapid bolts.',
    color: '#88d4ff',
    levels: [
      // Structural growth is capped at 2x projectiles across L1-L5; the rest of the
      // curve comes from per-shot damage and cadence, so L5 lands near 3.3x L1. Twin
      // Pulse at L4 is the one level that changes what the weapon is.
      { level: 1, damage: 14, cadence: 0.32, count: 1, speed: 26, pierce: 0, life: 1.0, radius: 0.2 },
      { level: 2, damage: 16, cadence: 0.281, count: 1, speed: 27, pierce: 0, life: 1.0, radius: 0.21 },
      { level: 3, damage: 18, cadence: 0.237, count: 1, speed: 28, pierce: 0, life: 1.05, radius: 0.22 },
      { tier: 'Twin Pulse', level: 4, damage: 20, cadence: 0.387, count: 2, speed: 29, pierce: 0, life: 1.1, radius: 0.23 },
      { level: 5, damage: 22, cadence: 0.301, count: 2, speed: 31, pierce: 0, life: 1.15, radius: 0.25 },
    ],
  },
  microdrone: {
    id: 'microdrone',
    name: 'Microdrone Swarm',
    description: 'A broad formation of drones fired in one committed direction.',
    color: '#f5ae42',
    levels: [
      /*
       * Like Rocket Barrage, this line carries no tier name and that is the audit's
       * finding rather than an omission. A formation of three drones becoming five is
       * a wider formation, not a different weapon — the same class of change as adding
       * a rocket to a salvo. "Swarm Cadre", "Hunter Wing" and "Hive Overdrive" renamed
       * Boswell's signature three times across five levels without one new mechanic.
       */
      { level: 1, damage: 42, cadence: 0.72, count: 3, speed: 19, life: 1.35, radius: 0.22, width: 0.7 },
      { level: 2, damage: 48, cadence: 0.64, count: 3, speed: 20, life: 1.4, radius: 0.23, width: 0.78 },
      { level: 3, damage: 54, cadence: 0.57, count: 3, speed: 21, life: 1.45, radius: 0.24, width: 0.86 },
      { level: 4, damage: 70, cadence: 0.52, count: 3, speed: 22, life: 1.5, radius: 0.25, width: 0.9 },
      { level: 5, damage: 86, cadence: 0.67, count: 5, speed: 23, life: 1.55, radius: 0.26, width: 0.9 },
    ],
  },
  rail: {
    id: 'rail',
    name: 'Rail Lance',
    description: 'Piercing line that cuts through dense packs.',
    color: '#ff7ab8',
    levels: [
      // The second rail at L5 is the explicit breakpoint; L3 and L4 widen the single
      // lane instead of adding one, which is why neither takes a tier name.
      { level: 1, damage: 100, cadence: 1.885, count: 1, width: 0.95, length: 16 },
      { level: 2, damage: 115, cadence: 1.7, count: 1, width: 1.02, length: 16.5 },
      { level: 3, damage: 118, cadence: 1.3568, count: 1, width: 1.08, length: 17 },
      { level: 4, damage: 144, cadence: 1.254, count: 1, width: 1.2, length: 17.5 },
      { tier: 'Lance Battery', level: 5, damage: 174, cadence: 2.1183, count: 2, width: 1.1, length: 18 },
    ],
  },
  gravity: {
    id: 'gravity',
    name: 'Gravity Pulse',
    description: 'Collapsing well that damages once, then holds what it caught.',
    color: '#6a2fb5',
    levels: [
      /*
       * `life` is the control window (endless-2.8.0), not a visual fade.
       *
       * The well persists and holds the ground it collapsed on. Damage still lands
       * exactly once per enemy per well — the field is *control*, not a damage-over-time
       * that would quietly rewrite the weapon's damage contract.
       *
       * Duration is deliberately **flat across levels**. A persistent field damages the
       * enemies that walk into it, so a per-level duration ramp is a per-level damage
       * ramp in disguise: the first draft grew it 1.0 → 1.5 and pushed L3's effective
       * gain to 0.448 against a 0.40 ceiling, adding a growth axis this weapon was never
       * authored to have. The authored axes stay damage, cadence, radius, and the second
       * well at L5 as the declared breakpoint; duration is a property of the mechanic.
       */
      { level: 1, damage: 44, cadence: 2.25, count: 1, radius: 2.7, life: 1.05 },
      { level: 2, damage: 48, cadence: 1.952, count: 1, radius: 2.8, life: 1.05 },
      { level: 3, damage: 54, cadence: 1.764, count: 1, radius: 2.9, life: 1.05 },
      { level: 4, damage: 60, cadence: 1.633, count: 1, radius: 3.0, life: 1.05 },
      { tier: 'Event Horizon', level: 5, damage: 73, cadence: 2.605, count: 2, radius: 3.1, life: 1.05 },
    ],
  },
  boomerang: {
    id: 'boomerang',
    name: 'Cosmic Boomerang',
    description: 'Thrown disc that carves out, turns, and cuts back through the same lane.',
    color: '#7ce8ff',
    levels: [
      /*
       * The identity is the *return*: every throw is two passes through the same lane, so
       * the weapon rewards throwing across the horde's approach rather than at whatever
       * is nearest. Damage stays modest per hit because each throw gets two chances at
       * every body it passes, and pierce is effectively unlimited within a leg — the
       * limit is geometry, not a hit counter.
       *
       * Growth comes from reach and turn distance through L4; the second disc is the
       * declared L5 breakpoint, thrown on a diverging bearing so Twin Orbit covers a
       * cone rather than doubling one lane.
       */
      { level: 1, damage: 34, cadence: 1.55, count: 1, speed: 15, radius: 0.5, life: 2.6 },
      { level: 2, damage: 38, cadence: 1.42, count: 1, speed: 15.5, radius: 0.55, life: 2.8 },
      { level: 3, damage: 44, cadence: 1.34, count: 1, speed: 16, radius: 0.6, life: 3.0 },
      { level: 4, damage: 48, cadence: 1.24, count: 1, speed: 16.5, radius: 0.63, life: 3.15 },
      // Curved return geometry adds real coverage. Keep Twin Orbit inside the authored
      // 3.0–4.2 effective progression band instead of letting that coverage become a
      // hidden fifth growth axis.
      { tier: 'Twin Orbit', level: 5, damage: 49, cadence: 1.44, count: 2, speed: 17, radius: 0.66, life: 3.4 },
    ],
  },
  rocket: {
    id: 'rocket',
    name: 'Rocket Barrage',
    description: 'Visible mini-rockets launch from the hero and burst on impact.',
    color: '#ff8a4a',
    levels: [
      /*
       * Rutherford begins with a real distributed salvo. Growth then comes from cadence,
       * blast coverage and more launchers rather than from making the starter weak and
       * asking upgrades to repair it.
       *
       * No level here carries a tier name, and that is a finding rather than an
       * oversight: nothing in L1-L5 changes what Rocket Barrage *is*. It fires more
       * rockets, faster, with a slightly wider burst. The 2.8.0 tables called L3 "Salvo",
       * L4 "Cluster" and L5 "Carpet Fire", which told the player their weapon had been
       * replaced three times — and two of those names promised mechanics that do not
       * exist. Rockets never split, so nothing here is a cluster payload; the pattern
       * never becomes area saturation, so nothing here is carpet fire. If Rocket Barrage
       * is to earn a transformation it needs a mechanic, not a noun.
       */
      { level: 1, damage: 46, cadence: 1.65, count: 4, radius: 1.6, life: 0.36 },
      { level: 2, damage: 52, cadence: 1.5, count: 4, radius: 1.64, life: 0.34 },
      { level: 3, damage: 57, cadence: 1.25, count: 4, radius: 1.68, life: 0.32 },
      { level: 4, damage: 59, cadence: 1.6, count: 6, radius: 1.73, life: 0.3 },
      { level: 5, damage: 72, cadence: 1.5, count: 7, radius: 1.8, life: 0.28 },
    ],
  },
  bioplasma: {
    id: 'bioplasma',
    name: 'Bio-Plasma Glob',
    description: 'Toxic green globs that splash and leave corrosive residue.',
    color: '#5dff6a',
    levels: [
      // Impact and corrosion scale together so the residue identity never falls behind.
      {
        level: 1,
        damage: 38,
        cadence: 0.626,
        count: 1,
        speed: 20,
        radius: 0.32,
        life: 1.45,
        splash: 1.55,
        puddleRadius: 1.3,
        puddleLife: 1.45,
        puddleDamage: 4.5,
      },
      {
        level: 2,
        damage: 43,
        cadence: 0.487,
        count: 1,
        speed: 21,
        radius: 0.34,
        life: 1.5,
        splash: 1.6,
        puddleRadius: 1.35,
        puddleLife: 1.55,
        puddleDamage: 5.0,
      },
      {
        level: 3,
        damage: 47,
        cadence: 0.401,
        count: 1,
        speed: 21.5,
        radius: 0.36,
        life: 1.55,
        splash: 1.65,
        puddleRadius: 1.4,
        puddleLife: 1.7,
        puddleDamage: 5.6,
      },
      {
        // One glob becomes two.
        tier: 'Twin Globs',
        level: 4,
        damage: 53,
        cadence: 0.648,
        count: 2,
        speed: 22,
        radius: 0.34,
        life: 1.55,
        splash: 1.65,
        puddleRadius: 1.4,
        puddleLife: 1.7,
        puddleDamage: 6.2,
      },
      {
        // Impacts learn to bounce and split — the weapon stops being one glob at a time.
        tier: 'Virulent Cascade',
        level: 5,
        damage: 58,
        cadence: 0.897,
        count: 2,
        speed: 22.5,
        radius: 0.36,
        life: 1.6,
        splash: 1.72,
        puddleRadius: 1.5,
        puddleLife: 1.8,
        puddleDamage: 6.9,
        bounce: 1,
        split: 1,
      },
    ],
  },

  rotary: {
    id: 'rotary',
    name: 'Rotary Cannon',
    description: 'Rapid machine-gun fire for sustained priority-target damage.',
    color: '#ffe28a',
    levels: [
      { level: 1, damage: 11, cadence: 0.16, count: 1, speed: 34, life: 1.05, radius: 0.16 },
      { level: 2, damage: 13, cadence: 0.145, count: 1, speed: 35, life: 1.08, radius: 0.17 },
      { level: 3, damage: 15, cadence: 0.13, count: 1, speed: 36, life: 1.1, radius: 0.18 },
      { level: 4, damage: 18, cadence: 0.118, count: 1, speed: 37, life: 1.12, radius: 0.19 },
      { tier: 'Twin Barrels', level: 5, damage: 20, cadence: 0.19, count: 2, speed: 38, life: 1.15, radius: 0.2 },
    ],
  },
  'plasma-wake': {
    id: 'plasma-wake',
    name: 'Plasma Wake',
    description: 'Movement leaves a burning energy trail that punishes pursuit.',
    color: '#ff6f4d',
    levels: [
      /*
       * 2.7.0: `life` is the *trail lifetime*, roughly doubled at L1 and raised through
       * the line. Segments are emitted by distance rather than by `cadence` (see
       * SURVIVOR.plasmaTrail), so `cadence` now only bounds how often the emitter may
       * add a piece; coverage comes from lifetime and speed. `radius` is the
       * cross-track half-width basis, preserving the wide/thin identity.
       */
      { level: 1, damage: 54, cadence: 0.34, count: 1, radius: 1.15, life: 3.6 },
      { level: 2, damage: 66, cadence: 0.31, count: 1, radius: 1.22, life: 3.8 },
      { level: 3, damage: 78, cadence: 0.28, count: 1, radius: 1.3, life: 4.0 },
      { level: 4, damage: 90, cadence: 0.25, count: 1, radius: 1.4, life: 4.2 },
      { tier: 'Twin Wake', level: 5, damage: 99, cadence: 0.55, count: 2, radius: 1.5, life: 4.5 },
    ],
  },
  pulsar: {
    id: 'pulsar',
    name: 'Pulsar Core',
    description: 'A periodic radial discharge centered on the hero.',
    color: '#b899ff',
    levels: [
      { level: 1, damage: 42, cadence: 3.2, count: 1, radius: 8.0, life: 0.35 },
      { level: 2, damage: 54, cadence: 3.2, count: 1, radius: 8.0, life: 0.38 },
      { level: 3, damage: 70, cadence: 3.2, count: 1, radius: 8.0, life: 0.42 },
      { level: 4, damage: 90, cadence: 3.2, count: 1, radius: 8.0, life: 0.46 },
      { tier: 'Echo Pulsar', level: 5, damage: 108, cadence: 3.2, count: 2, radius: 8.0, life: 0.5 },
    ],
  },

  arc: {
    id: 'arc',
    name: 'Arc Conductor',
    description: 'Chain lightning that jumps between hostiles and bosses.',
    color: '#88eeff',
    prototype: true,
    unlockTime: 300,
    levels: [
      // Chain count doubles across the span. L5 is the declared breakpoint.
      { level: 1, damage: 50, cadence: 1.15, count: 1, radius: 3.2, pierce: 2 },
      { level: 2, damage: 57, cadence: 0.974, count: 1, radius: 3.5, pierce: 2 },
      { level: 3, damage: 64, cadence: 1.051, count: 1, radius: 3.8, pierce: 3 },
      { level: 4, damage: 72, cadence: 0.931, count: 1, radius: 4.1, pierce: 3 },
      { tier: 'Forked Conduction', level: 5, damage: 80, cadence: 0.816, count: 1, radius: 4.4, pierce: 4, splash: 1.2 },
    ],
  },
  orbital: {
    id: 'orbital',
    name: 'Orbital Lance',
    description: 'Delayed orbital strike that prefers bosses and dense elites.',
    color: '#ffd46a',
    prototype: true,
    unlockTime: 900,
    levels: [
      // Second lance is the explicit breakpoint at L5.
      // Orbital grows through strike power, not cadence: its identity is a small number
      // of heavy, telegraphed impacts, and a slow weapon measured over a fixed window is
      // dominated by shot quantisation if growth is pushed through cadence instead.
      // 2.7.0 widens the core impact substantially. Orbital's 2.6.1 problem was never
      // hit strength (304 max hit) — it was coverage: 2.6% of a 21:18 run because a
      // 2.1-2.6 radius simply missed most of what was on screen. `radius` is the
      // high-damage core; the wider shockwave is derived from it in SURVIVOR.orbital.
      { level: 1, damage: 140, cadence: 4.2, count: 1, radius: 3.2, life: 0.85 },
      { level: 2, damage: 168, cadence: 4.0, count: 1, radius: 3.45, life: 0.8 },
      { level: 3, damage: 205, cadence: 3.8, count: 1, radius: 3.7, life: 0.78 },
      { level: 4, damage: 250, cadence: 3.6, count: 1, radius: 3.95, life: 0.72 },
      { tier: 'Judgment Array', level: 5, damage: 290, cadence: 5.9, count: 2, radius: 4.25, life: 0.68 },
    ],
  },

};

export type PassiveId =
  | 'move-speed'
  | 'pickup-radius'
  | 'max-health'
  | 'regen'
  | 'weapon-haste'
  | 'area'
  /**
   * Single Mech passive (2.7.0). Replaces the two separately-weak passives
   * `mech-cycle` (Core Cycling) and `mech-duration` (Reactor Hold), neither of which
   * was worth a card slot on its own.
   */
  | 'overdrive-systems'
  | 'breach-shielding'
  /** Ship survivability passive (endless-2.8.0); see `shipDamageTakenMul`. */
  | 'reinforced-airframe';

export interface PassiveDef {
  id: PassiveId;
  name: string;
  description: string;
  /** Hard cap; Infinity for safe repeatable passives. */
  maxLevel: number;
  perLevel: number;
  /** When true, levels past 5 use diminishing gains and display forever. */
  repeatable?: boolean;
}

export const PASSIVES: PassiveDef[] = [
  {
    id: 'move-speed',
    name: 'Thruster Boost',
    description:
      'Move 6% faster per level, up to +30%, to cross attack lanes and keep combat spacing.',
    maxLevel: 5,
    perLevel: 0.06,
  },
  {
    id: 'pickup-radius',
    name: 'Magnet Field',
    description:
      'Extend energy and repair reach, and pull both pickup types toward you faster.',
    maxLevel: 5,
    perLevel: 0.55,
  },
  {
    id: 'max-health',
    name: 'Hull Plating',
    description: 'Increase max integrity.',
    maxLevel: Infinity,
    perLevel: 14,
    repeatable: true,
  },
  {
    id: 'regen',
    name: 'Nanite Bleed',
    description:
      'Regenerate after two safe seconds and increase the healing delivered by repair orbs.',
    maxLevel: Infinity,
    perLevel: 0.004,
    repeatable: true,
  },
  {
    id: 'weapon-haste',
    name: 'Weapon Overclock',
    description: 'All weapons fire faster (+5.5% per level, max ~28%).',
    maxLevel: 5,
    perLevel: 0.055,
  },
  {
    id: 'area',
    name: 'Containment Field',
    description: 'Larger weapon areas and blasts (+5.5% radius per level).',
    maxLevel: 5,
    perLevel: 0.055,
  },
  {
    id: 'overdrive-systems',
    name: 'Overdrive Systems',
    description:
      'Extend Mech Overdrive, shorten its activation-to-activation cooldown, and move faster while transformed.',
    maxLevel: 5,
    // Representative per-level step; the authored table below is authoritative.
    perLevel: 0.03,
  },
  {
    id: 'breach-shielding',
    name: 'Breach Shielding',
    description: 'Reduces damage from boss attacks by 8% per level (hard-capped).',
    maxLevel: 5,
    perLevel: 0.08,
  },
  {
    id: 'reinforced-airframe',
    name: 'Reinforced Airframe',
    description:
      'Afterburner takes 5% less damage per level, rising from 50% baseline mitigation to 75% at L5.',
    maxLevel: 5,
    perLevel: 0.05,
  },
];

/**
 * Ship damage taken, after the Reinforced Airframe passive (endless-2.8.0).
 *
 * endless-2.7.0 granted an 80% flat reduction to every ship activation from the first
 * second of the run. That is what made the form a safe button rather than a commitment,
 * and it was the identified cause of that release's upper-tail expansion: a player who
 * could stay in ship form was very hard to kill, so good runs ran away from the pack.
 *
 * Baseline mitigation is now 50%, with the remaining 25 points moved behind a passive.
 * The ceiling is unchanged at 75% — a fully-invested build gets close to what every
 * build used to get free — but reaching it costs five card slots that could have gone to
 * damage. That is the trade the form should have been asking for all along.
 */
export function shipDamageTakenMul(reinforcedAirframeLevel: number): number {
  const lv = Math.max(0, Math.min(5, Math.floor(reinforcedAirframeLevel)));
  return Math.max(SHIP_MITIGATION_FLOOR, SURVIVOR.ship.damageTakenMul - lv * 0.05);
}

/** Hard floor on ship damage taken: 75% mitigation, never invulnerability. */
export const SHIP_MITIGATION_FLOOR = 0.25;

/**
 * Player-facing display name for any authored content name (endless-2.8.0).
 *
 * Weapon, passive and boss names are authored in Title Case in the content tables, and
 * the presentation layer used to shout them with scattered `.toUpperCase()` calls at
 * each site. That put the same decision in four places, made "Bio-Plasma Glob" render as
 * "BIO-PLASMA GLOB", and meant a name with intentional casing could never keep it.
 *
 * This is the one place the decision lives: the authored name is the display name.
 * Emphasis belongs to CSS, which can shout without destroying the underlying string.
 */
export function displayName(authored: string): string {
  return authored.trim();
}

/** Hard-capped Thruster Boost movement bonus. */
export function moveSpeedBonus(level: number): number {
  return Math.min(0.3, Math.max(0, level) * 0.06);
}

/**
 * Overdrive Systems (2.7.0) — the single Mech passive.
 *
 * This is an **authored table**, not three independent formulas, because the three
 * properties it moves are read together: the player is choosing a Mech uptime and a
 * Mech mobility, and the card shows the exact resulting numbers. Level 0 is the
 * uninvested baseline and must agree with `SURVIVOR.mech`.
 *
 * Level 5 is deliberately `7.0 / 28.0` — exactly 25% scheduled uptime, a round,
 * explainable ceiling rather than an artefact of compounding percentages. The former
 * pair (Core Cycling -3%/level and Reactor Hold +5%/level) reached only 7.5s of 25.5s
 * and required *two* fully-invested passives to do it.
 */
export const OVERDRIVE_SYSTEMS = [
  { level: 0, duration: 6.0, cooldown: 30.0, speedBonus: 0.0 },
  { level: 1, duration: 6.2, cooldown: 29.6, speedBonus: 0.03 },
  { level: 2, duration: 6.4, cooldown: 29.2, speedBonus: 0.06 },
  { level: 3, duration: 6.6, cooldown: 28.8, speedBonus: 0.09 },
  { level: 4, duration: 6.8, cooldown: 28.4, speedBonus: 0.12 },
  { level: 5, duration: 7.0, cooldown: 28.0, speedBonus: 0.15 },
] as const;

/** Authored Overdrive Systems row, clamped to the hard-capped 0-5 range. */
export function overdriveRow(level: number): (typeof OVERDRIVE_SYSTEMS)[number] {
  const lv = Math.max(0, Math.min(OVERDRIVE_SYSTEMS.length - 1, Math.floor(level || 0)));
  return OVERDRIVE_SYSTEMS[lv]!;
}

/** Mech active duration in seconds at the given Overdrive Systems level. */
export function mechDurationAtLevel(level: number): number {
  return overdriveRow(level).duration;
}

/** Mech activation-to-activation cooldown in seconds at the given level. */
export function mechCooldownAtLevel(level: number): number {
  return overdriveRow(level).cooldown;
}

/**
 * Mech-only movement bonus.
 *
 * Applied **multiplicatively after** ordinary Thruster Boost, so a fully invested build
 * reaches `1.30 x 1.15 = 1.495` — +49.5% against unupgraded astronaut speed while Mech
 * is active. Ship speed is a separate multiplier and is unaffected.
 */
export function mechSpeedBonusAtLevel(level: number): number {
  return overdriveRow(level).speedBonus;
}

/**
 * Best achievable Mech uptime with Overdrive Systems fully invested.
 * Duration / cooldown — exactly 0.25 at L5.
 */
export function maxMechUptimeFraction(): number {
  return mechDurationAtLevel(5) / mechCooldownAtLevel(5);
}

/** Scheduled Mech uptime fraction at any Overdrive Systems level. */
export function mechUptimeFractionAtLevel(level: number): number {
  return mechDurationAtLevel(level) / mechCooldownAtLevel(level);
}

/** Integrity gained when taking Hull Plating to the given absolute level. */
export function hullPlatingGainAtLevel(level: number): number {
  if (level <= 0) return 0;
  if (level <= 5) return 14;
  // L6+: smaller linear gains
  return 7;
}

/** Total max-health from N levels of Hull Plating. */
export function hullPlatingTotal(levels: number): number {
  let t = 0;
  for (let i = 1; i <= levels; i += 1) t += hullPlatingGainAtLevel(i);
  return t;
}

/**
 * Nanite Bleed regeneration, as a **fraction of maximum integrity per second**.
 *
 * This is the single authoritative implementation. endless-2.2.1 carried both a
 * `regenPerLevel: 0.45` constant on `SURVIVOR` and a `level * 0.22` formula here that
 * disagreed with it; the constant was dead and the flat 0.22 HP/s was worthless on a
 * plated hull. Scaling with max integrity keeps the passive attractive at every stage
 * without letting linear stacking trivialise Collapse.
 *
 * L1 0.4%/s · L3 1.2%/s · L5 2.0%/s, then strong diminishing returns.
 */
export function regenFractionAtLevel(level: number): number {
  const lv = Math.max(0, Math.floor(level));
  if (lv <= 0) return 0;
  if (lv <= 5) return lv * 0.004;
  return 0.02 + 0.0012 * Math.sqrt(lv - 5);
}

/** Absolute regeneration per second for a given Nanite Bleed level and hull size. */
export function regenPerSecondAtLevel(level: number, maxHealth: number = SURVIVOR.playerMaxHealth): number {
  return regenFractionAtLevel(level) * maxHealth;
}

/**
 * Nanite Bleed also improves repair-orb healing: +10% per level through L5, then
 * strong diminishing returns so endless levels cannot restore the unlimited faucet
 * the bounded repair economy replaced.
 */
export function repairOrbBonusAtLevel(level: number): number {
  const lv = Math.max(0, Math.floor(level));
  if (lv <= 0) return 0;
  if (lv <= 5) return lv * 0.1;
  return 0.5 + 0.03 * Math.sqrt(lv - 5);
}

/** Total boss damage reduction from Breach Shielding (hard-capped ~0.6). */
export function breachShieldingReduction(level: number): number {
  return Math.min(0.6, Math.max(0, level) * 0.08);
}

/** Capped permanent-build power scale for thruster/wake damage. */
export function playerPowerScale(input: {
  weapons: Array<{ level: number }>;
  passives: Partial<Record<PassiveId, number>>;
}): number {
  const owned = Math.max(1, input.weapons.length);
  const totalWeaponLevels = input.weapons.reduce((n, w) => n + w.level, 0);
  const weaponGrowth = Math.max(0, totalWeaponLevels - owned);
  // Cap passive contribution so endless plating doesn't infinitely thruster-scale
  const passiveGrowth = Math.min(
    40,
    Object.values(input.passives).reduce((n, v) => n + (v ?? 0), 0),
  );
  // Stronger growth so thrusters stay relevant midgame (still hard-capped)
  return Math.min(SURVIVOR.ship.powerScaleCap, 1 + 0.18 * weaponGrowth + 0.05 * passiveGrowth);
}

export type BossRole = 'brute' | 'charger' | 'caster' | 'summoner' | 'flyer';

export interface BossDef {
  id: string;
  displayName: string;
  url: string;
  targetHeight: number;
  colliderRadius: number;
  visualScale: number;
  role: BossRole;
  accent: string;
  anim: {
    idle: string[];
    walk: string[];
    attack: string[];
    hit: string[];
    death: string[];
  };
  preferredPatterns: Array<BossPatternId>;
  uniquePattern: BossPatternId;
}

export type BossPatternId =
  | 'pulse'
  | 'line'
  | 'fan'
  | 'summon'
  | 'breach-orb'
  | 'contamination'
  | 'rupture-ring'
  | 'cryo-lanes'
  | 'ravage-charge'
  | 'sweeping-beam'
  | 'aerial-strafe'
  | 'spore-bloom'
  | 'gravity-collapse'
  | 'cataclysm';

/** Authoritative list for exhaustive tests/handlers. */
export const ALL_BOSS_PATTERNS: readonly BossPatternId[] = [
  'pulse',
  'line',
  'fan',
  'summon',
  'breach-orb',
  'contamination',
  'rupture-ring',
  'cryo-lanes',
  'ravage-charge',
  'sweeping-beam',
  'aerial-strafe',
  'spore-bloom',
  'gravity-collapse',
  'cataclysm',
] as const;

export const MEGA_ONLY_PATTERNS: readonly BossPatternId[] = ['gravity-collapse', 'cataclysm'] as const;

export function isMegaOnlyPattern(id: BossPatternId): boolean {
  return id === 'gravity-collapse' || id === 'cataclysm';
}

export function assertNever(x: never): never {
  throw new Error(`Unhandled boss pattern: ${String(x)}`);
}


export const BOSS_DEFS: BossDef[] = [
  {
    id: 'blue-demon',
    displayName: 'Breach Demon',
    url: '/runtime/boss/blue-demon.gltf',
    targetHeight: 3.6,
    colliderRadius: 0.95,
    visualScale: 3.7,
    role: 'brute',
    accent: '#ff4455',
    anim: { idle: ['Idle'], walk: ['Walk', 'Run'], attack: ['Punch', 'Weapon', 'Jump'], hit: ['HitReact'], death: ['Death'] },
    preferredPatterns: ['pulse', 'line', 'fan', 'summon', 'breach-orb', 'contamination'],
    uniquePattern: 'rupture-ring',
  },
  {
    id: 'yeti',
    displayName: 'Frost Warden',
    url: '/runtime/boss/yeti.gltf',
    targetHeight: 3.8,
    colliderRadius: 1.05,
    visualScale: 3.8,
    role: 'brute',
    accent: '#88c8ff',
    anim: { idle: ['Idle'], walk: ['Walk', 'Run'], attack: ['Punch', 'Weapon', 'Jump'], hit: ['HitReact'], death: ['Death'] },
    preferredPatterns: ['pulse', 'line', 'summon', 'breach-orb', 'contamination'],
    uniquePattern: 'cryo-lanes',
  },
  {
    id: 'dino',
    displayName: 'Containment Saurian',
    url: '/runtime/boss/dino.gltf',
    targetHeight: 3.5,
    colliderRadius: 1.0,
    visualScale: 3.6,
    role: 'charger',
    accent: '#7dff9a',
    anim: { idle: ['Idle'], walk: ['Walk', 'Run'], attack: ['Punch', 'Bite_Front', 'Jump'], hit: ['HitReact'], death: ['Death'] },
    preferredPatterns: ['line', 'pulse', 'fan', 'breach-orb', 'contamination'],
    uniquePattern: 'ravage-charge',
  },
  {
    id: 'demon',
    displayName: 'Crimson Overseer',
    url: '/runtime/boss/demon.gltf',
    targetHeight: 3.7,
    colliderRadius: 0.98,
    visualScale: 3.76,
    role: 'caster',
    accent: '#ff3366',
    anim: { idle: ['Idle'], walk: ['Walk', 'Run'], attack: ['Punch', 'Weapon', 'Jump'], hit: ['HitReact'], death: ['Death'] },
    preferredPatterns: ['fan', 'pulse', 'line', 'breach-orb', 'contamination'],
    uniquePattern: 'sweeping-beam',
  },
  {
    id: 'dragon',
    displayName: 'Void Drake',
    url: '/runtime/boss/dragon.gltf',
    targetHeight: 3.4,
    colliderRadius: 1.1,
    visualScale: 3.5,
    role: 'flyer',
    accent: '#c080ff',
    anim: { idle: ['Flying_Idle', 'Idle'], walk: ['Fast_Flying', 'Fly'], attack: ['Punch', 'Headbutt', 'Attack'], hit: ['HitReact'], death: ['Death'] },
    preferredPatterns: ['fan', 'line', 'summon', 'breach-orb', 'contamination'],
    uniquePattern: 'aerial-strafe',
  },
  {
    id: 'mushroom-king',
    displayName: 'Spore Sovereign',
    url: '/runtime/boss/mushroom-king.gltf',
    targetHeight: 3.5,
    colliderRadius: 1.15,
    visualScale: 3.9,
    role: 'summoner',
    accent: '#ffaa44',
    anim: { idle: ['Idle'], walk: ['Walk', 'Run'], attack: ['Punch', 'Weapon', 'Jump'], hit: ['HitReact'], death: ['Death'] },
    preferredPatterns: ['summon', 'pulse', 'fan', 'breach-orb', 'contamination'],
    uniquePattern: 'spore-bloom',
  },
];

/** Deterministic boss model for schedule index n (1-based). Avoids immediate repeats. */
export function bossDefForIndex(index: number): BossDef {
  const n = Math.max(1, Math.floor(index));
  const len = BOSS_DEFS.length;
  // Rotate with offset so consecutive bosses differ
  const idx = (n - 1 + Math.floor((n - 1) / len)) % len;
  return BOSS_DEFS[idx]!;
}

export function heroStarterWeapon(heroId: HeroId): WeaponId {
  switch (heroId) {
    case 'bee':
      return 'microdrone';
    case 'flamingo':
      return 'rail';
    case 'frog':
      return 'bioplasma';
    case 'red-panda':
      return 'rocket';
  }
}

/** Hero identity weapons never enter another hero's shared arsenal. */
export const SIGNATURE_WEAPONS: readonly WeaponId[] = [
  'microdrone',
  'rail',
  'bioplasma',
  'rocket',
] as const;

export function isSignatureWeapon(id: WeaponId): boolean {
  return SIGNATURE_WEAPONS.includes(id);
}

/** Authored L1–L5 only (clamped). Prefer weaponStatsAtLevel for combat. */
export function weaponLevelDef(weaponId: WeaponId, level: number): WeaponLevelDef {
  const fam = WEAPONS[weaponId];
  const idx = Math.max(0, Math.min(fam.levels.length - 1, level - 1));
  return fam.levels[idx]!;
}

export function overclockLevel(displayedLevel: number): number {
  return Math.max(0, Math.floor(displayedLevel) - 5);
}

/** Overclock I…X then Arabic for larger values. */
export function formatOverclockLabel(oc: number): string {
  if (oc <= 0) return '';
  if (oc <= 10) {
    const romans = ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X'];
    return `Overclock ${romans[oc - 1]}`;
  }
  return `Overclock ${oc}`;
}

/**
 * Complete weapon stats at any displayed level.
 * L1–L5: authored definitions.
 * L6+: Level-5 structure + additive damage Overclocks (never mutates authored data).
 */
export function weaponStatsAtLevel(weaponId: WeaponId, displayedLevel: number): WeaponLevelDef {
  const fam = WEAPONS[weaponId];
  const level = Math.max(1, Math.floor(displayedLevel));
  if (level <= fam.levels.length) {
    return { ...fam.levels[level - 1]! };
  }
  const base = fam.levels[fam.levels.length - 1]!;
  const oc = overclockLevel(level);
  const mul = 1 + OVERCLOCK_DAMAGE_PER_LEVEL * oc;
  return {
    ...base,
    level,
    // An Overclock is not a new tier: it keeps the L5 structure, including whatever
    // tier name L5 carried.
    damage: base.damage * mul,
    puddleDamage: base.puddleDamage != null ? base.puddleDamage * mul : undefined,
  };
}

/** Primary damage delta text for upgrade cards. */
export function weaponDamagePreview(weaponId: WeaponId, fromLevel: number, toLevel: number): string {
  const a = weaponStatsAtLevel(weaponId, fromLevel);
  const b = weaponStatsAtLevel(weaponId, toLevel);
  const lines: string[] = [];
  const dmgA = Math.round(a.damage);
  const dmgB = Math.round(b.damage);
  if (dmgA !== dmgB) {
    const label = weaponId === 'bioplasma' ? 'Impact' : 'Damage';
    lines.push(`${label} ${dmgA} → ${dmgB}`);
  }
  if (a.puddleDamage != null && b.puddleDamage != null) {
    const pa = Math.round(a.puddleDamage);
    const pb = Math.round(b.puddleDamage);
    if (pa !== pb) lines.push(`Puddle ${pa} → ${pb}`);
  }
  if (lines.length === 0) lines.push(WEAPONS[weaponId].description);
  return lines.join('\n');
}

export function isPassiveAvailable(id: PassiveId, currentLevel: number): boolean {
  const def = PASSIVES.find((p) => p.id === id);
  if (!def) return false;
  if (!Number.isFinite(def.maxLevel)) return true;
  return currentLevel < def.maxLevel;
}

export function xpForLevel(level: number): number {
  return Math.floor(12 + level * 8 + level * level * 1.6);
}

/**
 * Melee-only horde AI roles. Ordinary enemies never fire projectiles.
 * Models keep their previous visuals; behavior is role-driven.
 */
export type HordeRole =
  | 'fodder'
  | 'sprinter'
  | 'flanker'
  | 'hunter'
  | 'bruiser'
  | 'elite'
  | 'miniboss';

export interface HordeEnemyDef {
  id: string;
  role: HordeRole;
  visual: EnemyDef;
  xp: number;
  /** Base world speed at opening (before global speedMul). */
  baseSpeed: number;
  /** Contact damage at opening (before damageMul). */
  contactDamage: number;
  /** Relative HP vs visual maxHealth (1 = pack default). */
  healthScale: number;
  isElite?: boolean;
  isMiniboss?: boolean;
}

/**
 * Opening horde statistics.
 *
 * `baseSpeed` is the value at 0:00; the global speed curve (`enemySpeedMulAt`) is the
 * only thing that scales it over a run, and that curve is now deliberately shallow.
 * `contactDamage` is likewise the 0:00 value, scaled by `contactDamageMulAt`.
 *
 * Player speed is 6.4, so every opening speed leaves real kiting headroom — the
 * endless-2.2.1 opening (3.3–4.35) closed that gap far too early.
 */
export const HORDE: Record<string, HordeEnemyDef> = {
  basic: {
    id: 'basic',
    role: 'fodder',
    visual: MELEE_BLOB,
    xp: 3,
    baseSpeed: 3.0,
    contactDamage: 10,
    healthScale: 0.85,
  },
  mush: {
    id: 'mush',
    role: 'fodder',
    visual: MELEE_MUSHNUB,
    xp: 3,
    baseSpeed: 2.8,
    contactDamage: 10,
    healthScale: 0.9,
  },
  fast: {
    id: 'fast',
    role: 'sprinter',
    visual: MELEE_ALIEN,
    xp: 4,
    baseSpeed: 3.7,
    contactDamage: 12,
    healthScale: 0.75,
  },
  spiky: {
    id: 'spiky',
    role: 'sprinter',
    visual: MELEE_SPIKY,
    xp: 5,
    baseSpeed: 3.8,
    contactDamage: 13,
    healthScale: 0.8,
  },
  // Former ranged models → melee pressure archetypes
  flyer: {
    id: 'flyer',
    role: 'flanker',
    visual: RANGED_GOLELING,
    xp: 6,
    baseSpeed: 3.5,
    contactDamage: 12,
    healthScale: 1.0,
  },
  ghost: {
    id: 'ghost',
    role: 'hunter',
    visual: RANGED_GHOST,
    xp: 6,
    baseSpeed: 3.55,
    contactDamage: 14,
    healthScale: 1.05,
  },
  bee: {
    id: 'bee',
    role: 'flanker',
    visual: RANGED_ARMABEE,
    xp: 5,
    baseSpeed: 3.6,
    contactDamage: 11,
    healthScale: 0.7,
  },
  bruiser: {
    id: 'bruiser',
    role: 'bruiser',
    visual: MELEE_ORC,
    xp: 12,
    baseSpeed: 2.6,
    contactDamage: 20,
    healthScale: 2.4,
  },
  elite: {
    id: 'elite',
    role: 'elite',
    visual: RANGED_SQUIDLE,
    xp: 28,
    baseSpeed: 3.3,
    contactDamage: 24,
    /**
     * Sized so an elite carries ~10× a same-time fodder enemy's effective health
     * (see `eliteHealthRatio`). This is the whole of its durability — elites take
     * full damage and can always be focused down.
     */
    healthScale: 9.0,
    isElite: true,
  },
  miniboss: {
    id: 'miniboss',
    role: 'miniboss',
    visual: MELEE_ORC,
    xp: 120,
    baseSpeed: 2.8,
    contactDamage: 28,
    healthScale: 1,
    isElite: true,
    isMiniboss: true,
  },
};

/**
 * Effective elite health as a multiple of a same-time fodder enemy.
 * Pure function of the content tables — the design target is 8–12×.
 */
export function eliteHealthRatio(): number {
  const elite = HORDE.elite!;
  const fodder = HORDE.basic!;
  const eliteHp = elite.visual.maxHealth * elite.healthScale;
  const fodderHp = fodder.visual.maxHealth * fodder.healthScale;
  return eliteHp / fodderHp;
}

/**
 * Earliest survival time (seconds) at which each horde definition may enter play.
 *
 * Single source of truth for the opening ramp: ordinary composition, pressure-director
 * surges, forced elite spawns and boss summons all resolve through `isEnemyEligibleAt`,
 * so no path can introduce a specialist before its gate.
 */
export const ENEMY_GATE_TIME: Readonly<Record<string, number>> = {
  basic: 0,
  mush: 0,
  // Sprinters
  fast: 30,
  spiky: 60,
  // Flankers
  flyer: 60,
  bee: 60,
  // Heavies
  bruiser: 90,
  elite: 90,
  // Hunters
  ghost: 120,
  miniboss: 120,
};

/** Gate for a horde definition; unknown ids are treated as late specialists. */
export function enemyGateTime(defId: string): number {
  const gate = ENEMY_GATE_TIME[defId];
  return gate === undefined ? 120 : gate;
}

/** Central time eligibility check used by every spawn path. */
export function isEnemyEligibleAt(defId: string, time: number): boolean {
  // Small epsilon so a gate boundary reached by fixed-step accumulation still qualifies.
  return time + 1e-6 >= enemyGateTime(defId);
}

/** Fodder is always eligible and is the substitute for a gated request. */
export function isFodderEnemy(defId: string): boolean {
  return HORDE[defId]?.role === 'fodder';
}

/**
 * During the first minute a specialist is a rare event, not a wave.
 * At most this many specialists may be alive at once before 60s.
 */
export const FIRST_MINUTE_SPECIALIST_WINDOW = 60;
export const FIRST_MINUTE_SPECIALIST_CAP = 1;

export const MINIBOSS = {
  id: 'miniboss',
  name: 'Containment Warden',
  healthMul: 14,
  damageMul: 1.8,
  radiusMul: 2.0,
  speedMul: 0.9,
  xp: 140,
  specialWindup: 0.95,
  specialRadius: 4.2,
  specialDamage: 26,
  specialCd: 5.5,
} as const;

/** Boss damage category for physical hierarchy and telemetry. */
export type BossDamageCategory =
  | 'body'
  | 'charge'
  | 'projectile'
  | 'beam'
  | 'puddle'
  | 'radial';

/**
 * Base first-boss damage by category, before boss index/phase scaling.
 *
 * `projectile` is the reference ranged impact: the physical tiers are authored as
 * multiples of it, so "getting hit by the body" and "getting hit by a charge" have a
 * stated, checkable relationship to "getting hit by something the boss threw".
 *
 *   body   18 / 15 = 1.20x  (band 1.15–1.30)
 *   charge 22 / 15 = 1.47x  (band 1.40–1.60)
 *
 * endless-2.8.0 lowered body from 25 (1.67x) and charge from 32 (2.13x). Those numbers
 * were not the damage the player actually took: both physical paths multiplied
 * `bossCategoryDamage` — which already applies the boss-index and mega curves — by
 * `boss.damageMul`, which *is* those same curves. Physical damage therefore scaled with
 * the square of boss index while every pattern scaled linearly, so the "hierarchy"
 * diverged instead of holding: 1.25x a beam at boss 1 and over 3x by boss 13.
 * {@link bossDamageScale} is now the one curve every boss damage path multiplies by.
 */
export const BOSS_DAMAGE_BASE: Record<BossDamageCategory, number> = {
  projectile: 15,
  body: 18,
  charge: 22,
  beam: 16,
  puddle: 12,
  radial: 18,
};

/** The reference ranged impact the physical tiers are authored against. */
export const BOSS_REFERENCE_RANGED_DAMAGE = BOSS_DAMAGE_BASE.projectile;

export type BossPhase = 1 | 2 | 3;

export const SURVIVOR_BOSS = {
  ...BOSS_DEMON,
  /** Base health for first endless boss; scaled by bossDifficultyFor(n). */
  maxHealth: 5600,
  phase2Threshold: 0.66,
  phase3Threshold: 0.33,
  patterns: {
    pulse: { windup: 1.0, active: 0.7, recovery: 0.85, damage: 16, maxRadius: 8 },
    line: { windup: 0.9, active: 0.45, recovery: 0.95, damage: 20, length: 20, width: 1.25 },
    fan: { windup: 1.05, active: 0.18, recovery: 0.95, damage: 12, count: 5, speed: 10 },
    summon: { windup: 0.95, active: 0.12, recovery: 1.15, count: 5 },
    'breach-orb': { windup: 1.1, active: 0.2, recovery: 1.0, damage: 18, speed: 7 },
    contamination: { windup: 1.0, active: 0.35, recovery: 1.05, damage: 10, radius: 3.0, life: 6 },
    'rupture-ring': { windup: 1.15, active: 0.9, recovery: 1.1, damage: 18, maxRadius: 10 },
    'cryo-lanes': { windup: 1.1, active: 0.7, recovery: 1.15, damage: 14, length: 22, width: 1.1 },
    // The charge corridor is the sole consumer of the `charge` physical tier: it is the
    // telegraphed body impact, so it reads its damage from there rather than authoring a
    // second number that could drift away from the hierarchy.
    'ravage-charge': {
      windup: 1.2,
      active: 0.55,
      recovery: 1.2,
      damage: BOSS_DAMAGE_BASE.charge,
      length: 28,
      width: 1.4,
    },
    'sweeping-beam': { windup: 1.15, active: 1.4, recovery: 1.1, damage: 16, length: 24, width: 1.0 },
    'aerial-strafe': { windup: 1.0, active: 1.1, recovery: 1.0, damage: 14, length: 30, width: 1.6 },
    'spore-bloom': { windup: 1.05, active: 0.4, recovery: 1.2, damage: 12, count: 5, radius: 1.4 },
    'gravity-collapse': { windup: 1.3, active: 1.5, recovery: 1.3, damage: 22, maxRadius: 11 },
    cataclysm: { windup: 1.2, active: 2.0, recovery: 1.4, damage: 20, count: 4, radius: 3.2 },
  },
  phaseMods: {
    1: { recoveryMul: 1.0, damageMul: 1.0, fanCountAdd: 0, summonCount: 3, idleGap: 0.55 },
    2: { recoveryMul: 0.72, damageMul: 1.2, fanCountAdd: 2, summonCount: 5, idleGap: 0.38 },
    3: { recoveryMul: 0.55, damageMul: 1.4, fanCountAdd: 3, summonCount: 7, idleGap: 0.22 },
  },
} as const;

export interface EndlessDifficulty {
  healthMul: number;
  damageMul: number;
  speedMul: number;
  attackRateMul: number;
  targetActive: number;
  eliteChance: number;
  spawnRate: number;
  populationMin: number;
  populationMax: number;
}

/**
 * Global enemy movement-speed multiplier, in minutes.
 *
 * Raw speed must not be the reason every run ends. endless-2.2.1 reached 1.24× at
 * fifteen minutes, which made kiting impossible long before durability or density
 * were the real threat; 1.24× is now a fifty-minute value. Difficulty before then
 * comes from health, density, contact damage, specialists, bosses, boss backlog and
 * surge pressure — not from outrunning the player.
 *
 * The Containment Collapse layer deliberately contributes nothing here, so every
 * published anchor is exact at any survival time.
 */
export const ENEMY_SPEED_ANCHORS: ReadonlyArray<readonly [number, number]> = [
  [0, 1.0],
  [10, 1.03],
  [20, 1.06],
  [30, 1.1],
  [40, 1.16],
  [45, 1.2],
  [50, 1.24],
  [60, 1.32],
] as const;

/** Hard ceiling on raw speed however deep the run goes. */
export const ENEMY_SPEED_CAP = 1.7;

export function enemySpeedMulAt(timeSec: number): number {
  return Math.min(ENEMY_SPEED_CAP, curveAt(ENEMY_SPEED_ANCHORS, Math.max(0, timeSec) / 60));
}

/**
 * Contact-damage multiplier, in minutes.
 *
 * Flatter than endless-2.2.1's early ramp: individual hits are meaningful from the
 * opening (see the raised `contactDamage` bases) rather than becoming meaningful only
 * through a steep multiplier that then made mid-run swarms delete the player outright.
 * Past 45m the final segment's slope continues — that is the Collapse-era scaling.
 */
export const CONTACT_DAMAGE_ANCHORS: ReadonlyArray<readonly [number, number]> = [
  [0, 1.0],
  [10, 1.25],
  [20, 1.55],
  [30, 1.9],
  [45, 2.5],
] as const;

export const CONTACT_DAMAGE_CAP = 6.0;

export function contactDamageMulAt(timeSec: number): number {
  return Math.min(CONTACT_DAMAGE_CAP, curveAt(CONTACT_DAMAGE_ANCHORS, Math.max(0, timeSec) / 60));
}

/** Target concurrent living enemies, in minutes. Clamped to the hard enemy cap. */
export const POPULATION_ANCHORS: ReadonlyArray<readonly [number, number]> = [
  [0, 26],
  [5, 60],
  [10, 92],
  [15, 118],
  [20, 140],
  [25, 160],
] as const;

/** Spawns per second, in minutes. Collapse adds on top after 30m. */
export const SPAWN_RATE_ANCHORS: ReadonlyArray<readonly [number, number]> = [
  [0, 2.1],
  [5, 3.2],
  [10, 4.5],
  [15, 5.75],
  [20, 7.0],
  [25, 8.0],
  // Authored late tail so extrapolation never runs away; Collapse layers on top.
  [30, 8.5],
  [45, 9.4],
] as const;

/**
 * Elite share of the horde, in minutes.
 *
 * endless-2.2.1 reached ~31% at fifteen minutes, which is what made elites feel like
 * ordinary enemies. They stay rare through the mid game and keep climbing after,
 * with the Collapse layer adding on top past 30m.
 */
export const ELITE_CHANCE_ANCHORS: ReadonlyArray<readonly [number, number]> = [
  [0, 0.03],
  [5, 0.07],
  [10, 0.12],
  [15, 0.16],
  [20, 0.2],
  [25, 0.25],
  [35, 0.29],
  [45, 0.33],
] as const;

export const ELITE_CHANCE_CAP = 0.4;

/** Intended living ordinary elites. Every ordinary spawn path shares this budget. */
export function elitePopulationBudgetAt(timeSec: number): number {
  if (!isEnemyEligibleAt('elite', timeSec)) return 0;
  const diff = endlessDifficultyAt(timeSec);
  return Math.max(1, Math.round(diff.targetActive * diff.eliteChance));
}

/** Minimum seconds between ordinary elite arrivals; approaches the late floor smoothly. */
export function eliteSpawnIntervalAt(timeSec: number): number {
  const progress = Math.min(1, Math.max(0, (timeSec - 90) / (30 * 60)));
  return SURVIVOR.elite.spawnIntervalEarly * (1 - progress) + SURVIVOR.elite.spawnIntervalLate * progress;
}

/** Containment Collapse steps elapsed at a survival time (0 before 30:00). */
export function collapseStepsAt(timeSec: number): number {
  const t = Math.max(0, timeSec);
  if (t < SURVIVOR.collapseStart) return 0;
  return Math.floor((t - SURVIVOR.collapseStart) / SURVIVOR.collapseStep) + 1;
}

/**
 * Unbounded endless enemy difficulty (pure).
 *
 * Every published anchor table above is reproduced exactly by this function, and the
 * balance tests assert those anchors directly.
 */
export function endlessDifficultyAt(timeSec: number): EndlessDifficulty {
  const t = Math.max(0, timeSec);
  const m = t / 60;
  const late = Math.max(0, m - 10);
  const collapseSteps = collapseStepsAt(t);

  // Durability is the primary long-run pressure: it eventually outpaces player growth.
  const healthMul = 1 + 0.08 * m + 0.0125 * late * late + collapseSteps * 0.09;
  const damageMul = contactDamageMulAt(t);
  const speedMul = enemySpeedMulAt(t);
  const attackRateMul = Math.min(2.1, 1 + 0.03 * m + collapseSteps * 0.045);

  const targetActive = Math.min(SURVIVOR.enemyCap, Math.round(curveAt(POPULATION_ANCHORS, m)));
  const spawnRate = Math.min(11.0, curveAt(SPAWN_RATE_ANCHORS, m) + collapseSteps * 0.18);
  const eliteChance = Math.min(
    ELITE_CHANCE_CAP,
    curveAt(ELITE_CHANCE_ANCHORS, m) + collapseSteps * 0.012,
  );

  return {
    healthMul,
    damageMul,
    speedMul,
    attackRateMul,
    targetActive,
    eliteChance,
    spawnRate,
    populationMin: Math.max(12, Math.floor(targetActive * 0.72)),
    populationMax: targetActive,
  };
}

/** @deprecated Use endlessDifficultyAt — kept for tests compatibility. */
export function difficultyAt(time: number): EndlessDifficulty {
  return endlessDifficultyAt(time);
}

export function spawnPressure(t: number): number {
  return endlessDifficultyAt(t).spawnRate / 6.5;
}

export interface BossDifficulty {
  index: number;
  healthMul: number;
  damageMul: number;
  recoveryMul: number;
  moveMul: number;
  fanAdd: number;
  summonAdd: number;
}

/**
 * Authored boss-health anchors, followed by an accelerating endless tail.
 *
 * Early anchors are calibrated against full runs with horde target competition, not an
 * isolated target dummy. The post-20 acceleration still guarantees eventual defeat.
 */
export function bossHealthMulFor(index: number): number {
  const n = Math.max(1, Math.floor(index));
  const anchors: ReadonlyArray<readonly [number, number]> = [
    [1, 1],
    [3, 1.8],
    [5, 3.2],
    [10, 5.2],
    [15, 7.5],
    [20, 10.5],
  ];
  for (let i = 0; i < anchors.length - 1; i += 1) {
    const [x0, y0] = anchors[i]!;
    const [x1, y1] = anchors[i + 1]!;
    if (n <= x1) return y0 + ((n - x0) / (x1 - x0)) * (y1 - y0);
  }
  // Beyond forty minutes the curve accelerates so additive Overclocks cannot win forever.
  const k = n - 20;
  return 10.5 + 0.72 * k + 0.04 * k * k;
}

export function isMegaBossIndex(index: number): boolean {
  const n = Math.max(1, Math.floor(index));
  return n % SURVIVOR.megaEvery === 0;
}

export function bossDifficultyFor(index: number): BossDifficulty {
  const n = Math.max(1, Math.floor(index));
  const mega = isMegaBossIndex(n);
  const healthMul = bossHealthMulFor(n) * (mega ? SURVIVOR.megaHealthMul : 1);
  const damageMul = (1 + 0.12 * (n - 1)) * (mega ? SURVIVOR.megaDamageMul : 1);
  return {
    index: n,
    healthMul,
    damageMul: Math.min(mega ? 4.5 : 3.2, damageMul),
    recoveryMul: Math.max(0.5, Math.pow(0.95, n - 1)),
    moveMul: Math.min(1.25, 1 + 0.03 * (n - 1)) * (mega ? SURVIVOR.megaMoveMul : 1),
    fanAdd: Math.min(6, Math.floor((n - 1) * 0.55)),
    summonAdd: Math.min(6, Math.floor((n - 1) * 0.4)),
  };
}

/** Schedule time for boss index n (1-based): 120, 240, 360… */
export function bossTimeForIndex(index: number): number {
  return Math.max(1, Math.floor(index)) * SURVIVOR.bossInterval;
}

/**
 * Gradual opening composition (melee only).
 * 0–30s fodder only; sprinters ~8–10% after 30s; hunters after 2m; elites after eliteGateTime.
 */
export function compositionAt(t: number): Array<{ id: string; weight: number }> {
  if (t < 30) return [{ id: 'basic', weight: 8 }, { id: 'mush', weight: 3 }];
  if (t < 60)
    return [
      { id: 'basic', weight: 8 },
      { id: 'mush', weight: 3 },
      { id: 'fast', weight: 1 },
    ];
  if (t < 90)
    return [
      { id: 'basic', weight: 6 },
      { id: 'mush', weight: 2 },
      { id: 'fast', weight: 2 },
      { id: 'spiky', weight: 1 },
      { id: 'flyer', weight: 1 },
    ];
  if (t < 120)
    return [
      { id: 'basic', weight: 5 },
      { id: 'mush', weight: 2 },
      { id: 'fast', weight: 2 },
      { id: 'spiky', weight: 1 },
      { id: 'flyer', weight: 1 },
      { id: 'bee', weight: 1 },
      { id: 'bruiser', weight: 1 },
    ];
  if (t < 180)
    return [
      { id: 'basic', weight: 4 },
      { id: 'mush', weight: 2 },
      { id: 'fast', weight: 2 },
      { id: 'spiky', weight: 2 },
      { id: 'flyer', weight: 2 },
      { id: 'ghost', weight: 1 },
      { id: 'bruiser', weight: 2 },
    ];
  if (t < 480)
    return [
      { id: 'basic', weight: 2 },
      { id: 'fast', weight: 3 },
      { id: 'spiky', weight: 2 },
      { id: 'flyer', weight: 2 },
      { id: 'ghost', weight: 2 },
      { id: 'bee', weight: 2 },
      { id: 'bruiser', weight: 3 },
    ];
  return [
    { id: 'basic', weight: 1 },
    { id: 'fast', weight: 3 },
    { id: 'spiky', weight: 3 },
    { id: 'flyer', weight: 3 },
    { id: 'ghost', weight: 3 },
    { id: 'bee', weight: 2 },
    { id: 'bruiser', weight: 3 },
  ];
}

/**
 * The single boss damage scaling curve.
 *
 * Every boss damage path — body contact, charge corridor, beam, projectile, puddle,
 * radial, phase surge — is `authored base x bossDamageScale(...)` and nothing else.
 * One curve is what makes the physical hierarchy in {@link BOSS_DAMAGE_BASE} a real
 * contract rather than a statement about boss 1 only.
 *
 * `damageMul` is the boss's own difficulty multiplier from {@link bossDifficultyFor},
 * which already carries the boss-index and mega curves. Callers must not reapply them.
 */
export function bossDamageScale(damageMul: number, phase = 1, breachEmpower = 0): number {
  const p = (phase >= 3 ? 3 : phase >= 2 ? 2 : 1) as BossPhase;
  return damageMul * SURVIVOR_BOSS.phaseMods[p].damageMul * (1 + Math.max(0, breachEmpower));
}

/**
 * Scaled boss category damage for boss index (1-based) and optional mega.
 *
 * This is the index-addressed form of the same law, for documentation, the boss damage
 * benchmark and tests. The simulation itself works from the live boss and calls
 * {@link bossDamageScale} directly.
 */
export function bossCategoryDamage(
  category: BossDamageCategory,
  bossIndex: number,
  isMega: boolean,
  phase = 1,
): number {
  const n = Math.max(1, Math.floor(bossIndex));
  const damageMul = Math.min(
    isMega ? 4.5 : 3.2,
    (1 + 0.12 * (n - 1)) * (isMega ? SURVIVOR.megaDamageMul : 1),
  );
  return BOSS_DAMAGE_BASE[category] * bossDamageScale(damageMul, phase);
}

export type TempBuffId =
  | 'emergency-repair'
  | 'weapon-overcharge'
  | 'cooldown-flush'
  | 'emergency-barrier'
  | 'thruster-surge';

export interface TempBuffDef {
  id: TempBuffId;
  title: string;
  body: string;
}

/** Legacy list — no longer offered on normal level-ups. Protocol Cache uses PROTOCOLS. */
export const TEMP_BUFFS: TempBuffDef[] = [
  { id: 'emergency-repair', title: 'Emergency Repair', body: 'Restore integrity immediately.' },
  { id: 'weapon-overcharge', title: 'Weapon Overcharge', body: 'Temporary damage boost (~20s).' },
  { id: 'cooldown-flush', title: 'Cooldown Flush', body: 'Reduce Dodge, Repulsor, and Ship cooldowns.' },
  { id: 'emergency-barrier', title: 'Emergency Barrier', body: 'Absorb the next hit.' },
  { id: 'thruster-surge', title: 'Thruster Surge', body: 'Temporary move-speed boost.' },
];

export type ProtocolId =
  | 'aegis-barrier'
  | 'gunship-flyby'
  | 'gravitic-recall'
  | 'carrier-wing'
  | 'cleanup-crew'
  | 'singularity-engine';

export interface ProtocolDef {
  id: ProtocolId;
  title: string;
  body: string;
  duration: number;
}

export const PROTOCOLS: ProtocolDef[] = [
  {
    id: 'aegis-barrier',
    title: 'Aegis Barrier',
    body: 'Deploy a barrier that absorbs damage before integrity.',
    duration: 30,
  },
  {
    id: 'gunship-flyby',
    title: 'Gunship Flyby',
    body: 'Your ship strafes a lane, guaranteeing kills on ordinary enemies.',
    duration: 6,
  },
  {
    id: 'gravitic-recall',
    title: 'Gravitic Recall',
    body: 'Pull all energy on the arena to you over ~1.2s.',
    duration: 1.4,
  },
];

/** Mega Caches are a separate reward tier and never reuse ordinary Cache choices. */
export const MEGA_PROTOCOLS: ProtocolDef[] = [
  {
    id: 'carrier-wing',
    title: 'Carrier Wing',
    body: 'A fighter squadron strafes distributed threats for five minutes.',
    duration: 5 * 60,
  },
  {
    id: 'cleanup-crew',
    title: 'Cleanup Crew',
    body: 'The rest of the crew arrive in their ships and deploy as allied Mechs for five minutes.',
    duration: 5 * 60,
  },
  {
    id: 'singularity-engine',
    title: 'Singularity Engine',
    body: 'Repeated anomalies pull and detonate the horde for five minutes.',
    duration: 5 * 60,
  },
];

/**
 * Shield points at acquisition: round(32 + 3*minutes + 0.12*maxHealth).
 * Enhanced multiplies by SURVIVOR.shieldEnhancedMul after this base.
 */
export function computeShieldPoints(elapsedSec: number, maxHealth: number): number {
  const m = Math.max(0, elapsedSec / 60);
  return Math.round(32 + 3 * m + 0.12 * maxHealth);
}

export function computeShieldDuration(enhanced: boolean): number {
  return enhanced ? SURVIVOR.shieldDurationEnhanced : SURVIVOR.shieldDuration;
}

/** Boss-focus base probability from elapsed time (before modifiers). */
export function bossFocusBaseChance(timeSec: number): number {
  if (timeSec < 600) return 0.08;
  if (timeSec < 900) return 0.25;
  if (timeSec < 1200) return 0.4;
  return 0.55;
}

export function isPrototypeWeapon(id: WeaponId): boolean {
  return !!WEAPONS[id]?.prototype;
}

export function ordinaryWeaponIds(): WeaponId[] {
  return (Object.keys(WEAPONS) as WeaponId[]).filter((id) => !WEAPONS[id]!.prototype);
}

/** Weapons any hero may discover in ordinary level-up cards. */
export function sharedWeaponIds(): WeaponId[] {
  return ordinaryWeaponIds().filter((id) => !isSignatureWeapon(id));
}


export function bossPhaseFromHealth(health: number, maxHealth: number): BossPhase {
  if (maxHealth <= 0) return 1;
  const r = health / maxHealth;
  if (r <= SURVIVOR_BOSS.phase3Threshold) return 3;
  if (r <= SURVIVOR_BOSS.phase2Threshold) return 2;
  return 1;
}

export type SurvivorFixture =
  | 'survivor-start'
  | 'survivor-levelup'
  | 'survivor-horde'
  | 'survivor-mech'
  | 'survivor-boss'
  | 'survivor-repulsor'
  | 'survivor-ship'
  | 'survivor-damage'
  | 'survivor-miniboss'
  | 'survivor-pickups'
  | 'survivor-arc'
  | 'survivor-orbital'
  | 'survivor-mega'
  | 'survivor-mega-cache'
  | 'survivor-cache'
  | 'survivor-shield'
  | 'survivor-recall'
  | 'survivor-gunship'
  | 'survivor-identity'
  | 'survivor-rotary'
  | 'survivor-boomerang'
  | 'survivor-gravity'
  | 'survivor-pulsar'
  | 'survivor-singularity'
  | 'survivor-singularity-collapse'
  | 'survivor-plasma-l1'
  | 'survivor-plasma-ship'
  | 'survivor-ship-ram'
  | 'survivor-overdrive'
  | 'survivor-cleanup-arrival'
  | 'survivor-cleanup-combat'
  | 'survivor-cleanup-departure'
  | 'survivor-telemetry'
  | 'survivor-stress'
  | null;

export const ALL_SURVIVOR_FIXTURES: Exclude<SurvivorFixture, null>[] = [
  'survivor-start',
  'survivor-levelup',
  'survivor-horde',
  'survivor-mech',
  'survivor-boss',
  'survivor-repulsor',
  'survivor-ship',
  'survivor-damage',
  'survivor-miniboss',
  'survivor-pickups',
  'survivor-arc',
  'survivor-orbital',
  'survivor-mega',
  'survivor-mega-cache',
  'survivor-cache',
  'survivor-shield',
  'survivor-recall',
  'survivor-gunship',
  'survivor-identity',
  'survivor-rotary',
  'survivor-boomerang',
  'survivor-gravity',
  'survivor-pulsar',
  'survivor-singularity',
  'survivor-singularity-collapse',
  'survivor-plasma-l1',
  'survivor-plasma-ship',
  'survivor-ship-ram',
  'survivor-overdrive',
  'survivor-cleanup-arrival',
  'survivor-cleanup-combat',
  'survivor-cleanup-departure',
  'survivor-telemetry',
  'survivor-stress',
];

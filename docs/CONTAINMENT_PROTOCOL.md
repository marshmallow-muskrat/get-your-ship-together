# Containment Protocol

**Status:** Primary game direction  
**Mode:** One-map endless high-score survival  
**Current balance line:** `endless-2.2.1`

## Purpose

Survive an increasingly impossible containment breach for as long as possible. The timer counts upward, a rotating boss arrives every two minutes, and death ends the run.

Containment Protocol is the game, not a secondary experiment. The former campaign prototype is retired.

## Core loop

1. Select one of four heroes.
2. Enter Reactor Platform 7.
3. Move while automatic weapons attack.
4. Collect Energy and choose upgrades.
5. Use Dodge, Repulsor Burst, Afterburner, and Mech Overdrive to escape pressure.
6. Fight escalating bosses at two-minute intervals.
7. Continue until the build is overwhelmed.
8. Record the run on that hero’s local leaderboard.

## Product decisions

| Pillar | Decision |
|---|---|
| Camera | Isometric orthographic follow |
| Arena | One 64×64 Reactor Platform |
| Combat | Automatic weapons plus four active survival tools |
| Timer | Endless and upward-counting |
| Ending | Death only |
| Bosses | Every two minutes; rotating models; concurrent late pressure |
| Score | Survival time |
| Records | Separate local top-10 per hero |
| Progression | Run-only authored tiers plus endless Overclocks |
| Delivery | Static browser application |

## Default controls

Bindings are remappable.

| Action | Default |
|---|---|
| Move | WASD |
| Dodge | Space |
| Repulsor Burst | Q |
| Afterburner ship form | E |
| Mech Overdrive | R |
| Upgrade choices | 1 / 2 / 3 or click |
| Pause / Settings | Escape |

## Progression model

### Authored levels

Weapon levels 1–5 contain intentional behavior changes such as additional projectiles, piercing, splash, homing, puddles, or altered cadence.

### Endless Overclocks

After Level 5, the weapon’s normal displayed level continues:

```text
L5
L6 · Overclock I
L7 · Overclock II
L8 · Overclock III
```

Overclock is explanatory language, not a replacement for the visible level. Upgrade cards and the build panel must never leave an upgraded weapon labeled L5.

Implemented repeatable damage model (`weaponStatsAtLevel`):

```text
overclockLevel = max(0, displayedLevel - 5)
damage = level5Damage * (1 + 0.08 * overclockLevel)
```

The increase is additive against the Level-5 base. It must not compound as `1.08 ^ overclockLevel`.

Repeatable scaling applies to direct and puddle damage. Structural properties (projectile count, fire rate, pierce, area, lifetime) stay at the Level-5 authored configuration.

Overclock labels: Roman I–X, then Arabic (`Overclock 27`).

### Passive continuation

| Passive | After L5 |
|---|---|
| Hull Plating | Continues forever; +20 integrity L1–5, then +10 per level |
| Nanite Bleed | Continues forever; diminishing (sqrt) gains after L5 |
| Thruster Boost, Magnet Field, Weapon Overclock, Containment Field, Core Siphon, Reactor Hold, Breach Shielding | Hard-capped at L5; card shows MAX and is no longer offered |

Breach Shielding maxes at 40% boss-damage reduction.

Normal level-ups are **permanent only** (weapons, Overclocks, passives). Temporary Protocols are offered exclusively via **Protocol Caches**.

## Repair / health pickups

- Distinct magnet radii: energy base 3.2 (+0.35/Magnet Field level); health base 4.25 (+0.60/level).
- Full-health players do not magnetize or consume repair orbs.
- Ship form health magnet ≈ 6.5+.
- Healing feedback shows actual integrity restored.

## Time-gated prototypes

| Unlock | Time | Slot |
|---|---|---|
| Arc Conductor | 5:00 | Prototype (does not consume ordinary slots) |
| Orbital Lance | 15:00 | Prototype |

## Boss targeting

Weapons use deterministic focus-debt so late runs spend a rising share of fire on living bosses (8% → 55% base, +modifiers, hard-capped 70%).

## Boss health

Regular: `HP = 2200 × (1 + 0.65(n−1) + 0.10(n−1)²)`.  
Enemy HP: `1 + 0.18m + 0.035×max(0,m−5)²`.  
Every 5th boss is a **Mega-Boss** (2× visual scale, 2.2× HP of the rebalanced regular at that index). Persistent red floor auras are removed.

## Protocol Cache

Every 120s (≈15s before each boss window): corner beacon. Choices:

| Protocol | Role |
|---|---|
| **Aegis Barrier** | Absorb damage before integrity: `round(20 + 2m + 0.08×maxHP)`, 35s (45s enhanced). Replace/refresh, never stack. |
| **Gunship Flyby** | Once-per-target corridor strike from the player. Deletes ordinary enemies; dents bosses (never auto-deletes a real boss). |
| **Gravitic Recall** | Pull all active energy orbs to the player over ~1.25s with exact XP conservation (health orbs excluded). |

Mega-Boss death leaves an enhanced non-expiring cache. The ordinary Rutherford weapon **Rocket Barrage** is unrelated to Protocol Caches.

## Enemy speeds (endless-2.2.1)

Base speeds (before global speedMul): basic 3.30, mush 3.10, fast 4.25, spiky 4.35, flyer 3.90, bee 4.05, ghost 4.00, bruiser 2.85, elite 3.70, miniboss 3.10. Player base speed 6.4.

Global speedMul:

```text
m = minutes
through 15m: 1 + 0.016*m
after 15m:   1.24 + 0.008*(m-15)
+ Collapse steps after 30:00 (+0.02 each step)
hard cap ≈ 1.70
```

### Specialist eligibility gates

`isEnemyEligibleAt(defId, time)` in `survivorContent.ts` is the single source of truth, and
`canSpawnEnemyNow(state, defId)` adds the first-minute cap. Ordinary composition, pressure-director
surge substitutions, forced elite spawns, director variants and boss summons all resolve through it,
so no path can introduce a specialist early. A blocked request becomes time-valid fodder rather than
being dropped, so early pressure is preserved.

| Definition | Role | Gate |
|---|---|---|
| basic, mush | fodder | 0s |
| fast | sprinter | 30s |
| spiky | sprinter | 60s |
| flyer, bee | flanker | 60s |
| bruiser | bruiser | 90s |
| elite | elite | 90s |
| ghost | hunter | 120s |
| miniboss | miniboss | 120s |

Before 60s at most **one** specialist may be alive at a time, and specialist-heavy surge kinds are
rolled forward to `flood` so an early surge applies fodder pressure instead of a sprinter wave.

## Pressure director

`normal → telegraph → surge → recovery → normal`. One surge at a time. Kinds: sprinters, pincer,
bruiser, encircle, elite, flood — all gated by enemy eligibility. Recovery ≈10s at ~60% spawn rate.

Geometry surges step a perimeter cursor per spawn: `pincer` alternates between two facing edges of
one axis pair and `encircle` walks all four. (Both previously keyed off the within-frame spawn index,
which is almost always 0, so a pincer used one edge and an encircle never encircled.)

## Boss schedule backlog

Deferred bosses use FIFO `pendingBossIndices` (exact one-based indices). Mega indices retain Mega status. Never reconstruct deferred indices from `bossesSpawned`.

## Endless difficulty

Enemy and boss growth must eventually exceed the player’s additive Overclock growth.

```text
m = elapsedSeconds / 60
enemyHealth = 1 + 0.12m + 0.02*max(0,m-5)^2 + collapse
enemyDamage = 1 + 0.06m + 0.03*max(0,m-10) + collapse
enemySpeed  = min(1.70, gentle curve above + collapse)
```

Boss index `n` arrives at `n * 120` seconds. Concurrent bosses are capped; excess schedules enqueue.

## Weapon balance (starters)

Deterministic benchmark harness: `survivorWeaponBenchmark.ts`, across seven scenarios —
single-boss, sparse, dense, mixed-elite, mobile/off-axis, lined-up and clustered.

Targets are **not** static dummies: they run their normal pursuit AI at real role speeds while the
player kites a whole number of laps inside the window, so homing and tracking are credited for what
they actually do. Full methodology and every measured number live in
[`WEAPON_BENCHMARK.md`](WEAPON_BENCHMARK.md), which is generated by `npm run bench:doc`.

| Hero | Starter | Role |
|---|---|---|
| Boswell | Microdrone Swarm | Reliable homing |
| Fitzwilliam | Rail Lance | Pierce lanes |
| Fortunato | Bio-Plasma Glob | Splash + puddle |
| Rutherford | Rocket Barrage | Cluster delayed strikes |

Acceptance contract (enforced by the test suite, not by a widened range):

- Intended-scenario **L5/L1 between 3.0 and 4.2**.
- Ordinary per-level gain **15–40%**, with exactly one declared mechanical breakpoint per weapon
  allowed up to **52%**.
- Weighted starter output within **±15%** of the four-starter mean.
- Authored per-shot damage never decreases, so every upgrade card reads as an increase.
- Projectile-count growth is capped at 2× across L1–L5; progression comes from damage and cadence
  rather than from multiplying projectiles.

Overclock after L5: **+7% additive** damage per displayed level, uncapped in level count, with the
existing safety caps intact. One card grants exactly one level.

## Bosses

The data-driven boss rotation uses a curated runtime subset from Ultimate Monsters (six models). Bosses render at approximately **2×** the prior visual scale with a strong red hostile aura (outer ring, fill, light, rising particles). Concurrent boss pressure is bounded; scheduled pressure must never silently disappear.

## Afterburner thrusters and pickup

Per-hero ship pickup radii are large enough to cover wing edges (`pickupRadius` ≈ 4.2–4.5). Thruster exhaust base damage is high at Level 1 (`exhaustDamage` 42) and scales with permanent build power (`playerPowerScale`, cap 10).

## Mech-ready presentation

Equal-size ability slots. Ready state uses a strong pulsing glow only — no spinning perimeter ornament and no spark dots. One-shot large “MECH CORE READY” toast on first full charge.

## Hero records

Each hero has an independent local top-10 because hero kits are not expected to be perfectly balance-identical.

Primary storage:

```text
gyst.survivor.leaderboards.v2
```

Records rank by survival time, then kills and bosses defeated as tie-breakers. Abandoned runs are not recorded.

## UI

- Larger top HUD and survival/breach messaging
- Bottom-center equal-size Dodge, Repulsor, Afterburner, and Mech slots
- Independent build panel that cannot resize the command deck
- Responsive level-up choice presentation
- UI Scale setting that does not scale the Three.js world
- Per-hero leaderboards available from crew selection and the run shell

## Development fixtures

| Fixture | Purpose |
|---|---|
| `survivor-start` | Clean endless start |
| `survivor-levelup` | Upgrade presentation |
| `survivor-horde` | Dense late pressure |
| `survivor-mech` | Mech-ready presentation |
| `survivor-boss` | Boss encounter |
| `survivor-repulsor` | Repulsor radius, knockback, and VFX |
| `survivor-ship` | Afterburner, thrusters, and pickup reach |
| `survivor-damage` | Damage-number presentation |
| `survivor-cache` | Protocol Cache presentation |
| `survivor-recall` | Gravitic Recall energy pull |
| `survivor-mega` | Mega-Boss |
| `survivor-miniboss` | Miniboss melee slam |
| `survivor-gunship` | Gunship lethal corridor |
| `survivor-stress` | Worst-case presentation load for the GPU procedure |

Example:

```text
/?mode=survivor&fixture=survivor-boss&hero=frog
```

## Deferred

- Additional maps
- Audio production
- Online services and leaderboards
- Permanent metagame progression
- Shops, currencies, inventory, and rarity
- Co-op
- Gamepad and touch support

## Verification

```bash
npm test -- --run
npm run typecheck
npm run lint
npm run build
npm audit
```

Lint must end with **zero errors and zero warnings**; the configuration is not to be weakened.

Browser verification is required for changed gameplay, HUD, asset, and effect fixtures.

## GPU stability procedure

Automated (runs in the suite, `survivorGpu.test.ts`): drives the real `SurvivorRenderer` against the
`survivor-stress` fixture for 240 simulated seconds while Protocols fire repeatedly, and asserts that
geometry/material counts reach a high-water mark rather than growing, that full teardown releases
everything, and that repeated restart cycles do not accumulate objects. It does not cover GLTF actor
churn, because no assets are loaded without a browser.

Manual (browser): launch the stress fixture and press **F3**.

```text
/?mode=survivor&fixture=survivor-stress&hero=bee
```

The overlay reports FPS and frame time, live entity counts, `renderer.info` geometries / textures /
programs / draw calls, and the effect map, attack pool and rail pool sizes. Record values at warm-up,
after sustained load, and after a restart. Geometry and material counts must stabilise; the rail and
attack pools must settle at a high-water mark; expired effects must not cause monotonic growth. Do
not lower the enemy cap to make numbers look better.


## Boss attack shapes (2.2.1)

The simulation owns attack entities (`survivorAttacks.ts`). Each carries:

- a unique id and `sourceBossId`
- the one authoritative `AttackShape`
- a `windup → active → fade` lifecycle with remaining/max duration
- a `damaging` flag that is the whole truth — there is no second hidden radius guard
- a style (`hostile` red/magenta, `marker` amber and provably harmless) and colour

The renderer draws that exact shape through `shapeToRender()` and a buffer-reusing floor mesh;
collision tests that exact shape through `pointHitsShape()`. Neither side reconstructs its own
approximate geometry.

Visual contracts, all covered by tests:

| Pattern | Authoritative shape | Contract |
|---|---|---|
| pulse | expanding ring | one ring drives visual and hit |
| line | locked capsule | preview width = collision width |
| fan | cone | real wedge matching the volley; projectile visual radius = collision radius |
| summon | circles | explicitly non-damaging markers |
| breach-orb | capsule | corridor as wide as the orb that travels it |
| contamination | circle | hazard inherits the telegraphed radius |
| rupture-ring | annulus | true safe core, armed only past the inner radius |
| cryo-lanes | three capsules | every lane's width and length match collision |
| ravage-charge | growing capsule | corridor is the body path actually swept |
| sweeping-beam | moving capsule | one moving line renders and burns |
| aerial-strafe | corridor marker + impact circles | each impact radius = damage radius |
| spore-bloom | circles | detonation and lingering hazard share one radius |
| gravity-collapse | marker circle → annulus | pull core and shockwave share a centre |
| cataclysm | circles | each stays visible until its own detonation |

Ownership: cancellation, phase change and boss death clear only that boss's entities. Simultaneous
bosses never clean each other's attacks, and a dead boss leaves no invisible orphan damage — its
hazards become harmless immediately even while they fade visually.

## Boss pattern lifecycle

Every `BossPatternId` has an exhaustive windup → active → recover → idle state machine in `survivorBossPatterns.ts`. There is no silent fallback for unhandled patterns.

Shared patterns: pulse, line, fan (one volley), summon (one spawn), breach-orb, contamination.

Unique patterns are selected by cadence (within first few cycles, then every 3–5 attacks): rupture-ring, cryo-lanes, ravage-charge, sweeping-beam, aerial-strafe, spore-bloom.

Mega-only: gravity-collapse, cataclysm — never used by regular bosses; forced early on Mega-Bosses.

Fan and summon use a one-shot `patternTriggered` flag so they cannot multi-fire per frame.

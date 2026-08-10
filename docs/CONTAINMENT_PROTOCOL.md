# Containment Protocol

**Status:** Primary game direction  
**Mode:** One-map endless high-score survival  
**Current balance line:** `endless-2.6.0` (Test Center candidate)

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
damage = level5Damage * (1 + 0.07 * overclockLevel)
```

The increase is additive against the Level-5 base. It must not compound as `1.08 ^ overclockLevel`.

Repeatable scaling applies to direct and puddle damage. Structural properties (projectile count, fire rate, pierce, area, lifetime) stay at the Level-5 authored configuration.

Overclock labels: Roman I–X, then Arabic (`Overclock 27`).

### Passive continuation

| Passive | After L5 |
|---|---|
| Hull Plating | Continues forever; +20 integrity L1–5, then +10 per level |
| Nanite Bleed | Continues forever; `2.0% + 0.12%·√(level−5)` of max integrity per second after L5 |
| Thruster Boost, Magnet Field, Weapon Overclock, Containment Field, Core Cycling, Reactor Hold, Breach Shielding | Hard-capped at L5; card shows MAX and is no longer offered |

Breach Shielding maxes at 40% boss-damage reduction.

Normal level-ups are **permanent only** (weapons, Overclocks, passives). Temporary Protocols are offered exclusively via **Protocol Caches**.

## Repair / health pickups

- Distinct magnet radii: energy base 3.2 (+0.35/Magnet Field level); health base 6.0 (+0.88/level).
- Full-health players do not magnetize or consume repair orbs.
- Ship form health magnet is at least 9.0.
- Healing feedback shows actual integrity restored.
- From 15:00 onward, ordinary repair generation no longer depends on missing health. Floor repairs
  arrive about every 12s (15–20m), 10s (20–25m), then 8s; up to four may be banked, each lasts 65s,
  and collection still waits until integrity is actually missing. Guaranteed boss/miniboss repairs
  remain separate premium rewards.

## Weapon identity and shared arsenal

Each hero owns one exclusive signature weapon: Boswell's directional Drone Formation,
Fitzwilliam's Rail Lance, Fortunato's Bio-Plasma Glob, and Rutherford's miniature Rocket Barrage.
Signatures count toward the five ordinary weapon slots but cannot be offered to another hero.

Every hero can roll the shared Pulse Blaster, Gravity Pulse, Rotary Cannon, Plasma Wake, and Pulsar
Core families. Arc Conductor and Orbital Lance remain prototype slots. The deterministic benchmark
requires every authored family to grow 3–4.2× in its intended scenario from L1 to L5.

## Time-gated prototypes

| Unlock | Time | Slot |
|---|---|---|
| Arc Conductor | 5:00 | Prototype (does not consume ordinary slots) |
| Orbital Lance | 15:00 | Prototype |

Arc Conductor is intentionally premium at acquisition rather than a weak weapon that asks for
several later upgrades before paying off. Its L1 mixed-horde benchmark target is at least 130 DPS.

## Boss targeting

Weapons use deterministic focus-debt so late runs spend a rising share of fire on living bosses (8% → 55% base, +modifiers, hard-capped 70%).

## Boss health

Regular base: `3,000 HP`, multiplied by authored boss-index anchors (1.0× at boss 1, 1.8× at
boss 3, 3.2× at boss 5, 5.2× at boss 10, 7.5× at boss 15, 10.5× at boss 20), then an
accelerating post-20 curve.
Enemy HP: `1 + 0.08m + 0.0125×max(0,m−10)²`, plus the post-30-minute Collapse tail.
Every 5th boss is a **Mega-Boss** (1.5× visual scale, 1.6× HP of the regular at that index).
Persistent red floor auras are removed.

## Protocol Cache

Every 120s (≈15s before each boss window): corner beacon. Choices:

| Protocol | Role |
|---|---|
| **Aegis Barrier** | Immediate 3s invulnerability, repulsion pulse, then `round(32 + 3m + 0.12×maxHP)` barrier for 30s. Replace/refresh, never stack. |
| **Gunship Flyby** | Once-per-target corridor strike from the player. Searches candidate lanes for the highest-value horde corridor, deletes ordinary enemies and elites it crosses, devastates minibosses, deals 10% regular / 5% Mega max-health damage, and nearly halts replacements for 6.5s after the pass. |
| **Gravitic Recall** | Pull all active energy orbs to the player over ~1.25s with exact XP conservation (health orbs excluded). |

The Cache HUD is a hunt signal: it shows the remaining lifetime but deliberately provides no arrow
or distance. The persistent animated world beacon is the navigation target.

Mega-Boss death leaves a non-expiring cache with exactly three exclusive choices:

| Mega Protocol | Role |
|---|---|
| **Carrier Wing** | Repeated fighter strafes across distributed threats for five minutes. |
| **Starbreaker Array** | Twin colossal orbital beams fire every 2.7s for five minutes. |
| **Singularity Engine** | Repeated anomalies pull and detonate dense horde clusters for five minutes. |

Titan Armaments occupy one dedicated, non-upgradable slot and expose their remaining time in Build.

The ordinary Rutherford weapon **Rocket Barrage** is unrelated to Protocol Caches.

## Enemy speeds (endless-2.3.0)

Base speeds at 0:00, before the global multiplier: basic 3.00, mush 2.80, fast 3.70, spiky 3.80,
flyer 3.50, bee 3.60, ghost 3.55, bruiser 2.60, elite 3.30, miniboss 2.80. Player base speed 6.4.

Raw speed is deliberately **not** the primary reason a run ends. `1.24×` is a fifty-minute value,
not a fifteen-minute one. The curve is a piecewise-linear anchor table (`ENEMY_SPEED_ANCHORS`):

| Time | Global enemy speed |
|---|---:|
| 0m | 1.00× |
| 10m | 1.03× |
| 20m | 1.06× |
| 30m | 1.10× |
| 40m | 1.16× |
| 45m | 1.20× |
| 50m | 1.24× |
| 60m | 1.32× |

Past 60m the final segment's slope continues, hard-capped at `1.70×`. **Containment Collapse
contributes nothing to speed**, so every anchor above is exact at any survival time and the tests
assert the table directly.

Endless difficulty comes instead from enemy durability eventually outpacing player growth,
increasing density, increasing contact damage, more specialists, more dangerous and durable bosses,
boss backlog pressure, more frequent late-game surges and shorter recovery — with raw-speed
inevitability only very late.

The 2.5.0 durability curve deliberately keeps 5–15-minute enemies out of the former sponge regime:
1.40× HP at 5m, 1.80× at 10m and 2.5125× at 15m. Quadratic health acceleration begins at 10m,
with the Collapse tail preserving an ultimately impossible endless run.

## Repulsor Burst scaling (endless-2.5.0)

Repulsor retains its 30-second cooldown, 17.955 radius and authored knockback. Damage starts at 20
and gains 5% of that base per player level, capped at 2.5× base damage before the bounded Mech
multiplier. Scaling follows earned player progression rather than elapsed time, so the active remains
meaningful without silently becoming stronger just because the clock advanced.

## Pressure curves (endless-2.3.0)

| Time | Target active | Spawn rate | Elite chance |
|---|---:|---:|---:|
| 0m | 26 | 2.10/s | 3% |
| 5m | 60 | 3.20/s | 7% |
| 10m | 92 | 4.50/s | 12% |
| 15m | 118 | 5.75/s | 16% |
| 20m | 140 | 7.00/s | 20% |
| 25m | 160 | 8.00/s | 25% |

The 160 enemy cap is unchanged. After 25m the population is capped and Containment Collapse layers
additional spawn rate and elite chance on top; elite chance is hard-capped at 40%.

## Contact damage (endless-2.3.0)

Opening contact damage: basic/mush 10, fast 12, spiky 13, flyer 12, bee 11, ghost 14, bruiser 20,
elite 24, miniboss 28.

| Time | Contact damage multiplier |
|---|---:|
| 0m | 1.00× |
| 10m | 1.25× |
| 20m | 1.55× |
| 30m | 1.90× |
| 45m | 2.50× |

Past 45m the same slope continues (the Collapse-era scaling), hard-capped at `6.0×`. The post-hit
invulnerability window is preserved so simultaneous overlaps cannot instantly delete the player.

## Mech Overdrive (endless-2.4.0)

Mech is a **fixed-cooldown ultimate**. Nothing in the run refills it.

| Property | Value |
|---|---|
| Duration | 6s (Reactor Hold +5%/level, hard cap +25%) |
| Cooldown | 30s activation-to-activation (Core Cycling −3%/level, hard cap −15%) |
| Cooldown timing | Set on activation, counts down **during** Mech |
| Astronaut time after a transformation | 24s |
| Run start | Unavailable; first readiness one full cooldown in |
| Base / maximum invested uptime | 20% / 29.4% (7.5s of 25.5s) |

Kills, elites, minibosses and bosses have **no** effect on the cooldown. The HUD meter shows
readiness, not kill charge.

Mech weapon output uses bounded multipliers: `1.35×` damage, `1.15×` cadence and `1.15×` area.
It no longer adds a projectile to every weapon, which was the largest cause of boss deletion.

## Bounded repair economy (endless-2.3.0)

Ordinary repair drops are paced by wall clock, never by an independent per-kill roll:

| Property | Value |
|---|---|
| Minimum interval | 12s |
| Typical interval | ~15s |
| Pity guarantee (injured) | 18s, tightening to 12s below 45% integrity |
| Injured gate | Drops require missing integrity; pity requires <90% |
| Ordinary orb | 22 |
| Miniboss / boss | 45 / 55 (+30 Mega), guaranteed, outside the budget |

Nanite Bleed increases orb healing by 10% per level through L5. Every collected orb heals exactly
once.

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

### Authoritative elite budget (endless-2.4.0)

The pressure curve's elite percentage now determines one living ordinary-elite budget. Elites are
removed from the ordinary weighted composition, and ordinary replacement may create an elite only
when the living count is below that budget and the bounded elite arrival interval has elapsed.
The drought timer may fill a missing budget slot; it can never add an elite above the budget.

Elite Surges receive a separate explicit bonus capped at five. Boss summon formations are mixed:
bosses 1–4 summon no elites, later regular bosses at most one, and a Mega-Boss at most two, always
subject to a global living allowance. This replaces the former additive composition + chance +
timer + 55%-surge + all-elite phase-three summon paths.

## Pressure director

`normal → telegraph → surge → recovery → normal`. One surge at a time. Kinds: sprinters, pincer,
bruiser, encircle, elite, flood — all gated by enemy eligibility.

| Phase | Duration |
|---|---|
| Interval between surges | 60–75s, deterministic seeded variation |
| Telegraph | 3.5s |
| Surge | 10s |
| Recovery | 13.5s |

Surges never stack, and an ordinary surge never begins while a boss is alive. A boss arriving ends
any running surge cleanly into recovery **without delaying the exact boss schedule** — which is also
what stops a Mega-Boss from inheriting a director surge alongside its authored reinforcements.

A surge grants **its own spawned wave** +22% movement speed. The modifier rides on those individual
enemies; the standing horde never inherits it.

Recovery is a real breathing window: replacements are withheld until population drains toward
`targetActive × 0.55`, then trickle back. Living enemies are never despawned to manufacture it.

Presentation: `SURGE INCOMING` banner, directional arrows on the exact edges in play, illuminated
spawn edges for the full telegraph, and a HUD chip reading `NORMAL` / `INCOMING` / `SURGE` /
`RECOVERY`. No audio in this release.

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

Full-run balance reports are generated from the real headless fixed-step simulation:

```bash
npm run bench:survival -- --runs=24 --max-minutes=30 --policy=competent --label=current
```

See [`SURVIVAL_BENCHMARK.md`](SURVIVAL_BENCHMARK.md) for the current distribution and
[`SURVIVAL_EXPERIMENTS.md`](SURVIVAL_EXPERIMENTS.md) for preserved baseline/candidate deltas.

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

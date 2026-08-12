# Containment Protocol

**Status:** Primary game direction  
**Mode:** One-map endless high-score survival  
**Current balance line:** `endless-2.8.0` (Test Center candidate)

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
| Thruster Boost, Magnet Field, Weapon Overclock, Containment Field, Overdrive Systems, Breach Shielding | Hard-capped at L5; card shows MAX and is no longer offered |

Breach Shielding maxes at 40% boss-damage reduction.

Normal level-ups are **permanent only** (weapons, Overclocks, passives). Temporary Protocols are offered exclusively via **Protocol Caches**.

## Repair / health pickups

- Distinct magnet radii: energy base 3.2 (+0.35/Magnet Field level); health base 6.0 (+0.88/level).
- Full-health players do not magnetize or consume repair orbs.
- Ship form health magnet is at least 9.0.
- Healing feedback shows actual integrity restored.
- Ordinary repair generation is kill-driven and never depends on missing health; there is no
  banked-orb cap and no late time-paced schedule. Orbs last 70s and collection still waits until
  integrity is actually missing, so an uninjured player leaves them standing as a routable field
  resource. Guaranteed boss/miniboss repairs remain separate premium rewards. See
  [Kill-driven repair economy](#kill-driven-repair-economy-endless-280).

## Weapon identity and shared arsenal

Each hero owns one exclusive signature weapon: Boswell's directional Drone Formation,
Fitzwilliam's Rail Lance, Fortunato's Bio-Plasma Glob, and Rutherford's miniature Rocket Barrage.
Signatures count toward the five ordinary weapon slots but cannot be offered to another hero.

Boswell is the current performance reference and remains unchanged in `endless-2.6.1`. Rail Lance
chooses the most valuable intersecting line rather than the nearest body; Bio-Plasma direct kills
burst into nearby targets and its residue slows pursuit; Rocket Barrage distributes motion-led,
proximity-fused mini-rockets across distinct clusters. These are mechanical identity improvements,
not four recolored versions of one attack.

Every hero can roll the shared Pulse Blaster, Gravity Pulse, Rotary Cannon, Plasma Wake, Pulsar
Core, and Cosmic Boomerang families. Arc Conductor and Orbital Lance remain prototype slots. The deterministic benchmark
requires every authored family to grow 3–4.2× in its intended scenario from L1 to L5.

Plasma Wake lays a **connected trail of capsule segments** (endless-2.7.0). Each segment is a
swept segment from the previous segment's end point to the new one, so the trail is continuous by
construction at astronaut, Mech and ship speeds — there is no speed at which it can open a gap.
The renderer draws that exact capsule and collision tests that exact capsule. It is the only
ordinary weapon that continues operating during ship form and it can damage bosses. Rotary Cannon
uses a dedicated ballistic tracer rather than the Drone Formation projectile presentation.

### Plasma Wake trail (endless-2.7.0)

2.6.1 emitted an independent wide/thin ellipse every `cadence` seconds. At astronaut speed the
player covered ~2.2 world units between emissions while one ellipse reached only ~1.1 units
forward, so the weapon read — and collided — as a row of disconnected discs, and at L1 each disc
expired after 1.8s before it could matter.

| Property | Value |
|---|---|
| Trail delay behind the hero | 0.5s (replayed from a fixed 96-sample position ring) |
| Emission | Distance-driven: 3.2 world units, 5.5 in ship form |
| Lifetime | L1 3.6s · L2 3.8s · L3 4.0s · L4 4.2s · L5 4.5s |
| Cross-track half-width | `radius × 1.72`, ×1.35 in ship form, ×0.72 per ribbon at Twin Wake |
| Ember phase | Full strength for 45% of life, then linear decay to 25% |
| Continuity | Each segment starts exactly where the previous ended |

Because segments chain, coverage depends on lifetime and speed rather than emission frequency,
which is why emission is now much *less* frequent while the trail is *denser*.

**Presentation (endless-2.8.0).** The 2.7.0 ribbon disabled depth testing on every layer and asked
for render order 18 — an instruction to draw over the whole scene — so the hero laying the trail,
the horde walking through it and a boss standing in it were all painted *behind* a floor decal.
Every layer was additive as well, and stacked ember + body + core cannot resolve to anything but
white. Depth testing is on, render order sits in the floor band, and additive is reserved for the
thin filament and the ignition sparks. The plasma body is a deep violet-magenta composited
normally; the ramps run magenta -> violet -> out for the filament and ember -> near-black for the
outer shell. Presentation cooling starts at 18% of life rather than 45%, with a brief ignition
flash keeping the point of emission readable. **No gameplay change**: damage, lifetime, cadence,
capsule geometry and `hazardPotency`'s 45% ember start are untouched, and the outer shell is still
drawn at exactly `h.radius` — the half-width `hazardHitsPoint` tests. A per-level
integrated-damage normalization (`SURVIVOR.plasmaTrail.damageNorm`) re-bases the weapon so L4–L5
stay within ~3% of the 2.6.1 measured output while L1 gains; see [`WEAPON_BENCHMARK.md`](WEAPON_BENCHMARK.md).

### Cosmic Boomerang (endless-2.8.0)

A thrown disc that carves out to its turn distance, reverses, and cuts back through the same lane.
The identity is the **return**: every throw is two passes, so the weapon rewards throwing across
the horde's approach rather than at whatever is nearest, and rewards repositioning after the throw
because the disc comes back to where the player *now* is.

| Property | Behaviour |
|---|---|
| Hits per body | Once per leg, twice per throw |
| Pierce | Unlimited within a leg — the limit is geometry, not a counter |
| Turn distance | `life x 4.2 x area`, so a longer throw reaches further rather than lingering |
| Twin Orbit (L5) | Second disc on a diverging bearing, covering a cone rather than one lane |
| Boss rate | 0.75x — a boss is one body, so two full-rate passes would make a lane weapon a boss weapon |

The hit list is cleared at the turn, which is what makes the return a genuine second opportunity
rather than a free double-hit outbound or a wasted trip home. The disc is caught on reaching the
player, and collisions resolve on that frame before it despawns.

The projectile is drawn as a boomerang: two swept, tapering arms meeting at a thicker elbow, deep
purple with gold leading edges. Spin and heading are separate transforms on separate nodes — the
blade spins about its own axis at 11 rad/s while a restrained gold chevron that does not spin
trails the elbow along the velocity. At Twin Orbit the pair counter-rotates and takes slightly
different purples so two discs on diverging bearings cannot read as one. The actor is drawn at
exactly `visualRadius` (the authored 1.25x decorative radius); collision still uses `radius`.

The 2.8.0 disc was a white additive torus, and its rotational symmetry hid a bug: `syncProjectiles`
assigns `rotation.y` from the velocity for every Group actor, so the boomerang's `rotation.y +=
spin` was overwritten every frame and the disc never turned at all.

Measured progression: L5/L1 **3.78** with per-level gains 37% / 36% / 35% / 49%, the last being
the declared L5 breakpoint. Within the documented contract on every axis.

## Time-gated prototypes

| Unlock | Time | Slot |
|---|---|---|
| Arc Conductor | 5:00 | Prototype (does not consume ordinary slots) |
| Orbital Lance | 15:00 | Prototype |

Arc Conductor is intentionally premium at acquisition rather than a weak weapon that asks for
several later upgrades before paying off. Its L1 mixed-horde benchmark target is at least 130 DPS.

### Forked Conduction (endless-2.8.0)

Arc's L5 was one more chain jump plus a decorative discharge ring — a fifth ordinary level at
the point every other weapon transforms. It now **forks**: two initial arcs at two distinct
targets, each continuing into its own shorter chain, sharing one hit set so no body is claimed
twice. The second target is the nearest unstruck body at least `0.7 rad` off the first's
bearing, falling back to nearest when the horde really is all in one direction.

| Property | Value |
|---|---|
| Fork level | 5 |
| Initial arcs | 2 |
| Jumps removed per arm | 2 (primary + 3 jumps each; 8 bodies per volley, against 6) |
| Per-hit rebase | `0.72`, **only** when a second arm actually fires |
| Chain damage | 0.75x primary, unchanged |

The rebase is what holds the transformation inside the documented contract: at parity per hit
the L4 -> L5 effective gain measured well past the 0.52 breakpoint ceiling, because a fork
covers far more of a mixed horde than one chain walk. Measured after: gain **0.440**, L5/L1
**3.306**, L1 mixed DPS unchanged at 135.9. The acceptance bands were not moved.

It is priced only when it fires because a lone boss offers no second target — billing the split
there made L5 an 8% damage *loss* against exactly the encounter a prototype is taken for.

### Orbital Lance two-zone strike (endless-2.7.0)

Orbital hit hard in 2.6.1 (304 maximum hit) but covered almost nothing: 34,393 damage, 2.6% of a
21:18 run. The identity — boss preference, motion-leading, delayed telegraph, one heavy impact — is
unchanged; what changed is reach.

| Level | Core radius (2.6.1 → 2.7.0) | Shockwave radius |
|---:|---:|---:|
| 1 | 2.10 → **3.20** | 5.12 |
| 2 | 2.20 → **3.45** | 5.52 |
| 3 | 2.32 → **3.70** | 5.92 |
| 4 | 2.45 → **3.95** | 6.32 |
| 5 | 2.60 → **4.25** | 6.80 |

The shockwave is `1.6×` the core radius and deals `37.5%` of the central damage. **A target is
damaged by exactly one zone**, the core taking precedence, so nothing is double-counted — which is
also why the single-boss progression benchmark is unaffected by the ring and Orbital's L5/L1 ratio
is unchanged at 3.05.

#### Impact sequence (endless-2.8.0)

2.7.0's presentation was a 22-unit beam nearly as wide as the whole damage radius with a
0.98-opacity white core, held for 0.4s — longer than anything on the ground. The weapon named for
an orbital strike read as a column of light, and the player never saw the area that resolved.

1. Targeting marker at the core radius.
2. A **thin** beam and a small contact flash, gone in `0.22s`. A tenth of the damage radius
   wide, not most of it.
3. Core blast at exactly the core damage radius.
4. Shockwave expanding to exactly the outer damage radius, carrying a second ring at the core
   boundary — two damage zones, two drawn boundaries.
5. Eight ejecta shards riding the ring outward, fixed at construction.
6. Floor scorch on the core footprint.

Every radius in the sequence is a value the damage loop itself uses. The core flash was
previously authored at `er × 1.15` and the impact effect at `er × 1.4`.

## Boss targeting

Weapons use deterministic focus-debt so late runs spend a rising share of fire on living bosses (8% → 55% base, +modifiers, hard-capped 70%).

## Boss health

Regular base: `3,000 HP`, multiplied by authored boss-index anchors (1.0× at boss 1, 1.8× at
boss 3, 3.2× at boss 5, 5.2× at boss 10, 7.5× at boss 15, 10.5× at boss 20), then an
accelerating post-20 curve.
Enemy HP: `1 + 0.08m + 0.0125×max(0,m−10)²`, plus the post-30-minute Collapse tail.
Every 5th boss is a **Mega-Boss** (1.5× visual scale, 1.6× HP of the regular at that index).
Persistent red floor auras are removed.

Boss bodies are contact-damage volumes, not solid obstacles. Astronaut, mech, and ship forms may
pass through a boss without forced displacement; the normal contact-damage cooldown still applies.

## Boss damage law (endless-2.8.0)

Every boss damage path is `authored category base × bossDamageScale(...)` and nothing else. One
curve, applied once. `bossDamageScale` carries the boss's difficulty multiplier (which already
contains the boss-index and Mega curves), the phase multiplier, and any breach empowerment.

Category bases are authored against `projectile`, the **representative ranged impact**:

| Category | Base | × ranged | Band |
|---|---:|---:|---|
| `puddle` | 12 | 0.80× | — |
| `projectile` | 15 | 1.00× | reference |
| `beam` | 16 | 1.07× | — |
| `radial` | 18 | 1.20× | — |
| `body` | 18 | 1.20× | 1.15–1.30× |
| `charge` | 22 | 1.47× | 1.40–1.60× |

Incidental contact with a body sits just above a thrown impact. A telegraphed, committed charge —
the thing the player is given time to read and answer — hits meaningfully harder. Because there is
one curve, those ratios are identical at boss 1 and at boss 20, in every phase.

`npm run bench:bossdamage` regenerates `BOSS_DAMAGE_BENCHMARK.md`, which evaluates the law across
the boss ladder and drives the real simulation to count impacts.

### One impact per committed traversal

A pattern during which the boss **body itself travels a locked path** — the Ravage Charge, the
Aerial Strafe leap — owns its impact entirely. Its attack entity's footprint *is* the volume the
body sweeps, and that entity is one-shot gated, so the traversal bills the player exactly once no
matter how long the bodies overlap. The ordinary body-contact pass stands down for the duration.

The charge's trailing fissures are deliberately **not** part of that impact. They are a separate,
persistent, escapable hazard under their own `boss-puddle` damage kind, carrying 25% of the charge
each. A player who never moves off the trail pays at most the charge again; a player who leaves
pays nothing more.

### What this replaced

endless-2.7.0 applied the boss-index curve **twice** on the physical paths: `bossCategoryDamage`
scaled by index and Mega internally, and both call sites multiplied the result by `boss.damageMul`,
which is that same curve. Physical damage therefore grew with the square of boss index while every
pattern grew linearly, and the two used different phase curves as well. The hierarchy held at boss 1
and drifted from 1.25× a beam to over 3× by boss 13.

It also let a traversal bill twice. A boss flying its strafe over a stationary player was charged
for ordinary body contact rather than the strafe drop — measured at **182.5 raw at boss 10**, versus
36.4 for the telegraphed impact the player was actually shown. The mechanic that hurt the player was
not the mechanic that was telegraphed, which no amount of telegraph quality can make fair.

### Recorded, not fixed

The Containment Warden's Ground Slam (`26 × 1.8 = 46.8`) is a telegraphed melee AOE authored as a
flat miniboss constant. It never touches the boss damage law and does not scale with the run at all:
it out-hits a first boss's charge by more than 2×, and an ordinary boss charge does not overtake it
until boss 11. Changing it is a horde-pressure change rather than a boss-fairness one, so it is left
alone here instead of being folded into this phase's A/B where it would confound attribution.

### Ship boss ram (endless-2.7.0)

Ship Body dealt exactly **zero** boss damage in 2.6.1 — flying through a boss, the most committal
thing ship form can do, was mechanically unrewarded. A ship overlapping a boss now applies:

```text
ramDamage = 42 × thrusterPower(state)          // capped at powerScaleCap 10 -> 420
```

under its own `ship-ram` telemetry source, with a **per-boss** 0.75s internal cooldown so a
sustained overlap produces a bounded impact *rate* rather than one impact per frame, and so
overlapping two bosses credits each exactly once. It is a separate pass from incoming boss
contact: it neither consumes nor is gated by the player's `bossContactCd` or i-frames. No
knockback or positional correction is applied to either party, so pass-through is preserved
exactly. Ship Wake, Ship Exhaust and Ship Body are unchanged.

### Ship survivability (endless-2.8.0)

Ship form takes **50% of incoming damage** at baseline, reduced toward a hard **25% floor** (75%
mitigation) by the Reinforced Airframe passive at 5% per level. It applies uniformly to horde
contact, boss physical attacks and boss hazards through the established mitigation order:

```text
form multiplier -> Titan multiplier -> Breach Shielding (boss sources) -> Aegis shield -> integrity
```

| Reinforced Airframe | Damage taken | Mitigation |
|---|---:|---:|
| L0 (baseline) | 0.50 | 50% |
| L1 | 0.45 | 55% |
| L2 | 0.40 | 60% |
| L3 | 0.35 | 65% |
| L4 | 0.30 | 70% |
| L5 | 0.25 | 75% |

Window duration is **3.25s**, raised from 2.5s. Cooldown is unchanged.

`shipDamageTakenMul` is the single place the form's mitigation is resolved; nothing reads the
baseline constant directly. Ship is never invulnerable — the floor is a hard cap, not an asymptote.

#### Why this changed

endless-2.7.0 granted a flat 80% reduction to every ship activation from the first second of the
run. That made the form a safe button rather than a commitment, and it was the identified cause of
that release's upper-tail expansion: a player who could stay in ship form was very hard to kill, so
strong runs ran away from the pack and the distribution widened at the top.

The ceiling is deliberately unchanged. A fully-invested build reaches what every build used to get
free — but reaching it costs five card slots that could have been damage. That is the trade the
form should have been asking for.

Duration rose alongside it because halving baseline mitigation shortens how much the window can
accomplish, with more of it spent disengaging. Keeping the offensive identity intact while the
survivability change lands on punishment absorbed is what stops the two from confounding each
other in the A/B.

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
| **Cleanup Crew** | The three heroes you are not piloting arrive in their ships and fight beside you as allied Mechs for five minutes. |
| **Singularity Engine** | Repeated anomalies pull and detonate dense horde clusters for five minutes. |

Titan Armaments occupy one dedicated, non-upgradable slot and expose their remaining time in Build.

### Cleanup Crew independent engagement (endless-2.8.0)

Allies used to orbit a fixed bearing around the player at a constant radius with a sine drift.
Three squadmates read as rotating decoration: they fired at whatever was nearest, never chose
ground, and never reacted to where the fight actually was.

Each ally now picks its own target of opportunity — the densest threat cluster within its leash,
weighted so elites (4x) and minibosses (9x) are worth pursuing over fodder — and takes a standoff
position at *its own weapon's* preferred range.

| Signature | Standoff |
|---|---:|
| Rail Lance | 7.5 |
| Rocket Barrage | 6.5 |
| Bio-Plasma Glob | 5.0 |
| Drone Formation | 4.5 |

Each deployed ally carries two downward thruster plumes under its Mech — a cone flaring from a
fixed nozzle with a bright inner core — with a real idle burn while holding station, rising with
how hard the ally is correcting position, plus a restrained forward lean. Thrust is measured in
the renderer from the ally's own frame-to-frame movement and damped: the simulation gives an ally
a position and a facing but no velocity, and how hard a plume burns is a presentation question.
Four meshes per ally, three allies, torn down with the ally — bounded by construction rather than
by a cap.

Three properties hold this together. The scan is **bounded** — one pass over the enemy pool, no
allocation. The chosen point is **leashed** to 13.5 units from the player, so independence never
becomes abandonment; with nothing in reach the ally falls back to its formation slot rather than
looking lost. And it is **deterministic** — no RNG, ties break on stable enemy order, so a seed
replays identically. Re-targeting is rate-limited to 0.85s so allies commit instead of dithering.

#### Standoff is measured toward the player, not away

The first implementation pushed the standoff point outward along the ally's own bearing from the
cluster, and measured *worse* than the formation AI it replaced — 31,348 mortal-mode direct damage
against 35,380. The horde converges on the player, so the densest cluster usually sits between the
two; standing off along the ally's bearing put it on the far side, drifting away from everything
else it could have shot. Interposing between player and cluster fixed it, which is also what a
squad is actually for.

12-seed Titan comparison, formation AI → independent AI:

| Mode | Metric | Formation | Independent |
|---|---|---:|---:|
| sustained | direct damage | 263,876 | 268,524 |
| sustained | boss damage | 13,621 | 14,673 |
| sustained | peak living | 104.6 | 105.6 |
| mortal | direct damage | 35,380 | 34,358 |
| mortal | protocol kills | 158 | 151 |

Total player value is at parity — better sustained throughput and boss pressure, marginally lower
mortal-mode output. The phase's goal was behaviour, and the behaviour changed without costing the
protocol its standing against Carrier Wing and Singularity Engine.

### Cleanup Crew (endless-2.7.0)

Summons the three heroes the player is **not** piloting. They arrive in their own ships, deploy as
allied Mechs, fight for five active simulation minutes using only their exclusive signature
weapon, then transform back and fly out.

| Player | Summons |
|---|---|
| Boswell | Fitzwilliam, Fortunato, Rutherford |
| Fitzwilliam | Boswell, Fortunato, Rutherford |
| Fortunato | Boswell, Fitzwilliam, Rutherford |
| Rutherford | Boswell, Fitzwilliam, Fortunato |

Allies are **bounded actors, not duplicate player states**. An ally owns a position, a facing, a
formation bearing, one `SurvivorWeaponSlot` and a phase timer — no health, form, passives, Build,
cooldown bank or pickup logic. They are invulnerable and non-colliding, never block or displace
the player, enemies or bosses, and carry no aggro: no horde or boss code reads them. Their ships
are arrival/departure presentation only and deal no damage. Cleanup Crew never alters the player's
Mech cooldown, form, passive levels or permanent Build.

Signature identities are preserved: Boswell's directional Drone Formation, Fitzwilliam's optimised
piercing Rail Lance lines, Fortunato's bursting Bio-Plasma globs with corrosive residue, and
Rutherford's distributed cluster-leading proximity-fused mini-rockets — the same projectile kinds,
effects and mechanics the player's versions use. Damage and cadence are re-based by Titan
coefficients (`damageMul` 0.33, `cadenceMul` 1.28) and scaled by the shared bounded
`playerPowerScale`, so the squad is not three extra maxed players.

Telemetry keeps one bucket per ally (`titan-cleanup:<heroId>`) so individual contribution is
preserved, and the Run Report rolls them into a single **Cleanup Crew** total.

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

## Mech Overdrive (endless-2.7.0)

Mech is a **fixed-cooldown ultimate**. Nothing in the run refills it.

### Overdrive Systems

Core Cycling and Reactor Hold were each too small to be worth a card slot, so the Mech ultimate
was effectively un-upgradable in practice. 2.7.0 merges them into one five-level passive that
moves duration, cooldown and Mech-only movement together.

| Level | Duration | Cooldown | Mech-only speed | Scheduled uptime |
|---:|---:|---:|---:|---:|
| 0 | 6.0s | 30.0s | +0% | 20.0% |
| 1 | 6.2s | 29.6s | +3% | 20.9% |
| 2 | 6.4s | 29.2s | +6% | 21.9% |
| 3 | 6.6s | 28.8s | +9% | 22.9% |
| 4 | 6.8s | 28.4s | +12% | 23.9% |
| 5 | 7.0s | 28.0s | +15% | **25.0%** |

The Mech speed bonus is applied **multiplicatively after** Thruster Boost, so maximum Thruster
plus maximum Overdrive Systems is `1.30 × 1.15 = 1.495` — +49.5% against unupgraded astronaut
speed while Mech is active. Ship speed remains a separate multiplier. Level 0 is +0%, replacing
the flat 0.92 Mech drag 2.6.1 applied.

| Property | Value |
|---|---|
| Duration | 6.0s → 7.0s (Overdrive Systems, hard cap at L5) |
| Cooldown | 30.0s → 28.0s activation-to-activation (hard cap at L5) |
| Cooldown timing | Set on activation, counts down **during** Mech |
| Astronaut time after a transformation | 24s |
| Run start | Unavailable; first readiness one full cooldown in |
| Base / maximum invested uptime | 20% / 25.0% (7.0s of 28.0s) |

Kills, elites, minibosses and bosses have **no** effect on the cooldown. The HUD meter shows
readiness, not kill charge.

Mech weapon output uses bounded multipliers: `1.35×` damage, `1.15×` cadence and `1.15×` area.
It no longer adds a projectile to every weapon, which was the largest cause of boss deletion.

## Kill-driven repair economy (endless-2.8.0)

Ordinary repair supply is **earned by killing**. It is not gated on being hurt, not paced by the
wall clock, and not capped at a handful of orbs on the field.

| Property | Value |
|---|---|
| Model | Threat credit banks toward a re-rolled threshold (`accumulator`) |
| Credit per kill | fodder 1, elite 3, miniboss 8 |
| Threshold | mean 40 credit, ±25% seeded variance per drop |
| Ordinary orb | 16 |
| Orb lifetime | 70s, with an 8s expiry warning |
| Miniboss / boss | 45 / 55 (+30 Mega), guaranteed, premium, outside the ordinary economy |

Pricing an orb in **threat-weighted** credit is what keeps the tap width roughly constant as kill
rate climbs. A flat per-kill roll makes flow rate equal to kill rate, which is how endless-2.2.1
turned into a late-game faucet. Measured kills per ordinary drop across the early/mid/late/dense
windows is 47.0 / 42.8 / 41.0 / 43.0, against 45.9 / 86.8 / 53.7 / 50.3 under the old model.

A second `probability` model — a per-kill roll with escalating bad-luck protection and a hard
guarantee — is implemented and selectable via `SURVIVOR.repair.killDriven.model`, so the two can be
compared on identical seeds rather than argued about.

### What this replaced, and why

endless-2.7.0 paced drops on the wall clock (12s minimum, ~15s typical, 18s pity) and required the
player to be **below 90% integrity** to be eligible at all, with a late schedule that capped the
field at four ordinary orbs. Three consequences, all of them removed:

- An uninjured player earned nothing. Measured in the mid-run window at full integrity, 2.7.0
  produced **zero** ordinary orbs on every seed.
- The late window sat pinned at exactly **four** orbs on every seed — the cap, not the economy.
- The injured-only pity floor actively paid more to the player doing worse, which is a difficulty
  cushion disguised as a supply rule.

Orbs an uninjured player walks past now stay on the floor as a routable resource to come back for.
That is the route-planning choice the redesign exists to create; lowering face value from 22 to 16
is what keeps that choice from also being a healing increase.

Nanite Bleed increases orb healing by 10% per level through L5. Every collected orb heals exactly
once. `npm run bench:repair` regenerates `REPAIR_BENCHMARK.md`.

### Known open question

Kill-driven supply is **correlated with performance** where the old model was not, and that widens
the survival distribution by design: a player who is killing well is supplied well. The 96-run A/B
held median and mean flat (10:37 → 9:58 median, 11:27 → 11:16 mean) while standard deviation rose
from 5:14 to 6:20 and the +3σ tail crossed thirty minutes. Death attribution shows the mechanism
directly — horde-contact deaths went from 21 to 45 of 96, as weak runs lost their supply cushion.
This is unresolved and is not to be fixed by nerfing an unrelated system.

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

## Run Report

Three views: **By Source**, **By Form** and **Run**. Source and Form remain separate top-level
views because one damage event belongs to both.

endless-2.7.0 adds an exact **source × form cross-tab**. Selecting a source in the By Source view
expands it into per-form rows (applied damage, hits, kills, boss damage, maximum hit). It is not a
third accumulator: the same `recordOutgoing` call fills the source marginal, the form marginal and
the joint cell, so the cross-tab reconciles with both existing views *exactly* rather than
approximately, and overkill remains excluded under the existing contract. The map is bounded at
`|sources| × 3`. The default report is unchanged in density — the breakdown is opt-in per row.

## Upgrade HUD (endless-2.8.0)

| Element | Behaviour |
|---|---|
| Slot counter | `x/5 WEAPONS` on the upgrade modal; ordinary slots only |
| Regions | Grid rows: head (category + level), title, body, reserved footer |
| Keybind | Owns the footer row; copy can never reach it |
| Level badge | One gold badge on every card that has levels |
| Upgrade Numbers | Setting, **default off**, persisted; gates the raw stat lines |
| Display names | Centralised on `displayName`; authored Title Case, shouting is CSS |

### Card regions and the level badge (endless-2.8.0 presentation pass)

The keybind was absolutely positioned with `padding-bottom: 2.1rem` on
`.survivor-hud .sv-choice.sv-card` reserving room for it — three classes.
`.survivor-hud #sv-levelup .sv-choice { padding: 1.35rem 1.5rem }` carries an ID and outranks
it, so the reservation was discarded inside the level-up modal, which is the only place these
cards appear, and long descriptions ran underneath the 1/2/3. The card is now a grid whose
footer is a real row with its own height: a grid row cannot be overridden out of existence by a
padding shorthand. Verified by `scripts/cardQa.mjs` across 1920/1366/1280/1024 x 75/100/125/150%.

`levelProgression` is the single level formatter and every card type goes through it:

| Card | Badge |
|---|---|
| Weapon or prototype step | `L1 → L2`, `L4 → L5` |
| Overclock | `L5 → L6` — the displayed level simply continues |
| New weapon or first passive | `Acquire · L1`, never `L0 → L1` |
| Passive step | `L3 → L4` |
| Passive hitting its hard cap | `L4 → L5 · MAX` |

Gold previously appeared only where the level string was literally `L1 → L2`, by a hard-coded
comparison in the HUD, so it marked "the second level of a weapon" rather than "progression" and
a player had no way to learn what it meant. Gold now always means the card advances something.

### Weapon naming

A weapon's primary name is **stable across ordinary levels**. `WeaponLevelDef.tier` is present
only where a level changes what the weapon *is* — one projectile becoming two, a glob learning
to split, a chain learning to fork. Ordinary levels carry the weapon's own name and let the
card's generated effect sentence say what changed, so a card cannot promise a mechanic the
tables do not have.

Rocket Barrage used to become `Salvo`, `Cluster` and `Carpet Fire` while doing nothing but firing
more rockets slightly faster: three renames for a count going up, two of them promising mechanics
that do not exist. Rocket Barrage and Microdrone Swarm both come out with **no** tier name, which
is a finding about the authored tables rather than an omission. See
[`PRESENTATION_AUDIT_280.md`](PRESENTATION_AUDIT_280.md).

### Ability hotbar

The cooldown countdown is gold, semibold and outlined, with tabular numerals so it does not
jitter as digit widths change. The cooldown -> ready transition flashes the class-coloured
wireframe neon green for **200ms**, edge-triggered on `false -> true` only: never a repeating
blink while an ability sits ready, and never on HUD construction (a slot with no recorded
previous state establishes a baseline instead of firing). The bound is a timeout rather than a
frame count, so a frame spike cannot swallow it.

The slot counter excludes prototypes (Arc Conductor, Orbital Lance) because they do not consume
an ordinary slot. Counting them would tell the player they are fuller than they are, at exactly
the moment the readout exists to inform: the choice between a new weapon and an upgrade.

Upgrade Numbers defaults off because the cards lead with what an upgrade *does*; the numbers are
for players who want to compare precisely, and showing them by default turns a choice about
identity into a spreadsheet. Settings written before endless-2.8.0 have no such key and read as
the default rather than as enabled. Toggling it while a level-up is open invalidates the card
cache, so the change is visible immediately rather than at the next level.

### UI scale reflows

`--ui-scale` drives the **root font size**, not a transform. A transform is a paint-time
operation: it resizes pixels without re-running layout, so at 1.5x nothing rewrapped and panels
grew past the viewport edge along whatever `transform-origin` they declared. Driving the font size
makes the scale a layout input — rem values are recomputed, text rewraps, and the existing
`min()`/`clamp()` caps against `vw`/`vh` do what they were written to do.

Range is `UI_SCALE_MIN 0.75` to `UI_SCALE_MAX 1.5`. Framing offsets that should not compound with
the scale (the crew-select lower HUD nudge) are expressed in px deliberately.

## UI

- Larger top HUD and survival/breach messaging
- Bottom-center equal-size Dodge, Repulsor, Afterburner, and Mech slots
- Independent build panel that cannot resize the command deck
- Aegis shield readout anchored **inside** the command deck at `bottom: calc(100% + gap)`, so it
  tracks the deck's real rendered height at every UI scale instead of a guessed fixed offset. It
  is absolutely positioned, so it can never resize or reflow the deck.
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
| `survivor-stress` | Worst-case presentation load for the GPU procedure (now includes L5 Twin Wake) |
| `survivor-boomerang` | L5 Twin Orbit in isolation — spin and two diverging lanes |
| `survivor-plasma-l1` | Level-1 Plasma Wake trail in isolation |
| `survivor-plasma-ship` | L5 Twin Wake in ship form — widest, brightest trail |
| `survivor-ship-ram` | Ship mitigation and the boss ram |
| `survivor-overdrive` | Overdrive Systems at its L5 cap, Mech ready |
| `survivor-cleanup-arrival` | Cleanup Crew ships arriving and deploying |
| `survivor-cleanup-combat` | Cleanup Crew fighting under dense horde load |
| `survivor-cleanup-departure` | Cleanup Crew transforming back and flying out |
| `survivor-telemetry` | Multi-source, multi-form build for the Run Report cross-tab |

Browser QA covers two harnesses. `scripts/browserQa.mjs` sweeps the viewport x UI-scale matrix
for console errors and clipping; `scripts/cardQa.mjs` opens the level-up modal and measures the
upgrade cards themselves, which the general sweep never reaches.

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

### Ground-effect geometry (endless-2.8.0)

`survivorEffectGeometry.ts` states how a radius-bearing effect is drawn, so a telegraph, a blast
and the region that damages cannot drift apart:

| Motion | Kinds | Drawn radius |
|---|---|---|
| `static` | `telegraph`, `orbital`, `orbital-strike`, `arc`, `titan-deploy` | `1.0` for the whole window |
| `expanding` | `pulse`, `impact`, `repulsor`, `orbital-shock` | opens small, ends at exactly `1.0` |
| `settling` | `orbital-scorch` | `1.0`, relaxing inward |
| `decorative` | everything else | legacy ramp |

The renderer previously applied `0.5 + t × 1.4` to every ring it did not special-case, so a
`pulse`, an `impact` and a radius-form `telegraph` opened at **half** the authored radius and
finished at **1.9×** it. Floor hazards had the opposite error, drawn at `0.85×` at spawn while
`updateHazards` damages inside `radius + playerRadius`. An arming hazard now also draws dimmer,
because it cannot damage while `armTimer > 0`. See
[`PRESENTATION_AUDIT_280.md`](PRESENTATION_AUDIT_280.md).

The **Containment Warden's Ground Slam** commits its impact point at windup and detonates there.
The Warden advances at quarter speed through its 0.95s windup and the impact used to resolve
against its current position — measured 0.700 units of drift on a 4.2 radius, enough that a
player standing clear of the marked circle still took the full 46.8.

Ownership: cancellation, phase change and boss death clear only that boss's entities. Simultaneous
bosses never clean each other's attacks, and a dead boss leaves no invisible orphan damage — its
hazards become harmless immediately even while they fade visually.

## Boss pattern lifecycle

Every `BossPatternId` has an exhaustive windup → active → recover → idle state machine in `survivorBossPatterns.ts`. There is no silent fallback for unhandled patterns.

Shared patterns: pulse, line, fan (one volley), summon (one spawn), breach-orb, contamination.

Unique patterns are selected by cadence (within first few cycles, then every 3–5 attacks): rupture-ring, cryo-lanes, ravage-charge, sweeping-beam, aerial-strafe, spore-bloom.

Mega-only: gravity-collapse, cataclysm — never used by regular bosses; forced early on Mega-Bosses.

Fan and summon use a one-shot `patternTriggered` flag so they cannot multi-fire per frame.

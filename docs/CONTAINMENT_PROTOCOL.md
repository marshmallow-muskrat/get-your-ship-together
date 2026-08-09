# Containment Protocol

**Status:** Primary game direction  
**Mode:** One-map endless high-score survival  
**Current balance line:** `endless-2.2.0`

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

## Enemy speeds (endless-2.2.0)

Base speeds (before global speedMul): basic 3.30, mush 3.10, fast 4.25, spiky 4.35, flyer 3.90, bee 4.05, ghost 4.00, bruiser 2.85, elite 3.70, miniboss 3.10. Player base speed 6.4.

Global speedMul:

```text
m = minutes
through 15m: 1 + 0.016*m
after 15m:   1.24 + 0.008*(m-15)
+ Collapse steps after 30:00 (+0.02 each step)
hard cap ≈ 1.70
```

Opening composition is gradual (fodder only 0–30s; sprinters after 30s; hunters after 2m; elites after 90s).

## Pressure director

`normal → telegraph → surge → recovery → normal`. One surge at a time. Kinds: sprinters, pincer, bruiser, encircle, elite (time-gated), flood. Recovery ≈10s at ~60% spawn rate.

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

Deterministic benchmark harness: `survivorWeaponBenchmark.ts` (single durable target, sparse, dense, mixed-elite, mobile/off-axis).

| Hero | Starter | Role |
|---|---|---|
| Boswell | Microdrone Swarm | Reliable homing |
| Fitzwilliam | Rail Lance | Pierce lanes |
| Fortunato | Bio-Plasma Glob | Splash + puddle |
| Rutherford | Rocket Barrage | Cluster delayed strikes |

Weighted starter output targets within ~±15% of mean. L1–L5 progression uses mechanical breakpoints (extra projectiles, pierce, puddle, bounce). Overclock after L5: **+7% additive** damage per displayed level.

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
npm run build
```

Browser verification is required for changed gameplay, HUD, asset, and effect fixtures.


## Boss pattern lifecycle (2.0.1)

Every `BossPatternId` has an exhaustive windup → active → recover → idle state machine in `survivorBossPatterns.ts`. There is no silent fallback for unhandled patterns.

Shared patterns: pulse, line, fan (one volley), summon (one spawn), breach-orb, contamination.

Unique patterns are selected by cadence (within first few cycles, then every 3–5 attacks): rupture-ring, cryo-lanes, ravage-charge, sweeping-beam, aerial-strafe, spore-bloom.

Mega-only: gravity-collapse, cataclysm — never used by regular bosses; forced early on Mega-Bosses.

Fan and summon use a one-shot `patternTriggered` flag so they cannot multi-fire per frame.

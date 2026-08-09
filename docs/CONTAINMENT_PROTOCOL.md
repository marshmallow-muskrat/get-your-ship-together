# Containment Protocol

**Status:** Primary game direction  
**Mode:** One-map endless high-score survival  
**Current balance line:** `endless-2.1.0`

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

Every 120s (≈15s before each boss window): corner beacon with Aegis Barrier, Rocket Barrage, or Gunship Flyby. Mega-Boss death leaves an enhanced non-expiring cache.


## Endless difficulty

Enemy and boss growth must eventually exceed the player’s additive Overclock growth.

Current direction:

```text
m = elapsedSeconds / 60
enemyHealth = 1 + 0.12m + 0.02*max(0,m-8)^2
enemyDamage = 1 + 0.08m + 0.05*max(0,m-10)
enemySpeed  = min(1.30, 1 + 0.015m)
```

Boss index `n` arrives at `n * 120` seconds. Boss health grows multiplicatively while recovery shortens within a safe telegraph floor. The game ends through readable pressure, not an arbitrary kill timer.

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

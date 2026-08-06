# Containment Protocol

**Status:** Primary game direction  
**Mode:** One-map endless high-score survival  
**Current balance line:** `endless-1.x`

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

Recommended repeatable damage model:

```text
overclockLevel = max(0, displayedLevel - 5)
damage = level5Damage * (1 + 0.08 * overclockLevel)
```

The increase is additive against the Level-5 base. It must not compound as `1.08 ^ overclockLevel`.

Repeatable scaling may affect direct, splash, damage-over-time, puddle, and other weapon damage. Structural properties such as projectile count, fire rate, pierce, area, and lifetime remain authored or safely capped.

### Passive continuation

Safe passives can continue beyond Level 5 with smaller or diminishing gains while still displaying L6, L7, and so on. Examples include maximum Integrity and carefully bounded regeneration.

The following retain hard safety caps and display MAX when capped:

- Damage reduction
- Fire-rate/cooldown reduction
- Movement speed
- Pickup reach
- Area size
- Projectile count
- Mech or ship duration

Temporary repair, barrier, and overcharge rewards remain valid choices, but they are not a substitute for visible endless weapon growth.

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

The data-driven boss rotation uses a curated runtime subset from Ultimate Monsters. Bosses have distinct silhouettes, normalized scale/colliders, a red hostile aura, and pattern preferences. Concurrent boss pressure is bounded; scheduled pressure must never silently disappear.

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

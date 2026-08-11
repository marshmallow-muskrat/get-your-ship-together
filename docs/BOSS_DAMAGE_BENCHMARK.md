# Boss Damage Benchmark

Balance version: `endless-2.7.0`
Experiment: `endless-2.8.0-boss-fairness`

**This file is generated.** Regenerate it with `npm run bench:bossdamage`.

Boss fairness has two questions. Whether the physical hierarchy is real at every
boss index — which a table of authored constants only answers for boss 1 — and
whether one committed action lands one impact, which a table cannot answer at all.
The scaling section below evaluates the shared damage law across the ladder; the
census section drives the real simulation and counts what the player was billed.

## Physical hierarchy

Body and charge are authored against the representative ranged impact (`projectile`, 15.0 at boss 1).

| Tier | Band | Observed (all indexes/phases) |
| --- | ---: | ---: |
| Body | 1.15–1.30x | 1.200x |
| Telegraphed charge | 1.40–1.60x | 1.467x |

A single value in the observed column means the ratio is constant across every
boss index and phase, which is the point: one scaling law, applied once.

## Scaling ladder (phase 1)

| Boss | Mega | Damage x | Projectile | Beam | Radial | Puddle | Body | Charge |
| ---: | :-: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| 1 |  | 1.00 | 15.0 | 16.0 | 18.0 | 12.0 | 18.0 | 22.0 |
| 2 |  | 1.12 | 16.8 | 17.9 | 20.2 | 13.4 | 20.2 | 24.6 |
| 3 |  | 1.24 | 18.6 | 19.8 | 22.3 | 14.9 | 22.3 | 27.3 |
| 4 |  | 1.36 | 20.4 | 21.8 | 24.5 | 16.3 | 24.5 | 29.9 |
| 5 | Y | 1.85 | 27.8 | 29.6 | 33.3 | 22.2 | 33.3 | 40.7 |
| 6 |  | 1.60 | 24.0 | 25.6 | 28.8 | 19.2 | 28.8 | 35.2 |
| 7 |  | 1.72 | 25.8 | 27.5 | 31.0 | 20.6 | 31.0 | 37.8 |
| 8 |  | 1.84 | 27.6 | 29.4 | 33.1 | 22.1 | 33.1 | 40.5 |
| 9 |  | 1.96 | 29.4 | 31.4 | 35.3 | 23.5 | 35.3 | 43.1 |
| 10 | Y | 2.60 | 39.0 | 41.6 | 46.8 | 31.2 | 46.8 | 57.2 |
| 11 |  | 2.20 | 33.0 | 35.2 | 39.6 | 26.4 | 39.6 | 48.4 |
| 12 |  | 2.32 | 34.8 | 37.1 | 41.8 | 27.8 | 41.8 | 51.0 |
| 13 |  | 2.44 | 36.6 | 39.0 | 43.9 | 29.3 | 43.9 | 53.7 |

## Committed traversal census

The player is parked stationary in the path of a charge or strafing leap and the
production simulation is stepped. **Primary** counts impacts of the traversal's own
damage kind and must be exactly 1. **Trailing** counts everything the traversal
leaves behind — the charge's fissures — which is a separate, escapable mechanic.

| Pattern | Boss | Seeds | Primary | Trailing | Kinds | Max single hit | Worst-case total | x single |
| --- | ---: | ---: | ---: | ---: | --- | ---: | ---: | ---: |
| `ravage-charge` | 1 | 6 | 1 | 4 | `boss-charge`, `boss-puddle` | 22.0 | 44.0 | 2.00 |
| `ravage-charge` | 4 | 6 | 1 | 4 | `boss-charge`, `boss-puddle` | 29.9 | 59.8 | 2.00 |
| `ravage-charge` | 5 | 6 | 1 | 4 | `boss-charge`, `boss-puddle` | 40.7 | 81.4 | 2.00 |
| `ravage-charge` | 10 | 6 | 1 | 4 | `boss-charge`, `boss-puddle` | 57.2 | 114.4 | 2.00 |
| `ravage-charge` | 13 | 6 | 1 | 4 | `boss-charge`, `boss-puddle` | 53.7 | 107.4 | 2.00 |
| `aerial-strafe` | 1 | 6 | 1 | 0 | `boss-beam` | 14.0 | 14.0 | 1.00 |
| `aerial-strafe` | 4 | 6 | 1 | 0 | `boss-beam` | 19.0 | 19.0 | 1.00 |
| `aerial-strafe` | 5 | 6 | 1 | 0 | `boss-beam` | 25.9 | 25.9 | 1.00 |
| `aerial-strafe` | 10 | 6 | 1 | 0 | `boss-beam` | 36.4 | 36.4 | 1.00 |
| `aerial-strafe` | 13 | 6 | 1 | 0 | `boss-beam` | 34.2 | 34.2 | 1.00 |

## Pattern damage kinds

| Pattern | Reports as | Authored |
| --- | --- | ---: |
| `pulse` | `radial` | 16.0 |
| `line` | `beam` | 20.0 |
| `fan` | `projectile` | 12.0 |
| `summon` | — | — |
| `breach-orb` | `projectile` | 18.0 |
| `contamination` | `puddle` | 10.0 |
| `rupture-ring` | `radial` | 18.0 |
| `cryo-lanes` | `beam` | 14.0 |
| `ravage-charge` | `charge` | 22.0 |
| `sweeping-beam` | `beam` | 16.0 |
| `aerial-strafe` | `beam` | 14.0 |
| `spore-bloom` | `puddle` | 12.0 |
| `gravity-collapse` | `radial` | 22.0 |
| `cataclysm` | `radial` | 20.0 |

## Reading this

- **Primary must be 1.** More than one means a committed action is billing the player
  twice for the same commitment, which no telegraph can make fair.
- **Kinds** name what the death log will say. A traversal that bills `boss-body`
  instead of its own kind means the mechanic the player was shown is not the
  mechanic that hurt them. endless-2.7.0 did exactly that for the strafing leap.
- **Worst-case total** assumes the player never moves. It is an upper bound on a
  mistake, not the expected cost.

Generated: 2026-08-11T17:12:16.773Z

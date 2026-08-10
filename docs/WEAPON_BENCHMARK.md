# Weapon Benchmark

Balance version: `endless-2.6.1`

**This file is generated.** Every number below is produced by
`src/game/modes/survivor/survivorWeaponBenchmark.ts` and printed by
`src/game/modes/survivor/benchReport.ts`. Regenerate with `npm run bench:doc`.
Do not hand-edit the tables.

## Methodology

- Deterministic fixed-step simulation, seeded from `(weapon, level, scenario)`.
- Measurement window: 48s per level.
- Targets are **not** static dummies. They run their normal pursuit AI at their
  real role speeds while the player kites a circle, so homing, prediction and
  off-axis tracking are credited for what they actually do in a run.
- The kite completes a whole number of laps inside the window, removing
  partial-lap bias.
- Target HP is set high enough that nothing dies inside the window, so the
  measurement is raw effective output rather than a kill-rate cap.
- Ground truth is summed HP delta, which cannot double-count splash.
- Prototypes are benchmarked at their unlock time (Arc 5:00, Orbital 15:00).

## Scenarios

| Scenario | Shape | Starter weight |
| --- | --- | --- |
| `single-boss` | one durable boss-sized target | 0.18 |
| `sparse` | six mobile enemies spread around the player | 0.16 |
| `dense` | a closing ring of forty fodder | 0.14 |
| `mixed-elite` | sixteen sprinters plus an elite and a bruiser | 0.16 |
| `mobile-offaxis` | targets beside and behind the player facing | 0.16 |
| `lined-up` | a marching column of ten | 0.1 |
| `clustered` | one tight blob of twelve | 0.1 |

## Acceptance bounds

- Intended-scenario **L5/L1: 3–4.2**.
- Ordinary per-level gain: **15%–40%**.
- Exactly one declared mechanical breakpoint per weapon may reach **52%**.
- Hero starter weighted output: within **±15%** of the four-starter mean.
- No level may be a downgrade in its intended scenario.
- Authored per-shot damage never decreases, so every upgrade card reads as a gain.

## Progression in the intended scenario

| Weapon | Intended scenario | L1 | L2 | L3 | L4 | L5 | L5/L1 | L2 | L3 | L4 | L5 | Breakpoint |
| --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | --- |
| Pulse Blaster | `general` | 1917 | 2574 | 3280 | 4558 | 6320 | 3.30 | 34% | 27% | 39% | 39% | L5 |
| Microdrone Swarm | `mobile-offaxis` | 6552 | 8400 | 9720 | 13510 | 19694 | 3.01 | 28% | 16% | 39% | 46% | L5 |
| Rail Lance | `lined-up` | 9000 | 11845 | 16520 | 20880 | 30450 | 3.38 | 32% | 39% | 26% | 46% | L5 |
| Gravity Pulse | `dense` | 4444 | 5733 | 7992 | 10080 | 13662 | 3.07 | 29% | 39% | 26% | 36% | L5 |
| Rocket Barrage | `clustered` | 8326 | 9724 | 12825 | 17582 | 25992 | 3.12 | 17% | 32% | 37% | 48% | L5 |
| Bio-Plasma Glob | `clustered` | 8159 | 11066 | 15083 | 20758 | 28679 | 3.52 | 36% | 36% | 38% | 38% | L5 |
| Rotary Cannon | `single-boss` | 2937 | 3848 | 4995 | 5994 | 8880 | 3.02 | 31% | 30% | 20% | 48% | L5 |
| Plasma Wake | `mobile-offaxis` | 2052 | 2838 | 3744 | 4680 | 6732 | 3.28 | 38% | 32% | 25% | 44% | L5 |
| Pulsar Core | `dense` | 6048 | 7776 | 10080 | 12960 | 18176 | 3.01 | 29% | 30% | 29% | 40% | L5 |
| Arc Conductor | `mixed-elite` | 6525 | 8778 | 11280 | 14976 | 22360 | 3.43 | 35% | 29% | 33% | 49% | L5 |
| Orbital Lance | `single-boss` | 4760 | 6048 | 7790 | 10000 | 14500 | 3.05 | 27% | 29% | 28% | 45% | L5 |

## Hero starter parity (L1, weighted)

| Hero | Starter | Weighted output | vs mean |
| --- | --- | ---: | ---: |
| bee | microdrone | 1751 | 93.9% |
| flamingo | rail | 2138 | 114.7% |
| frog | bioplasma | 1656 | 88.8% |
| red-panda | rocket | 1913 | 102.6% |

Mean weighted output: 1864.

## Starter firing geometry (L1)

| Hero | Signature | Volley interval | Volleys/s | Shots/volley | Shots/s | Identity |
| --- | --- | ---: | ---: | ---: | ---: | --- |
| bee | Microdrone Swarm | 0.72s | 1.39 | 3 | 4.17 | A broad formation of drones fired in one committed direction. |
| flamingo | Rail Lance | 1.89s | 0.53 | 1 | 0.53 | Piercing line that cuts through dense packs. |
| frog | Bio-Plasma Glob | 0.63s | 1.60 | 1 | 1.60 | Toxic green globs that splash and leave corrosive residue. |
| red-panda | Rocket Barrage | 1.65s | 0.61 | 4 | 2.42 | Visible mini-rockets launch from the hero and burst on impact. |

Shots/s is presentation cadence, not a DPS ranking: Rail pierces full lines,
Bio-Plasma chains splash/corrosion, and rockets distribute area explosions.

## Per-scenario output (L1 → L5)

| Weapon | single-boss | sparse | dense | mixed-elite | mobile-offaxis | lined-up | clustered |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| Pulse Blaster | 294 → 968 | 588 → 1936 | 588 → 1936 | 588 → 1936 | 588 → 1936 | 378 → 1188 | 336 → 1056 |
| Microdrone Swarm | 1722 → 2752 | 2058 → 5332 | 2310 → 8342 | 2184 → 6708 | 2016 → 5590 | 1932 → 5676 | 2058 → 6880 |
| Rail Lance | 500 → 1392 | 1800 → 5220 | 5800 → 18966 | 4000 → 10614 | 1900 → 6264 | 2300 → 8178 | 2400 → 6960 |
| Gravity Pulse | 176 → 414 | 528 → 1656 | 1100 → 4278 | 968 → 2484 | 660 → 1932 | 704 → 1794 | 836 → 2622 |
| Rocket Barrage | 1288 → 3168 | 2024 → 5544 | 2990 → 11448 | 2208 → 8424 | 2070 → 6696 | 2208 → 9216 | 3450 → 8136 |
| Bio-Plasma Glob | 1029 → 4140 | 2076 → 7919 | 3143 → 11386 | 2518 → 9635 | 2092 → 8158 | 1890 → 7430 | 1804 → 7295 |
| Rotary Cannon | 693 → 2080 | 913 → 2760 | 924 → 2800 | 924 → 2800 | 913 → 2800 | 913 → 2620 | 924 → 2640 |
| Plasma Wake | 0 → 792 | 702 → 3366 | 6102 → 21780 | 3294 → 11880 | 2052 → 5445 | 2592 → 6831 | 3240 → 6534 |
| Pulsar Core | 42 → 157 | 210 → 637 | 1764 → 5605 | 378 → 1118 | 126 → 373 | 336 → 1010 | 378 → 1215 |
| Arc Conductor | 400 → 800 | 1400 → 4440 | 2113 → 6780 | 1963 → 6840 | 1775 → 4800 | 1625 → 5320 | 1463 → 4560 |
| Orbital Lance | 560 → 1740 | 840 → 2030 | 1260 → 5220 | 560 → 2610 | 420 → 2900 | 840 → 4060 | 1120 → 6960 |

## Endless progression beyond L5

Levels 6+ display normally (L6, L7, ...) and apply repeatable Overclock scaling:
additive damage growth per displayed level, never compounding, with no cap on the
number of Overclock levels. Safety caps on cooldown, area, projectile count,
pickup reach, transformation duration and damage reduction remain in force, and
one upgrade card still grants exactly one level.


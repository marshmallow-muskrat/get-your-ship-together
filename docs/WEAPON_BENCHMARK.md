# Weapon Benchmark

Balance version: `endless-2.3.0`

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
| Microdrone Swarm | `mobile-offaxis` | 8415 | 11407 | 15300 | 19000 | 28305 | 3.36 | 36% | 34% | 24% | 49% | L5 |
| Rail Lance | `lined-up` | 6160 | 8540 | 10965 | 13904 | 20566 | 3.34 | 39% | 28% | 27% | 48% | L5 |
| Gravity Pulse | `dense` | 4444 | 5733 | 7992 | 10080 | 13662 | 3.07 | 29% | 39% | 26% | 36% | L5 |
| Rocket Barrage | `clustered` | 9786 | 12789 | 17420 | 24070 | 32147 | 3.28 | 31% | 36% | 38% | 34% | L5 |
| Bio-Plasma Glob | `clustered` | 6608 | 8844 | 11521 | 15167 | 22692 | 3.43 | 34% | 30% | 32% | 50% | L5 |
| Arc Conductor | `mixed-elite` | 4157 | 5681 | 7413 | 9541 | 13715 | 3.30 | 37% | 30% | 29% | 44% | L5 |
| Orbital Lance | `single-boss` | 2240 | 2856 | 3485 | 4750 | 6960 | 3.11 | 27% | 22% | 36% | 47% | L5 |

## Hero starter parity (L1, weighted)

| Hero | Starter | Weighted output | vs mean |
| --- | --- | ---: | ---: |
| bee | microdrone | 1790 | 114.1% |
| flamingo | rail | 1505 | 95.9% |
| frog | bioplasma | 1404 | 89.5% |
| red-panda | rocket | 1575 | 100.4% |

Mean weighted output: 1568.

## Per-scenario output (L1 → L5)

| Weapon | single-boss | sparse | dense | mixed-elite | mobile-offaxis | lined-up | clustered |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| Pulse Blaster | 294 → 968 | 588 → 1936 | 588 → 1936 | 588 → 1936 | 588 → 1936 | 378 → 1188 | 336 → 1056 |
| Microdrone Swarm | 990 → 3315 | 2530 → 8415 | 2915 → 9265 | 2695 → 8840 | 2585 → 8585 | 1595 → 5100 | 1430 → 4505 |
| Rail Lance | 550 → 1456 | 1540 → 4004 | 3520 → 13104 | 1650 → 7098 | 1540 → 4004 | 1760 → 6552 | 1650 → 5096 |
| Gravity Pulse | 176 → 414 | 528 → 1656 | 1100 → 4278 | 968 → 2484 | 660 → 1932 | 704 → 1794 | 836 → 2622 |
| Rocket Barrage | 756 → 2013 | 1050 → 3050 | 4242 → 14396 | 2184 → 7747 | 1260 → 3172 | 1890 → 6649 | 3024 → 9150 |
| Bio-Plasma Glob | 816 → 3219 | 1639 → 6510 | 2559 → 9122 | 2056 → 7198 | 1733 → 6409 | 1712 → 5936 | 1612 → 5763 |
| Arc Conductor | 272 → 520 | 952 → 2886 | 1437 → 4407 | 1335 → 4446 | 1207 → 3120 | 1105 → 3458 | 995 → 2964 |
| Orbital Lance | 560 → 1740 | 560 → 1450 | 980 → 3190 | 420 → 1740 | 420 → 2030 | 560 → 3190 | 700 → 4930 |

## Endless progression beyond L5

Levels 6+ display normally (L6, L7, ...) and apply repeatable Overclock scaling:
additive damage growth per displayed level, never compounding, with no cap on the
number of Overclock levels. Safety caps on cooldown, area, projectile count,
pickup reach, transformation duration and damage reduction remain in force, and
one upgrade card still grants exactly one level.


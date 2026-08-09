# Weapon Benchmark

Balance version: `endless-2.2.1`

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
| Pulse Blaster | `general` | 1921 | 2580 | 3290 | 4576 | 6347 | 3.30 | 34% | 28% | 39% | 39% | L5 |
| Microdrone Swarm | `mobile-offaxis` | 12312 | 16320 | 21449 | 26532 | 39160 | 3.18 | 33% | 31% | 24% | 48% | L5 |
| Rail Lance | `lined-up` | 10560 | 13908 | 18189 | 23256 | 33488 | 3.17 | 32% | 31% | 28% | 44% | L5 |
| Gravity Pulse | `dense` | 10208 | 13622 | 18036 | 22920 | 33634 | 3.29 | 33% | 32% | 27% | 47% | L5 |
| Rocket Barrage | `clustered` | 16674 | 22560 | 30212 | 38280 | 56181 | 3.37 | 35% | 34% | 27% | 47% | L5 |
| Bio-Plasma Glob | `clustered` | 14952 | 19992 | 25893 | 34074 | 48190 | 3.22 | 34% | 30% | 32% | 41% | L5 |
| Arc Conductor | `mixed-elite` | 4310 | 5643 | 7403 | 9635 | 14417 | 3.35 | 31% | 31% | 30% | 50% | L5 |
| Orbital Lance | `single-boss` | 980 | 1296 | 1680 | 2148 | 3192 | 3.26 | 32% | 30% | 28% | 49% | L5 |

## Hero starter parity (L1, weighted)

| Hero | Starter | Weighted output | vs mean |
| --- | --- | ---: | ---: |
| bee | microdrone | 2447 | 102.0% |
| flamingo | rail | 2308 | 96.2% |
| frog | bioplasma | 2347 | 97.9% |
| red-panda | rocket | 2491 | 103.9% |

Mean weighted output: 2398.

## Per-scenario output (L1 → L5)

| Weapon | single-boss | sparse | dense | mixed-elite | mobile-offaxis | lined-up | clustered |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| Pulse Blaster | 294 → 1056 | 588 → 1936 | 588 → 1936 | 588 → 1936 | 588 → 1936 | 406 → 1342 | 350 → 1144 |
| Microdrone Swarm | 1440 → 4620 | 3456 → 10780 | 3816 → 11770 | 3672 → 12100 | 3672 → 11880 | 1872 → 6820 | 1800 → 6050 |
| Rail Lance | 550 → 1820 | 1870 → 4732 | 7260 → 20930 | 3520 → 11830 | 1760 → 5824 | 2090 → 7644 | 3300 → 10738 |
| Gravity Pulse | 176 → 536 | 880 → 2412 | 2860 → 9380 | 2156 → 6164 | 1144 → 2948 | 1100 → 2948 | 1760 → 5360 |
| Rocket Barrage | 840 → 2013 | 1680 → 3904 | 6804 → 26596 | 4326 → 13725 | 2016 → 5856 | 2268 → 7808 | 4998 → 16958 |
| Bio-Plasma Glob | 816 → 3578 | 2026 → 7780 | 5247 → 16699 | 3921 → 12991 | 2845 → 10055 | 2408 → 8456 | 3299 → 11236 |
| Arc Conductor | 272 → 572 | 978 → 2964 | 1437 → 4407 | 1360 → 4446 | 1233 → 3237 | 1437 → 4446 | 995 → 3211 |
| Orbital Lance | 560 → 1596 | 980 → 2394 | 2100 → 6118 | 1400 → 5320 | 1260 → 3990 | 1540 → 4256 | 2520 → 8246 |

## Endless progression beyond L5

Levels 6+ display normally (L6, L7, ...) and apply repeatable Overclock scaling:
additive damage growth per displayed level, never compounding, with no cap on the
number of Overclock levels. Safety caps on cooldown, area, projectile count,
pickup reach, transformation duration and damage reduction remain in force, and
one upgrade card still grants exactly one level.


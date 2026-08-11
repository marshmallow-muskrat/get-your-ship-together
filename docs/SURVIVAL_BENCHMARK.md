# Survival Benchmark

Balance version: `endless-2.8.0`
Experiment: `endless-2.8.0-combined-candidate`
Policy: `competent`
Sample: 24 seeded runs per hero; 96 total runs; 30-minute censor limit.

**This file is generated.** Regenerate it with `npm run bench:survival`.
The simulation is a regression instrument, not a substitute for human playtesting.

![Mean survival time with one-standard-deviation bars](generated/survival-time-standard-deviation.svg)

## Survival distribution

| Hero | Runs | Mean ± SD | 95% CI | Median | P10 | P25 | P75 | P90 | Censored |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| Boswell | 24 | 14:44 ± 5:12 | 12:39–16:49 | 15:09 | 8:07 | 11:13 | 18:32 | 20:27 | 0 |
| Fitzwilliam | 24 | 11:20 ± 7:30 | 8:20–14:20 | 10:48 | 2:47 | 4:20 | 16:56 | 21:54 | 0 |
| Fortunato | 24 | 15:49 ± 6:12 | 13:20–18:18 | 18:20 | 6:27 | 9:58 | 21:02 | 22:28 | 0 |
| Rutherford | 24 | 11:03 ± 6:00 | 8:39–13:27 | 10:41 | 4:01 | 5:19 | 14:45 | 20:03 | 0 |

Standard deviation describes spread around the mean. Median and percentiles are
included because endless-run survival is usually skewed rather than normally distributed.
Censored runs reached the safety limit alive and are not treated as observed deaths.

## Provisional Standard-mode contract

This target comes from the founders and remains provisional until simulated policies
are calibrated against human playtests. It is a decision aid, not an automatic tuning order.

| Measure | Target | Observed |
| --- | ---: | ---: |
| Competent median | ≈12:00 | 13:11 |
| Standard deviation | 3:30–4:00 | 6:31 |
| Mean + 2σ | 18:00–20:00 | 26:17 |
| Mean + 3σ | 22:00–24:00 | 32:48 |

## Pressure and agency diagnostics

| Hero | Kills | Elite kills | Mean elites alive | Peak elites alive | Bosses | Mech uptime | Gunship uses | Gunship damage | Kills/use |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| Boswell | 3771 | 44.1 | 0.8 | 3.7 | 5.8 | 17.3% | 2.83 | 15050 | 26.6 |
| Fitzwilliam | 2986 | 32.8 | 0.6 | 2.9 | 4.2 | 15.8% | 1.38 | 6487 | 23.1 |
| Fortunato | 4319 | 49.5 | 0.8 | 4.0 | 6.3 | 17.3% | 3.17 | 19789 | 25.6 |
| Rutherford | 2730 | 31.3 | 0.7 | 2.9 | 3.8 | 16.1% | 1.29 | 6201 | 23.1 |

## Leading death sources

- **Boswell:** boss-puddle 9, horde-contact 7, boss-radial 5
- **Fitzwilliam:** horde-contact 15, boss-puddle 4, boss-projectile 3
- **Fortunato:** horde-contact 9, boss-projectile 5, boss-puddle 4
- **Rutherford:** horde-contact 11, boss-puddle 5, boss-projectile 3

## Methodology

- Runs execute the real deterministic fixed-step simulation without Three.js rendering.
- Every hero receives the same seed set, making spawn and director schedules comparable.
- The policy sees current state only. It has no future RNG, attack outcome, or spawn knowledge.
- Movement, cooldowns, upgrade cards, Cache collection, Protocol selection, bosses and death use production code.
- The competent policy kites local threats, pursues reachable objectives, and uses abilities reactively with a bounded reaction interval.
- Human playtesting remains authoritative for readability, satisfaction, fairness and fun.

Generated: 2026-08-11T18:33:09.547Z

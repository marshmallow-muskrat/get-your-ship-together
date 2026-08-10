# Survival Benchmark

Balance version: `endless-2.5.0`
Experiment: `endless-2.5.0-midgame-durability-candidate`
Policy: `competent`
Sample: 24 seeded runs per hero; 96 total runs; 30-minute censor limit.

**This file is generated.** Regenerate it with `npm run bench:survival`.
The simulation is a regression instrument, not a substitute for human playtesting.

![Mean survival time with one-standard-deviation bars](generated/survival-time-standard-deviation.svg)

## Survival distribution

| Hero | Runs | Mean ± SD | 95% CI | Median | P10 | P25 | P75 | P90 | Censored |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| Boswell | 24 | 15:46 ± 4:22 | 14:01–17:31 | 16:14 | 10:17 | 11:21 | 18:40 | 20:58 | 0 |
| Fitzwilliam | 24 | 8:07 ± 5:32 | 5:54–10:20 | 6:25 | 3:21 | 4:34 | 10:35 | 16:27 | 0 |
| Fortunato | 24 | 10:26 ± 6:24 | 7:52–13:00 | 6:51 | 4:14 | 5:12 | 16:19 | 20:21 | 0 |
| Rutherford | 24 | 9:05 ± 5:21 | 6:56–11:13 | 7:15 | 3:02 | 5:16 | 14:51 | 16:19 | 0 |

Standard deviation describes spread around the mean. Median and percentiles are
included because endless-run survival is usually skewed rather than normally distributed.
Censored runs reached the safety limit alive and are not treated as observed deaths.

## Provisional Standard-mode contract

This target comes from the founders and remains provisional until simulated policies
are calibrated against human playtests. It is a decision aid, not an automatic tuning order.

| Measure | Target | Observed |
| --- | ---: | ---: |
| Competent median | ≈12:00 | 10:25 |
| Standard deviation | 3:30–4:00 | 6:08 |
| Mean + 2σ | 18:00–20:00 | 23:08 |
| Mean + 3σ | 22:00–24:00 | 29:16 |

## Pressure and agency diagnostics

| Hero | Kills | Elite kills | Mean elites alive | Peak elites alive | Bosses | Mech uptime | Gunship uses | Gunship damage | Kills/use |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| Boswell | 4458 | 49.8 | 0.7 | 4.3 | 6.5 | 15.9% | 2.79 | 15529 | 26.6 |
| Fitzwilliam | 1758 | 20.7 | 0.6 | 2.5 | 2.4 | 14.8% | 0.96 | 5433 | 27.7 |
| Fortunato | 2501 | 29.6 | 0.7 | 3.0 | 3.6 | 15.5% | 1.71 | 10986 | 27.4 |
| Rutherford | 2091 | 24.0 | 0.5 | 2.5 | 3.0 | 15.4% | 1.21 | 5546 | 23.7 |

## Leading death sources

- **Boswell:** horde-contact 10, boss-radial 5, boss-charge 4
- **Fitzwilliam:** horde-contact 13, boss-charge 4, boss-radial 3
- **Fortunato:** horde-contact 9, boss-puddle 4, boss-projectile 4
- **Rutherford:** horde-contact 12, boss-body 4, boss-projectile 3

## Methodology

- Runs execute the real deterministic fixed-step simulation without Three.js rendering.
- Every hero receives the same seed set, making spawn and director schedules comparable.
- The policy sees current state only. It has no future RNG, attack outcome, or spawn knowledge.
- Movement, cooldowns, upgrade cards, Cache collection, Protocol selection, bosses and death use production code.
- The competent policy kites local threats, pursues reachable objectives, and uses abilities reactively with a bounded reaction interval.
- Human playtesting remains authoritative for readability, satisfaction, fairness and fun.

Generated: 2026-08-10T03:38:45.577Z

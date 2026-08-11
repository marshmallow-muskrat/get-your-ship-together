# Survival Benchmark

Balance version: `endless-2.7.0`
Experiment: `endless-2.8.0-boss-fairness`
Policy: `competent`
Sample: 24 seeded runs per hero; 96 total runs; 30-minute censor limit.

**This file is generated.** Regenerate it with `npm run bench:survival`.
The simulation is a regression instrument, not a substitute for human playtesting.

![Mean survival time with one-standard-deviation bars](generated/survival-time-standard-deviation.svg)

## Survival distribution

| Hero | Runs | Mean ± SD | 95% CI | Median | P10 | P25 | P75 | P90 | Censored |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| Boswell | 24 | 16:11 ± 5:59 | 13:48–18:35 | 18:55 | 6:34 | 12:14 | 20:59 | 21:58 | 0 |
| Fitzwilliam | 24 | 10:26 ± 7:27 | 7:27–13:25 | 7:43 | 3:07 | 3:38 | 18:32 | 20:24 | 0 |
| Fortunato | 24 | 15:25 ± 6:31 | 12:49–18:02 | 16:10 | 5:45 | 10:08 | 20:46 | 22:34 | 0 |
| Rutherford | 24 | 11:50 ± 5:46 | 9:31–14:08 | 10:54 | 4:58 | 6:34 | 15:44 | 19:17 | 0 |

Standard deviation describes spread around the mean. Median and percentiles are
included because endless-run survival is usually skewed rather than normally distributed.
Censored runs reached the safety limit alive and are not treated as observed deaths.

## Provisional Standard-mode contract

This target comes from the founders and remains provisional until simulated policies
are calibrated against human playtests. It is a decision aid, not an automatic tuning order.

| Measure | Target | Observed |
| --- | ---: | ---: |
| Competent median | ≈12:00 | 14:38 |
| Standard deviation | 3:30–4:00 | 6:48 |
| Mean + 2σ | 18:00–20:00 | 27:04 |
| Mean + 3σ | 22:00–24:00 | 33:53 |

## Pressure and agency diagnostics

| Hero | Kills | Elite kills | Mean elites alive | Peak elites alive | Bosses | Mech uptime | Gunship uses | Gunship damage | Kills/use |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| Boswell | 4441 | 50.6 | 0.8 | 4.3 | 6.5 | 17.4% | 2.71 | 16925 | 26.7 |
| Fitzwilliam | 2686 | 30.9 | 0.6 | 3.3 | 3.8 | 16.2% | 1.42 | 7335 | 23.1 |
| Fortunato | 4112 | 49.7 | 0.9 | 4.5 | 6.0 | 17.4% | 2.79 | 18721 | 28.5 |
| Rutherford | 2886 | 34.1 | 0.7 | 3.3 | 4.3 | 17.4% | 1.25 | 6146 | 21.8 |

## Leading death sources

- **Boswell:** horde-contact 13, boss-puddle 5, elite-lunge 3
- **Fitzwilliam:** horde-contact 16, boss-puddle 4, boss-projectile 2
- **Fortunato:** horde-contact 14, boss-puddle 5, boss-projectile 2
- **Rutherford:** horde-contact 12, boss-puddle 5, boss-projectile 2

## Methodology

- Runs execute the real deterministic fixed-step simulation without Three.js rendering.
- Every hero receives the same seed set, making spawn and director schedules comparable.
- The policy sees current state only. It has no future RNG, attack outcome, or spawn knowledge.
- Movement, cooldowns, upgrade cards, Cache collection, Protocol selection, bosses and death use production code.
- The competent policy kites local threats, pursues reachable objectives, and uses abilities reactively with a bounded reaction interval.
- Human playtesting remains authoritative for readability, satisfaction, fairness and fun.

Generated: 2026-08-11T16:52:38.619Z

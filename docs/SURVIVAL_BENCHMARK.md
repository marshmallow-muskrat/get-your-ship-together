# Survival Benchmark

Balance version: `endless-2.11.0`
Experiment: `endless-2.11.0`
Policy: `competent`
Sample: 6 seeded runs per hero; 24 total runs; 30-minute censor limit.

**This file is generated.** Regenerate it with `npm run bench:survival`.
The simulation is a regression instrument, not a substitute for human playtesting.

![Mean survival time with one-standard-deviation bars](generated/survival-time-standard-deviation.svg)

## Survival distribution

| Hero | Runs | Mean ± SD | 95% CI | Median | P10 | P25 | P75 | P90 | Censored |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| Boswell | 6 | 16:03 ± 7:06 | 10:21–21:44 | 13:46 | 11:14 | 12:04 | 15:46 | 23:08 | 1 |
| Fitzwilliam | 6 | 14:21 ± 8:00 | 7:56–20:45 | 12:33 | 7:12 | 8:30 | 16:59 | 23:17 | 0 |
| Fortunato | 6 | 11:54 ± 4:07 | 8:37–15:12 | 11:39 | 8:16 | 10:21 | 12:45 | 15:48 | 0 |
| Rutherford | 6 | 13:46 ± 7:20 | 7:54–19:39 | 13:16 | 6:36 | 8:13 | 16:04 | 21:27 | 0 |

Standard deviation describes spread around the mean. Median and percentiles are
included because endless-run survival is usually skewed rather than normally distributed.
Censored runs reached the safety limit alive and are not treated as observed deaths.

## Provisional Standard-mode contract

This target comes from the founders and remains provisional until simulated policies
are calibrated against human playtests. It is a decision aid, not an automatic tuning order.

| Measure | Target | Observed |
| --- | ---: | ---: |
| Competent median | ≈12:00 | 12:42 |
| Standard deviation | 3:30–4:00 | 6:32 |
| Mean + 2σ | 18:00–20:00 | 27:04 |
| Mean + 3σ | 22:00–24:00 | 33:36 |

## Pressure and agency diagnostics

| Hero | Kills | Elite kills | Mean elites alive | Peak elites alive | Bosses | Mech uptime | Gunship uses | Gunship damage | Kills/use |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| Boswell | 3761 | 43.8 | 1.0 | 3.3 | 6.2 | 17.6% | 0.00 | 0 | 0.0 |
| Fitzwilliam | 3298 | 39.2 | 0.9 | 3.2 | 5.5 | 18.0% | 0.00 | 0 | 0.0 |
| Fortunato | 2330 | 28.8 | 1.1 | 3.7 | 3.5 | 17.6% | 0.00 | 0 | 0.0 |
| Rutherford | 3310 | 35.2 | 0.8 | 3.2 | 5.3 | 16.2% | 0.00 | 0 | 0.0 |

## Leading death sources

- **Boswell:** boss-puddle 3, boss-projectile 1, horde-contact 1
- **Fitzwilliam:** horde-contact 5, boss-puddle 1
- **Fortunato:** boss-puddle 2, horde-contact 2, boss-radial 2
- **Rutherford:** horde-contact 3, boss-projectile 1, boss-body 1

## Methodology

- Runs execute the real deterministic fixed-step simulation without Three.js rendering.
- Every hero receives the same seed set, making spawn and director schedules comparable.
- The policy sees current state only. It has no future RNG, attack outcome, or spawn knowledge.
- Movement, cooldowns, upgrade cards, Cache collection, Protocol selection, bosses and death use production code.
- The competent policy kites local threats, pursues reachable objectives, and uses abilities reactively with a bounded reaction interval.
- Human playtesting remains authoritative for readability, satisfaction, fairness and fun.

Generated: 2026-08-16T02:24:54.513Z

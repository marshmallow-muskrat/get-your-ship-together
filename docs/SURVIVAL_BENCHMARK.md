# Survival Benchmark

Balance version: `endless-2.10.0-test-center`
Experiment: `cosmic-cleanup-post`
Policy: `competent`
Sample: 6 seeded runs per hero; 24 total runs; 30-minute censor limit.

**This file is generated.** Regenerate it with `npm run bench:survival`.
The simulation is a regression instrument, not a substitute for human playtesting.

![Mean survival time with one-standard-deviation bars](generated/survival-time-standard-deviation.svg)

## Survival distribution

| Hero | Runs | Mean ± SD | 95% CI | Median | P10 | P25 | P75 | P90 | Censored |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| Boswell | 6 | 17:15 ± 7:14 | 11:27–23:02 | 14:15 | 11:14 | 11:48 | 23:45 | 26:15 | 0 |
| Fitzwilliam | 6 | 12:47 ± 2:55 | 10:27–15:07 | 12:16 | 10:19 | 10:48 | 13:10 | 15:45 | 0 |
| Fortunato | 6 | 12:23 ± 7:21 | 6:30–18:16 | 11:25 | 6:15 | 7:16 | 12:45 | 19:29 | 0 |
| Rutherford | 6 | 13:01 ± 6:32 | 7:47–18:14 | 11:49 | 6:33 | 7:41 | 17:43 | 20:40 | 0 |

Standard deviation describes spread around the mean. Median and percentiles are
included because endless-run survival is usually skewed rather than normally distributed.
Censored runs reached the safety limit alive and are not treated as observed deaths.

## Provisional Standard-mode contract

This target comes from the founders and remains provisional until simulated policies
are calibrated against human playtests. It is a decision aid, not an automatic tuning order.

| Measure | Target | Observed |
| --- | ---: | ---: |
| Competent median | ≈12:00 | 12:25 |
| Standard deviation | 3:30–4:00 | 6:11 |
| Mean + 2σ | 18:00–20:00 | 26:14 |
| Mean + 3σ | 22:00–24:00 | 32:25 |

## Pressure and agency diagnostics

| Hero | Kills | Elite kills | Mean elites alive | Peak elites alive | Bosses | Mech uptime | Gunship uses | Gunship damage | Kills/use |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| Boswell | 4432 | 47.5 | 0.9 | 3.0 | 6.7 | 17.3% | 0.00 | 0 | 0.0 |
| Fitzwilliam | 2433 | 32.0 | 0.9 | 3.0 | 4.5 | 18.0% | 0.00 | 0 | 0.0 |
| Fortunato | 2696 | 31.5 | 1.1 | 3.7 | 3.8 | 17.7% | 0.00 | 0 | 0.0 |
| Rutherford | 3069 | 32.7 | 0.8 | 2.8 | 4.8 | 16.3% | 0.00 | 0 | 0.0 |

## Leading death sources

- **Boswell:** boss-projectile 2, boss-puddle 2, boss-radial 1
- **Fitzwilliam:** horde-contact 5, boss-projectile 1
- **Fortunato:** boss-puddle 2, boss-radial 2, horde-contact 1
- **Rutherford:** horde-contact 5, boss-radial 1

## Methodology

- Runs execute the real deterministic fixed-step simulation without Three.js rendering.
- Every hero receives the same seed set, making spawn and director schedules comparable.
- The policy sees current state only. It has no future RNG, attack outcome, or spawn knowledge.
- Movement, cooldowns, upgrade cards, Cache collection, Protocol selection, bosses and death use production code.
- The competent policy kites local threats, pursues reachable objectives, and uses abilities reactively with a bounded reaction interval.
- Human playtesting remains authoritative for readability, satisfaction, fairness and fun.

Generated: 2026-08-13T18:25:59.301Z

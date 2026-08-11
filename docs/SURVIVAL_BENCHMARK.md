# Survival Benchmark

Balance version: `endless-2.7.0`
Experiment: `endless-2.8.0-repair-economy`
Policy: `competent`
Sample: 24 seeded runs per hero; 96 total runs; 30-minute censor limit.

**This file is generated.** Regenerate it with `npm run bench:survival`.
The simulation is a regression instrument, not a substitute for human playtesting.

![Mean survival time with one-standard-deviation bars](generated/survival-time-standard-deviation.svg)

## Survival distribution

| Hero | Runs | Mean ± SD | 95% CI | Median | P10 | P25 | P75 | P90 | Censored |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| Boswell | 24 | 13:00 ± 6:08 | 10:33–15:27 | 11:50 | 5:41 | 6:55 | 18:52 | 19:58 | 0 |
| Fitzwilliam | 24 | 8:26 ± 6:13 | 5:56–10:55 | 5:42 | 3:07 | 3:38 | 12:13 | 18:18 | 0 |
| Fortunato | 24 | 13:32 ± 6:46 | 10:50–16:14 | 13:49 | 5:45 | 6:38 | 19:21 | 22:01 | 0 |
| Rutherford | 24 | 10:09 ± 5:03 | 8:07–12:10 | 9:37 | 4:44 | 6:09 | 12:25 | 17:49 | 0 |

Standard deviation describes spread around the mean. Median and percentiles are
included because endless-run survival is usually skewed rather than normally distributed.
Censored runs reached the safety limit alive and are not treated as observed deaths.

## Provisional Standard-mode contract

This target comes from the founders and remains provisional until simulated policies
are calibrated against human playtests. It is a decision aid, not an automatic tuning order.

| Measure | Target | Observed |
| --- | ---: | ---: |
| Competent median | ≈12:00 | 9:59 |
| Standard deviation | 3:30–4:00 | 6:20 |
| Mean + 2σ | 18:00–20:00 | 23:57 |
| Mean + 3σ | 22:00–24:00 | 30:17 |

## Pressure and agency diagnostics

| Hero | Kills | Elite kills | Mean elites alive | Peak elites alive | Bosses | Mech uptime | Gunship uses | Gunship damage | Kills/use |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| Boswell | 3297 | 39.5 | 0.8 | 3.6 | 4.8 | 16.6% | 2.00 | 10604 | 24.7 |
| Fitzwilliam | 1959 | 21.8 | 0.6 | 2.5 | 2.8 | 15.9% | 1.00 | 5861 | 25.4 |
| Fortunato | 3525 | 42.3 | 0.8 | 4.2 | 5.0 | 16.9% | 2.50 | 16068 | 27.0 |
| Rutherford | 2311 | 27.6 | 0.7 | 2.9 | 3.3 | 17.1% | 0.75 | 3947 | 24.2 |

## Leading death sources

- **Boswell:** horde-contact 10, boss-puddle 6, boss-body 4
- **Fitzwilliam:** horde-contact 15, boss-puddle 4, boss-charge 3
- **Fortunato:** horde-contact 8, boss-charge 5, boss-radial 4
- **Rutherford:** horde-contact 12, boss-charge 3, boss-body 2

## Methodology

- Runs execute the real deterministic fixed-step simulation without Three.js rendering.
- Every hero receives the same seed set, making spawn and director schedules comparable.
- The policy sees current state only. It has no future RNG, attack outcome, or spawn knowledge.
- Movement, cooldowns, upgrade cards, Cache collection, Protocol selection, bosses and death use production code.
- The competent policy kites local threats, pursues reachable objectives, and uses abilities reactively with a bounded reaction interval.
- Human playtesting remains authoritative for readability, satisfaction, fairness and fun.

Generated: 2026-08-11T16:03:07.992Z

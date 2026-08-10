# Survival Benchmark

Balance version: `endless-2.4.0`
Experiment: `endless-2.4.0-combined-candidate`
Policy: `competent`
Sample: 24 seeded runs per hero; 96 total runs; 30-minute censor limit.

**This file is generated.** Regenerate it with `npm run bench:survival`.
The simulation is a regression instrument, not a substitute for human playtesting.

![Mean survival time with one-standard-deviation bars](generated/survival-time-standard-deviation.svg)

## Survival distribution

| Hero | Runs | Mean ± SD | 95% CI | Median | P10 | P25 | P75 | P90 | Censored |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| Boswell | 24 | 7:51 ± 2:21 | 6:54–8:47 | 7:10 | 4:58 | 6:21 | 10:03 | 11:07 | 0 |
| Fitzwilliam | 24 | 5:57 ± 2:48 | 4:50–7:04 | 5:19 | 3:17 | 4:34 | 6:47 | 10:34 | 0 |
| Fortunato | 24 | 6:46 ± 2:26 | 5:48–7:44 | 6:28 | 3:53 | 5:15 | 7:11 | 10:49 | 0 |
| Rutherford | 24 | 5:59 ± 3:05 | 4:44–7:13 | 5:47 | 2:33 | 3:47 | 7:14 | 10:17 | 0 |

Standard deviation describes spread around the mean. Median and percentiles are
included because endless-run survival is usually skewed rather than normally distributed.
Censored runs reached the safety limit alive and are not treated as observed deaths.

## Provisional Standard-mode contract

This target comes from the founders and remains provisional until simulated policies
are calibrated against human playtests. It is a decision aid, not an automatic tuning order.

| Measure | Target | Observed |
| --- | ---: | ---: |
| Competent median | ≈12:00 | 6:26 |
| Standard deviation | 3:30–4:00 | 2:45 |
| Mean + 2σ | 18:00–20:00 | 12:08 |
| Mean + 3σ | 22:00–24:00 | 14:53 |

## Pressure and agency diagnostics

| Hero | Kills | Elite kills | Mean elites alive | Peak elites alive | Bosses | Mech uptime | Gunship uses | Gunship damage | Kills/use |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| Boswell | 1578 | 18.8 | 0.5 | 2.4 | 2.1 | 15.8% | 0.54 | 3261 | 23.5 |
| Fitzwilliam | 1007 | 12.7 | 0.6 | 2.0 | 1.0 | 15.5% | 0.25 | 1399 | 23.0 |
| Fortunato | 1203 | 14.5 | 0.6 | 2.3 | 1.1 | 15.4% | 0.38 | 3422 | 31.9 |
| Rutherford | 1019 | 12.8 | 0.5 | 1.7 | 1.2 | 16.0% | 0.38 | 1994 | 23.3 |

## Leading death sources

- **Boswell:** boss-puddle 9, horde-contact 7, boss-radial 3
- **Fitzwilliam:** horde-contact 8, boss-puddle 6, boss-radial 3
- **Fortunato:** horde-contact 10, boss-puddle 6, boss-charge 5
- **Rutherford:** horde-contact 15, boss-puddle 4, boss-charge 3

## Methodology

- Runs execute the real deterministic fixed-step simulation without Three.js rendering.
- Every hero receives the same seed set, making spawn and director schedules comparable.
- The policy sees current state only. It has no future RNG, attack outcome, or spawn knowledge.
- Movement, cooldowns, upgrade cards, Cache collection, Protocol selection, bosses and death use production code.
- The competent policy kites local threats, pursues reachable objectives, and uses abilities reactively with a bounded reaction interval.
- Human playtesting remains authoritative for readability, satisfaction, fairness and fun.

Generated: 2026-08-10T02:29:12.502Z

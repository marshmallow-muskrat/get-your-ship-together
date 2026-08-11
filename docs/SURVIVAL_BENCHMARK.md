# Survival Benchmark

Balance version: `endless-2.7.0`
Experiment: `endless-2.7.0-baseline-repro2`
Policy: `competent`
Sample: 24 seeded runs per hero; 96 total runs; 30-minute censor limit.

**This file is generated.** Regenerate it with `npm run bench:survival`.
The simulation is a regression instrument, not a substitute for human playtesting.

![Mean survival time with one-standard-deviation bars](generated/survival-time-standard-deviation.svg)

## Survival distribution

| Hero | Runs | Mean ± SD | 95% CI | Median | P10 | P25 | P75 | P90 | Censored |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| Boswell | 24 | 11:55 ± 5:34 | 9:42–14:09 | 10:56 | 4:48 | 7:08 | 16:22 | 19:33 | 0 |
| Fitzwilliam | 24 | 11:44 ± 5:13 | 9:39–13:50 | 10:53 | 4:30 | 9:11 | 14:58 | 18:48 | 0 |
| Fortunato | 24 | 12:41 ± 5:15 | 10:34–14:47 | 10:44 | 7:12 | 8:38 | 16:41 | 20:29 | 0 |
| Rutherford | 24 | 9:31 ± 4:41 | 7:39–11:24 | 8:48 | 4:36 | 6:13 | 11:45 | 17:38 | 0 |

Standard deviation describes spread around the mean. Median and percentiles are
included because endless-run survival is usually skewed rather than normally distributed.
Censored runs reached the safety limit alive and are not treated as observed deaths.

## Provisional Standard-mode contract

This target comes from the founders and remains provisional until simulated policies
are calibrated against human playtests. It is a decision aid, not an automatic tuning order.

| Measure | Target | Observed |
| --- | ---: | ---: |
| Competent median | ≈12:00 | 10:37 |
| Standard deviation | 3:30–4:00 | 5:14 |
| Mean + 2σ | 18:00–20:00 | 21:57 |
| Mean + 3σ | 22:00–24:00 | 27:11 |

## Pressure and agency diagnostics

| Hero | Kills | Elite kills | Mean elites alive | Peak elites alive | Bosses | Mech uptime | Gunship uses | Gunship damage | Kills/use |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| Boswell | 2857 | 35.2 | 0.8 | 4.2 | 4.4 | 16.7% | 2.17 | 12620 | 27.5 |
| Fitzwilliam | 2864 | 33.5 | 0.7 | 3.3 | 4.3 | 17.2% | 1.67 | 7506 | 22.3 |
| Fortunato | 3002 | 36.4 | 0.8 | 3.5 | 4.5 | 17.2% | 2.38 | 15448 | 28.2 |
| Rutherford | 2182 | 25.4 | 0.7 | 3.3 | 3.0 | 16.6% | 0.79 | 3214 | 20.3 |

## Leading death sources

- **Boswell:** horde-contact 8, boss-charge 5, boss-puddle 5
- **Fitzwilliam:** boss-body 7, horde-contact 7, boss-puddle 5
- **Fortunato:** boss-body 6, boss-radial 6, boss-puddle 4
- **Rutherford:** boss-puddle 6, boss-projectile 5, boss-radial 4

## Methodology

- Runs execute the real deterministic fixed-step simulation without Three.js rendering.
- Every hero receives the same seed set, making spawn and director schedules comparable.
- The policy sees current state only. It has no future RNG, attack outcome, or spawn knowledge.
- Movement, cooldowns, upgrade cards, Cache collection, Protocol selection, bosses and death use production code.
- The competent policy kites local threats, pursues reachable objectives, and uses abilities reactively with a bounded reaction interval.
- Human playtesting remains authoritative for readability, satisfaction, fairness and fun.

Generated: 2026-08-11T15:21:21.079Z

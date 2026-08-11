# Survival Benchmark

Balance version: `endless-2.7.0`
Experiment: `endless-2.7.0-cleanup-crew-release`
Policy: `competent`
Sample: 24 seeded runs per hero; 96 total runs; 30-minute censor limit.

**This file is generated.** Regenerate it with `npm run bench:survival`.
The simulation is a regression instrument, not a substitute for human playtesting.

![Mean survival time with one-standard-deviation bars](generated/survival-time-standard-deviation.svg)

## Survival distribution

| Hero | Runs | Mean ± SD | 95% CI | Median | P10 | P25 | P75 | P90 | Censored |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| Boswell | 24 | 11:59 ± 5:40 | 9:43–14:15 | 11:12 | 4:47 | 6:51 | 16:24 | 18:47 | 0 |
| Fitzwilliam | 24 | 11:01 ± 5:09 | 8:57–13:05 | 10:41 | 4:30 | 8:22 | 11:35 | 18:48 | 0 |
| Fortunato | 24 | 13:29 ± 5:43 | 11:11–15:46 | 12:49 | 6:24 | 8:19 | 17:28 | 20:32 | 0 |
| Rutherford | 24 | 10:00 ± 5:07 | 7:57–12:03 | 9:28 | 4:36 | 6:21 | 11:44 | 18:28 | 0 |

Standard deviation describes spread around the mean. Median and percentiles are
included because endless-run survival is usually skewed rather than normally distributed.
Censored runs reached the safety limit alive and are not treated as observed deaths.

## Provisional Standard-mode contract

This target comes from the founders and remains provisional until simulated policies
are calibrated against human playtests. It is a decision aid, not an automatic tuning order.

| Measure | Target | Observed |
| --- | ---: | ---: |
| Competent median | ≈12:00 | 10:42 |
| Standard deviation | 3:30–4:00 | 5:29 |
| Mean + 2σ | 18:00–20:00 | 22:36 |
| Mean + 3σ | 22:00–24:00 | 28:05 |

## Pressure and agency diagnostics

| Hero | Kills | Elite kills | Mean elites alive | Peak elites alive | Bosses | Mech uptime | Gunship uses | Gunship damage | Kills/use |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| Boswell | 2930 | 35.9 | 0.7 | 4.1 | 4.5 | 16.6% | 2.13 | 11165 | 25.5 |
| Fitzwilliam | 2645 | 30.9 | 0.7 | 3.3 | 3.8 | 16.9% | 1.38 | 5716 | 20.5 |
| Fortunato | 3324 | 40.0 | 0.8 | 4.0 | 4.9 | 17.3% | 3.00 | 18850 | 26.8 |
| Rutherford | 2369 | 27.3 | 0.7 | 3.3 | 3.3 | 16.7% | 1.00 | 4991 | 22.7 |

## Leading death sources

- **Boswell:** horde-contact 7, boss-charge 6, boss-puddle 6
- **Fitzwilliam:** horde-contact 8, boss-body 6, boss-puddle 6
- **Fortunato:** boss-body 6, horde-contact 5, boss-charge 3
- **Rutherford:** boss-puddle 6, boss-radial 5, horde-contact 4

## Methodology

- Runs execute the real deterministic fixed-step simulation without Three.js rendering.
- Every hero receives the same seed set, making spawn and director schedules comparable.
- The policy sees current state only. It has no future RNG, attack outcome, or spawn knowledge.
- Movement, cooldowns, upgrade cards, Cache collection, Protocol selection, bosses and death use production code.
- The competent policy kites local threats, pursues reachable objectives, and uses abilities reactively with a bounded reaction interval.
- Human playtesting remains authoritative for readability, satisfaction, fairness and fun.

Generated: 2026-08-10T20:31:35.323Z

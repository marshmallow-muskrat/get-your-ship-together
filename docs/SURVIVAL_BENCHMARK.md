# Survival Benchmark

Balance version: `endless-2.6.0`
Experiment: `endless-2.6.0-content-completion-final`
Policy: `competent`
Sample: 24 seeded runs per hero; 96 total runs; 30-minute censor limit.

**This file is generated.** Regenerate it with `npm run bench:survival`.
The simulation is a regression instrument, not a substitute for human playtesting.

![Mean survival time with one-standard-deviation bars](generated/survival-time-standard-deviation.svg)

## Survival distribution

| Hero | Runs | Mean ± SD | 95% CI | Median | P10 | P25 | P75 | P90 | Censored |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| Boswell | 24 | 9:23 ± 3:27 | 8:00–10:46 | 8:37 | 5:53 | 6:48 | 11:39 | 14:10 | 0 |
| Fitzwilliam | 24 | 4:42 ± 2:12 | 3:49–5:35 | 4:50 | 2:16 | 3:04 | 5:55 | 7:11 | 0 |
| Fortunato | 24 | 6:07 ± 1:32 | 5:30–6:44 | 6:15 | 4:37 | 4:54 | 7:03 | 7:46 | 0 |
| Rutherford | 24 | 3:57 ± 1:43 | 3:16–4:39 | 3:58 | 1:25 | 2:54 | 4:59 | 6:03 | 0 |

Standard deviation describes spread around the mean. Median and percentiles are
included because endless-run survival is usually skewed rather than normally distributed.
Censored runs reached the safety limit alive and are not treated as observed deaths.

## Provisional Standard-mode contract

This target comes from the founders and remains provisional until simulated policies
are calibrated against human playtests. It is a decision aid, not an automatic tuning order.

| Measure | Target | Observed |
| --- | ---: | ---: |
| Competent median | ≈12:00 | 5:30 |
| Standard deviation | 3:30–4:00 | 3:07 |
| Mean + 2σ | 18:00–20:00 | 12:17 |
| Mean + 3σ | 22:00–24:00 | 15:24 |

## Pressure and agency diagnostics

| Hero | Kills | Elite kills | Mean elites alive | Peak elites alive | Bosses | Mech uptime | Gunship uses | Gunship damage | Kills/use |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| Boswell | 1843 | 24.5 | 0.8 | 3.0 | 2.8 | 16.5% | 1.17 | 6206 | 28.5 |
| Fitzwilliam | 590 | 8.0 | 0.8 | 2.5 | 0.3 | 14.7% | 0.38 | 1631 | 38.6 |
| Fortunato | 951 | 12.6 | 0.7 | 2.5 | 0.8 | 15.8% | 0.29 | 1577 | 33.1 |
| Rutherford | 497 | 6.5 | 0.4 | 1.5 | 0.1 | 14.9% | 0.13 | 602 | 32.3 |

## Leading death sources

- **Boswell:** horde-contact 8, boss-charge 6, boss-body 5
- **Fitzwilliam:** horde-contact 17, elite-lunge 3, boss-puddle 2
- **Fortunato:** horde-contact 10, boss-puddle 6, boss-charge 3
- **Rutherford:** horde-contact 21, boss-puddle 1, boss-projectile 1

## Methodology

- Runs execute the real deterministic fixed-step simulation without Three.js rendering.
- Every hero receives the same seed set, making spawn and director schedules comparable.
- The policy sees current state only. It has no future RNG, attack outcome, or spawn knowledge.
- Movement, cooldowns, upgrade cards, Cache collection, Protocol selection, bosses and death use production code.
- The competent policy kites local threats, pursues reachable objectives, and uses abilities reactively with a bounded reaction interval.
- Human playtesting remains authoritative for readability, satisfaction, fairness and fun.

Generated: 2026-08-10T05:13:51.579Z

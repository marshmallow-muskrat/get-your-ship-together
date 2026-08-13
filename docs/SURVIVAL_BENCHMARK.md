# Survival Benchmark

Balance version: `endless-2.9.0-test-center`
Experiment: `game-polish-followup-candidate`
Policy: `competent`
Sample: 6 seeded runs per hero; 24 total runs; 30-minute censor limit.

**This file is generated.** Regenerate it with `npm run bench:survival`.
The simulation is a regression instrument, not a substitute for human playtesting.

![Mean survival time with one-standard-deviation bars](generated/survival-time-standard-deviation.svg)

## Survival distribution

| Hero | Runs | Mean ± SD | 95% CI | Median | P10 | P25 | P75 | P90 | Censored |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| Boswell | 6 | 11:50 ± 10:23 | 3:32–20:08 | 6:19 | 4:03 | 4:53 | 19:50 | 25:09 | 0 |
| Fitzwilliam | 6 | 14:33 ± 10:28 | 6:10–22:55 | 13:38 | 4:35 | 5:18 | 23:32 | 25:25 | 0 |
| Fortunato | 6 | 12:48 ± 9:01 | 5:35–20:01 | 9:23 | 5:23 | 6:20 | 18:13 | 23:38 | 0 |
| Rutherford | 6 | 6:42 ± 3:45 | 3:42–9:41 | 5:14 | 3:43 | 4:10 | 8:35 | 11:08 | 0 |

Standard deviation describes spread around the mean. Median and percentiles are
included because endless-run survival is usually skewed rather than normally distributed.
Censored runs reached the safety limit alive and are not treated as observed deaths.

## Provisional Standard-mode contract

This target comes from the founders and remains provisional until simulated policies
are calibrated against human playtests. It is a decision aid, not an automatic tuning order.

| Measure | Target | Observed |
| --- | ---: | ---: |
| Competent median | ≈12:00 | 6:19 |
| Standard deviation | 3:30–4:00 | 8:46 |
| Mean + 2σ | 18:00–20:00 | 29:00 |
| Mean + 3σ | 22:00–24:00 | 37:46 |

## Pressure and agency diagnostics

| Hero | Kills | Elite kills | Mean elites alive | Peak elites alive | Bosses | Mech uptime | Gunship uses | Gunship damage | Kills/use |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| Boswell | 2864 | 34.3 | 1.0 | 3.2 | 3.7 | 16.5% | 0.00 | 0 | 0.0 |
| Fitzwilliam | 4285 | 48.2 | 1.0 | 3.8 | 5.5 | 16.6% | 0.00 | 0 | 0.0 |
| Fortunato | 3183 | 39.3 | 1.0 | 3.8 | 3.8 | 17.2% | 0.00 | 0 | 0.0 |
| Rutherford | 1124 | 14.3 | 0.7 | 2.3 | 0.8 | 15.6% | 0.00 | 0 | 0.0 |

## Leading death sources

- **Boswell:** horde-contact 3, boss-puddle 2, boss-projectile 1
- **Fitzwilliam:** horde-contact 3, boss-projectile 1, elite-lunge 1
- **Fortunato:** horde-contact 3, boss-puddle 3
- **Rutherford:** horde-contact 2, boss-radial 2, boss-projectile 1

## Methodology

- Runs execute the real deterministic fixed-step simulation without Three.js rendering.
- Every hero receives the same seed set, making spawn and director schedules comparable.
- The policy sees current state only. It has no future RNG, attack outcome, or spawn knowledge.
- Movement, cooldowns, upgrade cards, Cache collection, Protocol selection, bosses and death use production code.
- The competent policy kites local threats, pursues reachable objectives, and uses abilities reactively with a bounded reaction interval.
- Human playtesting remains authoritative for readability, satisfaction, fairness and fun.

Generated: 2026-08-13T12:36:45.786Z

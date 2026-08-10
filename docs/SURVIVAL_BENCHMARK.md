# Survival Benchmark

Balance version: `endless-2.6.1`
Experiment: `endless-2.6.1-hero-parity-final`
Policy: `competent`
Sample: 24 seeded runs per hero; 96 total runs; 30-minute censor limit.

**This file is generated.** Regenerate it with `npm run bench:survival`.
The simulation is a regression instrument, not a substitute for human playtesting.

![Mean survival time with one-standard-deviation bars](generated/survival-time-standard-deviation.svg)

## Survival distribution

| Hero | Runs | Mean ± SD | 95% CI | Median | P10 | P25 | P75 | P90 | Censored |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| Boswell | 24 | 9:44 ± 3:58 | 8:09–11:19 | 8:54 | 6:19 | 6:26 | 12:38 | 15:58 | 0 |
| Fitzwilliam | 24 | 7:37 ± 3:45 | 6:07–9:07 | 7:51 | 3:04 | 4:32 | 10:44 | 12:23 | 0 |
| Fortunato | 24 | 11:03 ± 4:52 | 9:06–12:59 | 9:32 | 6:21 | 6:52 | 15:01 | 18:35 | 0 |
| Rutherford | 24 | 10:24 ± 4:46 | 8:29–12:18 | 10:50 | 4:30 | 6:37 | 12:26 | 16:28 | 0 |

Standard deviation describes spread around the mean. Median and percentiles are
included because endless-run survival is usually skewed rather than normally distributed.
Censored runs reached the safety limit alive and are not treated as observed deaths.

## Provisional Standard-mode contract

This target comes from the founders and remains provisional until simulated policies
are calibrated against human playtests. It is a decision aid, not an automatic tuning order.

| Measure | Target | Observed |
| --- | ---: | ---: |
| Competent median | ≈12:00 | 10:18 |
| Standard deviation | 3:30–4:00 | 4:29 |
| Mean + 2σ | 18:00–20:00 | 18:40 |
| Mean + 3σ | 22:00–24:00 | 23:10 |

## Pressure and agency diagnostics

| Hero | Kills | Elite kills | Mean elites alive | Peak elites alive | Bosses | Mech uptime | Gunship uses | Gunship damage | Kills/use |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| Boswell | 2027 | 25.8 | 0.7 | 3.0 | 3.3 | 16.2% | 1.63 | 8187 | 27.6 |
| Fitzwilliam | 1436 | 18.5 | 0.6 | 2.7 | 2.3 | 15.7% | 0.83 | 3289 | 24.6 |
| Fortunato | 2441 | 29.9 | 0.8 | 3.0 | 3.7 | 16.8% | 1.88 | 9770 | 27.0 |
| Rutherford | 2342 | 27.5 | 0.7 | 2.6 | 3.5 | 16.9% | 1.17 | 5279 | 24.9 |

## Leading death sources

- **Boswell:** horde-contact 6, boss-puddle 6, boss-body 4
- **Fitzwilliam:** horde-contact 10, boss-body 4, boss-puddle 3
- **Fortunato:** boss-puddle 11, horde-contact 4, boss-radial 3
- **Rutherford:** horde-contact 11, boss-body 4, boss-puddle 3

## Methodology

- Runs execute the real deterministic fixed-step simulation without Three.js rendering.
- Every hero receives the same seed set, making spawn and director schedules comparable.
- The policy sees current state only. It has no future RNG, attack outcome, or spawn knowledge.
- Movement, cooldowns, upgrade cards, Cache collection, Protocol selection, bosses and death use production code.
- The competent policy kites local threats, pursues reachable objectives, and uses abilities reactively with a bounded reaction interval.
- Human playtesting remains authoritative for readability, satisfaction, fairness and fun.

Generated: 2026-08-10T07:05:42.690Z

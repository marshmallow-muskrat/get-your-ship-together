# Repair Economy Benchmark

Balance version: `endless-2.7.0`
Experiment: `endless-2.8.0-boss-fairness`
Policy: `competent`; 8 seeds per scenario.

**This file is generated.** Regenerate it with `npm run bench:repair`.

Scenarios are windows onto the real simulation at controlled kill rates, so a
healing faucet can be rejected before a 96-run survival benchmark is spent on it.
Snapshots are only comparable when generated on the same machine and Node build;
see the portability guardrail in `SURVIVAL_EXPERIMENTS.md`.

## Supply and flow

| Scenario | Kills/min | Ordinary | Premium | Kills per ordinary drop | Healing/active min |
| --- | ---: | ---: | ---: | ---: | ---: |
| `early-3min` | 127.9 | 4.4 | 0.0 | 45.7 | 26.9 |
| `mid-10min` | 253.0 | 11.0 | 0.0 | 41.7 | 55.9 |
| `late-20min` | 366.6 | 14.5 | 0.0 | 41.5 | 88.9 |
| `dense-late-26min` | 340.2 | 9.6 | 0.0 | 41.7 | 79.0 |

## Orb outcomes

| Scenario | Collected | Expired | Expired at full | Delivered | Overheal |
| --- | ---: | ---: | ---: | ---: | ---: |
| `early-3min` | 2.9 | 0.3 | 0.0 | 42 | 5 |
| `mid-10min` | 7.4 | 1.4 | 0.0 | 101 | 17 |
| `late-20min` | 10.4 | 1.3 | 0.0 | 146 | 20 |
| `dense-late-26min` | 6.4 | 0.1 | 0.0 | 93 | 9 |

## Availability and pressure

| Scenario | Mean active | Peak active | Mean nearest | Longest kill drought | Longest time drought | <75% | <50% | <25% | Deaths (no orb) |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| `early-3min` | 0.9 | 4 | 23.5 | 49 | 45.0s | 27s | 14s | 5s | 5 (0) |
| `mid-10min` | 2.1 | 6 | 20.5 | 50 | 22.6s | 34s | 20s | 7s | 4 (0) |
| `late-20min` | 2.2 | 9 | 19.6 | 50 | 23.8s | 33s | 14s | 8s | 6 (0) |
| `dense-late-26min` | 1.9 | 6 | 21.0 | 50 | 20.4s | 24s | 16s | 5s | 8 (0) |

## Scenarios

- `early-3min` — Opening build, low kill rate; the economy must not starve here. 120s window.
- `mid-10min` — Established build at the survival median; the common case. 120s window.
- `late-20min` — Strong build, high kill rate; the historical faucet regime. 120s window.
- `dense-late-26min` — Peak horde density and kill rate; the hardest faucet test. 120s window.

## Reading this

- **Kills per ordinary drop** is the tap width. A kill-driven economy should hold this
  roughly stable across scenarios; a number that falls as kill rate rises is a faucet.
- **Healing per active minute** is the flow. It may rise with kill rate, but it becomes
  a faucet when it outruns the damage the same horde inflicts.
- **Expired at full** is not waste. It is the player banking an orb for later, which is
  the intended affordance.
- **Deaths (no orb)** counts runs that ended with no ordinary orb anywhere. A non-zero
  value means availability, not player skill, decided the run.

Generated: 2026-08-11T17:12:18.072Z

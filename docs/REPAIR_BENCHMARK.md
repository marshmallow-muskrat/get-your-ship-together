# Repair Economy Benchmark

Balance version: `endless-2.7.0`
Experiment: `endless-2.8.0-accumulator`
Policy: `competent`; 6 seeds per scenario.

**This file is generated.** Regenerate it with `npm run bench:repair`.

Scenarios are windows onto the real simulation at controlled kill rates, so a
healing faucet can be rejected before a 96-run survival benchmark is spent on it.
Snapshots are only comparable when generated on the same machine and Node build;
see the portability guardrail in `SURVIVAL_EXPERIMENTS.md`.

## Supply and flow

| Scenario | Kills/min | Ordinary | Premium | Kills per ordinary drop | Healing/active min |
| --- | ---: | ---: | ---: | ---: | ---: |
| `early-3min` | 131.9 | 4.0 | 0.0 | 47.3 | 43.6 |
| `mid-10min` | 270.5 | 11.7 | 0.0 | 42.2 | 76.7 |
| `late-20min` | 344.4 | 10.7 | 0.0 | 40.6 | 89.8 |
| `dense-late-26min` | 361.5 | 9.8 | 0.0 | 43.1 | 118.4 |

## Orb outcomes

| Scenario | Collected | Expired | Expired at full | Delivered | Overheal |
| --- | ---: | ---: | ---: | ---: | ---: |
| `early-3min` | 3.2 | 0.3 | 0.0 | 62 | 10 |
| `mid-10min` | 7.8 | 1.5 | 0.0 | 140 | 33 |
| `late-20min` | 6.8 | 0.2 | 0.0 | 113 | 38 |
| `dense-late-26min` | 7.0 | 0.0 | 0.0 | 139 | 15 |

## Availability and pressure

| Scenario | Mean active | Peak active | Mean nearest | Longest kill drought | Longest time drought | <75% | <50% | <25% | Deaths (no orb) |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| `early-3min` | 0.7 | 3 | 24.3 | 49 | 36.7s | 25s | 13s | 4s | 5 (0) |
| `mid-10min` | 2.2 | 6 | 22.4 | 50 | 16.3s | 35s | 10s | 3s | 4 (0) |
| `late-20min` | 2.1 | 7 | 17.1 | 49 | 23.2s | 15s | 9s | 5s | 6 (0) |
| `dense-late-26min` | 1.7 | 7 | 18.3 | 50 | 19.0s | 22s | 11s | 4s | 6 (0) |

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

Generated: 2026-08-11T15:56:16.554Z

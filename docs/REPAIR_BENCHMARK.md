# Repair Economy Benchmark

Balance version: `endless-2.9.0-test-center`
Experiment: `game-polish-followup-candidate`
Policy: `competent`; 8 seeds per scenario.

**This file is generated.** Regenerate it with `npm run bench:repair`.

Scenarios are windows onto the real simulation at controlled kill rates, so a
healing faucet can be rejected before a 96-run survival benchmark is spent on it.
Snapshots are only comparable when generated on the same machine and Node build;
see the portability guardrail in `SURVIVAL_EXPERIMENTS.md`.

## Supply and flow

| Scenario | Kills/min | Ordinary | Premium | Kills per ordinary drop | Healing/active min |
| --- | ---: | ---: | ---: | ---: | ---: |
| `early-3min` | 119.7 | 5.6 | 0.0 | 40.4 | 19.3 |
| `mid-10min` | 225.0 | 10.8 | 0.0 | 41.9 | 37.1 |
| `late-20min` | 331.4 | 12.6 | 0.0 | 41.9 | 71.2 |
| `dense-late-26min` | 323.9 | 12.3 | 0.0 | 40.6 | 64.1 |

## Orb outcomes

| Scenario | Collected | Expired | Expired at full | Delivered | Overheal |
| --- | ---: | ---: | ---: | ---: | ---: |
| `early-3min` | 2.8 | 0.6 | 0.0 | 37 | 7 |
| `mid-10min` | 5.3 | 1.3 | 0.6 | 74 | 12 |
| `late-20min` | 7.6 | 0.9 | 0.1 | 114 | 8 |
| `dense-late-26min` | 6.3 | 0.5 | 0.0 | 98 | 3 |

## Availability and pressure

| Scenario | Mean active | Peak active | Mean nearest | Longest kill drought | Longest time drought | <75% | <50% | <25% | Deaths (no orb) |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| `early-3min` | 1.2 | 5 | 27.5 | 48 | 40.3s | 18s | 3s | 2s | 1 (0) |
| `mid-10min` | 2.6 | 7 | 18.7 | 50 | 21.2s | 17s | 8s | 5s | 0 (0) |
| `late-20min` | 2.6 | 8 | 20.1 | 50 | 23.3s | 25s | 6s | 3s | 5 (0) |
| `dense-late-26min` | 3.0 | 9 | 20.7 | 50 | 22.8s | 43s | 29s | 12s | 7 (0) |

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

Generated: 2026-08-13T12:35:15.603Z

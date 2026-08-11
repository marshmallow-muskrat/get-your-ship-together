# Repair Economy Benchmark

Balance version: `endless-2.7.0`
Experiment: `endless-2.8.0-accumulator-value16`
Policy: `competent`; 6 seeds per scenario.

**This file is generated.** Regenerate it with `npm run bench:repair`.

Scenarios are windows onto the real simulation at controlled kill rates, so a
healing faucet can be rejected before a 96-run survival benchmark is spent on it.
Snapshots are only comparable when generated on the same machine and Node build;
see the portability guardrail in `SURVIVAL_EXPERIMENTS.md`.

## Supply and flow

| Scenario | Kills/min | Ordinary | Premium | Kills per ordinary drop | Healing/active min |
| --- | ---: | ---: | ---: | ---: | ---: |
| `early-3min` | 132.4 | 4.0 | 0.0 | 47.0 | 32.0 |
| `mid-10min` | 264.6 | 11.2 | 0.0 | 42.8 | 57.2 |
| `late-20min` | 353.8 | 11.5 | 0.2 | 41.0 | 87.8 |
| `dense-late-26min` | 350.5 | 9.0 | 0.0 | 43.0 | 84.8 |

## Orb outcomes

| Scenario | Collected | Expired | Expired at full | Delivered | Overheal |
| --- | ---: | ---: | ---: | ---: | ---: |
| `early-3min` | 3.2 | 0.2 | 0.0 | 45 | 6 |
| `mid-10min` | 7.5 | 1.2 | 0.0 | 103 | 17 |
| `late-20min` | 8.0 | 0.0 | 0.0 | 117 | 18 |
| `dense-late-26min` | 6.3 | 0.0 | 0.0 | 94 | 8 |

## Availability and pressure

| Scenario | Mean active | Peak active | Mean nearest | Longest kill drought | Longest time drought | <75% | <50% | <25% | Deaths (no orb) |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| `early-3min` | 0.7 | 3 | 23.7 | 49 | 36.7s | 26s | 16s | 7s | 5 (0) |
| `mid-10min` | 2.2 | 6 | 22.0 | 50 | 16.3s | 40s | 15s | 3s | 3 (0) |
| `late-20min` | 1.9 | 7 | 16.8 | 49 | 23.2s | 24s | 10s | 4s | 5 (0) |
| `dense-late-26min` | 1.6 | 5 | 19.0 | 50 | 19.0s | 25s | 16s | 6s | 6 (0) |

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

Generated: 2026-08-11T15:59:28.129Z

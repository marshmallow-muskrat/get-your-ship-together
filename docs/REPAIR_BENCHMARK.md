# Repair Economy Benchmark

Balance version: `endless-2.7.0`
Experiment: `endless-2.7.0-repair-baseline`
Policy: `competent`; 6 seeds per scenario.

**This file is generated.** Regenerate it with `npm run bench:repair`.

Scenarios are windows onto the real simulation at controlled kill rates, so a
healing faucet can be rejected before a 96-run survival benchmark is spent on it.
Snapshots are only comparable when generated on the same machine and Node build;
see the portability guardrail in `SURVIVAL_EXPERIMENTS.md`.

## Supply and flow

| Scenario | Kills/min | Ordinary | Premium | Kills per ordinary drop | Healing/active min |
| --- | ---: | ---: | ---: | ---: | ---: |
| `early-3min` | 125.6 | 4.2 | 0.0 | 45.9 | 34.8 |
| `mid-10min` | 276.4 | 5.7 | 0.0 | 86.8 | 45.7 |
| `late-20min` | 361.3 | 9.5 | 0.0 | 53.7 | 62.5 |
| `dense-late-26min` | 346.3 | 7.7 | 0.0 | 50.3 | 74.2 |

## Orb outcomes

| Scenario | Collected | Expired | Expired at full | Delivered | Overheal |
| --- | ---: | ---: | ---: | ---: | ---: |
| `early-3min` | 3.2 | 0.7 | 0.2 | 53 | 17 |
| `mid-10min` | 4.7 | 0.2 | 0.0 | 81 | 21 |
| `late-20min` | 5.7 | 0.8 | 0.2 | 88 | 36 |
| `dense-late-26min` | 4.5 | 0.8 | 0.0 | 83 | 16 |

## Availability and pressure

| Scenario | Mean active | Peak active | Mean nearest | Longest kill drought | Longest time drought | <75% | <50% | <25% | Deaths (no orb) |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| `early-3min` | 0.4 | 4 | 21.3 | 119 | 50.9s | 23s | 16s | 6s | 5 (0) |
| `mid-10min` | 0.4 | 2 | 25.5 | 219 | 55.4s | 34s | 13s | 1s | 4 (0) |
| `late-20min` | 2.0 | 4 | 22.6 | 92 | 10.0s | 21s | 9s | 4s | 6 (0) |
| `dense-late-26min` | 2.2 | 4 | 19.7 | 230 | 29.2s | 15s | 7s | 3s | 6 (0) |

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

Generated: 2026-08-11T15:40:58.773Z

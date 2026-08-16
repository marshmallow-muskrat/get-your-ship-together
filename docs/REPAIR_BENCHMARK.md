# Repair Economy Benchmark

Balance version: `endless-2.11.0`
Experiment: `current`
Policy: `competent`; 8 seeds per scenario.

**This file is generated.** Regenerate it with `npm run bench:repair`.

Scenarios are windows onto the real simulation at controlled kill rates, so a
healing faucet can be rejected before a 96-run survival benchmark is spent on it.
Snapshots are only comparable when generated on the same machine and Node build;
see the portability guardrail in `SURVIVAL_EXPERIMENTS.md`.

## Supply and flow

| Scenario | Kills/min | Ordinary | Premium | Kills per ordinary drop | Healing/active min |
| --- | ---: | ---: | ---: | ---: | ---: |
| `early-3min` | 152.7 | 7.1 | 0.0 | 42.9 | 15.2 |
| `mid-10min` | 213.5 | 9.9 | 0.0 | 42.2 | 51.0 |
| `late-20min` | 292.5 | 11.1 | 0.0 | 42.9 | 90.1 |
| `dense-late-26min` | 279.9 | 8.8 | 0.0 | 42.1 | 109.6 |

## Orb outcomes

| Scenario | Collected | Expired | Expired at full | Delivered | Overheal |
| --- | ---: | ---: | ---: | ---: | ---: |
| `early-3min` | 2.1 | 1.3 | 0.4 | 30 | 8 |
| `mid-10min` | 4.6 | 1.3 | 0.3 | 99 | 19 |
| `late-20min` | 5.8 | 0.4 | 0.0 | 147 | 29 |
| `dense-late-26min` | 5.1 | 0.1 | 0.0 | 144 | 31 |

## Availability and pressure

| Scenario | Mean active | Peak active | Mean nearest | Longest kill drought | Longest time drought | <75% | <50% | <25% | Deaths (no orb) |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| `early-3min` | 2.0 | 6 | 18.9 | 50 | 27.2s | 8s | 2s | 1s | 0 (0) |
| `mid-10min` | 2.5 | 6 | 19.0 | 49 | 25.0s | 31s | 13s | 2s | 1 (0) |
| `late-20min` | 2.5 | 7 | 22.6 | 50 | 17.9s | 31s | 12s | 5s | 6 (0) |
| `dense-late-26min` | 1.8 | 6 | 21.4 | 50 | 18.8s | 22s | 12s | 7s | 7 (0) |

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

Generated: 2026-08-16T02:24:03.672Z

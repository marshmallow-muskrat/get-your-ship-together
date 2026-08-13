# Repair Economy Benchmark

Balance version: `endless-2.10.0-test-center`
Experiment: `cosmic-cleanup-post`
Policy: `competent`; 8 seeds per scenario.

**This file is generated.** Regenerate it with `npm run bench:repair`.

Scenarios are windows onto the real simulation at controlled kill rates, so a
healing faucet can be rejected before a 96-run survival benchmark is spent on it.
Snapshots are only comparable when generated on the same machine and Node build;
see the portability guardrail in `SURVIVAL_EXPERIMENTS.md`.

## Supply and flow

| Scenario | Kills/min | Ordinary | Premium | Kills per ordinary drop | Healing/active min |
| --- | ---: | ---: | ---: | ---: | ---: |
| `early-3min` | 153.1 | 7.1 | 0.0 | 43.0 | 17.5 |
| `mid-10min` | 214.4 | 9.9 | 0.0 | 42.3 | 50.1 |
| `late-20min` | 293.0 | 11.1 | 0.0 | 42.6 | 93.2 |
| `dense-late-26min` | 286.0 | 9.1 | 0.0 | 41.3 | 114.4 |

## Orb outcomes

| Scenario | Collected | Expired | Expired at full | Delivered | Overheal |
| --- | ---: | ---: | ---: | ---: | ---: |
| `early-3min` | 2.5 | 1.3 | 0.4 | 35 | 10 |
| `mid-10min` | 4.4 | 1.3 | 0.3 | 98 | 16 |
| `late-20min` | 5.9 | 0.4 | 0.0 | 151 | 29 |
| `dense-late-26min` | 5.3 | 0.0 | 0.0 | 151 | 29 |

## Availability and pressure

| Scenario | Mean active | Peak active | Mean nearest | Longest kill drought | Longest time drought | <75% | <50% | <25% | Deaths (no orb) |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| `early-3min` | 2.0 | 6 | 19.2 | 50 | 27.2s | 12s | 4s | 2s | 0 (0) |
| `mid-10min` | 2.5 | 6 | 18.9 | 49 | 25.0s | 33s | 13s | 2s | 1 (0) |
| `late-20min` | 2.4 | 7 | 22.5 | 50 | 17.9s | 30s | 11s | 5s | 6 (0) |
| `dense-late-26min` | 1.8 | 6 | 21.4 | 50 | 18.8s | 26s | 13s | 6s | 6 (0) |

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

Generated: 2026-08-13T18:26:08.026Z

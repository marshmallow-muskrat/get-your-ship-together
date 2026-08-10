# GYST Development Workflow

## Principle

Stable releases are immutable. Experiments are disposable. A successful experiment becomes the
next immutable release.

The published executable is a release artifact, not editable recovery source. Every published
build must retain the exact tagged source, balance version, generated benchmark, asset manifest,
tests, build instructions and changelog that produced it.

## Release loop

1. Tag and archive the approved production source and executable.
2. Create the internal Test Center from that exact source baseline.
3. Preserve a seeded simulation snapshot for the baseline.
4. Implement one bounded candidate change.
5. Run identical seeds and compare distributions and diagnostic metrics.
6. Playtest the candidate for readability, agency, satisfaction, fairness and fun.
7. Promote an accepted candidate into the next release, or discard its implementation completely.
8. Preserve a short failed-experiment record so the next specification does not repeat the cause.

The Test Center is not a second product and is not a public opt-in branch. It is the private,
replaceable working copy layered on the last immutable release. If an implementation is structurally
bad, discard it and restart from the release tag with a better specification.

## Simulation contract

`npm run bench:survival` runs the production fixed-step combat simulation without rendering. The
same seed index is applied to every hero. Policies have bounded reaction times and no access to
future RNG, attack outcomes or spawn schedules.

Every report includes mean, sample standard deviation, median, percentiles, confidence bounds,
censoring, elite pressure, boss progress, form uptime, Gunship output and death attribution.
Standard deviation alone is not sufficient because survival distributions are skewed.

Provisional founder target for Standard mode, pending human calibration:

| Measure | Target |
| --- | ---: |
| Competent-policy median | about 12 minutes |
| Standard deviation | about 3.5–4 minutes |
| Mean + 2σ upper tail | about 18–20 minutes |
| Mean + 3σ exceptional tail | about 22–24 minutes |

Novice, competent and expert policies must eventually demonstrate monotonic separation. Until their
outputs are calibrated against real playtests, they measure repeatable candidate deltas—not an
absolute prediction of human survival.

## Comparative Titan Protocol benchmark

The three Mega Protocols are mutually exclusive five-minute rewards, so the meaningful question is
relative player value, not identical damage. `survivorTitanBenchmark.ts` runs each protocol through
an identical scenario — same hero, authored build, elapsed time, seeded horde, movement path and
window — with the granted protocol as the only difference. It reports direct damage, boss damage,
protocol kills, total kills, elite/miniboss pressure, mean and peak living enemies, integrity lost
and survival time.

Two modes, because neither answers the whole question:

- `sustained` holds the player alive for the full five minutes, so throughput, clearing and control
  are measured over a complete window.
- `mortal` leaves the player fully damageable, so the signal is how long each protocol keeps them
  alive.

A protocol is judged on total player value across both, never on matching a damage number.

## Experiment discipline

- Change one balance mechanism at a time when practical.
- Run the same seeds before and after the change.
- Keep raw snapshots under `docs/generated/baselines/`.
- Attribute a distribution shift before acting on it. Run results carry per-source and per-form
  damage precisely so a change in the tail can be traced to a mechanic instead of guessed at, and
  a candidate that breaches a guardrail should be A/B'd one mechanism at a time before anything is
  retuned.
- Never widen an acceptance range merely to make a candidate pass.
- Never force a statistic toward target by changing unrelated systems.
- Simulation explains and protects a chosen feel; founders and playtesters choose that feel.
- Bug fixes and ordinary balance changes ship as base-game updates. Substantial maps or content may
  be tested through the same Test Center and later packaged separately.

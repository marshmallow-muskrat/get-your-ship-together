# Survival Experiment History

Every row is generated from a preserved seeded simulation snapshot. Failed
experiments remain here as evidence even when their implementation is discarded.

| Experiment | Policy | Runs | Median | SD | Mean + 2σ | Mean + 3σ | Elite peak | Mech uptime | Gunship kills/use |
| --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| known-bad-additive-elites | competent | 96 | 4:40 | 2:08 | 9:08 | 11:16 | 13.8 | 23.5% | — |
| elite-budget-candidate | competent | 96 | 7:03 | 3:27 | 14:45 | 18:12 | 2.3 | 25.7% | — |
| elite-budget-plus-mech-30-6 | competent | 96 | 6:26 | 2:47 | 12:18 | 15:05 | 2.2 | 15.7% | — |
| combined-elite-mech-gunship | competent | 96 | 6:26 | 2:45 | 12:08 | 14:53 | 2.1 | 15.7% | 25.4 |
| combined-novice | novice | 64 | 5:22 | 2:17 | 10:04 | 12:21 | 2.0 | 14.8% | 18.3 |
| combined-expert | expert | 64 | 6:29 | 3:22 | 13:41 | 17:02 | 2.4 | 16.7% | 25.4 |
| endless-2.4.0-combined-candidate | competent | 96 | 6:26 | 2:45 | 12:08 | 14:53 | 2.1 | 15.7% | 25.4 |
| endless-2.4.0-boss-backlog-correction | competent | 96 | 6:50 | 3:28 | 14:35 | 18:03 | 2.4 | 15.4% | 24.9 |
| endless-2.4.0-boss-and-horde-curve | competent | 96 | 8:22 | 4:56 | 19:20 | 24:16 | 2.9 | 15.5% | 27.6 |
| endless-2.5.0-full-balance-candidate | competent | 96 | 8:54 | 5:02 | 19:59 | 25:01 | 3.0 | 15.7% | 25.6 |
| endless-2.5.0-midgame-durability-candidate | competent | 96 | 10:25 | 6:08 | 23:08 | 29:16 | 3.1 | 15.4% | 26.4 |
| endless-2.6.1-hero-parity-final | competent | 96 | 10:18 | 4:29 | 18:40 | 23:10 | 2.8 | 16.4% | 26.4 |
| endless-2.7.0-cleanup-crew-release | competent | 96 | 10:42 | 5:29 | 22:36 | 28:05 | 3.7 | 16.9% | 24.7 |
| endless-2.7.0-platform-baseline | competent | 96 | 10:37 | 5:14 | 21:57 | 27:11 | 3.5 | 16.9% | 25.7 |
| endless-2.8.0-repair-economy | competent | 96 | 9:59 | 6:20 | 23:57 | 30:17 | 3.3 | 16.6% | 25.7 |
| endless-2.8.0-boss-fairness | competent | 96 | 14:38 | 6:48 | 27:04 | 33:53 | 3.9 | 17.1% | 25.9 |
| endless-2.8.0-combined-candidate | competent | 96 | 13:11 | 6:31 | 26:17 | 32:48 | 3.4 | 16.6% | 25.1 |

## Per-hero medians

| Experiment | Boswell | Fitzwilliam | Fortunato | Rutherford |
| --- | ---: | ---: | ---: | ---: |
| known-bad-additive-elites (competent) | 6:29 | 3:54 | 5:04 | 3:40 |
| elite-budget-candidate (competent) | 10:35 | 6:36 | 7:06 | 5:45 |
| elite-budget-plus-mech-30-6 (competent) | 6:57 | 5:19 | 6:35 | 5:59 |
| combined-elite-mech-gunship (competent) | 7:10 | 5:19 | 6:28 | 5:47 |
| combined-novice (novice) | 6:46 | 4:58 | 5:25 | 4:28 |
| combined-expert (expert) | 10:35 | 6:06 | 6:43 | 3:44 |
| endless-2.4.0-combined-candidate (competent) | 7:10 | 5:19 | 6:28 | 5:47 |
| endless-2.4.0-boss-backlog-correction (competent) | 10:29 | 6:02 | 6:30 | 5:33 |
| endless-2.4.0-boss-and-horde-curve (competent) | 10:55 | 6:26 | 6:35 | 9:42 |
| endless-2.5.0-full-balance-candidate (competent) | 11:01 | 7:10 | 7:28 | 8:20 |
| endless-2.5.0-midgame-durability-candidate (competent) | 16:14 | 6:25 | 6:51 | 7:15 |
| endless-2.6.1-hero-parity-final (competent) | 8:54 | 7:51 | 9:32 | 10:50 |
| endless-2.7.0-cleanup-crew-release (competent) | 11:12 | 10:41 | 12:49 | 9:28 |
| endless-2.7.0-platform-baseline (competent) | 10:56 | 10:53 | 10:44 | 8:48 |
| endless-2.8.0-repair-economy (competent) | 11:50 | 5:42 | 13:49 | 9:37 |
| endless-2.8.0-boss-fairness (competent) | 18:55 | 7:43 | 16:10 | 10:54 |
| endless-2.8.0-combined-candidate (competent) | 15:09 | 10:48 | 18:20 | 10:41 |

## Interpretation guardrail

- Candidate deltas are trustworthy only within the same policy and identical seed set.
- **Snapshots are only comparable when generated on the same machine and Node build.**
  The simulation is deterministic on a given platform — two 96-run benchmarks on one
  machine reproduce 96/96 identically — but it is not bit-portable across platforms.
  V8 transcendental results (sin/cos/exp/pow) are not guaranteed identical across
  builds, and a sub-ulp difference cascades once it flips a decision threshold.
  Re-running the 2.7.0 baseline on new hardware reproduced only 59 of 96 runs.
  Always regenerate the baseline locally before A/B testing a candidate against it;
  never diff a candidate against a snapshot inherited from another machine.
- A novice/competent/expert ordering that is not monotonic means those policies need
  further human calibration; it is not evidence that expert play is worse.
- Visual clarity, satisfaction, fairness and fun still require Test Center playtesting.

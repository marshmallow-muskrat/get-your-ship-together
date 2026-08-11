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

## Interpretation guardrail

- Candidate deltas are trustworthy only within the same policy and identical seed set.
- A novice/competent/expert ordering that is not monotonic means those policies need
  further human calibration; it is not evidence that expert play is worse.
- Visual clarity, satisfaction, fairness and fun still require Test Center playtesting.

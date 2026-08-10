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

## Interpretation guardrail

- Candidate deltas are trustworthy only within the same policy and identical seed set.
- A novice/competent/expert ordering that is not monotonic means those policies need
  further human calibration; it is not evidence that expert play is worse.
- Visual clarity, satisfaction, fairness and fun still require Test Center playtesting.

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
| endless-2.8.0-final | competent | 96 | 9:23 | 7:20 | 26:00 | 33:20 | 3.3 | 16.2% | 25.9 |
| endless-2.8.0-final-novice | novice | 64 | 4:56 | 4:34 | 15:34 | 20:09 | 2.3 | 13.0% | 18.0 |
| endless-2.8.0-final-expert | expert | 64 | 11:55 | 7:07 | 27:12 | 34:20 | 3.7 | 17.9% | 25.1 |

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
| endless-2.8.0-final (competent) | 12:05 | 4:48 | 9:33 | 12:45 |
| endless-2.8.0-final-novice (novice) | 4:51 | 4:19 | 5:55 | 3:40 |
| endless-2.8.0-final-expert (expert) | 19:51 | 4:59 | 13:12 | 11:19 |


## Measurement validity guardrail (endless-2.8.0 stabilization)

**A 96-run median cannot resolve a balance change from a resampling artifact.**

Adding Cosmic Boomerang to the shared weapon pool appeared to collapse the competent
median by 3:48 and to double sub-five-minute deaths. A controlled decomposition showed
this was not a balance regression:

| Candidate | P25 | Median | <5m deaths |
| --- | ---: | ---: | ---: |
| Phase 7 (`2208b3b`) | 7:57 | 13:11 | 16 |
| Boomerang implemented, **not offered** | 7:57 | 13:11 | 16 |
| Boomerang offered, **policy forbidden from taking it** | 4:41 | 9:46 | 28 |
| Full Phase 8 (`088d1a0`) | 4:31 | 9:23 | 31 |

The "not offered" variant reproduces Phase 7 exactly. The "never picked" variant collapses
almost as hard as the full candidate *while never once selecting the weapon*. The cause was
therefore neither the weapon's balance nor its selection: enlarging the offer pool consumed
extra draws from the shared random stream and re-rolled every subsequent build.

The world and upgrade-offer streams are now separate, so content additions can no longer
displace spawns, boss rolls or drops. That is necessary but not sufficient — adding an
offerable item still changes the offer *sequence*, which is inherent. Sample size is what
closes the remaining gap:

| Runs | Without Boomerang | With Boomerang | Apparent effect |
| ---: | ---: | ---: | ---: |
| 96 | 12:34 | 8:43 | 3:51 |
| 192 | 11:26 | 10:55 | 0:31 |

The same unchanged configuration moved 12:34 to 11:26 between the two sample sizes. Treat
any 96-run median delta under roughly two minutes as noise, and confirm with 192 runs before
attributing it to a change. Earlier endless-2.8.0 attributions taken at 96 runs — including
the Phase 3 median movement — should be re-measured before being relied upon.


## 192-run re-baseline: what actually regressed (endless-2.8.0 stabilization)

The release's headline claims were all median movements measured at 96 runs. Re-measured
at 192 runs on identical seeds, **none of them survive**:

| Candidate | n | Median | Bootstrap 95% CI | vs 2.7.0 |
| --- | ---: | ---: | --- | --- |
| `endless-2.7.0` (`56b5414`) | 192 | 10:41 | 10:26 – 11:04 | — |
| Phase 7 (`2208b3b`) | 192 | 12:46 | 10:57 – 14:44 | +2:05, CIs overlap |
| Final (`088d1a0`) | 192 | 9:08 | 6:55 – 11:05 | −1:33, CIs overlap |

The median is the wrong instrument here, and the CI widths say why. endless-2.7.0's median
is stable to within 38 seconds; the 2.8.0 candidates carry intervals nearly four minutes
wide. That is not sampling noise — it is the distribution becoming **bimodal**, with the
median falling into a sparse middle between an early-death cluster and a long-run cluster.
Neither SD nor median describes a distribution shaped like that.

**The early-death cluster is the real regression, and it is unambiguous.**

| Candidate | Runs under 5:00 | bee | flamingo | frog | red-panda |
| --- | ---: | ---: | ---: | ---: | ---: |
| `endless-2.7.0` | 20/192 (10.4%) | 8% | 17% | 4% | 13% |
| Phase 7 | 32/192 (16.7%) | 8% | 27% | 8% | 23% |
| Final | 53/192 (27.6%) | 17% | 46% | 15% | 33% |

2.7.0 to final is a 17.2-point rise, **4.4 standard errors** — far outside sampling noise,
and it grows monotonically across the release rather than appearing at one commit. Every
hero worsens, and Fitzwilliam (`flamingo`) now fails before five minutes in nearly half of
all runs.

### How to read this benchmark from now on

- **Primary diagnostics:** fraction of runs under 5:00, P25, per-hero medians, observed
  maximum. These are stable and they move together.
- **Median:** report it, but treat a difference as real only when the bootstrap intervals
  are disjoint. Two halves of one 192-run snapshot of *identical code* drift up to 1:12.
- **SD and mean+3σ:** retained for historical continuity only. `mean + 3σ` of 33:20 was
  never an observed survival time; the observed maximum across every 192-run candidate is
  about 26:20.


## Five-minute bisect: two causes, each about ten points (endless-2.8.0 stabilization)

Paired analysis on matched hero/seed pairs, 384 runs per step at a five-minute censor.
The endpoint is binary, so every comparison is McNemar's exact test on discordant pairs
with a paired risk difference. Comparing two independent confidence intervals — which an
earlier revision of this document did — is not a test and understates real effects.

| Step | under 5:00 | Wilson 95% | vs previous | vs 2.7.0 |
| --- | ---: | --- | --- | --- |
| `endless-2.7.0` | 9.1% | 6.6–12.4% | — | — |
| Phase 2 repair economy | **19.8%** | 16.1–24.1% | **+10.7, p=5.7e-6** | +10.7 |
| Phase 3-4 boss fairness | 20.1% | 16.4–24.3% | +0.3, p=1.00 | +10.9 |
| Phase 5 UI scale | 20.1% | 16.4–24.3% | +0.0, p=1.00 | +10.9 |
| Phase 7 ship | 19.3% | 15.6–23.5% | −0.8, p=0.85 | +10.2 |
| Phase 6 ally AI | 19.3% | 15.6–23.5% | +0.0, p=1.00 | +10.2 |
| Boomerang present, not offered | 19.3% | 15.6–23.5% | +0.0, p=1.00 | +10.2 |
| Phase 8 final | **29.7%** | 25.3–34.4% | **+10.4, p<0.001** | +20.6, p=5.1e-14 |
| Stabilization (streams split) | 28.4% | 24.1–33.1% | −1.3, p=0.73 | +19.3 |

Two causes, each roughly ten points, and every other phase contributes exactly nothing.
Presentation-only changes reproduce identical simulation results, as they must.

### Cause 1: the kill-driven repair economy has no bad-luck protection

| Step | bee | flamingo | frog | red-panda |
| --- | ---: | ---: | ---: | ---: |
| `endless-2.7.0` | 4.2% | 17.7% | 3.1% | 11.5% |
| Phase 2 repair economy | 6.3% | **45.8%** | 7.3% | 19.8% |
| Phase 8 final | 16.7% | **51.0%** | 14.6% | 36.5% |

Fitzwilliam's early-death rate nearly tripled at the repair commit, before any other
2.8.0 change existed. The obvious explanation is wrong: measured kill rates are
146 k/min for Fitzwilliam against 153 for Boswell and 162 for Rutherford, so he is not
meaningfully slower at generating kill credit.

The real asymmetry is structural. endless-2.7.0 guaranteed an injured player an orb
within 18 seconds, tightening to 12 below 45% integrity. The live `accumulator` model has
**no guarantee of any kind** — `guaranteeAt` exists only in the unused `probability`
model. Credit accrues solely from kills, so supply stops exactly when a player is in
trouble and kiting instead of killing, and nothing bounds the resulting drought.

### Cause 2: offer dilution, not the weapon

Making Cosmic Boomerang offerable costs ten points whether or not it is ever selected: a
variant that offered it while forbidding the policy from taking it collapsed just as far,
and a variant that implemented it without offering it reproduced the previous step
exactly. Separating the world and offer random streams did not remove the effect either
(−1.3 points, p=0.73), so this is not stream displacement.

Adding an eleventh shared weapon dilutes a three-card offer. Every slot spent on a new
option is a slot not offering a strong early pick, and the first five minutes is where
build quality is least forgiving. This is selection opportunity cost, and it is a
property of pool size rather than of the weapon.

### Corrections to earlier entries in this document

The previous revision concluded that the median movements were noise because independent
confidence intervals overlapped. That test was wrong. Paired analysis shows the Phase 7
mean improvement is significant (+1:13, 95% CI 0:02–2:20); the median movements remain
non-significant, but by the correct test. The early-death finding stands and is far
stronger than first reported.

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

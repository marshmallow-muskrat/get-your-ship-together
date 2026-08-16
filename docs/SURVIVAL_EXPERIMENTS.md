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
| game-polish-followup-baseline | competent | 24 | 10:18 | 5:35 | 21:28 | 27:03 | 3.4 | 16.9% | — |
| game-polish-followup-candidate | competent | 24 | 6:19 | 8:46 | 29:00 | 37:46 | 3.3 | 16.5% | — |
| cosmic-cleanup-baseline | competent | 24 | 6:19 | 8:46 | 29:00 | 37:46 | 3.3 | 16.5% | — |
| cosmic-cleanup-post | competent | 24 | 12:25 | 6:11 | 26:14 | 32:25 | 3.1 | 17.3% | — |
| endless-2.11.0-cadence-baseline | competent | 24 | 12:42 | 6:32 | 27:04 | 33:36 | 3.3 | 17.3% | — |

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
| game-polish-followup-baseline (competent) | 8:20 | 15:13 | 7:21 | 10:22 |
| game-polish-followup-candidate (competent) | 6:19 | 13:38 | 9:23 | 5:14 |
| cosmic-cleanup-baseline (competent) | 6:19 | 13:38 | 9:23 | 5:14 |
| cosmic-cleanup-post (competent) | 14:15 | 12:16 | 11:25 | 11:49 |
| endless-2.11.0-cadence-baseline (competent) | 13:46 | 12:33 | 11:39 | 13:16 |

## Cosmic Cleanup playtest pass — matched A/B

`cosmic-cleanup-baseline` and `cosmic-cleanup-post` use the same competent policy,
six seeds per hero, 30-minute censor, machine and Node build. The baseline was captured
before changing production values; the candidate reran those exact seeds afterward.

- Overall median moved **6:19 → 12:25**, within 25 seconds of the provisional 12:00
  competent target. Mean moved 11:28 → 13:51.
- Standard deviation narrowed **8:46 → 6:11** and mean + 2σ narrowed 29:00 → 26:14.
  The distribution is still wider than the provisional target, but improved materially;
  a 24-run instrument is not grounds for another blind production change after the
  requested playtest corrections.
- Plasma Wake fell from **23.9% → 9.4%** of recorded output (−14.5 percentage points)
  after the universal 0.50x monster multiplier and overlap refresh. It no longer stands
  out as the dominant damage source.
- The four new automatic Mech specials account for **3.5%** of total output. They add
  identity and useful burst/control without replacing the shared weapon build.
- Permanent, stackable Mega armaments rose from **11.3% → 19.5%** of output, as expected
  from accumulating multiple rewards. Their individual output is re-based to 60% of the
  former timed versions, and the 30-minute censor produced no immortal run.
- Ordinary repair tap width remains stable: **40.4–41.9 → 41.3–43.0 kills per drop**.
  Percentage healing raises late delivered healing as intended (max-integrity builds no
  longer make an orb negligible), while the dense-late scenario still records 6 deaths
  in 8 seeds and only 1.8 mean active orbs. No supply faucet appeared.
- The boss damage hierarchy and committed-traversal census are unchanged: body remains
  1.20x the reference ranged hit, charge 1.467x, and every committed traversal bills one
  primary impact. Faster boss movement did not alter damage law or double-hit behavior.

Conclusion: the candidate fixes the two obvious outliers from the human run—Plasma Wake
share and weak fixed-value repairs—while landing the simulated median near target. Keep
the remaining distribution width and permanent-Mega contribution under Test Center
observation; do not tune them further until another real run supplies calibration.

## endless-2.11.0 cadence experiment — discarded

`endless-2.11.0-cadence-baseline` is a local 24-run competent snapshot (six seeds per
hero, 30-minute censor) taken on this machine before any production combat change.
It is not comparable to inherited `cosmic-cleanup-post` numbers.

Local baseline: median **12:42**, SD **6:32**, mean+2σ **27:04**. Deaths:

| Hero | Median | Horde-contact deaths |
| --- | ---: | ---: |
| Boswell | 13:46 | 1/6 |
| Fitzwilliam | 12:33 | 5/6 |
| Fortunato | 11:39 | 2/6 |
| Rutherford | 13:16 | 3/6 |

The split is real on this machine: high-cadence heroes die to boss mechanics,
Fitzwilliam still dies to the horde touching him.

A `surrounded` weapon-benchmark scenario (closing ring, no kite, 17% starter weight)
was added as the missing instrument. At L1 it scores Rail 1600, Microdrone 2142,
Rocket 3266, Bio-Plasma 3273 — Rail is the weakest starter when every bearing is
occupied, which is the opposite of the old mix.

Two coverage candidates were implemented and discarded. Neither was promoted:

1. **Cadence at constant authored DPS** (Rail/Rocket L1 1.885s/1.65s → 0.84s, 0.90s,
   or 1.20s, damage scaled with interval). Rail intended L5/L1 fell to 2.70–2.94
   against the 3.0 floor. Rocket's L5 gain rose to 61–68% against the 52% breakpoint
   ceiling. Kite-phase sampling is cadence-sensitive; same DPS is not the same curve.
2. **Keep-away on the volley**, including a contact-only variant (force 1.1, range 1.7).
   Rail L3 gain hit 42.5% (typical cap 40%). Rocket L5/L1 fell to 2.84.

Widening those bands is forbidden. Production damage, cadence, geometry and knockback
stay at the 2.10 tables. BAL-002 (SD 6:32 vs 3:30–4:00) is still open; do not chase
it by retuning unrelated systems.

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

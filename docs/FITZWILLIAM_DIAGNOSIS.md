# Fitzwilliam Early-Death Diagnosis (endless-2.8.0 stabilization)

Hand-maintained experiment ledger. `SURVIVAL_EXPERIMENTS.md` is generated from
full-run snapshots and must not be edited by hand; these runs are a different
shape — one hero, a five-minute horizon, matched seeds — so they live here.

## The question

At `b03350e` three of four heroes returned to roughly their endless-2.7.0
early-death rate and Fitzwilliam did not. A survival time cannot say why, so
this pass built an instrument that separates the three candidate explanations
before changing any balance value:

- **policy failure** — breadth was offered and the simulated player declined it
- **targeting failure** — the line fired is materially worse than the line available
- **geometry failure** — no single line answers the surround, whatever is chosen

## Method

`SurvivorDiagnostics` is an optional recorder attached to a state by the harness
that asks for it and absent from every shipping path. It only reads, so a
diagnosed run is bit-identical to an undiagnosed one — confirmed here, since
`a023dec` (instrument added) and `b03350e` (no instrument) both produce exactly
242/384 under five minutes on the same seeds.

Runner: `npx vite-node scripts/railDiagnostic.ts`.

- **Hero** Fitzwilliam (`flamingo`), except where a control names another hero.
- **Policy** `competent`.
- **Horizon** five minutes. The endpoint is binary: died before 5:00.
- **Exploratory seed set** `hero-major-1`, base `0x51a700`, 384 seeds, stride 7919.
- **Statistics** every candidate runs the identical seeds, so each comparison is
  McNemar exact on discordant pairs with a paired risk difference and a
  bootstrap CI on the pairs. Marginal Wilson intervals are printed for
  description only and are never used as the test.

**Confirmation seeds have not yet been run.** Every number below is exploratory
and is not a shipping decision on its own.

## Ground truth

endless-2.7.0 on this seed set is **24.5%** (94/384), not the 17.7% quoted
earlier — that figure came from the 96-seed subset used by the four-hero suite.
The current branch is **63.0%**, a paired risk difference of **+38.5 points**
(95% CI [32.0, 45.1], McNemar exact p=7.3e-25).

## Where the 38.5 points came from

Flamingo-only, 384 matched seeds, shipping policy throughout.

| Commit | Work | under-5:00 | vs 2.7.0 | Step |
| --- | --- | ---: | ---: | ---: |
| `56b5414` | endless-2.7.0 | 24.5% | — | — |
| `41fd860` | Phase 2 kill-driven repair economy | 35.7% | +11.2 | **+11.2** |
| `21ebdc0` | Phase 2 orb-value tune | 40.1% | +15.6 | +4.4 |
| `540d85d` | Phases 3–4 | 40.6% | +16.1 | +0.5 |
| `2208b3b` | Phase 7 | 41.9% | +17.4 | +1.3 |
| `77beb86` | Phase 5 | 41.9% | +17.4 | 0.0 |
| `cdf5a19` | Phase 6 | 41.9% | +17.4 | 0.0 |
| `088d1a0` | Phase 8, Cosmic Boomerang | 47.9% | +23.4 | **+6.0** |
| `b03350e` | stream split + offer-category repair | 63.0% | +38.5 | **+15.1** |

Three steps carry the whole regression; five carry none.

**The last step is not a paired comparison.** `85ae674` separated the world and
offer random streams, so after it a given seed generates a different world. The
+15.1 is a difference of marginal rates whose Wilson intervals do not overlap
([43.0, 52.9] against [58.1, 67.7]); it is not a matched risk difference and
must not be read as one. It agrees in sign and rough size with the four-hero
measurement, where the early-offer invariant moved Fitzwilliam from 47.9% to
54.2% while moving the other three heroes toward baseline.

The finding that the invariant helps three heroes and hurts the fourth is not a
contradiction, and the reason is the next section.

## Candidate matrix

Each row is 384 matched seeds against the row named in "vs".

| # | Candidate | under-5:00 | vs | Δ pts | McNemar p |
| --- | --- | ---: | --- | ---: | ---: |
| A | current shipping build | 63.0% | 2.7.0 | +38.5 | 7.3e-25 |
| B | coverage-aware benchmark policy | **45.6%** | A | **−17.4** | **7.0e-7** |
| C | forced early acquisition (upper bound) | 41.4% | A | −21.6 | 4.4e-9 |
| D | exhaustive 180-bearing rail aiming | 55.2% | A | −7.8 | 0.0054 |
| D2 | bounded 36-spoke sweep added to the existing candidates | 51.6% | A | −11.5 | 0.0002 |
| E | boss bearing scored instead of forced | 61.2% | A | −1.8 | 0.45 |
| F | radial starter substituted for Rail Lance | 93.5% | A | +30.5 | 3.9e-24 |
| BD | B combined with D | 44.0% | B | −1.6 | 0.64 |
| G1 | rail width ×1.35, on B | 43.2% | B | −2.3 | 0.45 |
| G2 | rail width ×1.70, on B | 32.6% | B | −13.0 | 8.3e-6 |
| G3 | rail cadence ×0.85, on B | 33.9% | B | −11.7 | 7.0e-5 |

## Inferences

**The benchmark policy is the largest single cause, and it is an instrument
defect rather than a game defect.** `upgradeScore` values an authored upgrade to
an equipped weapon at 132, or 144 at level 1, against 116 for acquiring an
ordinary weapon while holding fewer than three. Competent noise is ±18, so a
28-point gap is decided before the dice are thrown: the measured selection-1
composition is 364 progression, 14 passive, 6 acquisition out of 384, and an
acquisition card was on the table 155 times and taken **six**. Valuing breadth
when the build is narrow (B) recovers 17.4 of the 21.6 points that forcing it
outright (C) can possibly recover.

**The early-offer invariant did not create this; it exposed it.** The invariant
guarantees a progression card early, which is right for a build that gains from
depth and wrong for one that needs a second approach angle. Three heroes gained
and Fitzwilliam lost, because only his opening weapon answers one bearing at a
time. The invariant is doing what it was designed to do — the defect is a
policy that then takes the guaranteed card 94.8% of the time.

**Targeting is not the failure.** The shipping nearest-24 search captures 86.5%
of the value a 180-bearing sweep can find (chosen 3.069 against sweep-best 3.536
per shot). The unconditional boss override fires on **2.0%** of shots and costs
0.86 score on those, about 0.5% of all line value; removing it is null
(−1.8 points, p=0.45). Improving the search helps only while the build is narrow
— worth −11.5 points on its own, and **−1.6 points, p=0.64, once the policy is
competent**. Targeting quality and portfolio breadth are substitutes, and
breadth dominates.

D2 beats D despite searching far fewer bearings, because it *adds* spokes to the
body-directed candidates instead of replacing them: a line exactly through a
body is often the best line, and a fixed spoke grid can miss it.

**Damage per hit is not deficient — it is grossly excessive.** 60.7% of all Rail
Lance damage is overkill. Rail L1 deals 100 to early enemies worth a fraction of
that. A flat damage buff would enlarge the waste and not the coverage, and there
is now direct measurement saying so.

**Geometry is a real lever but a contract-bound one.** Width ×1.70 buys 13
points. It also takes Rail Lance to 1.27× the starter weighted-output mean
against a ±15% band, and drops its L5/L1 progression to 2.91 against a floor of
3.0. Both are contract violations and neither band may be widened to admit it.
Width ×1.35, which stays inside the contract, buys nothing measurable (−2.3,
p=0.45). Cadence ×0.85 buys 11.7 points but is a general output increase with no
independent justification, and the overkill measurement argues against it.

**Control F is confounded and establishes less than it appears to.** Gravity
Pulse is a low-output control weapon, so substituting it changed the starter's
role as well as its geometry. The 93.5% says a naive weapon swap is not a fix;
it does not isolate geometry, and no geometry conclusion is drawn from it.

**The policy bias is universal but only Fitzwilliam pays for it.** Bee's
selection-1 composition is 369 progression out of 384 — the same bias — at a
4.4% early-death rate. Bee's mean angular enclosure is 19% against Fitzwilliam's
31%, and mean enemies within 10 units 1.6 against 3.4: a seeking weapon thins
the approach before a surround forms, so depth is the right choice for it. The
failure is the interaction of a depth-biased policy with a bearing-limited
weapon, not either alone.

## Decisions

- **Ship nothing to balance yet.** No damage, width, cadence, offer or repair
  value is changed by this pass.
- **The coverage-aware policy is the correct fix** and is implemented, defaulted
  off, behind `PolicyExperiments.coverageAware`. Making it the default competent
  behaviour changes the measuring instrument and invalidates every documented
  baseline, so it needs a `POLICY_VERSION` bump and a full four-hero re-baseline
  before it lands. That is the next step, not this one.
- **Do not ship a targeting change on a null result.** D2 is a genuine repair to
  a search that does not achieve its own documented intent, and it is worth 11.5
  points to a player who builds depth. It is worth nothing to one who builds
  breadth. It is recorded here rather than shipped because a change that is null
  under the corrected instrument has not earned its cost.
- **Phase 2's repair economy remains the largest single game-side regression for
  this hero at +11.2 points**, and remains open, as it has been since Phase 2.
- Rail Lance's linear piercing identity is preserved. Nothing here proposes
  changing it.

## Still open

- Confirmation seed set, disjoint from `hero-major-1`, for whichever candidate
  is chosen.
- Four-hero, multi-policy re-baseline under the corrected policy, including
  novice/competent/expert monotonicity.
- Whether the early-offer invariant should be coverage-aware itself — offering a
  progression card *or* a complementary acquisition, rather than progression
  only. That is a shipping-offer change and needs its own controlled experiment.
- The residual gap. B leaves Fitzwilliam at 45.6% against 24.5% at 2.7.0, and
  the levers that close it all violate a contract or lack independent
  justification. Closing it honestly may require the Phase 2 repair economy to
  be resolved first.

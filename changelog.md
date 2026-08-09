# Changelog

This file records the notable development history of **Get Your Ship Together** (GYST).

The project changed direction several times before Containment Protocol became the game. Those abandoned experiments are retained here because they explain the origin of the current hero-selection screen, art direction, assets, and gameplay systems.

The version names below are retrospective product milestones unless a balance version is explicitly named. Git history remains the source of truth for exact implementation details.

## [Unreleased]

### Remaining follow-up

- Bundle code splitting (main chunk is ~830 kB before gzip).

## [2.3.0] — 2026-08-09 — Readable pressure, fixed-cooldown Mech, upgrade clarity

Balance line: `endless-2.3.0`. New leaderboard partition; `endless-2.2.1` and older records are
retained in storage but the board defaults to the current partition only. No scores are deleted.

This release attacks the reasons runs *felt* unfair rather than the reasons they were hard:
raw speed as the universal killer, an invisible pressure director, upgrade cards that did not
explain themselves, a Mech that was always available, bosses that died in seconds, and a healing
faucet that erased every mistake.

### 1. Raw speed is no longer why runs end

- **Root cause:** the global speed multiplier reached `1.24×` at fifteen minutes. Combined with
  opening base speeds of 3.3–4.35 against a player speed of 6.4, the horde closed the kiting gap
  long before durability or density were the real threat, so every death read as "I could not
  outrun them" instead of "I was overwhelmed".
- Opening base speeds are lowered to the published table (basic 3.0, mush 2.8, fast 3.7,
  spiky 3.8, flyer 3.5, bee 3.6, ghost 3.55, bruiser 2.6, elite 3.3, miniboss 2.8). Player
  speed remains 6.4.
- The curve is now a piecewise-linear anchor table: `1.00×` @0m, `1.03×` @10m, `1.06×` @20m,
  `1.10×` @30m, `1.16×` @40m, `1.20×` @45m, `1.24×` @50m, `1.32×` @60m, hard-capped at `1.70×`.
  `1.24×` moved from fifteen minutes to fifty. Fifteen minutes is now `1.045×`.
- Containment Collapse deliberately contributes **nothing** to speed, so every published anchor
  is exact at any survival time and the tests assert the table directly.

### 2. Population, spawn rate and elite frequency retuned

- The old curve reached the 160 cap, ~8 spawns/sec and ~31% elites by fifteen minutes.
- New anchors — population 26/60/92/118/140/160 and spawn rate 2.1/3.2/4.5/5.75/7.0/8.0 at
  0/5/10/15/20/25 minutes; elite chance 3%/7%/12%/16%/20%/25% over the same span, continuing to
  climb afterwards with Collapse layering on top.
- The 160 enemy cap is unchanged. Difficulty past 25 minutes comes from durability, contact
  damage, specialist mix, boss backlog and Collapse — not from a lower cap or from raw speed.
- Every specialist gate is preserved (fodder 0s, fast 30s, spiky/flankers 60s, bruisers/elites
  90s, hunters 120s, at most one specialist alive before 60s).

### 3. The pressure director now creates real events

- **Root cause:** a 1.1-second telegraph and a 52-second cadence, layered on constantly-maximal
  pressure, meant a surge was statistically indistinguishable from the background horde.
- Cadence is 60–75s with deterministic seeded variation; telegraph 3.5s; surge 10s; recovery 13.5s.
- Surges never stack, and an ordinary surge never begins while a boss is alive. A boss arriving
  ends any running surge cleanly into recovery **without delaying the exact boss schedule** —
  which also stops Mega-Bosses from inheriting a director surge they were never authored for.
- Pincer now genuinely uses opposite edges (the previous `+2` wrap produced a perpendicular
  edge); encircle distributes across all four; single-edge surges commit to their announced edge
  so the arrows cannot lie.
- Compositions are materially different per kind — sprinter, bruiser, elite, geometry and flood
  waves each have their own bias, all still filtered through the specialist gates.
- A surge grants **its own spawned wave** +22% movement speed. This rides on the individual
  enemies the surge produced; the standing horde never inherits it, and it disappears with them.
- Recovery is a real lull: replacements are withheld until population drains toward a recovery
  target, then trickle back. Living enemies are never despawned to manufacture it.
- Presentation: a prominent `SURGE INCOMING` banner, directional arrows on the exact edges in
  play, illuminated spawn edges for the whole telegraph, and a compact HUD chip reading
  `NORMAL` / `INCOMING` / `SURGE` / `RECOVERY`. No audio.

### 4. Crowd movement and the accidental quadratic

- **Root cause (performance):** the spatial hash stored entity ids, and every "bounded"
  neighbourhood query then resolved each neighbour with a linear scan over `state.enemies`. At the
  160 cap that is the O(enemy-count²) inner search the architecture guardrails forbid. The hash
  now stores **array indices**, making resolution O(1).
- Separation strengthened to full radii plus margin, so enemies occupy space instead of sharing a
  position.
- Exact and near-exact overlaps resolve along a direction derived deterministically from the pair's
  ids — random jitter would both shimmer and break seeded determinism.
- Enemies wedged behind a congested front rank now lose forward drive and steer laterally around
  it, which keeps navigable gaps open without turning the horde into a harmless formation.
- One neighbour pass per enemy per frame, into a reused scratch object — no per-frame allocation.

### 5. Individual hits matter; swarms no longer delete you

- Opening contact damage raised to basic/mush 10, fast 12, spiky 13, flyer 12, bee 11, ghost 14,
  bruiser 20, elite 24, miniboss 28.
- The steep early multiplier is replaced by a flat anchor curve: `1.00×` @0m, `1.25×` @10m,
  `1.55×` @20m, `1.90×` @30m, `2.50×` @45m, continuing on the same slope afterwards.
- The post-hit invulnerability window is preserved, so simultaneous overlaps cannot chain-delete
  the player.
- Feedback scales with the bite the hit took out of the hull: a stronger, brief red screen-edge
  vignette (capped so the arena stays readable) and a camera impulse reserved for elite, miniboss
  and boss physical hits.

### 6. The repair faucet is bounded

- **Root cause:** a flat 4% drop chance per kill is a faucet whose flow rate is the player's kill
  rate. At late kill rates that produced an orb every few seconds and erased every chip mistake.
- Ordinary repair drops are now paced by wall-clock since the last orb (12s minimum, ~15s typical,
  18s pity), require the player to actually be missing integrity, and are never a pure per-kill roll.
- An injured player who is unlucky — or simply not killing anything, which is when they most need
  repair — is guaranteed an orb by the pity interval, which tightens toward the minimum below 45%
  integrity.
- Miniboss (45) and boss (55, +30 Mega) repair rewards remain guaranteed and larger, and are
  independent of the ordinary budget.
- Every collected orb heals exactly once.

### 7. Nanite Bleed is real sustain

- **Root cause:** two disagreeing definitions. `SURVIVOR.regenPerLevel = 0.45` was dead code, and
  the live formula was a flat `0.22 HP/s` per level — worthless on a plated hull.
- Regeneration is now a percentage of maximum integrity: **0.4%/s per level** through L5
  (L1 0.4%, L3 1.2%, L5 2.0%), then `2.0% + 0.12%·√(level−5)`. One authoritative implementation;
  the dead constant is gone.
- It resumes after **two** seconds without damage (was three).
- It also increases repair-orb healing by 10% per level through L5, with strong diminishing
  returns afterwards so endless levels cannot rebuild the faucet.

### 8. Underwhelming passives

- **Thruster Boost:** 6%/level, five levels, hard cap +30%.
- **Magnet Field:** energy reach +0.55/level, repair reach +1.0/level, and pickups travel faster as
  it levels. Ship and Mech form scaling is preserved and stated on the card.
- Hard safety caps retained for cooldown, area, movement speed, projectile count and damage
  reduction.

### 9. Mech Overdrive is a fixed-cooldown ultimate

- **Root cause:** the meter filled from kills (1.2%/kill, 8%/elite, 35%/miniboss, 25%/boss, plus
  Core Siphon). At the kill rates this game reaches, that is near-permanent uptime. The defect was
  **availability, not power**.
- New model: **14s duration, 45s activation-to-activation cooldown**, set on activation and counted
  down *while Mech is active* — so a transformation costs ~31s of astronaut/ship time.
- The run begins with Mech unavailable; first readiness is one full cooldown in.
- Kills, elites, minibosses and bosses no longer fill or reduce the cooldown by any path. The
  `mechCharge` field is removed outright.
- `Core Siphon` is replaced by **Core Cycling**: 3% shorter cooldown per level, five levels, hard
  cap 15%. **Reactor Hold** is 5% duration per level, five levels, hard cap 25%.
- Fully invested maximum uptime is **45.8%** (17.5s of 38.25s) — powerful, never permanent.
- The HUD meter is readiness, not kill charge; the large `MECH READY` presentation and glow are
  preserved.
- Mech remains powerful without multiplying every weapon's projectile count. It uses `1.35×`
  weapon damage, `1.15×` cadence and `1.15×` area; damage taken remains `0.65×`. This preserves
  the ultimate fantasy while preventing a single 14s activation from trivially erasing bosses.

### 10. Elites

- Effective health raised to **10.0×** a same-time fodder enemy (design band 8–12×), expressed
  entirely in the content table — the hidden `1.8×` multiplier that used to be applied at spawn is
  gone, so the published ratio is readable from the data.
- Lunge windup lengthened to 0.55s with a pronounced, avoidable footprint and a charging shell, so
  an elite normally lands at least one telegraphed mechanic unless deliberately answered.
- Elite lunge impact is 1.6× its contact damage; knockback resistance is meaningful but never total.
- Premium energy rewards preserved.
- Frequency follows the revised elite curve, and the forced-elite floor was raised from 8s to a
  14s+ event cadence.
- Elites now carry an animated gold energy shell and compact world-space health bars. Bars are
  limited to the four nearest relevant elites within 16 units so late hordes remain readable.

### 11. Boss durability and phase transitions

- **Root cause (durability):** 2,200 base health meant the first boss could die in about two
  seconds and was irrelevant.
- First-boss base health is **4,700**, chosen against a deterministic boss benchmark
  (`bossTimeToKill`) rather than asserted. Later growth uses authored anchors rather than one
  quadratic that cannot satisfy both early and late targets: `1.0×` boss 1, `2.5×` boss 3,
  `4.1×` boss 5, `6.5×` boss 10, `9.2×` boss 15 and `12.5×` boss 20, then accelerates so endless
  Overclocks cannot win forever. Mega health remains `1.6×` its regular index.
- Measured time-to-kill against representative moving builds:

  | Boss | HP | Astronaut | Mech | Target |
  |---|---:|---:|---:|---|
  | 1 (appropriate build) | 4,700 | 24.8s | 13.0s | 18–25s / 10–15s |
  | 1 (balanced build) | 4,700 | 36.8s | 22.8s | slower build, allowed |
  | 3 | 11,750 | 27.2s | 9.0s | 25–40s astronaut |
  | 5 (Mega) | 30,832 | 62.0s | 28.7s | 45–75s astronaut |
  | 10 (Mega) | 48,880 | 71.7s | 28.8s | 45–75s astronaut |

- **Root cause (phase transitions):** crossing 66%/33% dropped the boss straight into `recover`.
  High single-hit damage therefore cancelled live attacks, and enough DPS could stun-lock the boss
  out of ever landing a mechanic — being strong made the fight *safer*.
- Transitions are now deferred. The current attack always runs to completion; the transition is
  consumed when the attack ends and plays as a telegraphed, **damaging** phase surge followed by a
  short 0.45s beat, so the boss is attacking again promptly.
- Phase thresholds are exactly 66% and 33%.
- Shared AttackShape telegraph/collision correctness and `sourceBossId`-scoped cleanup are unchanged.
- No permanent red boss floor auras were restored.

### 12. Boss animation stutter removed

- Boss animation now follows a stable priority: death, authored attack, actual movement, idle.
- Routine weapon ticks use emissive hit feedback and no longer restart a skeletal hit clip every
  few frames. This removes the Blue Demon stutter-step while preserving attack and death clips.

### 16. Aegis is an emergency protocol

- Selecting Aegis now creates a 14.5-unit repulsion wave, grants 1.5s invulnerability, and then
  supplies its bounded barrier. Elite and miniboss push resistance is preserved; the pulse deals
  only token damage and cannot replace Repulsor Burst.
- The choice card states all three effects and the existing form-fitting shell remains visible.

### 17. Exclusive Mega Protocols

- Every fifth boss still drops a non-expiring Mega Cache, but it now offers exactly three unique
  choices rather than enhanced ordinary protocols:
  - **Titan Protocol:** a 25s enhanced Mech with +35% offense/area and reinforced armor. It does
    not consume or reset the ordinary Mech cooldown and has a gold-white deployment beam.
  - **Fleet Annihilation:** three ships cross distinct intersecting lanes, erasing ordinary
    enemies, heavily damaging minibosses and applying capped percentage damage to bosses.
  - **Singularity Event:** snapshots current Energy, pulls it with exact conservation, draws in
    the horde, deals bounded ticks and ends in a lethal ordinary-enemy collapse. Health and later
    Energy are excluded.
- Each has dedicated lifecycle state, telemetry attribution, HUD TEMP tracking, choice copy,
  fixtures, cleanup, bounded damage rules and regression tests. Singularity finishes its short
  cinematic before any earned upgrade modal opens.

### 18–19. Prototype weapons have readable identities

- **Arc Conductor** renders every jump as a jagged white-core/cyan-glow bolt with endpoint flashes.
  L5 chains remain visible above dense creature models and use segmented geometry rather than
  per-shot tubes.
- **Orbital Lance** shows concentric countdown reticles followed by a tall white/gold beam,
  ground flash and shockwave. Judgment Array visibly produces multiple lances; collision radius
  remains the authored reticle radius.

### 21. Resource stability extended

- Renderer stress now churns Aegis, Recall, Gunship, Titan, Fleet and Singularity alongside every
  L5 weapon, boss attacks, elites and restarts. Owned effects dispose cleanly; fleet ship asset
  geometry remains shared and is never accidentally disposed.

### 13. Upgrade cards explain the decision

- **Root cause:** the card said `WEAPON • 1 / Twin Globs / Impact 42 → 47`. It did not say whether
  this was a weapon, a passive or an upgrade; what "Twin Globs" changes; or that it also cuts the
  fire rate by 62%.
- A single authoritative diff generator now compares every mechanically relevant field —
  projectile/strike/beam count, chains, bounces, splits, damage, puddle damage, volley interval and
  rate, radius, splash, puddle radius and duration, width, length, speed and lifetime — and derives
  the copy from the authored tables so it cannot drift.
- Every card carries a category badge (`NEW WEAPON`, `WEAPON UPGRADE`, `NEW PASSIVE`,
  `PASSIVE UPGRADE`, `NEW PROTOTYPE`, `PROTOTYPE UPGRADE`, `OVERCLOCK`), the parent name, the exact
  level transition, the authored upgrade name, a plain-language sentence, the numeric diffs, and an
  explicit tradeoff line when the upgrade has a downside.
- A field appearing for the first time is reported rather than skipped — Virulent Cascade's bounce
  and split are the whole identity of that level and used to be invisible.
- Cards are built with DOM nodes and `textContent`; card copy is data and never becomes markup.

### 14. Exact death log

- A typed `DamageSource` model replaces the loose string tag. Every player-damage path — horde
  contact by role, elite lunge, miniboss slam, boss body, boss charge, boss projectile, boss beam,
  boss hazard, each boss pattern by name, and other hazards — must name itself. There is no default
  and no fallback bucket, so nothing can kill the player anonymously.
- A bounded 32-entry ring records survival timestamp, source display name, attack name, raw damage,
  damage after mitigation, shield absorption and remaining integrity.
- The death screen states `Killed by [enemy/boss] — [attack]`, the final damage, and a chronological
  list of contributing hits from the last 12 seconds. Rendered with safe DOM APIs; no `innerHTML`.

### 15. Recount-style run report

- Available from the pause menu (`RUN STATS`) and from the death screen.
- Damage is **health actually removed**, clamped to the target's remaining health, so overkill on a
  dying enemy cannot inflate a weapon's share.
- Two separate views so form attribution never double-counts source totals: by source (each weapon,
  Repulsor, ship body/exhaust/wake, Gunship, and future ability sources) with total, share, DPS,
  hits, kills, boss damage and max hit; and by form (astronaut/ship/mech) with damage, share,
  uptime and DPS-while-active.
- Also records Mech and Ship uptime, elite and miniboss kills, boss and Mega-Boss time-to-kill,
  damage taken by source, healing by repair orbs and by Nanite Bleed, shield absorption, and
  ordinary/Mega Cache selection counts.
- Bounded and local; no backend.

### Weapon rebalance forced by the speed change

Lowering enemy speeds changed what the deterministic weapon benchmark measures, and several
weapons fell outside the documented progression contract. They were re-tuned until the contract
held again, not by widening the contract:

- **Microdrone Swarm** damage cut ~24% across L1–L5. Homing gained reliability against the slower
  opening speeds and pushed bee's starter to 1.37× the four-starter mean, outside the ±15% band.
- **Rail Lance** L4 158 (was 152) so the L5 second-beam breakpoint stays inside the ceiling.
- **Gravity Pulse** L5 69 (was 67) to restore the 3.0 minimum L5/L1 ratio.
- **Rocket Barrage** L2 49 (was 47) to bring the L3 salvo step under the typical ceiling.
- **Orbital Lance** re-authored (140/168/205/250/290 with cadences 4.2/4.0/3.8/3.6/5.6). The old
  curve had a dead L3 step and a ~2× L5 jump.
- The benchmark itself gained a per-weapon measurement window: a weapon firing ~11 times in the
  standard 48s window carries ±10% quantisation noise from a single shot, which is the same
  magnitude as the gain bounds. Windows are extended only for weapons that would otherwise fire
  fewer than 16 volleys — today, Orbital Lance alone.

Final contract state: starter band 0.89–1.14 (target 0.85–1.15); L5/L1 ratios 3.02–3.43
(target 3.0–4.2); every per-level gain inside bounds with at most one declared breakpoint each.

### 20. Mega-Boss size

- `megaVisualMul` reduced from 2.0 to **1.5** — a 25% cut to the presented Mega-Boss. Regular boss
  sizes are unchanged.
- `megaColliderMul` reduced from 1.55 to **1.32** so the collider tracks the reduced visible body
  and Repulse, ship exhaust, weapon hits, body contact and telegraph origins stay honest.

### 22. Version and leaderboard

- `SURVIVOR_BALANCE_VERSION = 'endless-2.3.0'`. New scores partition under 2.3.0; historical scores
  are retained in storage and excluded from the default current-version board. Nothing is deleted.

### Tests

- New `survivorRelease230.test.ts` (79 tests) covering every speed/population/spawn/elite/contact
  anchor, the repair economy's pacing, pity floor, injured gate and single-heal guarantee, Nanite
  Bleed's percentage model and orb bonus, passive caps, the full Mech cooldown model including
  first readiness and the absence of any kill-based recharge path, elite health/telegraph/knockback
  contracts, the surge director's timing, non-stacking, boss interaction and edge geometry, crowd
  separation including exact overlaps and full-cap stability, every authored upgrade card, the
  typed damage sources and bounded death log, and the run report's overkill exclusion and
  form-attribution independence.
- Existing suites updated to the new balance rather than relaxed.
- Added six Mega-Protocol correctness tests plus expanded renderer stress coverage.
- Total: 260 tests passing.

## [2.2.1] — 2026-08-09 — Containment Protocol repair release

Balance line: `endless-2.2.1`. New leaderboard partition; `endless-2.2.0` and older records are
retained in storage but the board defaults to the current partition only.

This release repairs verified defects in `endless-2.2.0` rather than adding features.

### 1. Gravitic Recall no longer loses XP

- **Root cause:** `gainXp()` returned early whenever `state.phase !== 'playing'`. The first recalled
  orb that crossed a level threshold opened the level-up modal and flipped the phase, so every
  orb collected later in that same frame — and the whole end-of-recall snap collection — was
  deactivated as collected but had its value discarded.
- XP accumulation is now separated from presenting the modal. `gainXp()` always banks the full
  amount; `settleXpLevels()` converts banked XP into levels and pending choices; and
  `openPendingLevelUp()` opens **at most one** owed modal, only while the phase is safely
  `playing`. Excess XP stays banked.
- The first modal is deferred until the ~1.25s Recall pull finishes, so the animation is never
  frozen half-way. Owed level-ups then present sequentially — one card grants exactly one level,
  and no weapon or passive is ever mutated just because several levels are pending.
- Recall still captures only the energy orbs alive at activation: health orbs are never pulled and
  orbs created afterwards are never joined to an in-flight pull.
- The `survivor-recall` fixture no longer sets `xpNext = 99999`; it now crosses four real levels.
- Added cumulative-conservation tests (`total earned = XP spent reaching the level + unspent XP`)
  covering no level-up, one level, four levels, several orbs in a single frame, the final snap,
  health-orb exclusion, late orbs, empty Recall, and phase/choice coherence.

### 2. Boss attack shapes are a live architecture

- The simulation now owns attack entities (`survivorAttacks.ts`), each carrying one authoritative
  `AttackShape`, a `windup → active → fade` lifecycle, a damaging flag, a style, and a
  `sourceBossId`.
- The renderer draws that exact shape through `shapeToRender()` and a buffer-reusing floor mesh;
  collision tests that exact shape through `pointHitsShape()`. Neither side reconstructs its own
  approximate geometry any more.
- All 14 patterns were audited and corrected: line/cryo/beam telegraph widths now equal collision
  width (they previously differed by up to 1.28×), fan shows a real cone matching the volley it
  will fire, aerial-strafe impacts and spore/cataclysm detonations use one radius for warning,
  visual and damage, rupture and gravity render a true annulus with a safe core, and ravage's
  corridor is the body path it actually sweeps.
- `damaging` is now the whole truth — rupture and gravity arm their ring from the shape itself
  instead of a second hidden radius guard.
- Summon markers, the strafe corridor and the gravity pull core are explicit non-damaging markers
  in a separate palette; every damaging boss warning is red/magenta.
- Boss-scoped cleanup: cancellation, phase change and death clear only that boss's entities.
  The old proximity heuristic could clear a *different* boss's telegraphs within 28 units.
- `patternShape()` was removed rather than left as a test-only abstraction; the remaining shape
  helpers are all used in production.
- Removed a per-frame `pushEffect` in sweeping-beam that allocated a new effect (and materials)
  every frame.

### 3. Weapon levels actually rebalanced

- The previous suite accepted a 2×–7.5× L5/L1 window, which widened the acceptance range instead
  of fixing the weapons. Measured growth was up to **15.4×**.
- The benchmark was rebuilt around moving, live-like targets: enemies run their normal pursuit AI
  at real role speeds while the player kites a circle for a whole number of laps, across seven
  scenarios (single-boss, sparse, dense, mixed-elite, mobile-offaxis, lined-up, clustered).
- Projectile-count growth is capped at 2× across L1–L5 and area growth was trimmed, so progression
  comes from damage and cadence rather than from multiplying projectiles.
- Measured intended-scenario **L5/L1 is now 3.17–3.37** for all eight weapons; per-level gains are
  24–39% with exactly one declared mechanical breakpoint per weapon (41–50%).
- Hero starters are within **±4%** of the mean (was −56% to +56% on the moving benchmark).
- Authored per-shot damage never decreases, so every upgrade card reads as an increase.
- Rutherford's ordinary Rocket Barrage is unchanged in role and retained.
- Fixed **Orbital Lance never leading its target**: the delayed strike aimed where the target was,
  so it cleanly missed anything that walked. It now leads by the strike delay.
- `docs/WEAPON_BENCHMARK.md` is generated from the harness (`npm run bench:doc`); no number in it
  is hand-written.

### 4. Early specialist gates enforced

- Added `isEnemyEligibleAt(defId, time)` plus a state-aware `canSpawnEnemyNow()` as the single
  eligibility path for ordinary composition, surge substitutions, forced elites, director variants
  and boss summons. A blocked specialist becomes time-valid fodder so pressure is preserved.
- Gates: fodder 0s, fast 30s, spiky/flyer/bee 60s, bruiser/elite 90s, ghost 120s.
- At most one living specialist before 60s, and specialist-heavy surges are held back until then —
  a forced sprinter surge at 45s previously replaced ~55% of spawns with sprinters.

### 5. False-positive tests replaced

- Boss FIFO now proves the exact 4 → 5 → 6 drain order, that index 5 is the Mega, that nothing is
  duplicated or lost, that the queue empties, and that index 7 waits behind earlier indices.
- Gunship seeds explicit targets and asserts each outcome: ordinary and elite die, miniboss loses
  ~80% max HP, the off-lane target is untouched, a regular boss loses ~7% and a Mega ~3.5%, each
  target is struck once, the normal death/reward path runs, and exactly one damage number is
  emitted per target.
- Every surge kind is forced and its actual composition or spawn geometry asserted.
- This caught two real director defects: **encircle never encircled** and **pincer used one edge**
  (both keyed off a within-frame spawn index that was almost always 0), and `edgeB` was a
  perpendicular edge rather than the facing one.

### 6. Deprecated parallel state removed

- `breachStacks` is gone entirely. `pendingBossIndices` is the only boss backlog, and the HUD now
  derives its Breach Queue count from `state.pendingBossIndices.length`.
- Deprecated Protocol `rocketProtocol` state, its initializer and its per-frame forced disable are
  removed. Rutherford's ordinary Rocket weapon is untouched.
- Removed the dead `beam` effect kind and the duplicated fixture list in `AppController`.
- Lint is now `--max-warnings 0` with the configuration unchanged; the two unused boss-pattern
  arguments were resolved by the attack-entity refactor.

### 7. One Gunship damage number per target

- The Gunship called `damageEnemy()` (which emits) and then `emitDamage()` again under a second
  key, producing two numbers per target. It now uses the normal damage API with a `gunship`
  presentation style — one large gold number, normal death and reward processing intact.

### 8. Lost-focus handling completed

- `window.blur` and `document.visibilitychange` have separate handlers; the visibility handler acts
  only when `document.hidden === true` and returning to visible never auto-resumes.
- Focus loss clears held keys and action edges, drops any pending upgrade selection, cancels an
  in-flight keybind capture and resets the HUD rebinding state, and keeps `inputBlocked` tied to
  the settings panel alone.
- Pauses only from `playing`; `levelup` and `protocol` keep their own phase.
- Listeners are registered and removed symmetrically, so a restart or remount cannot double-bind.

### 9. GPU stability measured

- Added a `survivor-stress` fixture (full enemy cap, five L5 weapons, all abilities ready, boss and
  cache schedules primed) and a GPU overlay on **F3** showing geometries, textures, programs, draw
  calls and pool sizes alongside FPS.
- Attack shapes render from pre-allocated buffers that are rewritten in place, so an expanding ring
  or sweeping beam never allocates per frame; the visual pool reaches a high-water mark and stays.

## [2.2.0] — 2026-08-09 — Containment Protocol balance and systems release

Balance line: `endless-2.2.0`. New leaderboard partition; historical `endless-2.1.0` (and older) records retained but not mixed into the default current-version board.

### 1. Enemy speeds and opening composition

- Restored controllable opening speeds (basic 3.30, mush 3.10, fast 4.25, spiky 4.35, flyer 3.90, bee 4.05, ghost 4.00, bruiser 2.85, elite 3.70, miniboss 3.10).
- Global speed curve: `1 + 0.016*m` through 15m, then `+0.008/m`, Collapse steps after 30m, hard cap ~1.70.
- Gradual composition: fodder 0–30s; sprinters ~8–10% after 30s; flankers after 60s; hunters after 2m; bruisers 1–2m; elites after 90s gate.
- Elite/hunter lunges: real windup (no move/damage) → lock direction → short dash → recovery.

### 2. Protocol Caches redesigned

- **Aegis Barrier:** `round(20 + 2*minutes + 0.08*maxHP)`, 35s normal / 45s enhanced, 1.35× enhanced amount, replace-not-stack. Dynamic card shows shield + duration.
- **Gunship Flyby:** once-per-target corridor strike; guaranteed ordinary kills; ~80% miniboss max HP; ~7% boss / ~3.5% Mega; spawn suppress ~1.2s after clear.
- **Gravitic Recall** replaces Protocol Rocket Barrage (ordinary Rutherford `rocket` weapon untouched). Pulls active energy orbs only; conserves XP; dynamic card value.
- Protocol Rocket fixtures/state removed from choice set.

### 3. Pressure director finished

- States: normal → telegraph → surge → recovery → normal (one active surge).
- Surge kinds: sprinters, pincer, bruiser, encircle, elite (gated), flood — each changes composition and/or spawn geometry.
- Recovery ~10s at ~60% spawn rate; forced elites suppressed.
- World-edge telegraphs; no new HUD clutter.

### 4. Boss backlog FIFO

- Replaced lossy `breachStacks` count with `pendingBossIndices: number[]`.
- Exact one-based indices enqueued; FIFO drain; Mega index 5 retains Mega status.
- HUD backlog derives from queue length.

### 5. Infinite-run GPU lifecycle

- Effect geometries/materials disposed on expiry (`ownsGeometry` / owned mats).
- Rails use pooled shared unit geometry + scaled meshes; dispose pool on mode teardown.
- Shared materials no longer poisoned by per-effect opacity fades.

### 6. Boss telegraph / collision

- Shared `survivorAttackShapes.ts` (circle, ring, line, cone) drives hits and render descriptors.
- Boss patterns use shared shapes for ring/line/beam collisions.
- Hazards carry `sourceBossId`; cancel cleans only that boss’s projectiles/hazards/telegraphs.
- Phase interrupts complete attack counters cleanly.

### 7. Weapon / hero balance

- Deterministic combat benchmark harness (`survivorWeaponBenchmark.ts`) across five scenarios.
- Starter weighted output within ~±10% mean (Bee/microdrone, Fitzwilliam/rail, Fortunato/bioplasma, Rutherford/rocket).
- Rocket densest-point targeting fixed (no longer averages sparse ring to origin).
- Overclock remains +7% additive damage per level past L5.

### 8. Focus loss

- `window.blur` + `visibilitychange` clear held keys and pause active runs.

## [2.1.0] — 2026-08-09 — Melee horde redesign and presentation polish

Balance line: `endless-2.1.0`.

### Critical design

- **Ordinary enemies no longer fire projectiles.** Former ranged roles (`flyer`, `ghost`, `bee`, `elite`) are melee archetypes (flanker, hunter, elite lunger) that retain their models.
- Danger comes from density, speed, encirclement, sprinters, lunges, bruisers, elites, and surge waves.
- Bosses remain the only source of projectiles, beams, puddles, and complex ranged patterns. Minibosses keep telegraphed melee AOE.

### Pickups

- **Removed Supply pickups entirely** (cube/ring/pillar objects and `openSupply`).
- Floor rewards are only energy (xp) and health (repair). Protocol Cache remains unique.
- Elites and bosses drop larger premium energy bundles; minibosses drop premium energy + health.

### Horde balance

- New AI roles: fodder, sprinter, flanker, hunter, bruiser, elite, miniboss.
- Opening pressure: ~28 targets, ~2.2 spawns/sec, speedMul ~1.10, early elite chance ~4%.
- Density curve toward 160 cap with higher elite share over time.
- Global speed curve raised past the old 1.28 cap (late ~1.5–1.7 with collapse).
- Boss horde dampening ~85% (mega ~65%); after 40 minutes normal bosses no longer dampen.
- Surge director every ~50s with perimeter telegraphs.
- Containment Collapse after 30 minutes: stepped health/damage/speed/lunge pressure.

### Hero / passive

- Thruster Boost +5%/level (max +25%).
- Weapon haste ~5.5%/level; Containment Field ~5.5% radius/level.
- Hull Plating +14 early / +7 late; Nanite Bleed ~0.22/s early with 3s pause after damage.
- Breach Shielding hard-capped at 60%.

### Boss physical damage

- Explicit categories: body, charge, projectile, beam, puddle, radial.
- Body contact > projectile; charge > body; Mega body/charge higher.
- Shared boss-contact cooldown and separation push; uses real `colliderRadius`.

### Presentation

- Massive `protocol-rocket` projectiles with body, nose, flame, and thick trails.
- Astronaut/mech idle when stationary (`isMoving` sim flag).
- Upgrade cards show `NEW PASSIVE` vs `PASSIVE`.
- Aegis ellipsoidal shell sized per astronaut/mech/ship.
- Redesigned Cache direction panel with SVG arrow.
- Damage-number semantics (neutral/gold/red/green/cyan absorb glyph).
- Aegis HUD float above command deck without reflowing vitals.

### Tooling

- Added ESLint flat config and `npm run lint`.

### Testing

- Expanded suite covering melee roles, opening density, speed curve, boss damage hierarchy, no supply type, no ordinary enemy projectiles.

## [2.0.3] — 2026-08-09 — Progression integrity and Protocol presentation

Balance line: `endless-2.0.3`.

### Critical fix

- **Supply crates no longer permanently upgrade weapons.** `openSupply()` previously selected a random owned weapon and executed `w.level += 1` on elite/miniboss Supply drops, which inflated Builds without player choice (observed L11–L18 weapons without matching selections).
- Permanent weapon and passive level mutation is now centralized behind validated level-up choice helpers. Only an explicit card selection in `phase === 'levelup'` may raise weapon/passive/Overclock levels.
- Choice sets are consumed immediately so high-refresh double-input cannot apply the same card twice.
- Supply crates now grant non-permanent rewards only: integrity pack, Energy/XP bundle (still requires a visible level-up choice if a level is earned), or modest mech charge + XP.

### Protocol presentation

- **Aegis Barrier:** persistent cyan barrier actor follows astronaut, mech, and ship while `shieldPoints > 0` and `shieldTime > 0`; scales by form; intensity tracks remaining shield; shatter feedback on depletion.
- **Rocket Barrage:** rockets launch from near the player with velocity, travel visibly, leave short trails, and explode only on arrival. Target reticles match blast radius. No damage before impact.
- **Gunship Flyby:** ship originates at/near the player (cache collection point), engines hold briefly on-camera, then flies toward boss/horde and exits the far rim — no off-screen edge start.
- Fixtures: `survivor-shield`, `survivor-rockets`, `survivor-gunship`.

### Combat / fairness

- Player-versus-boss hit tests (Repulsor, Rail, Gravity, Bio splash, projectiles, ship exhaust) use each boss’s actual `colliderRadius` instead of the global `SURVIVOR_BOSS.colliderRadius`.
- Hostile damage source prefers explicit `sourceBossId` over legacy dynamic `fromBoss` property checks.

### Presentation

- Health orbs redesigned: larger crimson/white medical cross, no cyan ring, slower pulse, full-health dimming, faster expire warning.
- Energy orbs remain smaller cyan crystals with faster spin for color-blind-friendly silhouette distinction.

### Leaderboards

- Default leaderboard view filters to the current balance version (`endless-2.0.3`).
- Older runs remain stored and are not deleted; they are partitioned by `balanceVersion`.
- Leaderboard rows are built with DOM text nodes (no unsafe `innerHTML` interpolation of record fields).

### Testing and deployment

- Added progression-integrity suite (100 Supply collections, Protocol non-mutation, single-card increments, double-apply protection, Overclock-only-via-choice).
- Added Protocol presentation contracts (Aegis absorb, rocket travel-before-damage, gunship player-origin, per-boss colliders).
- Shipped with expanded test suite, clean typecheck/build, and zero npm audit findings.

### Source

- See the commit on `main` that introduces balance line `endless-2.0.3`.

## [2.0.2] — 2026-08-09 — Presentation and pickup reliability

Balance line: `endless-2.0.2`.

### Fixed

- Applied boss simulation position, facing, and visual scale to rendered boss models every frame.
- Restored large moving normal bosses and the intended approximately doubled Mega-Boss scale.
- Replaced the tier-draining upgrade generator with deterministic offensive, passive, and wildcard choices.
- Prevented endless weapon Overclocks from starving integrity, regeneration, and other passive upgrades.
- Made the Build panel scrollable and separated weapons, passives, and temporary effects so acquired upgrades are no longer clipped.
- Replaced the cache's short-lived generic effect with a persistent collectible world actor.
- Kept cache alert text upright while rotating only its direction icon.
- Reworked repair-orb collection to evaluate health per orb, heal only missing integrity, and support swept collection during fast movement.
- Prevented important repair and supply rewards from being silently discarded when the pickup pool is saturated.
- Projected pickup drops away from perimeter scenery.
- Replaced the Gunship Flyby's random empty path with a boss- or horde-aware attack lane, warning phase, visible flyover ship, and type-safe damage targeting.
- Resolved the outstanding `nanoid` dependency advisory.

### Changed

- Increased base health magnet radius from `4.25` to `6.0`.
- Increased health magnet growth per Magnet Field level from `0.6` to `0.88`.
- Increased astronaut health direct-collection radius from `0.8` to `1.25`.
- Increased health magnet movement speed from `20` to `24`.
- Increased ship health magnet minimum from `6.5` to `9.0`.
- Increased mech health magnet multiplier from `1.25` to `1.4`.
- Set ship health direct collection to at least `max(ship pickup radius + 1, 3.2)`.
- Increased Protocol Cache collection radius from `2.2` to `3.25`.
- Increased the pickup pool from `120` to `160`, including 24 protected reward slots.
- Added a 48-second ordinary repair-pickup lifetime with an expiration warning during the final eight seconds.
- Added a `2.75`-unit safe arena inset for pickup spawning.
- Reworked Gunship Flyby to warn for `0.9s`, strafe for `4.6s`, use a `3.4` half-width lane, deal `38` base enemy damage, and deal `95` base boss damage.
- Updated Magnet Field copy to explain its larger benefit to health pickup reach.

### Testing and deployment

- Added 15 regression scenarios covering mixed upgrade offers, repair behavior, ship collection, safe pickup positions, pickup-pool rules, cache lifetime and collection, Gunship warning/damage, and boss scale contracts.
- Shipped with 86 passing tests, clean typechecking and production build, and zero reported npm audit vulnerabilities.
- Deployed to [get-your-ship-together.pages.dev](https://get-your-ship-together.pages.dev/).

### Known limitations at release

- No lint script was added.
- The complete Gunship Protocol flow was tested in simulation but not selected end-to-end during the production browser smoke test.
- Numeric GPU-memory and draw-call comparisons were not recorded.
- The main JavaScript bundle remained approximately `782.18 kB` minified (`207.63 kB` gzip).

### Source

- [`5de472c`](https://github.com/marshmallow-muskrat/get-your-ship-together/commit/5de472cb2c02b8d69da321272778c7ecf6898d64) — Repair Containment Protocol presentation and pickup regressions.

## [2.0.1] — 2026-08-09 — Boss pattern expansion

### Added

- Dedicated boss-pattern simulation module and content-driven pattern selection.
- Multi-phase normal and Mega-Boss combat behaviors.
- Unique-pattern rotation including rupture rings, cryo lanes, charge attacks, sweeping beams, aerial strafes, and spore-based attacks.
- Additional boss-pattern fixtures and regression scenarios.

### Changed

- Extended boss state to support pattern lifecycles, phases, targeting, and attack ownership data.
- Refactored boss simulation out of the general survivor simulation file.
- Expanded Mega-Boss combat rules and pattern cadence.

### Source

- [`a6329f2`](https://github.com/marshmallow-muskrat/get-your-ship-together/commit/a6329f2) — Complete boss and Mega-Boss combat patterns.

## [2.0.0] — 2026-08-09 — Endless combat-depth update

Balance line introduced: `endless-2.0.0`.

### Added

- Shared boss-aware targeting with deterministic focus debt rather than separate per-weapon targeting hacks.
- Arc and Orbital prototype weapons unlocked at five and fifteen minutes.
- Protocol Caches spawning every two minutes with Aegis Barrier, Rocket Barrage, and Gunship Flyby choices.
- Point-based Aegis shield that absorbs damage before integrity.
- Mega-Boss cadence every fifth scheduled boss.
- Expanded boss definitions, patterns, and content tables.
- Magical energy and health pickup presentation.
- Persistent unlock, cache, shield, Mega-Boss, and focus state.
- Additional simulation coverage for health magnets, permanent upgrade choices, targeting, shields, prototypes, and Mega-Boss scaling.

### Changed

- Removed temporary consumables from ordinary level-up choices; permanent progression and Protocol rewards became separate systems.
- Increased health-orb magnet benefit relative to energy-orb magnet benefit.
- Added quadratic boss-health scaling and stronger late-game enemy-health scaling.
- Increased the chance that automatic damage abilities focus long-lived bosses later in a run.
- Added more boss assets to the encounter rotation.
- Made bosses pursue the player and expanded boss attack behavior.
- Added special upgrade caches in distant arena corners.
- Reworked Emergency protection into a scalable shield rather than a one-hit consumable.
- Updated the HUD with cache direction, shield, unlock, Mega-Boss, and Protocol-choice presentation.
- Removed the former persistent red boss floor aura from the intended presentation.

### Source

- [`57b6089`](https://github.com/marshmallow-muskrat/get-your-ship-together/commit/57b6089) — Expand Containment Protocol combat systems for endless depth.

## [1.5.0] — 2026-08-06 — Containment Protocol becomes the game

### Changed

- Made Containment Protocol the sole product direction and sole runtime entry point.
- Removed the abandoned campaign runtime, maps, combat simulation, renderers, input layer, and campaign HUD.
- Rewrote the project concept and primary documentation around infinite arena survival.
- Consolidated screen-basis and survivor-specific runtime code.
- Retained the hero-selection experience while routing selection directly into Containment Protocol.

### Removed

- Act-based campaign runtime and obsolete campaign documentation.
- The painted 2D prototype runtime.
- Old campaign rendering, collision, level-layout, VFX, and map systems.

### Source

- [`69d8ef0`](https://github.com/marshmallow-muskrat/get-your-ship-together/commit/69d8ef0) — Make Containment Protocol the sole GYST direction.
- [`9612d5d`](https://github.com/marshmallow-muskrat/get-your-ship-together/commit/9612d5d) — Make Containment Protocol the sole game runtime.

## [1.4.0] — 2026-08-06 — HUD, boss variety, and leaderboards

### Added

- Multiple creature models for the boss rotation, including demon, dinosaur, dragon, mushroom king, and yeti assets.
- Per-character local high-score leaderboards.
- Leaderboard access from hero selection and the survivor interface.
- Additional boss, upgrade, HUD, and persistence regression coverage.

### Changed

- Enlarged bosses and improved boss identification and encounter presentation.
- Expanded top-corner survival information and containment warnings.
- Refined the MOBA-style bottom-center ability HUD.
- Enlarged the upgrade-selection presentation.
- Increased damage-number visibility.
- Improved mech-ready presentation.
- Increased Dodge travel distance.
- Improved ship pickup and thruster-damage scaling.
- Added boss-damage-reduction progression.
- Diversified boss presentation and survivor balance.

### Source

- [`1e082d4`](https://github.com/marshmallow-muskrat/get-your-ship-together/commit/1e082d4) — Refine Containment Protocol HUD, bosses, and local leaderboards.

## [1.3.0] — 2026-08-06 — Infinite high-score survival

### Added

- Count-up survival timer and open-ended run structure.
- A boss every two minutes.
- Endless enemy and boss scaling.
- Per-run records and local high-score persistence.
- Endless weapon Overclocks beyond authored level 5.
- Safe repeatable passives with diminishing returns and hard safety caps where required.
- Dedicated Build display for acquired weapons and upgrades.

### Changed

- Replaced countdown/map-completion goals with survival duration as the primary score.
- Kept the game on one static fixed-camera arena.
- Separated the Build display from the central player HUD so upgrades no longer resize ability controls.
- Added Spacebar Dodge as a dedicated cooldown ability ahead of Repulsor in the HUD.
- Increased mech-ready prominence.
- Removed unwanted roof/vent tiles from the arena presentation.

### Source

- [`5490f18`](https://github.com/marshmallow-muskrat/get-your-ship-together/commit/5490f18) — Convert Containment Protocol to endless high-score survival.

## [1.2.0] — 2026-08-06 — Player agency and control update

### Added

- Repulsor knockback ability.
- Temporary ship transformation used as a high-speed mobility and damage ability.
- Damaging ship thrusters and wake effects.
- Spacebar Dodge with its own cooldown.
- MOBA-inspired bottom-center HUD for integrity, energy, mech charge, keybinds, and cooldowns.
- Remappable keyboard controls and settings UI.
- UI-scale setting.
- Larger, more expressive damage numbers.

### Changed

- Greatly increased Repulsor radius and knockback while moving it to a longer cooldown.
- Improved Repulsor effect visibility and repeat-use behavior.
- Increased ship-thruster visibility and damage significance.
- Replaced the Frog hero's ineffective close-range starting attack with a ranged green projectile identity.
- Rebalanced the non-Boswell heroes against Boswell's strong starting auto-attack.
- Increased survivor difficulty pacing and boss pressure.

### Source

- [`f10eac1`](https://github.com/marshmallow-muskrat/get-your-ship-together/commit/f10eac1) — Add Q/E abilities, ship form, MOBA HUD, and harder survivor pacing.
- [`132c362`](https://github.com/marshmallow-muskrat/get-your-ship-together/commit/132c362) — Buff Repulsor and ship exhaust; add remappable controls and clearer damage numbers.

## [1.1.0] — 2026-08-06 — Containment Protocol vertical slice

### Added

- Fixed-camera, zoomed-out survivor-mode experiment inspired by horde-survival games.
- One static modular sci-fi arena.
- Large enemy hordes using the Ultimate Monsters asset pack.
- Automatic hero weapons, energy pickups, level-ups, upgrades, bosses, and survivor HUD.
- Deterministic fixed-step simulation and spatial hashing.
- Dedicated survivor state, simulation, content, renderer, arena, HUD, fixtures, and tests.
- Direct launch from the existing four-hero selection screen.

### Source

- [`f64b7a4`](https://github.com/marshmallow-muskrat/get-your-ship-together/commit/f64b7a4) — Add Containment Protocol survivor-mode experiment.

## [0.4.0] — 2026-08-05 — Campaign vertical-slice proof of concept

### Added

- Playable isometric sci-fi combat vertical slice derived from lessons learned from Gloamreach.
- Four playable hero assets with astronaut, mech, and ship forms.
- Modular sci-fi environment loading and placement.
- Enemy and boss creature assets drawn from the bundled CC0 packs.
- Isometric camera, actor animation, input, simulation, collision, VFX, and HUD systems.
- Initial campaign Acts I and II, encounter layouts, and combat tuning.
- Runtime asset curation and license notices.
- Automated combat tests and fixture-oriented development workflow.

### Changed

- Reorganized the large source asset packs into a curated runtime asset set.
- Prepared the build for co-founder playtesting.

### Source

- [`c7bf406`](https://github.com/marshmallow-muskrat/get-your-ship-together/commit/c7bf406) — Ship vertical-slice proof of concept for co-founder playtest.

## [0.3.0] — 2026-08-05 — Discarded campaign explorations

These experiments were important design research but are no longer part of the active game.

### Added and explored

- Isometric crash-site version of Act I.
- Vertically framed isometric corridor structure.
- Multiple terrain and art-direction revisions based on concept art.
- Painted 2D scrolling prototype.
- Modular sci-fi Act II environment.

### Source

- [`c784c8c`](https://github.com/marshmallow-muskrat/get-your-ship-together/commit/c784c8c) — Build Act One crash-site proof of concept.
- [`2841cbe`](https://github.com/marshmallow-muskrat/get-your-ship-together/commit/2841cbe) — Reframe Act One as an isometric vertical corridor.
- [`eda6b14`](https://github.com/marshmallow-muskrat/get-your-ship-together/commit/eda6b14) — Rescale Act I terrain to match the concept art.
- [`1117110`](https://github.com/marshmallow-muskrat/get-your-ship-together/commit/1117110) — Rebuild Act I art direction toward the concept art.
- [`c6f8d42`](https://github.com/marshmallow-muskrat/get-your-ship-together/commit/c6f8d42) — Add 2D painted-scroller prototype.
- [`267c03d`](https://github.com/marshmallow-muskrat/get-your-ship-together/commit/267c03d) — Build Act II from the modular sci-fi kit.

## [0.2.0] — 2026-08-03 to 2026-08-05 — Hero-selection refinement

### Added

- Four-bay hero hangar prototype.
- Space character-selection composition.
- Illustrated hero-selection treatment.
- Astronaut, mech, and ship progression-form presentation.
- Screen-space formation balancing and reflections.
- Hero progression concept art.

### Changed

- Repeatedly refined card proportions, selected-hero spacing, lighting, ship pitch, action placement, exits, and wordmark composition.
- Renamed the starter crew.
- Widened hero cards and softened model lighting.

### Source

- [`1c738c5`](https://github.com/marshmallow-muskrat/get-your-ship-together/commit/1c738c5) through [`82f1a5f`](https://github.com/marshmallow-muskrat/get-your-ship-together/commit/82f1a5f).

## [0.1.0] — 2026-08-03 — Repository foundation

### Added

- Initial game-concept documentation.
- Quaternius CC0 source asset packs for heroes, monsters, modular sci-fi environments, and spaceships.
- Vite, TypeScript, and Three.js project foundation.

### Source

- [`616a448`](https://github.com/marshmallow-muskrat/get-your-ship-together/commit/616a448) — Add game concept and source assets.

## Complete historical commit index

This index preserves every commit that predates the changelog.

### 2026-08-09

- `5de472c` — Repair Containment Protocol presentation and pickup regressions.
- `a6329f2` — Complete boss and Mega-Boss combat patterns.
- `57b6089` — Expand Containment Protocol combat systems for endless depth.

### 2026-08-06

- `9612d5d` — Make Containment Protocol the sole game runtime.
- `69d8ef0` — Make Containment Protocol the sole GYST direction.
- `1e082d4` — Refine Containment Protocol HUD, bosses, and local leaderboards.
- `5490f18` — Convert Containment Protocol to endless high-score survival.
- `132c362` — Buff Repulsor and ship exhaust; add remappable controls and clearer damage numbers.
- `f10eac1` — Add Q/E abilities, ship form, MOBA HUD, and harder survivor pacing.
- `f64b7a4` — Add Containment Protocol survivor-mode experiment.

### 2026-08-05

- `c7bf406` — Ship vertical-slice proof of concept for co-founder playtest.
- `267c03d` — Build Act II from the modular sci-fi kit.
- `c6f8d42` — Add 2D painted-scroller prototype.
- `1117110` — Rebuild Act I art direction toward the concept art.
- `eda6b14` — Rescale Act I terrain to match the concept art.
- `2841cbe` — Reframe Act One as an isometric vertical corridor.
- `c784c8c` — Build Act One crash-site proof of concept.
- `82f1a5f` — Widen hero cards and soften model lighting.

### 2026-08-03

- `c3b2000` — Add hero progression concept art.
- `d9784b5` — Rename the starter crew.
- `fb657cc` — Relax hero card aspect ratio.
- `de6c3c4` — Move actions to corners and enlarge hero cards.
- `9d04c5e` — Refine selection cards, exits, and ship orientation.
- `508e92e` — Balance hero lighting and pitch ships.
- `29b7146` — Balance formation with screen-space centers and reflections.
- `6569f09` — Balance selected-hero formation spacing.
- `b5b60ce` — Separate selected-hero progression forms.
- `04e0382` — Give selected card and hero forms more breathing room.
- `d80e4c6` — Keep selected hero clear of roster cards.
- `27dc8c3` — Switch hangar to illustrated hero-selection screen.
- `bb1b820` — Polish roster wordmark and space composition.
- `a70305a` — Rework hangar into space character selection.
- `ba4abf2` — Refine hangar character-selection presentation.
- `1c738c5` — Build four-bay hero hangar prototype.
- `616a448` — Add game concept and source assets.

## Changelog maintenance policy

- Add user-visible, balance-significant, architectural, and important corrective changes under **Unreleased** as they are completed.
- Do not list planned work as completed.
- On a production release, move verified entries into a dated version section.
- Record the balance-line version whenever leaderboard comparability changes.
- Link the final production commit or comparison range.
- Keep discarded prototypes in history, but clearly distinguish them from the current game.

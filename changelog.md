# Changelog

This file records the notable development history of **Get Your Ship Together** (GYST).

The project changed direction several times before Containment Protocol became the game. Those abandoned experiments are retained here because they explain the origin of the current hero-selection screen, art direction, assets, and gameplay systems.

The version names below are retrospective product milestones unless a balance version is explicitly named. Git history remains the source of truth for exact implementation details.

## [Unreleased]

### Remaining follow-up

- Make every boss telegraph match its real collision shape and add complete browser fixtures for each unique pattern.
- Finish boss-owned cleanup for all hazard/zone types across phase transitions and fixture resets.
- Ordered boss index backlog and reserved hostile attack capacity.
- Clear held input on window blur/focus loss for all remappable actions.
- Full run-balance telemetry export (weapon DPS, death source, etc.).
- Hard GPU draw-call / memory A/B metrics and code splitting.
- Deeper weapon L1–L5 effective-power rebalance across all scenarios.

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

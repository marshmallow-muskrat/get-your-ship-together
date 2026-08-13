# Final audit

## Outcome

The accepted Test Center candidate substantially upgrades the game's procedural presentation and
station composition while preserving the existing asset packs. It starts from production commit
`c3ccd63a3d7efddd8e31a7dc6fe812a854d49ffd`, remains isolated on
`codex/game-polish-test-center`, and is frozen as iteration 10.

Local playtest URL: <http://127.0.0.1:4189/>

Remote publication uses this repository's existing Cloudflare Pages Git integration and is limited
to the isolated Test Center branch. Direct upload remains prohibited. Post-push verification is
recorded in the GitHub checks and final handoff rather than by mutating the exact commit after it has
been built and verified.

## Accepted visual scope

### Map layout

Reactor Platform 7 is doubled to 128 x 128 and reorganized around a central pad, crossing transit
spines, perimeter walls/airlocks, and four authored operational sectors. Every imported floor,
wall, door, pipe, console, prop, and landmark remains unchanged; improvement comes from composition,
support, path language, wayfinding, and lighting. Ordinary encounters retain the legacy local
combat footprint, and map evidence includes central and outer-sector views.

### Procedural effects and attacks

Weapon projectiles, Plasma Wake, Repulsor Burst, Orbital Lance, boss telegraphs/projectiles, pickup
cores/shells, impacts, trails, and dissipation receive geometry/material/VFX improvements. Threat
boundaries derive from simulation geometry. Effects remain legible over both the station pad and
ordinary floor, preserve attack telegraphs, and do not hide imported actors.

### Energy and repair pickups

Energy reads through a faceted core, translucent shell, and energized coil. Repair uses a medical
cross/hex silhouette, warm restorative material language, and different motion/structure, remaining
distinguishable from Energy without depending on color alone.

### UI and upgrade cards

The HUD receives consistent framing, hierarchy, readiness states, test partitioning, and a
non-overlapping diagnostics panel. Upgrade cards receive category sigils, progression labels,
scannable stats, concise copy, and protected input hints. The dedicated 16-case card harness passes
every supported viewport and UI scale, including deliberately long real copy.

## Imported-asset preservation

`git diff -- assets/space-packs public/runtime` is empty. No source-pack or runtime model, texture,
material, skeleton, animation clip, boss, monster, astronaut, mech, ship, environment tile, or prop
asset changed. The rejected `experiments/asset-remaster-review/` remains an archive only and is not
used by the candidate.

## Validation summary

- Repository tests: 496/496 passed across 10 files.
- TypeScript: passed.
- Lint: passed.
- Diff integrity: passed.
- Production build: passed.
- Frozen-build comparison: 193/193 files byte-identical to iteration 10.
- Declared browser fixtures: 30/30 passed.
- Experiment responsive checks: 4/4 passed.
- Release browser matrix: all 12 blocking desktop/laptop combinations passed.
- Upgrade-card matrix: 16/16 passed with zero overlaps.
- Browser failures: 0 console, 0 page, 0 request.
- Permanent PNGs: 81/81 valid and non-empty.
- Validation matrix: 28 pass, 0 fail, 1 post-push verification pending, 2 intentional warnings.

## Fresh-eye correction record

The final pass did not accept the first visually plausible result. It reopened and corrected pad/VFX
depth behavior, Energy blending, repair evidence, Gunship world-edge timing and scoring, metrics
overlap, Orbital capture timing, benchmark comparability, browser readiness, and timeline-sheet
composition. Every rejected or earlier capture remains archived under `screenshots/iterations/` or
an explicitly rejected report filename.

## Remaining intentional limitations

1. The main JavaScript bundle triggers Vite's chunk-size advisory. It is 257,159 bytes gzip and
   passes every fixture/load test; code splitting is deferred rather than mixed into visual scope.
2. The 390px hero-selection screen clips cards at UI scales above 75%. Mobile/touch is explicitly
   outside the product scope; every blocking desktop/laptop layout passes.
3. Static screenshots cannot establish subjective balance or feel. The deterministic A/B is within
   a noisy overlapping range, and human Test Center playtesting remains the acceptance authority.

## Repository state

- Production branch `main` was never checked out or modified.
- No imported assets were changed.
- Nothing was integrated into production.
- Candidate publication is limited to `codex/game-polish-test-center`.
- The exact remote URL and post-push result are recorded in GitHub checks and the final handoff.

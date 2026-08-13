# Candidate change log

Starting point: production commit `c3ccd63a3d7efddd8e31a7dc6fe812a854d49ffd`.

This log enumerates only the accepted candidate's procedural VFX, arena-composition, UI,
correctness, and QA changes. Imported assets are intentionally excluded.

## Arena composition

- Doubled Reactor Platform 7 from 64 x 64 to 128 x 128 world units.
- Re-composed the station from unchanged modular-kit pieces: a clear central deployment pad,
  crossing transit spines, four readable operational sectors, perimeter walls, and airlocks.
- Added cargo, research, maintenance, and quarantine sector identities through arrangement,
  authored wayfinding geometry, and restrained lighting—not asset-pack edits.
- Kept ordinary spawns and surges in a legacy-sized engagement pocket around the player.
- Kept boss entrances at a stable local radius and made camera-follow lighting track the active
  encounter region.
- Made wayfinding overlays depth-test without writing depth, preserving both pad readability and
  ground VFX visibility.

## Procedural gameplay presentation

- Added collision-derived attack-boundary meshes so displayed threat shapes match simulation
  geometry.
- Rebuilt procedural projectile presentation for bolts, shards, bioplasma, boss orbs/fans, and
  related weapon actors with layered materials and category-specific silhouettes.
- Reworked Plasma Wake as a grounded multi-layer ribbon with a restrained additive filament;
  actors correctly occlude it and it remains readable over the central pad.
- Reworked Repulsor Burst into a layered, collision-faithful shock boundary.
- Reworked Orbital Lance into a readable sequence with buildup, beam, impact core, debris, shock,
  and dissipation.
- Improved boss telegraphs while preserving untouched boss models and unobscured threat zones.
- Rebuilt the Energy pickup as a cyan faceted core/shell with an energized coil.
- Rebuilt the Repair pickup with a warm medical cross/hex structure so it remains distinct from
  Energy by silhouette, symbol, and rhythm—not hue alone.

## Interface and upgrade presentation

- Re-composed the Survivor HUD with clearer hierarchy, ability states, Test Center partition tag,
  timer/build information, and restrained sci-fi framing.
- Rebuilt upgrade cards with category sigils, acquisition/progression state, clearer name and
  summary hierarchy, compact stat deltas, and protected keyboard-shortcut space.
- Tightened long upgrade descriptions without changing their mechanics.
- Moved diagnostic metrics into a bordered panel that does not overlap controls.

## Correctness fixes

- Kept Carrier Wing passes and Gunship Flyby inside the local combat window on the larger map.
- Made Gunship lane scoring use the same boss corridor width as actual collision, preventing a
  visually plausible lane from selecting a boss it could never hit.
- Preserved the automated survival policy's legacy comparison envelope so map expansion cannot
  silently grant the benchmark bot extra kiting space.
- Added regression coverage for map scale, local spawn boundaries, wayfinding depth behavior,
  Gunship regular/mega boss hits, and the stable benchmark envelope.

## QA and evidence

- Added a system-Chrome fallback to the existing browser and upgrade-card QA scripts while leaving
  default CI behavior unchanged.
- Preserved ten frozen build iterations, rejected captures, baseline captures, 18 final direct
  Three.js frames, animation timelines, comparison sheets, and the contact sheet.
- Added deterministic 30-fixture browser audit and baseline/candidate survival reports.

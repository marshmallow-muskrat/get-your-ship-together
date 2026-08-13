# Game Polish Test Center

Disposable visual-polish candidate based on production commit
`c3ccd63a3d7efddd8e31a7dc6fe812a854d49ffd`.

Status: implementation and local validation complete. The frozen candidate is available locally at
<http://127.0.0.1:4189/>. Remote publication is limited to the existing Cloudflare Pages Git preview
for `codex/game-polish-test-center`; direct upload is prohibited by `AGENTS.md`.

## Approved scope

- Preserve every imported model, texture, animation, material, and source-pack asset unchanged.
- Improve only authored procedural presentation: attacks, spell/VFX systems, pickups,
  telegraphs, feedback, UI, menus, and upgrade cards.
- Double Reactor Platform 7 from 64 x 64 to 128 x 128 playable world units and improve
  its composition using unchanged runtime assets.
- Keep gameplay semantics and combat geometry unchanged unless a genuine bug is found and
  documented.

## Explicitly rejected work

The earlier `experiments/asset-remaster-review/` edits to imported boss, monster, avatar,
mech, ship, and environment assets are rejected. They are preserved only as an archive and
are not used by this candidate.

## Safety

- Branch: `codex/game-polish-test-center` (not `main`)
- No imported asset files are edited.
- Publication is limited to this isolated branch; nothing is integrated into `main`.
- Local review builds, baseline evidence, accepted captures, rejected iterations, benchmarks, and
  audit reports are permanently preserved inside this experiment.

## Accepted candidate

- Reactor Platform 7 is 128 x 128 world units, composed from the unchanged modular environment kit.
- Ordinary combat retains a local 64 x 64 encounter pocket, so the larger station does not turn
  encounters into long commutes.
- Procedural attacks, boss telegraphs, spell trails, orbital effects, repair/energy pickups, HUD,
  and upgrade cards receive the visual-quality pass.
- Imported bosses, monsters, astronauts, mechs, ships, textures, animation clips, and tile models
  remain byte-for-byte untouched.
- Gunship targeting and benchmark comparison-envelope defects exposed by the larger map are fixed
  and regression-tested.

## Review entry points

- Four-stage replacement review: not applicable; the owner rejected imported-asset remastering.
- Final contact sheet: `screenshots/contact-sheets/final-polish-contact-sheet.png`
- Baseline versus candidate: `screenshots/comparisons/baseline-vs-final.png`
- Boss and orbital timelines: `screenshots/timelines/`
- Individual final frames: `screenshots/final/`
- Full screenshot index: `screenshots/index.md`
- Final audit: `reports/final-audit.md`
- Validation matrix: `reports/validation.csv`

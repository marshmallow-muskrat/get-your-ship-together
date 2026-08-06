# Implementation Agent Instructions

## Read first

1. `GAME_CONCEPT.md`
2. `docs/VERTICAL_SLICE.md`
3. `README.md`

## Product guardrails

- Build the polished vertical slice, not the retired horde-survival or endless-corridor game.
- Preserve the visual identity of the hero-selection screen.
- Manual primary attacks only.
- Focus: movement, aim, fire, dodge, ability, Nanite Repair, mech, enemies, one boss, ship part.
- Do not add RPG progression, loot, co-op, accounts, databases, or Electron.

## Architecture guardrails

- GYST is the host (Vite + TypeScript + Three.js `0.180.0`).
- Do not copy Gloamreach’s full `src/game` tree.
- Keep `heroId` separate from `form` (`astronaut` | `mech`).
- Simulation owns combat; rendering presents only.
- Every screen/runtime must dispose completely (no dual RAF/WebGL leaks).

## Assets

- Source: `assets/space-packs/` (not published)
- Runtime subset: `public/runtime/`
- Profile scale/collider/anims in content modules

## Quality

Compilation is not completion. Verify selection → combat → boss → ship part → return-to-crew in a real browser.

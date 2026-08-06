# Implementation Agent Instructions

## Read first

1. `GAME_CONCEPT.md`
2. `docs/VERTICAL_SLICE.md` (campaign)
3. `docs/SURVIVOR_MODE_VERTICAL_SLICE.md` (survivor experiment)
4. `README.md`

## Product guardrails

- GYST is evaluating **campaign** and **Containment Protocol (survivor)** directions.
- Survivor mode is an **authorized owner experiment** and may become the preferred primary mode.
- Preserve the visual identity of the hero-selection screen.
- Campaign: manual primary fire, dodge, ability, repair, mech, authored encounters.
- Survivor: automatic weapons, fixed camera, horde, XP upgrades, kill-charged mech — do **not** require campaign manual combat rules.
- Do not add accounts, databases, Electron, co-op, or permanent meta-progression for the slices.

## Architecture guardrails

- Keep Vite + TypeScript + Three.js `0.180.0`.
- Do not copy Gloamreach’s full `src/game` tree.
- Keep `heroId` separate from `form` (`astronaut` | `mech`).
- Simulation owns combat; rendering presents only.
- **Do not** scatter `if (mode === 'survivor')` through campaign systems. Isolate survivor under `src/game/modes/survivor/`.
- Campaign and survivor state must not share one bloated state bag.
- Every screen/runtime must dispose completely (no dual RAF/WebGL leaks).
- Switching campaign ↔ survivor ↔ selection must not leave listeners or loops alive.

## Assets

- Source: `assets/space-packs/` (not published wholesale)
- Runtime subset: `public/runtime/`
- Profile scale/collider/anims in content modules

## Quality

Compilation is not completion. Exercise campaign and survivor in a real browser before claiming done.

# Implementation Agent Instructions

## Read first

1. `GAME_CONCEPT.md`
2. `docs/CONTAINMENT_PROTOCOL.md`
3. `README.md`

## Authoritative product direction

- **Containment Protocol is GYST.** It is not an experiment or secondary mode.
- The former campaign prototype is retired and must not remain selectable, documented as active, or used as a product constraint.
- Preserve the hero-selection screen and its four-hero identity.
- The game is one-map endless survival: upward timer, automatic weapons, Energy/XP upgrades, bosses every two minutes, and death-only completion.
- Active controls provide agency: Dodge, Repulsor Burst, Afterburner ship form, and Mech Overdrive.
- Each hero has an independent local leaderboard.

## Architecture guardrails

- Keep Vite + TypeScript + Three.js `0.180.0`.
- Simulation owns combat; rendering presents only.
- Use one RAF loop and one WebGL renderer at a time.
- Every screen/runtime must dispose listeners, effects, models, and renderer resources completely.
- Keep hero identity separate from astronaut, ship, and mech form.
- Keep deterministic fixed-step simulation and deterministic fixtures.
- Centralize content and balance definitions; do not scatter hero, weapon, or boss special cases through hot loops.
- Use bounded pools/caps for enemies, bosses, projectiles, hazards, particles, and damage-number presentation.
- Do not retain campaign routes, buttons, fixtures, runtime code, tests, or documentation after the removal migration is implemented.

## Endless progression guardrails

- Weapon levels 1–5 are authored behavioral tiers.
- Level 6 onward uses repeatable Overclock scaling while still displaying normal levels (L6, L7, L8...).
- Repeatable damage growth is additive, not compounding.
- Eligible passive upgrades may continue with safe/diminishing returns.
- Hard safety caps remain for cooldown, speed, area, projectile count, pickup reach, transformation duration, and damage reduction.
- Weapon slots remain limited.
- Enemy and boss growth must eventually outpace the player.

## Product scope

Do not add without explicit owner direction:

- Additional maps
- Accounts, databases, or cloud saves
- Online leaderboards
- Permanent metagame progression
- Shops, currencies, inventory, or rarity
- Co-op
- Gamepad or touch support
- Audio production

## Assets

- Source packs: `assets/space-packs/` (not published wholesale)
- Runtime subset: `public/runtime/`
- Profile scale, collider, animation, boss aura, ship pickup, and thruster configuration belong in content definitions.
- Reuse the provided Quaternius CC0 assets and document any new runtime subset.

## Quality

Compilation is not completion. Exercise the game in a real browser, inspect the console, and verify the relevant fixtures before claiming work is done.

Minimum verification:

```bash
npm test -- --run
npm run typecheck
npm run build
```

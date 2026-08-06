# Get Your Ship Together

An endless isometric sci-fi survival game built with TypeScript and Three.js.

Choose one of four animal astronauts, build automatic weapons, transform into a ship and mech, fight a rotating boss every two minutes, and survive an increasingly impossible containment breach. There is no normal victory condition: your score is how long that hero lasted.

## Quick start

```bash
npm install
npm run dev
```

```bash
npm test
npm run typecheck
npm run build
```

## The game

- **One endless arena:** Reactor Platform 7
- **Upward survival timer:** death ends the run
- **Four heroes:** Boswell, Fitzwilliam, Fortunato, and Rutherford
- **Automatic weapon builds:** collect Energy and choose upgrades
- **Active agency:** Dodge, Repulsor Burst, Afterburner, and Mech Overdrive
- **Boss escalation:** a rotating boss every two minutes, with concurrent-boss breach pressure in late runs
- **Per-hero records:** separate local top-10 leaderboards

Containment Protocol is the primary and only game direction. The former campaign prototype is retired.

## Default controls

Bindings and UI scale are configurable from Pause → Settings.

| Action | Default |
|---|---|
| Move | WASD |
| Dodge | Space |
| Repulsor Burst | Q |
| Afterburner | E |
| Mech Overdrive | R |
| Level-up choice | 1 / 2 / 3 or click |
| Pause | Escape |

Energy is run XP. The timer pauses during level-up choices, pause, and Settings.

## Endless upgrades

- Weapon levels **1–5** are authored behavioral upgrades.
- Weapon levels **6+** continue visibly as L6, L7, L8, and so on, with secondary Overclock labels and controlled repeatable scaling.
- Safe passive statistics can continue with diminishing returns.
- Cooldowns, speed, area, projectile count, pickup reach, transformation duration, and damage reduction retain safety caps.
- Enemy and boss growth eventually outpaces every build.

## Development fixtures

- `/?mode=survivor&fixture=survivor-start&hero=bee`
- `/?mode=survivor&fixture=survivor-levelup&hero=red-panda`
- `/?mode=survivor&fixture=survivor-boss&hero=frog`
- `/?mode=survivor&fixture=survivor-ship&hero=flamingo`
- `/?mode=survivor&fixture=survivor-repulsor&hero=bee`
- `/?mode=survivor&fixture=survivor-damage&hero=frog`
- `/?mode=survivor&fixture=survivor-mech&hero=bee`

## Documentation

- [`GAME_CONCEPT.md`](GAME_CONCEPT.md) — authoritative product direction
- [`docs/CONTAINMENT_PROTOCOL.md`](docs/CONTAINMENT_PROTOCOL.md) — gameplay, architecture, balance, and fixtures
- [`AGENTS.md`](AGENTS.md) — implementation guardrails

## Stack

- Vite
- TypeScript
- Three.js `0.180.0`
- Vitest

Runtime assets are a curated subset under `public/runtime/`; source packs remain under `assets/space-packs/` and are not published wholesale.

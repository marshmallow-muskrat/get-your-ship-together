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
npm run bench:survival
npm run bench:repair
```

Browser QA against a built game, local or deployed:

```bash
npm run build
python3 -m http.server 8899 --directory dist &
node scripts/browserQa.mjs http://127.0.0.1:8899 --screenshots qa-shots
node scripts/cardQa.mjs http://127.0.0.1:8899
```

`browserQa.mjs` sweeps the viewport x UI-scale matrix for console errors and
clipping. `cardQa.mjs` opens the level-up modal and measures the upgrade cards
themselves — the regions only exist inside that modal, so the general sweep
never reached them.

Deployment is handled by the Cloudflare Pages Git integration: pushing `main`
publishes production, and any other branch publishes to
`https://<branch>.get-your-ship-together.pages.dev`. See `AGENTS.md` for how to
verify a deployment — a green deploy status alone does not mean the site works.

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
- `/?mode=survivor&fixture=survivor-arc&hero=bee`
- `/?mode=survivor&fixture=survivor-orbital&hero=red-panda`
- `/?mode=survivor&fixture=survivor-mega-cache&hero=frog`

## Documentation

- [`GAME_CONCEPT.md`](GAME_CONCEPT.md) — authoritative product direction
- [`docs/CONTAINMENT_PROTOCOL.md`](docs/CONTAINMENT_PROTOCOL.md) — gameplay, architecture, balance, and fixtures
- [`docs/SURVIVAL_BENCHMARK.md`](docs/SURVIVAL_BENCHMARK.md) — generated full-run distribution and standard-deviation chart
- [`docs/SURVIVAL_EXPERIMENTS.md`](docs/SURVIVAL_EXPERIMENTS.md) — preserved baseline/candidate simulation history
- [`docs/PRESENTATION_AUDIT_280.md`](docs/PRESENTATION_AUDIT_280.md) — endless-2.8.0 presentation, geometry and combat-correctness audit
- [`docs/DEVELOPMENT_WORKFLOW.md`](docs/DEVELOPMENT_WORKFLOW.md) — immutable releases and disposable Test Center experiments
- [`AGENTS.md`](AGENTS.md) — implementation guardrails

## Stack

- Vite
- TypeScript
- Three.js `0.180.0`
- Vitest

Runtime assets are a curated subset under `public/runtime/`; source packs remain under `assets/space-packs/` and are not published wholesale.

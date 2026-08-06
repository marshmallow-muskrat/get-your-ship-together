# Get Your Ship Together

Isometric sci-fi action prototype evaluating **two** directions:

1. **Campaign** — manual combat vertical slice  
2. **Containment Protocol** — endless survivor / high-score experiment  

## Quick start

```bash
npm install
npm run dev
```

```bash
npm test
npm run build
```

## Mode selection

1. Select a hero.
2. **CONTINUE** → Campaign  
3. **CONTAINMENT PROTOCOL** → Endless survivor  

## Containment Protocol

**Endless one-map run.** Timer counts **up**. Death ends the run. Score = survival time (local high scores).

Bosses arrive every **2 minutes** and scale forever. Permanent upgrades eventually cap; temporary consumables keep level-ups working.

### Default controls (remappable in Pause → Settings)

| Action | Key |
|---|---|
| Move | WASD |
| **Dodge** | **Space** (10s) |
| Repulsor Burst | Q (30s, large shockwave) |
| Afterburner | E (ship + thruster exhaust damage) |
| Mech Overdrive | R (when charged) |
| Level-up | 1 / 2 / 3 |
| Pause | Esc |

Energy bar = XP. One arena. Audio deferred.

### Fixtures

- `/?mode=survivor&fixture=survivor-start&hero=bee`
- `/?mode=survivor&fixture=survivor-boss&hero=frog` (≈2:00 boss)
- `/?mode=survivor&fixture=survivor-ship&hero=flamingo`
- `/?mode=survivor&fixture=survivor-repulsor&hero=bee`
- `/?mode=survivor&fixture=survivor-damage&hero=frog`
- `/?mode=survivor&fixture=survivor-mech&hero=bee`

## Docs

- `GAME_CONCEPT.md`
- `docs/VERTICAL_SLICE.md`
- `docs/SURVIVOR_MODE_VERTICAL_SLICE.md`

## Stack

Vite · TypeScript · Three.js `0.180.0` · Vitest

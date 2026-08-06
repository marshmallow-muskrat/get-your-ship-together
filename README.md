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

**Endless one-map run.** Timer counts **up**. Death ends the run. Score = survival time with **per-hero local top-10 leaderboards** (`gyst.survivor.leaderboards.v2`).

Bosses arrive every **2 minutes**, rotate through **six** distinct models with a red hostile aura, and scale forever. Permanent upgrades eventually cap; temporary consumables keep level-ups working.

### Default controls (remappable in Pause → Settings)

| Action | Key |
|---|---|
| Move | WASD |
| **Dodge** | **Space** (10s, **13.5** units = 3× prior distance) |
| Repulsor Burst | Q (30s, large shockwave) |
| Afterburner | E (ship + thruster exhaust; damage scales with permanent build, cap 6×) |
| Mech Overdrive | R (when charged; strong ready glow) |
| Level-up | 1 / 2 / 3 |
| Pause | Esc → Settings (**UI Scale** 75–150%), Leaderboards |

Energy bar = XP. Ship form expands Energy/repair pickup radius to match each hero’s ship. **Breach Shielding** passive cuts boss damage (up to 40%). One arena. Audio deferred.

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

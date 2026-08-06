# Get Your Ship Together

Isometric sci-fi action prototype evaluating **two** directions:

1. **Campaign** — manual combat vertical slice  
2. **Containment Protocol** — survivor/horde experiment  

## Quick start

```bash
npm install
npm run dev
```

Open the local URL (default `http://localhost:5173/`).

```bash
npm test
npm run build
npm run preview
```

## Mode selection

1. Select a hero.
2. **CONTINUE** → Campaign  
3. **CONTAINMENT PROTOCOL** → Survivor experiment  

## Containment Protocol controls

Defaults (fully remappable in **Pause → Settings**):

| Action | Default |
|---|---|
| Move | WASD |
| Repulsor Burst | **Q** (30s CD, large shockwave) |
| Afterburner (ship form) | **E** — dual thruster exhaust damages enemies **behind** the ship |
| Mech Overdrive | **R** (when charged) |
| Level-up choices | **1** / **2** / **3** or click |
| Pause | Esc → Resume / Settings / Restart / Crew Select |
| Mute | M (audio disabled in this slice) |

Bindings persist in `localStorage` under `gyst.settings.v1` (KeyboardEvent.code). Duplicate keys swap. HUD ability labels and help text follow custom binds.

**Energy** on the HUD is XP progress toward the next level (not a mana cost).

Repulsor is a major panic tool (~13.5 unit radius, strong knockback). Damage numbers are larger with pop/aggregation.

Single arena for this experiment. Audio, extra maps, and permanent meta-progression are deferred.

## Dev fixtures

### Campaign

- `/?fixture=combat&hero=bee`
- `/?fixture=boss&hero=frog`
- `/?fixture=mech&hero=flamingo`

### Survivor

- `/?mode=survivor&fixture=survivor-start&hero=bee`
- `/?mode=survivor&fixture=survivor-levelup&hero=red-panda`
- `/?mode=survivor&fixture=survivor-horde&hero=bee`
- `/?mode=survivor&fixture=survivor-mech&hero=flamingo`
- `/?mode=survivor&fixture=survivor-boss&hero=frog` (representative late-run build)
- `/?mode=survivor&fixture=survivor-repulsor&hero=bee`
- `/?mode=survivor&fixture=survivor-ship&hero=flamingo`
- `/?mode=survivor&fixture=survivor-damage&hero=frog`
- `/?mode=survivor&fixture=survivor-miniboss&hero=bee`

## Docs

- `GAME_CONCEPT.md` — dual-direction status
- `docs/VERTICAL_SLICE.md` — campaign slice
- `docs/SURVIVOR_MODE_VERTICAL_SLICE.md` — survivor experiment

## Stack

Vite · TypeScript · Three.js `0.180.0` · Vitest

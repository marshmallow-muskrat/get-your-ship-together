# GYST Vertical Slice

**Authoritative for the current prototype.**  
Supersedes the obsolete horde-survival `GAME_CONCEPT.md` content and endless-corridor experiments.

## Game promise

Select a crew member, fight through a short authored sci-fi facility, transform into a mech, defeat a multi-pattern boss, and recover a prototype ship part.

## Controls

| Action | Binding |
|---|---|
| Move | WASD / arrows |
| Aim | Mouse (world plane) |
| Primary fire | Left mouse / J |
| Dodge | Space |
| Hero ability | Q / 1 |
| Nanite Repair | E |
| Mech transform | R |
| Pause | Esc |
| Mute | M |

Primary fire is **manual** (press/hold at weapon cadence). There is no auto-fire.

## Runtime boundaries

```text
src/
  app/              AppController — exclusive screen ownership
  screens/          CrewSelectScreen (mount/dispose)
  game/
    GystRuntime.ts  single RAF loop, fixed 60 Hz sim, one renderer
    simulation/     pure state + step (testable)
    render/         camera, environment, actors, VFX
    assets/         AssetLibrary, skeleton-safe clone, anim helpers
    content/        heroes, enemies, tuning
    input/          keyboard + pointer
    ui/             HUD snapshot → DOM
    audio/          Web Audio synthesized SFX
```

- Simulation owns health, cooldowns, hits, encounter phase, form, boss patterns.
- Rendering never authorizes combat.
- Crew select and game never run two RAF loops or two WebGL renderers at once.

## Asset pipeline

| Layer | Path | Notes |
|---|---|---|
| Source packs | `assets/space-packs/` | Not published; hundreds of MB |
| Runtime subset | `public/runtime/` | Only models used by the slice |
| UI/static | `public/backgrounds`, `public/hero-cards` | Selection cosmetics |

Animated profiles live in `src/game/content/heroes.ts` and `enemies.ts` (scale, collider, muzzle, anim aliases).

**Follow-up:** convert selected Modular Sci-Fi OBJ pieces to optimized GLB; environment currently uses authored procedural geometry matching the layout (fast, no 688 MB publish).

## Vertical-slice content

- **Heroes:** Boswell, Fitzwilliam, Fortunato, Rutherford — unique abilities + mech upgrades.
- **Level:** crash site → approach → courtyard (2 waves) → boss arena → ship part.
- **Enemies:** GreenBlob (melee), Goleling (ranged/flying).
- **Boss:** BlueDemon — slam cone, radial pulse, charge line; phase 2 tempo + adds.
- **Reward:** glowing ship part → completion screen.

## Dev fixtures

| URL | Effect |
|---|---|
| `/?fixture=combat&hero=bee` | Courtyard combat |
| `/?fixture=boss&hero=frog` | Boss arena |
| `/?fixture=mech&hero=flamingo` | Start in mech |

## How to run

```bash
npm install
npm run dev
# open http://localhost:5173/

npm test
npm run typecheck
npm run build
npm run preview
```

## Deferred systems

XP, loot, equipment, skill trees, vendors, crafting, currencies, towns, co-op, accounts, cloud saves, full campaign, gamepad/touch polish, level editor.

## Known limitations

- Environment is **asset-driven** (Modular Sci-Fi OBJ + Space Kit GLTF under `public/runtime/env/`). Offline GLB conversion of modular pieces is a follow-up for smaller/faster loads.
- **Audio is disabled** (`AudioBus` is a no-op). Add real SFX later.
- Mech cooldown is slice-friendly (~8s) vs intended eventual ~60s.
- No gamepad/touch.
- Selection ships still load for presentation; combat preloads only selected hero pair + enemies/boss.

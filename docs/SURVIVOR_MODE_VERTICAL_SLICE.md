# Containment Protocol — Survivor Mode Vertical Slice

**Status:** Authorized experiment (owner-directed)  
**Mode name:** Containment Protocol  
**Branch intent:** `experiment/survivor-slice`

## Purpose

Answer whether a Vampire Survivors–style horde mode is more appealing for GYST than (or as a peer to) the campaign direction—using GYST heroes, mechs, Modular Sci-Fi, and Ultimate Monsters only.

This experiment may become the preferred primary mode. It must coexist with campaign without corrupting campaign architecture.

## Access

1. Select a hero on crew selection.
2. Choose **CAMPAIGN** or **CONTAINMENT PROTOCOL**.
3. Survive 8 minutes, level up, mech transform, defeat the boss.

Dev fixtures (examples):

- `?mode=survivor&fixture=survivor-start&hero=bee`
- `?mode=survivor&fixture=survivor-horde&hero=bee`
- `?mode=survivor&fixture=survivor-boss&hero=frog`
- `?mode=survivor&fixture=survivor-mech&hero=flamingo`
- `?mode=survivor&fixture=survivor-levelup&hero=red-panda`

## Design summary

| Pillar | Choice |
|---|---|
| Camera | Fixed orthographic, no follow/pan/zoom |
| Combat | Automatic weapons only |
| Arena | Reactor Platform 7 (~32 unit square) |
| Run | 8 minutes → boss |
| Progression | XP drops → 3-choice level-ups (run-only) |
| Mech | Kill-charged meter, R when full |
| Architecture | Isolated `SurvivorMode` — no campaign state bleed |

## Controls

| Action | Binding |
|---|---|
| Move | WASD / arrows (screen-relative) |
| Mech | R (when charged) |
| Pause | Esc |
| Mute | M |

No manual fire, aim, dodge, ability, or repair inputs.

## Architecture

```text
Shared: assets, heroes/forms, animation helpers, modular kit, audio bus
Campaign: GystRuntime + campaign simulation (unchanged ownership)
Survivor: src/game/modes/survivor/* — own state, sim, render, HUD
```

## Performance

Horde density is measured with fixtures. Target: playable density at 100–200 active enemies with skeletal animation + throttled mixers; cap from evidence.

## Deferred

Permanent meta-progression, shops, rarity, inventory, gamepad, campaign narrative in this mode.

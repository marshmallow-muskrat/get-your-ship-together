# Containment Protocol — Survivor Mode Vertical Slice

**Status:** Authorized experiment (owner-directed)  
**Mode name:** Containment Protocol  
**Branch intent:** `experiment/survivor-slice`

## Purpose

Answer whether a Vampire Survivors–style horde mode is more appealing for GYST than (or as a peer to) the campaign direction—using GYST heroes, mechs, ships, Modular Sci-Fi, and Ultimate Monsters only.

This experiment may become the preferred primary mode. It must coexist with campaign without corrupting campaign architecture.

## Access

1. Select a hero on crew selection.
2. Choose **CAMPAIGN** or **CONTAINMENT PROTOCOL**.
3. Survive 8 minutes, level up, use active abilities, defeat the midpoint warden and final boss.

### Dev fixtures

| Fixture | URL example |
|---|---|
| Start | `?mode=survivor&fixture=survivor-start&hero=bee` |
| Level-up | `?mode=survivor&fixture=survivor-levelup&hero=red-panda` |
| Dense horde | `?mode=survivor&fixture=survivor-horde&hero=bee` |
| Mech ready | `?mode=survivor&fixture=survivor-mech&hero=flamingo` |
| Late-run boss | `?mode=survivor&fixture=survivor-boss&hero=frog` |
| Repulsor QA | `?mode=survivor&fixture=survivor-repulsor&hero=bee` |
| Ship QA | `?mode=survivor&fixture=survivor-ship&hero=flamingo` |
| Damage numbers | `?mode=survivor&fixture=survivor-damage&hero=frog` |
| Miniboss @ 4:00 | `?mode=survivor&fixture=survivor-miniboss&hero=bee` |

## Design summary

| Pillar | Choice |
|---|---|
| Camera | Isometric orthographic follow (not top-down) |
| Combat | Automatic weapons + active Q / E / R |
| Arena | Reactor Platform 7 — single map, 64×64 |
| Run | 8 minutes → multi-phase boss |
| Midpoint | Containment Warden miniboss ~4:00 |
| Progression | XP drops → 3-choice level-ups (run-only). Energy bar = XP |
| Mech | Kill-charged meter, R when full (ultimate) |
| Architecture | Isolated `SurvivorMode` — no campaign state bleed |

## Controls

Defaults (remappable in Pause → Settings; stored as `gyst.settings.v1`):

| Action | Default binding |
|---|---|
| Move | WASD (screen-relative) |
| Repulsor Burst | Q |
| Afterburner (ship) | E |
| Mech Overdrive | R (when Mech Core full) |
| Level-up choices | 1 / 2 / 3 or click |
| Pause | Esc |
| Mute | M (wired; audio bus intentionally disabled) |

Internal bindings use `KeyboardEvent.code`. Conflicts swap. Escape cancels rebind capture (except when intentionally rebinding Pause). Settings open pauses the run; closing returns to the pause overlay.

## Active abilities

### Repulsor Burst
Major panic ability: **30s cooldown**, ~**13.5** world-unit radius, ~**12** unit normal knockback (elite/miniboss reduced). Mech amplifies radius/damage/push further. Dramatic multi-ring shockwave matches the true gameplay radius. Does not throw the final boss (brief stagger + internal boss CD). Arena-clamped.

### Afterburner
Temporary ship form using the selected hero’s real ship model. Fast steering, damage reduction, weapons offline. **Dual-engine thruster exhaust** continuously damages enemies **behind** the ship (tick CD ~0.24s); ground wake still deposits. Mutually exclusive with mech. Exhaust visuals clean up on form end, death, restart, dispose.

### Mech Overdrive
Kill-charged ultimate. HUD shows charge %, READY glow, then remaining duration while active.

## Weapons

Five families remain (Pulse, Microdrone, Rail, Gravity, Rocket). Frog’s starter is **Bio-Plasma Glob** (ranged toxic globs + splash + corrosive puddles). Gravity Pulse remains available in the upgrade pool.

## Difficulty director

Time-based `difficultyAt(t)` applies health/damage/speed multipliers **at spawn** and drives population targets + spawn rate. No rubber-banding off player DPS. Speed scaling caps ~1.10×.

## Bosses

- **Containment Warden** (~4:00): one-shot miniboss, telegraphed slam, large XP + repair/supply on death.
- **Final breach** (~8:00): ~7600 HP, three phases (100–65 / 65–35 / &lt;35) with tighter recovery, more projectiles/summons, visual phase transitions. Victory on death.

## Architecture

```text
Shared: assets, heroes/forms, animation helpers, modular kit, audio bus
Campaign: GystRuntime + campaign simulation (unchanged ownership)
Survivor: src/game/modes/survivor/* — own state, sim, render, HUD
```

Survivor player form is local: `astronaut | ship | mech` (does not alter campaign `PlayerForm`).

## Presentation notes

- Damage numbers: larger fonts, strong outline/shadow, scale pop, heavy/ability/kill variants; still aggregated and pooled.
- Pause overlay: Resume, Settings, Restart (confirm), Crew Select (confirm).

## Deferred

Audio/music, permanent meta-progression, shops, rarity, inventory, gamepad, mobile controls, additional maps, co-op.

# Containment Protocol — Endless High-Score Mode

**Status:** Authorized experiment (owner-directed)  
**Mode name:** Containment Protocol  
**Branch intent:** `experiment/survivor-slice`  
**Balance version:** `endless-1.1.0`

## Purpose

Survive an increasingly impossible containment breach for as long as possible — one arena, endless upward timer, bosses every two minutes, per-hero local leaderboards.

## Fantasy

> Survive an increasingly impossible containment breach for as long as possible.

## Access

1. Select a hero on crew selection.
2. Open **LEADERBOARDS** (optional) to view per-hero top-10 local records.
3. Choose **CONTAINMENT PROTOCOL**.
4. Survive until death. Score = survival time (independent ranking per hero).

### Dev fixtures

| Fixture | Purpose |
|---|---|
| `survivor-start` | Clean endless start |
| `survivor-levelup` | Level-up modal (50% larger cards) |
| `survivor-horde` | Dense late pressure |
| `survivor-mech` | Mech ready (strong ready glow) |
| `survivor-boss` | Just before first boss (~2:00) with mid-run build |
| `survivor-repulsor` | Large repulsor QA |
| `survivor-ship` | Afterburner / thrusters / ship pickup radius |
| `survivor-damage` | Damage numbers |
| `survivor-miniboss` | Legacy alias for ~4:00 boss window |

Example: `?mode=survivor&fixture=survivor-boss&hero=frog`

## Design summary

| Pillar | Choice |
|---|---|
| Camera | Isometric orthographic follow |
| Combat | Auto weapons + Dodge / Q / E / R |
| Arena | Single Reactor Platform 7 (64×64), no roof ventilation tiles |
| Run | **Endless** — timer counts **up** from 00:00 |
| End | **Death only** (no normal victory) |
| Score | Survival time; **per-hero** local top-10 |
| Bosses | Every **2 minutes**, **multi-model rotation**, red hostile aura, scale forever, up to 3 concurrent + breach stacks |
| Progression | Run-only XP upgrades; permanent power ceilings; temp consumables when exhausted |
| UI | UI Scale 75–150% (Settings), equal ability slots, enlarged top HUD |

## Controls (defaults — remappable)

| Action | Default |
|---|---|
| Move | WASD |
| **Dodge** | **Space** (10s CD, **13.5** world units ≈ 3× prior 4.5) |
| Repulsor Burst | Q (30s CD, ~18 unit radius) |
| Afterburner | E (ship + dual thruster exhaust; damage scales with permanent build) |
| Mech Overdrive | R (kill charge; strong ready animation) |
| Level-up | 1 / 2 / 3 or click |
| Pause | Esc → Resume / Settings / Leaderboards / Restart / Crew |

Bindings + UI Scale: `gyst.settings.v1` (`KeyboardEvent.code`, `uiScale` 0.75–1.5 step 0.05). HUD labels update live.

## Endless systems

### Survival timer
Authoritative sim time only while `phase === 'playing'`. Pause, level-up, and Settings do not advance time.

### Boss schedule
Boss index `n` at `t = n * 120` seconds. If 3 bosses already live, new schedules add **breach stacks** that empower living bosses and spawn when a slot frees — never silently dropped.

### Boss model rotation (`BOSS_DEFS`)
Data-driven set of **six** distinct Ultimate Monsters runtime assets:

| id | Display name | Role | Runtime path |
|---|---|---|---|
| `blue-demon` | Breach Demon | brute | `/runtime/boss/blue-demon.gltf` |
| `yeti` | Frost Warden | brute | `/runtime/boss/yeti.gltf` |
| `dino` | Containment Saurian | charger | `/runtime/boss/dino.gltf` |
| `demon` | Crimson Overseer | caster | `/runtime/boss/demon.gltf` |
| `dragon` | Void Drake | flyer | `/runtime/boss/dragon.gltf` |
| `mushroom-king` | Spore Sovereign | summoner | `/runtime/boss/mushroom-king.gltf` |

Rotation is deterministic by boss index (`bossDefForIndex`) and avoids immediate model repetition. Concurrent bosses can use different models. Scaling still follows boss index / elapsed difficulty.

### Boss aura
Every active boss has a red hostile aura: ground ring, soft fill, point light, rising particles. Intensity increases in phase 2/3. Cleaned up on death/dispose.

### Enemy scaling (`endlessDifficultyAt`)
```
m = t/60
health = 1 + 0.12m + 0.02*max(0,m-8)²
damage = 1 + 0.08m + 0.05*max(0,m-10)
speed  = min(1.30, 1 + 0.015m)
```

### Boss scaling (`bossDifficultyFor(n)`)
```
healthMul = 1.55^(n-1)
damageMul = 1.18^(n-1)
recovery  = max(0.45, 0.94^(n-1))
```
First boss base HP ≈ 2200.

### Ship-form Energy collection
While in Afterburner ship form, pickup uses per-hero `heroShips` dimensions (`pickupRadius`, `collectionRadius`, collider length/width). Magnet Field combines additively with ship base (no double-multiply). Astronaut values restore when ship ends. Repair/supply use the ship direct collider when overlapping.

### Thruster damage vs permanent power
```
playerPowerScale = min(cap, 1 + 0.12*weaponGrowth + 0.04*passiveGrowth)
cap = 6.0
thrusterDamage = base * thrusterPower(state)
```
Does **not** rubber-band with run time.

### Breach Shielding (passive)
8% boss-damage reduction per level, max **40%** at level 5. Applies only to damage tagged `source: 'boss'`. Ordinary enemy/ranged damage is unchanged.

### Local leaderboards
Storage key: **`gyst.survivor.leaderboards.v2`**

```
{
  version: 2,
  heroes: {
    bee: RunRecord[],
    flamingo: RunRecord[],
    frog: RunRecord[],
    "red-panda": RunRecord[]
  }
}
```

- Top **10** completed runs per hero  
- Sort: survival time ↓, then kills ↓, then bosses defeated ↓  
- Migrate from legacy `gyst.survivor.records.v1` bests  
- No abandoned runs; no duplicate run ids; balance version stamped  
- UI: crew select LEADERBOARDS, pause, and defeat flow  

## HUD

- Top: larger hero/level/kills/bosses text; larger survival timer; prominent CONTAINMENT BREACH / BOSS INBOUND  
- Bottom-center command deck: equal-size **Dodge · Q · E · R** (no empty trailing column)  
- Separate bottom-right **BUILD** panel  
- Level-up cards **50% larger** on desktop (responsive clamp at smaller viewports)  
- Mech ready: one-shot flourish + continuous strong glow/sparks while charged  
- **UI Scale** multiplies HUD/menus via `--ui-scale` with edge-aware transform origins (does not scale the Three.js canvas)

## Deferred

Audio, online leaderboards, accounts, permanent metagame, extra maps, gamepad, shops/currency, co-op.

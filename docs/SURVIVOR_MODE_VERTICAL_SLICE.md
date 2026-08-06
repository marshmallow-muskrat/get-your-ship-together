# Containment Protocol — Endless High-Score Mode

**Status:** Authorized experiment (owner-directed)  
**Mode name:** Containment Protocol  
**Branch intent:** `experiment/survivor-slice`

## Purpose

Survive an increasingly impossible containment breach for as long as possible — one arena, endless upward timer, bosses every two minutes, local high scores.

## Fantasy

> Survive an increasingly impossible containment breach for as long as possible.

## Access

1. Select a hero on crew selection.
2. Choose **CONTAINMENT PROTOCOL**.
3. Survive until death. Score = survival time.

### Dev fixtures

| Fixture | Purpose |
|---|---|
| `survivor-start` | Clean endless start |
| `survivor-levelup` | Level-up modal |
| `survivor-horde` | Dense late pressure |
| `survivor-mech` | Mech ready |
| `survivor-boss` | Just before first boss (~2:00) with mid-run build |
| `survivor-repulsor` | Large repulsor QA |
| `survivor-ship` | Afterburner / thrusters |
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
| Score | Survival time + local bests |
| Bosses | Every **2 minutes**, scale forever, up to 3 concurrent + breach stacks |
| Progression | Run-only XP upgrades; permanent power ceilings; temp consumables when exhausted |

## Controls (defaults — remappable)

| Action | Default |
|---|---|
| Move | WASD |
| **Dodge** | **Space** (10s CD) |
| Repulsor Burst | Q (30s CD, ~18 unit radius) |
| Afterburner | E (ship + dual thruster exhaust) |
| Mech Overdrive | R (kill charge) |
| Level-up | 1 / 2 / 3 or click |
| Pause | Esc → Resume / Settings / Restart / Crew |

Bindings: `gyst.settings.v1` (KeyboardEvent.code). HUD labels update live.

## Endless systems

### Survival timer
Authoritative sim time only while `phase === 'playing'`. Pause, level-up, and Settings do not advance time.

### Boss schedule
Boss index `n` at `t = n * 120` seconds. If 3 bosses already live, new schedules add **breach stacks** that empower living bosses and spawn when a slot frees — never silently dropped.

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

### Local records
`gyst.survivor.records.v1` — best overall/per-hero time, kills, level, bosses defeated, build snapshot. Recorded once on defeat.

## HUD

Bottom-center command deck: Integrity, Energy (XP), **Dodge · Q · E · R**.  
Separate bottom-right **BUILD** panel for weapons/passives/temps — does not reflow the command deck.  
Mech ready: one-shot flourish + toast when charge first reaches 100%.

## Deferred

Audio, online leaderboards, accounts, permanent metagame, extra maps, gamepad, co-op.

# Get Your Ship Together — Game Concept

**Status:** Selected product direction (authoritative)

Get Your Ship Together is a one-map, endless sci-fi survival game. Select one of four animal astronauts and survive an increasingly impossible containment breach for as long as possible.

**Containment Protocol is the game.** The former manual-combat campaign prototype is retired and is not a second mode, a peer experiment, or part of the product roadmap.

## Game promise

> Build an absurdly powerful astronaut, ship, and mech loadout while an endless containment breach escalates faster than you can.

Every run:

1. Select Boswell, Fitzwilliam, Fortunato, or Rutherford.
2. Enter Reactor Platform 7.
3. Move while automatic weapons attack the horde.
4. Collect Energy, level up, and choose a build.
5. Use Dodge, Repulsor Burst, Afterburner ship form, and Mech Overdrive to survive pressure that automatic attacks cannot solve alone.
6. Fight a rotating boss every two minutes.
7. Die when the breach finally outscales the build.
8. Chase a separate local survival record for that hero.

There is no normal victory state. Survival time is the primary score.

## Identity

- Four animal astronauts with hero-specific astronaut, ship, and mech models
- Bright Quaternius Space / Modular Sci-Fi / Monsters visual language
- One readable isometric arena that becomes progressively more hostile
- Automatic weapon builds plus four active survival tools
- Large monster hordes and a multi-model boss rotation
- Per-hero local leaderboards because heroes are not expected to be perfectly identical in balance
- Vite + TypeScript + Three.js static browser delivery

## Combat controls

Defaults are remappable:

| Action | Default |
|---|---|
| Move | WASD |
| Dodge | Space |
| Repulsor Burst | Q |
| Afterburner ship form | E |
| Mech Overdrive | R |
| Level-up choices | 1 / 2 / 3 or click |
| Pause / Settings | Escape |

## Endless progression direction

Weapon progression must remain legible and rewarding throughout an endless run:

- **Levels 1–5:** authored upgrades that change weapon behavior.
- **Level 6 onward:** repeatable Overclock levels. The normal displayed level continues as L6, L7, L8, and so on; “Overclock I/II/III” is secondary explanatory text.
- Repeatable weapon damage grows additively rather than compounding exponentially.
- Eligible passive upgrades continue with safe or diminishing returns.
- Fire rate, movement speed, area, projectile count, pickup reach, transformation duration, and damage reduction retain safety caps.
- Weapon slots remain limited so long runs do not converge on every weapon.
- Enemy and boss scaling continues faster than player scaling, guaranteeing eventual defeat without an arbitrary kill timer.

## Scope guardrails

Current product scope:

- One arena
- Endless upward timer
- Death-only ending
- Boss every two minutes
- Run-only progression
- Per-hero local leaderboards
- Keyboard and mouse browser play

Deferred unless the owner explicitly changes direction:

- Additional arenas
- Online leaderboards or accounts
- Permanent metagame progression
- Shops, currencies, inventory, or item rarity
- Co-op
- Backend services or cloud saves
- Gamepad and touch support
- Audio production

## Retired direction

The authored corridor campaign, manual primary fire, Nanite Repair campaign loop, ship-part recovery, and campaign completion screen are retired. They must not remain selectable or be described as an active game mode.

Implementation details and fixtures live in `docs/CONTAINMENT_PROTOCOL.md`.

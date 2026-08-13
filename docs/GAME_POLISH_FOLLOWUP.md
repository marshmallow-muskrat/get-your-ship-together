# Game polish follow-up

Implemented for `codex/game-polish-test-center` after the August 2026 Test Center pass.
This is a presentation and correctness pass on Containment Protocol; no campaign code,
new map, metagame system, or imported source-pack edit is included.

## Combat findings

- **Plasma Wake:** rebuilt as a depth-tested violet plasma sheath with braided cyan and
  magenta rails, moving knots, and a heat ramp. Its exact outer mesh remains the
  authoritative damaging capsule.
- **Gravity Well:** the old L5 selection could choose the same nearest target twice,
  stacking two wells. The simulation now scores threat-dense clusters and rejects
  overlapping secondary centers while preserving boss focus. Its authored 2.7–3.1
  radius was retained; the new event-horizon, accretion-disc, shard and collapse effect
  makes that boundary legible.
- **Cosmic Boomerang:** the former projectile travelled linearly out and back. It now
  follows a deterministic sine-bowed path, with opposite handedness for Twin Orbit,
  and retains one hit per body per leg. The renderer was replaced with a forged crescent,
  ion edge, partial energy ring and velocity-aligned ghost train. Final benchmark:
  3.72× L5/L1 with a 47% declared L5 breakpoint.
- **Cache signal:** ordinary lifetime increased from 38 to 45 seconds (+7 seconds),
  inside the requested 5–8 second range. Collection radius remains 3.25.
- **Repair supply:** paired eight-seed scenario benchmarks keep the drop rate near one
  ordinary orb per 40–42 kills with no death occurring while no orb was available.
  No production spawn-rate change was warranted.
- **Pulsar Core:** its radius is already 8 world units at every tier—two thirds of the
  12-unit camera half-span, not a small gameplay area. The generic pulse presentation
  was the problem. A dedicated full-boundary harmonic ring, star and spoke discharge
  now shows its real value; radius was not inflated.
- **Gunship Flyby:** existing simulation tests prove deterministic, non-zero corridor
  damage, ordinary/elite kills, miniboss damage, and bounded boss fractions. The missing
  feedback was presentation. The fixed-step fire interval now emits visible twin cannon
  tracers and muzzle pulses without adding a second damage path.
- **Singularity Engine:** changed from an instantaneous relocation/damage ping to a
  staged 1.3-second suction phase and collapse. Ordinary enemies pull at full strength,
  elites/minibosses resist, bosses hold position, and the final full-radius detonation
  deals the secondary damage once. Dedicated pull and collapse visuals use the same
  16-unit authoritative radius.

## Front end and records

Crew Select retains all four heroes and all three forms. It now places them inside a
procedural command-deck hangar with form plinths, a diagnostic ship portal, parallax
dust, stronger lighting, operative dossiers, and a single `CONTINUE / BEGIN RUN` action.
Independent hero leaderboards now open as full record rooms with operative identity,
personal best, career totals, podium treatment and a deliberate zero-run state. The
in-run leaderboard uses the same visual language.

## Audio provenance and mix

The game now ships a seamless 128-second stereo ambient score and intentionally no sound
effects. The score is project-owned and deterministically rendered by
`scripts/generateAudioAssets.mjs`; no third-party recording or `assets/space-packs/`
file is used. Runtime playback has one low-volume music voice and a persistent M-key mute.
Combat simulation never depends on the mixer.

## Verification evidence

- Generated baseline and candidate snapshots live in `docs/generated/baselines/`.
- `docs/WEAPON_BENCHMARK.md`, `docs/REPAIR_BENCHMARK.md`, and
  `docs/SURVIVAL_BENCHMARK.md` were regenerated from production simulation code.
- `scripts/effectQa.mjs` includes dedicated Gravity, Pulsar, Gunship, and Singularity
  scenes in addition to the existing changed-effect fixtures.

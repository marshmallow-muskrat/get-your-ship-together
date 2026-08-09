# Weapon / hero combat benchmark (endless-2.2.0)

Harness: `src/game/modes/survivor/survivorWeaponBenchmark.ts`  
Tests: `survivorWeaponBenchmark.test.ts`

## Method

Fixed seeds, 12s windows (14s for L1→L5 single-target progression), player invulnerable, spawns frozen, targets nearly stationary.

Scenarios:

1. **single-boss** — one durable target at mid range  
2. **sparse** — six spaced fodder  
3. **dense** — 40 packed fodder  
4. **mixed-elite** — sprinters + elite + bruiser  
5. **mobile-offaxis** — targets beside/behind facing  

Starter score = weighted damage across scenarios (single 22%, sparse 22%, dense 18%, mixed 20%, off-axis 18%).

## Starter results (representative)

| Hero | Weapon | Weighted | vs mean |
|---|---|---:|---:|
| Boswell | microdrone | ~1307 | ~1.00 |
| Fitzwilliam | rail | ~1170 | ~0.90 |
| Fortunato | bioplasma | ~1308 | ~1.01 |
| Rutherford | rocket | ~1420 | ~1.09 |

All within ±18% of mean (target ±15% with noise headroom). Identities preserved: rail leads dense pierce; rocket leads packs; bioplasma holds splash/puddle; microdrone leads reliability off-axis.

## Progression

L5 / L1 single-target ratio typically ~2.5–7× depending on projectile-count breakpoints. Overclock after L5 remains **+7% additive** damage per displayed level on L5 structure.

## Ordinary weapon L1 snapshot

| Weapon | L1 damage | Cadence | Count | Notes |
|---|---:|---:|---:|---|
| pulse | 16 | 0.30 | 1 | Fill weapon |
| microdrone | 48 | 1.28 | 3 | Homing starter |
| rail | 110 | 1.48 | 1 | Pierce starter |
| gravity | 44 | 2.25 | 1 | Area slow |
| rocket | 52 | 2.10 | 3 | Cluster delayed |
| bioplasma | 34 | 0.82 | 1 | Splash + puddle 4.5 |

Prototypes (arc @5:00, orbital @15:00) are balanced for unlock time, not time-zero starters.

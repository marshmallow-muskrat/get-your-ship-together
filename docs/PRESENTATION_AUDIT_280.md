# endless-2.8.0 presentation, geometry and combat-correctness audit

Companion to the endless-2.8.0 presentation pass. Records what was exercised, what was
found, and what was deliberately left alone.

Everything here is enforced by `src/game/modes/survivor/survivorPresentation280.test.ts`,
which drives the real fixed-step simulation and the real `SurvivorRenderer` rather than
re-deriving geometry in the test.

## The invariant

> A visible radius, a telegraph, a collision area and a damaging area that stand for the
> same gameplay boundary derive from the same effective value.

`survivorEffectGeometry.ts` states how a radius-bearing effect is drawn:

| Motion | Meaning | Drawn radius |
|---|---|---|
| `static` | A warning. The edge is an instruction. | `1.0` for the whole window |
| `expanding` | A blast travelling to its boundary. | opens small, ends at exactly `1.0` |
| `settling` | Residue that has already resolved. | `1.0`, relaxing slightly inward |
| `decorative` | Muzzle flashes, sparks. No boundary at all. | legacy ramp, unconstrained |

Nothing that means "dangerous" is ever drawn wider than the region that damages.

## Confirmed defects, fixed

### 1. Every un-special-cased ring drew to 1.9x its authored radius

`syncEffects` applied `0.5 + t * 1.4` to any radius-bearing effect it did not
special-case, so `pulse`, `impact` and radius-form `telegraph` opened at **half** the
authored radius and finished at **1.9x** it.

- A Pulsar Core discharge authored at radius `8.0` — the number Containment Field
  scales — was drawn sweeping out to `15.2`.
- The Containment Warden's Ground Slam telegraph passed through its true `4.2` radius
  exactly once, on the way to `8.0`.

### 2. Boss floor hazards were drawn inside the region that damaged

Contamination, Spore and Fissure pools were drawn at `0.85x` radius at spawn, easing to
`1.05x` at expiry, while `updateHazards` damages inside `radius + playerRadius`. For most
of the window a player standing visibly outside the pool was inside the damage.

Fixed to draw at exactly `h.radius`. An **arming** hazard now draws dimmer, because
`updateHazards` skips damage entirely while `armTimer > 0` — the visible dangerous window
has to be the damaging window.

### 3. The Ground Slam telegraphed one circle and detonated another

The Containment Warden advances at quarter speed through its `0.95s` windup and the
impact resolved against its *current* position, not the telegraphed one.

Measured on the pre-fix build:

```text
telegraph centre 2.988, 0.000
body at impact   3.688, 0.000
drift            0.700 units, on a 4.2 radius
player standing 0.6 units clear of the marked circle: 120 -> 73.2 integrity
```

The slam now commits its impact point at windup and detonates there. The body still
advances; it may no longer drag the impact with it. Same scenario post-fix: 120 -> 120.

### 4. The Cosmic Boomerang never spun

`syncProjectiles` assigns `rotation.y` from the velocity for every Group actor, and the
boomerang branch then did `rotation.y += spin`. The assignment ran first, every frame, so
the accumulated term never accumulated — the disc held a constant `0.23 rad` offset from
its heading. Only a rotationally symmetric mesh could hide it.

### 5. The upgrade shortcut overlapped the card copy

The keybind was absolutely positioned with `padding-bottom: 2.1rem` on
`.survivor-hud .sv-choice.sv-card` reserving space for it — three classes.
`.survivor-hud #sv-levelup .sv-choice { padding: 1.35rem 1.5rem }` carries an ID and
outranks it, so the reservation was discarded inside the level-up modal, which is the
only place these cards appear.

`scripts/cardQa.mjs` against the previous CSS:

```text
desktop-1920 @1.25  long-tradeoff: .sv-card-tradeoff overlaps the shortcut
desktop-1280 @1     long-passive:  .sv-card-stat overlaps the shortcut
laptop-1024  @0.75  acquire:       .sv-card-stat overlaps the shortcut
...at every viewport and every UI scale, including 100%
```

After: a four-region grid with a real footer row. Clearance 6.1-12.1px across
1920/1366/1280/1024 x 75/100/125/150%, zero overlaps.

### 6. Orbital Lance drew ground it never damaged

The core flash was authored at `er * 1.15` and the impact effect at `er * 1.4` — 15% and
40% of ground that took no damage. Both now resolve at exactly `er`.

## Audited and correct — no code change

### Boss ground-effect damage

All three damaging floor regions a boss can leave (`contamination`, `spore`, `fissure`),
driven through the real simulation and probed:

| Probe | Result |
|---|---|
| Centre | damages |
| Just inside the drawn edge | damages |
| At `radius + playerRadius - 0.05` | damages |
| At `radius + playerRadius + 0.05` | no damage |
| Well outside | no damage |
| While arming | no damage |
| After expiry | no damage, hazard already released |
| Repeat cadence over 2s | 4-6 ticks (0.45s authored), not 120 |
| During a dodge | no damage |
| During post-hit i-frames | no damage |
| Under Breach Shielding L5 | exactly `1 - 0.40` of baseline |

Tunnelling is not reachable: the simulation is a fixed 60Hz step and a player at maximum
invested speed covers `~0.139` units per step against a smallest authored hazard radius
of `1.1`.

The **damage** geometry was already correct. What was wrong was what the player was
shown, which is items 2 and 3 above.

### Containment Field and Weapon Overclock

Full matrix — base, field only, overclock only, both — driven per weapon:

| Weapon | Field scales | Verified |
|---|---|---|
| Pulsar Core | discharge radius | drawn ring is the damage radius; Echo Pulsar's second ring is a clean `0.82x` of the same effective value |
| Cosmic Boomerang | collision radius, decorative radius, turn distance | collision `= radius x field`; drawn `= 1.55x` collision; reach scales so a wider field also throws further |
| Plasma Wake | trail half-width | capsule half-width `= radius x widthMul x field`; lifetime is authored and does **not** move |
| Arc Conductor | chain reach | every chain jump inside the effective reach; the initial arc uses the separate 16-unit acquisition range by design |
| Orbital Lance | core radius | marker, telegraph, beam, core flash and scorch all at the core radius; only the shockwave shows the outer radius, because only it damages there |

Weapon Overclock buys cadence and **no** geometry: the drawn Pulsar ring is identical at
haste 0 and haste 5, and the volley interval shortens by exactly 27.5% at the L5 cap.

Both passives are authored at 5.5% per level and hard-capped at L5, so the widest either
reaches is `1.275x`.

## Deliberately not changed

- **Hazard damage expands the test point by `playerRadius`.** The visible edge is the
  hazard boundary and the player is a body of finite size, so touching the drawn edge is
  standing in it. This is the same convention boss attack entities use and it is fair;
  the defect was drawing the boundary in the wrong place, not testing against it.
- **The Ground Slam's flat `26 x 1.8` damage.** Still a horde-pressure question rather
  than a boss-fairness one, as recorded in `CONTAINMENT_PROTOCOL.md`. Only its geometry
  was corrected here.
- **Rocket Barrage and Microdrone Swarm have no transformative tier.** See the naming
  audit below. This is a finding about the authored tables, not something to paper over
  with a noun.

## Upgrade naming

Weapon names are stable across ordinary levels. A tier name is reserved for a level that
changes what the weapon *is*, and a test derives "transformative" from the tables
themselves — one projectile becoming two, or a new bounce or split — so a tier name
cannot be added without a mechanic behind it.

| Kept (earned) | Dropped (ordinary) |
|---|---|
| Twin Pulse, Twin Globs, Virulent Cascade, Twin Orbit, Twin Barrels, Twin Wake, Echo Pulsar, Lance Battery, Event Horizon, Judgment Array, Forked Conduction | Focused Pulse, Swarm Cadre, Hunter Wing, Hive Overdrive, Focused Lance, Wide Beam, Deep Well, Wide Arc, Deep Throw, Corrosive Glob, Accelerator Feed, Heavy Rounds, Hot Trail, Fusion Footprint, Charged Core, Nova Shell, Salvo, Cluster, Carpet Fire, Sustained Lance |

**Rocket Barrage** and **Microdrone Swarm** come out with no tier name at all. Both grow
purely by count — four rockets to six to seven, three drones to five — and adding a
rocket to a salvo is the same class of change as adding a drone to a formation. Neither
is a new mechanic. Two of the dropped names actively lied: rockets never split, so
nothing there was a cluster payload, and the pattern never becomes area saturation, so
nothing there was carpet fire.

## Arc Conductor L5

The one intentional balance change in this pass. Forked conduction replaces "one more
chain jump plus a decorative ring".

Measured against the unmodified acceptance bands:

| Metric | Old Arc Storm | Forked Conduction | Contract |
|---|---:|---:|---|
| L4 -> L5 effective gain | 0.493 | **0.440** | <= 0.52 (declared breakpoint) |
| L5/L1 intended-scenario ratio | 3.427 | **3.306** | 3.0-4.2 |
| Levels above typical ceiling | 1 | 1 | <= 1 |
| L1 mixed-horde DPS | 135.9 | 135.9 | >= 130 |
| Single-boss L4 -> L5 | +27.8% | +27.8% | must not regress |

Two knobs, both swept against the real benchmark:

- **`branchChainReduction: 2`** — each arm keeps a primary plus three jumps. Eight bodies
  per volley against the six one chain used to walk. Removing only one jump put ten in a
  volley and forced the per-hit rebase down to `0.60`, which turns a transformation into
  a lot of small numbers.
- **`damageMul: 0.72`** — applied only when a second arm actually fires. Against a lone
  boss there is no second target, so billing the split there would have made L5 a
  straight 8% damage loss against exactly the encounter a prototype is taken for.

At parity per hit the gain measured well past the ceiling. `PROGRESSION_BOUNDS` and
`BREAKPOINT_LEVEL` were not moved, and a test asserts their values so a later change
cannot quietly widen them to fit this.

## Effect QA, on the final candidate

`scripts/effectQa.mjs` against a local build of the deployed commit. Every fixture that
exercises an effect this pass changed, run until the effect is on screen, with the F3
renderer counters read at that moment.

```text
plasma-l1        errors=0   geo  41 · fx  4 · atk 0 · rail 0
plasma-ship      errors=0   geo  53 · fx  5 · atk 0 · rail 0
boomerang        errors=0   geo  32 · fx  1 · atk 0 · rail 0
orbital          errors=0   geo  79 · fx 16 · atk 0 · rail 0
arc              errors=0   geo 115 · fx 13 · atk 0 · rail 0
boss             errors=0   geo  36 · fx  4 · atk 0 · rail 0
miniboss         errors=0   geo  24 · fx  4 · atk 0 · rail 0
cleanup-combat   errors=0   geo  67 · fx  8 · atk 0 · rail 2
cleanup-arrival  errors=0   geo  39 · fx  4 · atk 0 · rail 0
levelup          errors=0   geo  21 · fx  1 · atk 0 · rail 0
stress           errors=0   geo 143 · fx 10 · atk 0 · rail 2

console/page errors: 0     RESULT: CLEAN
```

The worst case — the stress fixture at 91 living enemies, 7 projectiles and 39 pickups —
holds 143 geometries and 10 live effects. The new geometry is either shared (the
boomerang silhouette) or fixed at construction (eight ejecta shards per impact, four jet
meshes per ally), so none of it can grow with load.

### Observed and left for the playtest

At L1 the Plasma Wake trail is almost entirely hidden behind a horde standing on it.
That is the occlusion fix doing exactly what it was asked to do, and L1 is the authored
weakest tier — but it is also the shape of a brightness floor that is set too low. It is
asked as a direct question in the playtest checklist rather than guessed at here, because
raising a floor is cheap and does not touch the depth-test fix that earned it.

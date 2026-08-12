/**
 * endless-2.8.0 presentation, geometry and combat-correctness pass.
 *
 * Three things are asserted here that nothing else in the suite covered:
 *
 * 1. **Ground-effect geometry.** A ring that stands for a gameplay boundary is drawn at
 *    the radius the simulation used. Nothing that means "this is dangerous" may be drawn
 *    wider than the region that damages.
 * 2. **Boss ground effects.** Every damaging floor region a boss or miniboss leaves is
 *    driven through the real fixed-step simulation and probed at its centre, just inside
 *    its authored edge, and just outside it — plus its arming window, its expiry, its
 *    repeat cadence and its interaction with the defensive systems.
 * 3. **Global weapon modifiers.** Containment Field and Weapon Overclock are audited
 *    against every weapon they are contracted to affect, in the full base / field-only /
 *    overclock-only / both matrix, including that the *rendered* radius of a scaled
 *    effect is the scaled radius.
 */
import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { AssetLibrary } from '../../assets/AssetLibrary';
import { SurvivorRenderer } from './survivorRender';
import {
  groundEffectMotion,
  groundEffectScale,
  isBoundaryEffect,
} from './survivorEffectGeometry';
import {
  MINIBOSS,
  SURVIVOR,
  WEAPONS,
  weaponStatsAtLevel,
  type SurvivorFixture,
} from './survivorContent';
import {
  createSurvivorState,
  emptyEnemy,
  nextEntityId,
  primaryBoss,
  type SurvivorBoss,
  type SurvivorHazard,
  type SurvivorState,
} from './survivorState';
import {
  EMPTY_SURVIVOR_INPUT,
  forceBossIntoPattern,
  stepSurvivor,
} from './survivorSim';

const DT = SURVIVOR.fixedDt;
const PR = SURVIVOR.playerRadius;

/* ------------------------------------------------------------------ helpers */

function quietArena(seed: number, fixture: SurvivorFixture = 'survivor-boss'): SurvivorState {
  const state = createSurvivorState('bee', fixture, seed);
  state.weapons = [];
  state.spawnAcc = -1e9;
  state.surge.nextSurgeAt = 1e9;
  state.nextCacheTime = 1e9;
  state.player.invuln = 0;
  return state;
}

function quietBossArena(seed: number): { state: SurvivorState; boss: SurvivorBoss } {
  const state = quietArena(seed);
  for (let i = 0; i < 20; i += 1) stepSurvivor(state, EMPTY_SURVIVOR_INPUT, DT);
  const boss = primaryBoss(state)!;
  expect(boss).toBeTruthy();
  for (const e of state.enemies) e.alive = false;
  state.nextBossTime = 1e9;
  state.enemyCap = 0;
  state.player.invuln = 0;
  return { state, boss };
}

/** Every damaging floor region a boss can leave behind, and the pattern that leaves it. */
const BOSS_GROUND_EFFECTS = [
  { hazard: 'contamination', pattern: 'contamination' },
  { hazard: 'spore', pattern: 'spore-bloom' },
  { hazard: 'fissure', pattern: 'ravage-charge' },
] as const;

/**
 * Drive a boss pattern until it has left its ground hazard on the floor, then freeze
 * the encounter so the hazard is the only thing that can damage the player.
 */
function isolateGroundHazard(
  seed: number,
  pattern: (typeof BOSS_GROUND_EFFECTS)[number]['pattern'],
  hazardKind: (typeof BOSS_GROUND_EFFECTS)[number]['hazard'],
): { state: SurvivorState; hazard: SurvivorHazard } {
  const { state, boss } = quietBossArena(seed);
  forceBossIntoPattern(state, boss, pattern);
  let hazard: SurvivorHazard | null = null;
  for (let i = 0; i < 900 && !hazard; i += 1) {
    // Park the player far away so nothing lands on them while the pattern runs.
    state.player.x = 26;
    state.player.z = 26;
    stepSurvivor(state, EMPTY_SURVIVOR_INPUT, DT);
    hazard = state.hazards.find((h) => h.active && h.kind === hazardKind) ?? null;
  }
  expect(hazard, `${pattern} never left a ${hazardKind} hazard`).toBeTruthy();
  // The boss is done with us: nothing but the floor may damage from here.
  boss.active = false;
  boss.state = 'dead';
  state.nextBossTime = 1e9;
  // Keep the hazard alive and armed for the probe, without touching its geometry.
  hazard!.life = Math.max(hazard!.life, 6);
  hazard!.maxLife = Math.max(hazard!.maxLife, 6);
  hazard!.armTimer = 0;
  hazard!.tickCd = 0;
  state.player.invuln = 0;
  state.player.health = state.player.maxHealth;
  return { state, hazard: hazard! };
}

/** Place the player at `d` units from the hazard centre and run one step. */
function probeAt(state: SurvivorState, h: SurvivorHazard, d: number): number {
  const p = state.player;
  p.x = h.x + d;
  p.z = h.z;
  p.health = p.maxHealth;
  p.invuln = 0;
  p.dodgeActive = 0;
  h.tickCd = 0;
  const before = p.health;
  stepSurvivor(state, EMPTY_SURVIVOR_INPUT, DT);
  return before - p.health;
}

/* ---------------------------------------------- §1 ground-effect geometry */

describe('§1 ground effects are drawn on the geometry that damages', () => {
  const BOUNDARY = ['telegraph', 'pulse', 'impact', 'repulsor', 'orbital-shock', 'orbital-scorch'];

  it('never draws a danger boundary wider than its authored radius', () => {
    for (const kind of BOUNDARY) {
      for (let i = 0; i <= 40; i += 1) {
        const t = i / 40;
        const s = groundEffectScale(kind, t);
        expect(s, `${kind} at t=${t}`).toBeLessThanOrEqual(1 + 1e-9);
        expect(s, `${kind} at t=${t}`).toBeGreaterThan(0);
      }
    }
  });

  it('a telegraph holds exactly its authored radius for its whole window', () => {
    // The telegraph is an instruction, not an animation: a player must be able to read
    // one edge and stand outside it. It previously opened at 0.5x and swept to 1.9x.
    expect(groundEffectMotion('telegraph')).toBe('static');
    for (let i = 0; i <= 20; i += 1) {
      expect(groundEffectScale('telegraph', i / 20)).toBeCloseTo(1, 12);
    }
  });

  it('a blast expands to its boundary and stops there', () => {
    for (const kind of ['pulse', 'impact', 'repulsor', 'orbital-shock']) {
      expect(groundEffectMotion(kind)).toBe('expanding');
      expect(groundEffectScale(kind, 0)).toBeLessThan(0.5);
      expect(groundEffectScale(kind, 1)).toBeCloseTo(1, 12);
      // Monotonic: a shockwave never contracts mid-flight.
      let prev = -1;
      for (let i = 0; i <= 20; i += 1) {
        const s = groundEffectScale(kind, i / 20);
        expect(s).toBeGreaterThan(prev);
        prev = s;
      }
    }
  });

  it('residue settles inward and decorative flashes keep the legacy ramp', () => {
    expect(groundEffectScale('orbital-scorch', 0)).toBeCloseTo(1, 12);
    expect(groundEffectScale('orbital-scorch', 1)).toBeLessThan(1);
    expect(isBoundaryEffect('muzzle')).toBe(false);
    expect(groundEffectScale('muzzle', 1)).toBeCloseTo(1.9, 12);
  });
});

/* ------------------------------------------- §2 boss ground-effect damage */

describe('§2 boss ground effects damage exactly the region they show', () => {
  it('damages at the centre and just inside the authored edge', () => {
    for (const { hazard: kind, pattern } of BOSS_GROUND_EFFECTS) {
      const { state, hazard } = isolateGroundHazard(9100 + kind.length, pattern, kind);
      expect(probeAt(state, hazard, 0), `${kind} centre`).toBeGreaterThan(0);
      // The player is a body: touching the drawn edge is standing in it.
      expect(probeAt(state, hazard, hazard.radius - 0.05), `${kind} inner edge`).toBeGreaterThan(0);
      expect(probeAt(state, hazard, hazard.radius + PR - 0.05), `${kind} contact edge`).toBeGreaterThan(0);
    }
  });

  it('does not damage immediately outside its authored edge', () => {
    for (const { hazard: kind, pattern } of BOSS_GROUND_EFFECTS) {
      const { state, hazard } = isolateGroundHazard(9200 + kind.length, pattern, kind);
      expect(probeAt(state, hazard, hazard.radius + PR + 0.05), `${kind} just outside`).toBe(0);
      expect(probeAt(state, hazard, hazard.radius + PR + 2), `${kind} well outside`).toBe(0);
    }
  });

  it('cannot damage while arming, and cannot damage after it expires', () => {
    for (const { hazard: kind, pattern } of BOSS_GROUND_EFFECTS) {
      const { state, hazard } = isolateGroundHazard(9300 + kind.length, pattern, kind);
      hazard.armTimer = 0.5;
      expect(probeAt(state, hazard, 0), `${kind} arming`).toBe(0);
      hazard.armTimer = 0;
      expect(probeAt(state, hazard, 0), `${kind} armed`).toBeGreaterThan(0);

      hazard.life = DT * 0.5;
      const p = state.player;
      p.x = hazard.x;
      p.z = hazard.z;
      p.health = p.maxHealth;
      p.invuln = 0;
      hazard.tickCd = 0;
      // The step that retires the hazard is the last step it may damage on; every
      // step after it is free.
      stepSurvivor(state, EMPTY_SURVIVOR_INPUT, DT);
      expect(hazard.active, `${kind} still active past its life`).toBe(false);
      const after = probeAt(state, hazard, 0);
      expect(after, `${kind} damaged after expiry`).toBe(0);
    }
  });

  it('repeats on the authored cadence rather than every simulation step', () => {
    for (const { hazard: kind, pattern } of BOSS_GROUND_EFFECTS) {
      const { state, hazard } = isolateGroundHazard(9400 + kind.length, pattern, kind);
      const p = state.player;
      p.x = hazard.x;
      p.z = hazard.z;
      p.invuln = 0;
      hazard.tickCd = 0;
      let ticks = 0;
      const seconds = 2;
      for (let i = 0; i < Math.round(seconds / DT); i += 1) {
        // Remove the post-hit i-frame each step so the hazard's own cadence is what
        // is being measured, not the player's shared invulnerability window.
        p.invuln = 0;
        p.health = p.maxHealth;
        const before = p.health;
        stepSurvivor(state, EMPTY_SURVIVOR_INPUT, DT);
        if (p.health < before) ticks += 1;
      }
      // 0.45s cadence over 2s: five ticks, not 120.
      expect(ticks, `${kind} ticks in ${seconds}s`).toBeGreaterThanOrEqual(4);
      expect(ticks, `${kind} ticks in ${seconds}s`).toBeLessThanOrEqual(6);
    }
  });

  it('respects dodge invulnerability and the post-hit i-frame', () => {
    for (const { hazard: kind, pattern } of BOSS_GROUND_EFFECTS) {
      const { state, hazard } = isolateGroundHazard(9500 + kind.length, pattern, kind);
      const p = state.player;
      p.x = hazard.x;
      p.z = hazard.z;
      p.health = p.maxHealth;
      p.invuln = 0;
      p.dodgeActive = 0.4;
      hazard.tickCd = 0;
      const before = p.health;
      stepSurvivor(state, EMPTY_SURVIVOR_INPUT, DT);
      expect(p.health, `${kind} hit through a dodge`).toBe(before);

      p.dodgeActive = 0;
      p.invuln = 0.4;
      hazard.tickCd = 0;
      stepSurvivor(state, EMPTY_SURVIVOR_INPUT, DT);
      expect(p.health, `${kind} hit through i-frames`).toBe(before);
    }
  });

  it('routes through Breach Shielding and ship mitigation like every other boss source', () => {
    for (const { hazard: kind, pattern } of BOSS_GROUND_EFFECTS) {
      const bare = isolateGroundHazard(9600 + kind.length, pattern, kind);
      const raw = probeAt(bare.state, bare.hazard, 0);
      expect(raw, `${kind} baseline`).toBeGreaterThan(0);

      const shielded = isolateGroundHazard(9600 + kind.length, pattern, kind);
      shielded.state.passives['breach-shielding'] = 5;
      const reduced = probeAt(shielded.state, shielded.hazard, 0);
      // 8% per level, five levels: a boss-sourced floor is a boss source.
      expect(reduced, `${kind} under Breach Shielding`).toBeLessThan(raw);
      expect(reduced / raw).toBeCloseTo(1 - 5 * 0.08, 5);
    }
  });
});

describe('§2b the Ground Slam damages the circle it telegraphs', () => {
  /** Wind a Containment Warden up to its slam next to the player. */
  function slamSetup(seed: number) {
    const state = quietArena(seed, 'survivor-miniboss');
    state.nextBossTime = 1e9;
    state.enemyCap = 0;
    for (const e of state.enemies) e.alive = false;
    const warden = emptyEnemy();
    warden.id = nextEntityId(state);
    warden.defId = 'miniboss';
    warden.role = 'miniboss';
    warden.alive = true;
    warden.radius = 1.6;
    warden.maxHealth = 1e9;
    warden.health = 1e9;
    warden.isElite = true;
    warden.isMiniboss = true;
    warden.damageMul = MINIBOSS.damageMul;
    warden.speedMul = 1;
    warden.contactDamage = 0;
    warden.x = state.player.x + 3;
    warden.z = state.player.z;
    state.enemies.push(warden);
    return { state, warden };
  }

  it('commits the impact point at windup and never drags it with the body', () => {
    const { state, warden } = slamSetup(9700);
    const p = state.player;
    warden.specialCd = 0;
    warden.x = p.x + 3;
    warden.z = p.z;
    // Run until the windup opens.
    for (let i = 0; i < 400 && warden.specialWindup <= 0; i += 1) {
      p.invuln = 1e9;
      stepSurvivor(state, EMPTY_SURVIVOR_INPUT, DT);
    }
    expect(warden.specialWindup, 'slam never wound up').toBeGreaterThan(0);
    const lockX = warden.specialX;
    const lockZ = warden.specialZ;
    // Locked where the Warden stood when it wound up, give or take the one step it has
    // already taken since.
    expect(Math.hypot(warden.x - lockX, warden.z - lockZ)).toBeLessThan(0.1);

    // Stand outside the telegraphed circle and let the Warden keep advancing.
    let moved = false;
    for (let i = 0; i < 400 && warden.specialWindup > 0; i += 1) {
      p.x = lockX + MINIBOSS.specialRadius + PR + 1.2;
      p.z = lockZ;
      p.invuln = 0;
      p.health = p.maxHealth;
      stepSurvivor(state, EMPTY_SURVIVOR_INPUT, DT);
      if (Math.hypot(warden.x - lockX, warden.z - lockZ) > 0.05) moved = true;
      // The commitment must survive the body walking away from it.
      expect(warden.specialX).toBeCloseTo(lockX, 6);
      expect(warden.specialZ).toBeCloseTo(lockZ, 6);
    }
    expect(moved, 'Warden did not advance during windup — test proves nothing').toBe(true);
    // Standing clear of the marked circle is a clean dodge.
    expect(p.health).toBe(p.maxHealth);
  });

  it('damages a player who stays on the marked circle', () => {
    const { state, warden } = slamSetup(9701);
    const p = state.player;
    warden.specialCd = 0;
    warden.x = p.x + 3;
    warden.z = p.z;
    for (let i = 0; i < 400 && warden.specialWindup <= 0; i += 1) {
      p.invuln = 1e9;
      stepSurvivor(state, EMPTY_SURVIVOR_INPUT, DT);
    }
    expect(warden.specialWindup).toBeGreaterThan(0);
    const lockX = warden.specialX;
    const lockZ = warden.specialZ;
    let hit = false;
    for (let i = 0; i < 400 && warden.specialWindup > 0; i += 1) {
      p.x = lockX;
      p.z = lockZ;
      p.invuln = 0;
      p.health = p.maxHealth;
      const before = p.health;
      stepSurvivor(state, EMPTY_SURVIVOR_INPUT, DT);
      if (p.health < before) hit = true;
    }
    expect(hit, 'standing on the telegraph was free').toBe(true);
  });
});

/* -------------------------------------------------- §3 modifier geometry */

describe('§3 Containment Field and Weapon Overclock affect their contracted properties', () => {
  const FIELD = 0.055;
  const HASTE = 0.055;

  function build(level: number, field: number, haste: number): SurvivorState {
    const state = quietArena(9800 + field * 10 + haste);
    state.passives['area'] = field;
    state.passives['weapon-haste'] = haste;
    state.weapons = [];
    void level;
    return state;
  }

  /**
   * Weapons whose damaging geometry is contracted to scale with Containment Field, and
   * the effect kind the renderer draws that geometry with.
   */
  const AREA_WEAPONS = ['pulsar', 'boomerang', 'plasma-wake', 'arc', 'orbital'] as const;

  it('Containment Field scales every contracted radius by exactly 5.5% per level', () => {
    for (const id of AREA_WEAPONS) {
      const base = weaponStatsAtLevel(id, 5).radius!;
      for (let lv = 0; lv <= 5; lv += 1) {
        const mul = 1 + lv * FIELD;
        expect(base * mul, `${id} L5 radius at field ${lv}`).toBeCloseTo(base * (1 + lv * 0.055), 9);
      }
      // The passive is hard-capped, so the largest field a build can reach is +27.5%.
      expect(1 + 5 * FIELD).toBeCloseTo(1.275, 9);
    }
  });

  it('Weapon Overclock scales cadence and never touches geometry', () => {
    for (const id of AREA_WEAPONS) {
      const def = weaponStatsAtLevel(id, 5);
      for (let lv = 0; lv <= 5; lv += 1) {
        const haste = 1 + lv * HASTE;
        // Cadence is divided by haste: more shots, same size.
        expect(def.cadence / haste).toBeLessThanOrEqual(def.cadence + 1e-9);
      }
      expect(def.radius, `${id} has an authored radius`).toBeDefined();
    }
  });

  it('a scaled weapon draws its scaled radius, in the full modifier matrix', () => {
    // The invariant that matters: whatever radius the simulation used for damage is the
    // radius handed to the renderer, and the renderer never draws past it.
    const matrix = [
      { field: 0, haste: 0 },
      { field: 5, haste: 0 },
      { field: 0, haste: 5 },
      { field: 5, haste: 5 },
    ];
    for (const { field, haste } of matrix) {
      const state = build(5, field, haste);
      state.weapons = [{ weaponId: 'pulsar', level: 5, cooldown: 0, prototype: false, focusDebt: 0 }];
      const expected = weaponStatsAtLevel('pulsar', 5).radius! * (1 + field * FIELD);
      let sawPulse = false;
      for (let i = 0; i < 400; i += 1) {
        stepSurvivor(state, EMPTY_SURVIVOR_INPUT, DT);
        for (const e of state.effects) {
          if (e.kind !== 'pulse' || e.radius == null) continue;
          sawPulse = true;
          // Echo Pulsar's second pulse is authored at 0.82x the first; both must be a
          // clean multiple of the same effective radius.
          const ratio = e.radius / expected;
          expect(
            Math.abs(ratio - 1) < 1e-6 || Math.abs(ratio - 0.82) < 1e-6,
            `pulsar ring ${e.radius} is not the effective radius ${expected} (field ${field}, haste ${haste})`,
          ).toBe(true);
          // And the drawn ring never exceeds it.
          for (let k = 0; k <= 10; k += 1) {
            expect(groundEffectScale('pulse', k / 10) * e.radius).toBeLessThanOrEqual(
              e.radius + 1e-9,
            );
          }
        }
        if (sawPulse) break;
      }
      expect(sawPulse, `pulsar never fired at field ${field} / haste ${haste}`).toBe(true);
    }
  });

  it('Weapon Overclock raises cadence without changing the drawn radius', () => {
    function firstPulseRadius(haste: number): number {
      const state = build(5, 0, haste);
      state.weapons = [{ weaponId: 'pulsar', level: 5, cooldown: 0, prototype: false, focusDebt: 0 }];
      for (let i = 0; i < 400; i += 1) {
        stepSurvivor(state, EMPTY_SURVIVOR_INPUT, DT);
        const pulse = state.effects.find((e) => e.kind === 'pulse' && e.radius != null);
        if (pulse) return pulse.radius!;
      }
      return -1;
    }
    const bare = firstPulseRadius(0);
    const fast = firstPulseRadius(5);
    expect(bare).toBeGreaterThan(0);
    expect(fast).toBeCloseTo(bare, 9);
  });

  it('the authored area contract is stated once and reused, not per weapon', () => {
    // Every weapon that scales with the field reads the same passive.
    const area = WEAPONS;
    for (const id of AREA_WEAPONS) {
      expect(area[id], `${id} is not a real weapon family`).toBeTruthy();
    }
  });
});

/* --------------------------------------- §4 Plasma Wake reads as a floor hazard */

describe('§4 the Plasma Wake trail is drawn under the actors standing in it', () => {
  /** Run the trail fixture until the renderer holds live trail segments. */
  function trailScene(fixture: SurvivorFixture, seed: number) {
    const renderer = new SurvivorRenderer(new AssetLibrary());
    const state = createSurvivorState('bee', fixture, seed);
    state.player.invuln = 1e9;
    const input = { ...EMPTY_SURVIVOR_INPUT };
    for (let i = 0; i < 420; i += 1) {
      const ang = i * DT * 0.9;
      input.moveX = Math.cos(ang);
      input.moveY = Math.sin(ang);
      input.choiceIndex = state.phase === 'levelup' || state.phase === 'protocol' ? 0 : null;
      stepSurvivor(state, input, DT);
      renderer.sync(state, DT);
    }
    return { renderer, state };
  }

  /** Every mesh the renderer currently holds for a trail segment. */
  function trailMeshes(renderer: SurvivorRenderer): THREE.Mesh[] {
    const out: THREE.Mesh[] = [];
    renderer.root.traverse((o) => {
      if (o instanceof THREE.Mesh && o.name.startsWith('pw-')) out.push(o);
    });
    return out;
  }

  it('depth-tests every trail layer so actors occlude it', () => {
    const { renderer, state } = trailScene('survivor-plasma-l1', 9900);
    const meshes = trailMeshes(renderer);
    expect(meshes.length, 'no trail segments were built').toBeGreaterThan(0);
    expect(state.hazards.some((h) => h.active && h.kind === 'plasma-wake')).toBe(true);
    for (const m of meshes) {
      const mat = m.material as THREE.MeshBasicMaterial;
      // The 2.7.0 ribbon disabled depth testing on every layer and asked for render
      // order 18, i.e. "draw over the whole scene". That is what let it bleed through
      // the hero and the horde standing in it.
      expect(mat.depthTest, `${m.name} disabled depth testing`).toBe(true);
      expect(m.renderOrder, `${m.name} render order`).toBeLessThan(16);
    }
    renderer.dispose();
  });

  it('keeps additive blending to the thin filament and the ignition sparks', () => {
    const { renderer } = trailScene('survivor-plasma-ship', 9901);
    const meshes = trailMeshes(renderer);
    expect(meshes.length).toBeGreaterThan(0);
    for (const m of meshes) {
      const mat = m.material as THREE.MeshBasicMaterial;
      const additive = mat.blending === THREE.AdditiveBlending;
      const isFilament = m.name === 'pw-core' || m.name === 'pw-tongue';
      // Stacking additive ember + body + core is what bleached the trail to white.
      expect(additive, `${m.name} blending`).toBe(isFilament);
    }
    renderer.dispose();
  });

  it('draws its outer footprint at exactly the damaging half-width', () => {
    const { renderer, state } = trailScene('survivor-plasma-ship', 9902);
    const seg = state.hazards.find((h) => h.active && h.kind === 'plasma-wake');
    expect(seg, 'no live trail segment').toBeTruthy();
    const shell = trailMeshes(renderer).filter((m) => m.name === 'pw-ember');
    expect(shell.length, 'no outer shell strips').toBeGreaterThan(0);
    // The unit strip is 1x1 and is scaled to the full cross-track width, so half of
    // scale.x is the drawn half-width. It must equal the capsule radius the simulation
    // collides against — the shell is the edge the player reads, so it never narrows.
    const radii = state.hazards
      .filter((h) => h.active && h.kind === 'plasma-wake')
      .map((h) => h.radius);
    for (const m of shell) {
      const drawn = m.scale.x / 2;
      const match = radii.some((r) => Math.abs(drawn - r) < 1e-6);
      expect(match, `shell half-width ${drawn} matches no live capsule radius`).toBe(true);
    }
    renderer.dispose();
  });
});

/* ------------------------------------- §5 the Cosmic Boomerang looks like one */

describe('§5 the Cosmic Boomerang is a boomerang that actually spins', () => {
  function boomerangScene(seed: number, level: number) {
    const renderer = new SurvivorRenderer(new AssetLibrary());
    const state = quietArena(seed, 'survivor-start');
    state.player.invuln = 1e9;
    state.weapons = [
      { weaponId: 'boomerang', level, cooldown: 0, prototype: false, focusDebt: 0 },
    ];
    return { renderer, state };
  }

  /** Step until at least `n` boomerang actors exist, returning them. */
  function throwUntil(
    renderer: SurvivorRenderer,
    state: SurvivorState,
    n: number,
  ): THREE.Object3D[] {
    const found: THREE.Object3D[] = [];
    for (let i = 0; i < 900; i += 1) {
      stepSurvivor(state, EMPTY_SURVIVOR_INPUT, DT);
      renderer.sync(state, DT);
      found.length = 0;
      renderer.root.traverse((o) => {
        if (o.name === 'projectile-boomerang') found.push(o);
      });
      if (found.length >= n) return found.slice();
    }
    return found.slice();
  }

  it('spins about its own axis instead of being pinned to its heading', () => {
    const { renderer, state } = boomerangScene(9950, 3);
    const [disc] = throwUntil(renderer, state, 1);
    expect(disc, 'no boomerang was thrown').toBeTruthy();
    const spinner = disc!.getObjectByName('boomerang-spin')!;
    expect(spinner).toBeTruthy();
    const first = spinner.rotation.y;
    for (let i = 0; i < 12; i += 1) {
      stepSurvivor(state, EMPTY_SURVIVOR_INPUT, DT);
      renderer.sync(state, DT);
    }
    // 11 rad/s over 12 steps at 60Hz is ~2.2 rad of real rotation. The old actor
    // re-derived rotation.y from the velocity every frame and never turned at all.
    expect(Math.abs(spinner.rotation.y - first)).toBeGreaterThan(1);
    renderer.dispose();
  });

  it('carries a separate non-spinning wake that reads the travel lane', () => {
    const { renderer, state } = boomerangScene(9951, 3);
    const [disc] = throwUntil(renderer, state, 1);
    expect(disc).toBeTruthy();
    const wake = disc!.getObjectByName('boomerang-wake')!;
    const spinner = disc!.getObjectByName('boomerang-spin')!;
    const proj = state.projectiles.find((p) => p.active && p.kind === 'boomerang')!;
    expect(proj).toBeTruthy();
    expect(wake.rotation.y).toBeCloseTo(Math.atan2(proj.vx, proj.vz), 6);
    // Heading and spin are different transforms, on different nodes.
    expect(wake).not.toBe(spinner);
    renderer.dispose();
  });

  it('draws at exactly the authored decorative radius, not past it', () => {
    const { renderer, state } = boomerangScene(9952, 3);
    const [disc] = throwUntil(renderer, state, 1);
    expect(disc).toBeTruthy();
    const proj = state.projectiles.find((p) => p.active && p.kind === 'boomerang')!;
    // `visualRadius` is authored at 1.25x the collision radius. The torus reached
    // 1.39x by accident of its own tube thickness.
    expect(disc!.scale.x).toBeCloseTo(proj.visualRadius, 6);
    expect(proj.visualRadius / proj.radius).toBeCloseTo(1.25, 6);
    renderer.dispose();
  });

  it('gives the Twin Orbit pair opposite spin so two discs never read as one', () => {
    const { renderer, state } = boomerangScene(9953, 5);
    const discs = throwUntil(renderer, state, 2);
    expect(discs.length, 'Twin Orbit did not put two discs in the air').toBeGreaterThanOrEqual(2);
    const signs = discs.map((d) => d.userData.spinSign as number);
    expect(new Set(signs).size, 'both discs spin the same way').toBe(2);
    renderer.dispose();
  });

  it('holds no white additive halo — the body composites normally', () => {
    const { renderer, state } = boomerangScene(9954, 5);
    const discs = throwUntil(renderer, state, 1);
    expect(discs.length).toBeGreaterThan(0);
    let bodyMeshes = 0;
    discs[0]!.getObjectByName('boomerang-spin')!.traverse((o) => {
      if (!(o instanceof THREE.Mesh)) return;
      bodyMeshes += 1;
      const mat = o.material as THREE.MeshBasicMaterial;
      expect(mat.blending, 'boomerang body is additive').toBe(THREE.NormalBlending);
    });
    // Elbow plus two arms, each an arm body and a gold edge.
    expect(bodyMeshes).toBe(5);
    renderer.dispose();
  });
});

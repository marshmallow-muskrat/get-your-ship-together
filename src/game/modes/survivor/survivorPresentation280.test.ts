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
import cssSource from '../../../styles/app.css?raw';
import hudSource from './survivorHud.ts?raw';
import { AssetLibrary } from '../../assets/AssetLibrary';
import { SurvivorArena } from './survivorArena';
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
  type WeaponId,
} from './survivorContent';
import { newWeaponCard, weaponUpgradeCard } from './survivorUpgradeCards';
import {
  createSurvivorState,
  emptyEnemy,
  nextEntityId,
  primaryBoss,
  type SurvivorBoss,
  type SurvivorHazard,
  type SurvivorState,
} from './survivorState';

describe('§0 station wayfinding never hides gameplay signals', () => {
  it('keeps every generated marking out of the depth buffer', () => {
    const arena = new SurvivorArena();
    // Build only the synchronous generated decal layer. Imported kit art is irrelevant
    // to this contract and deliberately remains unloaded in the unit test.
    (arena as unknown as { addWayfinding(): void }).addWayfinding();
    const markings: THREE.Mesh[] = [];
    arena.root.traverse((object) => {
      if (object instanceof THREE.Mesh) markings.push(object);
    });
    expect(markings.length, 'the station built no wayfinding markings').toBeGreaterThan(0);
    for (const marking of markings) {
      const materials = Array.isArray(marking.material) ? marking.material : [marking.material];
      for (const material of materials) {
        expect(material.depthWrite, `${marking.name || marking.type} writes depth`).toBe(false);
      }
    }
    arena.dispose();
  });

});
import {
  EMPTY_SURVIVOR_INPUT,
  forceBossIntoPattern,
  forceStartProtocol,
  stepSurvivor,
} from './survivorSim';
import {
  BREAKPOINT_LEVEL,
  PROGRESSION_BOUNDS,
  levelGains,
  levelProgressionRatio,
  runWeaponBenchmark,
} from './survivorWeaponBenchmark';

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

describe('§3 Containment Field and Weapon Overclock, audited weapon by weapon', () => {
  const FIELD_PER_LEVEL = 0.055;
  const HASTE_PER_LEVEL = 0.055;
  /** base / field only / overclock only / both. */
  const MATRIX = [
    { field: 0, haste: 0 },
    { field: 5, haste: 0 },
    { field: 0, haste: 5 },
    { field: 5, haste: 5 },
  ] as const;

  function armed(
    weaponId: WeaponId,
    level: number,
    field: number,
    haste: number,
    fixture: SurvivorFixture = 'survivor-start',
  ): SurvivorState {
    const state = quietArena(9800 + weaponId.length * 7 + field * 3 + haste, fixture);
    state.player.invuln = 1e9;
    state.passives['area'] = field;
    state.passives['weapon-haste'] = haste;
    state.weapons = [
      {
        weaponId,
        level,
        cooldown: 0,
        prototype: WEAPONS[weaponId].prototype === true,
        focusDebt: 0,
      },
    ];
    return state;
  }

  /** The effective radius a weapon should be using at this field level. */
  function effectiveRadius(weaponId: WeaponId, level: number, field: number): number {
    return weaponStatsAtLevel(weaponId, level).radius! * (1 + field * FIELD_PER_LEVEL);
  }

  it('states the contract once: 5.5% per level, hard-capped at L5', () => {
    // Both passives are authored on the same per-level step and both cap at 5, so the
    // widest either can ever be is +27.5%. Nothing below may exceed that.
    expect(1 + 5 * FIELD_PER_LEVEL).toBeCloseTo(1.275, 9);
    expect(1 + 5 * HASTE_PER_LEVEL).toBeCloseTo(1.275, 9);
  });

  it('Pulsar Core: the discharge ring is the damage radius, at every field level', () => {
    for (const { field, haste } of MATRIX) {
      const state = armed('pulsar', 5, field, haste);
      const want = effectiveRadius('pulsar', 5, field);
      let seen = 0;
      for (let i = 0; i < 400 && seen === 0; i += 1) {
        stepSurvivor(state, EMPTY_SURVIVOR_INPUT, DT);
        for (const e of state.effects) {
          if (e.kind !== 'pulsar' || e.radius == null) continue;
          seen += 1;
          // Echo Pulsar's second discharge is authored at 0.82x the first; both are
          // clean multiples of one effective radius.
          const ratio = e.radius / want;
          expect(
            Math.abs(ratio - 1) < 1e-6 || Math.abs(ratio - 0.82) < 1e-6,
            `pulsar ring ${e.radius} is not derived from ${want} (field ${field}, haste ${haste})`,
          ).toBe(true);
          // ...and the drawn ring never exceeds the ring it stands for.
          for (let k = 0; k <= 10; k += 1) {
            expect(groundEffectScale('pulsar', k / 10) * e.radius).toBeLessThanOrEqual(
              e.radius + 1e-9,
            );
          }
        }
      }
      expect(seen, `pulsar never fired at field ${field} / haste ${haste}`).toBeGreaterThan(0);
    }
  });

  it('Cosmic Boomerang: collision, drawn size and reach all move with the field', () => {
    for (const { field, haste } of MATRIX) {
      const state = armed('boomerang', 5, field, haste);
      const want = effectiveRadius('boomerang', 5, field);
      let disc = null as (typeof state.projectiles)[0] | null;
      for (let i = 0; i < 600 && !disc; i += 1) {
        stepSurvivor(state, EMPTY_SURVIVOR_INPUT, DT);
        disc = state.projectiles.find((p) => p.active && p.kind === 'boomerang') ?? null;
      }
      expect(disc, `no disc at field ${field}`).toBeTruthy();
      expect(disc!.radius, 'collision radius ignores the field').toBeCloseTo(want, 6);
      // Decorative radius stays a fixed multiple of the collision radius.
      expect(disc!.visualRadius).toBeCloseTo(want * SURVIVOR.boomerang.visualRadiusMul, 6);
      // Turn distance is contracted to scale too, so a wider field also throws further.
      const life = weaponStatsAtLevel('boomerang', 5).life!;
      expect(disc!.turnDistance).toBeCloseTo(
        life * SURVIVOR.boomerang.turnDistancePerLife * (1 + field * FIELD_PER_LEVEL),
        6,
      );
    }
  });

  it('Plasma Wake: the trail capsule widens with the field and nothing else does', () => {
    for (const { field, haste } of MATRIX) {
      const state = armed('plasma-wake', 4, field, haste, 'survivor-plasma-l1');
      state.passives['area'] = field;
      state.passives['weapon-haste'] = haste;
      state.weapons = [
        { weaponId: 'plasma-wake', level: 4, cooldown: 0, prototype: false, focusDebt: 0 },
      ];
      const input = { ...EMPTY_SURVIVOR_INPUT };
      let seg = null as (typeof state.hazards)[0] | null;
      for (let i = 0; i < 600 && !seg; i += 1) {
        const ang = i * DT * 0.9;
        input.moveX = Math.cos(ang);
        input.moveY = Math.sin(ang);
        stepSurvivor(state, input, DT);
        seg = state.hazards.find((h) => h.active && h.kind === 'plasma-wake') ?? null;
      }
      expect(seg, `no trail at field ${field}`).toBeTruthy();
      const want =
        weaponStatsAtLevel('plasma-wake', 4).radius! *
        SURVIVOR.plasmaTrail.widthMul *
        (1 + field * FIELD_PER_LEVEL);
      expect(seg!.radius, 'trail half-width ignores the field').toBeCloseTo(want, 6);
      // Lifetime is authored, not a modifier axis: the field widens, it does not linger.
      expect(seg!.maxLife).toBeCloseTo(weaponStatsAtLevel('plasma-wake', 4).life!, 6);
    }
  });

  it('Arc Conductor: chain reach grows with the field and no jump exceeds it', () => {
    for (const { field, haste } of MATRIX) {
      const state = armed('arc', 5, field, haste, 'survivor-arc');
      const range = effectiveRadius('arc', 5, field);
      let arcs: Array<{ len: number; x: number; z: number }> = [];
      let px = 0;
      let pz = 0;
      for (let i = 0; i < 600 && arcs.length === 0; i += 1) {
        px = state.player.x;
        pz = state.player.z;
        stepSurvivor(state, EMPTY_SURVIVOR_INPUT, DT);
        arcs = state.effects
          .filter((e) => e.kind === 'arc')
          .map((e) => ({ len: e.length ?? 0, x: e.x, z: e.z }));
      }
      expect(arcs.length, `no arc at field ${field}`).toBeGreaterThan(0);
      /*
       * An arc drawn *from the player* is an initial arc, and it reaches as far as the
       * weapon's acquisition range — 16 units, deliberately not the chain range. Every
       * arc drawn from a body is a chain jump and must sit inside the effective reach,
       * which is what the field scales.
       */
      const chains = arcs.filter((a) => Math.hypot(a.x - px, a.z - pz) > 1e-6);
      expect(chains.length, `no chain jumps at field ${field}`).toBeGreaterThan(0);
      for (const a of chains) {
        expect(a.len, `chain jump ${a.len} exceeds reach ${range}`).toBeLessThanOrEqual(
          range + 1e-6,
        );
      }
      // And the reach really does move with the field, not just stay inside it.
      expect(range).toBeCloseTo(
        weaponStatsAtLevel('arc', 5).radius! * (1 + field * FIELD_PER_LEVEL),
        9,
      );
    }
  });

  it('Orbital Lance: immediate core and shockwave derive from one effective radius', () => {
    for (const { field, haste } of MATRIX) {
      const state = armed('orbital', 5, field, haste, 'survivor-orbital');
      const core = effectiveRadius('orbital', 5, field);
      const outer = core * SURVIVOR.orbital.shockwaveRadiusMul;
      const seen = new Map<string, number>();
      for (let i = 0; i < 1200; i += 1) {
        stepSurvivor(state, EMPTY_SURVIVOR_INPUT, DT);
        for (const e of state.effects) {
          if (e.radius == null || seen.has(e.kind)) continue;
          if (e.kind.startsWith('orbital') || e.kind === 'telegraph' || e.kind === 'pulse') {
            seen.set(e.kind, e.radius);
          }
        }
        if (seen.has('orbital-shock')) break;
      }
      // Beam, core flash and scorch all show the core boundary. There is no delayed
      // marker or telegraph because damage resolves on acquisition.
      for (const kind of ['orbital-strike', 'pulse', 'orbital-scorch']) {
        const r = seen.get(kind);
        expect(r, `${kind} missing at field ${field}`).toBeDefined();
        expect(r!, `${kind} radius at field ${field}`).toBeCloseTo(core, 6);
      }
      // Only the shockwave shows the outer boundary, because only it damages out there.
      expect(seen.get('orbital-shock')!).toBeCloseTo(outer, 6);
    }
  });

  it('Weapon Overclock buys cadence and never geometry', () => {
    /*
     * The clean statement of the contract: for each audited weapon, the radius the
     * simulation resolves is identical at haste 0 and haste 5, while the interval
     * between volleys shortens by exactly 27.5%.
     */
    for (const id of ['pulsar', 'boomerang', 'arc', 'orbital'] as WeaponId[]) {
      const def = weaponStatsAtLevel(id, 5);
      expect(def.cadence / (1 + 5 * HASTE_PER_LEVEL)).toBeCloseTo(def.cadence / 1.275, 9);
      // Radius is read from the authored table and the field only; haste is not in it.
      expect(effectiveRadius(id, 5, 0)).toBeCloseTo(def.radius!, 9);
      expect(effectiveRadius(id, 5, 5)).toBeCloseTo(def.radius! * 1.275, 9);
    }
  });

  it('measures the same drawn pulsar ring with and without Weapon Overclock', () => {
    function firstRing(haste: number): number {
      const state = armed('pulsar', 5, 0, haste);
      for (let i = 0; i < 400; i += 1) {
        stepSurvivor(state, EMPTY_SURVIVOR_INPUT, DT);
        const pulse = state.effects.find((e) => e.kind === 'pulsar' && e.radius != null);
        if (pulse) return pulse.radius!;
      }
      return -1;
    }
    const bare = firstRing(0);
    const fast = firstRing(5);
    expect(bare).toBeGreaterThan(0);
    expect(fast).toBeCloseTo(bare, 9);
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
    // `visualRadius` is deliberately larger than the collision radius.
    // 1.39x by accident of its own tube thickness.
    expect(disc!.scale.x).toBeCloseTo(proj.visualRadius, 6);
    expect(proj.visualRadius / proj.radius).toBeCloseTo(SURVIVOR.boomerang.visualRadiusMul, 6);
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

  it('uses a forged crescent body with restrained additive ion edges', () => {
    const { renderer, state } = boomerangScene(9954, 5);
    const discs = throwUntil(renderer, state, 1);
    expect(discs.length).toBeGreaterThan(0);
    const blade = discs[0]!.getObjectByName('boomerang-blade') as THREE.Mesh;
    const energy = discs[0]!.getObjectByName('boomerang-energy') as THREE.Mesh;
    const core = discs[0]!.getObjectByName('boomerang-core') as THREE.Mesh;
    expect(blade).toBeTruthy();
    expect(energy).toBeTruthy();
    expect(core).toBeTruthy();
    expect((blade.material as THREE.MeshBasicMaterial).blending).toBe(THREE.NormalBlending);
    expect((energy.material as THREE.MeshBasicMaterial).blending).toBe(THREE.AdditiveBlending);
    expect((energy.material as THREE.MeshBasicMaterial).color.getHexString()).not.toBe('ffffff');
    expect(discs[0]!.getObjectByName('boomerang-wake')!.children).toHaveLength(3);
    renderer.dispose();
  });
});

/* ---------------------------------- §6 Orbital Lance reads as an impact */

describe('§6 the Orbital Lance impact communicates its damaged area', () => {
  /** Fire one lance and collect the effects its detonation pushed, by kind. */
  function detonate(seed: number, level: number, field = 0) {
    const state = quietArena(seed, 'survivor-orbital');
    state.passives['area'] = field;
    state.weapons = [
      { weaponId: 'orbital', level, cooldown: 0, prototype: true, focusDebt: 0 },
    ];
    state.player.invuln = 1e9;
    const seen = new Map<string, { radius: number; life: number }>();
    for (let i = 0; i < 1200; i += 1) {
      stepSurvivor(state, EMPTY_SURVIVOR_INPUT, DT);
      for (const e of state.effects) {
        if (e.radius == null || seen.has(e.kind)) continue;
        if (!e.kind.startsWith('orbital') && e.kind !== 'pulse') continue;
        seen.set(e.kind, { radius: e.radius, life: e.maxLife });
      }
      if (seen.has('orbital-shock')) break;
    }
    return { state, seen };
  }

  it('draws the core blast at the core damage radius and the shockwave at the outer one', () => {
    for (const field of [0, 5]) {
      const { seen } = detonate(9970 + field, 5, field);
      const core = weaponStatsAtLevel('orbital', 5).radius! * (1 + field * 0.055);
      const outer = core * SURVIVOR.orbital.shockwaveRadiusMul;

      const strike = seen.get('orbital-strike');
      const flash = seen.get('pulse');
      const shock = seen.get('orbital-shock');
      const scorch = seen.get('orbital-scorch');
      expect(strike, 'no lance impact').toBeTruthy();
      expect(shock, 'no shockwave').toBeTruthy();
      expect(scorch, 'no scorch').toBeTruthy();

      // 2.7.0 drew the core flash at 1.15x the true core radius and the beam at 1.4x.
      expect(strike!.radius).toBeCloseTo(core, 6);
      expect(flash!.radius).toBeCloseTo(core, 6);
      expect(shock!.radius).toBeCloseTo(outer, 6);
      expect(scorch!.radius).toBeCloseTo(core, 6);
    }
  });

  it('gets the beam out of the way before the shockwave resolves', () => {
    const { seen } = detonate(9975, 5);
    const strike = seen.get('orbital-strike')!;
    const shock = seen.get('orbital-shock')!;
    // The beam establishes the origin; the ground says how much landed. The beam must
    // not still be on screen dominating the frame while it does.
    expect(strike.life).toBeLessThan(shock.life);
    expect(strike.life).toBeLessThanOrEqual(0.25);
  });

  it('never draws any part of the impact wider than the region that damaged', () => {
    const { seen } = detonate(9976, 5);
    const outer = weaponStatsAtLevel('orbital', 5).radius! * SURVIVOR.orbital.shockwaveRadiusMul;
    for (const [kind, e] of seen) {
      for (let k = 0; k <= 10; k += 1) {
        const drawn = e.radius * groundEffectScale(kind, k / 10);
        expect(drawn, `${kind} drew ${drawn} past the outer damage radius ${outer}`)
          .toBeLessThanOrEqual(outer + 1e-6);
      }
    }
  });
});

/* -------------------------------- §7 the hotbar says when an ability is back */

describe('§7 cooldown legibility and the ready flash', () => {
  function block(css: string, selector: string): string {
    const at = css.indexOf(selector);
    expect(at, `${selector} is not in the stylesheet`).toBeGreaterThan(-1);
    return css.slice(at, css.indexOf('}', at));
  }

  it('draws the countdown in thematic gold, larger, bold and outlined', () => {
    const s = block(cssSource, '.survivor-hud .sv-ab-state {');
    // Was 0.58rem of plain white over a rotating conic sweep.
    const size = /font-size:\s*([\d.]+)rem/.exec(s);
    expect(size, 'no font-size on the cooldown readout').toBeTruthy();
    expect(Number(size![1])).toBeGreaterThan(0.58);
    const weight = /font-weight:\s*(\d+)/.exec(s);
    expect(weight).toBeTruthy();
    expect(Number(weight![1])).toBeGreaterThanOrEqual(600);
    expect(s, 'countdown is not gold').toMatch(/color:\s*#ff[cd]/i);
    expect(s, 'no dark outline behind the countdown').toMatch(/text-shadow:/);
    // A countdown whose digits change width jitters as it falls.
    expect(s).toMatch(/font-variant-numeric:\s*tabular-nums/);
  });

  it('flashes neon green only on the cooldown-to-ready edge', () => {
    // Edge-triggered: a baseline observation, then only false -> true.
    expect(hudSource).toMatch(/private flashReady\(/);
    expect(hudSource).toMatch(/if \(prev === undefined \|\| prev \|\| !ready\) return;/);
    // All four slots participate.
    for (const slot of ['dodge', 'repulsor', 'ship', 'mech']) {
      expect(hudSource, `${slot} has no ready flash`).toContain(`'${slot}', `);
    }
  });

  it('bounds the flash by time, inside the authored 150-250ms band', () => {
    const ms = /READY_FLASH_MS = (\d+)/.exec(hudSource);
    expect(ms, 'the flash is not time-bounded').toBeTruthy();
    const value = Number(ms![1]);
    expect(value).toBeGreaterThanOrEqual(150);
    expect(value).toBeLessThanOrEqual(250);
    // A timeout, not a frame count: a frame spike must not swallow it.
    expect(hudSource).toMatch(/window\.setTimeout\([\s\S]{0,200}READY_FLASH_MS/);
  });

  it('returns to the class colour and never becomes a repeating blink', () => {
    const flash = block(cssSource, '.survivor-hud .sv-ability.just-ready {');
    expect(flash).toMatch(/animation:/);
    // A one-shot: no `infinite`, and no `forwards` pinning it green afterwards.
    expect(flash).not.toMatch(/infinite/);
    expect(flash).not.toMatch(/forwards/);
    const keyframes = cssSource.slice(
      cssSource.indexOf('@keyframes sv-ready-flash'),
      cssSource.indexOf('@media (prefers-reduced-motion: reduce) {', cssSource.indexOf('@keyframes sv-ready-flash')),
    );
    expect(keyframes).toMatch(/#4dff9a/);
    // The final keyframe hands the slot back to its own accent.
    expect(keyframes).toMatch(/100% \{[\s\S]*var\(--hud-accent\)/);
  });

  it('clears its timers on teardown', () => {
    // A pending flash on a disposed HUD is a listener leak by another name.
    expect(hudSource).toMatch(/dispose\(\): void \{[\s\S]{0,220}readyTimers/);
  });
});

/* ------------------------------------------- §8 weapon names stay the weapon's */

describe('§8 upgrade naming identifies the weapon being upgraded', () => {
  const ALL = Object.keys(WEAPONS) as WeaponId[];

  /** A level is transformative when it changes what the weapon *is*, not how much. */
  function isTransformative(id: WeaponId, level: number): boolean {
    if (level <= 1) return false;
    /*
     * Arc Conductor's transformation lives in `SURVIVOR.arc.forkLevel` rather than in
     * the level table, because forking is a firing behaviour and not a `count`. It is
     * named here so the rule stays "a mechanic changed", not "a number in this table
     * changed" — and so a future weapon cannot claim a tier name by pointing at config
     * that does not exist.
     */
    if (id === 'arc') return level === SURVIVOR.arc.forkLevel;
    const a = weaponStatsAtLevel(id, level - 1);
    const b = weaponStatsAtLevel(id, level);
    // One projectile becoming two is a different weapon; four becoming six is not.
    const doubles = a.count === 1 && b.count > 1;
    const learnsToSplit = (b.split ?? 0) > (a.split ?? 0);
    const learnsToBounce = (b.bounce ?? 0) > (a.bounce ?? 0);
    return doubles || learnsToSplit || learnsToBounce;
  }

  it('names a tier only where the level actually transforms the weapon', () => {
    for (const id of ALL) {
      for (const def of WEAPONS[id].levels) {
        const tier = def.tier;
        if (tier == null) continue;
        expect(
          isTransformative(id, def.level),
          `${id} L${def.level} is named "${tier}" but changes no mechanic`,
        ).toBe(true);
      }
    }
  });

  it('leaves every ordinary level carrying the weapon own name', () => {
    for (const id of ALL) {
      const fam = WEAPONS[id];
      for (let lv = 1; lv <= 4; lv += 1) {
        const card = weaponUpgradeCard(id, lv);
        const tier = fam.levels[lv]!.tier;
        if (tier) {
          expect(card.name, `${id} L${lv + 1}`).toBe(tier);
        } else {
          // An ordinary step must never rename the player's weapon.
          expect(card.name, `${id} L${lv} → L${lv + 1} renamed the weapon`).toBe(fam.name);
          // ...and the copy has to carry the change instead.
          expect(card.summary.length, `${id} L${lv + 1} summary`).toBeGreaterThan(15);
        }
        // Whatever the headline says, the parent always identifies the weapon.
        expect(card.parent).toBe(fam.name);
      }
    }
  });

  it('does not print the weapon name twice on a card that headlines with it', () => {
    // An ordinary level, an acquisition and every passive all headline with the
    // thing's own name; a parent line there just repeats it. The parent earns its
    // place on a tier card, where the headline is the transformation.
    expect(hudSource).toMatch(/card\.parent !== card\.name/);
    const twin = weaponUpgradeCard('boomerang', 4);
    expect(twin.name).toBe('Twin Orbit');
    expect(twin.parent).toBe('Cosmic Boomerang');
    expect(twin.parent).not.toBe(twin.name);
    const ordinary = weaponUpgradeCard('boomerang', 2);
    expect(ordinary.parent).toBe(ordinary.name);
  });

  it('acquiring and overclocking a weapon both name the weapon', () => {
    for (const id of ALL) {
      expect(newWeaponCard(id).name).toBe(WEAPONS[id].name);
      expect(newWeaponCard(id).parent).toBe(WEAPONS[id].name);
      const oc = weaponUpgradeCard(id, 5);
      expect(oc.parent).toBe(WEAPONS[id].name);
      // The Overclock keeps the L5 structure, so it must not invent a tier.
      expect(oc.summary).toMatch(new RegExp(WEAPONS[id].name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
    }
  });

  it('records the two weapons that have no transformation to name', () => {
    /*
     * The audit's finding, pinned.
     *
     * Rocket Barrage L1-L5 adds rockets and cadence and nothing else, so "Salvo",
     * "Cluster" and "Carpet Fire" were three renames for a count going up — and two of
     * them promised mechanics that do not exist: rockets never split, and the pattern
     * never becomes area saturation.
     *
     * Microdrone Swarm is the same shape of finding. Three drones becoming five is a
     * wider formation, not a different weapon, so "Swarm Cadre", "Hunter Wing" and
     * "Hive Overdrive" renamed Boswell's signature three times without one new
     * mechanic. If either line earns a tier name it will be by earning a mechanic.
     */
    for (const id of ['rocket', 'microdrone'] as WeaponId[]) {
      for (const def of WEAPONS[id].levels) {
        expect(def.tier, `${id} L${def.level}`).toBeUndefined();
      }
      for (let lv = 1; lv <= 4; lv += 1) {
        expect(weaponUpgradeCard(id, lv).name).toBe(WEAPONS[id].name);
      }
    }
    // The cards still explain the changes they do make.
    expect(weaponUpgradeCard('rocket', 3).summary).toMatch(/6 rockets/);
    expect(weaponUpgradeCard('microdrone', 4).summary).toMatch(/5 drones/);
  });

  it('keeps the transformative names that were earned', () => {
    const earned: Array<[WeaponId, number, string]> = [
      ['pulse', 4, 'Twin Pulse'],
      ['bioplasma', 4, 'Twin Globs'],
      ['bioplasma', 5, 'Virulent Cascade'],
      ['boomerang', 5, 'Twin Orbit'],
      ['pulsar', 5, 'Echo Pulsar'],
      ['plasma-wake', 5, 'Twin Wake'],
      ['arc', 5, 'Forked Conduction'],
    ];
    for (const [id, level, name] of earned) {
      expect(WEAPONS[id].levels[level - 1]!.tier, `${id} L${level}`).toBe(name);
    }
  });
});

/* ------------------------------------------- §9 Arc Conductor forked conduction */

describe('§9 Arc Conductor L5 forks instead of adding a fifth jump', () => {
  /** An arena holding `n` enemies on distinct bearings around the player. */
  function ring(seed: number, n: number, radius: number): SurvivorState {
    const state = quietArena(seed, 'survivor-arc');
    state.weapons = [{ weaponId: 'arc', level: 5, cooldown: 0, prototype: true, focusDebt: 0 }];
    state.player.invuln = 1e9;
    state.enemyCap = 0;
    state.spawnAcc = -1e9;
    for (const e of state.enemies) e.alive = false;
    for (let i = 0; i < n; i += 1) {
      const e = emptyEnemy();
      e.id = nextEntityId(state);
      e.defId = 'basic';
      e.role = 'fodder';
      e.alive = true;
      e.radius = 0.5;
      e.maxHealth = 1e7;
      e.health = 1e7;
      e.speedMul = 0;
      e.contactDamage = 0;
      const a = (i / n) * Math.PI * 2;
      e.x = state.player.x + Math.sin(a) * radius;
      e.z = state.player.z + Math.cos(a) * radius;
      state.enemies.push(e);
    }
    return state;
  }

  /** Fire one volley and return the arcs it drew, plus the bodies it damaged. */
  function volley(state: SurvivorState) {
    const before = new Map(state.enemies.map((e) => [e.id, e.health]));
    for (let i = 0; i < 600; i += 1) {
      stepSurvivor(state, EMPTY_SURVIVOR_INPUT, DT);
      const arcs = state.effects.filter((e) => e.kind === 'arc');
      if (arcs.length > 0) {
        const hit = state.enemies.filter((e) => (before.get(e.id) ?? 0) > e.health);
        return {
          arcs: arcs.map((a) => ({
            x: a.x,
            z: a.z,
            len: a.length ?? 0,
            facingX: a.facingX ?? 0,
            facingZ: a.facingZ ?? 1,
          })),
          hit,
        };
      }
    }
    return { arcs: [], hit: [] };
  }

  it('throws two initial arcs from the player at two distinct targets', () => {
    const state = ring(9990, 10, 5);
    const p = { x: state.player.x, z: state.player.z };
    const { arcs, hit } = volley(state);
    expect(arcs.length, 'no arc was drawn').toBeGreaterThan(0);
    // An initial arc originates at the player; a chain jump originates at a body.
    const initial = arcs.filter((a) => Math.hypot(a.x - p.x, a.z - p.z) < 1e-6);
    expect(initial.length, 'L5 did not fork into two initial arcs').toBe(2);
    // Two primaries plus up to three jumps each, and never the same body twice.
    expect(hit.length).toBeGreaterThanOrEqual(6);
    expect(hit.length).toBeLessThanOrEqual(8);
    expect(new Set(hit.map((e) => e.id)).size).toBe(hit.length);
  });

  it('covers more of the horde than the single chain it replaced', () => {
    // The transformation is coverage, not raw output: the same arena, one level apart.
    const five = ring(9989, 10, 5);
    const four = ring(9989, 10, 5);
    four.weapons = [{ weaponId: 'arc', level: 4, cooldown: 0, prototype: true, focusDebt: 0 }];
    expect(volley(five).hit.length).toBeGreaterThan(volley(four).hit.length);
  });

  it('never lets two branches claim the same body', () => {
    for (let seed = 0; seed < 6; seed += 1) {
      const state = ring(9991 + seed, 6 + seed, 4.5);
      const { hit } = volley(state);
      expect(new Set(hit.map((e) => e.id)).size, `seed ${seed} double-hit a body`).toBe(hit.length);
    }
  });

  it('separates the two arms so the split is visible', () => {
    const state = ring(9997, 12, 5);
    const p = { x: state.player.x, z: state.player.z };
    const { arcs } = volley(state);
    // Compare the two arcs that leave the player: those are the arms.
    const initial = arcs.filter((a) => Math.hypot(a.x - p.x, a.z - p.z) < 1e-6);
    expect(initial.length).toBe(2);
    const bearings = initial.map((a) => Math.atan2(a.facingX, a.facingZ));
    let delta = Math.abs(bearings[0]! - bearings[1]!);
    if (delta > Math.PI) delta = Math.PI * 2 - delta;
    expect(delta, 'the two arms lie on top of each other').toBeGreaterThanOrEqual(
      SURVIVOR.arc.minBranchSeparation - 1e-6,
    );
  });

  it('does not bill the split against a lone boss, where no second arm fires', () => {
    // Pricing a split that cannot happen would make L5 a straight damage loss against
    // exactly the encounter a prototype is taken for.
    const l4 = runWeaponBenchmark('arc', 4, 'single-boss', 24).damageDealt;
    const l5 = runWeaponBenchmark('arc', 5, 'single-boss', 24).damageDealt;
    expect(l5).toBeGreaterThan(l4);
  });

  it('stays inside the documented progression contract without widening it', () => {
    const gains = levelGains('arc');
    const ratio = levelProgressionRatio('arc');
    const cap =
      BREAKPOINT_LEVEL.arc === 5
        ? PROGRESSION_BOUNDS.breakpointGainMax
        : PROGRESSION_BOUNDS.typicalGainMax;
    // The bands are the ones every other weapon is held to. They were not moved.
    expect(cap).toBe(0.52);
    expect(PROGRESSION_BOUNDS.ratioMin).toBe(3.0);
    expect(PROGRESSION_BOUNDS.ratioMax).toBe(4.2);
    expect(gains[3], 'L4 -> L5 effective gain').toBeLessThanOrEqual(cap);
    expect(gains[3], 'L4 -> L5 effective gain').toBeGreaterThanOrEqual(
      PROGRESSION_BOUNDS.typicalGainMin,
    );
    expect(ratio).toBeGreaterThanOrEqual(PROGRESSION_BOUNDS.ratioMin);
    expect(ratio).toBeLessThanOrEqual(PROGRESSION_BOUNDS.ratioMax);
    // The rebase is the thing holding it there; parity per hit measured +0.76.
    expect(SURVIVOR.arc.damageMul).toBeLessThan(1);
  }, 30_000);

  it('keeps the chaining identity below the fork level', () => {
    const state = quietArena(9998, 'survivor-arc');
    state.weapons = [{ weaponId: 'arc', level: 4, cooldown: 0, prototype: true, focusDebt: 0 }];
    state.player.invuln = 1e9;
    state.enemyCap = 0;
    state.spawnAcc = -1e9;
    for (const e of state.enemies) e.alive = false;
    for (let i = 0; i < 10; i += 1) {
      const e = emptyEnemy();
      e.id = nextEntityId(state);
      e.defId = 'basic';
      e.role = 'fodder';
      e.alive = true;
      e.radius = 0.5;
      e.maxHealth = 1e7;
      e.health = 1e7;
      e.speedMul = 0;
      e.contactDamage = 0;
      const a = (i / 10) * Math.PI * 2;
      e.x = state.player.x + Math.sin(a) * 5;
      e.z = state.player.z + Math.cos(a) * 5;
      state.enemies.push(e);
    }
    const p = { x: state.player.x, z: state.player.z };
    const { arcs } = volley(state);
    const initial = arcs.filter((a) => Math.hypot(a.x - p.x, a.z - p.z) < 1e-6);
    expect(initial.length, 'L4 forked').toBe(1);
  });
});

/* --------------------------------- §10 Cleanup Crew flies under its own power */

describe('§10 Cleanup Crew allies show their propulsion', () => {
  /**
   * A deployed squad. The fixtures seed the arena; `SurvivorMode` normally starts the
   * protocol after construction, so the test drives the same real activation path.
   */
  function crewScene(seed: number, fixture: SurvivorFixture = 'survivor-cleanup-combat') {
    const renderer = new SurvivorRenderer(new AssetLibrary());
    const state = createSurvivorState('bee', fixture, seed);
    state.player.invuln = 1e9;
    state.nextCacheTime = 1e9;
    forceStartProtocol(state, 'cleanup-crew', 1.5);
    expect(state.allies.length, 'the squad never arrived').toBe(3);
    for (let i = 0; i < 1200; i += 1) {
      stepSurvivor(state, EMPTY_SURVIVOR_INPUT, DT);
      renderer.sync(state, DT);
      if (state.allies.filter((a) => a.active && a.phase === 'active').length === 3) break;
    }
    return { renderer, state };
  }

  function jets(renderer: SurvivorRenderer): THREE.Object3D[] {
    const out: THREE.Object3D[] = [];
    renderer.root.traverse((o) => {
      if (o.name === 'ally-jet') out.push(o);
    });
    return out;
  }

  it('draws allied Mechs at the same scale as the player Mech', () => {
    const { renderer, state } = crewScene(9964);
    expect(state.allies.some((a) => a.active && a.phase === 'active')).toBe(true);
    let sawMech = false;
    renderer.root.traverse((o) => {
      if (Math.abs(o.scale.x - SURVIVOR.actorScale.player) < 0.02) sawMech = true;
    });
    expect(sawMech).toBe(true);
    renderer.dispose();
  });

  it('gives every deployed ally exactly two bounded thruster plumes', () => {
    const { renderer, state } = crewScene(9960);
    const deployed = state.allies.filter((a) => a.active).length;
    expect(deployed, 'the squad never deployed').toBeGreaterThan(0);
    const found = jets(renderer);
    // Bounded by construction: two per ally, and nothing accumulates per frame.
    expect(found.length).toBe(deployed * 2);
    for (const jet of found) {
      // A plume and a bright core, and nothing else.
      expect(jet.children.length).toBe(2);
    }
    renderer.dispose();
  });

  it('burns harder while moving and idles while holding station', () => {
    const { renderer, state } = crewScene(9961);
    const ally = state.allies.find((a) => a.active && a.phase === 'active');
    expect(ally).toBeTruthy();

    // Hold the ally still for long enough for the damping to settle.
    for (let i = 0; i < 90; i += 1) {
      ally!.x = 4;
      ally!.z = 4;
      renderer.sync(state, DT);
    }
    const idle = jets(renderer)[0]!.children[0]! as THREE.Mesh;
    const idleLen = idle.scale.y;
    const idleNozzle = idle.position.y + (idle.scale.y * 0.55) / 2;

    // Now drive it across the arena at speed.
    for (let i = 0; i < 90; i += 1) {
      ally!.x = 4 + i * 0.12;
      renderer.sync(state, DT);
    }
    const burning = jets(renderer)[0]!.children[0]! as THREE.Mesh;
    expect(burning.scale.y, 'moving does not burn harder than hovering').toBeGreaterThan(idleLen);
    // Idle is a real burn, not nothing: the ally is holding itself up.
    expect(idleLen).toBeGreaterThan(0);
    // The nozzle stays put; the plume grows downward from it.
    const burnNozzle = burning.position.y + (burning.scale.y * 0.55) / 2;
    expect(burnNozzle).toBeCloseTo(idleNozzle, 5);
    renderer.dispose();
  });

  it('hides the jets while the transport is flying the hero in', () => {
    const renderer = new SurvivorRenderer(new AssetLibrary());
    const state = createSurvivorState('bee', 'survivor-cleanup-arrival', 9962);
    state.player.invuln = 1e9;
    state.nextCacheTime = 1e9;
    forceStartProtocol(state, 'cleanup-crew', 1.5);
    let sawTransit = false;
    for (let i = 0; i < 400; i += 1) {
      stepSurvivor(state, EMPTY_SURVIVOR_INPUT, DT);
      renderer.sync(state, DT);
      const deployed = state.allies.filter((a) => a.active && a.phase === 'active').length;
      const arriving = state.allies.filter((a) => a.active && a.phase !== 'active').length;
      if (arriving > 0) sawTransit = true;
      // The ship has its own landing streak; the Mech's jets belong to the Mech, so a
      // burning jet always implies a deployed ally.
      const burning = jets(renderer).filter((j) => j.visible).length;
      expect(burning, `${burning} jets burning for ${deployed} deployed allies`).toBe(
        deployed * 2,
      );
    }
    expect(sawTransit, 'the arrival fixture never showed a transport').toBe(true);
    renderer.dispose();
  });

  it('releases every jet mesh when the squad leaves', () => {
    const { renderer, state } = crewScene(9963);
    expect(jets(renderer).length).toBeGreaterThan(0);
    for (const a of state.allies) a.active = false;
    renderer.sync(state, DT);
    expect(jets(renderer).length, 'jets outlived their ally').toBe(0);
    renderer.dispose();
  });
});

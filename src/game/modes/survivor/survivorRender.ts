import * as THREE from 'three';
import { HEROES } from '../../content/heroes';
import { BOSS_DEMON, ENEMY_BY_ID, MELEE_BLOB } from '../../content/enemies';
import { AssetLibrary, createAnimator } from '../../assets/AssetLibrary';
import { BOSS_DEFS, HORDE, SURVIVOR, SURVIVOR_BOSS, bossDefForIndex } from './survivorContent';
import type { SurvivorState } from './survivorState';
import { shapeToRender } from './survivorAttackShapes';
import { groundEffectScale, isBoundaryEffect } from './survivorEffectGeometry';
import { AttackShapeMesh } from './survivorShapeMesh';

type Animator = ReturnType<typeof createAnimator>;

/** Cleanup Crew thruster plume: unit height before the per-frame burn scale. */
const ALLY_JET_HEIGHT = 0.55;
/** Nozzle height. The plume grows downward from here and never moves up. */
const ALLY_JET_NOZZLE_Y = 0.5;
/** Idle burn floor — a hovering astronaut is still holding itself up. */
const ALLY_JET_IDLE = 0.22;
/** Ground speed treated as full thrust, near an ally's own top speed. */
const ALLY_JET_FULL_SPEED = 7;
/** Thrust smoothing rate; allies re-target on a timer and would otherwise strobe. */
const ALLY_JET_DAMPING = 6;
/** Maximum forward lean, in radians. Restrained: this is a cue, not an animation. */
const ALLY_JET_MAX_TILT = 0.16;

interface ActorVis {
  root: THREE.Object3D;
  animator: Animator | null;
  flashMats: THREE.MeshStandardMaterial[];
  defId: string;
}

/**
 * Presentation for one Cleanup Crew ally.
 *
 * Holds the hero's real Mech and ship clones plus two owned effect meshes. Built once
 * when the ally arrives, disposed when it leaves — never rebuilt per frame.
 */
interface AllyVis {
  root: THREE.Group;
  mech: ActorVis | null;
  ship: THREE.Object3D | null;
  trail: THREE.Mesh;
  glow: THREE.Mesh;
  /**
   * Astronaut propulsion (endless-2.8.0).
   *
   * Two downward thruster plumes with bright cores, at fixed offsets under the Mech.
   * Bounded by construction — four meshes per ally, three allies — and torn down with
   * the ally, so there is no particle system to cap.
   */
  jets: THREE.Object3D[];
  /**
   * Previous ground position, for measuring speed.
   *
   * The simulation gives an ally a position and a facing but no velocity, and it is not
   * getting one for a visual: how hard the jets are burning is a presentation question,
   * so the renderer answers it from what it can already see.
   */
  prevX: number;
  prevZ: number;
  /** Smoothed thrust in [0,1]; damped so the plumes do not strobe on a jittery step. */
  thrust: number;
}

function repairCrossGeometry(): THREE.ExtrudeGeometry {
  const shape = new THREE.Shape();
  const arm = 0.11;
  const reach = 0.34;
  shape.moveTo(-arm, -reach);
  shape.lineTo(arm, -reach);
  shape.lineTo(arm, -arm);
  shape.lineTo(reach, -arm);
  shape.lineTo(reach, arm);
  shape.lineTo(arm, arm);
  shape.lineTo(arm, reach);
  shape.lineTo(-arm, reach);
  shape.lineTo(-arm, arm);
  shape.lineTo(-reach, arm);
  shape.lineTo(-reach, -arm);
  shape.lineTo(-arm, -arm);
  shape.closePath();
  const geometry = new THREE.ExtrudeGeometry(shape, {
    depth: 0.09,
    bevelEnabled: true,
    bevelSegments: 1,
    bevelSize: 0.025,
    bevelThickness: 0.025,
    curveSegments: 1,
  });
  geometry.center();
  geometry.rotateX(-Math.PI / 2);
  return geometry;
}

/**
 * Presentation for survivor mode.
 * Full skeletal animation for player/boss/elites; throttled mixers for horde.
 */
export class SurvivorRenderer {
  readonly root = new THREE.Group();
  private assets: AssetLibrary;
  private playerAstro: ActorVis | null = null;
  private playerMech: ActorVis | null = null;
  private playerShip: THREE.Object3D | null = null;
  private shipExhaust: THREE.Group | null = null;
  private exhaustL: THREE.Group | null = null;
  private exhaustR: THREE.Group | null = null;
  private exhaustMats: THREE.MeshBasicMaterial[] = [];
  private heroAccent = '#88e0ff';
  private heroShipUrl: string | null = null;
  private enemies = new Map<number, ActorVis>();
  private bosses = new Map<number, ActorVis>();
  private bossPose = new Map<number, { x: number; z: number }>();
  private projectiles = new Map<number, THREE.Object3D>();
  private pickups = new Map<number, THREE.Object3D>();
  private hazards = new Map<number, THREE.Object3D>();
  private effects = new Map<number, THREE.Object3D>();
  private rails: THREE.Object3D[] = [];
  /** Shared unit rail geometry — scale mesh length instead of reallocating. */
  private railGeo = new THREE.BoxGeometry(0.3, 0.12, 1);
  private railMat = new THREE.MeshBasicMaterial({
    color: '#88d4ff',
    transparent: true,
    opacity: 0.9,
    depthWrite: false,
  });
  private railPool: THREE.Mesh[] = [];
  /** Pooled attack-shape visuals; reused across attack entities, never per-frame allocated. */
  private attackPool: AttackShapeMesh[] = [];
  /** Persistent Protocol Cache world actor (not a short-lived effect). */
  private cacheActor: THREE.Group | null = null;
  private cacheMats: THREE.MeshBasicMaterial[] = [];
  /** Separate gunship flyover — never reuses the player ship transform. */
  private gunshipRoot: THREE.Object3D | null = null;
  private gunshipMats: THREE.MeshBasicMaterial[] = [];
  /** Persistent Aegis barrier — follows player while shieldPoints/Time > 0. */
  private shieldRoot: THREE.Group | null = null;
  private shieldMats: THREE.MeshBasicMaterial[] = [];
  private shieldWasActive = false;
  /** Shared procedural projectile geometry; all are bounded and allocated once. */
  private boltGeo = new THREE.CapsuleGeometry(0.085, 0.34, 3, 8);
  private enemyShardGeo = new THREE.OctahedronGeometry(1, 0);
  private bioCoreGeo = new THREE.IcosahedronGeometry(0.56, 1);
  private bioShellGeo = new THREE.IcosahedronGeometry(1, 1);
  private bossOrbCoreGeo = new THREE.IcosahedronGeometry(0.46, 1);
  private bossOrbShellGeo = new THREE.IcosahedronGeometry(1, 2);
  private bossOrbRingGeo = new THREE.TorusGeometry(0.78, 0.045, 6, 32);
  private bossFanGeo = new THREE.ConeGeometry(0.42, 1.6, 5);
  private bossFanCoreGeo = new THREE.ConeGeometry(0.16, 1.32, 5);
  private orbitalNeedleGeo = new THREE.ConeGeometry(0.2, 1.3, 6);
  private orbitalLocatorGeo = new THREE.TorusGeometry(0.58, 0.045, 6, 24);
  /** Shared pickup structure; materials remain per-pickup for warning/full-state fades. */
  private pickupEnergyCoreGeo = new THREE.OctahedronGeometry(0.22, 0);
  private pickupEnergyShellGeo = new THREE.IcosahedronGeometry(0.36, 1);
  private pickupEnergyCoilGeo = new THREE.TorusKnotGeometry(0.235, 0.018, 40, 5, 2, 3);
  private pickupRepairCoreGeo = new THREE.DodecahedronGeometry(0.2, 0);
  private pickupRepairCrossGeo = repairCrossGeometry();
  private pickupRepairFrameGeo = new THREE.TorusGeometry(0.46, 0.045, 4, 6);
  private pickupRepairShellGeo = new THREE.OctahedronGeometry(0.56, 0);
  private eliteShellGeo = new THREE.SphereGeometry(1.05, 16, 12);
  private eliteRingGeo = new THREE.TorusGeometry(0.9, 0.055, 8, 30);
  private eliteBarGeo = new THREE.PlaneGeometry(1.7, 0.16);
  private eliteFillGeo = new THREE.PlaneGeometry(1.62, 0.1);
  /** Cleanup Crew ally visuals, keyed by ally id. Bounded at three. */
  private readonly allies = new Map<number, AllyVis>();
  private animFrame = 0;
  private readonly mats = new Map<string, THREE.MeshStandardMaterial>();
  private readonly basicMats = new Map<string, THREE.MeshBasicMaterial>();
  private readonly proceduralMats = new Map<string, THREE.MeshBasicMaterial>();

  constructor(assets: AssetLibrary) {
    this.assets = assets;
    this.root.name = 'survivor-actors';
    // Author the reusable projectile axes once. Forward is +Z throughout survivor mode.
    this.boltGeo.rotateX(Math.PI / 2);
    this.enemyShardGeo.scale(0.36, 0.3, 0.9);
    this.bossFanGeo.rotateX(Math.PI / 2);
    this.bossFanCoreGeo.rotateX(Math.PI / 2);
    this.orbitalNeedleGeo.rotateX(Math.PI / 2);
    this.pickupRepairFrameGeo.rotateX(Math.PI / 2);
  }

  async setupPlayer(heroId: keyof typeof HEROES): Promise<void> {
    const hero = HEROES[heroId];
    this.heroAccent = hero.accent;
    this.heroShipUrl = hero.shipUrl;
    this.playerAstro = this.makeFromUrl(hero.astronaut.url, hero.astronaut.anim, 'astro');
    this.playerMech = this.makeFromUrl(hero.mech.url, hero.mech.anim, 'mech');
    const shipClone = this.assets.clone(hero.shipUrl);
    if (shipClone) {
      this.playerShip = shipClone.root;
      this.playerShip.visible = false;
      this.playerShip.traverse((c) => {
        if (c instanceof THREE.Mesh) {
          c.castShadow = true;
          c.receiveShadow = false;
        }
      });
      this.root.add(this.playerShip);
      this.buildShipExhaust(this.playerShip);
    }
    if (this.playerMech) this.playerMech.root.visible = false;
    if (this.playerAstro) this.root.add(this.playerAstro.root);
    if (this.playerMech) this.root.add(this.playerMech.root);
  }

  /** Dual-engine thruster flames attached behind the ship. */
  private buildShipExhaust(ship: THREE.Object3D): void {
    // Dispose previous
    if (this.shipExhaust) {
      ship.remove(this.shipExhaust);
      this.shipExhaust = null;
    }
    const group = new THREE.Group();
    group.name = 'ship-exhaust';
    group.visible = false;

    const vs = SURVIVOR.ship.exhaustVisualScale;
    const makeEngine = (x: number): THREE.Group => {
      const eng = new THREE.Group();
      eng.position.set(x * vs, 0.28, -0.45);
      const coreMat = new THREE.MeshBasicMaterial({
        color: '#fffef5',
        transparent: true,
        opacity: 1,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      });
      const midMat = new THREE.MeshBasicMaterial({
        color: '#7de8ff',
        transparent: true,
        opacity: 0.85,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      });
      const outerMat = new THREE.MeshBasicMaterial({
        color: this.heroAccent,
        transparent: true,
        opacity: 0.62,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      });
      this.exhaustMats.push(coreMat, midMat, outerMat);
      const core = new THREE.Mesh(new THREE.ConeGeometry(0.16 * vs, 1.5 * vs, 10, 1, true), coreMat);
      core.rotation.x = Math.PI / 2;
      core.position.z = -0.7 * vs;
      const mid = new THREE.Mesh(new THREE.ConeGeometry(0.3 * vs, 2.2 * vs, 12, 1, true), midMat);
      mid.rotation.x = Math.PI / 2;
      mid.position.z = -1.0 * vs;
      const outer = new THREE.Mesh(new THREE.ConeGeometry(0.48 * vs, 3.0 * vs, 14, 1, true), outerMat);
      outer.rotation.x = Math.PI / 2;
      outer.position.z = -1.35 * vs;
      eng.add(outer, mid, core);
      return eng;
    };

    this.exhaustL = makeEngine(-0.32);
    this.exhaustR = makeEngine(0.32);
    group.add(this.exhaustL, this.exhaustR);
    ship.add(group);
    this.shipExhaust = group;
  }

  private mat(color: string): THREE.MeshStandardMaterial {
    let m = this.mats.get(color);
    if (!m) {
      m = new THREE.MeshStandardMaterial({
        color,
        emissive: color,
        emissiveIntensity: 1.3,
        transparent: true,
        opacity: 0.95,
      });
      this.mats.set(color, m);
    }
    return m;
  }

  private proceduralMat(
    color: string,
    opacity: number,
    additive = false,
    wireframe = false,
  ): THREE.MeshBasicMaterial {
    const key = `${color}:${opacity}:${additive ? 1 : 0}:${wireframe ? 1 : 0}`;
    let material = this.proceduralMats.get(key);
    if (!material) {
      material = new THREE.MeshBasicMaterial({
        color,
        transparent: opacity < 1,
        opacity,
        wireframe,
        side: THREE.DoubleSide,
        depthWrite: false,
        blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending,
      });
      this.proceduralMats.set(key, material);
    }
    return material;
  }

  /**
   * Shared Cosmic Boomerang geometry.
   *
   * Two discs can be in the air at Twin Orbit and a throw lands every ~1.4s, so the
   * silhouette is built once and reused. Marked `sharedGeometry` on every mesh so
   * per-projectile teardown releases materials but never these.
   */
  private boomerangGeo: {
    blade: THREE.ExtrudeGeometry;
    energy: THREE.RingGeometry;
    core: THREE.OctahedronGeometry;
    ghost: THREE.RingGeometry;
  } | null = null;

  private boomerangGeometry(): NonNullable<SurvivorRenderer['boomerangGeo']> {
    if (!this.boomerangGeo) {
      // A single asymmetric crescent: recognisable at any spin angle and wholly unlike
      // the old two-cylinder V. The opening is deliberately off-centre so rotation has
      // a readable cadence even against a dense horde.
      const shape = new THREE.Shape();
      const outer = 1;
      const inner = 0.42;
      const a0 = -1.22;
      const a1 = 1.05;
      shape.moveTo(Math.cos(a0) * outer, Math.sin(a0) * outer);
      shape.absarc(0, 0, outer, a0, a1, false);
      shape.lineTo(Math.cos(0.82) * inner, Math.sin(0.82) * inner);
      shape.absarc(0, 0, inner, 0.82, -0.95, true);
      shape.closePath();
      const blade = new THREE.ExtrudeGeometry(shape, {
        depth: 0.13,
        bevelEnabled: true,
        bevelSegments: 2,
        bevelSize: 0.045,
        bevelThickness: 0.04,
        curveSegments: 18,
      });
      blade.center();
      blade.rotateX(-Math.PI / 2);
      const energy = new THREE.RingGeometry(0.69, 0.93, 40, 1, a0, a1 - a0);
      energy.rotateX(-Math.PI / 2);
      const ghost = new THREE.RingGeometry(0.53, 0.83, 32, 1, a0, a1 - a0);
      ghost.rotateX(-Math.PI / 2);
      this.boomerangGeo = {
        blade,
        energy,
        core: new THREE.OctahedronGeometry(0.22, 1),
        ghost,
      };
    }
    return this.boomerangGeo;
  }

  /** Distinct readable silhouettes for signature projectiles. */
  private createProjectileActor(
    kind: import('./survivorState').ProjectileKind,
    color: string,
    variant = 0,
  ): THREE.Object3D {
    const shared = (geometry: THREE.BufferGeometry, material: THREE.Material, name?: string): THREE.Mesh => {
      const mesh = new THREE.Mesh(geometry, material);
      mesh.userData.sharedGeometry = true;
      mesh.userData.ownsGeometry = false;
      mesh.userData.ownsMaterial = false;
      if (name) mesh.name = name;
      return mesh;
    };

    if (kind === 'boomerang') {
      // Entirely new silhouette and motion language: an asymmetric forged crescent,
      // bright ion edge and three phase-lag ghosts. The spinner answers rotation; the
      // non-spinning ghost train answers travel direction and makes the curved path
      // legible between simulation steps.
      const g = new THREE.Group();
      const spinner = new THREE.Group();
      spinner.name = 'boomerang-spin';
      const geo = this.boomerangGeometry();
      const share = (geometry: THREE.BufferGeometry, material: THREE.Material, name: string): THREE.Mesh => {
        const mesh = new THREE.Mesh(geometry, material);
        mesh.name = name;
        mesh.userData.sharedGeometry = true;
        mesh.userData.ownsGeometry = false;
        mesh.userData.ownsMaterial = true;
        return mesh;
      };
      const blade = share(geo.blade, this.effectMat(variant % 2 === 0 ? '#35106f' : '#4b1480', 0.98), 'boomerang-blade');
      const edge = share(geo.energy, this.effectMat('#8ffcff', 0.96, true), 'boomerang-energy');
      edge.position.y = 0.11;
      const core = share(geo.core, this.effectMat('#fff3bd', 1, true), 'boomerang-core');
      core.position.set(-0.08, 0.18, -0.02);
      core.scale.set(0.9, 0.48, 0.9);
      spinner.add(blade, edge, core);

      const wake = new THREE.Group();
      wake.name = 'boomerang-wake';
      for (let i = 0; i < 3; i += 1) {
        const ghost = share(
          geo.ghost,
          this.effectMat(i === 0 ? '#a875ff' : '#54dfff', 0.28 - i * 0.055, true),
          `boomerang-ghost-${i}`,
        );
        ghost.position.set(0, 0.05, -0.42 - i * 0.36);
        ghost.scale.setScalar(0.82 - i * 0.11);
        ghost.userData.phase = i * 1.4;
        wake.add(ghost);
      }

      g.add(spinner, wake);
      g.name = 'projectile-boomerang';
      g.userData.spinSign = variant % 2 === 0 ? 1 : -1;
      g.userData.spin = 0;
      void color;
      return g;
    }
    if (kind === 'bolt') {
      const bolt = shared(this.boltGeo, this.mat(color), 'projectile-bolt');
      return bolt;
    }
    if (kind === 'enemy') {
      const shard = shared(this.enemyShardGeo, this.proceduralMat('#ff4966', 0.92, true), 'projectile-enemy');
      return shard;
    }
    if (kind === 'bioplasma') {
      const g = new THREE.Group();
      g.name = 'projectile-bioplasma';
      const core = shared(this.bioCoreGeo, this.proceduralMat('#f5fff3', 0.96, true), 'bioplasma-core');
      core.scale.set(0.72, 0.72, 0.96);
      const shell = shared(this.bioShellGeo, this.proceduralMat(color, 0.48, true, true), 'bioplasma-shell');
      shell.scale.set(0.96, 0.8, 1);
      const nucleus = shared(this.enemyShardGeo, this.proceduralMat('#79ff73', 0.8, true), 'bioplasma-nucleus');
      nucleus.scale.setScalar(0.32);
      nucleus.position.set(0.2, 0.12, -0.12);
      g.add(shell, core, nucleus);
      return g;
    }
    if (kind === 'boss-orb') {
      const g = new THREE.Group();
      g.name = 'projectile-boss-orb';
      const shell = shared(this.bossOrbShellGeo, this.proceduralMat('#ff173e', 0.26, true, true), 'boss-orb-shell');
      const core = shared(this.bossOrbCoreGeo, this.proceduralMat('#fff1ea', 0.98, true), 'boss-orb-core');
      const mantle = shared(this.bioCoreGeo, this.proceduralMat(color, 0.62, true), 'boss-orb-mantle');
      mantle.scale.setScalar(0.7);
      const ringA = shared(this.bossOrbRingGeo, this.proceduralMat('#ff7890', 0.78, true), 'boss-orb-ring-a');
      const ringB = shared(this.bossOrbRingGeo, this.proceduralMat('#ffcfb8', 0.52, true), 'boss-orb-ring-b');
      ringA.rotation.x = Math.PI / 2.8;
      ringB.rotation.z = Math.PI / 2;
      g.add(shell, mantle, core, ringA, ringB);
      return g;
    }
    if (kind === 'boss-fan') {
      const g = new THREE.Group();
      g.name = 'projectile-boss-fan';
      const blade = shared(this.bossFanGeo, this.proceduralMat('#ff3157', 0.82, true), 'boss-fan-blade');
      const core = shared(this.bossFanCoreGeo, this.proceduralMat('#fff3e8', 0.98, true), 'boss-fan-core');
      blade.position.z = 0.02;
      core.position.z = 0.06;
      g.add(blade, core);
      return g;
    }
    if (kind === 'orbital-marker') {
      const g = new THREE.Group();
      g.name = 'projectile-orbital-marker';
      const needle = shared(this.orbitalNeedleGeo, this.proceduralMat('#fff4c8', 0.95, true), 'orbital-needle');
      const locator = shared(this.orbitalLocatorGeo, this.proceduralMat('#ffd46a', 0.72, true), 'orbital-locator');
      locator.rotation.x = Math.PI / 2;
      locator.position.z = -0.18;
      g.add(needle, locator);
      return g;
    }

    const g = new THREE.Group();
    g.name = `projectile-${kind}`;
    if (kind === 'rotary-round') {
      const glow = this.ownMesh(new THREE.Mesh(
        new THREE.BoxGeometry(0.13, 0.11, 1.05),
        this.effectMat('#ffb52f', 0.45, true),
      ));
      const core = this.ownMesh(new THREE.Mesh(
        new THREE.BoxGeometry(0.045, 0.05, 0.78),
        this.effectMat('#fff8d6', 1, true),
      ));
      glow.position.z = -0.25;
      core.position.z = -0.08;
      g.add(glow, core);
      return g;
    }
    const bodyMat = this.effectMat(kind === 'rocket' ? '#dbeeff' : color, 1, true);
    const accentMat = this.effectMat(kind === 'rocket' ? '#ff6a32' : '#e8fbff', 0.95, true);
    const glowMat = this.effectMat(kind === 'rocket' ? '#ffbf45' : color, 0.9, true);
    if (kind === 'rocket') {
      const body = this.ownMesh(new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.16, 0.62, 10), bodyMat));
      body.rotation.x = Math.PI / 2;
      const nose = this.ownMesh(new THREE.Mesh(new THREE.ConeGeometry(0.13, 0.28, 10), accentMat));
      nose.rotation.x = Math.PI / 2;
      nose.position.z = 0.44;
      const finGeo = new THREE.BoxGeometry(0.38, 0.035, 0.2);
      const fins = this.ownMesh(new THREE.Mesh(finGeo, accentMat.clone()));
      (fins.material as THREE.Material).userData.owned = true;
      fins.position.z = -0.22;
      const exhaust = this.ownMesh(new THREE.Mesh(new THREE.ConeGeometry(0.15, 0.62, 10, 1, true), glowMat));
      exhaust.name = 'projectile-exhaust';
      exhaust.rotation.x = -Math.PI / 2;
      exhaust.position.z = -0.62;
      g.add(body, nose, fins, exhaust);
      g.scale.setScalar(1.35);
    } else {
      const core = this.ownMesh(new THREE.Mesh(new THREE.OctahedronGeometry(0.22, 0), glowMat));
      const hull = this.ownMesh(new THREE.Mesh(new THREE.SphereGeometry(0.18, 10, 8), bodyMat));
      hull.scale.set(1.5, 0.72, 1.15);
      const wing = this.ownMesh(new THREE.Mesh(new THREE.BoxGeometry(0.72, 0.045, 0.2), accentMat));
      const tail = this.ownMesh(new THREE.Mesh(new THREE.ConeGeometry(0.11, 0.42, 8, 1, true), glowMat.clone()));
      (tail.material as THREE.Material).userData.owned = true;
      tail.name = 'projectile-exhaust';
      tail.rotation.x = -Math.PI / 2;
      tail.position.z = -0.36;
      g.add(core, hull, wing, tail);
      g.scale.setScalar(1.22);
    }
    return g;
  }

  private makeFromUrl(
    url: string,
    anim: import('../../content/heroes').AnimationAliases,
    defId: string,
  ): ActorVis | null {
    const cloned = this.assets.clone(url);
    if (!cloned) return null;
    const flashMats: THREE.MeshStandardMaterial[] = [];
    cloned.root.traverse((child) => {
      if (child instanceof THREE.Mesh) {
        child.castShadow = defId === 'astro' || defId === 'mech' || defId === 'boss';
        child.receiveShadow = false;
        const sources = Array.isArray(child.material) ? child.material : [child.material];
        const next = sources.map((m) => {
          const c = m.clone() as THREE.MeshStandardMaterial;
          if ('emissive' in c) flashMats.push(c);
          return c;
        });
        child.material = Array.isArray(child.material) ? next : next[0];
      }
    });
    const animator = createAnimator(cloned.root, cloned.clips, anim);
    animator.play('idle');
    return { root: cloned.root, animator, flashMats, defId };
  }

  sync(state: SurvivorState, dt: number): void {
    this.animFrame += 1;
    this.syncPlayer(state, dt);
    this.syncEnemies(state, dt);
    this.syncBoss(state, dt);
    this.syncProjectiles(state, dt);
    this.syncHazards(state);
    this.syncAllies(state, dt);
    this.syncPickups(state);
    this.syncCache(state);
    this.syncGunship(state, dt);
    this.syncShield(state, dt);
    this.syncEffects(state);
    this.syncAttacks(state);
    this.syncRails(state);
  }

  /**
   * Boss attack telegraphs and live danger zones.
   *
   * Geometry comes straight from the simulation's authoritative `AttackShape` through
   * `shapeToRender` — the renderer never derives its own approximation, so what is drawn
   * is exactly what `pointHitsShape` tests against.
   */
  private syncAttacks(state: SurvivorState): void {
    let used = 0;
    for (const a of state.attacks) {
      if (!a.active) continue;
      let vis = this.attackPool[used];
      if (!vis) {
        vis = new AttackShapeMesh();
        this.attackPool.push(vis);
        this.root.add(vis.mesh);
      }
      vis.mesh.visible = true;
      vis.update(shapeToRender(a.shape));
      vis.material.color.set(a.color);
      vis.outlineMaterial.color.set(a.color);
      const t = 1 - Math.max(0, Math.min(1, a.remaining / a.maxRemaining));
      const heartbeat = 0.76 + Math.sin(performance.now() * 0.012 + used * 1.7) * 0.24;
      if (a.lifecycle === 'windup') {
        // Warning: builds toward the strike so the read is unambiguous.
        vis.material.opacity = 0.1 + t * 0.2;
        vis.outlineMaterial.opacity = (0.5 + t * 0.46) * heartbeat;
      } else if (a.lifecycle === 'active') {
        vis.material.opacity = a.damaging ? 0.38 : 0.2;
        vis.outlineMaterial.opacity = a.damaging ? 1 : 0.58;
      } else {
        vis.material.opacity = Math.max(0, 0.32 * (1 - t));
        vis.outlineMaterial.opacity = Math.max(0, 0.74 * (1 - t));
      }
      used += 1;
    }
    // Pool high-water mark: surplus visuals are hidden, never destroyed and rebuilt.
    for (let i = used; i < this.attackPool.length; i += 1) {
      this.attackPool[i]!.mesh.visible = false;
    }
  }

  private syncPlayer(state: SurvivorState, dt: number): void {
    const p = state.player;
    const form = p.form;
    const scale = SURVIVOR.actorScale.player;
    if (this.playerAstro) {
      this.playerAstro.root.visible = form === 'astronaut';
      if (form === 'astronaut') {
        this.place(this.playerAstro, p.x, p.z, p.facingX, p.facingZ, scale);
        this.animPlayer(this.playerAstro, p, dt);
        this.flash(this.playerAstro, p.hitFlash, p.invuln > 0);
      }
    }
    if (this.playerMech) {
      this.playerMech.root.visible = form === 'mech';
      if (form === 'mech') {
        this.place(this.playerMech, p.x, p.z, p.facingX, p.facingZ, scale);
        this.animPlayer(this.playerMech, p, dt);
        this.flash(this.playerMech, p.hitFlash, false);
      }
    }
    if (this.playerShip) {
      this.playerShip.visible = form === 'ship';
      if (form === 'ship') {
        this.playerShip.position.set(p.x, 0.35, p.z);
        this.playerShip.rotation.y = Math.atan2(p.facingX, p.facingZ);
        this.playerShip.scale.setScalar(SURVIVOR.actorScale.ship);
        if (this.shipExhaust) {
          this.shipExhaust.visible = true;
          const flicker = 0.85 + Math.sin(performance.now() * 0.045) * 0.15;
          const pulse = 0.9 + Math.sin(performance.now() * 0.09 + 1.2) * 0.12;
          for (const eng of [this.exhaustL, this.exhaustR]) {
            if (!eng) continue;
            eng.scale.set(1, 1, 0.95 + flicker * 0.35);
            eng.position.y = 0.22 + Math.sin(performance.now() * 0.05) * 0.03;
          }
          for (const m of this.exhaustMats) {
            m.opacity = Math.min(1, (m.opacity > 0.7 ? 0.9 : 0.5) * pulse);
          }
        }
      } else if (this.shipExhaust) {
        this.shipExhaust.visible = false;
      }
    }
  }

  private animPlayer(vis: ActorVis, p: SurvivorState['player'], dt: number): void {
    if (!vis.animator) return;
    if (!p.alive) vis.animator.play('death', 0.08);
    else if (p.dodgeActive > 0) vis.animator.play('dodge', 0.05);
    else if (p.hitFlash > 0.08) vis.animator.play('hit', 0.05);
    else if (p.isMoving) vis.animator.play('run', 0.12);
    else vis.animator.play('idle', 0.15);
    vis.animator.update(dt);
  }

  private syncEnemies(state: SurvivorState, dt: number): void {
    const alive = new Set(state.enemies.filter((e) => e.alive).map((e) => e.id));
    for (const [id, vis] of this.enemies) {
      if (!alive.has(id)) {
        this.root.remove(vis.root);
        this.enemies.delete(id);
      }
    }
    const visibleEliteBars = new Set(
      state.enemies
        .filter((e) => e.alive && e.isElite && Math.hypot(e.x - state.player.x, e.z - state.player.z) <= SURVIVOR.elite.barVisibleRange)
        .sort((a, b) => Math.hypot(a.x - state.player.x, a.z - state.player.z) - Math.hypot(b.x - state.player.x, b.z - state.player.z))
        .slice(0, SURVIVOR.elite.maxVisibleBars)
        .map((e) => e.id),
    );
    let i = 0;
    for (const e of state.enemies) {
      if (!e.alive) continue;
      i += 1;
      let vis = this.enemies.get(e.id);
      if (!vis) {
        const horde = HORDE[e.defId];
        const visual = horde?.visual ?? ENEMY_BY_ID[e.defId] ?? MELEE_BLOB;
        const created = this.makeFromUrl(
          visual.url,
          {
            idle: visual.anim.idle,
            walk: visual.anim.walk,
            run: visual.anim.walk,
            shoot: visual.anim.attack,
            dodge: visual.anim.idle,
            hit: visual.anim.hit,
            death: visual.anim.death,
            ability: visual.anim.attack,
          },
          e.defId,
        );
        if (!created) continue;
        vis = created;
        vis.root.traverse((c) => {
          if (c instanceof THREE.Mesh) {
            c.castShadow = e.isElite || e.isMiniboss;
            c.receiveShadow = false;
          }
        });
        this.enemies.set(e.id, vis);
        this.root.add(vis.root);
        if (e.isElite) this.addElitePresentation(vis);
      }
      const scale = e.isMiniboss
        ? SURVIVOR.actorScale.miniboss
        : e.isElite
          ? SURVIVOR.actorScale.elite
          : SURVIVOR.actorScale.enemy;
      this.place(vis, e.x, e.z, e.facingX, e.facingZ, scale);
      if (e.defId === 'surge-flier') {
        // The surge actor is unmistakably airborne and moves as a restless flock.
        // Collision remains on the simulation's XZ plane; this is presentation only.
        vis.root.position.y = 2.05 + Math.sin(state.time * 8.5 + e.id * 0.73) * 0.22;
        vis.root.rotation.z = Math.sin(state.time * 5.2 + e.id) * 0.12;
        vis.root.scale.setScalar(scale * 1.55);
      }
      const shouldAnim = e.isElite || e.isMiniboss || this.animFrame % 2 === i % 2;
      if (vis.animator && shouldAnim) {
        if (e.specialWindup > 0) vis.animator.play('shoot', 0.05);
        else if (e.hitFlash > 0.05) vis.animator.play('hit', 0.04);
        else vis.animator.play('walk');
        vis.animator.update(dt * (e.isElite || e.isMiniboss ? 1 : 1.15));
      }
      this.flash(vis, e.hitFlash, e.specialWindup > 0);
      if (e.isElite) this.updateElitePresentation(vis, e.health / Math.max(1, e.maxHealth), visibleEliteBars.has(e.id));
    }
  }

  private addElitePresentation(vis: ActorVis): void {
    if (vis.root.getObjectByName('elite-presentation')) return;
    const fx = new THREE.Group();
    fx.name = 'elite-presentation';
    const shell = new THREE.Mesh(
      this.eliteShellGeo,
      this.basic('#ffb24a', 0.16, true),
    );
    shell.position.y = 1.05;
    shell.scale.set(1, 1.35, 1);
    shell.name = 'elite-shell';
    const ring = new THREE.Mesh(
      this.eliteRingGeo,
      this.basic('#ffd46a', 0.72, true),
    );
    ring.rotation.x = Math.PI / 2;
    ring.position.y = 0.12;
    ring.name = 'elite-ring';
    const bar = new THREE.Group();
    bar.name = 'elite-health';
    bar.position.set(0, 2.45, 0);
    const bg = new THREE.Mesh(this.eliteBarGeo, this.basic('#170d24', 0.85));
    bg.rotation.x = -Math.PI / 8;
    const fill = new THREE.Mesh(this.eliteFillGeo, this.basic('#ffb24a', 0.95, true));
    fill.position.z = 0.015;
    fill.rotation.x = -Math.PI / 8;
    fill.name = 'elite-health-fill';
    bar.add(bg, fill);
    fx.add(shell, ring, bar);
    vis.root.add(fx);
  }

  private updateElitePresentation(vis: ActorVis, health: number, showBar: boolean): void {
    const fx = vis.root.getObjectByName('elite-presentation');
    if (!fx) return;
    const t = performance.now() * 0.001;
    const ring = fx.getObjectByName('elite-ring');
    if (ring) ring.rotation.z = t * 1.25;
    const shell = fx.getObjectByName('elite-shell');
    if (shell) {
      const pulse = 0.96 + Math.sin(t * 4.5) * 0.05;
      shell.scale.set(pulse, pulse * 1.35, pulse);
    }
    const bar = fx.getObjectByName('elite-health');
    if (bar) bar.visible = showBar;
    const fill = fx.getObjectByName('elite-health-fill');
    if (fill) {
      const frac = Math.max(0, Math.min(1, health));
      fill.scale.x = frac;
      fill.position.x = -(1 - frac) * 0.81;
    }
  }

  private syncBoss(state: SurvivorState, dt: number): void {
    const aliveIds = new Set(
      state.bosses.filter((b) => b.active || (b.state === 'dead' && b.timer > 0)).map((b) => b.id),
    );
    for (const [id, vis] of this.bosses) {
      if (!aliveIds.has(id)) {
        this.root.remove(vis.root);
        this.bosses.delete(id);
        this.bossPose.delete(id);
      }
    }
    for (const b of state.bosses) {
      if (!b.active && !(b.state === 'dead' && b.timer > 0)) continue;
      const def = BOSS_DEFS.find((d) => d.id === b.defId) ?? bossDefForIndex(b.index);
      let vis = this.bosses.get(b.id);
      if (!vis) {
        const created = this.makeFromUrl(
          def.url,
          {
            idle: [...def.anim.idle],
            walk: [...def.anim.walk],
            run: [...def.anim.walk],
            shoot: [...def.anim.attack],
            dodge: [...def.anim.idle],
            hit: [...def.anim.hit],
            death: [...def.anim.death],
            ability: [...def.anim.attack],
          },
          'boss',
        );
        if (!created) {
          // Fallback to blue demon if load failed
          const fallback = this.makeFromUrl(
            SURVIVOR_BOSS.url,
            {
              idle: [...BOSS_DEMON.anim.idle],
              walk: [...BOSS_DEMON.anim.walk],
              run: [...BOSS_DEMON.anim.walk],
              shoot: [...BOSS_DEMON.anim.attack],
              dodge: [...BOSS_DEMON.anim.idle],
              hit: [...BOSS_DEMON.anim.hit],
              death: [...BOSS_DEMON.anim.death],
              ability: [...BOSS_DEMON.anim.attack],
            },
            'boss',
          );
          if (!fallback) continue;
          vis = fallback;
        } else {
          vis = created;
        }
        this.bosses.set(b.id, vis);
        this.root.add(vis.root);
      }
      // CRITICAL: apply simulation position, facing, and visualScale.
      // Without place(), bosses animate at world origin at native GLTF size.
      const scale = b.visualScale > 0.1 ? b.visualScale : def.visualScale * (b.isMega ? SURVIVOR.megaVisualMul : 1);
      const previous = this.bossPose.get(b.id);
      const moved = previous ? Math.hypot(b.x - previous.x, b.z - previous.z) > 0.003 : false;
      this.bossPose.set(b.id, { x: b.x, z: b.z });
      this.place(vis, b.x, b.z, b.facingX, b.facingZ, scale);
      if (vis.animator) {
        if (b.state === 'dead') vis.animator.play('death', 0.08);
        else if (b.state === 'windup' || b.state === 'active') vis.animator.play('shoot', 0.06);
        // Routine weapon ticks use emissive feedback only. Restarting a skeletal hit
        // clip for every tick produced the Blue Demon "stutter step".
        else if (moved) vis.animator.play('walk', 0.14);
        else vis.animator.play('idle');
        vis.animator.update(dt);
      }
      this.flash(vis, b.hitFlash, b.state === 'windup' || b.phase >= 3);
    }
  }

  private syncProjectiles(state: SurvivorState, dt: number): void {
    const alive = new Set(state.projectiles.filter((p) => p.active).map((p) => p.id));
    for (const [id, mesh] of this.projectiles) {
      if (!alive.has(id)) {
        this.root.remove(mesh);
        if (mesh instanceof THREE.Group) this.disposeEffectObject(mesh);
        this.projectiles.delete(id);
      }
    }
    for (const p of state.projectiles) {
      if (!p.active) continue;
      let mesh = this.projectiles.get(p.id);
      if (!mesh) {
        mesh = this.createProjectileActor(p.kind, p.color, p.id);
        this.projectiles.set(p.id, mesh);
        this.root.add(mesh);
      }
      const boomerang = mesh.name === 'projectile-boomerang';
      if (!boomerang) {
        mesh.rotation.y = Math.atan2(p.vx, p.vz);
      }
      if (mesh instanceof THREE.Group && !boomerang) {
        const exhaust = mesh.getObjectByName('projectile-exhaust');
        if (exhaust) {
          const flicker = 0.82 + Math.sin(performance.now() * 0.045 + p.id) * 0.2;
          exhaust.scale.set(1, flicker, 1);
        }
        const bioShell = mesh.getObjectByName('bioplasma-shell');
        if (bioShell) {
          bioShell.rotation.x += dt * 2.4;
          bioShell.rotation.z -= dt * 3.1;
        }
        const bossShell = mesh.getObjectByName('boss-orb-shell');
        if (bossShell) bossShell.rotation.y += dt * 2.8;
        const ringA = mesh.getObjectByName('boss-orb-ring-a');
        const ringB = mesh.getObjectByName('boss-orb-ring-b');
        if (ringA) ringA.rotation.z += dt * 4.2;
        if (ringB) ringB.rotation.x -= dt * 3.3;
        const locator = mesh.getObjectByName('orbital-locator');
        if (locator) locator.rotation.z += dt * 5.5;
      }
      if (boomerang) {
        /*
         * Spin and heading are separate transforms.
         *
         * The blade spins about its own axis at a real, frame-rate-independent rate —
         * the previous code re-assigned `rotation.y` from the velocity every frame and
         * then added one frame's worth of spin, so the disc never actually turned. The
         * wake carries the heading instead, so a player can read both the rotation and
         * the lane at a glance.
         */
        const spinner = mesh.getObjectByName('boomerang-spin');
        const wake = mesh.getObjectByName('boomerang-wake');
        const sign = p.curveSign * (p.returning ? -1 : 1);
        const spin = ((mesh.userData.spin as number | undefined) ?? 0) + sign * 14.5 * dt;
        mesh.userData.spin = spin;
        if (spinner) {
          spinner.rotation.y = spin;
          spinner.position.y = Math.sin(spin * 0.5) * 0.08;
        }
        if (wake) {
          wake.rotation.y = Math.atan2(p.vx, p.vz);
          wake.children.forEach((ghost, i) => {
            const pulse = 0.9 + Math.sin(spin * 0.45 - i * 1.2) * 0.08;
            const base = 0.82 - i * 0.11;
            ghost.scale.setScalar(base * pulse);
          });
        }
        const energy = mesh.getObjectByName('boomerang-energy');
        if (energy instanceof THREE.Mesh && energy.material instanceof THREE.MeshBasicMaterial) {
          energy.material.color.set(p.returning ? '#ffd46a' : '#8ffcff');
          energy.material.opacity = 0.78 + Math.sin(spin * 0.7) * 0.16;
        }
        // Drawn at exactly the authored decorative radius (1.55x collision), rather
        // than the 1.39x the old torus happened to reach.
        mesh.scale.setScalar(Math.max(0.3, p.visualRadius || p.radius));
      }
      const s =
        p.kind === 'drone'
          ? Math.max(1.15, (p.visualRadius || p.radius) / 0.18)
          : p.kind === 'rocket'
            ? Math.max(1.2, (p.visualRadius || p.radius) / 0.25)
            : p.kind === 'bioplasma'
              ? 1.45
              : p.kind === 'boss-orb'
                ? Math.max(2.8, (p.visualRadius || p.radius) * 4.2)
                : p.kind === 'boss-fan'
                  ? Math.max(1.8, (p.visualRadius || p.radius) * 3.5)
                  : p.kind === 'bolt'
                    ? Math.max(0.85, (p.visualRadius || p.radius) / 0.2)
                    : p.kind === 'enemy'
                      ? Math.max(0.8, (p.visualRadius || p.radius) / 0.2)
                      : 1;
      if (!(mesh instanceof THREE.Group)) {
        mesh.scale.setScalar(s);
      } else if (p.kind === 'drone' || p.kind === 'rocket') {
        mesh.scale.setScalar(s);
      } else if (p.kind === 'bioplasma' || p.kind === 'boss-orb' || p.kind === 'boss-fan') {
        mesh.scale.setScalar(Math.max(0.12, p.visualRadius || p.radius));
      } else if (p.kind === 'orbital-marker') {
        mesh.scale.setScalar(Math.max(0.35, (p.visualRadius || p.radius) * 1.6));
      }
      mesh.position.set(
        p.x,
        p.kind === 'rocket' && p.armTimer > 0
          ? 0.1
          : p.kind === 'bioplasma'
            ? 0.85
            : p.kind === 'boss-orb'
              ? 1.15
              : 1.0,
        p.z,
      );
      if (mesh instanceof THREE.Mesh && mesh.material instanceof THREE.MeshStandardMaterial) {
        mesh.material.emissiveIntensity = p.kind === 'bioplasma' ? 2.2 : 1.3;
      }
      if (mesh instanceof THREE.Mesh && p.kind === 'rocket' && p.armTimer > 0) {
        mesh.scale.setScalar(p.explodeRadius * 1.4);
        (mesh.material as THREE.MeshStandardMaterial).opacity = 0.35;
      } else if (mesh instanceof THREE.Mesh && mesh.material instanceof THREE.MeshStandardMaterial) {
        mesh.material.opacity = 0.95;
      }
    }
  }

  /**
   * Shared unit geometries for the Plasma Wake ribbon.
   *
   * Built once and reused by every trail segment. A long-lived trail can hold dozens of
   * live segments at once and they churn constantly, so allocating geometry per segment
   * — as the 2.6.1 disc renderer did — is exactly the uncontrolled churn the GPU
   * stability procedure exists to catch. Marked `sharedGeometry` so segment teardown
   * disposes materials but never these.
   */
  private plasmaQuad: THREE.PlaneGeometry | null = null;
  private plasmaCap: THREE.CircleGeometry | null = null;

  private plasmaGeometry(): { quad: THREE.PlaneGeometry; cap: THREE.CircleGeometry } {
    if (!this.plasmaQuad) {
      // Unit strip: 1x1 in XY, laid flat and scaled per segment.
      this.plasmaQuad = new THREE.PlaneGeometry(1, 1);
    }
    if (!this.plasmaCap) this.plasmaCap = new THREE.CircleGeometry(1, 18);
    return { quad: this.plasmaQuad, cap: this.plasmaCap };
  }

  /**
   * One layer of the trail ribbon.
   *
   * Two things changed in the endless-2.8.0 readability pass, and both are the reason
   * the trail used to sit *on top of* the game:
   *
   * - `depthTest` is on. Every layer previously disabled it and asked for render order
   *   18, which is an instruction to draw over the entire scene — so the ribbon painted
   *   straight through the hero, the horde and the bosses standing in it. The strips sit
   *   a few centimetres above the floor, so with depth testing restored an actor
   *   standing on the trail correctly occludes it.
   * - Additive blending is now opt-in per layer rather than universal. Additive is what
   *   made the trail bleach to white: stacked ember + body + core all summing into the
   *   framebuffer cannot resolve to anything else. Only the thin core and the ignition
   *   sparks are additive now; the plasma body composites normally.
   *
   * Render order is explicit per layer so the stack is deterministic. Transparent
   * objects are otherwise depth-sorted against each other, and these are millimetres
   * apart.
   */
  private plasmaLayer(
    geo: THREE.BufferGeometry,
    color: string,
    opacity: number,
    name: string,
    y: number,
    opts: { additive?: boolean; order?: number } = {},
  ): THREE.Mesh {
    const mesh = new THREE.Mesh(geo, this.effectMat(color, opacity, opts.additive ?? false));
    mesh.userData.sharedGeometry = true;
    mesh.userData.ownsGeometry = false;
    mesh.userData.ownsMaterial = true;
    mesh.userData.baseOpacity = opacity;
    mesh.name = name;
    mesh.rotation.x = -Math.PI / 2;
    mesh.position.y = y;
    mesh.renderOrder = opts.order ?? 8;
    const mat = mesh.material as THREE.MeshBasicMaterial;
    mat.depthTest = true;
    mat.depthWrite = false;
    mat.polygonOffset = true;
    mat.polygonOffsetFactor = -2;
    mat.polygonOffsetUnits = -2;
    return mesh;
  }

  /**
   * One burning trail segment.
   *
   * Three stacked strips (ember shell → fire body → diffuse plasma glow) plus round caps at both
   * ends. The caps are what make consecutive segments read as one continuous ribbon:
   * because each segment starts exactly where the previous ended, a disc of the same
   * half-width at the joint closes the corner on turns.
   */
  private createPlasmaSegment(): THREE.Object3D {
    const { quad, cap } = this.plasmaGeometry();
    const g = new THREE.Group();
    // Magnetically contained aurora: an inky violet sheath surrounding a broad,
    // saturated glow. There are deliberately no bright longitudinal rails; those read
    // as choppy white lines when adjacent capsules turned at ship speed.
    g.add(this.plasmaLayer(quad, '#130b38', 0.62, 'pw-ember', 0.2, { order: 7 }));
    g.add(this.plasmaLayer(cap, '#130b38', 0.62, 'pw-ember-cap0', 0.2, { order: 7 }));
    g.add(this.plasmaLayer(cap, '#130b38', 0.62, 'pw-ember-cap1', 0.2, { order: 7 }));
    g.add(this.plasmaLayer(quad, '#5c2bc7', 0.5, 'pw-fire', 0.205, { order: 8 }));
    g.add(this.plasmaLayer(cap, '#5c2bc7', 0.5, 'pw-fire-cap0', 0.205, { order: 8 }));
    g.add(this.plasmaLayer(cap, '#5c2bc7', 0.5, 'pw-fire-cap1', 0.205, { order: 8 }));
    g.add(this.plasmaLayer(quad, '#36bddd', 0.34, 'pw-glow', 0.212, { order: 9 }));
    g.add(this.plasmaLayer(cap, '#36bddd', 0.34, 'pw-glow-cap0', 0.212, { order: 9 }));
    g.add(this.plasmaLayer(cap, '#36bddd', 0.34, 'pw-glow-cap1', 0.212, { order: 9 }));
    // Three travelling charge knots sell flow along even an old, stationary segment.
    for (let i = 0; i < 3; i += 1) {
      const tongue = this.plasmaLayer(cap, i % 2 === 0 ? '#42cee5' : '#d85ac5', 0.42, 'pw-tongue', 0.195, {
        additive: true,
        order: 10,
      });
      tongue.userData.tonguePhase = i * 2.094;
      tongue.userData.tongueAt = i / 3;
      g.add(tongue);
    }
    return g;
  }

  /**
   * Per-layer cooling ramps for the Plasma Wake, newest → oldest.
   *
   * Authored as explicit stops rather than a hue rotation so each layer cools on its own
   * curve: the core abandons white almost immediately, the fire body holds orange much
   * longer, and the ember shell ends at a dull ash that still reads on a dark floor.
   */
  private static readonly PLASMA_HEAT: Record<string, readonly string[]> = {
    'pw-glow': ['#55d5e7', '#40bbdb', '#a34fc1', '#54206f', '#1c102a'],
    'pw-fire': ['#8754ed', '#6231c3', '#45228d', '#28164d', '#100a22'],
    'pw-ember': ['#352069', '#25164e', '#1b1039', '#110a25', '#080714'],
  };

  /** Sample a ramp at `k` in [0,1] with linear interpolation between stops. */
  private static rampAt(stops: readonly string[], k: number, out: THREE.Color): void {
    const clamped = k < 0 ? 0 : k > 1 ? 1 : k;
    const span = clamped * (stops.length - 1);
    const i = Math.min(stops.length - 2, Math.floor(span));
    out.set(stops[i]!);
    out.lerp(new THREE.Color(stops[i + 1]!), span - i);
  }

  private applyPlasmaHeat(obj: THREE.Object3D, age: number): void {
    for (const child of obj.children) {
      if (!(child instanceof THREE.Mesh)) continue;
      const mat = child.material;
      if (!(mat instanceof THREE.MeshBasicMaterial)) continue;
      const name = child.name;
      const key = name.startsWith('pw-glow')
        ? 'pw-glow'
        : name.startsWith('pw-fire')
          ? 'pw-fire'
          : name.startsWith('pw-ember')
            ? 'pw-ember'
            : name === 'pw-tongue'
              ? 'pw-glow'
              : null;
      if (!key) continue;
      SurvivorRenderer.rampAt(SurvivorRenderer.PLASMA_HEAT[key]!, age, mat.color);
    }
  }

  /**
   * Place a segment's meshes on the authoritative capsule the simulation owns.
   *
   * The strip length is the true segment length and the strip/cap width is the true
   * collision half-width, so what burns on screen is exactly what damages.
   */
  private layoutPlasmaSegment(obj: THREE.Object3D, h: SurvivorState['hazards'][0], t: number): void {
    const ax = h.x;
    const az = h.z;
    const bx = h.x1;
    const bz = h.z1;
    const dx = bx - ax;
    const dz = bz - az;
    const len = Math.hypot(dx, dz);
    const w = h.radius;
    const midX = (ax + bx) / 2;
    const midZ = (az + bz) / 2;
    obj.position.set(midX, 0, midZ);
    // Plane is authored in XY then laid flat, so +Y maps to world -Z: yaw accordingly.
    obj.rotation.y = Math.atan2(dx, dz);

    const age = 1 - t;
    /*
     * Cooling (endless-2.8.0 readability pass).
     *
     * 2.7.0 held full strength for 45% of the life and then eased down. That meant
     * roughly half of a four-second trail was drawn at maximum brightness, and because
     * every layer was additive and depth-test-disabled, "maximum brightness" meant a
     * white ribbon painted over the hero and the horde standing in it. The trail is
     * dangerous residual plasma; it should look like something that is going out.
     *
     * The damage curve is untouched: `hazardPotency` still holds full strength for
     * `emberStart` (45%) and decays to `emberFloor`. This is presentation cooling only,
     * and it runs faster than the damage falloff on purpose — a lingering segment should
     * look spent slightly before it *is* spent, never the other way round.
     */
    const cool = age < 0.18 ? 1 : 1 - ((age - 0.18) / 0.82) * 0.55;
    // Ignition: a brief flash on the freshest sliver of a segment's life, so the player
    // still sees exactly where the trail is being laid down.
    const ignite = age < 0.12 ? 1 + (1 - age / 0.12) * 0.9 : 1;
    const flicker = 0.88 + Math.sin(performance.now() * 0.009 + h.id * 0.7) * 0.12;
    /*
     * Each layer walks its own cooling ramp, so the filament goes magenta -> violet ->
     * out while the shell drops through ember to near-black. No geometry, lifetime or
     * damage changes here: the strip is still scaled to `h.radius` and `len`, the
     * simulation's authoritative capsule.
     */
    this.applyPlasmaHeat(obj, age);

    for (const child of obj.children) {
      if (!(child instanceof THREE.Mesh)) continue;
      const base = (child.userData.baseOpacity as number | undefined) ?? 0.5;
      const mat = child.material as THREE.MeshBasicMaterial;
      const n = child.name;
      let widthMul = 1;
      if (n.startsWith('pw-ember')) widthMul = 1.0;
      else if (n.startsWith('pw-fire')) widthMul = 0.78;
      else if (n.startsWith('pw-glow')) widthMul = 0.48;

      if (n === 'pw-ember' || n === 'pw-fire' || n === 'pw-glow') {
        /*
         * Strip: X = cross-track width, Y (pre-rotation) = along-track length.
         *
         * The outer shell is the footprint the player reads, and it is drawn at exactly
         * `h.radius` — the same half-width `hazardHitsPoint` tests the capsule against.
         * Only the inner layers narrow, and only the inner layers cool inward, so the
         * visible edge of the trail never contracts away from the damaging edge.
         */
        const narrow = n === 'pw-ember' ? 1 : cool;
        child.scale.set(w * 2 * widthMul * narrow, Math.max(0.001, len), 1);
        child.position.set(0, child.position.y, 0);
        const heat = n === 'pw-glow' ? flicker * ignite : 1;
        mat.opacity = Math.max(0.03, base * t * cool * heat);
      } else if (n.endsWith('cap0') || n.endsWith('cap1')) {
        const end = n.endsWith('cap0') ? -len / 2 : len / 2;
        const narrow = n.startsWith('pw-ember') ? 1 : cool;
        child.scale.setScalar(w * widthMul * narrow);
        child.position.set(0, child.position.y, end);
        mat.opacity = Math.max(0.03, base * t * cool);
      } else if (n === 'pw-tongue') {
        const phase = (child.userData.tonguePhase as number) ?? 0;
        const at = (child.userData.tongueAt as number) ?? 0.5;
        const clock = performance.now() * 0.0007;
        const travel = (at + clock + h.id * 0.071) % 1;
        const knot = 0.75 + Math.sin(performance.now() * 0.012 + phase) * 0.25;
        child.scale.setScalar(w * 0.16 * knot * cool);
        child.position.set(
          Math.sin(travel * Math.PI * 2 + phase) * w * 0.34,
          child.position.y,
          -len / 2 + len * travel,
        );
        mat.opacity = Math.max(0, base * t * cool * knot);
      }
    }
  }

  /**
   * Cleanup Crew allied Titans.
   *
   * Each ally owns one lazily-built group holding that hero's real Mech model and real
   * ship model — the same GLTF assets the player uses, cloned once per ally when the
   * squad arrives and disposed when it leaves. Nothing is reloaded or re-cloned per
   * frame; arrival, combat and departure only toggle visibility and move transforms.
   */
  private syncAllies(state: SurvivorState, dt: number): void {
    const alive = new Set(state.allies.filter((a) => a.active).map((a) => a.id));
    for (const [id, vis] of this.allies) {
      if (alive.has(id)) continue;
      this.root.remove(vis.root);
      this.disposeEffectObject(vis.root);
      this.allies.delete(id);
    }

    for (const a of state.allies) {
      if (!a.active) continue;
      let vis = this.allies.get(a.id);
      if (!vis) {
        vis = this.createAlly(a.heroId);
        this.allies.set(a.id, vis);
        this.root.add(vis.root);
      }
      /*
       * Measure how hard this ally is moving before the transform is overwritten.
       * Speed is converted to a 0-1 thrust against the ally's own top speed and damped,
       * so a squadmate crossing the arena burns hard and one holding station idles.
       */
      const moved = Math.hypot(a.x - vis.prevX, a.z - vis.prevZ);
      vis.prevX = a.x;
      vis.prevZ = a.z;
      const speed = dt > 0 ? moved / dt : 0;
      const want = Math.min(1, speed / ALLY_JET_FULL_SPEED);
      const k = Math.min(1, dt * ALLY_JET_DAMPING);
      vis.thrust += (want - vis.thrust) * k;

      vis.root.position.set(a.x, 0, a.z);
      vis.root.rotation.y = Math.atan2(a.facingX, a.facingZ);

      // Ship carries the hero in and out; the Mech is what actually fights.
      const inTransit = a.phase !== 'active';
      if (vis.ship) {
        vis.ship.visible = inTransit;
        // Bank and lift while flying so a transport reads as a transport.
        vis.ship.position.y = inTransit ? 2.6 : 0;
        vis.ship.rotation.z = inTransit ? Math.sin(state.time * 3) * 0.16 : 0;
      }
      if (vis.mech) {
        vis.mech.root.visible = !inTransit;
        vis.mech.animator?.update(dt);
        // Lean into the burn. Local +Z is the ally's facing, so a positive X rotation
        // tips it forward along the direction it is actually correcting toward.
        vis.mech.root.rotation.x = inTransit ? 0 : vis.thrust * ALLY_JET_MAX_TILT;
      }
      // Jets belong to the Mech, not the transport: the ship has its own trail.
      this.layoutAllyJets(vis, !inTransit);
      if (vis.trail) {
        vis.trail.visible = inTransit;
        const mat = vis.trail.material as THREE.MeshBasicMaterial;
        mat.opacity = inTransit ? 0.62 : 0;
      }
      if (vis.glow) {
        // Deployment light: bright on landing, steady while fighting.
        const mat = vis.glow.material as THREE.MeshBasicMaterial;
        mat.opacity = a.phase === 'active' ? 0.3 : 0.6;
        vis.glow.rotation.z = state.time * 1.4;
      }
    }
  }

  private createAlly(heroId: keyof typeof HEROES): AllyVis {
    const hero = HEROES[heroId];
    const root = new THREE.Group();
    root.name = `ally-${heroId}`;

    const mech = this.makeFromUrl(hero.mech.url, hero.mech.anim, 'mech');
    if (mech) {
      mech.root.scale.setScalar(1.0);
      root.add(mech.root);
      mech.animator?.play('idle');
    }

    let ship: THREE.Object3D | null = null;
    const shipClone = this.assets.clone(hero.shipUrl);
    if (shipClone) {
      ship = shipClone.root;
      root.add(ship);
    }

    // Landing streak behind the transport.
    const trail = new THREE.Mesh(
      new THREE.PlaneGeometry(0.9, 7),
      this.effectMat(hero.accent, 0.62, true),
    );
    trail.userData.ownsGeometry = true;
    trail.rotation.x = -Math.PI / 2;
    trail.position.set(0, 0.12, -3.6);
    root.add(trail);

    // Allied ground marker so the player can always tell friend from horde.
    const glow = new THREE.Mesh(
      new THREE.RingGeometry(1.05, 1.5, 32),
      this.effectMat(hero.accent, 0.4, true),
    );
    glow.userData.ownsGeometry = true;
    glow.rotation.x = -Math.PI / 2;
    glow.position.y = 0.06;
    root.add(glow);

    /*
     * Thruster plumes.
     *
     * Allies hover and slide across the floor with nothing holding them up, which reads
     * as a model being dragged rather than as a squadmate flying. Two small downward
     * jets under the Mech answer that: a faint idle burn while holding station, a
     * stronger one while correcting position.
     *
     * A cone's apex is at +Y and its base at -Y, which is already the shape of a
     * downward exhaust — narrow at the nozzle, flaring onto the ground. Scaling it in Y
     * grows the plume; `layoutAllyJets` moves the mesh to keep the nozzle fixed.
     */
    const jets: THREE.Object3D[] = [];
    for (const side of [-1, 1]) {
      const jet = new THREE.Group();
      jet.name = 'ally-jet';
      const plume = new THREE.Mesh(
        new THREE.ConeGeometry(0.17, ALLY_JET_HEIGHT, 8, 1, true),
        this.effectMat(hero.accent, 0.5, true),
      );
      plume.userData.ownsGeometry = true;
      plume.name = 'ally-jet-plume';
      const core = new THREE.Mesh(
        new THREE.ConeGeometry(0.075, ALLY_JET_HEIGHT * 0.62, 6, 1, true),
        this.effectMat('#fff2c8', 0.8, true),
      );
      core.userData.ownsGeometry = true;
      core.name = 'ally-jet-core';
      jet.add(plume, core);
      jet.position.set(side * 0.42, 0, 0.02);
      root.add(jet);
      jets.push(jet);
    }

    return { root, mech, ship, trail, glow, jets, prevX: 0, prevZ: 0, thrust: 0 };
  }

  /**
   * Burn the plumes in proportion to how hard the ally is correcting its position.
   *
   * Thrust is smoothed rather than taken raw: an ally re-targets on a 0.85s timer and
   * can change heading between steps, and an unsmoothed plume strobes on that. The idle
   * floor is deliberately non-zero — a hovering astronaut is still holding itself up.
   */
  private layoutAllyJets(vis: AllyVis, visible: boolean): void {
    for (const jet of vis.jets) {
      jet.visible = visible;
      if (!visible) continue;
      const burn = ALLY_JET_IDLE + (1 - ALLY_JET_IDLE) * vis.thrust;
      // Flicker keeps the flame alive without another moving part to tune.
      const flicker = 0.9 + Math.sin(performance.now() * 0.021 + jet.position.x * 7) * 0.1;
      for (const child of jet.children) {
        if (!(child instanceof THREE.Mesh)) continue;
        const core = child.name === 'ally-jet-core';
        const h = ALLY_JET_HEIGHT * (core ? 0.62 : 1);
        const len = burn * flicker * (core ? 0.8 : 1);
        child.scale.set(0.85 + burn * 0.3, len, 0.85 + burn * 0.3);
        // Keep the nozzle pinned while the plume grows downward.
        child.position.y = ALLY_JET_NOZZLE_Y - (h * len) / 2;
        const mat = child.material as THREE.MeshBasicMaterial;
        mat.opacity = (core ? 0.75 : 0.42) * (0.45 + 0.55 * burn);
      }
    }
  }

  /**
   * Gravity Pulse well — dark violet, and deliberately not part of the hostile palette.
   *
   * Boss danger footprints are red/magenta. A player control field that the player wants
   * to stand next to must never read as something to run from, so the well is built from
   * deep violet: a near-black event horizon, a bright accretion rim at the true damage
   * radius, and counter-rotating debris arcs that make "this is still holding" legible in
   * a crowd without adding another red shape to the floor.
   */
  private createGravityWell(): THREE.Object3D {
    const g = new THREE.Group();

    // Outer falloff at the exact collision radius: the field you see is the field that pulls.
    const halo = this.ownMesh(
      new THREE.Mesh(new THREE.CircleGeometry(1, 28), this.effectMat('#6a2fb5', 0.26)),
    );
    halo.rotation.x = -Math.PI / 2;
    halo.position.y = 0.035;
    halo.userData.baseOpacity = 0.26;
    halo.userData.wellRole = 'halo';
    g.add(halo);

    // Accretion rim, sitting just inside the radius so the boundary stays readable.
    const rim = this.ownMesh(
      new THREE.Mesh(new THREE.RingGeometry(0.82, 1.0, 32), this.effectMat('#b98cff', 0.55, true)),
    );
    rim.rotation.x = -Math.PI / 2;
    rim.position.y = 0.045;
    rim.userData.baseOpacity = 0.55;
    rim.userData.wellRole = 'rim';
    g.add(rim);

    // Event horizon: the core enemies gather around rather than collapse into.
    const core = this.ownMesh(
      new THREE.Mesh(new THREE.CircleGeometry(1, 24), this.effectMat('#160726', 0.82)),
    );
    core.rotation.x = -Math.PI / 2;
    core.position.y = 0.05;
    core.userData.baseOpacity = 0.82;
    core.userData.wellRole = 'core';
    g.add(core);

    // Two counter-rotating debris arcs — motion is what says "persistent", not "flash".
    for (let i = 0; i < 2; i += 1) {
      const arc = this.ownMesh(
        new THREE.Mesh(
          new THREE.RingGeometry(0.5 + i * 0.16, 0.58 + i * 0.16, 24, 1, 0, Math.PI * (i === 0 ? 1.1 : 0.8)),
          this.effectMat(i === 0 ? '#8f57e0' : '#d8b6ff', 0.5, true),
        ),
      );
      arc.rotation.x = -Math.PI / 2;
      arc.position.y = 0.055 + i * 0.002;
      arc.userData.baseOpacity = 0.5;
      arc.userData.wellRole = 'arc';
      arc.userData.spin = i === 0 ? 3.1 : -4.4;
      g.add(arc);
    }
    // Lensing core: a physical void above the floor, crossed by two tilted accretion
    // planes. Depth testing stays on so enemies visibly pass in front of their own pull.
    const voidCore = this.ownMesh(
      new THREE.Mesh(new THREE.IcosahedronGeometry(1, 2), this.effectMat('#030108', 0.96)),
    );
    voidCore.name = 'gravity-void';
    voidCore.userData.baseOpacity = 0.96;
    voidCore.userData.wellRole = 'void';
    voidCore.userData.wellScale = 0.12;
    voidCore.position.y = 0.5;
    g.add(voidCore);
    for (let i = 0; i < 2; i += 1) {
      const lens = this.ownMesh(
        new THREE.Mesh(
          new THREE.TorusGeometry(1, 0.055, 8, 48),
          this.effectMat(i === 0 ? '#c9a4ff' : '#55e6ff', 0.72, true),
        ),
      );
      lens.name = `gravity-lens-${i}`;
      lens.userData.baseOpacity = 0.72;
      lens.userData.wellRole = 'lens';
      lens.userData.wellScale = 0.31 + i * 0.07;
      lens.userData.spin = i === 0 ? 2.6 : -2.1;
      lens.rotation.x = Math.PI * (0.37 + i * 0.18);
      lens.position.y = 0.48;
      g.add(lens);
    }
    // Bounded orbiting fragments provide parallax and show inward motion in a crowd.
    for (let i = 0; i < 8; i += 1) {
      const shard = this.ownMesh(
        new THREE.Mesh(
          new THREE.TetrahedronGeometry(1, 0),
          this.effectMat(i % 2 === 0 ? '#b77cff' : '#70eaff', 0.72, true),
        ),
      );
      shard.name = `gravity-shard-${i}`;
      shard.userData.baseOpacity = 0.72;
      shard.userData.wellRole = 'shard';
      shard.userData.wellScale = 0.025 + (i % 3) * 0.008;
      shard.userData.orbit = 0.4 + (i % 4) * 0.12;
      shard.userData.phase = (i / 8) * Math.PI * 2;
      shard.userData.spin = i % 2 === 0 ? 2.2 : -2.8;
      g.add(shard);
    }
    return g;
  }

  /**
   * Lay the well out on its authoritative footprint.
   *
   * `h.radius` is the collision radius, so the halo is scaled to exactly that. The core
   * is scaled to `coreFraction`, which is the same number the simulation stops pulling
   * at — the visible "safe" centre is the real one.
   */
  private layoutGravityWell(obj: THREE.Object3D, h: SurvivorState['hazards'][0], t: number): void {
    obj.position.set(h.x, 0, h.z);
    const coreFraction = SURVIVOR.gravityWell.coreFraction;
    // Collapse in fast, then hold: the field is at full extent for almost all of its life.
    const settle = Math.min(1, (1 - t) * 6);
    for (const child of obj.children) {
      if (!(child instanceof THREE.Mesh)) continue;
      const role = child.userData.wellRole as string | undefined;
      const base = (child.userData.baseOpacity as number | undefined) ?? 0.4;
      const authoredScale = (child.userData.wellScale as number | undefined) ?? 1;
      const scale = role === 'core' ? h.radius * coreFraction : h.radius * authoredScale;
      child.scale.setScalar(Math.max(0.001, scale * (0.35 + 0.65 * settle)));
      if (role === 'arc') {
        child.rotation.z = (child.userData.spin as number) * (h.maxLife - h.life);
      } else if (role === 'lens') {
        child.rotation.z = (child.userData.spin as number) * (h.maxLife - h.life);
        child.position.y = 0.38 + h.radius * 0.035;
      } else if (role === 'void') {
        child.rotation.y = (h.maxLife - h.life) * 1.7;
        child.position.y = 0.34 + h.radius * 0.045;
      } else if (role === 'shard') {
        const phase = (child.userData.phase as number) + (h.maxLife - h.life) * (child.userData.spin as number);
        const orbit = (child.userData.orbit as number) * h.radius * (0.45 + 0.55 * settle);
        child.position.set(Math.cos(phase) * orbit, 0.2 + (Math.sin(phase * 1.7) * 0.5 + 0.5) * h.radius * 0.09, Math.sin(phase) * orbit);
        child.rotation.x = phase * 1.3;
        child.rotation.y = phase * 1.8;
      }
      if (child.material instanceof THREE.MeshBasicMaterial) {
        // Hold opacity flat, then fade only over the last fifth of the life.
        const fade = t > 0.2 ? 1 : t / 0.2;
        child.material.opacity = Math.max(0.04, base * fade * (0.4 + 0.6 * settle));
      }
    }
  }

  private syncHazards(state: SurvivorState): void {
    const alive = new Set(state.hazards.filter((h) => h.active).map((h) => h.id));
    for (const [id, obj] of this.hazards) {
      if (!alive.has(id)) {
        this.root.remove(obj);
        this.disposeEffectObject(obj);
        this.hazards.delete(id);
      }
    }
    for (const h of state.hazards) {
      if (!h.active) continue;
      let obj = this.hazards.get(h.id);
      if (!obj) {
        if (h.kind === 'plasma-wake') {
          obj = this.createPlasmaSegment();
        } else if (h.kind === 'gravity-well') {
          obj = this.createGravityWell();
        } else {
          const ring = this.ownMesh(new THREE.Mesh(
            new THREE.CircleGeometry(1, 20),
            this.effectMat(h.color, h.kind === 'wake' ? 0.45 : 0.4),
          ));
          ring.rotation.x = -Math.PI / 2;
          ring.userData.baseOpacity = h.kind === 'wake' ? 0.45 : 0.4;
          obj = ring;
        }
        this.hazards.set(h.id, obj);
        this.root.add(obj);
      }
      const t = h.life / h.maxLife;
      if (h.kind === 'plasma-wake') {
        this.layoutPlasmaSegment(obj, h, t);
        continue;
      }
      if (h.kind === 'gravity-well') {
        this.layoutGravityWell(obj, h, t);
        continue;
      }
      obj.position.set(h.x, h.kind === 'wake' ? 0.18 : 0.16, h.z);
      /*
       * The disc is the hazard, at exactly `h.radius`.
       *
       * It previously grew 0.85x -> 1.05x across its life, so a boss Contamination pool
       * authored at 3.4 was drawn at 2.89 for most of the window the player was reading
       * it. `updateHazards` damages inside `radius + playerRadius`, so the visible edge
       * sat almost a full unit inside the damaging one, and standing "just outside the
       * purple" still hurt. One authored radius, drawn and tested.
       */
      obj.scale.setScalar(Math.max(0.001, h.radius));
      /*
       * An arming hazard has not landed yet. `updateHazards` skips damage entirely while
       * `armTimer > 0`, so drawing it at full strength shows a live floor that cannot
       * hurt anyone: the visible dangerous window has to be the damaging window.
       */
      const arming = h.armTimer > 0;
      obj.traverse((c) => {
        if (c instanceof THREE.Mesh && c.material instanceof THREE.MeshBasicMaterial) {
          const base = (c.userData.baseOpacity as number | undefined) ?? (h.kind === 'wake' ? 0.5 : 0.42);
          c.material.opacity = Math.max(0.08, t * base * (arming ? 0.45 : 1));
        }
      });
    }
  }

  private syncPickups(state: SurvivorState): void {
    const alive = new Set(state.pickups.filter((p) => p.active).map((p) => p.id));
    for (const [id, obj] of this.pickups) {
      if (!alive.has(id)) {
        this.root.remove(obj);
        this.disposeEffectObject(obj);
        this.pickups.delete(id);
      }
    }
    for (const p of state.pickups) {
      if (!p.active) continue;
      let obj = this.pickups.get(p.id);
      if (!obj) {
        const g = new THREE.Group();
        g.name = p.kind === 'xp' ? 'pickup-energy' : 'pickup-repair';
        const sharedPickupMesh = (
          geometry: THREE.BufferGeometry,
          material: THREE.MeshBasicMaterial,
          name: string,
        ): THREE.Mesh => {
          const mesh = new THREE.Mesh(geometry, material);
          mesh.name = name;
          mesh.userData.sharedGeometry = true;
          mesh.userData.ownsGeometry = false;
          mesh.userData.ownsMaterial = true;
          return mesh;
        };
        if (p.kind === 'xp') {
          // Energy: faceted core, transparent crystalline shell and a non-spherical coil.
          const s = p.premium ? 1.35 : 1;
          const core = sharedPickupMesh(
            this.pickupEnergyCoreGeo,
            this.effectMat(p.premium ? '#73ffd5' : '#16cfe0', 0.92, false),
            'energy-core',
          );
          // Normal blending holds the cyan silhouette against both bright floor panels and
          // dark corridors; additive white is reserved for the narrow moving coil.
          const shellMat = this.effectMat(p.premium ? '#a5ffe0' : '#5ae4f3', p.premium ? 0.62 : 0.5, false);
          shellMat.wireframe = true;
          const shell = sharedPickupMesh(
            this.pickupEnergyShellGeo,
            shellMat,
            'energy-shell',
          );
          const coil = sharedPickupMesh(
            this.pickupEnergyCoilGeo,
            this.effectMat(p.premium ? '#ffe27a' : '#b1fff5', p.premium ? 0.56 : 0.48, true),
            'energy-coil',
          );
          coil.rotation.x = Math.PI / 2;
          core.scale.setScalar(s);
          shell.scale.setScalar(s);
          coil.scale.setScalar(s);
          g.add(shell, core, coil);
        } else {
          // Repair: a warm cross in a hexagonal frame — distinct from energy in grayscale.
          const shellMat = this.effectMat('#ff3158', 0.2, false);
          shellMat.wireframe = true;
          const shell = sharedPickupMesh(
            this.pickupRepairShellGeo,
            shellMat,
            'repair-shell',
          );
          const frame = sharedPickupMesh(
            this.pickupRepairFrameGeo,
            this.effectMat('#ff496b', 0.84, true),
            'repair-frame',
          );
          const core = sharedPickupMesh(
            this.pickupRepairCoreGeo,
            this.effectMat('#ff8a78', 0.72, true),
            'repair-core',
          );
          const cross = sharedPickupMesh(
            this.pickupRepairCrossGeo,
            this.effectMat('#fff7ed', 0.98, true),
            'repair-cross',
          );
          shell.rotation.y = Math.PI / 4;
          cross.position.y = 0.03;
          g.add(shell, frame, core, cross);
        }
        obj = g;
        this.pickups.set(p.id, obj);
        this.root.add(obj);
      }
      if (p.kind === 'repair') {
        // Slow strong pulse + optional magnet trail tint.
        const bob = 0.62 + Math.sin(performance.now() * 0.005 + p.id) * 0.16;
        obj.position.set(p.x, bob, p.z);
        obj.rotation.y += 0.013;
        const frame = obj.getObjectByName('repair-frame');
        const shell = obj.getObjectByName('repair-shell');
        if (frame) frame.rotation.y -= 0.024;
        if (shell) shell.rotation.y += 0.01;
        const full = state.player.health >= state.player.maxHealth - 0.01;
        const expiring = Number.isFinite(p.life) && p.life < SURVIVOR.repairPickupWarnLife;
        const pulse = expiring
          ? 0.4 + Math.sin(performance.now() * 0.035) * 0.45
          : 0.85 + Math.sin(performance.now() * 0.006) * 0.15;
        obj.traverse((c) => {
          if (c instanceof THREE.Mesh && c.material instanceof THREE.MeshBasicMaterial) {
            if (!c.userData.baseOp) c.userData.baseOp = c.material.opacity;
            const base = c.userData.baseOp as number;
            c.material.opacity = base * (full ? 0.32 : pulse);
          }
        });
        const baseScale = 1.18;
        obj.scale.setScalar(
          full ? baseScale * 0.72 : expiring ? baseScale * (0.95 + Math.sin(performance.now() * 0.03) * 0.12) : baseScale,
        );
        if (p.magnetized && !full && this.animFrame % 4 === 0) {
          // Faint pink magnet trail (short-lived pooled effects).
        }
      } else if (p.kind === 'xp') {
        // Fast crystalline shell and counter-rotating coil; smaller than repair.
        const bob = 0.5 + Math.sin(performance.now() * 0.01 + p.id) * 0.1;
        obj.position.set(p.x, bob, p.z);
        obj.rotation.y += 0.045;
        const shell = obj.getObjectByName('energy-shell');
        const coil = obj.getObjectByName('energy-coil');
        if (shell) shell.rotation.z += 0.022;
        if (coil) coil.rotation.z -= 0.055;
        obj.scale.setScalar(p.premium ? 1.18 : 1);
      } else {
        const bob = 0.55 + Math.sin(performance.now() * 0.008 + p.id) * 0.12;
        obj.position.set(p.x, bob, p.z);
        obj.rotation.y += 0.04;
      }
    }
  }

  private ensureShield(): THREE.Group {
    if (this.shieldRoot) return this.shieldRoot;
    const g = new THREE.Group();
    g.name = 'aegis-barrier';
    // Full-volume ellipsoidal shell (scaled non-uniformly per form).
    const shellMat = this.effectMat('#66d8ff', 0.32, true);
    shellMat.depthWrite = false;
    this.shieldMats.push(shellMat);
    const shell = new THREE.Mesh(new THREE.SphereGeometry(1, 32, 24), shellMat);
    shell.name = 'shield-shell';
    const rimMat = this.effectMat('#e0f8ff', 0.65, true);
    rimMat.depthWrite = false;
    this.shieldMats.push(rimMat);
    const rim = new THREE.Mesh(new THREE.TorusGeometry(0.98, 0.035, 8, 48), rimMat);
    rim.rotation.x = Math.PI / 2;
    rim.name = 'shield-rim';
    const hexMat = this.effectMat('#88e8ff', 0.38, true);
    hexMat.depthWrite = false;
    this.shieldMats.push(hexMat);
    const hex = new THREE.Mesh(new THREE.TorusGeometry(0.88, 0.022, 6, 6), hexMat);
    hex.rotation.x = Math.PI / 2.5;
    hex.name = 'shield-hex';
    const hex2 = hex.clone();
    hex2.rotation.z = Math.PI / 3;
    hex2.name = 'shield-hex2';
    const innerMat = this.effectMat('#f0fcff', 0.14, true);
    innerMat.depthWrite = false;
    this.shieldMats.push(innerMat);
    const inner = new THREE.Mesh(new THREE.SphereGeometry(0.82, 24, 18), innerMat);
    inner.name = 'shield-inner';
    g.add(shell, rim, hex, hex2, inner);
    g.visible = false;
    this.root.add(g);
    this.shieldRoot = g;
    return g;
  }

  private syncShield(state: SurvivorState, _dt: number): void {
    const g = this.ensureShield();
    const p = state.player;
    const active = p.shieldPoints > 0 && p.shieldTime > 0 && p.alive;
    if (!active) {
      g.visible = false;
      this.shieldWasActive = false;
      return;
    }
    if (!this.shieldWasActive) g.scale.set(0.15, 0.15, 0.15);
    this.shieldWasActive = true;
    g.visible = true;
    // Form-specific ellipsoids that fully enclose the silhouette.
    let sx = 1.35;
    let sy = 1.85;
    let sz = 1.35;
    let cy = 1.05;
    if (p.form === 'mech') {
      sx = 2.15;
      sy = 2.75;
      sz = 2.15;
      cy = 1.35;
    } else if (p.form === 'ship') {
      sx = 3.1;
      sy = 1.45;
      sz = 3.4;
      cy = 0.7;
    }
    g.position.set(p.x, cy, p.z);
    const frac = p.shieldMax > 0 ? Math.max(0.25, p.shieldPoints / p.shieldMax) : 1;
    const grow = 0.94 + frac * 0.12;
    const tx = sx * grow;
    const ty = sy * grow;
    const tz = sz * grow;
    g.scale.x += (tx - g.scale.x) * 0.2;
    g.scale.y += (ty - g.scale.y) * 0.2;
    g.scale.z += (tz - g.scale.z) * 0.2;
    const t = performance.now() * 0.001;
    const hex = g.getObjectByName('shield-hex');
    const hex2 = g.getObjectByName('shield-hex2');
    const rim = g.getObjectByName('shield-rim');
    if (hex) hex.rotation.z = t * 0.9;
    if (hex2) hex2.rotation.z = -t * 0.7;
    if (rim) rim.rotation.z = t * 0.35;
    const intensity = 0.78 + Math.sin(t * 4) * 0.08 * frac;
    g.traverse((c) => {
      if (c instanceof THREE.Mesh && c.material instanceof THREE.MeshBasicMaterial) {
        if (!c.userData.baseOp) c.userData.baseOp = c.material.opacity;
        c.material.opacity = (c.userData.baseOp as number) * intensity * (0.6 + frac * 0.5);
      }
    });
  }

  private ensureCacheActor(): THREE.Group {
    if (this.cacheActor) return this.cacheActor;
    const g = new THREE.Group();
    g.name = 'protocol-cache';
    // Core container
    const core = new THREE.Mesh(
      new THREE.OctahedronGeometry(0.55, 1),
      this.effectMat('#ffd46a', 0.95, true),
    );
    const shell = new THREE.Mesh(
      new THREE.IcosahedronGeometry(0.85, 0),
      this.effectMat('#66e8ff', 0.35, true),
    );
    // Animated rings
    const ringA = new THREE.Mesh(
      new THREE.TorusGeometry(1.15, 0.06, 8, 40),
      this.effectMat('#ffd46a', 0.85, true),
    );
    ringA.rotation.x = Math.PI / 2;
    ringA.name = 'cache-ring-a';
    const ringB = new THREE.Mesh(
      new THREE.TorusGeometry(1.45, 0.045, 8, 48),
      this.effectMat('#66e8ff', 0.7, true),
    );
    ringB.rotation.x = Math.PI / 2;
    ringB.name = 'cache-ring-b';
    // Vertical light beam
    const beam = new THREE.Mesh(
      new THREE.CylinderGeometry(0.16, 0.48, 16, 16, 1, true),
      this.effectMat('#ffe8a0', 0.46, true),
    );
    beam.position.y = 8;
    beam.name = 'cache-beam';
    // Ground marker
    const ground = new THREE.Mesh(
      new THREE.RingGeometry(1.2, 1.85, 48),
      this.effectMat('#ffd46a', 0.55, true),
    );
    ground.rotation.x = -Math.PI / 2;
    ground.position.y = 0.04;
    // Inner pulse light
    const pulse = new THREE.Mesh(
      new THREE.SphereGeometry(0.35, 12, 12),
      this.effectMat('#ffffff', 0.9, true),
    );
    pulse.name = 'cache-pulse';
    g.add(ground, shell, core, ringA, ringB, beam, pulse);
    // Four floating signal fins make the Cache readable through a full late-game horde.
    for (let i = 0; i < 4; i += 1) {
      const fin = new THREE.Mesh(
        new THREE.OctahedronGeometry(0.24, 0),
        this.effectMat(i % 2 === 0 ? '#ffd46a' : '#66e8ff', 0.82, true),
      );
      const a = (i / 4) * Math.PI * 2;
      fin.position.set(Math.cos(a) * 1.75, 1.2 + (i % 2) * 0.45, Math.sin(a) * 1.75);
      fin.name = `cache-fin-${i}`;
      g.add(fin);
    }
    g.visible = false;
    this.root.add(g);
    this.cacheActor = g;
    return g;
  }

  private syncCache(state: SurvivorState): void {
    const g = this.ensureCacheActor();
    const c = state.cache;
    if (!c.active) {
      g.visible = false;
      return;
    }
    g.visible = true;
    g.position.set(c.x, 0, c.z);
    const t = performance.now() * 0.001;
    const near =
      Math.hypot(state.player.x - c.x, state.player.z - c.z) <= SURVIVOR.cacheCollectRadius + 1.5;
    const intensity = near ? 1.35 : 1;
    const ringA = g.getObjectByName('cache-ring-a');
    const ringB = g.getObjectByName('cache-ring-b');
    const pulse = g.getObjectByName('cache-pulse');
    const beam = g.getObjectByName('cache-beam');
    if (ringA) {
      ringA.rotation.z = t * 1.2;
      ringA.scale.setScalar(intensity);
    }
    if (ringB) {
      ringB.rotation.z = -t * 0.85;
      ringB.scale.setScalar(0.95 + Math.sin(t * 3) * 0.08 * intensity);
    }
    if (pulse) {
      pulse.scale.setScalar((0.85 + Math.sin(t * 5) * 0.25) * intensity);
    }
    if (beam) {
      beam.scale.y = 1 + Math.sin(t * 2.4) * 0.08;
    }
    for (let i = 0; i < 4; i += 1) {
      const fin = g.getObjectByName(`cache-fin-${i}`);
      if (!fin) continue;
      const a = t * (i % 2 === 0 ? 0.75 : -0.62) + (i / 4) * Math.PI * 2;
      fin.position.x = Math.cos(a) * 1.75;
      fin.position.z = Math.sin(a) * 1.75;
      fin.position.y = 1.25 + Math.sin(t * 2.8 + i) * 0.35;
      fin.rotation.y = -a;
    }
    // Proximity feedback: slight lift + brighter scale
    g.scale.setScalar(near ? 1.18 : 1);
    g.position.y = near ? 0.15 : 0;
  }

  private ensureGunship(): THREE.Object3D {
    if (this.gunshipRoot) return this.gunshipRoot;
    let root: THREE.Object3D | null = null;
    if (this.heroShipUrl) {
      const cloned = this.assets.clone(this.heroShipUrl);
      if (cloned) root = cloned.root;
    }
    if (!root) {
      // Procedural fallback ship if asset missing
      const g = new THREE.Group();
      const body = new THREE.Mesh(
        new THREE.ConeGeometry(0.6, 2.4, 8),
        this.effectMat(this.heroAccent, 0.95, true),
      );
      body.rotation.x = Math.PI / 2;
      g.add(body);
      root = g;
    }
    root.visible = false;
    // Thrusters for the flyover
    const thruster = new THREE.Group();
    thruster.name = 'gunship-thrusters';
    const makeCone = (x: number, color: string) => {
      const m = this.effectMat(color, 0.85, true);
      this.gunshipMats.push(m);
      const cone = new THREE.Mesh(new THREE.ConeGeometry(0.18, 1.4, 8, 1, true), m);
      cone.rotation.x = Math.PI / 2;
      cone.position.set(x, 0.15, -1.1);
      thruster.add(cone);
    };
    makeCone(-0.28, '#fffef5');
    makeCone(0.28, this.heroAccent);
    root.add(thruster);
    const weapons = new THREE.Group();
    weapons.name = 'gunship-weapons';
    for (const side of [-1, 1]) {
      const podMat = this.effectMat('#18283e', 0.96);
      this.gunshipMats.push(podMat);
      const pod = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.16, 0.78, 8), podMat);
      pod.rotation.x = Math.PI / 2;
      pod.position.set(side * 0.54, -0.08, 0.35);
      pod.userData.ownsGeometry = true;
      pod.userData.ownsMaterial = false;
      const muzzleMat = this.effectMat('#ffd46a', 0.2, true);
      this.gunshipMats.push(muzzleMat);
      const muzzle = new THREE.Mesh(new THREE.SphereGeometry(0.15, 8, 6), muzzleMat);
      muzzle.name = `gunship-muzzle-${side}`;
      muzzle.position.set(side * 0.54, -0.08, 0.78);
      muzzle.userData.ownsGeometry = true;
      muzzle.userData.ownsMaterial = false;
      weapons.add(pod, muzzle);
    }
    root.add(weapons);
    this.root.add(root);
    this.gunshipRoot = root;
    return root;
  }

  private syncGunship(state: SurvivorState, _dt: number): void {
    const g = state.gunship;
    const root = this.ensureGunship();
    if (!g.active) {
      root.visible = false;
      return;
    }
    root.visible = true;
    const height = SURVIVOR.gunship.flyHeight;
    // During warning, park just off the start edge slightly raised; then fly the lane.
    root.position.set(g.x, height, g.z);
    root.rotation.y = Math.atan2(g.facingX, g.facingZ);
    // The cache flyby is air support, not a boss collider. Keep it clearly larger than
    // the player's ship while leaving the firing lane, cannon beams and ground threats
    // visible beneath it.
    root.scale.setScalar(SURVIVOR.actorScale.ship * 0.78);
    const thr = root.getObjectByName('gunship-thrusters');
    if (thr) {
      const flicker = 0.85 + Math.sin(performance.now() * 0.05) * 0.2;
      thr.scale.set(1, 1, g.firing ? 1.2 * flicker : 0.7);
    }
    for (const side of [-1, 1]) {
      const muzzle = root.getObjectByName(`gunship-muzzle-${side}`);
      if (muzzle instanceof THREE.Mesh && muzzle.material instanceof THREE.MeshBasicMaterial) {
        const cadence = Math.max(0, Math.sin((g.t - g.warnDuration) * Math.PI * 2 / SURVIVOR.gunship.fireInterval));
        muzzle.material.opacity = g.firing ? 0.2 + cadence * 0.8 : 0.08;
        muzzle.scale.setScalar(g.firing ? 0.8 + cadence * 0.9 : 0.55);
      }
    }
  }

  private disposeEffectObject(obj: THREE.Object3D): void {
    const seenGeo = new Set<THREE.BufferGeometry>();
    const seenMat = new Set<THREE.Material>();
    obj.traverse((c) => {
      if (c instanceof THREE.Mesh) {
        const g = c.geometry;
        // Effect meshes always own their geometry unless shared pool marker is set.
        if (g && !seenGeo.has(g) && c.userData.ownsGeometry !== false && !c.userData.sharedGeometry) {
          seenGeo.add(g);
          g.dispose();
        }
        const mats = Array.isArray(c.material) ? c.material : [c.material];
        for (const m of mats) {
          if (m && !seenMat.has(m) && (c.userData.ownsMaterial || m.userData?.owned)) {
            seenMat.add(m);
            m.dispose();
          }
        }
      }
    });
  }

  /** Mark mesh as owning its geometry/material for dispose. */
  private ownMesh(mesh: THREE.Mesh): THREE.Mesh {
    mesh.userData.ownsGeometry = true;
    return mesh;
  }

  private syncEffects(state: SurvivorState): void {
    const alive = new Set(state.effects.map((e) => e.id));
    for (const [id, obj] of this.effects) {
      if (!alive.has(id)) {
        this.root.remove(obj);
        this.disposeEffectObject(obj);
        this.effects.delete(id);
      }
    }
    for (const e of state.effects) {
      let obj = this.effects.get(e.id);
      if (!obj) {
        obj = this.createEffect(e);
        this.effects.set(e.id, obj);
        this.root.add(obj);
      }
      const t = 1 - e.life / e.maxLife;
      /*
       * Radius-bearing effects follow the shared ground-effect contract: a telegraph
       * holds its authored radius, a blast expands to it and stops. Nothing that stands
       * for a gameplay boundary is ever drawn wider than the region that damages.
       */
      if (e.kind === 'gunship-shot') {
        obj.scale.setScalar(1);
      } else if (isBoundaryEffect(e.kind)) {
        obj.scale.setScalar(groundEffectScale(e.kind, t));
      } else if (e.kind === 'fleet-ship') {
        obj.scale.setScalar(1);
        const fx = e.facingX ?? 0;
        const fz = e.facingZ ?? 1;
        const len = e.length ?? 30;
        obj.position.set(e.x + fx * len * t, 6.5 + Math.sin(t * Math.PI) * 1.2, e.z + fz * len * t);
      } else if (e.kind === 'singularity') {
        // The outer ring is the true pull radius, so hold the group at full scale. The
        // motion lives inside it: accretion planes counter-rotate and motes spiral in.
        obj.scale.setScalar(1);
        obj.children.forEach((child) => {
          if (child.name.startsWith('singularity-ring-')) {
            child.rotation.z =
              ((child.userData.baseZ as number | undefined) ?? 0) +
              t * Math.PI * 2 * ((child.userData.spin as number | undefined) ?? 1);
          } else if (child.name.startsWith('singularity-mote-')) {
            const phase = (child.userData.phase as number) + t * Math.PI * 2 * (child.userData.spin as number);
            const orbit = (child.userData.orbit as number) * (1 - t * 0.7) * (e.radius ?? 16);
            child.position.set(
              Math.cos(phase) * orbit,
              0.25 + Math.sin(phase * 1.8) * 0.45 + (e.radius ?? 16) * 0.035,
              Math.sin(phase) * orbit,
            );
            child.rotation.x = phase * 1.4;
            child.rotation.y = phase * 1.9;
          } else if (child.name === 'singularity-lens') {
            child.scale.setScalar(0.9 + Math.sin(t * 28) * 0.12);
          }
        });
      } else {
        obj.scale.setScalar(groundEffectScale(e.kind, t));
      }
      if (e.kind === 'pulsar') {
        const a = obj.getObjectByName('pulsar-ring-a');
        const b = obj.getObjectByName('pulsar-ring-b');
        const star = obj.getObjectByName('pulsar-star');
        if (a) a.rotation.z = t * 2.6;
        if (b) b.rotation.z = -t * 4.1;
        if (star) {
          star.rotation.y = t * 8;
          star.rotation.x = t * 5;
        }
      } else if (e.kind === 'gravity-collapse') {
        const ring = obj.getObjectByName('gravity-collapse-ring');
        if (ring) ring.rotation.z = -t * 5.5;
      } else if (e.kind === 'boomerang-rift') {
        const arc = obj.getObjectByName('boomerang-rift-arc');
        if (arc) arc.rotation.z = t * 9;
      } else if (e.kind === 'mech-hive') {
        const crown = obj.getObjectByName('mech-hive-crown');
        const core = obj.getObjectByName('mech-hive-core');
        if (crown) crown.rotation.z = t * Math.PI * 3;
        if (core) {
          core.rotation.x = t * 8;
          core.rotation.y = t * 11;
        }
        for (let i = 0; i < 7; i += 1) {
          const cell = obj.getObjectByName(`mech-hive-cell-${i}`);
          if (!cell) continue;
          const phase = (cell.userData.phase as number) + t * Math.PI * 1.8;
          const radius = (e.radius ?? 4.8) * (0.42 + t * 0.26);
          cell.position.x = Math.sin(phase) * radius;
          cell.position.z = Math.cos(phase) * radius;
          cell.rotation.z = phase;
        }
      } else if (e.kind === 'mech-prism') {
        const core = obj.getObjectByName('mech-prism-core');
        const aperture = obj.getObjectByName('mech-prism-aperture');
        if (core) core.rotation.z = t * 9;
        if (aperture) aperture.rotation.z = t * 6;
      } else if (e.kind === 'mech-gravity') {
        for (let i = 0; i < 3; i += 1) {
          const ring = obj.getObjectByName(`mech-gravity-ring-${i}`);
          if (ring) ring.rotation.z = t * (3.2 + i * 1.4) * ((ring.userData.spin as number) ?? 1);
        }
        const core = obj.getObjectByName('mech-gravity-core');
        if (core) {
          const pulse = 1 + Math.sin(t * 24) * 0.1;
          core.scale.set(pulse, 0.42, pulse);
        }
      } else if (e.kind === 'mech-meteor') {
        const ignition = obj.getObjectByName('mech-meteor-ignition');
        const core = obj.getObjectByName('mech-meteor-core');
        if (ignition) ignition.rotation.z = -t * 7;
        if (core) {
          core.rotation.x = t * 10;
          core.rotation.y = t * 13;
          core.position.y = 1.25 + Math.sin(t * Math.PI) * 2.1;
        }
        for (let i = 0; i < 6; i += 1) {
          const flare = obj.getObjectByName(`mech-meteor-flare-${i}`);
          if (flare) {
            flare.position.y =
              1.15 + Math.sin(Math.min(1, t * 1.3) * Math.PI) * (1.5 + i * 0.12);
          }
        }
      }
      obj.traverse((c) => {
        if (c instanceof THREE.Mesh && c.material instanceof THREE.MeshBasicMaterial) {
          // Don't mutate shared materials' base opacity destructively every frame —
          // use a per-mesh userData factor via material opacity clone when needed
          if (!c.userData.baseOpacity) c.userData.baseOpacity = c.material.opacity;
          const base = c.userData.baseOpacity as number;
          c.material.opacity = Math.max(0, base * (1 - t * 0.95));
        }
      });
    }
  }

  /** Live pool/map sizes for the GPU stability overlay. */
  poolStats(): { effects: number; attacks: number; railPool: number } {
    return {
      effects: this.effects.size,
      attacks: this.attackPool.length,
      railPool: this.railPool.length,
    };
  }

  private basic(color: string, opacity: number, additive = false): THREE.MeshBasicMaterial {
    const key = `${color}:${opacity}:${additive ? 1 : 0}`;
    let m = this.basicMats.get(key);
    if (!m) {
      m = new THREE.MeshBasicMaterial({
        color,
        transparent: true,
        opacity,
        side: THREE.DoubleSide,
        depthWrite: false,
        blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending,
      });
      this.basicMats.set(key, m);
    }
    return m;
  }

  /** Clone cached materials so per-frame opacity fade never poisons shared mats. */
  private effectMat(color: string, opacity: number, additive = false): THREE.MeshBasicMaterial {
    const m = this.basic(color, opacity, additive).clone();
    m.userData.owned = true;
    return m;
  }

  private createEffect(e: SurvivorState['effects'][0]): THREE.Object3D {
    const g = new THREE.Group();
    const color = e.color;
    if (e.kind === 'mech-hive') {
      const r = e.radius ?? e.scale ?? 4.8;
      const field = this.ownMesh(new THREE.Mesh(
        new THREE.CircleGeometry(r * 0.78, 48),
        this.effectMat('#153b52', 0.2),
      ));
      field.rotation.x = -Math.PI / 2;
      field.position.y = 0.08;
      field.name = 'mech-hive-field';
      const crown = this.ownMesh(new THREE.Mesh(
        new THREE.TorusGeometry(r * 0.52, 0.055, 6, 48),
        this.effectMat(color, 0.72, true),
      ));
      crown.rotation.x = Math.PI / 2;
      crown.position.y = 0.48;
      crown.name = 'mech-hive-crown';
      g.add(field, crown);
      for (let i = 0; i < 7; i += 1) {
        const a = (i / 7) * Math.PI * 2;
        const cell = this.ownMesh(new THREE.Mesh(
          new THREE.RingGeometry(0.34, 0.5, 6),
          this.effectMat(i % 2 ? '#76f4ff' : color, 0.76, true),
        ));
        cell.rotation.x = -Math.PI / 2;
        cell.position.set(Math.sin(a) * r * 0.55, 0.12 + (i % 2) * 0.14, Math.cos(a) * r * 0.55);
        cell.name = `mech-hive-cell-${i}`;
        cell.userData.phase = a;
        g.add(cell);
      }
      const core = this.ownMesh(new THREE.Mesh(
        new THREE.IcosahedronGeometry(0.64, 1),
        this.effectMat('#55dff0', 0.74, true),
      ));
      core.position.y = 1.05;
      core.name = 'mech-hive-core';
      g.add(core);
      g.position.set(e.x, 0, e.z);
      return g;
    }
    if (e.kind === 'mech-prism') {
      const len = e.length ?? e.scale ?? 20;
      const width = e.width ?? 2.2;
      const fx = e.facingX ?? 0;
      const fz = e.facingZ ?? 1;
      const px = -fz;
      const pz = fx;
      for (let i = -1; i <= 1; i += 1) {
        const lane = this.ownMesh(new THREE.Mesh(
          new THREE.BoxGeometry(Math.max(0.12, width * 0.13), 0.11, len),
          this.effectMat(i === 0 ? color : '#ff6fd5', i === 0 ? 0.72 : 0.48, true),
        ));
        lane.position.set(fx * len * 0.5 + px * i * width * 0.38, 0.85 + Math.abs(i) * 0.18, fz * len * 0.5 + pz * i * width * 0.38);
        lane.rotation.y = Math.atan2(fx, fz);
        lane.name = `mech-prism-lane-${i + 1}`;
        lane.userData.phase = i;
        g.add(lane);
      }
      const prism = this.ownMesh(new THREE.Mesh(
        new THREE.OctahedronGeometry(1.15, 0),
        this.effectMat(color, 0.76, true),
      ));
      prism.position.y = 1.45;
      prism.rotation.y = Math.atan2(fx, fz);
      prism.scale.set(0.72, 1.35, 0.72);
      prism.name = 'mech-prism-core';
      const aperture = this.ownMesh(new THREE.Mesh(
        new THREE.TorusGeometry(1.45, 0.09, 6, 32),
        this.effectMat('#ff89dc', 0.74, true),
      ));
      aperture.position.set(fx * 0.55, 1.45, fz * 0.55);
      aperture.rotation.y = Math.atan2(fx, fz);
      aperture.name = 'mech-prism-aperture';
      g.add(prism, aperture);
      g.position.set(e.x, 0, e.z);
      return g;
    }
    if (e.kind === 'mech-gravity') {
      const r = e.radius ?? e.scale ?? 6.6;
      const well = this.ownMesh(new THREE.Mesh(
        new THREE.CircleGeometry(r, 64),
        this.effectMat('#071827', 0.48),
      ));
      well.rotation.x = -Math.PI / 2;
      well.position.y = 0.07;
      well.name = 'mech-gravity-well';
      g.add(well);
      for (let i = 0; i < 3; i += 1) {
        const ring = this.ownMesh(new THREE.Mesh(
          new THREE.RingGeometry(r * (0.26 + i * 0.22), r * (0.29 + i * 0.22), 64),
          this.effectMat(i === 1 ? '#73f2ff' : color, 0.5 - i * 0.08, true),
        ));
        ring.rotation.x = -Math.PI / 2;
        ring.position.y = 0.1 + i * 0.035;
        ring.name = `mech-gravity-ring-${i}`;
        ring.userData.spin = i % 2 ? -1 : 1;
        g.add(ring);
      }
      for (let i = 0; i < 12; i += 1) {
        const a = (i / 12) * Math.PI * 2;
        const tether = this.ownMesh(new THREE.Mesh(
          new THREE.ConeGeometry(r * 0.025, r * 0.46, 3, 1, true),
          this.effectMat(i % 3 === 0 ? '#94f7ff' : color, 0.36, true),
        ));
        tether.rotation.z = Math.PI / 2;
        tether.rotation.y = -a;
        tether.position.set(Math.sin(a) * r * 0.58, 0.16, Math.cos(a) * r * 0.58);
        tether.name = 'mech-gravity-tether';
        g.add(tether);
      }
      const core = this.ownMesh(new THREE.Mesh(
        new THREE.SphereGeometry(Math.max(0.5, r * 0.11), 24, 14),
        this.effectMat('#02070d', 0.94),
      ));
      core.scale.y = 0.42;
      core.position.y = 0.38;
      core.name = 'mech-gravity-core';
      g.add(core);
      g.position.set(e.x, 0, e.z);
      return g;
    }
    if (e.kind === 'mech-meteor') {
      const r = e.radius ?? e.scale ?? 5.4;
      const ignition = this.ownMesh(new THREE.Mesh(
        new THREE.RingGeometry(r * 0.28, r * 0.72, 48),
        this.effectMat('#ff5b30', 0.34, true),
      ));
      ignition.rotation.x = -Math.PI / 2;
      ignition.position.y = 0.1;
      ignition.name = 'mech-meteor-ignition';
      g.add(ignition);
      for (let i = 0; i < 6; i += 1) {
        const a = (i / 6) * Math.PI * 2;
        const flare = this.ownMesh(new THREE.Mesh(
          new THREE.ConeGeometry(0.18, 2.5, 6, 1, true),
          this.effectMat(i % 2 ? '#ff9b3e' : color, 0.7, true),
        ));
        flare.position.set(Math.sin(a) * r * 0.4, 1.15, Math.cos(a) * r * 0.4);
        flare.rotation.z = Math.sin(a) * 0.62;
        flare.rotation.x = Math.cos(a) * 0.62;
        flare.name = `mech-meteor-flare-${i}`;
        flare.userData.phase = a;
        g.add(flare);
      }
      const core = this.ownMesh(new THREE.Mesh(
        new THREE.DodecahedronGeometry(0.78, 0),
        this.effectMat('#ffb047', 0.78, true),
      ));
      core.position.y = 1.25;
      core.name = 'mech-meteor-core';
      g.add(core);
      g.position.set(e.x, 0, e.z);
      return g;
    }
    if (e.kind === 'gravity-collapse') {
      const r = e.radius ?? e.scale ?? 3;
      const well = this.ownMesh(new THREE.Mesh(new THREE.CircleGeometry(r, 56), this.effectMat('#5f2bb8', 0.24)));
      well.rotation.x = -Math.PI / 2;
      well.position.y = 0.07;
      const horizon = this.ownMesh(new THREE.Mesh(new THREE.RingGeometry(r * 0.72, r, 64), this.effectMat('#c69cff', 0.82, true)));
      horizon.rotation.x = -Math.PI / 2;
      horizon.position.y = 0.09;
      horizon.name = 'gravity-collapse-ring';
      const core = this.ownMesh(new THREE.Mesh(new THREE.SphereGeometry(r * 0.13, 20, 12), this.effectMat('#07000e', 0.94)));
      core.scale.y = 0.38;
      core.position.y = r * 0.08;
      g.add(well, horizon, core);
      for (let i = 0; i < 10; i += 1) {
        const ray = this.ownMesh(new THREE.Mesh(
          new THREE.BoxGeometry(r * 0.035, 0.035, r * 0.52),
          this.effectMat(i % 2 ? '#68ecff' : '#d6b2ff', 0.48, true),
        ));
        const a = (i / 10) * Math.PI * 2;
        ray.position.set(Math.sin(a) * r * 0.45, 0.12, Math.cos(a) * r * 0.45);
        ray.rotation.y = a;
        ray.name = 'gravity-collapse-ray';
        g.add(ray);
      }
      g.position.set(e.x, 0, e.z);
      return g;
    }
    if (e.kind === 'pulsar') {
      const r = e.radius ?? e.scale ?? 8;
      const wash = this.ownMesh(new THREE.Mesh(new THREE.CircleGeometry(r, 72), this.effectMat('#174f70', 0.16)));
      wash.rotation.x = -Math.PI / 2;
      wash.position.y = 0.06;
      const outer = this.ownMesh(new THREE.Mesh(new THREE.RingGeometry(r * 0.89, r, 80), this.effectMat('#83f7ff', 0.92, true)));
      outer.rotation.x = -Math.PI / 2;
      outer.position.y = 0.1;
      outer.name = 'pulsar-ring-a';
      const harmonic = this.ownMesh(new THREE.Mesh(new THREE.RingGeometry(r * 0.48, r * 0.54, 64), this.effectMat('#bc8cff', 0.56, true)));
      harmonic.rotation.x = -Math.PI / 2;
      harmonic.position.y = 0.11;
      harmonic.name = 'pulsar-ring-b';
      const star = this.ownMesh(new THREE.Mesh(new THREE.IcosahedronGeometry(Math.max(0.45, r * 0.1), 2), this.effectMat('#e8ffff', 0.84, true)));
      star.position.y = Math.max(0.55, r * 0.075);
      star.name = 'pulsar-star';
      g.add(wash, outer, harmonic, star);
      for (let i = 0; i < 12; i += 1) {
        const spoke = this.ownMesh(new THREE.Mesh(
          new THREE.ConeGeometry(r * 0.022, r * 0.46, 4, 1, true),
          this.effectMat(i % 3 === 0 ? '#d4a3ff' : '#61eaff', 0.46, true),
        ));
        const a = (i / 12) * Math.PI * 2;
        spoke.rotation.z = Math.PI / 2;
        spoke.rotation.y = -a;
        spoke.position.set(Math.sin(a) * r * 0.44, 0.15, Math.cos(a) * r * 0.44);
        spoke.name = 'pulsar-spoke';
        g.add(spoke);
      }
      g.position.set(e.x, 0, e.z);
      return g;
    }
    if (e.kind === 'boomerang-rift') {
      const r = e.radius ?? e.scale ?? 1.3;
      const arc = this.ownMesh(new THREE.Mesh(
        new THREE.RingGeometry(r * 0.42, r, 48, 1, -0.55, Math.PI * 1.45),
        this.effectMat(color, 0.78, true),
      ));
      arc.rotation.x = -Math.PI / 2;
      arc.position.y = 0.15;
      arc.name = 'boomerang-rift-arc';
      const inner = this.ownMesh(new THREE.Mesh(new THREE.RingGeometry(r * 0.18, r * 0.28, 36), this.effectMat('#8ffcff', 0.62, true)));
      inner.rotation.x = -Math.PI / 2;
      inner.position.y = 0.16;
      g.add(arc, inner);
      g.position.set(e.x, 0, e.z);
      return g;
    }
    if (e.kind === 'gunship-shot') {
      const fx = e.facingX ?? 0;
      const fz = e.facingZ ?? 1;
      const side = e.width ?? 0;
      const px = -fz;
      const pz = fx;
      const len = e.length ?? 5;
      const beam = this.ownMesh(new THREE.Mesh(
        new THREE.CylinderGeometry(0.055, 0.13, Math.hypot(len, SURVIVOR.gunship.flyHeight), 6),
        this.effectMat('#ffd46a', 0.96, true),
      ));
      const start = new THREE.Vector3(px * side, SURVIVOR.gunship.flyHeight - 0.45, pz * side);
      const end = new THREE.Vector3(fx * len + px * side, 0.08, fz * len + pz * side);
      beam.position.copy(start).add(end).multiplyScalar(0.5);
      beam.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), end.clone().sub(start).normalize());
      beam.name = 'gunship-cannon-beam';
      const flash = this.ownMesh(new THREE.Mesh(new THREE.SphereGeometry(0.28, 10, 7), this.effectMat('#fff5c7', 0.92, true)));
      flash.position.copy(start);
      g.add(beam, flash);
      g.position.set(e.x, 0, e.z);
      return g;
    }
    if (e.kind === 'rail') {
      const len = e.length ?? 10;
      const mesh = this.ownMesh(
        new THREE.Mesh(new THREE.BoxGeometry(e.width ?? 0.4, 0.15, len), this.effectMat(color, 0.85)),
      );
      mesh.userData.baseOpacity = 0.85;
      mesh.position.set((e.facingX ?? 0) * len * 0.5, 1.1, (e.facingZ ?? 1) * len * 0.5);
      mesh.rotation.y = Math.atan2(e.facingX ?? 0, e.facingZ ?? 1);
      g.add(mesh);
      g.position.set(e.x, 0, e.z);
      return g;
    }
    if (e.kind === 'arc') {
      // Jagged white-core/cyan-glow lightning. Segmented boxes are cheaper and more
      // deterministic than allocating TubeGeometry on every chain jump.
      const len = Math.max(0.2, e.length ?? 1);
      const fx = (e.facingX ?? 0) / len;
      const fz = (e.facingZ ?? 1) / len;
      const px = -fz;
      const pz = fx;
      const segments = Math.max(4, Math.min(10, Math.ceil(len / 1.2)));
      const points: Array<{ x: number; z: number }> = [{ x: 0, z: 0 }];
      for (let i = 1; i < segments; i += 1) {
        const u = i / segments;
        const jitter = Math.sin((i * 19.37 + e.id * 0.73) * 2.1) * Math.min(0.34, len * 0.055);
        points.push({ x: fx * len * u + px * jitter, z: fz * len * u + pz * jitter });
      }
      points.push({ x: fx * len, z: fz * len });
      const addSegment = (a: { x: number; z: number }, b: { x: number; z: number }, width: number, mat: THREE.Material) => {
        mat.depthTest = false;
        const dx = b.x - a.x;
        const dz = b.z - a.z;
        const l = Math.hypot(dx, dz) || 0.01;
        const mesh = this.ownMesh(new THREE.Mesh(new THREE.BoxGeometry(width, width, l), mat));
        mesh.position.set((a.x + b.x) / 2, 2.8, (a.z + b.z) / 2);
        mesh.rotation.y = Math.atan2(dx, dz);
        mesh.renderOrder = 30;
        g.add(mesh);
      };
      for (let i = 0; i < points.length - 1; i += 1) {
        addSegment(points[i]!, points[i + 1]!, 0.3, this.effectMat('#33ddff', 0.5, true));
        addSegment(points[i]!, points[i + 1]!, 0.1, this.effectMat('#ffffff', 1, true));
      }
      for (const p of [points[0]!, points[points.length - 1]!]) {
        const flash = this.ownMesh(new THREE.Mesh(new THREE.SphereGeometry(0.28, 8, 8), this.effectMat('#eaffff', 0.9, true)));
        (flash.material as THREE.Material).depthTest = false;
        flash.renderOrder = 31;
        flash.position.set(p.x, 2.8, p.z);
        g.add(flash);
      }
      g.position.set(e.x, 0, e.z);
      return g;
    }
    if (e.kind === 'orbital') {
      const r = e.radius ?? e.scale ?? 1.6;
      for (const [mul, op] of [[1, 0.75], [0.68, 0.55], [0.35, 0.4]] as const) {
        const ring = this.ownMesh(new THREE.Mesh(new THREE.RingGeometry(r * mul * 0.86, r * mul, 48), this.effectMat('#ffd46a', op, true)));
        ring.rotation.x = -Math.PI / 2;
        ring.position.y = 0.07;
        g.add(ring);
      }
      const aim = this.ownMesh(new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.12, 8, 8), this.effectMat('#fff4c8', 0.25, true)));
      aim.position.y = 4;
      g.add(aim);
      g.position.set(e.x, 0, e.z);
      g.traverse((o) => {
        if (o instanceof THREE.Mesh) {
          o.material.depthTest = false;
          o.renderOrder = 24;
        }
      });
      return g;
    }
    if (e.kind === 'orbital-strike') {
      /*
       * The beam establishes the orbital origin. The *impact* is what says how much
       * ground was hit, and that is `orbital-shock`.
       *
       * 2.7.0 inverted this. The lance was a 22-unit column nearly as wide as the whole
       * damage radius, with a 0.98-opacity white core, held for 0.4s — so the weapon
       * named for an orbital strike read as a giant beam of light and the player never
       * saw the area that actually resolved. It is now thin and brief: a narrow shaft
       * that connects sky to ground, a small bright flash at the point of contact, and
       * then it is gone and the shockwave owns the frame.
       */
      const r = e.radius ?? e.scale ?? 1.6;
      const beam = this.ownMesh(
        new THREE.Mesh(new THREE.CylinderGeometry(r * 0.1, r * 0.2, 22, 12, 1, true), this.effectMat('#ffd46a', 0.42, true)),
      );
      beam.position.y = 11;
      const core = this.ownMesh(
        new THREE.Mesh(new THREE.CylinderGeometry(r * 0.045, r * 0.1, 21, 10), this.effectMat('#fff0c0', 0.8, true)),
      );
      core.position.y = 10.5;
      // Contact flash: bright, small, and over almost immediately. It marks the point
      // of impact without claiming to be the damaged area.
      const flash = this.ownMesh(
        new THREE.Mesh(new THREE.SphereGeometry(r * 0.34, 14, 10), this.effectMat('#fff4d0', 0.9, true)),
      );
      flash.scale.y = 0.55;
      flash.position.y = r * 0.2;
      g.add(beam, core, flash);
      g.position.set(e.x, 0, e.z);
      g.traverse((o) => {
        if (o instanceof THREE.Mesh) {
          o.material.depthTest = false;
          o.renderOrder = 32;
        }
      });
      return g;
    }
    if (e.kind === 'orbital-shock') {
      /*
       * The impact. This is the part of the sequence that communicates the damaged area,
       * so it carries both of the strike's real boundaries.
       *
       * Orbital resolves in two concentric zones — a heavy core and a wider shockwave at
       * 37.5% — and a target is damaged by exactly one of them. Both are drawn: the
       * leading ring expands to the outer radius `r`, and a second ring marks the core
       * boundary at `1 / shockwaveRadiusMul` of it. The player can see which zone they
       * or a boss were standing in.
       *
       * `syncEffects` expands the whole group from the centre out to exactly `r` under
       * the shared ground-effect contract, so the geometry is authored full size here
       * and never over-draws the damaging radius.
       */
      const r = e.radius ?? e.scale ?? 2.5;
      const coreFrac = 1 / SURVIVOR.orbital.shockwaveRadiusMul;
      const ring = this.ownMesh(new THREE.Mesh(new THREE.RingGeometry(r * 0.82, r, 64), this.effectMat('#ffd46a', 0.72, true)));
      ring.rotation.x = -Math.PI / 2;
      ring.position.y = 0.09;
      const coreEdge = this.ownMesh(
        new THREE.Mesh(new THREE.RingGeometry(r * coreFrac * 0.9, r * coreFrac, 64), this.effectMat('#ff9a3c', 0.5, true)),
      );
      coreEdge.rotation.x = -Math.PI / 2;
      coreEdge.position.y = 0.088;
      const wash = this.ownMesh(
        new THREE.Mesh(new THREE.CircleGeometry(r * coreFrac, 48), this.effectMat('#ff7a3c', 0.22, true)),
      );
      wash.rotation.x = -Math.PI / 2;
      wash.position.y = 0.082;
      g.add(wash, coreEdge, ring);
      /*
       * Ejecta. Eight shards, fixed at construction and carried outward by the group's
       * own expansion — no per-frame allocation, no particle system, and bounded by
       * construction rather than by a cap that has to be enforced.
       */
      for (let i = 0; i < 8; i += 1) {
        const shard = this.ownMesh(
          new THREE.Mesh(new THREE.ConeGeometry(r * 0.05, r * 0.22, 4), this.effectMat(i % 2 ? '#ffd46a' : '#ff9a3c', 0.75, true)),
        );
        const a = (i / 8) * Math.PI * 2 + 0.19;
        shard.position.set(Math.sin(a) * r * 0.88, 0.22, Math.cos(a) * r * 0.88);
        shard.rotation.z = Math.PI * 0.5;
        shard.rotation.y = -a;
        g.add(shard);
      }
      g.position.set(e.x, 0, e.z);
      g.traverse((o) => {
        if (o instanceof THREE.Mesh) {
          o.material.depthTest = false;
          o.renderOrder = 30;
        }
      });
      return g;
    }
    if (e.kind === 'orbital-scorch') {
      // Flat residue disc, drawn under the horde rather than over it.
      const r = e.radius ?? e.scale ?? 2;
      const disc = this.ownMesh(new THREE.Mesh(new THREE.CircleGeometry(r, 40), this.effectMat('#ff7a24', 0.34, true)));
      disc.rotation.x = -Math.PI / 2;
      disc.position.y = 0.045;
      const edge = this.ownMesh(new THREE.Mesh(new THREE.RingGeometry(r * 0.82, r, 40), this.effectMat('#ffb347', 0.4, true)));
      edge.rotation.x = -Math.PI / 2;
      edge.position.y = 0.05;
      g.add(disc, edge);
      g.position.set(e.x, 0, e.z);
      g.traverse((o) => {
        if (o instanceof THREE.Mesh) o.renderOrder = 6;
      });
      return g;
    }
    if (e.kind === 'fleet-ship') {
      let ship: THREE.Object3D | null = null;
      if (this.heroShipUrl) ship = this.assets.clone(this.heroShipUrl)?.root ?? null;
      if (ship) {
        ship.scale.setScalar(1.15);
        ship.traverse((o) => {
          if (o instanceof THREE.Mesh) {
            o.userData.ownsGeometry = false;
            o.userData.ownsMaterial = false;
          }
        });
        g.add(ship);
      } else {
        const body = this.ownMesh(new THREE.Mesh(new THREE.ConeGeometry(0.72, 3.4, 8), this.effectMat('#e9f6ff', 0.95, true)));
        body.rotation.x = Math.PI / 2;
        const wing = this.ownMesh(new THREE.Mesh(new THREE.BoxGeometry(3.2, 0.15, 1.1), this.effectMat(e.color, 0.82, true)));
        g.add(body, wing);
      }
      const flame = this.ownMesh(new THREE.Mesh(new THREE.ConeGeometry(0.48, 3.6, 10, 1, true), this.effectMat('#ffdd66', 0.9, true)));
      flame.rotation.x = -Math.PI / 2;
      flame.position.z = -2.6;
      g.add(flame);
      g.rotation.y = Math.atan2(e.facingX ?? 0, e.facingZ ?? 1);
      g.position.set(e.x, 6.5, e.z);
      return g;
    }
    if (e.kind === 'singularity') {
      const r = e.radius ?? 16;
      const core = this.ownMesh(new THREE.Mesh(new THREE.IcosahedronGeometry(r * 0.105, 3), this.effectMat('#010005', 0.98, false)));
      core.position.y = r * 0.11;
      core.name = 'singularity-core';
      const lens = this.ownMesh(new THREE.Mesh(new THREE.SphereGeometry(r * 0.16, 28, 18), this.effectMat('#7447b8', 0.16, true)));
      lens.position.copy(core.position);
      lens.name = 'singularity-lens';
      const reach = this.ownMesh(new THREE.Mesh(new THREE.RingGeometry(r * 0.91, r, 80), this.effectMat('#72efff', 0.34, true)));
      reach.rotation.x = -Math.PI / 2;
      reach.position.y = 0.06;
      reach.name = 'singularity-reach';
      g.add(reach, lens, core);
      for (let i = 0; i < 3; i += 1) {
        const accretion = this.ownMesh(new THREE.Mesh(
          new THREE.TorusGeometry(r * (0.22 + i * 0.085), r * (0.014 + i * 0.003), 8, 72),
          this.effectMat(['#fff0b0', '#b27dff', '#55eaff'][i]!, 0.78 - i * 0.12, true),
        ));
        accretion.rotation.x = Math.PI * (0.38 + i * 0.09);
        accretion.rotation.z = i * 0.8;
        accretion.position.y = r * 0.105;
        accretion.name = `singularity-ring-${i}`;
        accretion.userData.spin = i % 2 === 0 ? 1.8 + i * 0.6 : -2.2;
        accretion.userData.baseZ = i * 0.8;
        g.add(accretion);
      }
      for (let i = 0; i < 12; i += 1) {
        const mote = this.ownMesh(new THREE.Mesh(
          new THREE.TetrahedronGeometry(r * (0.018 + (i % 3) * 0.006), 0),
          this.effectMat(i % 2 ? '#ca9dff' : '#6af0ff', 0.72, true),
        ));
        mote.name = `singularity-mote-${i}`;
        mote.userData.phase = (i / 12) * Math.PI * 2;
        mote.userData.orbit = 0.26 + (i % 4) * 0.12;
        mote.userData.spin = i % 2 ? 2.1 : -2.7;
        g.add(mote);
      }
      g.position.set(e.x, 0, e.z);
      g.traverse((o) => {
        if (o instanceof THREE.Mesh) {
          o.material.depthTest = true;
          o.renderOrder = 14;
        }
      });
      return g;
    }
    if (e.kind === 'singularity-collapse') {
      const r = e.radius ?? 16;
      const voidFlash = this.ownMesh(new THREE.Mesh(new THREE.SphereGeometry(r * 0.13, 26, 18), this.effectMat('#f1e7ff', 0.9, true)));
      voidFlash.scale.y = 0.55;
      voidFlash.position.y = r * 0.08;
      const wave = this.ownMesh(new THREE.Mesh(new THREE.RingGeometry(r * 0.78, r, 96), this.effectMat('#d7baff', 0.86, true)));
      wave.rotation.x = -Math.PI / 2;
      wave.position.y = 0.1;
      const inner = this.ownMesh(new THREE.Mesh(new THREE.RingGeometry(r * 0.36, r * 0.48, 72), this.effectMat('#5eeaff', 0.5, true)));
      inner.rotation.x = -Math.PI / 2;
      inner.position.y = 0.12;
      g.add(wave, inner, voidFlash);
      for (let i = 0; i < 16; i += 1) {
        const shard = this.ownMesh(new THREE.Mesh(
          new THREE.ConeGeometry(r * 0.018, r * 0.17, 4),
          this.effectMat(i % 2 ? '#fff0b2' : '#b998ff', 0.74, true),
        ));
        const a = (i / 16) * Math.PI * 2;
        shard.position.set(Math.sin(a) * r * 0.63, r * 0.035, Math.cos(a) * r * 0.63);
        shard.rotation.z = Math.PI / 2;
        shard.rotation.y = -a;
        g.add(shard);
      }
      g.position.set(e.x, 0, e.z);
      return g;
    }
    if (e.kind === 'titan-deploy') {
      const r = e.radius ?? 5.5;
      const beam = this.ownMesh(new THREE.Mesh(new THREE.CylinderGeometry(1.2, 2.2, 18, 20, 1, true), this.effectMat('#fff1a8', 0.55, true)));
      beam.position.y = 9;
      const core = this.ownMesh(new THREE.Mesh(new THREE.CylinderGeometry(0.32, 0.55, 20, 16), this.effectMat('#ffffff', 0.95, true)));
      core.position.y = 10;
      const ring = this.ownMesh(new THREE.Mesh(new THREE.RingGeometry(r * 0.35, r, 64), this.effectMat('#66eaff', 0.75, true)));
      ring.rotation.x = -Math.PI / 2;
      ring.position.y = 0.08;
      g.add(beam, core, ring);
      g.position.set(e.x, 0, e.z);
      return g;
    }
    if (e.kind === 'toxic-burst') {
      const r = e.radius ?? e.scale ?? 2.2;
      const shock = this.ownMesh(new THREE.Mesh(
        new THREE.RingGeometry(r * 0.2, r, 40),
        this.effectMat('#75ff6a', 0.78, true),
      ));
      shock.rotation.x = -Math.PI / 2;
      shock.position.y = 0.08;
      const cloud = this.ownMesh(new THREE.Mesh(
        new THREE.SphereGeometry(r * 0.52, 18, 12),
        this.effectMat('#a6ff67', 0.34, true),
      ));
      cloud.scale.y = 0.55;
      cloud.position.y = 0.65;
      g.add(shock, cloud);
      for (let i = 0; i < 8; i += 1) {
        const mote = this.ownMesh(new THREE.Mesh(
          new THREE.OctahedronGeometry(0.1 + (i % 3) * 0.035, 0),
          this.effectMat(i % 2 ? '#d8ff8a' : '#62ff70', 0.9, true),
        ));
        const a = (i / 8) * Math.PI * 2;
        mote.position.set(Math.cos(a) * r * 0.55, 0.35 + (i % 3) * 0.24, Math.sin(a) * r * 0.55);
        g.add(mote);
      }
      g.position.set(e.x, 0, e.z);
      g.traverse((child) => {
        if (!(child instanceof THREE.Mesh)) return;
        child.material.depthTest = false;
        child.renderOrder = 19;
      });
      return g;
    }
    if (e.kind === 'plasma-flare') {
      /*
       * Ignition at the burning head of the trail.
       *
       * This is the one part of Plasma Wake that stays bright: the player needs to see
       * where the trail is being laid, and it lives for a third of a second. It is
       * depth-tested like the ribbon it belongs to, so the hero laying the trail is in
       * front of their own sparks rather than behind them.
       */
      const r = Math.min(2.2, (e.radius ?? e.scale ?? 1.5) * 0.28);
      const flash = this.ownMesh(new THREE.Mesh(
        new THREE.SphereGeometry(r, 16, 10),
        this.effectMat('#c94ad6', 0.24, true),
      ));
      flash.scale.y = 0.4;
      flash.position.y = 0.24;
      const spark = this.ownMesh(new THREE.Mesh(
        new THREE.ConeGeometry(r * 0.22, r * 1.2, 9, 1, true),
        this.effectMat('#ffb27a', 0.55, true),
      ));
      spark.position.y = r * 0.5;
      g.add(flash, spark);
      g.position.set(e.x, 0, e.z);
      g.traverse((child) => {
        if (!(child instanceof THREE.Mesh)) return;
        child.material.depthTest = true;
        child.renderOrder = 11;
      });
      return g;
    }
    if (e.kind === 'telegraph' && (e.length ?? 0) > 2) {
      // Lane telegraph for gunship / boss charges — readable floor strip, not a generic ring.
      const len = e.length ?? 10;
      const w = e.width ?? 2.2;
      const floor = this.ownMesh(
        new THREE.Mesh(new THREE.PlaneGeometry(w, len), this.effectMat(color, 0.35, true)),
      );
      floor.userData.baseOpacity = 0.35;
      floor.rotation.x = -Math.PI / 2;
      floor.position.y = 0.06;
      const edge = this.ownMesh(
        new THREE.Mesh(new THREE.PlaneGeometry(w * 1.08, len), this.effectMat('#ffffff', 0.18, true)),
      );
      edge.userData.baseOpacity = 0.18;
      edge.rotation.x = -Math.PI / 2;
      edge.position.y = 0.04;
      const rimL = this.ownMesh(
        new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.12, len), this.effectMat(color, 0.75, true)),
      );
      rimL.userData.baseOpacity = 0.75;
      rimL.position.set(-w * 0.5, 0.1, 0);
      const rimR = this.ownMesh(rimL.clone());
      rimR.position.x = w * 0.5;
      g.add(edge, floor, rimL, rimR);
      g.position.set(e.x, 0, e.z);
      g.rotation.y = Math.atan2(e.facingX ?? 0, e.facingZ ?? 1);
      return g;
    }
    if (e.kind === 'gunship') {
      // Ingress marker at lane start
      const r = e.radius ?? e.scale ?? 2;
      const ring = this.ownMesh(
        new THREE.Mesh(new THREE.RingGeometry(r * 0.4, r, 32), this.effectMat(color, 0.8, true)),
      );
      ring.userData.baseOpacity = 0.8;
      ring.rotation.x = -Math.PI / 2;
      const chevron = this.ownMesh(
        new THREE.Mesh(new THREE.ConeGeometry(0.5, 1.2, 6), this.effectMat('#fff6d0', 0.9, true)),
      );
      chevron.userData.baseOpacity = 0.9;
      chevron.position.y = 1.2;
      g.add(ring, chevron);
      g.position.set(e.x, 0.08, e.z);
      return g;
    }
    const r = e.radius ?? e.scale ?? 1;
    if (e.kind === 'repulsor') {
      // Strong multi-layer expanding shockwave matching gameplay radius
      // Unique materials per effect so repeated uses never inherit faded opacity
      const outer = this.ownMesh(
        new THREE.Mesh(new THREE.RingGeometry(r * 0.88, r, 72), this.effectMat(color, 0.95, true)),
      );
      outer.userData.baseOpacity = 0.95;
      outer.rotation.x = -Math.PI / 2;
      const mid = this.ownMesh(
        new THREE.Mesh(new THREE.RingGeometry(r * 0.55, r * 0.82, 56), this.effectMat('#ffffff', 0.55, true)),
      );
      mid.userData.baseOpacity = 0.55;
      mid.rotation.x = -Math.PI / 2;
      mid.position.y = 0.03;
      const inner = this.ownMesh(
        new THREE.Mesh(new THREE.RingGeometry(r * 0.2, r * 0.5, 48), this.effectMat(color, 0.45, true)),
      );
      inner.userData.baseOpacity = 0.45;
      inner.rotation.x = -Math.PI / 2;
      inner.position.y = 0.05;
      const floor = this.ownMesh(
        new THREE.Mesh(new THREE.CircleGeometry(r * 0.98, 56), this.effectMat(color, 0.25, true)),
      );
      floor.userData.baseOpacity = 0.25;
      floor.rotation.x = -Math.PI / 2;
      floor.position.y = -0.02;
      const shell = this.ownMesh(
        new THREE.Mesh(
          new THREE.CylinderGeometry(r * 0.95, r * 1.02, 1.1, 48, 1, true),
          this.effectMat(color, 0.32, true),
        ),
      );
      shell.userData.baseOpacity = 0.32;
      shell.position.y = 0.55;
      const shell2 = this.ownMesh(
        new THREE.Mesh(
          new THREE.CylinderGeometry(r * 0.7, r * 0.85, 0.7, 40, 1, true),
          this.effectMat('#ffffff', 0.18, true),
        ),
      );
      shell2.userData.baseOpacity = 0.18;
      shell2.position.y = 0.4;
      g.add(floor, mid, inner, outer, shell, shell2);
      g.position.set(e.x, 0.08, e.z);
      return g;
    }
    const ring = this.ownMesh(
      new THREE.Mesh(new THREE.RingGeometry(r * 0.2, r, 28), this.effectMat(color, 0.65)),
    );
    ring.userData.baseOpacity = 0.65;
    ring.rotation.x = -Math.PI / 2;
    g.add(ring);
    g.position.set(e.x, 0.08, e.z);
    return g;
  }

  private syncRails(state: SurvivorState): void {
    // Hide all pooled rails then reuse.
    for (const mesh of this.railPool) mesh.visible = false;
    let i = 0;
    for (const r of state.rails) {
      const dx = r.x1 - r.x0;
      const dz = r.z1 - r.z0;
      const len = Math.hypot(dx, dz) || 0.01;
      let mesh = this.railPool[i];
      if (!mesh) {
        mesh = new THREE.Mesh(this.railGeo, this.railMat.clone());
        mesh.userData.sharedGeometry = true; // railGeo is pooled; never dispose per-mesh
        mesh.userData.ownsGeometry = false;
        (mesh.material as THREE.Material).userData.owned = true;
        this.railPool.push(mesh);
        this.root.add(mesh);
      }
      mesh.visible = true;
      mesh.position.set((r.x0 + r.x1) / 2, 1.1, (r.z0 + r.z1) / 2);
      mesh.rotation.y = Math.atan2(dx, dz);
      const beam = Math.max(1, (r.width ?? 0.3) / 0.3);
      mesh.scale.set(beam, Math.min(2.4, 0.85 + beam * 0.18), len);
      const mat = mesh.material as THREE.MeshBasicMaterial;
      mat.color.set(r.color);
      mat.opacity = Math.min(1, r.life * 5);
      i += 1;
    }
    this.rails = this.railPool.slice(0, i);
  }

  private place(vis: ActorVis, x: number, z: number, fx: number, fz: number, scale = 1): void {
    vis.root.position.set(x, 0, z);
    vis.root.rotation.y = Math.atan2(fx, fz);
    vis.root.scale.setScalar(scale);
  }

  private flash(vis: ActorVis, hit: number, invuln: boolean): void {
    const pulse = hit > 0 ? 0.9 : invuln ? 0.3 + Math.sin(performance.now() * 0.03) * 0.15 : 0;
    for (const m of vis.flashMats) {
      m.emissiveIntensity = Math.max(0.1, pulse * 1.6);
    }
  }

  dispose(): void {
    for (const obj of this.effects.values()) this.disposeEffectObject(obj);
    for (const obj of this.hazards.values()) this.disposeEffectObject(obj);
    for (const mesh of this.projectiles.values()) {
      if (mesh instanceof THREE.Group) this.disposeEffectObject(mesh);
    }
    for (const pickup of this.pickups.values()) this.disposeEffectObject(pickup);
    if (this.gunshipRoot) this.disposeEffectObject(this.gunshipRoot);
    for (const mesh of this.railPool) {
      const m = mesh.material;
      if (m instanceof THREE.Material && m.userData?.owned) m.dispose();
    }
    this.railPool = [];
    for (const vis of this.attackPool) vis.dispose();
    this.attackPool = [];
    this.railGeo.dispose();
    this.railMat.dispose();
    this.root.clear();
    this.enemies.clear();
    this.projectiles.clear();
    this.pickups.clear();
    this.hazards.clear();
    this.effects.clear();
    this.rails = [];
    this.cacheActor = null;
    this.gunshipRoot = null;
    this.shieldRoot = null;
    this.shieldWasActive = false;
    for (const [, vis] of this.allies) {
      this.root.remove(vis.root);
      this.disposeEffectObject(vis.root);
    }
    this.allies.clear();
    this.boltGeo.dispose();
    this.enemyShardGeo.dispose();
    this.bioCoreGeo.dispose();
    this.bioShellGeo.dispose();
    this.bossOrbCoreGeo.dispose();
    this.bossOrbShellGeo.dispose();
    this.bossOrbRingGeo.dispose();
    this.bossFanGeo.dispose();
    this.bossFanCoreGeo.dispose();
    this.orbitalNeedleGeo.dispose();
    this.orbitalLocatorGeo.dispose();
    this.pickupEnergyCoreGeo.dispose();
    this.pickupEnergyShellGeo.dispose();
    this.pickupEnergyCoilGeo.dispose();
    this.pickupRepairCoreGeo.dispose();
    this.pickupRepairCrossGeo.dispose();
    this.pickupRepairFrameGeo.dispose();
    this.pickupRepairShellGeo.dispose();
    // Shared Cosmic Boomerang silhouette: owned by the renderer, not by any disc.
    if (this.boomerangGeo) {
      this.boomerangGeo.blade.dispose();
      this.boomerangGeo.energy.dispose();
      this.boomerangGeo.core.dispose();
      this.boomerangGeo.ghost.dispose();
      this.boomerangGeo = null;
    }
    // Shared Plasma Wake ribbon geometry: owned by the renderer, not by any segment.
    this.plasmaQuad?.dispose();
    this.plasmaQuad = null;
    this.plasmaCap?.dispose();
    this.plasmaCap = null;
    this.eliteShellGeo.dispose();
    this.eliteRingGeo.dispose();
    this.eliteBarGeo.dispose();
    this.eliteFillGeo.dispose();
    for (const m of this.mats.values()) m.dispose();
    this.mats.clear();
    for (const m of this.basicMats.values()) m.dispose();
    this.basicMats.clear();
    for (const m of this.proceduralMats.values()) m.dispose();
    this.proceduralMats.clear();
    for (const m of this.exhaustMats) m.dispose();
    this.exhaustMats = [];
    for (const m of this.cacheMats) m.dispose();
    this.cacheMats = [];
    for (const m of this.gunshipMats) m.dispose();
    this.gunshipMats = [];
    for (const m of this.shieldMats) m.dispose();
    this.shieldMats = [];
    this.playerAstro = null;
    this.playerMech = null;
    this.playerShip = null;
    this.shipExhaust = null;
    this.exhaustL = null;
    this.exhaustR = null;
    this.bosses.clear();
    this.bossPose.clear();
  }
}

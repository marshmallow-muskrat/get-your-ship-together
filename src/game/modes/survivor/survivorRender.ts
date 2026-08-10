import * as THREE from 'three';
import { HEROES } from '../../content/heroes';
import { BOSS_DEMON, ENEMY_BY_ID, MELEE_BLOB } from '../../content/enemies';
import { AssetLibrary, createAnimator } from '../../assets/AssetLibrary';
import { BOSS_DEFS, HORDE, SURVIVOR, SURVIVOR_BOSS, bossDefForIndex } from './survivorContent';
import type { SurvivorState } from './survivorState';
import { shapeToRender } from './survivorAttackShapes';
import { AttackShapeMesh } from './survivorShapeMesh';

type Animator = ReturnType<typeof createAnimator>;

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
  private boltGeo = new THREE.SphereGeometry(0.14, 8, 8);
  private eliteShellGeo = new THREE.SphereGeometry(1.05, 16, 12);
  private eliteRingGeo = new THREE.TorusGeometry(0.9, 0.055, 8, 30);
  private eliteBarGeo = new THREE.PlaneGeometry(1.7, 0.16);
  private eliteFillGeo = new THREE.PlaneGeometry(1.62, 0.1);
  /** Cleanup Crew ally visuals, keyed by ally id. Bounded at three. */
  private readonly allies = new Map<number, AllyVis>();
  private animFrame = 0;
  private readonly mats = new Map<string, THREE.MeshStandardMaterial>();
  private readonly basicMats = new Map<string, THREE.MeshBasicMaterial>();

  constructor(assets: AssetLibrary) {
    this.assets = assets;
    this.root.name = 'survivor-actors';
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

  /** Distinct readable silhouettes for signature projectiles. */
  private createProjectileActor(kind: import('./survivorState').ProjectileKind, color: string): THREE.Object3D {
    if (kind !== 'rocket' && kind !== 'drone' && kind !== 'rotary-round') {
      return new THREE.Mesh(this.boltGeo, this.mat(color));
    }

    const g = new THREE.Group();
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
    this.syncProjectiles(state);
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
      const t = 1 - Math.max(0, Math.min(1, a.remaining / a.maxRemaining));
      if (a.lifecycle === 'windup') {
        // Warning: builds toward the strike so the read is unambiguous.
        vis.material.opacity = 0.16 + t * 0.30;
      } else if (a.lifecycle === 'active') {
        vis.material.opacity = a.damaging ? 0.62 : 0.30;
      } else {
        vis.material.opacity = Math.max(0, 0.5 * (1 - t));
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

  private syncProjectiles(state: SurvivorState): void {
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
        mesh = this.createProjectileActor(p.kind, p.color);
        this.projectiles.set(p.id, mesh);
        this.root.add(mesh);
      }
      if (mesh instanceof THREE.Group) {
        mesh.rotation.y = Math.atan2(p.vx, p.vz);
        const exhaust = mesh.getObjectByName('projectile-exhaust');
        if (exhaust) {
          const flicker = 0.82 + Math.sin(performance.now() * 0.045 + p.id) * 0.2;
          exhaust.scale.set(1, flicker, 1);
        }
      }
      const s =
        p.kind === 'drone'
          ? 1
          : p.kind === 'rocket'
            ? 1
            : p.kind === 'bioplasma'
              ? 1.45
              : p.kind === 'boss-orb'
                ? Math.max(2.8, (p.visualRadius || p.radius) * 4.2)
                : p.kind === 'boss-fan'
                  ? Math.max(1.8, (p.visualRadius || p.radius) * 3.5)
                  : 1;
      if (!(mesh instanceof THREE.Group)) mesh.scale.setScalar(s);
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
      if (mesh instanceof THREE.Mesh && (mesh.material instanceof THREE.MeshStandardMaterial || mesh.material instanceof THREE.MeshBasicMaterial)) {
        // hostile projectiles stay bright
        if (p.kind === 'boss-orb' || p.kind === 'boss-fan') {
          (mesh.material as THREE.MeshStandardMaterial).emissiveIntensity = 2.4;
        }
      }
      if (mesh instanceof THREE.Mesh && p.kind === 'rocket' && p.armTimer > 0) {
        mesh.scale.setScalar(p.explodeRadius * 1.4);
        (mesh.material as THREE.MeshStandardMaterial).opacity = 0.35;
      } else if (mesh instanceof THREE.Mesh) {
        (mesh.material as THREE.MeshStandardMaterial).opacity = 0.95;
        (mesh.material as THREE.MeshStandardMaterial).emissiveIntensity = p.kind === 'bioplasma' ? 2.2 : 1.3;
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

  private plasmaLayer(
    geo: THREE.BufferGeometry,
    color: string,
    opacity: number,
    name: string,
    y: number,
  ): THREE.Mesh {
    const mesh = new THREE.Mesh(geo, this.effectMat(color, opacity, true));
    mesh.userData.sharedGeometry = true;
    mesh.userData.ownsGeometry = false;
    mesh.userData.ownsMaterial = true;
    mesh.userData.baseOpacity = opacity;
    mesh.name = name;
    mesh.rotation.x = -Math.PI / 2;
    mesh.position.y = y;
    mesh.renderOrder = 18;
    (mesh.material as THREE.MeshBasicMaterial).depthTest = false;
    return mesh;
  }

  /**
   * One burning trail segment.
   *
   * Three stacked strips (ember shell → fire body → plasma core) plus round caps at both
   * ends. The caps are what make consecutive segments read as one continuous ribbon:
   * because each segment starts exactly where the previous ended, a disc of the same
   * half-width at the joint closes the corner on turns.
   */
  private createPlasmaSegment(): THREE.Object3D {
    const { quad, cap } = this.plasmaGeometry();
    const g = new THREE.Group();
    g.add(this.plasmaLayer(quad, '#ff7a24', 0.3, 'pw-ember', 0.05));
    g.add(this.plasmaLayer(cap, '#ff7a24', 0.3, 'pw-ember-cap0', 0.051));
    g.add(this.plasmaLayer(cap, '#ff7a24', 0.3, 'pw-ember-cap1', 0.052));
    g.add(this.plasmaLayer(quad, '#ff4f24', 0.52, 'pw-fire', 0.06));
    g.add(this.plasmaLayer(cap, '#ff4f24', 0.52, 'pw-fire-cap0', 0.061));
    g.add(this.plasmaLayer(cap, '#ff4f24', 0.52, 'pw-fire-cap1', 0.062));
    g.add(this.plasmaLayer(quad, '#ffd45a', 0.8, 'pw-core', 0.07));
    // Flame tongues licking off the strip; animated in layout.
    for (let i = 0; i < 4; i += 1) {
      const tongue = this.plasmaLayer(cap, i % 2 === 0 ? '#ffb83d' : '#fff0b0', 0.55, 'pw-tongue', 0.075);
      tongue.userData.tonguePhase = i * 1.37;
      tongue.userData.tongueAt = 0.16 + i * 0.23;
      g.add(tongue);
    }
    return g;
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
    // Ember phase: the tail narrows and cools rather than simply fading out.
    const cool = age < 0.45 ? 1 : 1 - ((age - 0.45) / 0.55) * 0.45;
    const flicker = 0.9 + Math.sin(performance.now() * 0.009 + h.id * 0.7) * 0.1;

    for (const child of obj.children) {
      if (!(child instanceof THREE.Mesh)) continue;
      const base = (child.userData.baseOpacity as number | undefined) ?? 0.5;
      const mat = child.material as THREE.MeshBasicMaterial;
      const n = child.name;
      let widthMul = 1;
      if (n.startsWith('pw-ember')) widthMul = 1.0;
      else if (n.startsWith('pw-fire')) widthMul = 0.66;
      else if (n === 'pw-core') widthMul = 0.3;

      if (n === 'pw-ember' || n === 'pw-fire' || n === 'pw-core') {
        // Strip: X = cross-track width, Y (pre-rotation) = along-track length.
        child.scale.set(w * 2 * widthMul * cool, Math.max(0.001, len), 1);
        child.position.set(0, child.position.y, 0);
        mat.opacity = Math.max(0.05, base * t * (n === 'pw-core' ? flicker : 1));
      } else if (n.endsWith('cap0') || n.endsWith('cap1')) {
        const end = n.endsWith('cap0') ? -len / 2 : len / 2;
        child.scale.setScalar(w * widthMul * cool);
        child.position.set(0, child.position.y, end);
        mat.opacity = Math.max(0.05, base * t);
      } else if (n === 'pw-tongue') {
        const phase = (child.userData.tonguePhase as number) ?? 0;
        const at = (child.userData.tongueAt as number) ?? 0.5;
        const lick = 0.55 + Math.sin(performance.now() * 0.011 + phase + h.id) * 0.45;
        child.scale.setScalar(w * 0.42 * lick * cool);
        child.position.set(
          (phase % 2 === 0 ? 1 : -1) * w * 0.5 * lick,
          child.position.y,
          -len / 2 + len * at,
        );
        mat.opacity = Math.max(0, base * t * lick);
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
      }
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

    return { root, mech, ship, trail, glow };
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
      obj.position.set(h.x, h.kind === 'wake' ? 0.06 : 0.04, h.z);
      const growth = 0.85 + (1 - t) * 0.2;
      obj.scale.setScalar(h.radius * growth);
      obj.traverse((c) => {
        if (c instanceof THREE.Mesh && c.material instanceof THREE.MeshBasicMaterial) {
          const base = (c.userData.baseOpacity as number | undefined) ?? (h.kind === 'wake' ? 0.5 : 0.42);
          c.material.opacity = Math.max(0.08, t * base);
        }
      });
    }
  }

  private syncPickups(state: SurvivorState): void {
    const alive = new Set(state.pickups.filter((p) => p.active).map((p) => p.id));
    for (const [id, obj] of this.pickups) {
      if (!alive.has(id)) {
        this.root.remove(obj);
        this.pickups.delete(id);
      }
    }
    for (const p of state.pickups) {
      if (!p.active) continue;
      let obj = this.pickups.get(p.id);
      if (!obj) {
        const g = new THREE.Group();
        if (p.kind === 'xp') {
          // Cyan crystalline energy — premium bundles are larger/brighter, same type.
          const s = p.premium ? 1.35 : 1;
          const core = new THREE.Mesh(
            new THREE.OctahedronGeometry(0.22 * s, 0),
            this.effectMat(p.premium ? '#a8ffe0' : '#66ffcc', 0.95, true),
          );
          const halo = new THREE.Mesh(
            new THREE.SphereGeometry(0.32 * s, 10, 10),
            this.effectMat('#88ffdd', p.premium ? 0.32 : 0.22, true),
          );
          const ring = new THREE.Mesh(
            new THREE.TorusGeometry(0.28 * s, 0.03 * s, 6, 16),
            this.effectMat('#aaffee', 0.7, true),
          );
          ring.rotation.x = Math.PI / 2;
          g.add(halo, core, ring);
          if (p.premium) g.scale.setScalar(1.2);
        } else {
          // Health — crimson medical cross only.
          const core = new THREE.Mesh(
            new THREE.SphereGeometry(0.2, 12, 12),
            this.effectMat('#ffffff', 0.98, true),
          );
          const barH = new THREE.Mesh(
            new THREE.BoxGeometry(0.58, 0.14, 0.14),
            this.effectMat('#ff2255', 0.95, true),
          );
          const barV = new THREE.Mesh(
            new THREE.BoxGeometry(0.14, 0.58, 0.14),
            this.effectMat('#ff4477', 0.95, true),
          );
          const ring = new THREE.Mesh(
            new THREE.TorusGeometry(0.48, 0.05, 8, 22),
            this.effectMat('#ff6699', 0.8, true),
          );
          ring.rotation.x = Math.PI / 2;
          ring.name = 'repair-ring';
          const glow = new THREE.Mesh(
            new THREE.SphereGeometry(0.55, 12, 12),
            this.effectMat('#ff1144', 0.22, true),
          );
          const pillar = new THREE.Mesh(
            new THREE.CylinderGeometry(0.04, 0.06, 0.9, 6),
            this.effectMat('#ff88aa', 0.4, true),
          );
          pillar.position.y = 0.55;
          g.add(glow, ring, core, barH, barV, pillar);
          g.scale.setScalar(1.32);
        }
        obj = g;
        this.pickups.set(p.id, obj);
        this.root.add(obj);
      }
      if (p.kind === 'repair') {
        // Slow strong pulse + optional magnet trail tint.
        const bob = 0.62 + Math.sin(performance.now() * 0.005 + p.id) * 0.16;
        obj.position.set(p.x, bob, p.z);
        obj.rotation.y += 0.018;
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
        const baseScale = 1.32;
        obj.scale.setScalar(
          full ? baseScale * 0.72 : expiring ? baseScale * (0.95 + Math.sin(performance.now() * 0.03) * 0.12) : baseScale,
        );
        if (p.magnetized && !full && this.animFrame % 4 === 0) {
          // Faint pink magnet trail (short-lived pooled effects).
        }
      } else if (p.kind === 'xp') {
        // Faster crystalline spin; smaller than health.
        const bob = 0.5 + Math.sin(performance.now() * 0.01 + p.id) * 0.1;
        obj.position.set(p.x, bob, p.z);
        obj.rotation.y += 0.07;
        obj.scale.setScalar(0.92);
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
    root.scale.setScalar(SURVIVOR.actorScale.ship * 1.35);
    const thr = root.getObjectByName('gunship-thrusters');
    if (thr) {
      const flicker = 0.85 + Math.sin(performance.now() * 0.05) * 0.2;
      thr.scale.set(1, 1, g.firing ? 1.2 * flicker : 0.7);
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
      // Repulsor: expand from ~0.15 → 1.0 of true radius so ring matches gameplay edge
      if (e.kind === 'repulsor') {
        const grow = 0.12 + t * 0.95;
        obj.scale.setScalar(grow);
      } else if (e.kind === 'fleet-ship') {
        obj.scale.setScalar(1);
        const fx = e.facingX ?? 0;
        const fz = e.facingZ ?? 1;
        const len = e.length ?? 30;
        obj.position.set(e.x + fx * len * t, 6.5 + Math.sin(t * Math.PI) * 1.2, e.z + fz * len * t);
      } else if (e.kind === 'singularity') {
        const pulse = 0.96 + Math.sin(t * 20) * 0.06;
        obj.scale.setScalar((0.35 + Math.min(1, t * 2.8) * 0.65) * pulse);
        const ring = obj.getObjectByName('singularity-ring');
        if (ring) ring.rotation.z = t * 7.5;
      } else if (e.kind === 'orbital-shock') {
        // Expand from the core outward to the full outer damage radius.
        obj.scale.setScalar(0.28 + t * 0.72);
      } else if (e.kind === 'orbital-scorch') {
        // Residue does not expand; it settles slightly and fades.
        obj.scale.setScalar(1.02 - t * 0.06);
      } else if (e.kind === 'arc' || e.kind === 'orbital' || e.kind === 'orbital-strike' || e.kind === 'titan-deploy') {
        obj.scale.setScalar(1);
      } else {
        obj.scale.setScalar(0.5 + t * 1.4);
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
       * The descending lance. 2.7.0 makes it substantially more authoritative: a wider
       * outer column, a thicker white core, and an extra inner shaft, so the strike is
       * unmistakable in a dense late-game fight without hiding what is underneath it.
       */
      const r = e.radius ?? e.scale ?? 1.6;
      const glow = this.ownMesh(new THREE.Mesh(new THREE.CylinderGeometry(r * 0.62, r * 0.98, 22, 24, 1, true), this.effectMat('#ffd46a', 0.5, true)));
      glow.position.y = 11;
      const shaft = this.ownMesh(new THREE.Mesh(new THREE.CylinderGeometry(r * 0.3, r * 0.46, 20, 18, 1, true), this.effectMat('#ffe9a8', 0.7, true)));
      shaft.position.y = 10;
      const core = this.ownMesh(new THREE.Mesh(new THREE.CylinderGeometry(r * 0.17, r * 0.28, 20, 16), this.effectMat('#ffffff', 0.98, true)));
      core.position.y = 10;
      const ring = this.ownMesh(new THREE.Mesh(new THREE.RingGeometry(r * 0.35, r * 1.05, 56), this.effectMat('#fff0a0', 0.7, true)));
      ring.rotation.x = -Math.PI / 2;
      ring.position.y = 0.08;
      g.add(glow, shaft, core, ring);
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
       * The shockwave is drawn at exactly the outer damage radius so the ring the
       * player sees is the ring that actually dealt the reduced damage. It is scaled
       * from the centre outward in `syncEffects`, so the geometry is authored at full
       * size here.
       */
      const r = e.radius ?? e.scale ?? 2.5;
      const ring = this.ownMesh(new THREE.Mesh(new THREE.RingGeometry(r * 0.74, r, 64), this.effectMat('#ffd46a', 0.62, true)));
      ring.rotation.x = -Math.PI / 2;
      ring.position.y = 0.09;
      const inner = this.ownMesh(new THREE.Mesh(new THREE.RingGeometry(r * 0.5, r * 0.76, 64), this.effectMat('#ff9a3c', 0.3, true)));
      inner.rotation.x = -Math.PI / 2;
      inner.position.y = 0.085;
      g.add(ring, inner);
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
      const core = this.ownMesh(new THREE.Mesh(new THREE.SphereGeometry(1.25, 24, 18), this.effectMat('#080016', 0.95, false)));
      core.position.y = 2.8;
      const accretion = this.ownMesh(new THREE.Mesh(new THREE.TorusGeometry(r * 0.42, 0.28, 12, 64), this.effectMat('#a881ff', 0.78, true)));
      accretion.rotation.x = Math.PI / 2.25;
      accretion.position.y = 2.6;
      accretion.name = 'singularity-ring';
      const reach = this.ownMesh(new THREE.Mesh(new THREE.RingGeometry(r * 0.82, r, 72), this.effectMat('#66eaff', 0.25, true)));
      reach.rotation.x = -Math.PI / 2;
      reach.position.y = 0.06;
      g.add(reach, accretion, core);
      g.position.set(e.x, 0, e.z);
      g.traverse((o) => {
        if (o instanceof THREE.Mesh) {
          o.material.depthTest = false;
          o.renderOrder = 26;
        }
      });
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
      const r = Math.min(2.8, (e.radius ?? e.scale ?? 1.5) * 0.35);
      const flash = this.ownMesh(new THREE.Mesh(
        new THREE.SphereGeometry(r, 16, 10),
        this.effectMat('#ff8a3d', 0.28, true),
      ));
      flash.scale.y = 0.4;
      flash.position.y = 0.28;
      const spark = this.ownMesh(new THREE.Mesh(
        new THREE.ConeGeometry(r * 0.24, r * 1.45, 9, 1, true),
        this.effectMat('#fff0a0', 0.72, true),
      ));
      spark.position.y = r * 0.55;
      g.add(flash, spark);
      g.position.set(e.x, 0, e.z);
      g.traverse((child) => {
        if (!(child instanceof THREE.Mesh)) return;
        child.material.depthTest = false;
        child.renderOrder = 20;
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
      mesh.scale.set(1, 1, len);
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
    for (const mesh of this.projectiles.values()) {
      if (mesh instanceof THREE.Group) this.disposeEffectObject(mesh);
    }
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

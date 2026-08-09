import * as THREE from 'three';
import { HEROES } from '../../content/heroes';
import { BOSS_DEMON, ENEMY_BY_ID, MELEE_BLOB } from '../../content/enemies';
import { AssetLibrary, createAnimator } from '../../assets/AssetLibrary';
import { BOSS_DEFS, HORDE, SURVIVOR, SURVIVOR_BOSS, bossDefForIndex } from './survivorContent';
import type { SurvivorState } from './survivorState';

type Animator = ReturnType<typeof createAnimator>;

interface ActorVis {
  root: THREE.Object3D;
  animator: Animator | null;
  flashMats: THREE.MeshStandardMaterial[];
  defId: string;
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
  private projectiles = new Map<number, THREE.Mesh>();
  private pickups = new Map<number, THREE.Object3D>();
  private hazards = new Map<number, THREE.Object3D>();
  private effects = new Map<number, THREE.Object3D>();
  private rails: THREE.Object3D[] = [];
  /** Persistent Protocol Cache world actor (not a short-lived effect). */
  private cacheActor: THREE.Group | null = null;
  private cacheMats: THREE.MeshBasicMaterial[] = [];
  /** Separate gunship flyover — never reuses the player ship transform. */
  private gunshipRoot: THREE.Object3D | null = null;
  private gunshipMats: THREE.MeshBasicMaterial[] = [];
  private boltGeo = new THREE.SphereGeometry(0.14, 8, 8);
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
    this.syncPickups(state);
    this.syncCache(state);
    this.syncGunship(state, dt);
    this.syncEffects(state);
    this.syncRails(state);
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
    if (!p.alive) vis.animator.play('death', 0.05);
    else if (p.dodgeActive > 0) vis.animator.play('dodge', 0.04);
    else if (p.hitFlash > 0.08) vis.animator.play('hit', 0.05);
    else vis.animator.play('run');
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
      this.place(vis, b.x, b.z, b.facingX, b.facingZ, scale);
      if (vis.animator) {
        if (b.state === 'dead') vis.animator.play('death', 0.08);
        else if (b.state === 'windup' || b.state === 'active') vis.animator.play('shoot', 0.06);
        else if (b.hitFlash > 0.08) vis.animator.play('hit', 0.05);
        else if (b.state === 'idle' || b.state === 'recover') vis.animator.play('walk');
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
        this.projectiles.delete(id);
      }
    }
    for (const p of state.projectiles) {
      if (!p.active) continue;
      let mesh = this.projectiles.get(p.id);
      if (!mesh) {
        mesh = new THREE.Mesh(this.boltGeo, this.mat(p.color));
        this.projectiles.set(p.id, mesh);
        this.root.add(mesh);
      }
      let s =
        p.kind === 'drone'
          ? 0.75
          : p.kind === 'rocket'
            ? 1.3
            : p.kind === 'bioplasma'
              ? 1.45
              : p.kind === 'boss-orb'
                ? Math.max(2.8, (p.visualRadius || p.radius) * 4.2)
                : p.kind === 'boss-fan'
                  ? Math.max(1.8, (p.visualRadius || p.radius) * 3.5)
                  : 1;
      mesh.scale.setScalar(s);
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
      if (mesh.material instanceof THREE.MeshStandardMaterial || mesh.material instanceof THREE.MeshBasicMaterial) {
        // hostile projectiles stay bright
        if (p.kind === 'boss-orb' || p.kind === 'boss-fan') {
          (mesh.material as THREE.MeshStandardMaterial).emissiveIntensity = 2.4;
        }
      }
      if (p.kind === 'rocket' && p.armTimer > 0) {
        mesh.scale.setScalar(p.explodeRadius * 1.4);
        (mesh.material as THREE.MeshStandardMaterial).opacity = 0.35;
      } else {
        (mesh.material as THREE.MeshStandardMaterial).opacity = 0.95;
        (mesh.material as THREE.MeshStandardMaterial).emissiveIntensity = p.kind === 'bioplasma' ? 2.2 : 1.3;
      }
    }
  }

  private syncHazards(state: SurvivorState): void {
    const alive = new Set(state.hazards.filter((h) => h.active).map((h) => h.id));
    for (const [id, obj] of this.hazards) {
      if (!alive.has(id)) {
        this.root.remove(obj);
        this.hazards.delete(id);
      }
    }
    for (const h of state.hazards) {
      if (!h.active) continue;
      let obj = this.hazards.get(h.id);
      if (!obj) {
        const ring = new THREE.Mesh(
          new THREE.CircleGeometry(1, 20),
          new THREE.MeshBasicMaterial({
            color: h.color,
            transparent: true,
            opacity: h.kind === 'wake' ? 0.45 : 0.4,
            side: THREE.DoubleSide,
            depthWrite: false,
          }),
        );
        ring.rotation.x = -Math.PI / 2;
        obj = ring;
        this.hazards.set(h.id, obj);
        this.root.add(obj);
      }
      const t = h.life / h.maxLife;
      obj.position.set(h.x, h.kind === 'wake' ? 0.06 : 0.04, h.z);
      obj.scale.setScalar(h.radius * (0.85 + (1 - t) * 0.2));
      obj.traverse((c) => {
        if (c instanceof THREE.Mesh && c.material instanceof THREE.MeshBasicMaterial) {
          c.material.opacity = Math.max(0.08, t * (h.kind === 'wake' ? 0.5 : 0.42));
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
          // Cyan crystalline energy core + additive halo
          const core = new THREE.Mesh(
            new THREE.OctahedronGeometry(0.22, 0),
            this.effectMat('#66ffcc', 0.95, true),
          );
          const halo = new THREE.Mesh(
            new THREE.SphereGeometry(0.32, 10, 10),
            this.effectMat('#88ffdd', 0.22, true),
          );
          const ring = new THREE.Mesh(
            new THREE.TorusGeometry(0.28, 0.03, 6, 16),
            this.effectMat('#aaffee', 0.7, true),
          );
          ring.rotation.x = Math.PI / 2;
          g.add(halo, core, ring);
        } else if (p.kind === 'repair') {
          // Magenta/white integrity cross — unmistakable vs energy
          const core = new THREE.Mesh(
            new THREE.SphereGeometry(0.16, 12, 12),
            this.effectMat('#ffffff', 0.95, true),
          );
          const barH = new THREE.Mesh(
            new THREE.BoxGeometry(0.42, 0.1, 0.1),
            this.effectMat('#ff66aa', 0.92, true),
          );
          const barV = new THREE.Mesh(
            new THREE.BoxGeometry(0.1, 0.42, 0.1),
            this.effectMat('#ff88cc', 0.92, true),
          );
          const ring = new THREE.Mesh(
            new THREE.TorusGeometry(0.38, 0.04, 8, 20),
            this.effectMat('#88ccff', 0.75, true),
          );
          ring.rotation.x = Math.PI / 2;
          const glow = new THREE.Mesh(
            new THREE.SphereGeometry(0.4, 10, 10),
            this.effectMat('#ff44aa', 0.18, true),
          );
          g.add(glow, ring, core, barH, barV);
        } else {
          // Gold supply beacon
          const core = new THREE.Mesh(
            new THREE.OctahedronGeometry(0.28, 0),
            this.effectMat('#ffd46a', 0.95, true),
          );
          const ring = new THREE.Mesh(
            new THREE.TorusGeometry(0.4, 0.05, 6, 18),
            this.effectMat('#ffe8a0', 0.8, true),
          );
          ring.rotation.x = Math.PI / 2;
          const pillar = new THREE.Mesh(
            new THREE.CylinderGeometry(0.04, 0.04, 1.2, 6),
            this.effectMat('#ffcc66', 0.45, true),
          );
          pillar.position.y = 0.6;
          g.add(core, ring, pillar);
        }
        obj = g;
        this.pickups.set(p.id, obj);
        this.root.add(obj);
      }
      const bob = 0.55 + Math.sin(performance.now() * 0.008 + p.id) * 0.12;
      obj.position.set(p.x, bob, p.z);
      obj.rotation.y += 0.04;
      // Dim/dormant repair orbs when player is full health or orb is expiring soon.
      if (p.kind === 'repair') {
        const full = state.player.health >= state.player.maxHealth - 0.01;
        const expiring = Number.isFinite(p.life) && p.life < SURVIVOR.repairPickupWarnLife;
        const pulse = expiring ? 0.45 + Math.sin(performance.now() * 0.02) * 0.35 : 1;
        obj.traverse((c) => {
          if (c instanceof THREE.Mesh && c.material instanceof THREE.MeshBasicMaterial) {
            if (!c.userData.baseOp) c.userData.baseOp = c.material.opacity;
            const base = c.userData.baseOp as number;
            c.material.opacity = base * (full ? 0.35 : pulse);
          }
        });
        obj.scale.setScalar(full ? 0.75 : expiring ? 0.9 + Math.sin(performance.now() * 0.025) * 0.12 : 1);
      }
    }
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
      new THREE.CylinderGeometry(0.12, 0.35, 8, 12, 1, true),
      this.effectMat('#ffe8a0', 0.4, true),
    );
    beam.position.y = 4;
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

  private syncEffects(state: SurvivorState): void {
    const alive = new Set(state.effects.map((e) => e.id));
    for (const [id, obj] of this.effects) {
      if (!alive.has(id)) {
        this.root.remove(obj);
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
    return this.basic(color, opacity, additive).clone();
  }

  private createEffect(e: SurvivorState['effects'][0]): THREE.Object3D {
    const g = new THREE.Group();
    const color = e.color;
    if (e.kind === 'rail') {
      const len = e.length ?? 10;
      const mesh = new THREE.Mesh(
        new THREE.BoxGeometry(e.width ?? 0.4, 0.15, len),
        this.effectMat(color, 0.85),
      );
      mesh.userData.baseOpacity = 0.85;
      mesh.position.set((e.facingX ?? 0) * len * 0.5, 1.1, (e.facingZ ?? 1) * len * 0.5);
      mesh.rotation.y = Math.atan2(e.facingX ?? 0, e.facingZ ?? 1);
      g.add(mesh);
      g.position.set(e.x, 0, e.z);
      return g;
    }
    if (e.kind === 'telegraph' && (e.length ?? 0) > 2) {
      // Lane telegraph for gunship / boss charges — readable floor strip, not a generic ring.
      const len = e.length ?? 10;
      const w = e.width ?? 2.2;
      const floor = new THREE.Mesh(
        new THREE.PlaneGeometry(w, len),
        this.effectMat(color, 0.35, true),
      );
      floor.userData.baseOpacity = 0.35;
      floor.rotation.x = -Math.PI / 2;
      floor.position.y = 0.06;
      const edge = new THREE.Mesh(
        new THREE.PlaneGeometry(w * 1.08, len),
        this.effectMat('#ffffff', 0.18, true),
      );
      edge.userData.baseOpacity = 0.18;
      edge.rotation.x = -Math.PI / 2;
      edge.position.y = 0.04;
      const rimL = new THREE.Mesh(
        new THREE.BoxGeometry(0.08, 0.12, len),
        this.effectMat(color, 0.75, true),
      );
      rimL.userData.baseOpacity = 0.75;
      rimL.position.set(-w * 0.5, 0.1, 0);
      const rimR = rimL.clone();
      rimR.position.x = w * 0.5;
      g.add(edge, floor, rimL, rimR);
      g.position.set(e.x, 0, e.z);
      g.rotation.y = Math.atan2(e.facingX ?? 0, e.facingZ ?? 1);
      return g;
    }
    if (e.kind === 'gunship') {
      // Ingress marker at lane start
      const r = e.radius ?? e.scale ?? 2;
      const ring = new THREE.Mesh(
        new THREE.RingGeometry(r * 0.4, r, 32),
        this.effectMat(color, 0.8, true),
      );
      ring.userData.baseOpacity = 0.8;
      ring.rotation.x = -Math.PI / 2;
      const chevron = new THREE.Mesh(
        new THREE.ConeGeometry(0.5, 1.2, 6),
        this.effectMat('#fff6d0', 0.9, true),
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
      const outer = new THREE.Mesh(
        new THREE.RingGeometry(r * 0.88, r, 72),
        this.effectMat(color, 0.95, true),
      );
      outer.userData.baseOpacity = 0.95;
      outer.rotation.x = -Math.PI / 2;
      const mid = new THREE.Mesh(
        new THREE.RingGeometry(r * 0.55, r * 0.82, 56),
        this.effectMat('#ffffff', 0.55, true),
      );
      mid.userData.baseOpacity = 0.55;
      mid.rotation.x = -Math.PI / 2;
      mid.position.y = 0.03;
      const inner = new THREE.Mesh(
        new THREE.RingGeometry(r * 0.2, r * 0.5, 48),
        this.effectMat(color, 0.45, true),
      );
      inner.userData.baseOpacity = 0.45;
      inner.rotation.x = -Math.PI / 2;
      inner.position.y = 0.05;
      const floor = new THREE.Mesh(
        new THREE.CircleGeometry(r * 0.98, 56),
        this.effectMat(color, 0.25, true),
      );
      floor.userData.baseOpacity = 0.25;
      floor.rotation.x = -Math.PI / 2;
      floor.position.y = -0.02;
      const shell = new THREE.Mesh(
        new THREE.CylinderGeometry(r * 0.95, r * 1.02, 1.1, 48, 1, true),
        this.effectMat(color, 0.32, true),
      );
      shell.userData.baseOpacity = 0.32;
      shell.position.y = 0.55;
      const shell2 = new THREE.Mesh(
        new THREE.CylinderGeometry(r * 0.7, r * 0.85, 0.7, 40, 1, true),
        this.effectMat('#ffffff', 0.18, true),
      );
      shell2.userData.baseOpacity = 0.18;
      shell2.position.y = 0.4;
      g.add(floor, mid, inner, outer, shell, shell2);
      g.position.set(e.x, 0.08, e.z);
      return g;
    }
    const ring = new THREE.Mesh(
      new THREE.RingGeometry(r * 0.2, r, 28),
      this.effectMat(color, 0.65),
    );
    ring.userData.baseOpacity = 0.65;
    ring.rotation.x = -Math.PI / 2;
    g.add(ring);
    g.position.set(e.x, 0.08, e.z);
    return g;
  }

  private syncRails(state: SurvivorState): void {
    for (const r of this.rails) this.root.remove(r);
    this.rails = [];
    for (const r of state.rails) {
      const dx = r.x1 - r.x0;
      const dz = r.z1 - r.z0;
      const len = Math.hypot(dx, dz);
      const mesh = new THREE.Mesh(
        new THREE.BoxGeometry(0.3, 0.12, len),
        new THREE.MeshBasicMaterial({ color: r.color, transparent: true, opacity: Math.min(1, r.life * 5) }),
      );
      mesh.position.set((r.x0 + r.x1) / 2, 1.1, (r.z0 + r.z1) / 2);
      mesh.rotation.y = Math.atan2(dx, dz);
      this.rails.push(mesh);
      this.root.add(mesh);
    }
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
    this.root.clear();
    this.enemies.clear();
    this.projectiles.clear();
    this.pickups.clear();
    this.hazards.clear();
    this.effects.clear();
    this.rails = [];
    this.cacheActor = null;
    this.gunshipRoot = null;
    this.boltGeo.dispose();
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
    this.playerAstro = null;
    this.playerMech = null;
    this.playerShip = null;
    this.shipExhaust = null;
    this.exhaustL = null;
    this.exhaustR = null;
    this.bosses.clear();
  }
}


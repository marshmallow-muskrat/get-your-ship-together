import * as THREE from 'three';
import { HEROES } from '../../content/heroes';
import { BOSS_DEMON, ENEMY_BY_ID, MELEE_BLOB } from '../../content/enemies';
import { AssetLibrary, createAnimator } from '../../assets/AssetLibrary';
import { HORDE, SURVIVOR, SURVIVOR_BOSS } from './survivorContent';
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
  private enemies = new Map<number, ActorVis>();
  private boss: ActorVis | null = null;
  private projectiles = new Map<number, THREE.Mesh>();
  private pickups = new Map<number, THREE.Object3D>();
  private hazards = new Map<number, THREE.Object3D>();
  private effects = new Map<number, THREE.Object3D>();
  private rails: THREE.Object3D[] = [];
  private boltGeo = new THREE.SphereGeometry(0.14, 8, 8);
  private animFrame = 0;
  private readonly mats = new Map<string, THREE.MeshStandardMaterial>();

  constructor(assets: AssetLibrary) {
    this.assets = assets;
    this.root.name = 'survivor-actors';
  }

  async setupPlayer(heroId: keyof typeof HEROES): Promise<void> {
    const hero = HEROES[heroId];
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
    }
    if (this.playerMech) this.playerMech.root.visible = false;
    if (this.playerAstro) this.root.add(this.playerAstro.root);
    if (this.playerMech) this.root.add(this.playerMech.root);
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
      }
    }
  }

  private animPlayer(vis: ActorVis, p: SurvivorState['player'], dt: number): void {
    if (!vis.animator) return;
    if (!p.alive) vis.animator.play('death', 0.05);
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
    const b = state.boss;
    if (!b.active) {
      if (this.boss) {
        this.root.remove(this.boss.root);
        this.boss = null;
      }
      return;
    }
    if (!this.boss) {
      this.boss = this.makeFromUrl(
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
      if (this.boss) this.root.add(this.boss.root);
    }
    if (!this.boss) return;
    const scale = SURVIVOR.actorScale.boss * (b.phase >= 3 ? 1.08 : 1);
    this.place(this.boss, b.x, b.z, b.facingX, b.facingZ, scale);
    if (this.boss.animator) {
      if (b.state === 'dead') this.boss.animator.play('death', 0.08);
      else if (b.state === 'windup' || b.state === 'active') this.boss.animator.play('shoot', 0.06);
      else this.boss.animator.play('idle');
      this.boss.animator.update(dt);
    }
    this.flash(this.boss, b.hitFlash, b.state === 'windup' || b.phase >= 3);
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
      let s = p.kind === 'drone' ? 0.75 : p.kind === 'rocket' ? 1.3 : p.kind === 'bioplasma' ? 1.45 : 1;
      mesh.scale.setScalar(s);
      mesh.position.set(p.x, p.kind === 'rocket' && p.armTimer > 0 ? 0.1 : p.kind === 'bioplasma' ? 0.85 : 1.0, p.z);
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
        const color = p.kind === 'xp' ? '#66ffcc' : p.kind === 'repair' ? '#4df0d0' : '#ffcc44';
        const mesh = new THREE.Mesh(
          new THREE.OctahedronGeometry(p.kind === 'supply' ? 0.35 : 0.18, 0),
          this.mat(color),
        );
        obj = mesh;
        this.pickups.set(p.id, obj);
        this.root.add(obj);
      }
      obj.position.set(p.x, 0.5 + Math.sin(performance.now() * 0.008 + p.id) * 0.1, p.z);
      obj.rotation.y += 0.04;
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
      const grow = e.kind === 'repulsor' ? 0.4 + t * 1.8 : 0.5 + t * 1.4;
      obj.scale.setScalar(grow);
      obj.traverse((c) => {
        if (c instanceof THREE.Mesh && c.material instanceof THREE.MeshBasicMaterial) {
          c.material.opacity = Math.max(0, 0.75 * (1 - t));
        }
      });
    }
  }

  private createEffect(e: SurvivorState['effects'][0]): THREE.Object3D {
    const g = new THREE.Group();
    const color = e.color;
    if (e.kind === 'rail') {
      const len = e.length ?? 10;
      const mesh = new THREE.Mesh(
        new THREE.BoxGeometry(e.width ?? 0.4, 0.15, len),
        new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.85 }),
      );
      mesh.position.set((e.facingX ?? 0) * len * 0.5, 1.1, (e.facingZ ?? 1) * len * 0.5);
      mesh.rotation.y = Math.atan2(e.facingX ?? 0, e.facingZ ?? 1);
      g.add(mesh);
      g.position.set(e.x, 0, e.z);
      return g;
    }
    const r = e.radius ?? e.scale ?? 1;
    const ring = new THREE.Mesh(
      new THREE.RingGeometry(e.kind === 'repulsor' ? r * 0.15 : r * 0.2, r, e.kind === 'repulsor' ? 40 : 28),
      new THREE.MeshBasicMaterial({
        color,
        transparent: true,
        opacity: e.kind === 'repulsor' ? 0.8 : 0.65,
        side: THREE.DoubleSide,
        depthWrite: false,
      }),
    );
    ring.rotation.x = -Math.PI / 2;
    g.add(ring);
    if (e.kind === 'repulsor') {
      const disc = new THREE.Mesh(
        new THREE.CircleGeometry(r * 0.55, 32),
        new THREE.MeshBasicMaterial({
          color,
          transparent: true,
          opacity: 0.22,
          side: THREE.DoubleSide,
          depthWrite: false,
        }),
      );
      disc.rotation.x = -Math.PI / 2;
      g.add(disc);
    }
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
    this.boltGeo.dispose();
    for (const m of this.mats.values()) m.dispose();
    this.mats.clear();
    this.playerAstro = null;
    this.playerMech = null;
    this.playerShip = null;
    this.boss = null;
  }
}


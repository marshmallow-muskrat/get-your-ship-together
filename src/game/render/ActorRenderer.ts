import * as THREE from 'three';
import { HEROES } from '../content/heroes';
import { BOSS_DEMON, ENEMY_BY_ID, MELEE_BLOB } from '../content/enemies';
import { AssetLibrary, createAnimator } from '../assets/AssetLibrary';
import type { GameState } from '../simulation/types';
import { length2 } from '../simulation/collision';

type Animator = ReturnType<typeof createAnimator>;

interface ActorVisual {
  root: THREE.Object3D;
  animator: Animator | null;
  flashMats: THREE.MeshStandardMaterial[];
  kind: string;
}

/**
 * Maps simulation actors to Three.js presentation.
 * Never authorizes hits — only reflects state.
 */
export class ActorRenderer {
  readonly root = new THREE.Group();
  private playerAstro: ActorVisual | null = null;
  private playerMech: ActorVisual | null = null;
  private enemies = new Map<number, ActorVisual>();
  private boss: ActorVisual | null = null;
  private shipPart: THREE.Object3D | null = null;
  private readonly assets: AssetLibrary;
  private heroId: string | null = null;

  constructor(assets: AssetLibrary) {
    this.assets = assets;
    this.root.name = 'actors';
  }

  async setupPlayer(heroId: keyof typeof HEROES): Promise<void> {
    this.clearPlayer();
    this.heroId = heroId;
    const hero = HEROES[heroId];
    this.playerAstro = this.makeVisual(hero.astronaut.url, hero.astronaut.anim, 'astronaut');
    this.playerMech = this.makeVisual(hero.mech.url, hero.mech.anim, 'mech');
    if (this.playerMech) this.playerMech.root.visible = false;
    if (this.playerAstro) this.root.add(this.playerAstro.root);
    if (this.playerMech) this.root.add(this.playerMech.root);
  }

  private makeVisual(
    url: string,
    anim: import('../content/heroes').AnimationAliases,
    kind: string,
  ): ActorVisual | null {
    const cloned = this.assets.clone(url);
    if (!cloned) return null;
    const flashMats: THREE.MeshStandardMaterial[] = [];
    cloned.root.traverse((child) => {
      if (child instanceof THREE.Mesh) {
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
    return { root: cloned.root, animator, flashMats, kind };
  }

  private clearPlayer(): void {
    if (this.playerAstro) this.root.remove(this.playerAstro.root);
    if (this.playerMech) this.root.remove(this.playerMech.root);
    this.playerAstro = null;
    this.playerMech = null;
  }

  sync(state: GameState, dt: number): void {
    this.syncPlayer(state, dt);
    this.syncEnemies(state, dt);
    this.syncBoss(state, dt);
    this.syncShipPart(state, state.time);
  }

  private syncPlayer(state: GameState, dt: number): void {
    const p = state.player;
    const showMech = p.form === 'mech' || p.formState === 'entering';
    // Atomic swap: during entering show mech after half, during exiting show astro after half.
    let mechVisible = false;
    if (p.formState === 'entering') {
      mechVisible = p.formTimer < 0.2;
    } else if (p.formState === 'exiting') {
      mechVisible = p.formTimer > 0.15;
    } else {
      mechVisible = p.form === 'mech';
    }

    if (this.playerAstro) {
      this.playerAstro.root.visible = !mechVisible;
      this.place(this.playerAstro, p.x, p.z, p.facingX, p.facingZ);
      this.animateActor(this.playerAstro, p, state, dt);
      this.flash(this.playerAstro, p.hitFlash, p.invulnTimer > 0 || p.dodgeActive > 0);
    }
    if (this.playerMech) {
      this.playerMech.root.visible = mechVisible;
      this.place(this.playerMech, p.x, p.z, p.facingX, p.facingZ);
      this.animateActor(this.playerMech, p, state, dt);
      this.flash(this.playerMech, p.hitFlash, false);
    }
  }

  private animateActor(
    visual: ActorVisual,
    p: GameState['player'],
    state: GameState,
    dt: number,
  ): void {
    if (!visual.animator) return;
    if (!p.alive) {
      visual.animator.play('death', 0.05);
    } else if (p.dodgeActive > 0) {
      visual.animator.play('dodge', 0.05);
    } else if (p.hitFlash > 0.08) {
      visual.animator.play('hit', 0.05);
    } else if (p.fireCooldown > 0.05) {
      visual.animator.play('shoot', 0.04);
    } else {
      const speed = length2(p.vx, p.vz);
      if (speed > 3.5) visual.animator.play('run');
      else if (speed > 0.4) visual.animator.play('walk');
      else visual.animator.play('idle');
    }
    visual.animator.update(dt);
    void state;
  }

  private syncEnemies(state: GameState, dt: number): void {
    const alive = new Set(state.enemies.map((e) => e.id));
    for (const [id, visual] of this.enemies) {
      if (!alive.has(id)) {
        this.root.remove(visual.root);
        this.enemies.delete(id);
      }
    }
    for (const e of state.enemies) {
      let visual = this.enemies.get(e.id);
      if (!visual) {
        const def = ENEMY_BY_ID[e.defId] ?? MELEE_BLOB;
        const created = this.makeVisual(def.url, {
          idle: def.anim.idle,
          walk: def.anim.walk,
          run: def.anim.walk,
          shoot: def.anim.attack,
          dodge: def.anim.idle,
          hit: def.anim.hit,
          death: def.anim.death,
          ability: def.anim.attack,
        }, e.defId);
        if (!created) continue;
        visual = created;
        this.enemies.set(e.id, visual);
        this.root.add(visual.root);
      }
      this.place(visual, e.x, e.z, e.facingX, e.facingZ);
      if (visual.animator) {
        if (e.state === 'dead') visual.animator.play('death', 0.05);
        else if (e.state === 'hit') visual.animator.play('hit', 0.05);
        else if (e.state === 'windup' || e.state === 'active') visual.animator.play('shoot', 0.05);
        else if (e.state === 'chase') visual.animator.play('walk');
        else visual.animator.play('idle');
        visual.animator.update(dt);
      }
      this.flash(visual, e.hitFlash, e.state === 'spawn');
      if (e.state === 'spawn') {
        visual.root.scale.setScalar(Math.max(0.1, 1 - e.stateTimer / 0.35));
      } else {
        visual.root.scale.setScalar(1);
      }
    }
  }

  private syncBoss(state: GameState, dt: number): void {
    const b = state.boss;
    if (!b.active) {
      if (this.boss) {
        this.root.remove(this.boss.root);
        this.boss = null;
      }
      return;
    }
    if (!this.boss) {
      this.boss = this.makeVisual(BOSS_DEMON.url, {
        idle: [...BOSS_DEMON.anim.idle],
        walk: [...BOSS_DEMON.anim.walk],
        run: [...BOSS_DEMON.anim.walk],
        shoot: [...BOSS_DEMON.anim.attack],
        dodge: [...BOSS_DEMON.anim.idle],
        hit: [...BOSS_DEMON.anim.hit],
        death: [...BOSS_DEMON.anim.death],
        ability: [...BOSS_DEMON.anim.attack],
      }, 'boss');
      if (this.boss) this.root.add(this.boss.root);
    }
    if (!this.boss) return;
    this.place(this.boss, b.x, b.z, b.facingX, b.facingZ);
    if (this.boss.animator) {
      if (b.state === 'dead') this.boss.animator.play('death', 0.08);
      else if (b.state === 'windup' || b.state === 'active') this.boss.animator.play('shoot', 0.06);
      else if (b.state === 'phase_shift') this.boss.animator.play('hit', 0.06);
      else this.boss.animator.play('idle');
      this.boss.animator.update(dt);
    }
    this.flash(this.boss, b.hitFlash, b.state === 'intro' || b.state === 'phase_shift');
  }

  private syncShipPart(state: GameState, time: number): void {
    if (!state.shipPart.active || state.shipPart.collected) {
      if (this.shipPart) {
        this.root.remove(this.shipPart);
        this.shipPart = null;
      }
      return;
    }
    if (!this.shipPart) {
      const g = new THREE.Group();
      const core = new THREE.Mesh(
        new THREE.OctahedronGeometry(0.45, 0),
        new THREE.MeshStandardMaterial({
          color: '#66f0ff',
          emissive: '#22d0e0',
          emissiveIntensity: 1.4,
          metalness: 0.4,
          roughness: 0.3,
        }),
      );
      const ring = new THREE.Mesh(
        new THREE.TorusGeometry(0.7, 0.06, 8, 24),
        new THREE.MeshStandardMaterial({
          color: '#a8ffff',
          emissive: '#44e0ff',
          emissiveIntensity: 0.9,
        }),
      );
      ring.rotation.x = Math.PI / 2;
      g.add(core, ring);
      this.shipPart = g;
      this.root.add(g);
    }
    this.shipPart.position.set(state.shipPart.x, 1.1 + Math.sin(time * 2.5) * 0.15, state.shipPart.z);
    this.shipPart.rotation.y = time * 1.4;
  }

  private place(visual: ActorVisual, x: number, z: number, fx: number, fz: number): void {
    visual.root.position.set(x, 0, z);
    const yaw = Math.atan2(fx, fz);
    visual.root.rotation.y = yaw;
  }

  private flash(visual: ActorVisual, hitFlash: number, invuln: boolean): void {
    const pulse = hitFlash > 0 ? 0.9 : invuln ? 0.35 + Math.sin(performance.now() * 0.03) * 0.2 : 0;
    for (const m of visual.flashMats) {
      m.emissiveIntensity = Math.max(m.userData.baseEmissive ?? 0.15, pulse * 1.8);
      if (hitFlash > 0) m.color.lerp(new THREE.Color('#ffffff'), 0.35);
    }
  }

  dispose(): void {
    this.clearPlayer();
    for (const visual of this.enemies.values()) this.root.remove(visual.root);
    this.enemies.clear();
    if (this.boss) this.root.remove(this.boss.root);
    this.boss = null;
    if (this.shipPart) this.root.remove(this.shipPart);
    this.shipPart = null;
    this.root.clear();
  }
}

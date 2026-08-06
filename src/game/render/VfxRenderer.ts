import * as THREE from 'three';
import type { EffectEvent, GameState, ProjectileState } from '../simulation/types';

/** Pooled projectiles, telegraphs, and combat VFX with readable ability feedback. */
export class VfxRenderer {
  readonly root = new THREE.Group();
  private projectiles = new Map<number, THREE.Object3D>();
  private effects = new Map<number, THREE.Object3D>();
  private rails: THREE.Object3D[] = [];
  private readonly boltGeo = new THREE.SphereGeometry(0.14, 10, 10);
  private readonly droneGeo = new THREE.OctahedronGeometry(0.16, 0);
  private readonly mats = new Map<string, THREE.MeshStandardMaterial>();
  private readonly basicMats = new Map<string, THREE.MeshBasicMaterial>();

  constructor() {
    this.root.name = 'vfx';
  }

  private std(color: string, intensity = 1.5): THREE.MeshStandardMaterial {
    const key = `s:${color}:${intensity}`;
    let m = this.mats.get(key);
    if (!m) {
      m = new THREE.MeshStandardMaterial({
        color,
        emissive: color,
        emissiveIntensity: intensity,
        metalness: 0.15,
        roughness: 0.3,
        transparent: true,
        opacity: 0.95,
      });
      this.mats.set(key, m);
    }
    return m;
  }

  private basic(color: string, opacity = 0.7): THREE.MeshBasicMaterial {
    const key = `b:${color}:${opacity}`;
    let m = this.basicMats.get(key);
    if (!m) {
      m = new THREE.MeshBasicMaterial({
        color,
        transparent: true,
        opacity,
        side: THREE.DoubleSide,
        depthWrite: false,
      });
      this.basicMats.set(key, m);
    }
    return m;
  }

  sync(state: GameState): void {
    this.syncProjectiles(state.projectiles);
    this.syncEffects(state.effects);
    this.syncRails(state);
  }

  private syncProjectiles(list: ProjectileState[]): void {
    const alive = new Set(list.map((p) => p.id));
    for (const [id, obj] of this.projectiles) {
      if (!alive.has(id)) {
        this.root.remove(obj);
        this.projectiles.delete(id);
      }
    }
    for (const p of list) {
      let obj = this.projectiles.get(p.id);
      if (!obj) {
        obj = this.createProjectile(p);
        this.projectiles.set(p.id, obj);
        this.root.add(obj);
      }
      this.updateProjectile(obj, p);
    }
  }

  private createProjectile(p: ProjectileState): THREE.Object3D {
    const g = new THREE.Group();
    if (p.kind === 'drone') {
      const core = new THREE.Mesh(this.droneGeo, this.std(p.color, 1.8));
      const ring = new THREE.Mesh(
        new THREE.TorusGeometry(0.22, 0.035, 6, 16),
        this.basic(p.color, 0.85),
      );
      ring.rotation.x = Math.PI / 2;
      const glow = new THREE.Mesh(new THREE.SphereGeometry(0.28, 8, 8), this.basic(p.color, 0.25));
      g.add(core, ring, glow);
    } else if (p.kind === 'rocket') {
      const marker = new THREE.Mesh(
        new THREE.RingGeometry(0.35, p.explodeRadius || 1.2, 32),
        this.basic(p.color, 0.45),
      );
      marker.rotation.x = -Math.PI / 2;
      marker.name = 'marker';
      const pip = new THREE.Mesh(new THREE.SphereGeometry(0.18, 8, 8), this.std(p.color, 2));
      pip.position.y = 1.6;
      pip.name = 'pip';
      const beam = new THREE.Mesh(
        new THREE.CylinderGeometry(0.04, 0.04, 1.6, 6),
        this.basic(p.color, 0.5),
      );
      beam.position.y = 0.8;
      beam.name = 'beam';
      g.add(marker, pip, beam);
    } else {
      const core = new THREE.Mesh(this.boltGeo, this.std(p.color, 1.6));
      const trail = new THREE.Mesh(
        new THREE.CapsuleGeometry(0.07, 0.45, 4, 8),
        this.basic(p.color, 0.55),
      );
      trail.rotation.z = Math.PI / 2;
      trail.position.x = -0.2;
      trail.name = 'trail';
      g.add(core, trail);
    }
    return g;
  }

  private updateProjectile(obj: THREE.Object3D, p: ProjectileState): void {
    obj.position.set(p.x, p.kind === 'rocket' && p.armTimer > 0 ? 0 : p.y, p.z);
    if (p.kind === 'rocket' && p.armTimer > 0) {
      const t = 1 - p.armTimer / Math.max(0.01, p.maxLife);
      const marker = obj.getObjectByName('marker');
      if (marker) marker.scale.setScalar(0.7 + t * 0.5);
      const pip = obj.getObjectByName('pip');
      if (pip) pip.position.y = 1.8 - t * 1.5;
    } else if (p.kind !== 'rocket') {
      const yaw = Math.atan2(p.vx, p.vz);
      obj.rotation.y = yaw;
      if (p.kind === 'drone') {
        obj.rotation.y += performance.now() * 0.008;
        obj.position.y = 1.1 + Math.sin(performance.now() * 0.01 + p.id) * 0.12;
      }
    } else {
      // Exploding — hide, impact effect handles blast
      obj.visible = p.armTimer > 0;
    }
  }

  private syncEffects(list: EffectEvent[]): void {
    const alive = new Set(list.map((e) => e.id));
    for (const [id, obj] of this.effects) {
      if (!alive.has(id)) {
        this.root.remove(obj);
        this.effects.delete(id);
      }
    }
    for (const e of list) {
      let obj = this.effects.get(e.id);
      if (!obj) {
        obj = this.createEffect(e);
        this.effects.set(e.id, obj);
        this.root.add(obj);
      }
      const t = 1 - e.life / e.maxLife;
      this.updateEffect(obj, e, t);
    }
  }

  private createEffect(e: EffectEvent): THREE.Object3D {
    const color = e.color ?? '#ffffff';
    if (e.kind === 'telegraph') {
      const g = new THREE.Group();
      if (e.shape === 'circle') {
        const ring = new THREE.Mesh(
          new THREE.RingGeometry(Math.max(0.15, (e.radius ?? 2) * 0.72), e.radius ?? 2, 56),
          this.basic(color, 0.38),
        );
        ring.rotation.x = -Math.PI / 2;
        const fill = new THREE.Mesh(
          new THREE.CircleGeometry((e.radius ?? 2) * 0.72, 48),
          this.basic(color, 0.12),
        );
        fill.rotation.x = -Math.PI / 2;
        g.add(ring, fill);
      } else if (e.shape === 'cone') {
        const range = e.radius ?? 3;
        const angle = e.angle ?? Math.PI / 2;
        const shape = new THREE.Shape();
        shape.moveTo(0, 0);
        const segs = 20;
        for (let i = 0; i <= segs; i += 1) {
          const a = -angle / 2 + (angle * i) / segs;
          shape.lineTo(Math.sin(a) * range, Math.cos(a) * range);
        }
        shape.lineTo(0, 0);
        const mesh = new THREE.Mesh(new THREE.ShapeGeometry(shape), this.basic(color, 0.34));
        mesh.rotation.x = -Math.PI / 2;
        g.add(mesh);
      } else {
        const len = e.length ?? 8;
        const width = e.width ?? 0.6;
        const mesh = new THREE.Mesh(new THREE.PlaneGeometry(width, len), this.basic(color, 0.36));
        mesh.rotation.x = -Math.PI / 2;
        mesh.position.z = len * 0.5;
        g.add(mesh);
      }
      g.position.set(e.x, 0.07, e.z);
      if (e.facingX != null && e.facingZ != null) {
        g.rotation.y = Math.atan2(e.facingX, e.facingZ);
      }
      return g;
    }

    if (e.kind === 'rail') {
      const g = new THREE.Group();
      const len = e.length ?? 10;
      const width = e.width ?? 0.4;
      const core = new THREE.Mesh(
        new THREE.BoxGeometry(width * 0.35, 0.22, len),
        this.basic('#ffffff', 0.95),
      );
      const glow = new THREE.Mesh(
        new THREE.BoxGeometry(width * 1.4, 0.12, len),
        this.basic(color, 0.55),
      );
      const outer = new THREE.Mesh(
        new THREE.BoxGeometry(width * 2.2, 0.06, len),
        this.basic(color, 0.28),
      );
      g.add(outer, glow, core);
      g.position.set(e.x + (e.facingX ?? 0) * len * 0.5, 1.15, e.z + (e.facingZ ?? 1) * len * 0.5);
      g.rotation.y = Math.atan2(e.facingX ?? 0, e.facingZ ?? 1);
      return g;
    }

    if (e.kind === 'pulse' || e.kind === 'repair' || e.kind === 'transform' || e.kind === 'spawn' || e.kind === 'death' || e.kind === 'pickup' || e.kind === 'impact' || e.kind === 'muzzle') {
      const g = new THREE.Group();
      const radius = e.radius ?? e.scale ?? 1;
      const ring = new THREE.Mesh(
        new THREE.RingGeometry(radius * 0.15, radius, 40),
        this.basic(color, 0.75),
      );
      ring.rotation.x = -Math.PI / 2;
      ring.name = 'ring';
      g.add(ring);

      if (e.kind === 'pulse' || e.kind === 'transform' || e.kind === 'repair') {
        const ring2 = new THREE.Mesh(
          new THREE.RingGeometry(radius * 0.4, radius * 0.7, 36),
          this.basic(color, 0.45),
        );
        ring2.rotation.x = -Math.PI / 2;
        ring2.name = 'ring2';
        g.add(ring2);
        const column = new THREE.Mesh(
          new THREE.CylinderGeometry(0.15, 0.45, 2.4, 10, 1, true),
          this.basic(color, 0.35),
        );
        column.position.y = 1.2;
        column.name = 'column';
        g.add(column);
      }

      if (e.kind === 'muzzle' || e.kind === 'impact' || e.kind === 'death' || e.kind === 'pickup') {
        const core = new THREE.Mesh(
          new THREE.SphereGeometry(e.kind === 'death' ? 0.55 : 0.28, 12, 12),
          this.std(color, 2.2),
        );
        core.position.y = e.y ?? (e.kind === 'muzzle' ? 1.1 : 0.4);
        core.name = 'core';
        g.add(core);
      }

      g.position.set(e.x, 0.08, e.z);
      return g;
    }

    if (e.kind === 'rocket') {
      const g = new THREE.Group();
      const ring = new THREE.Mesh(
        new THREE.RingGeometry(0.25, e.radius ?? 1.2, 28),
        this.basic(color, 0.5),
      );
      ring.rotation.x = -Math.PI / 2;
      const crossA = new THREE.Mesh(new THREE.PlaneGeometry(0.08, (e.radius ?? 1.2) * 2), this.basic(color, 0.4));
      crossA.rotation.x = -Math.PI / 2;
      const crossB = new THREE.Mesh(new THREE.PlaneGeometry((e.radius ?? 1.2) * 2, 0.08), this.basic(color, 0.4));
      crossB.rotation.x = -Math.PI / 2;
      g.add(ring, crossA, crossB);
      g.position.set(e.x, 0.09, e.z);
      return g;
    }

    if (e.kind === 'damage_number') {
      const mesh = new THREE.Mesh(new THREE.SphereGeometry(0.09, 6, 6), this.basic(color, 0.9));
      mesh.position.set(e.x, e.y ?? 1.2, e.z);
      return mesh;
    }

    return new THREE.Group();
  }

  private updateEffect(obj: THREE.Object3D, e: EffectEvent, t: number): void {
    const fade = Math.max(0, 1 - t);

    if (e.kind === 'damage_number') {
      obj.position.y = (e.y ?? 1.2) + t * 1.1;
      obj.traverse((c) => {
        if (c instanceof THREE.Mesh && c.material instanceof THREE.MeshBasicMaterial) {
          c.material.opacity = fade;
        }
      });
      return;
    }

    if (e.kind === 'rail') {
      obj.traverse((c) => {
        if (c instanceof THREE.Mesh && c.material instanceof THREE.MeshBasicMaterial) {
          c.material.opacity = fade * (c === obj.children[2] ? 0.95 : 0.5);
        }
      });
      obj.scale.set(1, 1, 1);
      return;
    }

    if (e.kind === 'telegraph') {
      const pulse = 0.28 + Math.sin(t * Math.PI * 2) * 0.12;
      obj.traverse((c) => {
        if (c instanceof THREE.Mesh && c.material instanceof THREE.MeshBasicMaterial) {
          c.material.opacity = pulse;
        }
      });
      return;
    }

    if (e.kind === 'rocket') {
      const s = 0.85 + Math.sin(t * Math.PI * 4) * 0.1;
      obj.scale.setScalar(s);
      obj.traverse((c) => {
        if (c instanceof THREE.Mesh && c.material instanceof THREE.MeshBasicMaterial) {
          c.material.opacity = 0.35 + fade * 0.35;
        }
      });
      return;
    }

    // Expanding rings / blasts
    const grow = e.kind === 'pulse' || e.kind === 'death' || e.kind === 'spawn' || e.kind === 'repair' || e.kind === 'transform' || e.kind === 'pickup' || e.kind === 'impact';
    if (grow) {
      const s = 0.35 + t * 1.8;
      const ring = obj.getObjectByName('ring');
      if (ring) ring.scale.setScalar(s);
      const ring2 = obj.getObjectByName('ring2');
      if (ring2) ring2.scale.setScalar(s * 0.85);
      const column = obj.getObjectByName('column');
      if (column) {
        column.scale.set(1 - t * 0.4, 1 + t * 0.6, 1 - t * 0.4);
        column.position.y = 1.2 + t * 0.5;
      }
      const core = obj.getObjectByName('core');
      if (core) core.scale.setScalar(Math.max(0.1, 1.2 - t));
    }

    obj.traverse((c) => {
      if (c instanceof THREE.Mesh) {
        const mat = c.material;
        if (mat instanceof THREE.MeshBasicMaterial || mat instanceof THREE.MeshStandardMaterial) {
          if ('opacity' in mat) mat.opacity = fade * (e.kind === 'muzzle' ? 0.9 : 0.7);
        }
      }
    });
  }

  private syncRails(state: GameState): void {
    for (const mesh of this.rails) this.root.remove(mesh);
    this.rails = [];
    for (const r of state.railSegments) {
      const dx = r.x1 - r.x0;
      const dz = r.z1 - r.z0;
      const len = Math.hypot(dx, dz);
      const g = new THREE.Group();
      const core = new THREE.Mesh(
        new THREE.BoxGeometry(0.18, 0.2, len),
        this.basic('#ffffff', Math.min(1, r.life * 5)),
      );
      const glow = new THREE.Mesh(
        new THREE.BoxGeometry(0.55, 0.1, len),
        this.basic(r.color, Math.min(0.7, r.life * 3)),
      );
      g.add(glow, core);
      g.position.set((r.x0 + r.x1) / 2, 1.15, (r.z0 + r.z1) / 2);
      g.rotation.y = Math.atan2(dx, dz);
      this.rails.push(g);
      this.root.add(g);
    }
  }

  dispose(): void {
    for (const obj of this.projectiles.values()) this.root.remove(obj);
    this.projectiles.clear();
    for (const obj of this.effects.values()) this.root.remove(obj);
    this.effects.clear();
    for (const mesh of this.rails) this.root.remove(mesh);
    this.rails = [];
    this.boltGeo.dispose();
    this.droneGeo.dispose();
    for (const m of this.mats.values()) m.dispose();
    for (const m of this.basicMats.values()) m.dispose();
    this.mats.clear();
    this.basicMats.clear();
    this.root.clear();
  }
}

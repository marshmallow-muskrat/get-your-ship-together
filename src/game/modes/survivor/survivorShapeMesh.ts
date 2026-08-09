/**
 * Floor mesh that draws an `AttackShape` exactly.
 *
 * Geometry buffers are allocated once at construction and rewritten in place, so an
 * expanding ring or a sweeping beam never allocates a new GPU buffer per frame — the
 * pool reaches a high-water mark and stays there.
 */
import * as THREE from 'three';
import type { ShapeRenderDesc } from './survivorAttackShapes';

const RING_SEG = 64;
const CONE_SEG = 32;
/** Worst case is the annulus: two rings of RING_SEG vertices. */
const MAX_VERTS = RING_SEG * 2 + 2;
/** Worst case is the annulus: RING_SEG quads. */
const MAX_INDICES = RING_SEG * 6;

export class AttackShapeMesh {
  readonly mesh: THREE.Mesh;
  readonly material: THREE.MeshBasicMaterial;
  private readonly geo = new THREE.BufferGeometry();
  private readonly positions = new Float32Array(MAX_VERTS * 3);
  private readonly indices = new Uint16Array(MAX_INDICES);
  private readonly posAttr: THREE.BufferAttribute;
  private readonly idxAttr: THREE.BufferAttribute;
  private vCount = 0;
  private iCount = 0;

  constructor() {
    this.posAttr = new THREE.BufferAttribute(this.positions, 3);
    this.posAttr.setUsage(THREE.DynamicDrawUsage);
    this.geo.setAttribute('position', this.posAttr);
    this.idxAttr = new THREE.BufferAttribute(this.indices, 1);
    this.idxAttr.setUsage(THREE.DynamicDrawUsage);
    this.geo.setIndex(this.idxAttr);
    this.geo.setDrawRange(0, 0);
    this.material = new THREE.MeshBasicMaterial({
      color: '#ff4455',
      transparent: true,
      opacity: 0.35,
      side: THREE.DoubleSide,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });
    this.mesh = new THREE.Mesh(this.geo, this.material);
    // The shape is written in world space, so the object transform stays identity.
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 2;
  }

  private reset(): void {
    this.vCount = 0;
    this.iCount = 0;
  }

  private vert(x: number, y: number, z: number): number {
    const i = this.vCount;
    this.positions[i * 3] = x;
    this.positions[i * 3 + 1] = y;
    this.positions[i * 3 + 2] = z;
    this.vCount = i + 1;
    return i;
  }

  private tri(a: number, b: number, c: number): void {
    if (this.iCount + 3 > MAX_INDICES) return;
    this.indices[this.iCount] = a;
    this.indices[this.iCount + 1] = b;
    this.indices[this.iCount + 2] = c;
    this.iCount += 3;
  }

  /** Rewrite the buffers to match `desc` exactly. */
  update(desc: ShapeRenderDesc, y = 0.07): void {
    this.reset();
    switch (desc.visual) {
      case 'circle': {
        const c = this.vert(desc.x, y, desc.z);
        const first = this.vCount;
        for (let i = 0; i < RING_SEG; i += 1) {
          const a = (i / RING_SEG) * Math.PI * 2;
          this.vert(desc.x + Math.cos(a) * desc.radius, y, desc.z + Math.sin(a) * desc.radius);
        }
        for (let i = 0; i < RING_SEG; i += 1) {
          this.tri(c, first + i, first + ((i + 1) % RING_SEG));
        }
        break;
      }
      case 'ring': {
        // A real annulus: the safe core is a genuine hole, not a darker fill.
        const inner = Math.max(0, desc.inner);
        const outer = Math.max(inner + 0.001, desc.outer);
        const first = this.vCount;
        for (let i = 0; i < RING_SEG; i += 1) {
          const a = (i / RING_SEG) * Math.PI * 2;
          const cx = Math.cos(a);
          const cz = Math.sin(a);
          this.vert(desc.x + cx * inner, y, desc.z + cz * inner);
          this.vert(desc.x + cx * outer, y, desc.z + cz * outer);
        }
        for (let i = 0; i < RING_SEG; i += 1) {
          const i0 = first + i * 2;
          const i1 = first + ((i + 1) % RING_SEG) * 2;
          this.tri(i0, i0 + 1, i1 + 1);
          this.tri(i0, i1 + 1, i1);
        }
        break;
      }
      case 'line': {
        // Full collision width and length, centred on the segment midpoint.
        const fl = Math.hypot(desc.facingX, desc.facingZ) || 1;
        const fx = desc.facingX / fl;
        const fz = desc.facingZ / fl;
        // Perpendicular in the XZ plane.
        const px = -fz;
        const pz = fx;
        const hl = desc.length * 0.5;
        const hw = desc.width * 0.5;
        const a = this.vert(desc.x - fx * hl - px * hw, y, desc.z - fz * hl - pz * hw);
        const b = this.vert(desc.x + fx * hl - px * hw, y, desc.z + fz * hl - pz * hw);
        const c = this.vert(desc.x + fx * hl + px * hw, y, desc.z + fz * hl + pz * hw);
        const d = this.vert(desc.x - fx * hl + px * hw, y, desc.z - fz * hl + pz * hw);
        this.tri(a, b, c);
        this.tri(a, c, d);
        break;
      }
      case 'cone': {
        // A real wedge spanning ±halfAngle around facing, out to length.
        const base = Math.atan2(desc.facingX, desc.facingZ);
        const apex = this.vert(desc.x, y, desc.z);
        const first = this.vCount;
        for (let i = 0; i <= CONE_SEG; i += 1) {
          const t = i / CONE_SEG;
          const a = base - desc.halfAngle + t * desc.halfAngle * 2;
          this.vert(
            desc.x + Math.sin(a) * desc.length,
            y,
            desc.z + Math.cos(a) * desc.length,
          );
        }
        for (let i = 0; i < CONE_SEG; i += 1) {
          this.tri(apex, first + i, first + i + 1);
        }
        break;
      }
      default:
        break;
    }
    this.posAttr.needsUpdate = true;
    this.idxAttr.needsUpdate = true;
    this.geo.setDrawRange(0, this.iCount);
  }

  dispose(): void {
    this.geo.dispose();
    this.material.dispose();
  }
}

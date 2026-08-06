import * as THREE from 'three';
import { TUNING } from '../content/combatTuning';

/**
 * Orthographic isometric camera with smooth follow and restrained shake.
 * Offset matches Gloamreach-style 3/4 framing so heroes read large.
 */
export class IsoCamera {
  readonly camera: THREE.OrthographicCamera;
  private target = new THREE.Vector3();
  private current = new THREE.Vector3();
  private shakeAmp = 0;
  /** Same proportion as Gloamreach (10.5, 12.5, 10.5) — closer than the old 14/16/14. */
  private readonly offset = new THREE.Vector3(10.5, 12.5, 10.5);
  private halfHeight = TUNING.camera.frustumHalfHeight;

  constructor() {
    this.camera = new THREE.OrthographicCamera(-8, 8, 5, -5, 0.1, 100);
    this.camera.position.copy(this.offset);
    this.camera.lookAt(0, 0, 0);
  }

  resize(width: number, height: number): void {
    const aspect = width / Math.max(1, height);
    // Prefer height framing; keep a minimum width so side threats stay visible.
    const preferredHeight = this.halfHeight * 2;
    const minimumWidth = 8.5;
    const viewHeight = Math.max(preferredHeight, minimumWidth / Math.max(0.4, aspect));
    const h = viewHeight / 2;
    const w = h * aspect;
    this.camera.left = -w;
    this.camera.right = w;
    this.camera.top = h;
    this.camera.bottom = -h;
    this.camera.updateProjectionMatrix();
  }

  setFollow(x: number, y: number, z: number, lookAheadX = 0, lookAheadZ = 0): void {
    this.target.set(x + lookAheadX, y, z + lookAheadZ);
  }

  addShake(amount: number): void {
    this.shakeAmp = Math.min(1.2, this.shakeAmp + amount);
  }

  update(dt: number): void {
    const lerp = 1 - Math.exp(-TUNING.camera.followLerp * dt);
    this.current.lerp(this.target, lerp);
    this.shakeAmp = Math.max(0, this.shakeAmp - TUNING.camera.shakeDecay * dt * this.shakeAmp);

    const sx = (Math.random() - 0.5) * this.shakeAmp * 0.28;
    const sy = (Math.random() - 0.5) * this.shakeAmp * 0.16;
    const sz = (Math.random() - 0.5) * this.shakeAmp * 0.28;

    this.camera.position.set(
      this.current.x + this.offset.x + sx,
      this.current.y + this.offset.y + sy,
      this.current.z + this.offset.z + sz,
    );
    this.camera.lookAt(this.current.x + sx * 0.15, this.current.y, this.current.z + sz * 0.15);
  }

  /** Project pointer NDC into XZ plane at chest height for more natural aim. */
  pointerToWorld(ndcX: number, ndcY: number): { x: number; z: number } {
    const raycaster = new THREE.Raycaster();
    raycaster.setFromCamera(new THREE.Vector2(ndcX, ndcY), this.camera);
    // Aim plane at y≈0.9 (Gloamreach-style) so shots don't feel long.
    const plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), -0.9);
    const hit = new THREE.Vector3();
    if (raycaster.ray.intersectPlane(plane, hit)) {
      return { x: hit.x, z: hit.z };
    }
    return { x: this.current.x, z: this.current.z };
  }
}

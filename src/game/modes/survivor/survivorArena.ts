import * as THREE from 'three';
import { CELL, EnvAssetLibrary, type ModularPiece } from '../../assets/ModularKit';
import { SURVIVOR } from './survivorContent';

/**
 * Reactor Platform 7 — fixed-camera containment arena.
 * Modular Sci-Fi only; open center lanes, perimeter dressing.
 */
export class SurvivorArena {
  readonly root = new THREE.Group();
  private readonly lib = new EnvAssetLibrary();
  private readonly lights: THREE.Light[] = [];
  private ground: THREE.Mesh | null = null;

  async build(): Promise<THREE.Group> {
    this.root.clear();
    this.root.name = 'survivor-arena';

    const pieces: ModularPiece[] = [
      'FloorTile_Basic',
      'FloorTile_Basic2',
      'FloorTile_Empty',
      'FloorTile_Side',
      'Wall_1',
      'Wall_2',
      'Wall_5',
      'Window_Wall_SideA',
      'ThreeWindows_Wall_SideA',
      'DoorDouble_Wall_SideA',
      'Column_1',
      'Column_2',
      'Column_3',
      'Props_Computer',
      'Props_Crate',
      'Props_ContainerFull',
      'Props_Vessel_Tall',
      'Props_Pod',
      'Props_Laser',
      'Props_Teleporter_1',
      'Props_Base',
      'Details_Pipes_Long',
      'Details_Vent_1',
      'Details_Plate_Large',
      'Pipes',
    ];
    await this.lib.preloadAll(pieces, [], []);

    this.addFloor();
    this.addPerimeter();
    this.addCore();
    this.addQuadrants();
    this.addLighting();
    return this.root;
  }

  private mod(name: ModularPiece, x: number, z: number, opts?: { ry?: number; y?: number; scale?: number }): void {
    const o = this.lib.placeModular(name, x, z, opts);
    if (o) this.root.add(o);
  }

  private addFloor(): void {
    const h = SURVIVOR.arenaHalf;
    const geo = new THREE.BoxGeometry(h * 2 + 4, 0.12, h * 2 + 4);
    const mat = new THREE.MeshStandardMaterial({ color: '#0a1018', roughness: 0.95, metalness: 0.05 });
    this.ground = new THREE.Mesh(geo, mat);
    this.ground.position.set(0, -0.2, 0);
    this.ground.receiveShadow = true;
    this.root.add(this.ground);

    for (let x = -h; x < h; x += CELL) {
      for (let z = -h; z < h; z += CELL) {
        const cx = x + CELL / 2;
        const cz = z + CELL / 2;
        const edge = Math.abs(cx) > h - CELL || Math.abs(cz) > h - CELL;
        const ix = Math.floor(x / CELL);
        const iz = Math.floor(z / CELL);
        let piece: ModularPiece = 'FloorTile_Basic';
        if (edge) piece = 'FloorTile_Side';
        else if ((ix + iz) % 4 === 0) piece = 'FloorTile_Basic2';
        else if ((ix * 3 + iz) % 9 === 0) piece = 'FloorTile_Empty';
        let ry = 0;
        if (edge) {
          if (cz > h - CELL) ry = Math.PI;
          else if (cz < -h + CELL) ry = 0;
          else if (cx < -h + CELL) ry = Math.PI / 2;
          else if (cx > h - CELL) ry = -Math.PI / 2;
        } else ry = ((ix + iz) % 2) * (Math.PI / 2);
        this.mod(piece, cx, cz, { ry });
      }
    }
  }

  private wallRun(a: number, b: number, fixed: number, horizontal: boolean, style: 'solid' | 'window' | 'door'): void {
    const min = Math.min(a, b);
    const max = Math.max(a, b);
    for (let t = min; t < max - 0.1; t += CELL * 2) {
      const mid = t + CELL;
      if (mid > max) break;
      let piece: ModularPiece = 'Wall_1';
      if (style === 'window') piece = Math.floor(t / CELL) % 2 === 0 ? 'ThreeWindows_Wall_SideA' : 'Window_Wall_SideA';
      else if (style === 'door') {
        const center = (min + max) / 2;
        piece = Math.abs(mid - center) < CELL * 1.2 ? 'DoorDouble_Wall_SideA' : 'Wall_2';
      } else piece = Math.floor(t / CELL) % 3 === 0 ? 'Wall_5' : 'Wall_2';
      if (horizontal) this.mod(piece, mid, fixed, { ry: 0 });
      else this.mod(piece, fixed, mid, { ry: Math.PI / 2 });
    }
  }

  private addPerimeter(): void {
    const h = SURVIVOR.arenaHalf;
    this.wallRun(-h, h, -h, true, 'window');
    this.wallRun(-h, h, h, true, 'window');
    this.wallRun(-h, h, -h, false, 'door');
    this.wallRun(-h, h, h, false, 'door');

    // Corner columns
    for (const [x, z] of [
      [-h + 1.5, -h + 1.5],
      [-h + 1.5, h - 1.5],
      [h - 1.5, -h + 1.5],
      [h - 1.5, h - 1.5],
    ] as const) {
      this.mod('Column_2', x, z);
    }

    // Edge stations
    this.mod('Props_Computer', -h + 2, 0, { ry: Math.PI / 2 });
    this.mod('Props_Computer', h - 2, 0, { ry: -Math.PI / 2 });
    this.mod('Props_Laser', 0, -h + 2);
    this.mod('Props_Laser', 0, h - 2, { ry: Math.PI });
    this.mod('Props_ContainerFull', -h + 3, -h + 3, { ry: 0.3 });
    this.mod('Props_ContainerFull', h - 3, h - 3, { ry: -0.3 });
    this.mod('Props_Vessel_Tall', -h + 3, h - 3);
    this.mod('Props_Pod', h - 3, -h + 3, { ry: Math.PI / 2 });
    this.mod('Pipes', -h + 0.8, 4, { y: 0.5 });
    this.mod('Pipes', h - 0.8, -4, { ry: Math.PI, y: 0.5 });
    this.mod('Details_Pipes_Long', 6, -h + 0.8, { y: 0.9 });
    this.mod('Details_Plate_Large', -6, h - 0.8, { ry: Math.PI, y: 1.1 });
  }

  private addCore(): void {
    // Central containment reactor stack
    this.mod('Props_Base', 0, 0, { scale: 1.4 });
    this.mod('Column_3', 0, 0, { y: 0.1 });
    this.mod('Props_Teleporter_1', 0, 0, { y: 0.05, scale: 1.15 });
    this.mod('Props_Laser', 1.8, 0, { ry: Math.PI / 2 });
    this.mod('Props_Laser', -1.8, 0, { ry: -Math.PI / 2 });

    const core = new THREE.PointLight('#3fd8c8', 2.2, 18, 2);
    core.position.set(0, 3.2, 0);
    this.lights.push(core);
    this.root.add(core);
  }

  private addQuadrants(): void {
    // Light quadrant markers — not clutter
    const q = SURVIVOR.arenaHalf * 0.45;
    this.mod('Column_1', -q, -q);
    this.mod('Column_1', -q, q);
    this.mod('Column_1', q, -q);
    this.mod('Column_1', q, q);
    this.mod('Props_Crate', -q + 1.5, -q + 1.2, { ry: 0.4 });
    this.mod('Props_Crate', q - 1.5, q - 1.2, { ry: -0.5 });
  }

  private addLighting(): void {
    const hemi = new THREE.HemisphereLight('#8aa0c0', '#0c1016', 0.5);
    const key = new THREE.DirectionalLight('#c8d4e8', 1.1);
    key.position.set(-10, 22, 12);
    key.castShadow = true;
    key.shadow.mapSize.set(1024, 1024);
    const sh = Math.min(28, SURVIVOR.cameraHalf * 2.2);
    key.shadow.camera.left = -sh;
    key.shadow.camera.right = sh;
    key.shadow.camera.top = sh;
    key.shadow.camera.bottom = -sh;
    const fill = new THREE.DirectionalLight('#4a6088', 0.3);
    fill.position.set(12, 8, -10);
    this.lights.push(hemi, key, fill);
    this.root.add(hemi, key, fill);
  }

  /**
   * Orthographic isometric follow camera — tight frustum so the hero reads large,
   * while the arena is big enough to feel like a real roam space.
   */
  static createFixedCamera(aspect: number): THREE.OrthographicCamera {
    const { viewW, viewH } = SurvivorArena.viewSize(aspect);
    const cam = new THREE.OrthographicCamera(-viewW / 2, viewW / 2, viewH / 2, -viewH / 2, 0.1, 160);
    cam.up.set(0, 1, 0);
    SurvivorArena.followPlayer(cam, 0, 0);
    return cam;
  }

  static resizeFixedCamera(cam: THREE.OrthographicCamera, width: number, height: number): void {
    const aspect = width / Math.max(1, height);
    const { viewW, viewH } = SurvivorArena.viewSize(aspect);
    cam.left = -viewW / 2;
    cam.right = viewW / 2;
    cam.top = viewH / 2;
    cam.bottom = -viewH / 2;
    cam.updateProjectionMatrix();
  }

  /** World units visible on the short axis (height). Wider screens see more width. */
  private static viewSize(aspect: number): { viewW: number; viewH: number } {
    const half = SURVIVOR.cameraHalf;
    let viewH = half * 2;
    let viewW = viewH * aspect;
    const minW = half * 2 * 1.05;
    if (viewW < minW) {
      viewW = minW;
      viewH = viewW / aspect;
    }
    return { viewW, viewH };
  }

  /** Track player with a fixed isometric offset (camera position = lookAt + offset). */
  /**
   * Track the player, with an optional restrained impulse on heavy hits.
   *
   * `shake` is seconds of remaining impulse (see `player.hitShake`), applied only for
   * elite, miniboss and boss physical hits. The amplitude is deliberately small and
   * decays fast: the point is to make a heavy hit *land*, not to make the arena
   * unreadable at the moment the player most needs to see it. `t` drives a decaying
   * oscillation rather than random jitter so the motion is smooth and deterministic.
   */
  static followPlayer(
    cam: THREE.OrthographicCamera,
    x: number,
    z: number,
    shake = 0,
    t = 0,
  ): void {
    const ox = 18;
    const oy = 22;
    const oz = 18;
    let sx = 0;
    let sz = 0;
    if (shake > 0) {
      const amp = Math.min(0.5, shake) * 0.65;
      sx = Math.sin(t * 46) * amp;
      sz = Math.cos(t * 37) * amp;
    }
    cam.up.set(0, 1, 0);
    cam.position.set(x + ox + sx, oy, z + oz + sz);
    cam.lookAt(x + sx * 0.5, 0.6, z + sz * 0.5);
    cam.updateProjectionMatrix();
  }

  dispose(): void {
    this.lib.dispose();
    for (const l of this.lights) {
      this.root.remove(l);
      (l as THREE.Light & { dispose?: () => void }).dispose?.();
    }
    this.lights.length = 0;
    if (this.ground) {
      this.ground.geometry.dispose();
      (this.ground.material as THREE.Material).dispose();
    }
    this.root.clear();
  }
}

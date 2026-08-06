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
      'RoofTile_Vents',
      'RoofTile_Pipes1',
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
    this.mod('RoofTile_Vents', 0, 0, { y: 3.2, scale: 0.9 });
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
    this.mod('RoofTile_Pipes1', -q, 0, { y: 3.0, scale: 0.85 });
    this.mod('RoofTile_Pipes1', q, 0, { y: 3.0, scale: 0.85 });
  }

  private addLighting(): void {
    const hemi = new THREE.HemisphereLight('#8aa0c0', '#0c1016', 0.5);
    const key = new THREE.DirectionalLight('#c8d4e8', 1.1);
    key.position.set(-10, 22, 12);
    key.castShadow = true;
    key.shadow.mapSize.set(1024, 1024);
    key.shadow.camera.left = -20;
    key.shadow.camera.right = 20;
    key.shadow.camera.top = 20;
    key.shadow.camera.bottom = -20;
    const fill = new THREE.DirectionalLight('#4a6088', 0.3);
    fill.position.set(12, 8, -10);
    this.lights.push(hemi, key, fill);
    this.root.add(hemi, key, fill);
  }

  /** Fixed orthographic camera framing the full arena. */
  static createFixedCamera(aspect: number): THREE.OrthographicCamera {
    const half = SURVIVOR.arenaHalf + 2.5;
    const viewH = half * 2 * 1.05;
    const viewW = viewH * aspect;
    // Ensure width also fits arena diagonal-ish
    const needW = half * 2 * 1.15;
    const w = Math.max(viewW, needW);
    const h = w / aspect;
    const cam = new THREE.OrthographicCamera(-w / 2, w / 2, h / 2, -h / 2, 0.1, 120);
    cam.position.set(22, 26, 22);
    cam.lookAt(0, 0, 0);
    cam.updateProjectionMatrix();
    return cam;
  }

  static resizeFixedCamera(cam: THREE.OrthographicCamera, width: number, height: number): void {
    const aspect = width / Math.max(1, height);
    const half = SURVIVOR.arenaHalf + 2.5;
    let viewH = half * 2 * 1.08;
    let viewW = viewH * aspect;
    const minW = half * 2 * 1.2;
    if (viewW < minW) {
      viewW = minW;
      viewH = viewW / aspect;
    }
    cam.left = -viewW / 2;
    cam.right = viewW / 2;
    cam.top = viewH / 2;
    cam.bottom = -viewH / 2;
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

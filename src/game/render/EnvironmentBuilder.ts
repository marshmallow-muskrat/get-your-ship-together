import * as THREE from 'three';
import { LEVEL } from '../simulation/levelLayout';
import {
  CELL,
  EnvAssetLibrary,
  type ModularPiece,
  WALL_SCALE_Y,
} from '../assets/ModularKit';

/**
 * Clean, intentional facility — Modular Sci-Fi pack only.
 * Sparse props, dark floors, readable combat lanes.
 */
export class EnvironmentBuilder {
  readonly root = new THREE.Group();
  private readonly lib = new EnvAssetLibrary();
  private readonly lights: THREE.Light[] = [];
  private groundGeo: THREE.BufferGeometry | null = null;
  private groundMat: THREE.Material | null = null;

  async build(): Promise<THREE.Group> {
    this.root.clear();
    this.root.name = 'environment';

    const modular: ModularPiece[] = [
      'FloorTile_Basic',
      'FloorTile_Basic2',
      'FloorTile_Empty',
      'FloorTile_Side',
      'Wall_1',
      'Wall_2',
      'Wall_5',
      'Window_Wall_SideA',
      'LongWindow_Wall_SideA',
      'ThreeWindows_Wall_SideA',
      'DoorDouble_Wall_SideA',
      'Column_1',
      'Column_2',
      'Column_3',
      'Column_Slim',
      'Props_Crate',
      'Props_CrateLong',
      'Props_ContainerFull',
      'Props_Computer',
      'Props_ComputerSmall',
      'Props_Vessel_Tall',
      'Props_Vessel_Short',
      'Props_Pod',
      'Props_Shelf',
      'Props_Teleporter_1',
      'Props_Laser',
      'Props_Base',
      'Details_Pipes_Long',
      'Details_Pipes_Medium',
      'Details_Vent_1',
      'Details_Vent_2',
      'Details_Plate_Large',
      'RoofTile_Pipes1',
      'RoofTile_Vents',
      'Pipes',
    ];

    await this.lib.preloadAll(modular, [], []);

    this.addGround();
    this.addFloors();
    this.addPerimeterWalls();
    this.addArrival();
    this.addApproach();
    this.addAtrium();
    this.addBossChamber();
    this.addLighting();

    return this.root;
  }

  private add(obj: THREE.Object3D | null): void {
    if (obj) this.root.add(obj);
  }

  private mod(
    name: ModularPiece,
    x: number,
    z: number,
    opts?: { ry?: number; y?: number; scaleY?: number; scale?: number },
  ): void {
    this.add(this.lib.placeModular(name, x, z, opts));
  }

  private addGround(): void {
    this.groundGeo = new THREE.BoxGeometry(120, 0.12, 60);
    this.groundMat = new THREE.MeshStandardMaterial({
      color: '#0a1018',
      roughness: 0.96,
      metalness: 0.04,
    });
    const ground = new THREE.Mesh(this.groundGeo, this.groundMat);
    ground.position.set(30, -0.22, 0);
    ground.receiveShadow = true;
    ground.castShadow = false;
    this.root.add(ground);
  }

  private addFloors(): void {
    for (const region of LEVEL.walkable) {
      const x0 = Math.floor(region.minX / CELL) * CELL;
      const x1 = Math.ceil(region.maxX / CELL) * CELL;
      const z0 = Math.floor(region.minZ / CELL) * CELL;
      const z1 = Math.ceil(region.maxZ / CELL) * CELL;

      for (let x = x0; x < x1; x += CELL) {
        for (let z = z0; z < z1; z += CELL) {
          const cx = x + CELL / 2;
          const cz = z + CELL / 2;
          if (cx < region.minX || cx > region.maxX || cz < region.minZ || cz > region.maxZ) continue;

          const ix = Math.floor(x / CELL);
          const iz = Math.floor(z / CELL);
          const edge =
            cx < region.minX + CELL * 0.75 ||
            cx > region.maxX - CELL * 0.75 ||
            cz < region.minZ + CELL * 0.75 ||
            cz > region.maxZ - CELL * 0.75;

          let piece: ModularPiece = 'FloorTile_Basic';
          if (edge) piece = 'FloorTile_Side';
          else if ((ix + iz) % 4 === 0) piece = 'FloorTile_Basic2';
          else if ((ix * 3 + iz * 5) % 11 === 0) piece = 'FloorTile_Empty';

          let ry = 0;
          if (edge) {
            if (cz > region.maxZ - CELL) ry = Math.PI;
            else if (cz < region.minZ + CELL) ry = 0;
            else if (cx < region.minX + CELL) ry = Math.PI / 2;
            else if (cx > region.maxX - CELL) ry = -Math.PI / 2;
          } else {
            ry = ((ix + iz) % 2) * (Math.PI / 2);
          }

          this.mod(piece, cx, cz, { ry });
        }
      }
    }
  }

  private wallRun(
    a: number,
    b: number,
    fixed: number,
    horizontal: boolean,
    style: 'solid' | 'window' | 'door' = 'solid',
  ): void {
    const min = Math.min(a, b);
    const max = Math.max(a, b);
    for (let t = min; t < max - 0.1; t += CELL * 2) {
      const mid = t + CELL;
      if (mid > max) break;
      let piece: ModularPiece = 'Wall_1';
      if (style === 'window') {
        piece = Math.floor(t / CELL) % 3 === 0 ? 'ThreeWindows_Wall_SideA' : 'Window_Wall_SideA';
      } else if (style === 'door') {
        const center = (min + max) / 2;
        piece = Math.abs(mid - center) < CELL * 1.1 ? 'DoorDouble_Wall_SideA' : 'Wall_2';
      } else {
        piece = Math.floor(t / CELL) % 4 === 0 ? 'Wall_5' : Math.floor(t / CELL) % 2 === 0 ? 'Wall_2' : 'Wall_1';
      }
      if (horizontal) {
        this.mod(piece, mid, fixed, { ry: 0, scaleY: WALL_SCALE_Y });
      } else {
        this.mod(piece, fixed, mid, { ry: Math.PI / 2, scaleY: WALL_SCALE_Y });
      }
    }
  }

  private addPerimeterWalls(): void {
    // Arrival
    this.wallRun(-8, 10, -11, true, 'solid');
    this.wallRun(-8, 10, 11, true, 'solid');
    this.wallRun(-11, 11, -8, false, 'window');

    // Approach
    this.wallRun(10, 20, -8, true, 'window');
    this.wallRun(10, 20, 8, true, 'window');

    // Atrium
    this.wallRun(20, 46, -12, true, 'window');
    this.wallRun(20, 46, 12, true, 'window');
    this.wallRun(-6, 6, 20, false, 'door');

    // Boss chamber
    this.wallRun(46, 70, -13, true, 'solid');
    this.wallRun(46, 70, 13, true, 'solid');
    this.wallRun(-13, 13, 70, false, 'window');
    this.wallRun(-5, 5, 46, false, 'door');
  }

  /** Sparse landmark set — arrival plaza. */
  private addArrival(): void {
    this.mod('Props_ContainerFull', -3, -7, { ry: 0.25, y: 0.05 });
    this.mod('Props_CrateLong', -1.5, -6, { ry: 0.5, y: 0.05 });
    this.mod('Props_Crate', 3, 7, { ry: -0.3, y: 0.05 });
    this.mod('Props_Vessel_Short', 5, -6, { y: 0.05 });
    this.mod('Column_Slim', 8, -8, {});
    this.mod('Column_Slim', 8, 8, {});
    this.mod('Props_ComputerSmall', -2, 6.5, { ry: 0.4, y: 0.05 });
    this.mod('Props_Laser', -2.5, 7.5, { y: 0.05 });
    this.mod('Details_Pipes_Medium', 7, -9, { ry: Math.PI / 2, y: 0.6 });

    const beacon = new THREE.PointLight('#3fd8c8', 1.6, 14, 2);
    beacon.position.set(-2, 2.6, 7);
    this.lights.push(beacon);
    this.root.add(beacon);
  }

  private addApproach(): void {
    this.mod('Column_1', 12, -5.5, {});
    this.mod('Column_1', 12, 5.5, {});
    this.mod('Column_2', 18, -5.5, {});
    this.mod('Column_2', 18, 5.5, {});
    this.mod('Props_Computer', 15, -5, { ry: Math.PI / 2, y: 0.05 });
    this.mod('Props_Shelf', 15, 5, { ry: -Math.PI / 2, y: 0.05 });
    this.mod('Details_Pipes_Long', 14, -6.5, { y: 0.9 });
    this.mod('Details_Vent_1', 16, 6.5, { ry: Math.PI, y: 1.1 });
    this.mod('DoorDouble_Wall_SideA', 19.6, 0, { ry: Math.PI / 2, scaleY: WALL_SCALE_Y });
    this.mod('Props_Teleporter_1', 18.5, -3, { y: 0.05 });
  }

  private addAtrium(): void {
    // Corner columns only — open floor for combat
    for (const [x, z] of [
      [22, -9.5],
      [22, 9.5],
      [33, -9.5],
      [33, 9.5],
      [43, -9.5],
      [43, 9.5],
    ] as const) {
      this.mod('Column_2', x, z, {});
    }

    // Intentional cover matching obstacles
    this.mod('Props_ContainerFull', 24, -8.5, { ry: 0.1, y: 0.05 });
    this.mod('Props_Crate', 28, 8.5, { ry: -0.35, y: 0.05 });
    this.mod('Props_CrateLong', 36, -7.5, { ry: 0.25, y: 0.05 });
    this.mod('Props_Crate', 40, 7.5, { ry: 0.55, y: 0.05 });

    // Edge stations — not mid-lane clutter
    this.mod('Props_Computer', 26, -10.5, { y: 0.05 });
    this.mod('Props_Computer', 26, 10.5, { ry: Math.PI, y: 0.05 });
    this.mod('Props_Vessel_Tall', 42, -9, { y: 0.05 });
    this.mod('Props_Pod', 42, 9, { ry: Math.PI, y: 0.05 });
    this.mod('Props_Base', 30, -10.5, { y: 0.05 });

    // Sparse overhead framing (3 pieces only)
    this.mod('RoofTile_Pipes1', 27, 0, { y: 3.15, scale: 0.95 });
    this.mod('RoofTile_Vents', 36, -4, { y: 3.15, scale: 0.95 });
    this.mod('RoofTile_Pipes1', 36, 4, { y: 3.15, scale: 0.95 });

    // Wall detail — one pipe run each side
    this.mod('Pipes', 30, -11.2, { y: 0.45 });
    this.mod('Pipes', 38, 11.2, { ry: Math.PI, y: 0.45 });
    this.mod('Details_Plate_Large', 34, -11.3, { y: 1.15 });
    this.mod('Details_Vent_2', 34, 11.3, { ry: Math.PI, y: 1.25 });

    for (const x of [26, 36]) {
      const light = new THREE.PointLight('#4ec8b8', 0.95, 16, 2);
      light.position.set(x, 3.1, 0);
      this.lights.push(light);
      this.root.add(light);
    }
  }

  private addBossChamber(): void {
    this.mod('DoorDouble_Wall_SideA', 46.1, 0, { ry: Math.PI / 2, scaleY: WALL_SCALE_Y });
    this.mod('Props_Laser', 47, -3.5, { y: 0.05 });
    this.mod('Props_Laser', 47, 3.5, { ry: Math.PI, y: 0.05 });
    this.mod('Column_3', 47.5, -7, {});
    this.mod('Column_3', 47.5, 7, {});

    for (const obs of LEVEL.obstacles) {
      if (obs.x < 46) continue;
      this.mod('Column_2', obs.x, obs.z, {});
      this.mod('Props_Base', obs.x, obs.z, { y: 0.02, scale: 1.05 });
    }

    this.mod('Props_Vessel_Tall', 52, -8, { y: 0.05 });
    this.mod('Props_Vessel_Tall', 52, 8, { ry: Math.PI, y: 0.05 });
    this.mod('Props_Teleporter_1', 60, -5, { y: 0.05 });
    this.mod('Props_Computer', 56, -11.5, { y: 0.05 });
    this.mod('Props_Computer', 56, 11.5, { ry: Math.PI, y: 0.05 });
    this.mod('Props_ContainerFull', 66, -8, { ry: 0.15, y: 0.05 });
    this.mod('Props_ContainerFull', 66, 8, { ry: -0.15, y: 0.05 });

    this.mod('RoofTile_Vents', 54, 0, { y: 3.35, scale: 1 });
    this.mod('RoofTile_Pipes1', 62, -5, { y: 3.35, scale: 1 });
    this.mod('RoofTile_Pipes1', 62, 5, { y: 3.35, scale: 1 });

    this.mod('Details_Pipes_Long', 50, -12.2, { y: 0.95 });
    this.mod('Details_Pipes_Long', 50, 12.2, { ry: Math.PI, y: 0.95 });

    const a = new THREE.PointLight('#d06050', 1.5, 18, 2);
    a.position.set(52, 3.3, 0);
    const b = new THREE.PointLight('#4080c8', 1.2, 18, 2);
    b.position.set(64, 3.3, 0);
    this.lights.push(a, b);
    this.root.add(a, b);
  }

  private addLighting(): void {
    const hemi = new THREE.HemisphereLight('#8aa0c0', '#0c1016', 0.45);
    const key = new THREE.DirectionalLight('#c8d4e8', 1.05);
    key.position.set(-12, 24, 14);
    key.castShadow = true;
    key.shadow.mapSize.set(2048, 2048);
    key.shadow.camera.left = -36;
    key.shadow.camera.right = 36;
    key.shadow.camera.top = 36;
    key.shadow.camera.bottom = -24;
    key.shadow.camera.near = 1;
    key.shadow.camera.far = 90;
    key.shadow.bias = -0.00025;
    const fill = new THREE.DirectionalLight('#4a6088', 0.28);
    fill.position.set(28, 10, -16);
    const rim = new THREE.DirectionalLight('#6080a0', 0.18);
    rim.position.set(58, 8, 10);
    this.lights.push(hemi, key, fill, rim);
    this.root.add(hemi, key, fill, rim);
  }

  dispose(): void {
    this.lib.dispose();
    for (const light of this.lights) {
      this.root.remove(light);
      (light as THREE.Light & { dispose?: () => void }).dispose?.();
    }
    this.lights.length = 0;
    this.groundGeo?.dispose();
    this.groundMat?.dispose();
    this.groundGeo = null;
    this.groundMat = null;
    this.root.clear();
  }
}

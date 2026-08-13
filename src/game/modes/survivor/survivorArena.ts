import * as THREE from 'three';
import { CELL, EnvAssetLibrary, type ModularPiece } from '../../assets/ModularKit';
import { SURVIVOR } from './survivorContent';

type Placement = {
  x: number;
  z: number;
  ry?: number;
  y?: number;
  scale?: number;
  scaleY?: number;
};

/**
 * Reactor Platform 7 — a 128 x 128 containment station assembled from unchanged kit art.
 *
 * The map is deliberately navigable: a clear central deployment pad, two crossing
 * transit spines, four recognizable operational sectors, and a perimeter service ring.
 * Imported geometry and materials remain untouched; layout and generated floor markings
 * carry the new visual hierarchy.
 */
export class SurvivorArena {
  readonly root = new THREE.Group();
  private readonly lib = new EnvAssetLibrary();
  private readonly lights: THREE.Light[] = [];
  /** Generated layout resources only; imported kit resources remain owned by EnvAssetLibrary. */
  private readonly generatedGeometries = new Set<THREE.BufferGeometry>();
  private readonly generatedMaterials = new Set<THREE.Material>();
  private ground: THREE.Mesh | null = null;
  private keyLight: THREE.DirectionalLight | null = null;
  private fillLight: THREE.DirectionalLight | null = null;
  private lightTarget: THREE.Object3D | null = null;

  async build(): Promise<THREE.Group> {
    this.root.clear();
    this.root.name = 'survivor-arena';

    const pieces: ModularPiece[] = [
      'FloorTile_Basic',
      'FloorTile_Basic2',
      'FloorTile_Empty',
      'FloorTile_Side',
      'FloorTile_Corner',
      'Wall_1',
      'Wall_2',
      'Wall_5',
      'Wall_Empty',
      'Window_Wall_SideA',
      'ThreeWindows_Wall_SideA',
      'LongWindow_Wall_SideA',
      'DoorDouble_Wall_SideA',
      'Column_1',
      'Column_2',
      'Column_3',
      'Column_Slim',
      'Props_Computer',
      'Props_ComputerSmall',
      'Props_Crate',
      'Props_CrateLong',
      'Props_ContainerFull',
      'Props_Vessel_Tall',
      'Props_Vessel_Short',
      'Props_Pod',
      'Props_Shelf',
      'Props_Shelf_Tall',
      'Props_Laser',
      'Props_Teleporter_1',
      'Props_Teleporter_2',
      'Props_Base',
      'Props_Capsule',
      'Details_Pipes_Long',
      'Details_Pipes_Medium',
      'Details_Pipes_Small',
      'Details_Vent_1',
      'Details_Vent_2',
      'Details_Plate_Large',
      'Details_Plate_Long',
      'Pipes',
    ];
    await this.lib.preloadAll(pieces, [], []);

    this.addFloor();
    this.addWayfinding();
    this.addPerimeter();
    this.addContainmentHub();
    this.addTransitSpine();
    this.addOperationalSectors();
    this.addLighting();
    return this.root;
  }

  private mod(name: ModularPiece, x: number, z: number, opts?: Omit<Placement, 'x' | 'z'>): void {
    const o = this.lib.placeModular(name, x, z, opts);
    if (o) this.root.add(o);
  }

  private generatedMesh<T extends THREE.Mesh>(mesh: T): T {
    this.generatedGeometries.add(mesh.geometry);
    const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
    for (const material of materials) this.generatedMaterials.add(material);
    return mesh;
  }

  private generatedGeometry<T extends THREE.BufferGeometry>(geometry: T): T {
    this.generatedGeometries.add(geometry);
    return geometry;
  }

  private addFloor(): void {
    const h = SURVIVOR.arenaHalf;
    const geo = new THREE.BoxGeometry(h * 2 + 4, 0.12, h * 2 + 4);
    const mat = new THREE.MeshStandardMaterial({ color: '#080d15', roughness: 0.95, metalness: 0.05 });
    this.ground = this.generatedMesh(new THREE.Mesh(geo, mat));
    this.ground.position.set(0, -0.2, 0);
    this.ground.receiveShadow = true;
    this.root.add(this.ground);

    const batches = new Map<ModularPiece, Placement[]>([
      ['FloorTile_Basic', []],
      ['FloorTile_Basic2', []],
      ['FloorTile_Empty', []],
      ['FloorTile_Side', []],
      ['FloorTile_Corner', []],
    ]);
    for (let x = -h; x < h; x += CELL) {
      for (let z = -h; z < h; z += CELL) {
        const cx = x + CELL / 2;
        const cz = z + CELL / 2;
        const edgeX = Math.abs(cx) > h - CELL;
        const edgeZ = Math.abs(cz) > h - CELL;
        const ix = Math.round(cx / CELL);
        const iz = Math.round(cz / CELL);
        let piece: ModularPiece;
        let ry = 0;

        if (edgeX && edgeZ) {
          piece = 'FloorTile_Corner';
          if (cx > 0 && cz > 0) ry = Math.PI;
          else if (cx > 0 && cz < 0) ry = -Math.PI / 2;
          else if (cx < 0 && cz > 0) ry = Math.PI / 2;
        } else if (edgeX || edgeZ) {
          piece = 'FloorTile_Side';
          if (cz > h - CELL) ry = Math.PI;
          else if (cz < -h + CELL) ry = 0;
          else if (cx < -h + CELL) ry = Math.PI / 2;
          else ry = -Math.PI / 2;
        } else {
          const onSpine = Math.abs(cx) < 3 || Math.abs(cz) < 3;
          const onSectorGrid = Math.abs(Math.abs(cx) - 32) < 1.1 || Math.abs(Math.abs(cz) - 32) < 1.1;
          const accentBeat = (Math.abs(ix) + Math.abs(iz)) % 6 === 0;
          if ((onSpine || onSectorGrid) && accentBeat) piece = 'FloorTile_Basic2';
          else if (onSpine || onSectorGrid || (ix * 17 + iz * 31) % 11 === 0) piece = 'FloorTile_Basic';
          else piece = 'FloorTile_Empty';
          ry = onSpine && Math.abs(cx) < 3 ? 0 : Math.PI / 2;
        }
        batches.get(piece)!.push({ x: cx, z: cz, ry });
      }
    }

    for (const [piece, placements] of batches) {
      const batch = this.lib.placeModularInstances(piece, placements);
      if (batch) this.root.add(batch);
    }
  }

  private floorMaterial(color: string, emissive = '#000000', intensity = 0): THREE.MeshStandardMaterial {
    const material = new THREE.MeshStandardMaterial({
      color,
      emissive,
      emissiveIntensity: intensity,
      roughness: 0.68,
      metalness: 0.18,
      depthWrite: true,
    });
    this.generatedMaterials.add(material);
    return material;
  }

  /**
   * Painted station markings sit visibly above the imported floor but never own the
   * depth buffer. Transparent gameplay signals render later and can therefore cross a
   * pad or guide stripe, while the opaque actor depth still occludes both correctly.
   */
  private wayfindingMaterial(color: string, emissive = '#000000', intensity = 0): THREE.MeshStandardMaterial {
    const material = this.floorMaterial(color, emissive, intensity);
    material.depthWrite = false;
    return material;
  }

  private addWayfinding(): void {
    const laneMat = this.wayfindingMaterial('#182435', '#0a1624', 0.45);
    /*
     * These are painted wayfinding layers, not gameplay surfaces. They ride above the
     * imported tiles so they remain crisp, but their materials never write depth; the
     * authoritative 0.035+ hazard/telegraph plane therefore remains visible across them.
     */
    const laneX = this.generatedMesh(new THREE.Mesh(new THREE.BoxGeometry(112, 0.025, 3.6), laneMat));
    laneX.position.y = 0.075;
    laneX.receiveShadow = true;
    const laneZ = this.generatedMesh(new THREE.Mesh(new THREE.BoxGeometry(3.6, 0.026, 112), laneMat));
    laneZ.position.y = 0.076;
    laneZ.receiveShadow = true;
    this.root.add(laneX, laneZ);

    const pad = this.generatedMesh(new THREE.Mesh(
      new THREE.CircleGeometry(8.4, 64),
      this.wayfindingMaterial('#111c2a', '#0a1825', 0.38),
    ));
    pad.rotation.x = -Math.PI / 2;
    pad.position.y = 0.092;
    pad.receiveShadow = true;
    const padEdge = this.generatedMesh(new THREE.Mesh(
      new THREE.RingGeometry(7.75, 8.35, 64),
      this.wayfindingMaterial('#405268', '#4da9b4', 1.05),
    ));
    padEdge.rotation.x = -Math.PI / 2;
    padEdge.position.y = 0.105;
    const innerEdge = this.generatedMesh(new THREE.Mesh(
      new THREE.RingGeometry(3.8, 4.05, 48),
      this.wayfindingMaterial('#6a5124', '#d69b32', 0.85),
    ));
    innerEdge.rotation.x = -Math.PI / 2;
    innerEdge.position.y = 0.108;
    this.root.add(pad, padEdge, innerEdge);

    const guideGeo = this.generatedGeometry(new THREE.BoxGeometry(0.12, 0.025, 2.7));
    const cyanGuides: THREE.Matrix4[] = [];
    const amberGuides: THREE.Matrix4[] = [];
    const matrix = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    const s = new THREE.Vector3(1, 1, 1);
    for (let d = -52; d <= 52; d += 8) {
      if (Math.abs(d) < 9) continue;
      for (const side of [-1, 1]) {
        q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), 0);
        matrix.compose(new THREE.Vector3(side * 1.55, 0.11, d), q, s);
        (d < 0 ? cyanGuides : amberGuides).push(matrix.clone());
        q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), Math.PI / 2);
        matrix.compose(new THREE.Vector3(d, 0.112, side * 1.55), q, s);
        (d < 0 ? amberGuides : cyanGuides).push(matrix.clone());
      }
    }
    const makeGuides = (matrices: THREE.Matrix4[], color: string): THREE.InstancedMesh => {
      const mesh = this.generatedMesh(new THREE.InstancedMesh(
        guideGeo,
        this.wayfindingMaterial(color, color, 1.5),
        matrices.length,
      ));
      matrices.forEach((m, i) => mesh.setMatrixAt(i, m));
      mesh.instanceMatrix.needsUpdate = true;
      return mesh;
    };
    this.root.add(makeGuides(cyanGuides, '#4ba8b8'), makeGuides(amberGuides, '#bd842d'));
  }

  private wallRun(
    a: number,
    b: number,
    fixed: number,
    horizontal: boolean,
    style: 'solid' | 'window' | 'door',
  ): void {
    const min = Math.min(a, b);
    const max = Math.max(a, b);
    for (let t = min; t < max - 0.1; t += CELL * 2) {
      const mid = t + CELL;
      if (mid > max) break;
      let piece: ModularPiece = 'Wall_1';
      if (style === 'window') {
        piece = Math.floor(t / (CELL * 2)) % 3 === 0 ? 'LongWindow_Wall_SideA' : 'ThreeWindows_Wall_SideA';
      } else if (style === 'door') {
        const center = (min + max) / 2;
        piece = Math.abs(mid - center) < CELL * 1.2 ? 'DoorDouble_Wall_SideA' : 'Wall_2';
      } else {
        piece = Math.floor(t / CELL) % 3 === 0 ? 'Wall_5' : 'Wall_Empty';
      }
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

    for (const [x, z] of [
      [-h + 1.5, -h + 1.5],
      [-h + 1.5, h - 1.5],
      [h - 1.5, -h + 1.5],
      [h - 1.5, h - 1.5],
    ] as const) {
      this.mod('Column_2', x, z);
    }

    // Four readable airlocks, each supported by consoles and hazard posts.
    const gates = [
      { x: 0, z: -h + 2, ry: 0 },
      { x: 0, z: h - 2, ry: Math.PI },
      { x: -h + 2, z: 0, ry: Math.PI / 2 },
      { x: h - 2, z: 0, ry: -Math.PI / 2 },
    ];
    for (const gate of gates) {
      this.mod('Props_ComputerSmall', gate.x + Math.cos(gate.ry) * 2.2, gate.z + Math.sin(gate.ry) * 2.2, { ry: gate.ry });
      this.mod('Props_Laser', gate.x - Math.cos(gate.ry) * 2.2, gate.z - Math.sin(gate.ry) * 2.2, { ry: gate.ry });
    }
  }

  private addContainmentHub(): void {
    // The deployment pad at (0,0) stays clear; the reactor is an adjacent landmark.
    const z = -14;
    this.mod('Props_Base', 0, z, { scale: 1.45 });
    this.mod('Column_3', 0, z, { y: 0.1 });
    this.mod('Props_Teleporter_1', 0, z, { y: 0.05, scale: 1.12 });
    this.mod('Props_Laser', 2.1, z, { ry: Math.PI / 2 });
    this.mod('Props_Laser', -2.1, z, { ry: -Math.PI / 2 });
    this.mod('Props_ComputerSmall', 0, z + 3.2, { ry: Math.PI });

    const core = new THREE.PointLight('#3fd8c8', 2.2, 18, 2);
    core.position.set(0, 3.2, z);
    this.lights.push(core);
    this.root.add(core);
  }

  private addTransitSpine(): void {
    for (const d of [-48, -24, 24, 48]) {
      this.mod('Column_Slim', d, 4.2, { scale: 0.8 });
      this.mod('Details_Plate_Long', d, -4.1, { ry: Math.PI / 2, y: 0.05 });
      this.mod('Column_Slim', 4.2, d, { scale: 0.8 });
      this.mod('Details_Plate_Long', -4.1, d, { y: 0.05 });
    }
  }

  private addOperationalSectors(): void {
    this.addCargoSector(-34, -34);
    this.addResearchSector(34, -34);
    this.addMaintenanceSector(-34, 34);
    this.addQuarantineSector(34, 34);
  }

  private addSectorBeacon(x: number, z: number, color: string): void {
    const ring = this.generatedMesh(new THREE.Mesh(
      new THREE.RingGeometry(5.5, 5.85, 48),
      this.wayfindingMaterial(color, color, 1.1),
    ));
    ring.rotation.x = -Math.PI / 2;
    ring.position.set(x, 0.105, z);
    this.root.add(ring);
    const light = new THREE.PointLight(color, 0.7, 15, 2);
    light.position.set(x, 2.8, z);
    this.lights.push(light);
    this.root.add(light);
  }

  private addCargoSector(x: number, z: number): void {
    this.addSectorBeacon(x, z, '#d18b32');
    this.mod('Props_ContainerFull', x - 3.1, z - 2.7, { ry: 0.3 });
    this.mod('Props_CrateLong', x + 2.4, z - 2.2, { ry: Math.PI / 2 });
    this.mod('Props_Crate', x + 3, z + 1.8, { ry: -0.35 });
    this.mod('Props_Shelf_Tall', x - 3.2, z + 2.1, { ry: Math.PI / 2 });
    this.mod('Props_ComputerSmall', x, z + 4.4, { ry: Math.PI });
  }

  private addResearchSector(x: number, z: number): void {
    this.addSectorBeacon(x, z, '#43b6c8');
    this.mod('Props_Vessel_Tall', x - 2.8, z - 2.4);
    this.mod('Props_Vessel_Short', x + 2.7, z - 2.1);
    this.mod('Props_Pod', x + 2.8, z + 2.3, { ry: Math.PI / 2 });
    this.mod('Props_Computer', x - 2.8, z + 2.5, { ry: Math.PI / 2 });
    this.mod('Details_Vent_2', x, z + 4.5, { y: 0.08 });
  }

  private addMaintenanceSector(x: number, z: number): void {
    this.addSectorBeacon(x, z, '#78a4bd');
    this.mod('Pipes', x - 3.4, z, { y: 0.35 });
    this.mod('Details_Pipes_Long', x + 2.6, z - 2.7, { y: 0.7 });
    this.mod('Details_Pipes_Medium', x + 2.8, z + 2.4, { ry: Math.PI / 2, y: 0.5 });
    this.mod('Details_Pipes_Small', x - 2.4, z + 2.8, { y: 0.45 });
    this.mod('Props_ComputerSmall', x, z - 4.4);
  }

  private addQuarantineSector(x: number, z: number): void {
    this.addSectorBeacon(x, z, '#aa6cc4');
    this.mod('Props_Teleporter_2', x, z, { scale: 1.05 });
    this.mod('Props_Capsule', x - 3.2, z - 2.6, { ry: 0.3 });
    this.mod('Props_Pod', x + 3.1, z - 2.4, { ry: -0.4 });
    this.mod('Props_Shelf', x - 3.2, z + 2.7, { ry: Math.PI / 2 });
    this.mod('Props_Computer', x + 3, z + 2.6, { ry: -Math.PI / 2 });
  }

  private addLighting(): void {
    const hemi = new THREE.HemisphereLight('#8aa0c0', '#0c1016', 0.5);
    const key = new THREE.DirectionalLight('#c8d4e8', 1.1);
    key.position.set(-10, 22, 12);
    key.castShadow = true;
    key.shadow.mapSize.set(2048, 2048);
    key.shadow.bias = -0.00018;
    key.shadow.normalBias = 0.02;
    const sh = Math.max(28, SURVIVOR.cameraHalf * 2.35);
    key.shadow.camera.left = -sh;
    key.shadow.camera.right = sh;
    key.shadow.camera.top = sh;
    key.shadow.camera.bottom = -sh;
    key.shadow.camera.near = 0.5;
    key.shadow.camera.far = 70;
    const fill = new THREE.DirectionalLight('#4a6088', 0.3);
    fill.position.set(12, 8, -10);
    const target = new THREE.Object3D();
    target.name = 'arena-light-target';
    key.target = target;
    fill.target = target;
    this.keyLight = key;
    this.fillLight = fill;
    this.lightTarget = target;
    this.lights.push(hemi, key, fill);
    this.root.add(hemi, key, fill, target);
  }

  /** Keep the shadow footprint centred on the same world region as the follow camera. */
  followLighting(x: number, z: number): void {
    if (!this.keyLight || !this.fillLight || !this.lightTarget) return;
    this.lightTarget.position.set(x, 0.6, z);
    this.keyLight.position.set(x - 10, 22, z + 12);
    this.fillLight.position.set(x + 12, 8, z - 10);
  }

  static createFixedCamera(aspect: number): THREE.OrthographicCamera {
    const { viewW, viewH } = SurvivorArena.viewSize(aspect);
    const cam = new THREE.OrthographicCamera(-viewW / 2, viewW / 2, viewH / 2, -viewH / 2, 0.1, 180);
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
    for (const light of this.lights) {
      this.root.remove(light);
      (light as THREE.Light & { dispose?: () => void }).dispose?.();
    }
    this.lights.length = 0;
    this.keyLight = null;
    this.fillLight = null;
    this.lightTarget = null;
    this.root.clear();
    for (const geometry of this.generatedGeometries) geometry.dispose();
    for (const material of this.generatedMaterials) material.dispose();
    this.generatedGeometries.clear();
    this.generatedMaterials.clear();
    this.ground = null;
    this.lib.dispose();
  }
}

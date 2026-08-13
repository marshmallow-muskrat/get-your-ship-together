import * as THREE from 'three';
import { OBJLoader } from 'three/addons/loaders/OBJLoader.js';
import { MTLLoader } from 'three/addons/loaders/MTLLoader.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import * as SkeletonUtils from 'three/addons/utils/SkeletonUtils.js';

/** Modular Sci-Fi kit lives on a 2-unit grid. */
export const CELL = 2;

const MODULAR_ROOT = '/runtime/env/modular/';
const SPACE_ROOT = '/runtime/env/space/';
const ITEMS_ROOT = '/runtime/env/items/';
const VEHICLES_ROOT = '/runtime/env/vehicles/';

/** Material palette matching the kit’s named materials (from base.ts experiments). */
/** Darker facility palette — original kit whites were blowing out the scene. */
const PALETTE: Record<string, { color: string; emissive?: string; intensity?: number; metalness?: number }> = {
  Main: { color: '#3a4558' },
  DarkGrey: { color: '#2a3340' },
  Accent: { color: '#c48628', metalness: 0.22 },
  DarkAccent: { color: '#7a4a14' },
  Black: { color: '#12151c' },
  Light: { color: '#d8c89a', emissive: '#a88840', intensity: 0.85 },
  Glass: { color: '#2a9a90', emissive: '#146860', intensity: 0.7 },
  Pipes: { color: '#4a5464' },
};

export type ModularPiece =
  | 'FloorTile_Basic'
  | 'FloorTile_Basic2'
  | 'FloorTile_Empty'
  | 'FloorTile_Side'
  | 'FloorTile_Corner'
  | 'Wall_1'
  | 'Wall_2'
  | 'Wall_5'
  | 'Wall_Empty'
  | 'Window_Wall_SideA'
  | 'Window_Wall_SideB'
  | 'LongWindow_Wall_SideA'
  | 'ThreeWindows_Wall_SideA'
  | 'SmallWindows_Wall_SideA'
  | 'DoorSingle_Wall_SideA'
  | 'DoorDouble_Wall_SideA'
  | 'Door_Single'
  | 'Door_Double'
  | 'Column_1'
  | 'Column_2'
  | 'Column_3'
  | 'Column_Slim'
  | 'Props_Crate'
  | 'Props_CrateLong'
  | 'Props_ContainerFull'
  | 'Props_Computer'
  | 'Props_ComputerSmall'
  | 'Props_Vessel_Tall'
  | 'Props_Vessel_Short'
  | 'Props_Vessel'
  | 'Props_Pod'
  | 'Props_Shelf'
  | 'Props_Shelf_Tall'
  | 'Props_Teleporter_1'
  | 'Props_Teleporter_2'
  | 'Props_Laser'
  | 'Props_Base'
  | 'Props_Capsule'
  | 'Props_Chest'
  | 'Props_Statue'
  | 'Details_Pipes_Long'
  | 'Details_Pipes_Medium'
  | 'Details_Pipes_Small'
  | 'Details_Vent_1'
  | 'Details_Vent_2'
  | 'Details_Vent_3'
  | 'Details_Plate_Large'
  | 'Details_Plate_Long'
  | 'Details_Cylinder_Long'
  | 'Details_Output'
  | 'RoofTile_Pipes1'
  | 'RoofTile_Vents'
  | 'RoofTile_Plate'
  | 'RoofTile_OrangeVent'
  | 'Pipes'
  | 'Staircase';

export type SpacePiece =
  | 'Rock_1'
  | 'Rock_2'
  | 'Rock_3'
  | 'Rock_4'
  | 'Rock_Large_1'
  | 'Rock_Large_2'
  | 'Rock_Large_3'
  | 'Base_Large'
  | 'Building_L'
  | 'GeodesicDome'
  | 'MetalSupport'
  | 'Connector'
  | 'Ramp'
  | 'Stairs'
  | 'House_Open'
  | 'House_Single'
  | 'House_Long'
  | 'House_Cylinder'
  | 'House_OpenBack'
  | 'House_Single_Support'
  | 'SolarPanel_Ground'
  | 'SolarPanel_Structure'
  | 'SolarPanel_Roof'
  | 'Roof_Radar'
  | 'Roof_Antenna'
  | 'Roof_VentL'
  | 'Roof_Opening'
  | 'Planet_1'
  | 'Planet_3'
  | 'Planet_6'
  | 'Planet_7'
  | 'Tree_Spikes_1'
  | 'Tree_Blob_1'
  | 'Tree_Light_1'
  | 'Plant_1'
  | 'Bush_1'
  | 'Grass_1';

const WALL_PIECES = new Set<string>([
  'Wall_1',
  'Wall_2',
  'Wall_5',
  'Wall_Empty',
  'Window_Wall_SideA',
  'Window_Wall_SideB',
  'LongWindow_Wall_SideA',
  'ThreeWindows_Wall_SideA',
  'SmallWindows_Wall_SideA',
  'DoorSingle_Wall_SideA',
  'DoorDouble_Wall_SideA',
]);

/** Vertical squash so walls don’t hide combat under the isometric camera. */
export const WALL_SCALE_Y = 0.55;
export const COLUMN_SCALE_Y = 0.72;

function applyModularPalette(object: THREE.Object3D): void {
  object.traverse((child) => {
    if (!(child instanceof THREE.Mesh)) return;
    child.castShadow = true;
    child.receiveShadow = true;
    const sources = Array.isArray(child.material) ? child.material : [child.material];
    const mapped = sources.map((source) => {
      const name = (source as THREE.Material).name || 'Main';
      const entry = PALETTE[name] ?? PALETTE.Main;
      return new THREE.MeshStandardMaterial({
        color: entry.color,
        emissive: entry.emissive ?? '#000000',
        emissiveIntensity: entry.intensity ?? 0,
        metalness: entry.metalness ?? 0.08,
        roughness: 0.58,
      });
    });
    child.material = Array.isArray(child.material) ? mapped : mapped[0];
  });
}

function enhanceGltf(object: THREE.Object3D): void {
  object.traverse((child) => {
    if (!(child instanceof THREE.Mesh)) return;
    child.castShadow = true;
    child.receiveShadow = true;
    const sources = Array.isArray(child.material) ? child.material : [child.material];
    const mapped = sources.map((source) => {
      const material = source.clone();
      if (material instanceof THREE.MeshStandardMaterial || material instanceof THREE.MeshPhysicalMaterial) {
        material.metalness = Math.min(0.55, Math.max(material.metalness, 0.08));
        material.roughness = Math.max(0.42, material.roughness);
        material.envMapIntensity = 0.7;
      }
      material.needsUpdate = true;
      return material;
    });
    child.material = Array.isArray(child.material) ? mapped : mapped[0];
  });
}

/**
 * Cached template library for modular OBJ pieces + space-kit GLTFs.
 * Only loads pieces that are requested.
 */
export class EnvAssetLibrary {
  private readonly modular = new Map<string, THREE.Object3D>();
  private readonly gltf = new Map<string, THREE.Object3D>();
  private readonly gltfLoader = new GLTFLoader();
  private disposed = false;

  async loadModular(name: ModularPiece): Promise<THREE.Object3D | null> {
    if (this.modular.has(name)) return this.modular.get(name)!;
    try {
      const object = await new Promise<THREE.Object3D>((resolve, reject) => {
        const mtlLoader = new MTLLoader();
        mtlLoader.setPath(MODULAR_ROOT);
        mtlLoader.load(
          `${name}.mtl`,
          (materials) => {
            materials.preload();
            const objLoader = new OBJLoader();
            objLoader.setMaterials(materials);
            objLoader.setPath(MODULAR_ROOT);
            objLoader.load(`${name}.obj`, resolve, undefined, reject);
          },
          undefined,
          reject,
        );
      });
      applyModularPalette(object);
      this.modular.set(name, object);
      return object;
    } catch (err) {
      console.warn(`Modular piece failed: ${name}`, err);
      return null;
    }
  }

  async loadGltf(url: string, targetHeight?: number): Promise<THREE.Object3D | null> {
    if (this.gltf.has(url)) return this.gltf.get(url)!;
    try {
      const gltf = await this.gltfLoader.loadAsync(url);
      const root = gltf.scene;
      if (targetHeight != null) {
        root.updateMatrixWorld(true);
        const box = new THREE.Box3().setFromObject(root);
        const size = box.getSize(new THREE.Vector3());
        if (size.y > 1e-4) root.scale.multiplyScalar(targetHeight / size.y);
        root.updateMatrixWorld(true);
        const fitted = new THREE.Box3().setFromObject(root);
        root.position.y -= fitted.min.y;
      }
      enhanceGltf(root);
      this.gltf.set(url, root);
      return root;
    } catch (err) {
      console.warn(`GLTF env failed: ${url}`, err);
      return null;
    }
  }

  spaceUrl(name: SpacePiece): string {
    return `${SPACE_ROOT}${name}.gltf`;
  }

  itemUrl(name: string): string {
    return `${ITEMS_ROOT}${name}.gltf`;
  }

  vehicleUrl(name: string): string {
    return `${VEHICLES_ROOT}${name}.gltf`;
  }

  /** Clone a modular template into the scene graph. */
  placeModular(
    name: ModularPiece,
    x: number,
    z: number,
    opts?: { ry?: number; y?: number; scaleY?: number; scale?: number },
  ): THREE.Object3D | null {
    const template = this.modular.get(name);
    if (!template) return null;
    const clone = template.clone(true);
    clone.position.set(x, opts?.y ?? 0, z);
    clone.rotation.y = opts?.ry ?? 0;
    if (opts?.scale != null) clone.scale.multiplyScalar(opts.scale);
    if (opts?.scaleY != null) clone.scale.y *= opts.scaleY;
    else if (WALL_PIECES.has(name)) clone.scale.y = WALL_SCALE_Y;
    else if (name.startsWith('Column_')) clone.scale.y = COLUMN_SCALE_Y;
    return clone;
  }

  /**
   * Place a large static batch without cloning one scene graph per tile.
   *
   * Reactor Platform 7 uses the kit's source geometry and materials exactly as loaded,
   * but a 128 x 128 floor contains 4,096 cells. Cloning every mesh would turn one
   * unchanged art asset into thousands of draw calls. One InstancedMesh per source-mesh
   * layer preserves the asset while reducing the batch to the template's draw-call count.
   */
  placeModularInstances(
    name: ModularPiece,
    placements: ReadonlyArray<{
      x: number;
      z: number;
      ry?: number;
      y?: number;
      scale?: number;
      scaleY?: number;
    }>,
  ): THREE.Group | null {
    const template = this.modular.get(name);
    if (!template || placements.length === 0) return null;

    template.updateMatrixWorld(true);
    const root = new THREE.Group();
    root.name = `${name}-instances`;
    const placementMatrix = new THREE.Matrix4();
    const worldMatrix = new THREE.Matrix4();
    const position = new THREE.Vector3();
    const rotation = new THREE.Quaternion();
    const scale = new THREE.Vector3();
    const axis = new THREE.Vector3(0, 1, 0);

    template.traverse((child) => {
      if (!(child instanceof THREE.Mesh)) return;
      const batch = new THREE.InstancedMesh(child.geometry, child.material, placements.length);
      batch.name = `${name}:${child.name || 'mesh'}`;
      batch.castShadow = child.castShadow;
      batch.receiveShadow = child.receiveShadow;
      for (let i = 0; i < placements.length; i += 1) {
        const p = placements[i]!;
        const uniform = p.scale ?? 1;
        const defaultScaleY = WALL_PIECES.has(name)
          ? WALL_SCALE_Y
          : name.startsWith('Column_')
            ? COLUMN_SCALE_Y
            : 1;
        position.set(p.x, p.y ?? 0, p.z);
        rotation.setFromAxisAngle(axis, p.ry ?? 0);
        scale.set(uniform, uniform * (p.scaleY ?? defaultScaleY), uniform);
        placementMatrix.compose(position, rotation, scale);
        worldMatrix.multiplyMatrices(placementMatrix, child.matrixWorld);
        batch.setMatrixAt(i, worldMatrix);
      }
      batch.instanceMatrix.needsUpdate = true;
      batch.computeBoundingBox();
      batch.computeBoundingSphere();
      root.add(batch);
    });
    return root;
  }

  placeGltf(
    url: string,
    x: number,
    z: number,
    opts?: { ry?: number; y?: number; scale?: number },
  ): THREE.Object3D | null {
    const template = this.gltf.get(url);
    if (!template) return null;
    // Prefer SkeletonUtils when skinned; env props are static so clone is fine.
    const clone = SkeletonUtils.clone(template);
    clone.position.set(x, opts?.y ?? 0, z);
    clone.rotation.y = opts?.ry ?? 0;
    if (opts?.scale != null) clone.scale.multiplyScalar(opts.scale);
    return clone;
  }

  async preloadAll(modular: ModularPiece[], space: SpacePiece[], extras: string[] = []): Promise<void> {
    await Promise.all([
      ...modular.map((n) => this.loadModular(n)),
      ...space.map((n) => this.loadGltf(this.spaceUrl(n))),
      ...extras.map((url) => this.loadGltf(url)),
    ]);
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    const disposeObj = (obj: THREE.Object3D) => {
      obj.traverse((child) => {
        if (child instanceof THREE.Mesh) {
          child.geometry?.dispose();
          const mats = Array.isArray(child.material) ? child.material : [child.material];
          for (const m of mats) m?.dispose?.();
        }
      });
    };
    for (const o of this.modular.values()) disposeObj(o);
    for (const o of this.gltf.values()) disposeObj(o);
    this.modular.clear();
    this.gltf.clear();
  }
}

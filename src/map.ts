import * as THREE from 'three';
import * as SkeletonUtils from 'three/addons/utils/SkeletonUtils.js';

export interface MapHero {
  name: string;
  species: string;
  accent: string;
  astronaut: string;
  mech: string;
  ship: string;
}

export interface ActOneWorldOptions {
  scene: THREE.Scene;
  renderer: THREE.WebGLRenderer;
  models: Map<string, THREE.Object3D | null>;
  hero: MapHero;
  onProgress: (progress: number) => void;
  onComplete: () => void;
}

export interface MapRuntime {
  camera: THREE.OrthographicCamera;
  update: (delta: number, elapsed: number) => void;
  resize: (width: number, height: number) => void;
  dispose: () => void;
}

interface Collider {
  x: number;
  z: number;
  radius: number;
}

interface Floater {
  object: THREE.Object3D;
  baseY: number;
  phase: number;
}

interface SpawnOptions {
  x: number;
  z: number;
  target: number;
  mode?: 'height' | 'width' | 'max';
  rotationY?: number;
  pitch?: number;
  roll?: number;
  yOffset?: number;
  colliderRadius?: number;
  tint?: THREE.Color;
}

const SPACE_KIT_ROOT = '/assets/space-packs/Ultimate Space Kit - March 2023';
const kitUrl = (relativePath: string): string => encodeURI(`${SPACE_KIT_ROOT}/${relativePath}`);

const ACT_ONE_ASSETS = {
  baseLarge: kitUrl('Environment/GLTF/Base_Large.gltf'),
  geodesicDome: kitUrl('Environment/GLTF/GeodesicDome.gltf'),
  houseCylinder: kitUrl('Environment/GLTF/House_Cylinder.gltf'),
  houseLong: kitUrl('Environment/GLTF/House_Long.gltf'),
  houseSingle: kitUrl('Environment/GLTF/House_Single.gltf'),
  solarPanel: kitUrl('Environment/GLTF/SolarPanel_Ground.gltf'),
  rockLarge1: kitUrl('Environment/GLTF/Rock_Large_1.gltf'),
  rockLarge2: kitUrl('Environment/GLTF/Rock_Large_2.gltf'),
  rockLarge3: kitUrl('Environment/GLTF/Rock_Large_3.gltf'),
  rock1: kitUrl('Environment/GLTF/Rock_1.gltf'),
  rock2: kitUrl('Environment/GLTF/Rock_2.gltf'),
  rock3: kitUrl('Environment/GLTF/Rock_3.gltf'),
  rock4: kitUrl('Environment/GLTF/Rock_4.gltf'),
  plant1: kitUrl('Environment/GLTF/Plant_1.gltf'),
  plant2: kitUrl('Environment/GLTF/Plant_2.gltf'),
  plant3: kitUrl('Environment/GLTF/Plant_3.gltf'),
  bush1: kitUrl('Environment/GLTF/Bush_1.gltf'),
  bush2: kitUrl('Environment/GLTF/Bush_2.gltf'),
  bush3: kitUrl('Environment/GLTF/Bush_3.gltf'),
  grass1: kitUrl('Environment/GLTF/Grass_1.gltf'),
  grass2: kitUrl('Environment/GLTF/Grass_2.gltf'),
  grass3: kitUrl('Environment/GLTF/Grass_3.gltf'),
  treeBlob1: kitUrl('Environment/GLTF/Tree_Blob_1.gltf'),
  treeBlob2: kitUrl('Environment/GLTF/Tree_Blob_2.gltf'),
  treeBlob3: kitUrl('Environment/GLTF/Tree_Blob_3.gltf'),
  treeLava1: kitUrl('Environment/GLTF/Tree_Lava_1.gltf'),
  treeLava2: kitUrl('Environment/GLTF/Tree_Lava_2.gltf'),
  treeLava3: kitUrl('Environment/GLTF/Tree_Lava_3.gltf'),
  treeLight1: kitUrl('Environment/GLTF/Tree_Light_1.gltf'),
  treeLight2: kitUrl('Environment/GLTF/Tree_Light_2.gltf'),
  treeSpikes1: kitUrl('Environment/GLTF/Tree_Spikes_1.gltf'),
  treeSpikes2: kitUrl('Environment/GLTF/Tree_Spikes_2.gltf'),
  treeSpiral1: kitUrl('Environment/GLTF/Tree_Spiral_1.gltf'),
  treeSpiral2: kitUrl('Environment/GLTF/Tree_Spiral_2.gltf'),
  treeSpiral3: kitUrl('Environment/GLTF/Tree_Spiral_3.gltf'),
  treeSwirl1: kitUrl('Environment/GLTF/Tree_Swirl_1.gltf'),
  treeSwirl2: kitUrl('Environment/GLTF/Tree_Swirl_2.gltf'),
  // Modular tech clutter — the concept art's ground is littered with crates,
  // supports and pipework around every structure.
  connector: kitUrl('Environment/GLTF/Connector.gltf'),
  metalSupport: kitUrl('Environment/GLTF/MetalSupport.gltf'),
  stairs: kitUrl('Environment/GLTF/Stairs.gltf'),
  ramp: kitUrl('Environment/GLTF/Ramp.gltf'),
  roofVentL: kitUrl('Environment/GLTF/Roof_VentL.gltf'),
  roofVentR: kitUrl('Environment/GLTF/Roof_VentR.gltf'),
  roofRadar: kitUrl('Environment/GLTF/Roof_Radar.gltf'),
  roofAntenna: kitUrl('Environment/GLTF/Roof_Antenna.gltf'),
  buildingL: kitUrl('Environment/GLTF/Building_L.gltf'),
  houseOpen: kitUrl('Environment/GLTF/House_Open.gltf'),
  solarPanelStructure: kitUrl('Environment/GLTF/SolarPanel_Structure.gltf'),
  // Ambient wildlife. The little critters are most of the concept art's charm.
  critterTiny: kitUrl('Characters/GLTF/Enemy_ExtraSmall.gltf'),
  critterSmall: kitUrl('Characters/GLTF/Enemy_Small.gltf'),
  critterLarge: kitUrl('Characters/GLTF/Enemy_Large.gltf'),
  critterFlying: kitUrl('Characters/GLTF/Enemy_Flying.gltf'),
  rover: kitUrl('Vehicles/GLTF/Rover_1.gltf'),
  rover2: kitUrl('Vehicles/GLTF/Rover_2.gltf'),
  roverRound: kitUrl('Vehicles/GLTF/Rover_Round.gltf'),
} as const;

export const MAP_ASSET_URLS = Object.values(ACT_ONE_ASSETS);

// Key-light direction, held constant relative to the travelling shadow frustum.
const SUN_OFFSET = new THREE.Vector3(-56, 52, 40);

const START_Z = 12;
const EXTRACTION_Z = -158;
const PLAYER_RADIUS = 0.82;

function seededRandom(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state += 0x6d2b79f5;
    let value = state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}

function pathCenter(z: number): number {
  return Math.sin((z + 22) * 0.045) * 2.8 + Math.sin((z - 15) * 0.095) * 1.1;
}

function combatHalfWidth(z: number): number {
  const arenaCenters = [-35, -84, -132];
  const arenaWidening = arenaCenters.reduce((total, center) => {
    const distance = (z - center) / 13;
    return total + Math.exp(-(distance * distance)) * 3.25;
  }, 0);
  const gateRhythm = Math.max(0, Math.cos((z + 8) * 0.09)) * 0.7;
  return 9.5 + arenaWidening - gateRhythm;
}

// A broad, slowly varying rock field. Quantising it produces the concept art's
// chunky flat-topped mesas instead of soft rolling dunes.
function mesaField(x: number, z: number): number {
  // A broad octave carries the large plateau masses; the finer ones break their
  // outlines up so the terraces don't read as regular blobs.
  return (
    Math.sin(x * 0.032 - z * 0.026) * 1.15 +
    Math.sin(x * 0.085 + z * 0.031) * Math.cos(z * 0.062 - x * 0.048) +
    Math.sin(x * 0.041 - z * 0.077) * 0.6 +
    Math.cos(x * 0.13 + z * 0.11) * 0.25
  );
}

const TERRACE_STEP = 1.45;

function terrainHeight(x: number, z: number): number {
  const trailDistance = Math.abs(x - pathCenter(z));
  const halfWidth = combatHalfWidth(z);
  // The playable lane stays flat; mesas only rise once we're clear of it.
  const mesaMask = THREE.MathUtils.smoothstep(trailDistance, halfWidth - 2, halfWidth + 4);
  const terraces = Math.max(0, Math.floor((mesaField(x, z) + 0.35) * 2.2));
  const sand = Math.sin(x * 0.19 + z * 0.035) * 0.16 + Math.cos(z * 0.073 - x * 0.04) * 0.12;
  return sand * (1 - mesaMask * 0.6) + terraces * TERRACE_STEP * mesaMask;
}

// How steep the ground is at a point, used to keep props off cliff faces.
function terrainSlope(x: number, z: number): number {
  const h = terrainHeight(x, z);
  return Math.max(
    Math.abs(terrainHeight(x + 0.6, z) - h),
    Math.abs(terrainHeight(x - 0.6, z) - h),
    Math.abs(terrainHeight(x, z + 0.6) - h),
    Math.abs(terrainHeight(x, z - 0.6) - h),
  );
}

function prepareMeshes(root: THREE.Object3D, tint?: THREE.Color): void {
  root.traverse((child) => {
    if (!(child instanceof THREE.Mesh)) return;
    child.castShadow = true;
    child.receiveShadow = true;
    const sourceMaterials = Array.isArray(child.material) ? child.material : [child.material];
    const materials = sourceMaterials.map((source) => {
      const material = source.clone();
      if (material instanceof THREE.MeshStandardMaterial || material instanceof THREE.MeshPhysicalMaterial) {
        material.roughness = Math.max(material.roughness, 0.78);
        material.metalness = Math.min(material.metalness, 0.15);
        material.envMapIntensity = 0.22;
        material.flatShading = true;
        // Push toward the concept art's poster-like saturation.
        const hsl = { h: 0, s: 0, l: 0 };
        material.color.getHSL(hsl);
        material.color.setHSL(hsl.h, Math.min(1, hsl.s * 1.28), hsl.l);
        if (tint) material.color.lerp(tint, 0.32);
      }
      material.needsUpdate = true;
      return material;
    });
    child.material = Array.isArray(child.material) ? materials : materials[0];
  });
}

function normalizedClone(source: THREE.Object3D, target: number, mode: 'height' | 'width' | 'max', tint?: THREE.Color): THREE.Group {
  const clone = SkeletonUtils.clone(source);
  prepareMeshes(clone, tint);
  clone.updateMatrixWorld(true);
  const bounds = new THREE.Box3().setFromObject(clone);
  const size = bounds.getSize(new THREE.Vector3());
  const dimension = mode === 'height' ? size.y : mode === 'width' ? Math.max(size.x, size.z) : Math.max(size.x, size.y, size.z);
  if (dimension > 0) clone.scale.multiplyScalar(target / dimension);

  clone.updateMatrixWorld(true);
  const fittedBounds = new THREE.Box3().setFromObject(clone);
  const center = fittedBounds.getCenter(new THREE.Vector3());
  clone.position.set(-center.x, -fittedBounds.min.y, -center.z);

  const wrapper = new THREE.Group();
  wrapper.add(clone);
  return wrapper;
}

function addSky(scene: THREE.Scene): void {
  const sky = new THREE.Mesh(
    new THREE.SphereGeometry(360, 32, 18),
    new THREE.ShaderMaterial({
      side: THREE.BackSide,
      depthWrite: false,
      uniforms: {
        topColor: { value: new THREE.Color('#0d0824') },
        middleColor: { value: new THREE.Color('#1c1442') },
        horizonColor: { value: new THREE.Color('#3a2358') },
      },
      vertexShader: `
        varying vec3 vPosition;
        void main() {
          vPosition = position;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
      `,
      fragmentShader: `
        uniform vec3 topColor;
        uniform vec3 middleColor;
        uniform vec3 horizonColor;
        varying vec3 vPosition;
        void main() {
          float h = normalize(vPosition).y * 0.5 + 0.5;
          vec3 lower = mix(horizonColor, middleColor, smoothstep(0.38, 0.58, h));
          vec3 color = mix(lower, topColor, smoothstep(0.56, 0.9, h));
          gl_FragColor = vec4(color, 1.0);
        }
      `,
    }),
  );
  scene.add(sky);

  const sun = new THREE.Mesh(
    new THREE.SphereGeometry(12, 24, 16),
    new THREE.MeshBasicMaterial({ color: '#ffb056', fog: false }),
  );
  sun.position.set(-94, 62, -250);
  scene.add(sun);

  const planet = new THREE.Mesh(
    new THREE.IcosahedronGeometry(22, 2),
    new THREE.MeshStandardMaterial({ color: '#5a3e83', roughness: 1, emissive: '#1b1135', emissiveIntensity: 0.45, fog: false }),
  );
  planet.position.set(106, 94, -275);
  scene.add(planet);

  const ring = new THREE.Mesh(
    new THREE.TorusGeometry(31, 1.1, 6, 64),
    new THREE.MeshBasicMaterial({ color: '#b86ca8', transparent: true, opacity: 0.52, fog: false }),
  );
  ring.position.copy(planet.position);
  ring.rotation.set(1.22, 0.15, -0.28);
  scene.add(ring);
}

function addLighting(scene: THREE.Scene, renderer: THREE.WebGLRenderer): THREE.DirectionalLight {
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  // Filmic tone mapping desaturates and lifts exactly the saturated mid-tones
  // this art style is built from. The poster look needs the raw linear values.
  renderer.toneMapping = THREE.NoToneMapping;
  renderer.toneMappingExposure = 1;

  // Ambient is deliberately low. The previous mix was ambient-dominated, which
  // flattened every form; the concept art has a clear key-to-shadow separation.
  scene.add(new THREE.HemisphereLight('#ffd9ad', '#3a2350', 0.58));
  scene.add(new THREE.AmbientLight('#ffe1bd', 0.2));

  const sunLight = new THREE.DirectionalLight('#fff3d6', 1.45);
  sunLight.position.set(-28, 60, 24);
  sunLight.castShadow = true;
  // A tight shadow frustum that travels with the player keeps texel density
  // high; covering the whole 300-unit map at once would be far too coarse.
  sunLight.shadow.mapSize.set(2048, 2048);
  sunLight.shadow.camera.left = -58;
  sunLight.shadow.camera.right = 58;
  sunLight.shadow.camera.top = 58;
  sunLight.shadow.camera.bottom = -58;
  sunLight.shadow.camera.near = 1;
  sunLight.shadow.camera.far = 190;
  sunLight.shadow.bias = -0.0012;
  sunLight.shadow.normalBias = 0.05;
  scene.add(sunLight);
  scene.add(sunLight.target);

  const coolFill = new THREE.DirectionalLight('#7fb6ff', 0.5);
  coolFill.position.set(28, 22, -48);
  scene.add(coolFill);

  return sunLight;
}

function createTerrain(root: THREE.Group): void {
  const width = 130;
  const length = 380;
  const centerZ = -70;
  const geometry = new THREE.PlaneGeometry(width, length, 150, 240);
  geometry.rotateX(-Math.PI / 2);
  const positions = geometry.attributes.position;
  const colors: number[] = [];
  const sandColor = new THREE.Color('#c26a30');
  const rockColor = new THREE.Color('#a94d25');
  const faceColor = new THREE.Color('#5f2620');

  for (let index = 0; index < positions.count; index += 1) {
    const x = positions.getX(index);
    const localZ = positions.getZ(index);
    const worldZ = localZ + centerZ;
    const height = terrainHeight(x, worldZ);
    positions.setY(index, height);

    // Height picks the sand-to-rock ramp; slope darkens the near-vertical mesa
    // faces. That single slope term is what reads as bevelled, chunky rock.
    const lift = THREE.MathUtils.clamp(height / (TERRACE_STEP * 3), 0, 1);
    const steepness = THREE.MathUtils.clamp(terrainSlope(x, worldZ) / TERRACE_STEP, 0, 1);
    const color = sandColor.clone().lerp(rockColor, lift).lerp(faceColor, steepness * 0.85);

    // Noise keyed to world position, not vertex index — an index-based term
    // lines up with the grid rows and reads as horizontal banding.
    const grain = Math.sin(x * 1.7 + worldZ * 0.9) * Math.cos(x * 0.6 - worldZ * 1.3);
    color.offsetHSL(grain * 0.006, 0, grain * 0.018);
    colors.push(color.r, color.g, color.b);
  }

  geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  geometry.computeVertexNormals();
  const terrain = new THREE.Mesh(
    geometry,
    new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.98, metalness: 0, flatShading: true }),
  );
  terrain.position.z = centerZ;
  terrain.receiveShadow = true;
  root.add(terrain);

  const rows = 112;
  const pathPositions: number[] = [];
  const pathIndices: number[] = [];
  for (let row = 0; row <= rows; row += 1) {
    const t = row / rows;
    const z = THREE.MathUtils.lerp(42, EXTRACTION_Z - 20, t);
    const center = pathCenter(z);
    const widthAtRow = 2.55 + Math.sin(t * Math.PI * 5) * 0.32;
    const left = center - widthAtRow;
    const right = center + widthAtRow;
    pathPositions.push(left, terrainHeight(left, z) + 0.07, z, right, terrainHeight(right, z) + 0.07, z);
    if (row < rows) {
      const base = row * 2;
      pathIndices.push(base, base + 1, base + 2, base + 1, base + 3, base + 2);
    }
  }
  const pathGeometry = new THREE.BufferGeometry();
  pathGeometry.setAttribute('position', new THREE.Float32BufferAttribute(pathPositions, 3));
  pathGeometry.setIndex(pathIndices);
  pathGeometry.computeVertexNormals();
  const path = new THREE.Mesh(
    pathGeometry,
    new THREE.MeshStandardMaterial({
      color: '#d1904f',
      roughness: 1,
      flatShading: true,
      polygonOffset: true,
      polygonOffsetFactor: -1,
      polygonOffsetUnits: -1,
    }),
  );
  path.receiveShadow = true;
  root.add(path);

  // A dotted expedition trail keeps the long route readable without turning it
  // into a paved road, echoing the playful footprint motif in the concept art.
  const footprintCount = 62;
  const footprint = new THREE.InstancedMesh(
    new THREE.CircleGeometry(0.24, 8),
    new THREE.MeshStandardMaterial({ color: '#7e3e31', roughness: 1, polygonOffset: true, polygonOffsetFactor: -2 }),
    footprintCount,
  );
  const matrix = new THREE.Matrix4();
  const position = new THREE.Vector3();
  const quaternion = new THREE.Quaternion();
  const scale = new THREE.Vector3();
  for (let index = 0; index < footprintCount; index += 1) {
    const z = THREE.MathUtils.lerp(START_Z - 4, EXTRACTION_Z + 9, index / (footprintCount - 1));
    const x = pathCenter(z) + (index % 2 === 0 ? -0.42 : 0.42);
    position.set(x, terrainHeight(x, z) + 0.105, z);
    quaternion.setFromEuler(new THREE.Euler(-Math.PI / 2, 0, index % 2 === 0 ? -0.22 : 0.22));
    scale.set(0.72, 1.35, 1);
    matrix.compose(position, quaternion, scale);
    footprint.setMatrixAt(index, matrix);
  }
  footprint.instanceMatrix.needsUpdate = true;
  root.add(footprint);
}

function addDust(root: THREE.Group): void {
  const random = seededRandom(29);
  const positions: number[] = [];
  for (let index = 0; index < 520; index += 1) {
    const z = THREE.MathUtils.lerp(95, -220, random());
    const x = THREE.MathUtils.lerp(-44, 44, random());
    positions.push(x, terrainHeight(x, z) + 0.7 + random() * 8, z);
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  const particles = new THREE.Points(
    geometry,
    new THREE.PointsMaterial({ color: '#ffc47b', size: 0.16, transparent: true, opacity: 0.12, depthWrite: false }),
  );
  particles.name = 'dust';
  root.add(particles);
}

function createBeacon(root: THREE.Group, x: number, z: number, color = '#6ff4ff', height = 1.7): THREE.Group {
  const group = new THREE.Group();
  const base = new THREE.Mesh(
    new THREE.CylinderGeometry(0.42, 0.58, 0.42, 8),
    new THREE.MeshStandardMaterial({ color: '#6a6875', roughness: 0.48, metalness: 0.34 }),
  );
  base.position.y = 0.21;
  base.castShadow = true;
  group.add(base);
  const stem = new THREE.Mesh(
    new THREE.CylinderGeometry(0.09, 0.12, height, 8),
    new THREE.MeshStandardMaterial({ color: '#d5d3c9', roughness: 0.45, metalness: 0.28 }),
  );
  stem.position.y = 0.42 + height / 2;
  stem.castShadow = true;
  group.add(stem);
  const glow = new THREE.Mesh(
    new THREE.SphereGeometry(0.24, 12, 8),
    new THREE.MeshStandardMaterial({ color, emissive: color, emissiveIntensity: 4.2, roughness: 0.24 }),
  );
  glow.position.y = height + 0.48;
  group.add(glow);
  group.position.set(x, terrainHeight(x, z), z);
  root.add(group);
  return group;
}

function createExtractionPad(root: THREE.Group, x: number, z: number): { beaconLight: THREE.PointLight; ring: THREE.Mesh } {
  const y = terrainHeight(x, z) + 0.22;
  const pad = new THREE.Mesh(
    new THREE.CylinderGeometry(4.4, 4.8, 0.5, 14),
    new THREE.MeshStandardMaterial({ color: '#777985', roughness: 0.5, metalness: 0.38 }),
  );
  pad.position.set(x, y, z);
  pad.castShadow = true;
  pad.receiveShadow = true;
  root.add(pad);

  const ring = new THREE.Mesh(
    new THREE.TorusGeometry(3.35, 0.16, 8, 48),
    new THREE.MeshStandardMaterial({ color: '#7df5ff', emissive: '#21d8ff', emissiveIntensity: 3.8, roughness: 0.24 }),
  );
  ring.rotation.x = Math.PI / 2;
  ring.position.set(x, y + 0.38, z);
  root.add(ring);

  for (let index = 0; index < 4; index += 1) {
    const angle = (index / 4) * Math.PI * 2 + Math.PI / 4;
    createBeacon(root, x + Math.cos(angle) * 4, z + Math.sin(angle) * 4, '#7df5ff', 1.5);
  }

  const beaconLight = new THREE.PointLight('#59eaff', 0, 26, 2);
  beaconLight.position.set(x, y + 5.5, z);
  root.add(beaconLight);
  return { beaconLight, ring };
}

export function createActOneWorld(options: ActOneWorldOptions): MapRuntime {
  const { scene, renderer, models, hero, onProgress, onComplete } = options;
  const root = new THREE.Group();
  root.rotation.y = Math.PI / 4;
  const camera = new THREE.OrthographicCamera(-14, 14, 26, -26, 0.1, 500);
  const colliders: Collider[] = [];
  const random = seededRandom(1307);
  const keys = new Set<string>();
  let complete = false;
  let revealProgress = 0;

  scene.clear();
  scene.background = new THREE.Color('#150e33');
  // Only enough haze to soften the far edge. The old density washed a warm
  // film over the whole frame and killed the ground's colour separation.
  scene.fog = new THREE.FogExp2('#241a4a', 0.0009);
  scene.add(root);
  addSky(scene);
  const sunLight = addLighting(scene, renderer);
  createTerrain(root);
  addDust(root);

  const spawn = (url: string, spawnOptions: SpawnOptions): THREE.Group | null => {
    const source = models.get(url);
    if (!source) return null;
    const object = normalizedClone(source, spawnOptions.target, spawnOptions.mode ?? 'height', spawnOptions.tint);
    object.rotation.set(spawnOptions.pitch ?? 0, spawnOptions.rotationY ?? 0, spawnOptions.roll ?? 0);
    object.position.set(
      spawnOptions.x,
      terrainHeight(spawnOptions.x, spawnOptions.z) + (spawnOptions.yOffset ?? 0),
      spawnOptions.z,
    );
    // Ground cover and critters are too small for their shadows to read, and
    // they make up most of the object count — skip them in the shadow pass.
    if (spawnOptions.target < 0.9) {
      object.traverse((child) => {
        if (child instanceof THREE.Mesh) child.castShadow = false;
      });
    }
    root.add(object);
    if (spawnOptions.colliderRadius) {
      colliders.push({ x: spawnOptions.x, z: spawnOptions.z, radius: spawnOptions.colliderRadius });
    }
    return object;
  };

  const pick = <T,>(list: readonly T[]): T => list[Math.floor(random() * list.length)];

  // Props must sit on flat ground. Dropping one on a mesa face leaves it
  // half-buried or floating off the cliff edge.
  const findFlatSpot = (
    seedX: number,
    seedZ: number,
    spread: number,
  ): { x: number; z: number } | null => {
    for (let attempt = 0; attempt < 6; attempt += 1) {
      const x = seedX + (random() - 0.5) * spread;
      const z = seedZ + (random() - 0.5) * spread;
      if (Math.abs(x - pathCenter(z)) < 1.5) continue;
      if (terrainSlope(x, z) < 0.35) return { x, z };
    }
    return null;
  };

  // Rock boulders in the terrain's own colour family. The kit's stock greys and
  // mauves read as a different painting from the orange ground.
  const rockTint = new THREE.Color('#b05a2e');
  const rockUrls = [
    ACT_ONE_ASSETS.rock1,
    ACT_ONE_ASSETS.rock2,
    ACT_ONE_ASSETS.rock3,
    ACT_ONE_ASSETS.rock4,
    ACT_ONE_ASSETS.rockLarge1,
    ACT_ONE_ASSETS.rockLarge2,
    ACT_ONE_ASSETS.rockLarge3,
  ];
  for (let index = 0; index < 340; index += 1) {
    const seedZ = 95 - random() * 300;
    const side = random() < 0.5 ? -1 : 1;
    const seedX = pathCenter(seedZ) + side * (2.0 + random() * (combatHalfWidth(seedZ) + 14));
    const spot = findFlatSpot(seedX, seedZ, 3);
    if (!spot) continue;
    spawn(pick(rockUrls), {
      x: spot.x,
      z: spot.z,
      target: 0.45 + random() * 1.5,
      mode: 'height',
      rotationY: random() * Math.PI * 2,
      tint: rockTint,
    });
  }

  // Flora clusters: a seed point with a tight knot of plants around it, so
  // density reads as designed rather than as even scatter. The concept art's
  // colour comes almost entirely from these, so the roster is deliberately wide.
  const floraUrls = [
    ACT_ONE_ASSETS.plant1,
    ACT_ONE_ASSETS.plant2,
    ACT_ONE_ASSETS.plant3,
    ACT_ONE_ASSETS.bush1,
    ACT_ONE_ASSETS.bush2,
    ACT_ONE_ASSETS.bush3,
    ACT_ONE_ASSETS.treeBlob1,
    ACT_ONE_ASSETS.treeBlob2,
    ACT_ONE_ASSETS.treeBlob3,
    ACT_ONE_ASSETS.treeLava1,
    ACT_ONE_ASSETS.treeLava2,
    ACT_ONE_ASSETS.treeLava3,
    ACT_ONE_ASSETS.treeLight1,
    ACT_ONE_ASSETS.treeLight2,
    ACT_ONE_ASSETS.treeSpikes1,
    ACT_ONE_ASSETS.treeSpikes2,
    ACT_ONE_ASSETS.treeSpiral1,
    ACT_ONE_ASSETS.treeSpiral2,
    ACT_ONE_ASSETS.treeSpiral3,
    ACT_ONE_ASSETS.treeSwirl1,
    ACT_ONE_ASSETS.treeSwirl2,
  ];
  const grassUrls = [ACT_ONE_ASSETS.grass1, ACT_ONE_ASSETS.grass2, ACT_ONE_ASSETS.grass3];
  for (let cluster = 0; cluster < 270; cluster += 1) {
    const seedZ = 95 - random() * 300;
    const side = random() < 0.5 ? -1 : 1;
    const seedX = pathCenter(seedZ) + side * (2.0 + random() * (combatHalfWidth(seedZ) + 13));
    // One species per cluster — mixed-species knots read as noise.
    const species = pick(floraUrls);
    const members = 3 + Math.floor(random() * 5);
    for (let member = 0; member < members; member += 1) {
      const spot = findFlatSpot(seedX, seedZ, 4.5);
      if (!spot) continue;
      spawn(species, {
        x: spot.x,
        z: spot.z,
        target: 0.7 + random() * 1.5,
        mode: 'height',
        rotationY: random() * Math.PI * 2,
      });
    }
    // Scrubby ground cover fringing each cluster.
    for (let blade = 0; blade < 3; blade += 1) {
      const spot = findFlatSpot(seedX, seedZ, 7);
      if (!spot) continue;
      spawn(pick(grassUrls), {
        x: spot.x,
        z: spot.z,
        target: 0.35 + random() * 0.5,
        mode: 'height',
        rotationY: random() * Math.PI * 2,
      });
    }
  }

  // Scattered wildlife. Small, colourful and everywhere — this is most of what
  // makes the concept art feel inhabited rather than like empty terrain.
  const critterUrls = [
    ACT_ONE_ASSETS.critterTiny,
    ACT_ONE_ASSETS.critterSmall,
    ACT_ONE_ASSETS.critterLarge,
    ACT_ONE_ASSETS.critterFlying,
  ];
  const critters: Floater[] = [];
  for (let index = 0; index < 115; index += 1) {
    const seedZ = 90 - random() * 295;
    const side = random() < 0.5 ? -1 : 1;
    const seedX = pathCenter(seedZ) + side * (3.5 + random() * (combatHalfWidth(seedZ) + 10));
    const spot = findFlatSpot(seedX, seedZ, 5);
    if (!spot) continue;
    const flying = random() < 0.25;
    const critter = spawn(flying ? ACT_ONE_ASSETS.critterFlying : pick(critterUrls), {
      x: spot.x,
      z: spot.z,
      target: 0.45 + random() * 0.55,
      mode: 'height',
      rotationY: random() * Math.PI * 2,
      yOffset: flying ? 1.1 + random() * 1.4 : 0,
    });
    if (critter) critters.push({ object: critter, baseY: critter.position.y, phase: random() * Math.PI * 2 });
  }

  // Human-made debris: crates, supports and pipework, clustered around the
  // structures rather than sprinkled evenly across the map.
  const debrisUrls = [
    ACT_ONE_ASSETS.connector,
    ACT_ONE_ASSETS.metalSupport,
    ACT_ONE_ASSETS.stairs,
    ACT_ONE_ASSETS.ramp,
    ACT_ONE_ASSETS.roofVentL,
    ACT_ONE_ASSETS.roofVentR,
    ACT_ONE_ASSETS.roofRadar,
    ACT_ONE_ASSETS.roofAntenna,
  ];
  const debrisAnchors = [7, -44, -53, -59, -70, -108, -120, EXTRACTION_Z];
  for (const anchorZ of debrisAnchors) {
    for (let index = 0; index < 16; index += 1) {
      const seedX = pathCenter(anchorZ) + (random() - 0.5) * 30;
      const spot = findFlatSpot(seedX, anchorZ + (random() - 0.5) * 22, 6);
      if (!spot) continue;
      spawn(pick(debrisUrls), {
        x: spot.x,
        z: spot.z,
        target: 0.4 + random() * 1.1,
        mode: 'max',
        rotationY: random() * Math.PI * 2,
      });
    }
  }

  // Crash crater and the selected hero's matching ship establish the story immediately.
  const craterX = pathCenter(7) - 8.5;
  const crater = new THREE.Mesh(
    new THREE.TorusGeometry(4.2, 0.8, 5, 24),
    new THREE.MeshStandardMaterial({ color: '#512737', roughness: 1, flatShading: true }),
  );
  crater.rotation.x = Math.PI / 2;
  crater.scale.y = 0.74;
  crater.position.set(craterX, terrainHeight(craterX, 7) + 0.25, 7);
  crater.castShadow = true;
  crater.receiveShadow = true;
  root.add(crater);
  spawn(hero.ship, { x: craterX, z: 7, target: 5.2, mode: 'width', rotationY: -0.62, pitch: 0.28, roll: -0.2, yOffset: 0.25, colliderRadius: 2.7 });
  createBeacon(root, craterX - 3.4, 10.5, hero.accent, 1.4);
  createBeacon(root, craterX + 3.6, 4, '#6ff4ff', 1.0);

  // Habitat ruins and the first large visual landmark.
  const habitatZ = -44;
  spawn(ACT_ONE_ASSETS.geodesicDome, { x: pathCenter(habitatZ) + 12.5, z: habitatZ, target: 6, mode: 'width', rotationY: -0.35, colliderRadius: 3 });
  spawn(ACT_ONE_ASSETS.houseCylinder, { x: pathCenter(-53) - 12.5, z: -53, target: 4.8, mode: 'width', rotationY: 0.5, colliderRadius: 2.5 });
  spawn(ACT_ONE_ASSETS.solarPanel, { x: pathCenter(-59) + 11, z: -59, target: 3.2, mode: 'width', rotationY: -0.15, colliderRadius: 1.6 });
  spawn(ACT_ONE_ASSETS.rover, { x: pathCenter(-70) - 9.5, z: -70, target: 2.3, mode: 'width', rotationY: 0.75, colliderRadius: 1.2 });
  createBeacon(root, pathCenter(-42) - 5.4, -42, '#76ecff', 2.1);
  createBeacon(root, pathCenter(-67) + 5.7, -67, '#ffba63', 1.8);

  // Abandoned frontier station creates the final change in visual rhythm before extraction.
  spawn(ACT_ONE_ASSETS.houseLong, { x: pathCenter(-108) - 13, z: -108, target: 7, mode: 'width', rotationY: 0.1, colliderRadius: 3.2 });
  spawn(ACT_ONE_ASSETS.houseSingle, { x: pathCenter(-120) + 12, z: -120, target: 4.6, mode: 'width', rotationY: -0.52, colliderRadius: 2.3 });
  createBeacon(root, pathCenter(-102) + 5.8, -102, '#ffb759', 2.2);
  createBeacon(root, pathCenter(-126) - 5.8, -126, '#75f3ff', 2.2);

  const extractionX = pathCenter(EXTRACTION_Z);
  const { beaconLight, ring: extractionRing } = createExtractionPad(root, extractionX, EXTRACTION_Z);
  spawn(ACT_ONE_ASSETS.baseLarge, { x: extractionX + 15, z: EXTRACTION_Z - 3, target: 8, mode: 'width', rotationY: -0.2, colliderRadius: 3.7 });

  const mech = spawn(hero.mech, {
    x: extractionX + 7.2,
    z: EXTRACTION_Z + 0.8,
    target: 6.2,
    mode: 'height',
    rotationY: Math.PI,
    yOffset: 0.75,
  });
  if (mech) {
    mech.visible = false;
    mech.scale.setScalar(0.01);
  }
  const mechLight = new THREE.PointLight(hero.accent, 0, 22, 2);
  mechLight.position.set(extractionX + 7.2, terrainHeight(extractionX + 7.2, EXTRACTION_Z) + 4.2, EXTRACTION_Z + 2);
  root.add(mechLight);

  const astronautSource = models.get(hero.astronaut);
  if (!astronautSource) throw new Error(`Missing astronaut model for ${hero.name}.`);
  // Deliberately oversized against the environment scale so the hero stays
  // readable at the pulled-back diorama camera.
  const player = normalizedClone(astronautSource, 2.8, 'height');
  player.position.set(pathCenter(START_Z), terrainHeight(pathCenter(START_Z), START_Z) + 0.06, START_Z);
  player.rotation.y = Math.PI;
  root.add(player);

  const playerShadow = new THREE.Mesh(
    new THREE.CircleGeometry(1.05, 24),
    new THREE.MeshBasicMaterial({ color: '#1b1020', transparent: true, opacity: 0.33, depthWrite: false }),
  );
  playerShadow.rotation.x = -Math.PI / 2;
  root.add(playerShadow);

  const cameraOffset = new THREE.Vector3(32, 27, 32);
  const lookTarget = new THREE.Vector3();
  const initialTargetLocal = new THREE.Vector3(pathCenter(player.position.z), player.position.y + 0.5, player.position.z - 12);
  root.localToWorld(initialTargetLocal);
  lookTarget.copy(initialTargetLocal);
  camera.position.copy(lookTarget).add(cameraOffset);
  camera.lookAt(lookTarget);

  const onKeyDown = (event: KeyboardEvent): void => {
    if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'KeyW', 'KeyA', 'KeyS', 'KeyD'].includes(event.code)) {
      event.preventDefault();
      keys.add(event.code);
    }
  };
  const onKeyUp = (event: KeyboardEvent): void => {
    keys.delete(event.code);
  };
  const onBlur = (): void => keys.clear();
  window.addEventListener('keydown', onKeyDown);
  window.addEventListener('keyup', onKeyUp);
  window.addEventListener('blur', onBlur);

  const movement = new THREE.Vector3();
  const desiredCamera = new THREE.Vector3();
  const desiredLook = new THREE.Vector3();
  const targetLocal = new THREE.Vector3();

  const resolveColliders = (position: THREE.Vector3): void => {
    for (const collider of colliders) {
      const dx = position.x - collider.x;
      const dz = position.z - collider.z;
      const minimum = PLAYER_RADIUS + collider.radius;
      const distanceSquared = dx * dx + dz * dz;
      if (distanceSquared > 0 && distanceSquared < minimum * minimum) {
        const distance = Math.sqrt(distanceSquared);
        position.x = collider.x + (dx / distance) * minimum;
        position.z = collider.z + (dz / distance) * minimum;
      }
    }
  };

  return {
    camera,
    resize(width, height) {
      const visibleHeight = 78;
      const aspect = width / Math.max(1, height);
      camera.left = -(visibleHeight * aspect) / 2;
      camera.right = (visibleHeight * aspect) / 2;
      camera.top = visibleHeight / 2;
      camera.bottom = -visibleHeight / 2;
      camera.updateProjectionMatrix();
    },
    update(delta, elapsed) {
      if (!complete) {
        const horizontal = Number(keys.has('KeyD') || keys.has('ArrowRight')) - Number(keys.has('KeyA') || keys.has('ArrowLeft'));
        const vertical = Number(keys.has('KeyS') || keys.has('ArrowDown')) - Number(keys.has('KeyW') || keys.has('ArrowUp'));
        movement.set(horizontal, 0, vertical);
        if (movement.lengthSq() > 0) {
          movement.normalize();
          const nextPosition = player.position.clone().addScaledVector(movement, delta * 8.6);
          nextPosition.z = THREE.MathUtils.clamp(nextPosition.z, EXTRACTION_Z + 0.8, START_Z + 2);
          const center = pathCenter(nextPosition.z);
          const halfWidth = combatHalfWidth(nextPosition.z);
          nextPosition.x = THREE.MathUtils.clamp(nextPosition.x, center - halfWidth, center + halfWidth);
          resolveColliders(nextPosition);
          player.position.x = nextPosition.x;
          player.position.z = nextPosition.z;
          // Turn along the shortest arc. A plain lerp toward atan2 spins the
          // long way round whenever the target crosses the -PI/+PI seam, which
          // is exactly what forward-left does from the starting heading of PI.
          const desiredHeading = Math.atan2(movement.x, movement.z);
          let headingDelta = desiredHeading - player.rotation.y;
          headingDelta = Math.atan2(Math.sin(headingDelta), Math.cos(headingDelta));
          player.rotation.y += headingDelta * 0.2;
        }
      }

      const groundY = terrainHeight(player.position.x, player.position.z);
      player.position.y = groundY + 0.06 + Math.sin(elapsed * 5.2) * (movement.lengthSq() > 0 ? 0.055 : 0.018);
      playerShadow.position.set(player.position.x, groundY + 0.045, player.position.z);

      targetLocal.set(pathCenter(player.position.z), player.position.y + 0.5, player.position.z - 12);
      desiredLook.copy(targetLocal);
      root.localToWorld(desiredLook);
      desiredCamera.copy(desiredLook).add(cameraOffset);
      camera.position.lerp(desiredCamera, 1 - Math.pow(0.001, delta));
      lookTarget.lerp(desiredLook, 1 - Math.pow(0.002, delta));
      camera.lookAt(lookTarget);

      const progress = THREE.MathUtils.clamp((START_Z - player.position.z) / (START_Z - EXTRACTION_Z), 0, 1);
      onProgress(progress);

      // The shadow frustum is tight, so it has to travel with the player.
      sunLight.target.position.copy(desiredLook);
      sunLight.position.copy(desiredLook).add(SUN_OFFSET);
      sunLight.target.updateMatrixWorld();

      // Idle life: fliers bob, ground critters shuffle in place.
      for (let index = 0; index < critters.length; index += 1) {
        const critter = critters[index];
        critter.object.position.y = critter.baseY + Math.sin(elapsed * 1.6 + critter.phase) * 0.12;
        critter.object.rotation.y += Math.sin(elapsed * 0.5 + critter.phase) * delta * 0.35;
      }

      const dust = root.getObjectByName('dust');
      if (dust) dust.rotation.y = elapsed * 0.008;
      extractionRing.rotation.z = elapsed * 0.18;
      extractionRing.material instanceof THREE.MeshStandardMaterial && (extractionRing.material.emissiveIntensity = 3.5 + Math.sin(elapsed * 2.2) * 0.7);

      if (!complete && progress > 0.975) {
        complete = true;
        keys.clear();
        if (mech) mech.visible = true;
        onComplete();
      }

      if (complete) {
        revealProgress = THREE.MathUtils.lerp(revealProgress, 1, 1 - Math.pow(0.0005, delta));
        if (mech) {
          mech.scale.setScalar(Math.max(0.01, revealProgress));
          mech.rotation.y += delta * 0.18;
        }
        beaconLight.intensity = 8 + Math.sin(elapsed * 3) * 1.5;
        mechLight.intensity = revealProgress * 8;
      } else {
        beaconLight.intensity = 3.5 + Math.sin(elapsed * 2.5) * 0.8;
      }
    },
    dispose() {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
      window.removeEventListener('blur', onBlur);
      keys.clear();
    },
  };
}

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
  plant1: kitUrl('Environment/GLTF/Plant_1.gltf'),
  plant2: kitUrl('Environment/GLTF/Plant_2.gltf'),
  plant3: kitUrl('Environment/GLTF/Plant_3.gltf'),
  bush1: kitUrl('Environment/GLTF/Bush_1.gltf'),
  bush2: kitUrl('Environment/GLTF/Bush_2.gltf'),
  treeLava1: kitUrl('Environment/GLTF/Tree_Lava_1.gltf'),
  treeLava2: kitUrl('Environment/GLTF/Tree_Lava_2.gltf'),
  treeSpiral1: kitUrl('Environment/GLTF/Tree_Spiral_1.gltf'),
  treeSwirl1: kitUrl('Environment/GLTF/Tree_Swirl_1.gltf'),
  rover: kitUrl('Vehicles/GLTF/Rover_1.gltf'),
} as const;

export const MAP_ASSET_URLS = Object.values(ACT_ONE_ASSETS);

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
  return 12 + arenaWidening - gateRhythm;
}

function terrainHeight(x: number, z: number): number {
  const trailDistance = Math.abs(x - pathCenter(z));
  const ridge = Math.max(0, (trailDistance - combatHalfWidth(z) - 4.2) / 9.5);
  const undulation = Math.sin(x * 0.19 + z * 0.035) * 0.34 + Math.cos(z * 0.073 - x * 0.04) * 0.24;
  return undulation + ridge * ridge * 1.8;
}

function prepareMeshes(root: THREE.Object3D): void {
  root.traverse((child) => {
    if (!(child instanceof THREE.Mesh)) return;
    child.castShadow = false;
    child.receiveShadow = false;
    const sourceMaterials = Array.isArray(child.material) ? child.material : [child.material];
    const materials = sourceMaterials.map((source) => {
      const material = source.clone();
      if (material instanceof THREE.MeshStandardMaterial || material instanceof THREE.MeshPhysicalMaterial) {
        material.roughness = Math.max(material.roughness, 0.72);
        material.envMapIntensity = 0.3;
      }
      material.needsUpdate = true;
      return material;
    });
    child.material = Array.isArray(child.material) ? materials : materials[0];
  });
}

function normalizedClone(source: THREE.Object3D, target: number, mode: 'height' | 'width' | 'max'): THREE.Group {
  const clone = SkeletonUtils.clone(source);
  prepareMeshes(clone);
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
        topColor: { value: new THREE.Color('#120a30') },
        middleColor: { value: new THREE.Color('#4b2144') },
        horizonColor: { value: new THREE.Color('#e56e45') },
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

function addLighting(scene: THREE.Scene, renderer: THREE.WebGLRenderer): void {
  renderer.shadowMap.enabled = false;
  renderer.toneMappingExposure = 0.9;

  scene.add(new THREE.HemisphereLight('#ffd0a1', '#56304d', 1.5));
  scene.add(new THREE.AmbientLight('#ffe1bd', 0.62));

  const sunLight = new THREE.DirectionalLight('#fff0ce', 1.65);
  sunLight.position.set(-28, 60, 24);
  scene.add(sunLight);

  const coolFill = new THREE.DirectionalLight('#70d7e8', 0.38);
  coolFill.position.set(28, 22, -48);
  scene.add(coolFill);
}

function createTerrain(root: THREE.Group): void {
  const width = 110;
  const length = 300;
  const centerZ = -80;
  const geometry = new THREE.PlaneGeometry(width, length, 88, 150);
  geometry.rotateX(-Math.PI / 2);
  const positions = geometry.attributes.position;
  const colors: number[] = [];
  const trailColor = new THREE.Color('#b8552c');
  const shoulderColor = new THREE.Color('#a04530');
  const ridgeColor = new THREE.Color('#6b3340');

  for (let index = 0; index < positions.count; index += 1) {
    const x = positions.getX(index);
    const localZ = positions.getZ(index);
    const worldZ = localZ + centerZ;
    const height = terrainHeight(x, worldZ);
    positions.setY(index, height);
    const distance = Math.abs(x - pathCenter(worldZ));
    const blend = THREE.MathUtils.clamp((distance - 7) / 22, 0, 1);
    const color = trailColor.clone().lerp(shoulderColor, Math.min(1, blend * 1.3)).lerp(ridgeColor, Math.max(0, blend - 0.45));
    // Noise keyed to world position, not vertex index — an index-based term
    // lines up with the grid rows and reads as horizontal banding.
    const grain = Math.sin(x * 1.7 + worldZ * 0.9) * Math.cos(x * 0.6 - worldZ * 1.3);
    color.offsetHSL(grain * 0.006, 0, grain * 0.02);
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
      color: '#e0a05e',
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
    const z = THREE.MathUtils.lerp(42, -200, random());
    const x = THREE.MathUtils.lerp(-34, 34, random());
    positions.push(x, terrainHeight(x, z) + 0.7 + random() * 8, z);
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  const particles = new THREE.Points(
    geometry,
    new THREE.PointsMaterial({ color: '#ffc47b', size: 0.18, transparent: true, opacity: 0.26, depthWrite: false }),
  );
  particles.name = 'dust';
  root.add(particles);
}

function addCliffMass(root: THREE.Group, x: number, z: number, scale: number, color: string, random: () => number): void {
  const group = new THREE.Group();
  const material = new THREE.MeshStandardMaterial({ color, roughness: 0.96, flatShading: true });
  const pieces = 3 + Math.floor(random() * 3);
  for (let index = 0; index < pieces; index += 1) {
    const rock = new THREE.Mesh(new THREE.DodecahedronGeometry(1, 0), material);
    rock.scale.set(scale * (0.65 + random() * 0.7), scale * (1 + random() * 1.15), scale * (0.7 + random() * 0.75));
    rock.position.set((random() - 0.5) * scale * 1.5, rock.scale.y * 0.72, (random() - 0.5) * scale * 1.2);
    rock.rotation.set(random() * 0.3, random() * Math.PI, random() * 0.18);
    rock.castShadow = true;
    rock.receiveShadow = true;
    group.add(rock);
  }
  group.position.set(x, terrainHeight(x, z) - 0.4, z);
  root.add(group);
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
  scene.background = new THREE.Color('#2c132e');
  scene.fog = new THREE.FogExp2('#4e2740', 0.0024);
  scene.add(root);
  addSky(scene);
  addLighting(scene, renderer);
  createTerrain(root);
  addDust(root);

  const spawn = (url: string, spawnOptions: SpawnOptions): THREE.Group | null => {
    const source = models.get(url);
    if (!source) return null;
    const object = normalizedClone(source, spawnOptions.target, spawnOptions.mode ?? 'height');
    object.rotation.set(spawnOptions.pitch ?? 0, spawnOptions.rotationY ?? 0, spawnOptions.roll ?? 0);
    object.position.set(
      spawnOptions.x,
      terrainHeight(spawnOptions.x, spawnOptions.z) + (spawnOptions.yOffset ?? 0),
      spawnOptions.z,
    );
    root.add(object);
    if (spawnOptions.colliderRadius) {
      colliders.push({ x: spawnOptions.x, z: spawnOptions.z, radius: spawnOptions.colliderRadius });
    }
    return object;
  };

  // Rock masses are scattered set dressing at the concept-art scale: many small
  // props rather than a handful of frame-filling walls.
  const cliffPalette = ['#6f302f', '#843a31', '#54273a', '#9c4931'];
  for (let index = 0; index < 90; index += 1) {
    const z = 42 - index * 2.8 + (random() - 0.5) * 2.5;
    for (const side of [-1, 1]) {
      if (side < 0 && z > -8 && z < 22) continue;
      const wallDistance = combatHalfWidth(z) + 1.5 + random() * 12;
      addCliffMass(
        root,
        pathCenter(z) + side * wallDistance,
        z,
        0.9 + random() * 0.7,
        cliffPalette[(index + (side > 0 ? 1 : 0)) % cliffPalette.length],
        random,
      );
    }
  }

  const largeRockUrls = [ACT_ONE_ASSETS.rockLarge1, ACT_ONE_ASSETS.rockLarge2, ACT_ONE_ASSETS.rockLarge3];
  for (let index = 0; index < 160; index += 1) {
    const z = 40 - index * 1.5 + (random() - 0.5) * 5;
    const side = random() < 0.5 ? -1 : 1;
    const x = pathCenter(z) + side * (2.0 + random() * (combatHalfWidth(z) + 12));
    spawn(largeRockUrls[index % largeRockUrls.length], {
      x,
      z,
      target: 0.7 + random() * 1.7,
      mode: 'height',
      rotationY: random() * Math.PI * 2,
    });
  }

  const floraUrls = [
    ACT_ONE_ASSETS.plant1,
    ACT_ONE_ASSETS.plant2,
    ACT_ONE_ASSETS.plant3,
    ACT_ONE_ASSETS.bush1,
    ACT_ONE_ASSETS.bush2,
    ACT_ONE_ASSETS.treeLava1,
    ACT_ONE_ASSETS.treeLava2,
    ACT_ONE_ASSETS.treeSpiral1,
    ACT_ONE_ASSETS.treeSwirl1,
  ];
  // Flora clusters: a seed point every few units with a tight knot of plants
  // around it, so density reads as designed rather than as even scatter.
  for (let cluster = 0; cluster < 170; cluster += 1) {
    const seedZ = 38 - random() * 230;
    const side = random() < 0.5 ? -1 : 1;
    const seedX = pathCenter(seedZ) + side * (2.0 + random() * (combatHalfWidth(seedZ) + 11));
    const members = 2 + Math.floor(random() * 4);
    for (let member = 0; member < members; member += 1) {
      const x = seedX + (random() - 0.5) * 4.2;
      const z = seedZ + (random() - 0.5) * 4.2;
      if (Math.abs(x - pathCenter(z)) < 1.6) continue;
      spawn(floraUrls[Math.floor(random() * floraUrls.length)], {
        x,
        z,
        target: 0.7 + random() * 1.5,
        mode: 'height',
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
          player.rotation.y = THREE.MathUtils.lerp(player.rotation.y, Math.atan2(movement.x, movement.z), 0.2);
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

import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import * as SkeletonUtils from 'three/addons/utils/SkeletonUtils.js';
import './style.css';

type FormKind = 'astronaut' | 'mech' | 'ship';

interface HeroDefinition {
  id: string;
  name: string;
  species: string;
  role: string;
  accent: string;
  astronaut: string;
  mech: string;
  ship: string;
}

interface Floater {
  object: THREE.Object3D;
  baseY: number;
  phase: number;
}

interface BayModels {
  astronaut: THREE.Object3D | null;
  mech: THREE.Object3D | null;
  ship: THREE.Object3D | null;
}

const SPACE_KIT_ROOT = '/assets/space-packs/Ultimate Space Kit - March 2023';

const assetUrl = (relativePath: string): string => encodeURI(`${SPACE_KIT_ROOT}/${relativePath}`);

const heroes: HeroDefinition[] = [
  {
    id: 'bee',
    name: 'Barbara',
    species: 'The Bee',
    role: 'Support systems specialist',
    accent: '#f5ae42',
    astronaut: assetUrl('Characters/GLTF/Astronaut_BarbaraTheBee.gltf'),
    mech: assetUrl('Characters/GLTF/Mech_BarbaraTheBee.gltf'),
    ship: assetUrl('Vehicles/GLTF/Spaceship_BarbaraTheBee.gltf'),
  },
  {
    id: 'flamingo',
    name: 'Fernando',
    species: 'The Flamingo',
    role: 'Speed and precision specialist',
    accent: '#ff7c9a',
    astronaut: assetUrl('Characters/GLTF/Astronaut_FernandoTheFlamingo.gltf'),
    mech: assetUrl('Characters/GLTF/Mech_FernandoTheFlamingo.gltf'),
    ship: assetUrl('Vehicles/GLTF/Spaceship_FernandoTheFlamingo.gltf'),
  },
  {
    id: 'frog',
    name: 'Finn',
    species: 'The Frog',
    role: 'Area control specialist',
    accent: '#71f6da',
    astronaut: assetUrl('Characters/GLTF/Astronaut_FinnTheFrog.gltf'),
    mech: assetUrl('Characters/GLTF/Mech_FinnTheFrog.gltf'),
    ship: assetUrl('Vehicles/GLTF/Spaceship_FinnTheFrog.gltf'),
  },
  {
    id: 'red-panda',
    name: 'Rae',
    species: 'The Red Panda',
    role: 'Salvage and armor specialist',
    accent: '#ff876b',
    astronaut: assetUrl('Characters/GLTF/Astronaut_RaeTheRedPanda.gltf'),
    mech: assetUrl('Characters/GLTF/Mech_RaeTheRedPanda.gltf'),
    ship: assetUrl('Vehicles/GLTF/Spaceship_RaeTheRedPanda.gltf'),
  },
];

const environmentAssets = {
  dome: assetUrl('Environment/GLTF/GeodesicDome.gltf'),
  building: assetUrl('Environment/GLTF/Building_L.gltf'),
  solarPanel: assetUrl('Environment/GLTF/SolarPanel_Ground.gltf'),
  rock: assetUrl('Environment/GLTF/Rock_Large_1.gltf'),
  plant: assetUrl('Environment/GLTF/Plant_1.gltf'),
  planet: assetUrl('Environment/GLTF/Planet_4.gltf'),
};

const canvas = document.querySelector<HTMLCanvasElement>('#scene')!;
const loadingScreen = document.querySelector<HTMLDivElement>('#loading-screen')!;
const loadingBar = document.querySelector<HTMLSpanElement>('#loading-bar')!;
const loadingStatus = document.querySelector<HTMLParagraphElement>('#loading-status')!;
const baySelector = document.querySelector<HTMLElement>('#bay-selector')!;
const selectedHero = document.querySelector<HTMLElement>('#selected-hero')!;
const selectedSpecies = document.querySelector<HTMLElement>('#selected-species')!;
const selectedRole = document.querySelector<HTMLElement>('#selected-role')!;
const selectedNumber = document.querySelector<HTMLElement>('#selected-number')!;
const selectHeroButton = document.querySelector<HTMLButtonElement>('#select-hero-button')!;

if (!canvas || !loadingScreen || !loadingBar || !loadingStatus || !baySelector || !selectedHero || !selectedSpecies || !selectedRole || !selectedNumber || !selectHeroButton) {
  throw new Error('The hangar shell is missing a required element.');
}

const scene = new THREE.Scene();
scene.background = new THREE.Color('#4a3d75');
scene.fog = new THREE.Fog('#a76857', 42, 105);

const camera = new THREE.PerspectiveCamera(34, window.innerWidth / window.innerHeight, 0.1, 180);
camera.position.set(0, 10.5, 35);

const renderer = new THREE.WebGLRenderer({ antialias: true, canvas, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.15;

const controls = new OrbitControls(camera, canvas);
controls.enableDamping = true;
controls.dampingFactor = 0.07;
controls.enablePan = false;
controls.minDistance = 16;
controls.maxDistance = 58;
controls.minPolarAngle = 0.48;
controls.maxPolarAngle = 1.32;
controls.target.set(0, 3.7, -2);

const clock = new THREE.Clock();
const bayGroups: THREE.Group[] = [];
const bayHighlights: THREE.Mesh[] = [];
const bayFocusHalos: THREE.Mesh[] = [];
const bayModels: BayModels[] = [];
const bayLights: THREE.PointLight[] = [];
const bayBaseZ: number[] = [];
const floaters: Floater[] = [];
const cameraGoal = camera.position.clone();
const targetGoal = controls.target.clone();
let selectedIndex = 0;

const palette = {
  ground: new THREE.MeshStandardMaterial({ color: '#b8683f', metalness: 0.08, roughness: 0.92 }),
  groundInset: new THREE.MeshStandardMaterial({ color: '#d4844d', metalness: 0.1, roughness: 0.86 }),
  rock: new THREE.MeshStandardMaterial({ color: '#754b76', metalness: 0.08, roughness: 0.9 }),
  cream: new THREE.MeshStandardMaterial({ color: '#f0e1c7', metalness: 0.45, roughness: 0.48 }),
  floor: new THREE.MeshStandardMaterial({ color: '#1b3348', metalness: 0.82, roughness: 0.34 }),
  floorInset: new THREE.MeshStandardMaterial({ color: '#29485d', metalness: 0.72, roughness: 0.4 }),
  wall: new THREE.MeshStandardMaterial({ color: '#60788b', metalness: 0.7, roughness: 0.4 }),
  trim: new THREE.MeshStandardMaterial({ color: '#d79c45', metalness: 0.86, roughness: 0.26 }),
  darkTrim: new THREE.MeshStandardMaterial({ color: '#304d62', metalness: 0.84, roughness: 0.3 }),
  teal: new THREE.MeshStandardMaterial({ color: '#71f6da', emissive: '#2abda7', emissiveIntensity: 2.3, metalness: 0.2, roughness: 0.24 }),
  goldGlow: new THREE.MeshStandardMaterial({ color: '#ffd16a', emissive: '#e79227', emissiveIntensity: 2.2, metalness: 0.15, roughness: 0.28 }),
  violetGlow: new THREE.MeshStandardMaterial({ color: '#b8a5ff', emissive: '#7457ea', emissiveIntensity: 2.5, metalness: 0.12, roughness: 0.25 }),
};

function box(
  size: [number, number, number],
  position: [number, number, number],
  material: THREE.Material,
  parent: THREE.Object3D = scene,
): THREE.Mesh {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(...size), material);
  mesh.position.set(...position);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  parent.add(mesh);
  return mesh;
}

function addGlowStrip(position: [number, number, number], size: [number, number, number], parent: THREE.Object3D = scene): void {
  box(size, position, palette.teal, parent);
}

function fitModel(model: THREE.Object3D, target: number, mode: 'height' | 'width'): THREE.Object3D {
  model.updateMatrixWorld(true);
  const initialBounds = new THREE.Box3().setFromObject(model);
  const initialSize = initialBounds.getSize(new THREE.Vector3());
  const dimension = mode === 'height' ? initialSize.y : Math.max(initialSize.x, initialSize.z);
  if (dimension > 0) {
    model.scale.multiplyScalar(target / dimension);
  }
  model.updateMatrixWorld(true);
  const finalBounds = new THREE.Box3().setFromObject(model);
  model.position.y -= finalBounds.min.y;
  model.traverse((child) => {
    if (child instanceof THREE.Mesh) {
      child.castShadow = true;
      child.receiveShadow = true;
    }
  });
  return model;
}

function prepareModelMaterials(root: THREE.Object3D): void {
  root.traverse((child) => {
    if (!(child instanceof THREE.Mesh)) return;

    const sourceMaterials = Array.isArray(child.material) ? child.material : [child.material];
    const preparedMaterials = sourceMaterials.map((sourceMaterial) => {
      const material = sourceMaterial.clone();
      const color = 'color' in material && material.color instanceof THREE.Color ? material.color.clone() : null;
      const emissive = 'emissive' in material && material.emissive instanceof THREE.Color ? material.emissive.clone() : null;
      material.userData.hangarOriginal = {
        color,
        emissive,
        emissiveIntensity: 'emissiveIntensity' in material ? material.emissiveIntensity : 0,
        opacity: material.opacity,
        transparent: material.transparent,
        depthWrite: material.depthWrite,
      };
      return material;
    });

    child.material = Array.isArray(child.material) ? preparedMaterials : preparedMaterials[0];
  });
}

function setModelFocus(root: THREE.Object3D, focused: boolean): void {
  root.traverse((child) => {
    if (!(child instanceof THREE.Mesh)) return;
    const materials = Array.isArray(child.material) ? child.material : [child.material];

    materials.forEach((material) => {
      const original = material.userData.hangarOriginal as {
        color: THREE.Color | null;
        emissive: THREE.Color | null;
        emissiveIntensity: number;
        opacity: number;
        transparent: boolean;
        depthWrite: boolean;
      } | undefined;
      if (!original) return;

      if (original.color && 'color' in material && material.color instanceof THREE.Color) {
        material.color.copy(original.color);
        if (!focused) material.color.multiplyScalar(0.22);
      }
      if (original.emissive && 'emissive' in material && material.emissive instanceof THREE.Color) {
        material.emissive.copy(original.emissive);
        if (!focused) material.emissive.multiplyScalar(0.12);
      }
      if ('emissiveIntensity' in material) {
        material.emissiveIntensity = focused ? original.emissiveIntensity : original.emissiveIntensity * 0.16;
      }
      material.opacity = focused ? original.opacity : Math.min(original.opacity, 0.3);
      material.transparent = focused || original.transparent;
      material.depthWrite = focused ? original.depthWrite : false;
      material.needsUpdate = true;
    });
  });
}

function createFallbackModel(accent: string, height: number): THREE.Group {
  const fallback = new THREE.Group();
  const material = new THREE.MeshStandardMaterial({ color: accent, roughness: 0.35, metalness: 0.35 });
  const body = new THREE.Mesh(new THREE.OctahedronGeometry(height * 0.32, 1), material);
  body.position.y = height * 0.48;
  body.castShadow = true;
  fallback.add(body);
  const glow = new THREE.Mesh(new THREE.SphereGeometry(height * 0.09, 16, 8), palette.teal);
  glow.position.y = height * 0.52;
  fallback.add(glow);
  return fallback;
}

function loadModel(loader: GLTFLoader, url: string): Promise<THREE.Object3D | null> {
  return new Promise((resolve) => {
    loader.load(
      url,
      (gltf) => resolve(gltf.scene),
      undefined,
      (error) => {
        console.warn(`Could not load asset: ${url}`, error);
        resolve(null);
      },
    );
  });
}

function createHangarShell(): void {
  const worldWidth = 58;
  const worldDepth = 37;

  box([worldWidth, 0.7, worldDepth], [0, -0.42, -1], palette.ground);
  box([worldWidth - 2, 0.1, worldDepth - 2], [0, -0.02, -1], palette.groundInset);
  box([6.2, 0.12, worldDepth - 4], [0, 0.1, -1], palette.cream);
  box([5.4, 0.08, worldDepth - 5], [0, 0.18, -1], palette.groundInset);

  // A shallow launch court gives the selection screen a real sense of place.
  box([worldWidth - 4, 1.3, 0.65], [0, 0.55, -16.8], palette.cream);
  box([worldWidth - 4, 0.2, 0.28], [0, 1.25, -16.4], palette.trim);
  box([worldWidth - 4, 0.18, 0.26], [0, 2.45, -16.25], palette.teal);

  for (const x of [-26, 26]) {
    box([1.1, 5.8, 1.2], [x, 2.8, -15.9], palette.cream);
    box([1.35, 0.3, 1.45], [x, 5.58, -15.9], palette.trim);
    addGlowStrip([x, 3.3, -15.28], [0.16, 2.2, 0.12]);
  }

  // The launch gate supplies a colorful visual anchor behind the selected hero.
  const gate = new THREE.Mesh(new THREE.TorusGeometry(5.4, 0.32, 12, 64), palette.cream);
  gate.position.set(0, 6.8, -15.95);
  scene.add(gate);
  const gateInner = new THREE.Mesh(
    new THREE.CircleGeometry(5.05, 64),
    new THREE.MeshBasicMaterial({ color: '#4ec9e9', transparent: true, opacity: 0.28, side: THREE.DoubleSide }),
  );
  gateInner.position.set(0, 6.8, -16.15);
  scene.add(gateInner);
  const gateCore = new THREE.Mesh(new THREE.CircleGeometry(2.8, 32), palette.violetGlow);
  gateCore.position.set(0, 6.8, -16.22);
  scene.add(gateCore);

  for (const x of [-23, -11.5, 0, 11.5, 23]) {
    box([0.3, 2.4, 0.55], [x, 1.2, -14.8], palette.cream);
    box([0.46, 0.16, 0.72], [x, 2.36, -14.8], palette.trim);
  }

  // Warm low-poly cliff silhouettes keep the bright court grounded in the alien world.
  for (const x of [-28, -20, 20, 28]) {
    const cliff = new THREE.Mesh(new THREE.ConeGeometry(3.8, 7 + Math.random() * 3, 6), palette.rock ?? palette.ground);
    cliff.position.set(x, 3.2, -10 - Math.random() * 4);
    cliff.rotation.y = Math.random() * Math.PI;
    cliff.castShadow = true;
    scene.add(cliff);
  }
}

function createBay(index: number, hero: HeroDefinition): THREE.Group {
  const group = new THREE.Group();
  const x = (index - 1.5) * 10.8;
  const baseZ = -Math.abs(index - 1.5) * 1.8;
  group.position.set(x, 0, baseZ);
  group.rotation.y = (1.5 - index) * 0.025;
  group.userData.heroId = hero.id;
  scene.add(group);
  bayGroups.push(group);
  bayBaseZ.push(baseZ);
  bayModels.push({ astronaut: null, mech: null, ship: null });

  const bayWidth = 9.5;
  const bayDepth = 22.5;
  box([bayWidth, 0.08, bayDepth], [0, 0.12, -1], palette.cream, group);
  box([bayWidth - 0.6, 0.05, bayDepth - 0.7], [0, 0.18, -1], palette.floorInset, group);

  for (const localX of [-4.15, 4.15]) {
    box([0.16, 0.06, bayDepth - 1.2], [localX, 0.21, -1], palette.trim, group);
  }

  const astronautPad = new THREE.Mesh(new THREE.CylinderGeometry(2.08, 2.08, 0.1, 32), palette.goldGlow);
  astronautPad.position.set(0, 0.2, 6.15);
  astronautPad.scale.z = 0.86;
  group.add(astronautPad);

  const mechPad = new THREE.Mesh(new THREE.CylinderGeometry(2.75, 2.75, 0.48, 8), palette.cream);
  mechPad.position.set(0, 0.5, 0.25);
  group.add(mechPad);
  const mechPadTop = new THREE.Mesh(new THREE.CylinderGeometry(2.63, 2.63, 0.08, 8), palette.teal);
  mechPadTop.position.set(0, 0.77, 0.25);
  group.add(mechPadTop);

  const shipPad = new THREE.Mesh(new THREE.CylinderGeometry(3.15, 3.15, 0.34, 12), palette.cream);
  shipPad.position.set(0, 3.16, -6.25);
  group.add(shipPad);
  const shipRing = new THREE.Mesh(new THREE.TorusGeometry(3.05, 0.11, 10, 48), palette.violetGlow);
  shipRing.rotation.x = Math.PI / 2;
  shipRing.position.set(0, 3.4, -6.25);
  group.add(shipRing);

  addGlowStrip([0, 0.26, 3.35], [0.18, 0.08, 2.15], group);
  addGlowStrip([0, 0.26, -2.65], [0.18, 0.08, 2.15], group);

  for (const z of [3.25, -2.55]) {
    const arrow = new THREE.Mesh(new THREE.ConeGeometry(0.28, 0.72, 4), palette.teal);
    arrow.rotation.x = -Math.PI / 2;
    arrow.position.set(0, 0.38, z);
    group.add(arrow);
  }

  const gantryHeight = 7.2;
  for (const localX of [-3.75, 3.75]) {
    box([0.38, gantryHeight, 0.42], [localX, gantryHeight / 2, -7.5], palette.wall, group);
    box([0.56, 0.18, 0.62], [localX, gantryHeight - 0.25, -7.5], palette.trim, group);
  }
  box([8.65, 0.42, 0.48], [0, gantryHeight, -7.5], palette.trim, group);
  addGlowStrip([0, gantryHeight - 0.28, -7.27], [7.2, 0.12, 0.14], group);

  const accentLight = new THREE.PointLight(hero.accent, 12, 17, 2);
  accentLight.position.set(0, 5.6, -3.8);
  group.add(accentLight);
  bayLights.push(accentLight);

  const highlight = new THREE.Mesh(
    new THREE.RingGeometry(3.65, 3.85, 48),
    new THREE.MeshBasicMaterial({ color: hero.accent, transparent: true, opacity: index === 0 ? 0.95 : 0.18, side: THREE.DoubleSide, blending: THREE.AdditiveBlending, depthWrite: false }),
  );
  highlight.rotation.x = -Math.PI / 2;
  highlight.position.set(0, 0.26, 6.15);
  group.add(highlight);
  bayHighlights.push(highlight);

  const focusHalo = new THREE.Mesh(
    new THREE.RingGeometry(4.15, 4.42, 64),
    new THREE.MeshBasicMaterial({ color: hero.accent, transparent: true, opacity: index === 0 ? 0.55 : 0.05, side: THREE.DoubleSide, blending: THREE.AdditiveBlending, depthWrite: false }),
  );
  focusHalo.position.set(0, 5.9, -9.4);
  group.add(focusHalo);
  bayFocusHalos.push(focusHalo);

  return group;
}

function addModelToBay(
  source: THREE.Object3D | null,
  bay: THREE.Group,
  hero: HeroDefinition,
  kind: FormKind,
  index: number,
): void {
  const fallbackSizes: Record<FormKind, number> = { astronaut: 3.8, mech: 5.6, ship: 6.1 };
  // Astronauts and mechs are skinned GLTFs; SkeletonUtils keeps their bones and
  // skin bindings intact when each hero is duplicated into the hangar.
  const target = source ? SkeletonUtils.clone(source) : createFallbackModel(hero.accent, fallbackSizes[kind]);
  prepareModelMaterials(target);
  const model = fitModel(target, kind === 'ship' ? 6.3 : fallbackSizes[kind], kind === 'ship' ? 'width' : 'height');

  if (kind === 'astronaut') {
    model.position.set(0, 0.26, 6.15);
    model.rotation.y = Math.PI;
  } else if (kind === 'mech') {
    model.position.set(0, 0.78, 0.25);
    model.rotation.y = Math.PI;
  } else {
    model.position.set(0, 3.65, -6.1);
    model.rotation.y = Math.PI;
    floaters.push({ object: model, baseY: model.position.y, phase: index * 0.9 });
  }

  bayModels[index][kind] = model;
  bay.add(model);
}

function addEnvironmentModel(source: THREE.Object3D | null, url: string, position: [number, number, number], targetHeight: number, rotationY = 0): void {
  if (!source) return;
  const model = fitModel(SkeletonUtils.clone(source), targetHeight, 'height');
  model.position.set(...position);
  model.rotation.y = rotationY;
  scene.add(model);
}

function createBackdrop(): void {
  const backdrop = new THREE.Mesh(
    new THREE.PlaneGeometry(120, 70),
    new THREE.ShaderMaterial({
      uniforms: {
        topColor: { value: new THREE.Color('#4d427d') },
        bottomColor: { value: new THREE.Color('#d77b52') },
      },
      vertexShader: `varying vec2 vUv; void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
      fragmentShader: `uniform vec3 topColor; uniform vec3 bottomColor; varying vec2 vUv; void main() { float blend = smoothstep(0.05, 0.92, vUv.y); gl_FragColor = vec4(mix(bottomColor, topColor, blend), 1.0); }`,
      depthWrite: false,
    }),
  );
  backdrop.position.set(0, 18, -21);
  backdrop.renderOrder = -10;
  scene.add(backdrop);

  const planetGlow = new THREE.Mesh(
    new THREE.CircleGeometry(10.5, 32),
    new THREE.MeshBasicMaterial({ color: '#ffb768', transparent: true, opacity: 0.16, blending: THREE.AdditiveBlending, depthWrite: false }),
  );
  planetGlow.position.set(22, 15, -27.2);
  scene.add(planetGlow);

  const stars = new THREE.BufferGeometry();
  const starPositions: number[] = [];
  for (let i = 0; i < 180; i += 1) {
    starPositions.push((Math.random() - 0.5) * 100, 10 + Math.random() * 28, -18 - Math.random() * 26);
  }
  stars.setAttribute('position', new THREE.Float32BufferAttribute(starPositions, 3));
  const starField = new THREE.Points(stars, new THREE.PointsMaterial({ color: '#fff0ba', size: 0.12, transparent: true, opacity: 0.9 }));
  scene.add(starField);
}

function createLighting(): void {
  scene.add(new THREE.HemisphereLight('#ffd6a1', '#67445a', 2.1));

  const key = new THREE.DirectionalLight('#fff0c8', 5.6);
  key.position.set(-18, 30, 18);
  key.castShadow = true;
  key.shadow.mapSize.set(2048, 2048);
  key.shadow.camera.left = -34;
  key.shadow.camera.right = 34;
  key.shadow.camera.top = 28;
  key.shadow.camera.bottom = -20;
  key.shadow.bias = -0.0003;
  scene.add(key);

  const rim = new THREE.DirectionalLight('#67d9ef', 3.8);
  rim.position.set(22, 17, -24);
  scene.add(rim);

  const warmFill = new THREE.PointLight('#f59a56', 18, 35, 2);
  warmFill.position.set(-18, 7, 4);
  scene.add(warmFill);
}

function updateSelection(index: number, moveCamera = true): void {
  selectedIndex = index;
  const hero = heroes[index];
  selectedNumber.textContent = `${String(index + 1).padStart(2, '0')} / 04`;
  selectedHero.textContent = hero.name;
  selectedSpecies.textContent = hero.species;
  selectedRole.textContent = hero.role;
  selectHeroButton.textContent = `SELECT ${hero.name.toUpperCase()}`;
  bayHighlights.forEach((highlight, highlightIndex) => {
    const material = highlight.material as THREE.MeshBasicMaterial;
    material.opacity = highlightIndex === index ? 0.95 : 0.1;
  });
  bayFocusHalos.forEach((halo, haloIndex) => {
    const material = halo.material as THREE.MeshBasicMaterial;
    material.opacity = haloIndex === index ? 0.58 : 0.025;
  });
  bayModels.forEach((models, modelIndex) => {
    (Object.values(models) as Array<THREE.Object3D | null>).forEach((model) => {
      if (model) setModelFocus(model, modelIndex === index);
    });
  });
  document.documentElement.style.setProperty('--bay-accent', hero.accent);
  baySelector.querySelectorAll<HTMLButtonElement>('.bay-button').forEach((button, buttonIndex) => {
    button.classList.toggle('active', buttonIndex === index);
    button.setAttribute('aria-selected', String(buttonIndex === index));
  });

  if (moveCamera) {
    const x = (index - 1.5) * 10.8;
    cameraGoal.set(x * 0.3, 9.3, 30.5);
    targetGoal.set(x * 0.22, 3.75, -2.35);
  }
}

function buildBaySelector(): void {
  heroes.forEach((hero, index) => {
    const button = document.createElement('button');
    button.className = 'bay-button';
    button.type = 'button';
    button.style.setProperty('--bay-accent', hero.accent);
    button.setAttribute('aria-label', `Focus ${hero.name} ${hero.species} bay`);
    button.setAttribute('aria-selected', String(index === 0));
    button.innerHTML = `<strong>${hero.name}</strong><span>${hero.species}</span>`;
    button.addEventListener('click', () => updateSelection(index));
    baySelector.appendChild(button);
  });
}

function updateLoading(loaded: number, total: number): void {
  const progress = total > 0 ? Math.round((loaded / total) * 100) : 0;
  loadingBar.style.width = `${progress}%`;
  loadingStatus.textContent = progress >= 100 ? 'Finalizing hangar presentation' : `Loading hero assets · ${progress}%`;
}

function animate(): void {
  requestAnimationFrame(animate);
  const elapsed = clock.getElapsedTime();

  camera.position.lerp(cameraGoal, 0.045);
  controls.target.lerp(targetGoal, 0.045);
  controls.update();

  bayGroups.forEach((group, index) => {
    const focused = index === selectedIndex;
    const desiredScale = focused ? 1.12 : 0.84;
    const desiredZ = bayBaseZ[index] + (focused ? 1.35 : 0);
    const baseRotation = (1.5 - index) * 0.025;
    group.scale.setScalar(THREE.MathUtils.lerp(group.scale.x, desiredScale, 0.065));
    group.position.z = THREE.MathUtils.lerp(group.position.z, desiredZ, 0.065);
    group.rotation.y = THREE.MathUtils.lerp(group.rotation.y, focused ? 0 : baseRotation, 0.065);
  });

  floaters.forEach(({ object, baseY, phase }) => {
    object.position.y = baseY + Math.sin(elapsed * 1.4 + phase) * 0.13;
    object.rotation.y += 0.0018;
  });

  bayLights.forEach((light, index) => {
    const targetIntensity = index === selectedIndex ? 14 : 1.8;
    light.intensity = THREE.MathUtils.lerp(light.intensity, targetIntensity, 0.08) + Math.sin(elapsed * 2.2 + index) * 0.35;
  });

  renderer.render(scene, camera);
}

function handleResize(): void {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
}

async function init(): Promise<void> {
  buildBaySelector();
  createBackdrop();
  createLighting();
  createHangarShell();

  const loaderManager = new THREE.LoadingManager();
  loaderManager.onProgress = (_url, loaded, total) => updateLoading(loaded, total);
  const loader = new GLTFLoader(loaderManager);

  const entries = [
    ...heroes.flatMap((hero) => [hero.astronaut, hero.mech, hero.ship]),
    ...Object.values(environmentAssets),
  ];
  const uniqueEntries = [...new Set(entries)];
  const loadedModels = new Map<string, THREE.Object3D | null>();
  const loadedResults = await Promise.all(uniqueEntries.map((url) => loadModel(loader, url)));
  uniqueEntries.forEach((url, index) => loadedModels.set(url, loadedResults[index]));

  heroes.forEach((hero, index) => {
    const bay = createBay(index, hero);
    addModelToBay(loadedModels.get(hero.astronaut) ?? null, bay, hero, 'astronaut', index);
    addModelToBay(loadedModels.get(hero.mech) ?? null, bay, hero, 'mech', index);
    addModelToBay(loadedModels.get(hero.ship) ?? null, bay, hero, 'ship', index);
  });

  addEnvironmentModel(loadedModels.get(environmentAssets.dome) ?? null, environmentAssets.dome, [-25, 0, -10], 5.8, 0.25);
  addEnvironmentModel(loadedModels.get(environmentAssets.building) ?? null, environmentAssets.building, [25, 0, -10], 6.5, -0.4);
  addEnvironmentModel(loadedModels.get(environmentAssets.planet) ?? null, environmentAssets.planet, [22, 15, -27], 12, 0.15);
  addEnvironmentModel(loadedModels.get(environmentAssets.solarPanel) ?? null, environmentAssets.solarPanel, [-25, 0, 4.3], 2.9, 0.35);
  addEnvironmentModel(loadedModels.get(environmentAssets.solarPanel) ?? null, environmentAssets.solarPanel, [25, 0, 5.2], 2.7, -0.45);
  addEnvironmentModel(loadedModels.get(environmentAssets.rock) ?? null, environmentAssets.rock, [27, 0, 4], 5.2, 0.1);
  addEnvironmentModel(loadedModels.get(environmentAssets.rock) ?? null, environmentAssets.rock, [-28, 0, 4], 4.4, -0.2);
  addEnvironmentModel(loadedModels.get(environmentAssets.rock) ?? null, environmentAssets.rock, [-22, 0, 9], 3.2, 0.4);
  addEnvironmentModel(loadedModels.get(environmentAssets.plant) ?? null, environmentAssets.plant, [-28, 0, 0], 3.2, -0.1);
  addEnvironmentModel(loadedModels.get(environmentAssets.plant) ?? null, environmentAssets.plant, [28, 0, 1], 3.6, 0.6);
  addEnvironmentModel(loadedModels.get(environmentAssets.plant) ?? null, environmentAssets.plant, [20, 0, 8], 2.8, -0.3);

  updateSelection(0, false);
  selectHeroButton.addEventListener('click', () => {
    selectHeroButton.textContent = `${heroes[selectedIndex].name.toUpperCase()} READY`;
    window.setTimeout(() => updateSelection(selectedIndex, false), 900);
  });
  loadingBar.style.width = '100%';
  loadingStatus.textContent = 'Hangar ready';
  window.setTimeout(() => loadingScreen.classList.add('loaded'), 350);
  window.addEventListener('resize', handleResize);
  animate();
}

init().catch((error) => {
  console.error(error);
  loadingStatus.textContent = 'Unable to initialize the hangar. Check the browser console.';
});

import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
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
const selectedRole = document.querySelector<HTMLElement>('#selected-role')!;

if (!canvas || !loadingScreen || !loadingBar || !loadingStatus || !baySelector || !selectedHero || !selectedRole) {
  throw new Error('The hangar shell is missing a required element.');
}

const scene = new THREE.Scene();
scene.background = new THREE.Color('#081321');
scene.fog = new THREE.Fog('#081321', 32, 92);

const camera = new THREE.PerspectiveCamera(38, window.innerWidth / window.innerHeight, 0.1, 180);
camera.position.set(0, 25, 43);

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
controls.minDistance = 19;
controls.maxDistance = 65;
controls.minPolarAngle = 0.42;
controls.maxPolarAngle = 1.34;
controls.target.set(0, 2.8, -1);

const clock = new THREE.Clock();
const bayGroups: THREE.Group[] = [];
const bayHighlights: THREE.Mesh[] = [];
const floaters: Floater[] = [];
const pulseLights: THREE.PointLight[] = [];
const cameraGoal = camera.position.clone();
const targetGoal = controls.target.clone();
let selectedIndex = 0;

const palette = {
  floor: new THREE.MeshStandardMaterial({ color: '#152637', metalness: 0.82, roughness: 0.34 }),
  floorInset: new THREE.MeshStandardMaterial({ color: '#20374b', metalness: 0.72, roughness: 0.4 }),
  wall: new THREE.MeshStandardMaterial({ color: '#536578', metalness: 0.7, roughness: 0.4 }),
  trim: new THREE.MeshStandardMaterial({ color: '#d79c45', metalness: 0.86, roughness: 0.26 }),
  darkTrim: new THREE.MeshStandardMaterial({ color: '#243648', metalness: 0.84, roughness: 0.3 }),
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
  const hangarWidth = 53;
  const hangarDepth = 27;

  box([hangarWidth, 0.7, hangarDepth], [0, -0.45, -1], palette.floor);
  box([hangarWidth, 0.2, hangarDepth - 2], [0, -0.04, -1], palette.floorInset);

  box([hangarWidth, 10, 0.65], [0, 4.7, -14.25], palette.wall);
  box([hangarWidth, 0.7, 0.8], [0, 9.9, -13.9], palette.darkTrim);
  box([hangarWidth, 0.34, 0.35], [0, 1.8, -13.84], palette.trim);
  addGlowStrip([0, 7.7, -13.84], [hangarWidth - 3, 0.12, 0.14]);

  for (const x of [-25.2, 25.2]) {
    box([0.8, 10, 0.9], [x, 4.7, -13.8], palette.trim);
    box([1.9, 0.4, 1.4], [x, 0.2, -13.7], palette.darkTrim);
  }

  box([hangarWidth, 0.55, 0.75], [0, 10.05, -5.2], palette.darkTrim);
  box([hangarWidth, 0.35, 0.65], [0, 10.1, 5.8], palette.darkTrim);

  for (const x of [-23.8, -11.9, 0, 11.9, 23.8]) {
    box([0.32, 9.2, 0.6], [x, 4.45, -13.2], palette.trim);
    box([0.62, 0.32, 0.7], [x, 9.1, -13.25], palette.goldGlow);
  }

  for (const x of [-24.5, -12.25, 0, 12.25, 24.5]) {
    box([0.3, 0.2, hangarDepth - 2], [x, 0.08, -1], palette.darkTrim);
  }

  const ceilingRing = new THREE.Mesh(
    new THREE.TorusGeometry(12.5, 0.16, 12, 64),
    palette.teal,
  );
  ceilingRing.rotation.x = Math.PI / 2;
  ceilingRing.position.set(0, 9.65, -3.2);
  scene.add(ceilingRing);

  const ceilingCore = new THREE.Mesh(new THREE.CylinderGeometry(1.35, 1.35, 0.28, 32), palette.violetGlow);
  ceilingCore.position.set(0, 9.45, -3.2);
  scene.add(ceilingCore);

  for (const z of [8, 2, -4, -10]) {
    addGlowStrip([0, 0.08, z], [1.5, 0.08, 0.12]);
  }
}

function createBay(index: number, hero: HeroDefinition): THREE.Group {
  const group = new THREE.Group();
  const x = (index - 1.5) * 12.2;
  group.position.x = x;
  group.userData.heroId = hero.id;
  scene.add(group);
  bayGroups.push(group);

  const bayWidth = 10.6;
  const bayDepth = 23.8;
  box([bayWidth, 0.08, bayDepth], [0, 0.12, -1], palette.darkTrim, group);

  for (const localX of [-4.65, 4.65]) {
    box([0.16, 0.06, bayDepth - 1.2], [localX, 0.19, -1], palette.trim, group);
  }

  const astronautPad = new THREE.Mesh(new THREE.CylinderGeometry(2.08, 2.08, 0.1, 32), palette.goldGlow);
  astronautPad.position.set(0, 0.2, 6.15);
  astronautPad.scale.z = 0.86;
  group.add(astronautPad);

  const mechPad = new THREE.Mesh(new THREE.CylinderGeometry(2.95, 2.95, 0.48, 8), palette.floor);
  mechPad.position.set(0, 0.5, 0.25);
  group.add(mechPad);
  const mechPadTop = new THREE.Mesh(new THREE.CylinderGeometry(2.63, 2.63, 0.08, 8), palette.teal);
  mechPadTop.position.set(0, 0.77, 0.25);
  group.add(mechPadTop);

  const shipPad = new THREE.Mesh(new THREE.CylinderGeometry(3.35, 3.35, 0.34, 12), palette.floor);
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
  for (const localX of [-4.15, 4.15]) {
    box([0.38, gantryHeight, 0.42], [localX, gantryHeight / 2, -7.5], palette.wall, group);
    box([0.56, 0.18, 0.62], [localX, gantryHeight - 0.25, -7.5], palette.trim, group);
  }
  box([8.65, 0.42, 0.48], [0, gantryHeight, -7.5], palette.trim, group);
  addGlowStrip([0, gantryHeight - 0.28, -7.27], [7.2, 0.12, 0.14], group);

  const accentLight = new THREE.PointLight(hero.accent, 7.5, 13, 2);
  accentLight.position.set(0, 4.4, -5.6);
  group.add(accentLight);
  pulseLights.push(accentLight);

  const highlight = new THREE.Mesh(
    new THREE.RingGeometry(3.65, 3.85, 48),
    new THREE.MeshBasicMaterial({ color: hero.accent, transparent: true, opacity: index === 0 ? 0.95 : 0.18, side: THREE.DoubleSide }),
  );
  highlight.rotation.x = -Math.PI / 2;
  highlight.position.set(0, 0.26, 6.15);
  group.add(highlight);
  bayHighlights.push(highlight);

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
  const target = source?.clone(true) ?? createFallbackModel(hero.accent, fallbackSizes[kind]);
  const model = fitModel(target, kind === 'ship' ? 6.3 : fallbackSizes[kind], kind === 'ship' ? 'width' : 'height');

  if (kind === 'astronaut') {
    model.position.set(0, 0.26, 6.15);
    model.rotation.y = Math.PI;
  } else if (kind === 'mech') {
    model.position.set(0, 0.78, 0.25);
    model.rotation.y = Math.PI;
  } else {
    model.position.set(0, 3.65, -6.25);
    model.rotation.y = Math.PI;
    floaters.push({ object: model, baseY: model.position.y, phase: index * 0.9 });
  }

  bay.add(model);
}

function addEnvironmentModel(source: THREE.Object3D | null, url: string, position: [number, number, number], targetHeight: number, rotationY = 0): void {
  if (!source) return;
  const model = fitModel(source.clone(true), targetHeight, 'height');
  model.position.set(...position);
  model.rotation.y = rotationY;
  scene.add(model);
}

function createBackdrop(): void {
  const backdrop = new THREE.Mesh(
    new THREE.PlaneGeometry(120, 70),
    new THREE.MeshBasicMaterial({ color: '#0b1d31' }),
  );
  backdrop.position.set(0, 17, -18);
  scene.add(backdrop);

  const planet = new THREE.Mesh(
    new THREE.SphereGeometry(7, 32, 20),
    new THREE.MeshStandardMaterial({ color: '#513e83', roughness: 0.85, metalness: 0.05 }),
  );
  planet.position.set(-25, 13, -22);
  planet.castShadow = true;
  scene.add(planet);

  const stars = new THREE.BufferGeometry();
  const starPositions: number[] = [];
  for (let i = 0; i < 240; i += 1) {
    starPositions.push((Math.random() - 0.5) * 100, 9 + Math.random() * 32, -17 - Math.random() * 30);
  }
  stars.setAttribute('position', new THREE.Float32BufferAttribute(starPositions, 3));
  const starField = new THREE.Points(stars, new THREE.PointsMaterial({ color: '#a6d8ff', size: 0.08, transparent: true, opacity: 0.7 }));
  scene.add(starField);
}

function createLighting(): void {
  scene.add(new THREE.HemisphereLight('#9fcbff', '#09121c', 1.35));

  const key = new THREE.DirectionalLight('#fff1d0', 4.4);
  key.position.set(-18, 30, 18);
  key.castShadow = true;
  key.shadow.mapSize.set(2048, 2048);
  key.shadow.camera.left = -34;
  key.shadow.camera.right = 34;
  key.shadow.camera.top = 28;
  key.shadow.camera.bottom = -20;
  key.shadow.bias = -0.0003;
  scene.add(key);

  const rim = new THREE.DirectionalLight('#6ad9ff', 2.8);
  rim.position.set(22, 14, -24);
  scene.add(rim);
}

function updateSelection(index: number, moveCamera = true): void {
  selectedIndex = index;
  const hero = heroes[index];
  selectedHero.textContent = `${hero.name} ${hero.species}`;
  selectedRole.textContent = `${hero.role} · Astronaut → Mech → Spaceship`;
  bayHighlights.forEach((highlight, highlightIndex) => {
    const material = highlight.material as THREE.MeshBasicMaterial;
    material.opacity = highlightIndex === index ? 0.95 : 0.18;
  });
  document.documentElement.style.setProperty('--bay-accent', hero.accent);
  baySelector.querySelectorAll<HTMLButtonElement>('.bay-button').forEach((button, buttonIndex) => {
    button.classList.toggle('active', buttonIndex === index);
    button.setAttribute('aria-selected', String(buttonIndex === index));
  });

  if (moveCamera) {
    const x = (index - 1.5) * 12.2;
    cameraGoal.set(x * 0.52, 17.6, 30.5);
    targetGoal.set(x, 2.65, -1.8);
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

  floaters.forEach(({ object, baseY, phase }) => {
    object.position.y = baseY + Math.sin(elapsed * 1.4 + phase) * 0.13;
    object.rotation.y += 0.0018;
  });

  pulseLights.forEach((light, index) => {
    light.intensity = 6.5 + Math.sin(elapsed * 2.2 + index) * 1.2;
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
  addEnvironmentModel(loadedModels.get(environmentAssets.solarPanel) ?? null, environmentAssets.solarPanel, [-25, 0, 4.3], 2.9, 0.35);
  addEnvironmentModel(loadedModels.get(environmentAssets.rock) ?? null, environmentAssets.rock, [27, 0, 4], 5.2, 0.1);
  addEnvironmentModel(loadedModels.get(environmentAssets.plant) ?? null, environmentAssets.plant, [-28, 0, 0], 3.2, -0.1);

  updateSelection(0, false);
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

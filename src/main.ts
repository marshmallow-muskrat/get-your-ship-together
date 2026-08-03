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
scene.background = new THREE.Color('#030714');
scene.fog = new THREE.Fog('#030714', 60, 135);

const camera = new THREE.PerspectiveCamera(34, window.innerWidth / window.innerHeight, 0.1, 180);
camera.position.set(0, 8.8, 31);

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
controls.target.set(0, 3.6, 1.2);

const clock = new THREE.Clock();
const bayGroups: THREE.Group[] = [];
const bayLights: THREE.PointLight[] = [];
const bayBaseZ: number[] = [];
const floaters: Floater[] = [];
const cameraGoal = camera.position.clone();
const targetGoal = controls.target.clone();
let selectedIndex = 0;
let cameraTransitioning = false;

controls.addEventListener('start', () => {
  // Orbiting and zooming are deliberately free-form. A hero click is the only
  // interaction that starts a camera transition.
  cameraTransitioning = false;
});

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

function createBay(index: number, hero: HeroDefinition): THREE.Group {
  const group = new THREE.Group();
  const x = (index - 1.5) * 10.8;
  const baseZ = -Math.abs(index - 1.5) * 1.8;
  group.position.set(x, 0, baseZ);
  group.userData.heroId = hero.id;
  scene.add(group);
  bayGroups.push(group);
  bayBaseZ.push(baseZ);

  const accentLight = new THREE.PointLight(hero.accent, 7.5, 22, 2);
  accentLight.position.set(0, 5.5, 0);
  group.add(accentLight);
  bayLights.push(accentLight);

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
  const model = fitModel(target, kind === 'ship' ? 6.3 : fallbackSizes[kind], kind === 'ship' ? 'width' : 'height');

  if (kind === 'astronaut') {
    model.position.set(0, 0.4, 5.1);
    model.rotation.y = 0;
  } else if (kind === 'mech') {
    model.position.set(0, 0.75, -0.1);
    model.rotation.y = 0;
  } else {
    model.position.set(0, 5.0, -5.8);
    model.rotation.y = Math.PI;
    floaters.push({ object: model, baseY: model.position.y, phase: index * 0.9 });
  }

  bay.add(model);
}

function createBackdrop(): void {
  const backdrop = new THREE.Mesh(
    new THREE.PlaneGeometry(150, 95),
    new THREE.ShaderMaterial({
      uniforms: {
        deepColor: { value: new THREE.Color('#030714') },
        violetColor: { value: new THREE.Color('#261348') },
        cyanColor: { value: new THREE.Color('#073c54') },
      },
      vertexShader: `varying vec2 vUv; void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
      fragmentShader: `
        uniform vec3 deepColor;
        uniform vec3 violetColor;
        uniform vec3 cyanColor;
        varying vec2 vUv;
        void main() {
          vec2 p = vUv - 0.5;
          float sweep = exp(-pow((p.x * 1.35 + p.y * 0.72 + 0.03) * 3.2, 2.0));
          float wisps = 0.5 + 0.5 * sin(p.x * 22.0 + sin(p.y * 13.0) * 3.4);
          float secondary = exp(-pow((p.x * 1.05 - p.y * 1.2 - 0.08) * 3.8, 2.0));
          vec3 color = deepColor;
          color += violetColor * sweep * (0.42 + wisps * 0.28);
          color += cyanColor * secondary * 0.38;
          color += vec3(0.08, 0.025, 0.14) * (0.5 + 0.5 * sin(p.y * 8.0));
          gl_FragColor = vec4(color, 1.0);
        }
      `,
      depthWrite: false,
      side: THREE.DoubleSide,
    }),
  );
  backdrop.position.set(0, 18, -28);
  backdrop.renderOrder = -10;
  scene.add(backdrop);

  const stars = new THREE.BufferGeometry();
  const starPositions: number[] = [];
  for (let i = 0; i < 180; i += 1) {
    starPositions.push((Math.random() - 0.5) * 120, -4 + Math.random() * 48, -20 - Math.random() * 55);
  }
  stars.setAttribute('position', new THREE.Float32BufferAttribute(starPositions, 3));
  const starField = new THREE.Points(stars, new THREE.PointsMaterial({ color: '#c7d7ff', size: 0.1, transparent: true, opacity: 0.86 }));
  scene.add(starField);

  const coloredStars = new THREE.BufferGeometry();
  const coloredPositions: number[] = [];
  for (let i = 0; i < 55; i += 1) {
    coloredPositions.push((Math.random() - 0.5) * 110, -2 + Math.random() * 42, -22 - Math.random() * 48);
  }
  coloredStars.setAttribute('position', new THREE.Float32BufferAttribute(coloredPositions, 3));
  scene.add(new THREE.Points(coloredStars, new THREE.PointsMaterial({ color: '#72ddff', size: 0.17, transparent: true, opacity: 0.75 })));
}

function createLighting(): void {
  scene.add(new THREE.HemisphereLight('#8aa1ff', '#071126', 1.35));

  const key = new THREE.DirectionalLight('#d9e2ff', 2.8);
  key.position.set(-18, 26, 18);
  key.castShadow = true;
  key.shadow.mapSize.set(2048, 2048);
  key.shadow.camera.left = -34;
  key.shadow.camera.right = 34;
  key.shadow.camera.top = 28;
  key.shadow.camera.bottom = -20;
  key.shadow.bias = -0.0003;
  scene.add(key);

  const rim = new THREE.DirectionalLight('#8e64ff', 2.5);
  rim.position.set(22, 17, -24);
  scene.add(rim);
}

function updateSelection(index: number, moveCamera = true): void {
  selectedIndex = index;
  const hero = heroes[index];
  selectedNumber.textContent = `${String(index + 1).padStart(2, '0')} / 04`;
  selectedHero.textContent = hero.name;
  selectedSpecies.textContent = hero.species;
  selectedRole.textContent = hero.role;
  selectHeroButton.textContent = `SELECT ${hero.name.toUpperCase()}`;
  document.documentElement.style.setProperty('--bay-accent', hero.accent);
  baySelector.querySelectorAll<HTMLButtonElement>('.bay-button').forEach((button, buttonIndex) => {
    button.classList.toggle('active', buttonIndex === index);
    button.setAttribute('aria-selected', String(buttonIndex === index));
  });

  if (moveCamera) {
    const x = (index - 1.5) * 10.8;
    cameraGoal.set(x, 8.8, 31);
    targetGoal.set(x, 3.6, 1.2);
    cameraTransitioning = true;
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

  if (cameraTransitioning) {
    camera.position.lerp(cameraGoal, 0.075);
    controls.target.lerp(targetGoal, 0.075);
    if (camera.position.distanceTo(cameraGoal) < 0.025 && controls.target.distanceTo(targetGoal) < 0.025) {
      cameraTransitioning = false;
    }
  }
  controls.update();

  bayGroups.forEach((group, index) => {
    const focused = index === selectedIndex;
    const desiredScale = focused ? 1.14 : 0.96;
    const desiredZ = bayBaseZ[index] + (focused ? 1.2 : 0);
    group.scale.setScalar(THREE.MathUtils.lerp(group.scale.x, desiredScale, 0.065));
    group.position.z = THREE.MathUtils.lerp(group.position.z, desiredZ, 0.065);
    group.rotation.y = THREE.MathUtils.lerp(group.rotation.y, 0, 0.065);
  });

  floaters.forEach(({ object, baseY, phase }) => {
    object.position.y = baseY + Math.sin(elapsed * 1.4 + phase) * 0.13;
    object.rotation.y += 0.0018;
  });

  bayLights.forEach((light, lightIndex) => {
    // Keep every hero fully visible. Selection is communicated through scale,
    // color, and camera focus rather than dimming the other characters.
    const targetIntensity = 7.5;
    light.intensity = THREE.MathUtils.lerp(light.intensity, targetIntensity, 0.08) + Math.sin(elapsed * 2.2 + lightIndex) * 0.18;
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

  const loaderManager = new THREE.LoadingManager();
  loaderManager.onProgress = (_url, loaded, total) => updateLoading(loaded, total);
  const loader = new GLTFLoader(loaderManager);

  const entries = [
    ...heroes.flatMap((hero) => [hero.astronaut, hero.mech, hero.ship]),
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

  updateSelection(0, true);
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

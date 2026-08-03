import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import * as SkeletonUtils from 'three/addons/utils/SkeletonUtils.js';
import './style.css';

type FormKind = 'astronaut' | 'mech' | 'ship';

interface HeroDefinition {
  id: string;
  name: string;
  species: string;
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
    accent: '#f5ae42',
    astronaut: assetUrl('Characters/GLTF/Astronaut_BarbaraTheBee.gltf'),
    mech: assetUrl('Characters/GLTF/Mech_BarbaraTheBee.gltf'),
    ship: assetUrl('Vehicles/GLTF/Spaceship_BarbaraTheBee.gltf'),
  },
  {
    id: 'flamingo',
    name: 'Fernando',
    species: 'The Flamingo',
    accent: '#ff7c9a',
    astronaut: assetUrl('Characters/GLTF/Astronaut_FernandoTheFlamingo.gltf'),
    mech: assetUrl('Characters/GLTF/Mech_FernandoTheFlamingo.gltf'),
    ship: assetUrl('Vehicles/GLTF/Spaceship_FernandoTheFlamingo.gltf'),
  },
  {
    id: 'frog',
    name: 'Finn',
    species: 'The Frog',
    accent: '#71f6da',
    astronaut: assetUrl('Characters/GLTF/Astronaut_FinnTheFrog.gltf'),
    mech: assetUrl('Characters/GLTF/Mech_FinnTheFrog.gltf'),
    ship: assetUrl('Vehicles/GLTF/Spaceship_FinnTheFrog.gltf'),
  },
  {
    id: 'red-panda',
    name: 'Rae',
    species: 'The Red Panda',
    accent: '#ff876b',
    astronaut: assetUrl('Characters/GLTF/Astronaut_RaeTheRedPanda.gltf'),
    mech: assetUrl('Characters/GLTF/Mech_RaeTheRedPanda.gltf'),
    ship: assetUrl('Vehicles/GLTF/Spaceship_RaeTheRedPanda.gltf'),
  },
];

const portraitPositions = ['0% 0%', '100% 0%', '0% 100%', '100% 100%'];

const canvas = document.querySelector<HTMLCanvasElement>('#scene')!;
const loadingScreen = document.querySelector<HTMLDivElement>('#loading-screen')!;
const loadingBar = document.querySelector<HTMLSpanElement>('#loading-bar')!;
const loadingStatus = document.querySelector<HTMLParagraphElement>('#loading-status')!;
const baySelector = document.querySelector<HTMLElement>('#bay-selector')!;
const selectedHero = document.querySelector<HTMLElement>('#selected-hero')!;
const selectedSpecies = document.querySelector<HTMLElement>('#selected-species')!;
const selectedNumber = document.querySelector<HTMLElement>('#selected-number')!;
const selectHeroButton = document.querySelector<HTMLButtonElement>('#select-hero-button')!;

if (!canvas || !loadingScreen || !loadingBar || !loadingStatus || !baySelector || !selectedHero || !selectedSpecies || !selectedNumber || !selectHeroButton) {
  throw new Error('The hero selection screen is missing a required element.');
}

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(31, window.innerWidth / window.innerHeight, 0.1, 100);
camera.position.set(0, 7.6, 31);
camera.lookAt(0, 4.1, 0);

const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, canvas, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setClearColor(0x000000, 0);
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.1;

const clock = new THREE.Clock();
const selectedHeroGroup = new THREE.Group();
const selectedHeroLight = new THREE.PointLight('#f5ae42', 11, 24, 2);
const floaters: Floater[] = [];
const loadedModels = new Map<string, THREE.Object3D | null>();
let selectedIndex = 0;
let selectionScale = 1;

scene.add(selectedHeroGroup);
selectedHeroGroup.position.y = 1.4;

const palette = {
  teal: new THREE.MeshStandardMaterial({ color: '#71f6da', emissive: '#2abda7', emissiveIntensity: 2.3, metalness: 0.2, roughness: 0.24 }),
};

function fitModel(model: THREE.Object3D, target: number, mode: 'height' | 'width'): THREE.Object3D {
  model.updateMatrixWorld(true);
  const initialBounds = new THREE.Box3().setFromObject(model);
  const initialSize = initialBounds.getSize(new THREE.Vector3());
  const dimension = mode === 'height' ? initialSize.y : Math.max(initialSize.x, initialSize.z);
  if (dimension > 0) model.scale.multiplyScalar(target / dimension);

  model.updateMatrixWorld(true);
  const finalBounds = new THREE.Box3().setFromObject(model);
  model.position.y -= finalBounds.min.y;
  model.traverse((child) => {
    if (child instanceof THREE.Mesh) child.castShadow = true;
  });
  return model;
}

function createFallbackModel(accent: string, height: number): THREE.Group {
  const fallback = new THREE.Group();
  const material = new THREE.MeshStandardMaterial({ color: accent, roughness: 0.35, metalness: 0.35 });
  const body = new THREE.Mesh(new THREE.OctahedronGeometry(height * 0.32, 1), material);
  body.position.y = height * 0.48;
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

function addModelToSelection(source: THREE.Object3D | null, hero: HeroDefinition, kind: FormKind): void {
  const fallbackSizes: Record<FormKind, number> = { astronaut: 4.1, mech: 6.0, ship: 6.2 };
  const target = source ? SkeletonUtils.clone(source) : createFallbackModel(hero.accent, fallbackSizes[kind]);
  const model = fitModel(target, kind === 'ship' ? 6.4 : fallbackSizes[kind], kind === 'ship' ? 'width' : 'height');

  if (kind === 'astronaut') {
    model.position.set(-2.25, 0.45, 4.5);
    model.rotation.y = 0;
  } else if (kind === 'mech') {
    model.position.set(2.25, 0.8, -0.4);
    model.rotation.y = 0;
  } else {
    model.position.set(0.15, 6.5, -5.8);
    model.rotation.y = Math.PI;
    floaters.push({ object: model, baseY: model.position.y, phase: selectedIndex * 0.8 });
  }

  selectedHeroGroup.add(model);
}

function showSelectedHero(index: number): void {
  const hero = heroes[index];
  selectedHeroGroup.clear();
  floaters.length = 0;
  selectedHeroGroup.add(selectedHeroLight);
  selectedHeroLight.color.set(hero.accent);
  selectedHeroLight.position.set(0, 6, 2);
  selectedHeroLight.intensity = 11;

  addModelToSelection(loadedModels.get(hero.astronaut) ?? null, hero, 'astronaut');
  addModelToSelection(loadedModels.get(hero.mech) ?? null, hero, 'mech');
  addModelToSelection(loadedModels.get(hero.ship) ?? null, hero, 'ship');
  selectionScale = 0.78;
  selectedHeroGroup.scale.setScalar(selectionScale);
}

function updateSelection(index: number): void {
  selectedIndex = index;
  const hero = heroes[index];
  selectedNumber.textContent = `${String(index + 1).padStart(2, '0')} / 04`;
  selectedHero.textContent = hero.name;
  selectedSpecies.textContent = hero.species;
  document.documentElement.style.setProperty('--bay-accent', hero.accent);
  baySelector.querySelectorAll<HTMLButtonElement>('.bay-button').forEach((button, buttonIndex) => {
    button.classList.toggle('active', buttonIndex === index);
    button.setAttribute('aria-selected', String(buttonIndex === index));
  });

  if (loadedModels.size > 0) showSelectedHero(index);
}

function buildBaySelector(): void {
  heroes.forEach((hero, index) => {
    const button = document.createElement('button');
    button.className = 'bay-button';
    button.type = 'button';
    button.style.setProperty('--bay-accent', hero.accent);
    button.setAttribute('aria-label', `Select ${hero.name} ${hero.species}`);
    button.setAttribute('aria-selected', String(index === 0));
    button.innerHTML = `
      <span class="hero-card-art" aria-hidden="true"></span>
      <span class="hero-card-info"><strong>${hero.name}</strong><small>${hero.species}</small></span>
    `;
    button.querySelector<HTMLElement>('.hero-card-art')?.style.setProperty('background-position', portraitPositions[index]);
    button.addEventListener('click', () => updateSelection(index));
    baySelector.appendChild(button);
  });
}

function updateLoading(loaded: number, total: number): void {
  const progress = total > 0 ? Math.round((loaded / total) * 100) : 0;
  loadingBar.style.width = `${progress}%`;
  loadingStatus.textContent = progress >= 100 ? 'Preparing crew selection' : `Loading crew assets · ${progress}%`;
}

function createLighting(): void {
  scene.add(new THREE.AmbientLight('#a7b8ff', 1.55));
  scene.add(new THREE.HemisphereLight('#b9c9ff', '#071126', 1.15));

  const key = new THREE.DirectionalLight('#eef2ff', 3.4);
  key.position.set(-14, 24, 18);
  scene.add(key);

  const rim = new THREE.DirectionalLight('#8f64ff', 3.2);
  rim.position.set(18, 16, -18);
  scene.add(rim);
}

function animate(): void {
  requestAnimationFrame(animate);
  const elapsed = clock.getElapsedTime();
  selectionScale = THREE.MathUtils.lerp(selectionScale, 0.9, 0.075);
  selectedHeroGroup.scale.setScalar(selectionScale);

  floaters.forEach(({ object, baseY, phase }) => {
    object.position.y = baseY + Math.sin(elapsed * 1.35 + phase) * 0.12;
    object.rotation.y += 0.0015;
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
  createLighting();

  const loaderManager = new THREE.LoadingManager();
  loaderManager.onProgress = (_url, loaded, total) => updateLoading(loaded, total);
  const loader = new GLTFLoader(loaderManager);
  const entries = heroes.flatMap((hero) => [hero.astronaut, hero.mech, hero.ship]);
  const uniqueEntries = [...new Set(entries)];
  const loadedResults = await Promise.all(uniqueEntries.map((url) => loadModel(loader, url)));
  uniqueEntries.forEach((url, index) => loadedModels.set(url, loadedResults[index]));

  updateSelection(0);
  selectHeroButton.addEventListener('click', () => {
    selectHeroButton.classList.add('is-selected');
    window.setTimeout(() => selectHeroButton.classList.remove('is-selected'), 900);
  });
  loadingBar.style.width = '100%';
  loadingStatus.textContent = 'Crew selection ready';
  window.setTimeout(() => loadingScreen.classList.add('loaded'), 350);
  window.addEventListener('resize', handleResize);
  animate();
}

init().catch((error) => {
  console.error(error);
  loadingStatus.textContent = 'Unable to initialize crew selection. Check the browser console.';
});

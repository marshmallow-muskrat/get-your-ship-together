import * as THREE from 'three';
import { OBJLoader } from 'three/addons/loaders/OBJLoader.js';
import { MTLLoader } from 'three/addons/loaders/MTLLoader.js';
import './base.css';
import { CHUNKS, CHUNK_SEQUENCE, CHUNK_WIDTH, LANE_MAX, LANE_MIN } from './base-chunks';

// Act II built entirely from the Ultimate Modular Sci-Fi kit. Nothing here is
// procedural terrain: the floor is kit tiles on a 2-unit grid and every piece
// snaps to it, which is what makes it read like the concept art.

const KIT = '/assets/space-packs/Ultimate Modular Sci-Fi - Feb 2021/OBJ';
const CELL = 2;

// Materials are named consistently across the kit, so the whole palette is
// controllable from one place.
const PALETTE: Record<string, { color: string; emissive?: string; intensity?: number; metalness?: number }> = {
  Main: { color: '#f2f4f7' },
  DarkGrey: { color: '#828a9c' },
  Accent: { color: '#f0a52a', metalness: 0.15 },
  DarkAccent: { color: '#a9661a' },
  Black: { color: '#20222b' },
  Light: { color: '#fff6dd', emissive: '#ffe6a8', intensity: 1.6 },
  Glass: { color: '#3fd8c8', emissive: '#1e9c92', intensity: 0.85 },
  Pipes: { color: '#8d94a5' },
};

const PIECES = {
  floor: 'FloorTile_Basic',
  floorAlt: 'FloorTile_Basic2',
  walkway: 'FloorTile_Empty',
  wall: 'Wall_1',
  wallAlt: 'Wall_2',
  wallPlain: 'Wall_5',
  door: 'DoorSingle_Wall_SideA',
  window: 'Window_Wall_SideA',
  column: 'Column_1',
  crate: 'Props_Crate',
  crateLong: 'Props_CrateLong',
  container: 'Props_ContainerFull',
  computer: 'Props_Computer',
  vessel: 'Props_Vessel_Tall',
  shelf: 'Props_Shelf',
  teleporter: 'Props_Teleporter_1',
  laser: 'Props_Laser',
  pod: 'Props_Pod',
} as const;

type PieceKey = keyof typeof PIECES;

const canvas = document.querySelector<HTMLCanvasElement>('#base-canvas')!;
const statusLabel = document.querySelector<HTMLElement>('#base-status')!;
const statsLabel = document.querySelector<HTMLElement>('#base-stats')!;

const scene = new THREE.Scene();
scene.background = new THREE.Color('#0f1a24');
scene.fog = new THREE.FogExp2('#12303a', 0.0016);

const camera = new THREE.OrthographicCamera(-20, 20, 20, -20, 0.1, 400);
const renderer = new THREE.WebGLRenderer({ antialias: true, canvas, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.NoToneMapping;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;

const root = new THREE.Group();
// Deliberately unrotated. The camera supplies the 45-degree yaw; rotating the
// grid as well cancels it out and you get a flat head-on view of the tiles.
scene.add(root);

const keys = new Set<string>();
const clock = new THREE.Clock();
const player = new THREE.Group();
let mapDepth = 0;

function applyPalette(object: THREE.Object3D): void {
  object.traverse((child) => {
    if (!(child instanceof THREE.Mesh)) return;
    child.castShadow = true;
    child.receiveShadow = true;
    const sources = Array.isArray(child.material) ? child.material : [child.material];
    const mapped = sources.map((source) => {
      const entry = PALETTE[source.name] ?? PALETTE.Main;
      return new THREE.MeshStandardMaterial({
        color: entry.color,
        emissive: entry.emissive ?? '#000000',
        emissiveIntensity: entry.intensity ?? 0,
        metalness: entry.metalness ?? 0.05,
        roughness: 0.62,
        flatShading: false,
      });
    });
    child.material = Array.isArray(child.material) ? mapped : mapped[0];
  });
}

function loadPiece(name: string): Promise<THREE.Object3D> {
  return new Promise((resolve, reject) => {
    const mtlLoader = new MTLLoader();
    mtlLoader.setPath(`${KIT}/`);
    mtlLoader.load(
      `${name}.mtl`,
      (materials) => {
        materials.preload();
        const objLoader = new OBJLoader();
        objLoader.setMaterials(materials);
        objLoader.setPath(`${KIT}/`);
        objLoader.load(
          `${name}.obj`,
          (object) => {
            applyPalette(object);
            resolve(object);
          },
          undefined,
          reject,
        );
      },
      undefined,
      reject,
    );
  });
}

const library = new Map<PieceKey, THREE.Object3D>();

// Kit walls stand 4.4 units — over two cells — which at this camera angle hides
// everything behind them. The concept art's barriers are low blocks, so wall
// pieces get squashed vertically.
const WALL_SCALE_Y = 0.62;
const WALL_KEYS = new Set<PieceKey>(['wall', 'wallAlt', 'wallPlain', 'door', 'window']);

function place(key: PieceKey, x: number, z: number, rotationY = 0, yOffset = 0): void {
  const source = library.get(key);
  if (!source) return;
  const clone = source.clone(true);
  clone.position.set(x, yOffset, z);
  clone.rotation.y = rotationY;
  if (WALL_KEYS.has(key)) clone.scale.y = WALL_SCALE_Y;
  if (key === 'column') clone.scale.y = 0.62;
  root.add(clone);
}

// Walls are 4 units wide — two cells — so a run gets a segment on every second
// cell. Orientation for doors and windows follows whichever run they sit in.
function isWall(cell: string): boolean {
  return cell === '-' || cell === '|' || cell === 'D' || cell === 'W';
}

function buildMap(): { pieces: number } {
  const rows: string[] = [];
  for (const index of CHUNK_SEQUENCE) rows.push(...CHUNKS[index]);
  mapDepth = rows.length * CELL;

  let pieces = 0;
  const originX = -(CHUNK_WIDTH * CELL) / 2 + CELL / 2;

  for (let row = 0; row < rows.length; row += 1) {
    for (let column = 0; column < CHUNK_WIDTH; column += 1) {
      const cell = rows[row][column];
      if (cell === ' ') continue;

      const x = originX + column * CELL;
      const z = -row * CELL;

      // Floor under everything that is not a void. The walkway gets broken up
      // with plated tiles — sixteen units of one tile reads as corrugated road.
      let floorKey: PieceKey;
      if (cell === '=') {
        const edge = column === LANE_MIN || column === LANE_MAX;
        floorKey = edge || (row * 3 + column) % 5 === 0 ? 'floorAlt' : 'walkway';
      } else {
        floorKey = (row + column) % 7 === 0 ? 'floorAlt' : 'floor';
      }
      place(floorKey, x, z, cell === '=' ? ((row + column) % 2) * (Math.PI / 2) : 0);
      pieces += 1;

      if (isWall(cell)) {
        const left = rows[row][column - 1] ?? ' ';
        const right = rows[row][column + 1] ?? ' ';
        const horizontal = isWall(left) || isWall(right);
        // One segment per two cells, anchored on even indices along the run.
        const anchored = horizontal ? column % 2 === 0 : row % 2 === 0;
        if (anchored) {
          const key: PieceKey =
            cell === 'D' ? 'door' : cell === 'W' ? 'window' : (row + column) % 3 === 0 ? 'wallAlt' : 'wall';
          const offset = CELL / 2;
          place(
            key,
            horizontal ? x + offset : x,
            horizontal ? z : z - offset,
            horizontal ? 0 : Math.PI / 2,
          );
          pieces += 1;
        }
        continue;
      }

      const props: Partial<Record<string, PieceKey>> = {
        o: 'column',
        c: 'crate',
        k: 'crateLong',
        C: 'container',
        p: 'computer',
        v: 'vessel',
        S: 'shelf',
        T: 'teleporter',
        L: 'laser',
        P: 'pod',
      };
      const propKey = props[cell];
      if (propKey) {
        place(propKey, x, z, ((row * 7 + column * 13) % 4) * (Math.PI / 2), 0.1);
        pieces += 1;
      }
    }
  }

  return { pieces };
}

function addLighting(): THREE.DirectionalLight {
  scene.add(new THREE.HemisphereLight('#cfe6ff', '#16323c', 0.75));
  scene.add(new THREE.AmbientLight('#ffffff', 0.22));

  const key = new THREE.DirectionalLight('#fff4de', 1.75);
  key.position.set(-40, 60, 30);
  key.castShadow = true;
  key.shadow.mapSize.set(2048, 2048);
  key.shadow.camera.left = -40;
  key.shadow.camera.right = 40;
  key.shadow.camera.top = 40;
  key.shadow.camera.bottom = -40;
  key.shadow.camera.near = 1;
  key.shadow.camera.far = 200;
  key.shadow.bias = -0.0009;
  key.shadow.normalBias = 0.03;
  scene.add(key);
  scene.add(key.target);

  const fill = new THREE.DirectionalLight('#5fd6d0', 0.28);
  fill.position.set(35, 20, -40);
  scene.add(fill);

  return key;
}

function buildPlayer(): void {
  const body = new THREE.Mesh(
    new THREE.CapsuleGeometry(0.34, 0.7, 6, 12),
    new THREE.MeshStandardMaterial({ color: '#f4d98a', roughness: 0.5, metalness: 0.1 }),
  );
  body.position.y = 0.85;
  body.castShadow = true;
  player.add(body);

  const visor = new THREE.Mesh(
    new THREE.SphereGeometry(0.2, 16, 12),
    new THREE.MeshStandardMaterial({ color: '#7ce7ff', emissive: '#2aa5c9', emissiveIntensity: 1.1, roughness: 0.25 }),
  );
  visor.position.set(0, 1.32, 0.12);
  player.add(visor);
  root.add(player);
}

const laneMinX = -(CHUNK_WIDTH * CELL) / 2 + CELL / 2 + LANE_MIN * CELL;
const laneMaxX = -(CHUNK_WIDTH * CELL) / 2 + CELL / 2 + LANE_MAX * CELL;

// Yaw 0, pitch ~55 degrees. A 45-degree yaw would give a truer isometric look,
// but then the corridor projects diagonally across a portrait frame and wastes
// most of it — you cannot have both on a square grid.
const cameraOffset = new THREE.Vector3(0, 44, 31);
const KEY_LIGHT_OFFSET = new THREE.Vector3(-40, 60, 30);
const desiredLook = new THREE.Vector3();
const desiredCamera = new THREE.Vector3();

function resize(): void {
  const height = window.innerHeight;
  const width = Math.min(window.innerWidth, Math.round(height * (9 / 16)));
  renderer.setSize(width, height);
  // Wide enough to hold the full 24-cell map width in frame.
  const visibleHeight = 82;
  const aspect = width / Math.max(1, height);
  camera.left = -(visibleHeight * aspect) / 2;
  camera.right = (visibleHeight * aspect) / 2;
  camera.top = visibleHeight / 2;
  camera.bottom = -visibleHeight / 2;
  camera.updateProjectionMatrix();
}

let keyLight: THREE.DirectionalLight;

function animate(): void {
  requestAnimationFrame(animate);
  const delta = Math.min(clock.getDelta(), 0.05);

  const horizontal =
    Number(keys.has('KeyD') || keys.has('ArrowRight')) - Number(keys.has('KeyA') || keys.has('ArrowLeft'));
  const vertical =
    Number(keys.has('KeyS') || keys.has('ArrowDown')) - Number(keys.has('KeyW') || keys.has('ArrowUp'));
  if (horizontal !== 0 || vertical !== 0) {
    const move = new THREE.Vector3(horizontal, 0, vertical).normalize().multiplyScalar(delta * 9);
    player.position.x = THREE.MathUtils.clamp(player.position.x + move.x, laneMinX, laneMaxX);
    player.position.z = THREE.MathUtils.clamp(player.position.z + move.z, -mapDepth + 30, -50);
    const heading = Math.atan2(move.x, move.z);
    let turn = heading - player.rotation.y;
    turn = Math.atan2(Math.sin(turn), Math.cos(turn));
    player.rotation.y += turn * 0.25;
  }

  desiredLook.set(player.position.x, 0, player.position.z - 10);
  root.localToWorld(desiredLook);
  desiredCamera.copy(desiredLook).add(cameraOffset);
  camera.position.lerp(desiredCamera, 1 - Math.pow(0.002, delta));
  camera.lookAt(desiredLook);

  keyLight.target.position.copy(desiredLook);
  keyLight.position.copy(desiredLook).add(KEY_LIGHT_OFFSET);
  keyLight.target.updateMatrixWorld();

  renderer.render(scene, camera);
  const info = renderer.info.render;
  statsLabel.textContent = `${info.calls} calls · ${(info.triangles / 1000).toFixed(0)}k tris`;
}

window.addEventListener('keydown', (event) => {
  if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'KeyW', 'KeyA', 'KeyS', 'KeyD'].includes(event.code)) {
    event.preventDefault();
  }
  keys.add(event.code);
});
window.addEventListener('keyup', (event) => keys.delete(event.code));
window.addEventListener('blur', () => keys.clear());
window.addEventListener('resize', resize);

async function init(): Promise<void> {
  keyLight = addLighting();
  buildPlayer();

  const entries = Object.entries(PIECES) as [PieceKey, string][];
  let loaded = 0;
  await Promise.all(
    entries.map(async ([key, name]) => {
      try {
        library.set(key, await loadPiece(name));
      } catch {
        console.warn(`Could not load kit piece: ${name}`);
      }
      loaded += 1;
      statusLabel.textContent = `Loading kit · ${loaded}/${entries.length}`;
    }),
  );

  const { pieces } = buildMap();
  statusLabel.textContent = `ACT II · ${pieces} kit pieces`;

  // Start a little way in so there is base behind the player, not empty void.
  player.position.set(0, 0, -100);
  resize();
  animate();
}

init().catch((error) => {
  console.error(error);
  statusLabel.textContent = 'Failed to build the base — check the console.';
});

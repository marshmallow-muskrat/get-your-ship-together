import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import type { HeroId } from '../../content/heroes';
import { HEROES } from '../../content/heroes';
import { AssetLibrary } from '../../assets/AssetLibrary';
import { AudioBus } from '../../audio/AudioBus';
import { SURVIVOR, type SurvivorFixture } from './survivorContent';
import { createSurvivorState, type SurvivorState } from './survivorState';
import { EMPTY_SURVIVOR_INPUT, stepSurvivor, surroundPlayer, type SurvivorInput } from './survivorSim';
import { SurvivorArena } from './survivorArena';
import { SurvivorRenderer } from './survivorRender';
import { SurvivorHud } from './survivorHud';

export type SurvivorHandlers = {
  onReturnToCrew: () => void;
};

/**
 * Isolated survivor runtime — own loop, state, camera, HUD.
 * Does not share campaign GameState or GystRuntime simulation.
 */
export class SurvivorMode {
  private readonly host: HTMLElement;
  private readonly canvas: HTMLCanvasElement;
  private readonly heroId: HeroId;
  private readonly fixture: SurvivorFixture;
  private readonly handlers: SurvivorHandlers;

  private renderer: THREE.WebGLRenderer | null = null;
  private scene: THREE.Scene | null = null;
  private camera: THREE.OrthographicCamera | null = null;
  private assets = new AssetLibrary();
  private audio = new AudioBus();
  private arena: SurvivorArena | null = null;
  private actors: SurvivorRenderer | null = null;
  private hud: SurvivorHud | null = null;
  private state: SurvivorState | null = null;

  private accumulator = 0;
  private lastTime = 0;
  private raf = 0;
  private disposed = false;
  private keys = new Set<string>();
  private edge = { mech: false, ship: false, repulsor: false, pause: false, mute: false };
  private choiceIndex: number | null = null;
  private frameSamples: number[] = [];
  private showMetrics = false;

  private onResize = (): void => this.resize();
  private onKeyDown = (e: KeyboardEvent): void => {
    const k = e.key.toLowerCase();
    if ([' ', 'arrowup', 'arrowdown', 'arrowleft', 'arrowright', 'escape'].includes(k)) e.preventDefault();
    if (!e.repeat) {
      if (k === 'r') this.edge.mech = true;
      if (k === 'e') this.edge.ship = true;
      if (k === 'q') this.edge.repulsor = true;
      if (k === 'escape') this.edge.pause = true;
      if (k === 'm') this.edge.mute = true;
      if (k === '1' || k === '2' || k === '3') this.choiceIndex = Number(k) - 1;
      if (k === 'f3') this.showMetrics = !this.showMetrics;
    }
    this.keys.add(k);
  };
  private onKeyUp = (e: KeyboardEvent): void => {
    this.keys.delete(e.key.toLowerCase());
  };

  constructor(opts: {
    heroId: HeroId;
    host: HTMLElement;
    canvas: HTMLCanvasElement;
    fixture?: SurvivorFixture;
    handlers: SurvivorHandlers;
  }) {
    this.heroId = opts.heroId;
    this.host = opts.host;
    this.canvas = opts.canvas;
    this.fixture = opts.fixture ?? null;
    this.handlers = opts.handlers;
  }

  async start(): Promise<void> {
    if (this.disposed) return;

    this.renderer = new THREE.WebGLRenderer({
      canvas: this.canvas,
      antialias: true,
      powerPreference: 'high-performance',
    });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 0.82;
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;

    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color('#060a12');
    this.scene.fog = new THREE.FogExp2('#070c14', 0.01);

    const pmrem = new THREE.PMREMGenerator(this.renderer);
    const room = new RoomEnvironment();
    this.scene.environment = pmrem.fromScene(room, 0.04).texture;
    room.dispose();
    pmrem.dispose();

    this.camera = SurvivorArena.createFixedCamera(window.innerWidth / Math.max(1, window.innerHeight));
    this.arena = new SurvivorArena();
    this.actors = new SurvivorRenderer(this.assets);

    const shipUrl = HEROES[this.heroId].shipUrl;
    await Promise.all([
      this.assets.preloadHero(this.heroId),
      this.assets.preloadCombat(),
      this.assets.loadUrl(shipUrl, 1.4),
      this.arena.build().then((g) => this.scene?.add(g)),
    ]);
    if (this.disposed) return;

    this.scene.add(this.actors.root);
    await this.actors.setupPlayer(this.heroId);

    this.state = createSurvivorState(this.heroId, this.fixture);
    this.applyFixtureSpawn(this.state);

    this.hud = new SurvivorHud(this.host, {
      onRestart: () => this.restart(),
      onCrew: () => this.handlers.onReturnToCrew(),
      onChoice: (i) => {
        this.choiceIndex = i;
      },
      projectWorld: (x, z) => this.projectToScreen(x, z),
    });

    window.addEventListener('keydown', this.onKeyDown);
    window.addEventListener('keyup', this.onKeyUp);
    window.addEventListener('resize', this.onResize);
    this.canvas.classList.add('game-mode');
    this.resize();

    this.lastTime = performance.now();
    this.raf = requestAnimationFrame((t) => this.frame(t));
  }

  private applyFixtureSpawn(state: SurvivorState): void {
    if (this.fixture === 'survivor-levelup') {
      state.xp = state.xpNext;
    } else if (this.fixture === 'survivor-repulsor') {
      state.player.repulsorCd = 0;
      surroundPlayer(state, 14, 3.4);
    } else if (this.fixture === 'survivor-ship') {
      state.player.shipCd = 0;
      surroundPlayer(state, 10, 4.5);
    } else if (this.fixture === 'survivor-damage') {
      surroundPlayer(state, 12, 3.8);
    } else if (this.fixture === 'survivor-mech') {
      state.player.mechCharge = 1;
    }
  }

  private projectToScreen(x: number, z: number): { x: number; y: number } | null {
    if (!this.camera || !this.renderer) return null;
    const v = new THREE.Vector3(x, 1.1, z);
    v.project(this.camera);
    const w = this.renderer.domElement.clientWidth;
    const h = this.renderer.domElement.clientHeight;
    return {
      x: (v.x * 0.5 + 0.5) * w,
      y: (-v.y * 0.5 + 0.5) * h,
    };
  }

  private restart(): void {
    this.state = createSurvivorState(this.heroId, this.fixture);
    this.applyFixtureSpawn(this.state);
    this.accumulator = 0;
    this.choiceIndex = null;
    this.edge = { mech: false, ship: false, repulsor: false, pause: false, mute: false };
  }

  private resize(): void {
    if (!this.renderer || !this.camera) return;
    const w = window.innerWidth;
    const h = window.innerHeight;
    this.renderer.setSize(w, h, false);
    this.canvas.style.width = '100%';
    this.canvas.style.height = '100%';
    SurvivorArena.resizeFixedCamera(this.camera, w, h);
  }

  private sampleInput(): SurvivorInput {
    let sx = 0;
    let sy = 0;
    if (this.keys.has('a') || this.keys.has('arrowleft')) sx -= 1;
    if (this.keys.has('d') || this.keys.has('arrowright')) sx += 1;
    if (this.keys.has('w') || this.keys.has('arrowup')) sy += 1;
    if (this.keys.has('s') || this.keys.has('arrowdown')) sy -= 1;

    const frame: SurvivorInput = {
      ...EMPTY_SURVIVOR_INPUT,
      moveX: sx,
      moveY: sy,
      mechPressed: this.edge.mech,
      shipPressed: this.edge.ship,
      repulsorPressed: this.edge.repulsor,
      pausePressed: this.edge.pause,
      mutePressed: this.edge.mute,
      choiceIndex: this.choiceIndex,
    };
    this.edge.mech = false;
    this.edge.ship = false;
    this.edge.repulsor = false;
    this.edge.pause = false;
    this.edge.mute = false;
    return frame;
  }

  private frame(now: number): void {
    if (this.disposed || !this.renderer || !this.scene || !this.camera || !this.state) return;
    this.raf = requestAnimationFrame((t) => this.frame(t));

    const rawDt = Math.min(0.05, (now - this.lastTime) / 1000);
    this.lastTime = now;
    this.frameSamples.push(rawDt);
    if (this.frameSamples.length > 30) this.frameSamples.shift();
    const avg = this.frameSamples.reduce((a, b) => a + b, 0) / this.frameSamples.length;
    this.state.metrics.frameMs = avg * 1000;
    this.state.metrics.fps = avg > 0 ? 1 / avg : 60;

    const input = this.sampleInput();
    // While level-up modal is open, do not consume Q/E/R edges into the sim
    if (this.state.phase === 'levelup') {
      input.mechPressed = false;
      input.shipPressed = false;
      input.repulsorPressed = false;
    }

    this.accumulator += rawDt;
    let steps = 0;
    while (this.accumulator >= SURVIVOR.fixedDt && steps < 5) {
      stepSurvivor(this.state, input, SURVIVOR.fixedDt);
      input.mechPressed = false;
      input.shipPressed = false;
      input.repulsorPressed = false;
      input.pausePressed = false;
      input.mutePressed = false;
      input.choiceIndex = null;
      this.accumulator -= SURVIVOR.fixedDt;
      steps += 1;
    }
    if (this.choiceIndex != null && this.state.phase !== 'levelup') {
      this.choiceIndex = null;
    }

    if (this.fixture === 'survivor-levelup' && this.state.phase === 'playing' && this.state.level === 1) {
      this.state.xp = this.state.xpNext;
    }

    this.actors?.sync(this.state, rawDt);
    SurvivorArena.followPlayer(this.camera, this.state.player.x, this.state.player.z);
    this.hud?.publish(this.state, this.showMetrics || this.fixture === 'survivor-horde');
    this.renderer.render(this.scene, this.camera);
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    cancelAnimationFrame(this.raf);
    window.removeEventListener('keydown', this.onKeyDown);
    window.removeEventListener('keyup', this.onKeyUp);
    window.removeEventListener('resize', this.onResize);
    this.canvas.classList.remove('game-mode');
    this.hud?.dispose();
    this.actors?.dispose();
    this.arena?.dispose();
    this.audio.dispose();
    this.assets.dispose();
    this.scene?.clear();
    this.renderer?.dispose();
    this.renderer = null;
    this.scene = null;
    this.state = null;
  }
}

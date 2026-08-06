import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import type { HeroId } from '../../content/heroes';
import { HEROES } from '../../content/heroes';
import { AssetLibrary } from '../../assets/AssetLibrary';
import { AudioBus } from '../../audio/AudioBus';
import { BOSS_DEFS, SURVIVOR, type SurvivorFixture } from './survivorContent';
import { createSurvivorState, type SurvivorState } from './survivorState';
import {
  EMPTY_SURVIVOR_INPUT,
  clearShipHazards,
  stepSurvivor,
  surroundPlayer,
  type SurvivorInput,
} from './survivorSim';
import { SurvivorArena } from './survivorArena';
import { SurvivorRenderer } from './survivorRender';
import { SurvivorHud } from './survivorHud';
import {
  assignKeybind,
  clampUiScale,
  findActionForCode,
  formatKeyCode,
  loadSettings,
  resetKeybinds,
  saveSettings,
  type ActionId,
  type KeybindMap,
} from './survivorKeybinds';

export type SurvivorHandlers = {
  onReturnToCrew: () => void;
};

/**
 * Containment Protocol runtime — own loop, state, camera, HUD.
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
  /** Physical key codes currently held */
  private codesDown = new Set<string>();
  private edge = { mech: false, ship: false, repulsor: false, dodge: false, pause: false, mute: false };
  private choiceIndex: number | null = null;
  private frameSamples: number[] = [];
  private showMetrics = false;

  private keybinds: KeybindMap = loadSettings().keybinds;
  private uiScale = loadSettings().uiScale;
  private settingsOpen = false;
  private rebindingAction: ActionId | null = null;
  /** Block gameplay input while rebinding or settings open */
  private inputBlocked = false;

  private onResize = (): void => this.resize();
  private resolveCode(e: KeyboardEvent): string {
    if (e.code && e.code !== 'Unidentified') return e.code;
    const k = e.key;
    if (k === 'Escape') return 'Escape';
    if (k === ' ') return 'Space';
    if (k === 'ArrowUp' || k === 'ArrowDown' || k === 'ArrowLeft' || k === 'ArrowRight') return k;
    if (k.length === 1 && /[a-zA-Z]/.test(k)) return `Key${k.toUpperCase()}`;
    if (k.length === 1 && /[0-9]/.test(k)) return `Digit${k}`;
    return e.code || k;
  }

  private onKeyDown = (e: KeyboardEvent): void => {
    const code = this.resolveCode(e);
    if (this.rebindingAction) {
      e.preventDefault();
      e.stopPropagation();
      if (code === 'Escape' && this.rebindingAction !== 'pause') {
        this.rebindingAction = null;
        this.hud?.setRebinding(null);
        return;
      }
      // Capture new bind (swap on conflict)
      this.keybinds = assignKeybind(this.keybinds, this.rebindingAction, code);
      saveSettings({ version: 1, keybinds: this.keybinds, uiScale: this.uiScale });
      this.rebindingAction = null;
      this.hud?.setRebinding(null);
      this.hud?.refreshKeybindLabels(this.keybinds);
      return;
    }

    if (this.settingsOpen) {
      // Escape closes settings → stay paused
      if (code === this.keybinds.pause || code === 'Escape') {
        e.preventDefault();
        this.closeSettings();
      }
      return;
    }

    // Prevent default for movement / pause
    if (
      code === this.keybinds.moveUp ||
      code === this.keybinds.moveDown ||
      code === this.keybinds.moveLeft ||
      code === this.keybinds.moveRight ||
      code === this.keybinds.pause ||
      code === 'Space'
    ) {
      e.preventDefault();
    }

    if (!e.repeat) {
      const action = findActionForCode(this.keybinds, code);
      if (action === 'dodge') this.edge.dodge = true;
      if (action === 'repulsor') this.edge.repulsor = true;
      if (action === 'ship') this.edge.ship = true;
      if (action === 'mech') this.edge.mech = true;
      if (action === 'pause') this.edge.pause = true;
      if (action === 'mute') this.edge.mute = true;
      if (action === 'choice1') this.choiceIndex = 0;
      if (action === 'choice2') this.choiceIndex = 1;
      if (action === 'choice3') this.choiceIndex = 2;
      if (code === 'F3') this.showMetrics = !this.showMetrics;
    }
    this.codesDown.add(code);
  };
  private onKeyUp = (e: KeyboardEvent): void => {
    this.codesDown.delete(this.resolveCode(e));
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
    this.keybinds = loadSettings().keybinds;

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
      ...BOSS_DEFS.map((b) => this.assets.loadUrl(b.url, b.targetHeight)),
      this.arena.build().then((g) => this.scene?.add(g)),
    ]);
    if (this.disposed) return;

    this.scene.add(this.actors.root);
    await this.actors.setupPlayer(this.heroId);

    this.state = createSurvivorState(this.heroId, this.fixture);
    this.applyFixtureSpawn(this.state);

    this.hud = new SurvivorHud(this.host, {
      onRestart: () => this.confirmRestart(),
      onCrew: () => this.confirmCrew(),
      onChoice: (i) => {
        this.choiceIndex = i;
      },
      onResume: () => this.resumeFromPause(),
      onOpenSettings: () => this.openSettings(),
      onCloseSettings: () => this.closeSettings(),
      onStartRebind: (action) => {
        this.rebindingAction = action;
        this.hud?.setRebinding(action);
      },
      onResetKeybinds: () => {
        this.keybinds = resetKeybinds();
        this.uiScale = 1;
        saveSettings({ version: 1, keybinds: this.keybinds, uiScale: this.uiScale });
        this.applyUiScale(1);
        this.hud?.setUiScale(1);
        this.hud?.refreshKeybindLabels(this.keybinds);
      },
      onUiScale: (s: number) => this.setUiScale(s),
      onOpenLeaderboard: () => this.hud?.setLeaderboardOpen(true),

      getKeybinds: () => this.keybinds,
      projectWorld: (x, z) => this.projectToScreen(x, z),
    });
    this.hud.refreshKeybindLabels(this.keybinds);
    this.applyUiScale(this.uiScale);
    this.hud.setUiScale(this.uiScale);

    window.addEventListener('keydown', this.onKeyDown);
    window.addEventListener('keyup', this.onKeyUp);
    window.addEventListener('resize', this.onResize);
    this.canvas.classList.add('game-mode');
    this.resize();

    this.lastTime = performance.now();
    this.raf = requestAnimationFrame((t) => this.frame(t));
  }

  private confirmRestart(): void {
    if (!this.state) return;
    if (this.state.phase === 'playing' || this.state.phase === 'paused' || this.state.phase === 'levelup') {
      if (!window.confirm('Restart this run? Progress will be lost.')) return;
    }
    this.restart();
  }

  private confirmCrew(): void {
    if (this.state && (this.state.phase === 'playing' || this.state.phase === 'paused' || this.state.phase === 'levelup')) {
      if (!window.confirm('Return to crew select? Progress will be lost.')) return;
    }
    this.handlers.onReturnToCrew();
  }

  private openSettings(): void {
    if (!this.state) return;
    if (this.state.phase === 'levelup') return; // don't cover level-up
    if (this.state.phase === 'playing') {
      this.state.phase = 'paused';
    }
    this.settingsOpen = true;
    this.inputBlocked = true;
    this.rebindingAction = null;
    this.hud?.setSettingsOpen(true);
    this.hud?.refreshKeybindLabels(this.keybinds);
  }

  private closeSettings(): void {
    this.settingsOpen = false;
    this.rebindingAction = null;
    this.inputBlocked = false;
    this.hud?.setSettingsOpen(false);
    this.hud?.setRebinding(null);
    // remain paused
  }

  private resumeFromPause(): void {
    if (!this.state) return;
    this.settingsOpen = false;
    this.rebindingAction = null;
    this.inputBlocked = false;
    this.hud?.setSettingsOpen(false);
    if (this.state.phase === 'paused') this.state.phase = 'playing';
  }

  private applyFixtureSpawn(state: SurvivorState): void {
    if (this.fixture === 'survivor-levelup') {
      state.xp = state.xpNext;
    } else if (this.fixture === 'survivor-repulsor') {
      state.player.repulsorCd = 0;
      // Place enemies across new large radius
      surroundPlayer(state, 10, 5);
      surroundPlayer(state, 8, 11);
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
    if (this.state) clearShipHazards(this.state);
    this.state = createSurvivorState(this.heroId, this.fixture);
    this.applyFixtureSpawn(this.state);
    this.accumulator = 0;
    this.choiceIndex = null;
    this.edge = { mech: false, ship: false, repulsor: false, dodge: false, pause: false, mute: false };
    this.settingsOpen = false;
    this.rebindingAction = null;
    this.inputBlocked = false;
    this.hud?.setSettingsOpen(false);
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
    if (this.inputBlocked || this.settingsOpen) {
      return { ...EMPTY_SURVIVOR_INPUT };
    }

    let sx = 0;
    let sy = 0;
    if (this.codesDown.has(this.keybinds.moveLeft)) sx -= 1;
    if (this.codesDown.has(this.keybinds.moveRight)) sx += 1;
    if (this.codesDown.has(this.keybinds.moveUp)) sy += 1;
    if (this.codesDown.has(this.keybinds.moveDown)) sy -= 1;

    const frame: SurvivorInput = {
      ...EMPTY_SURVIVOR_INPUT,
      moveX: sx,
      moveY: sy,
      mechPressed: this.edge.mech,
      shipPressed: this.edge.ship,
      repulsorPressed: this.edge.repulsor,
      dodgePressed: this.edge.dodge,
      pausePressed: this.edge.pause,
      mutePressed: this.edge.mute,
      choiceIndex: this.choiceIndex,
    };
    this.edge.mech = false;
    this.edge.ship = false;
    this.edge.repulsor = false;
    this.edge.dodge = false;
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
    // While level-up modal is open, block abilities/pause so edges don't leak
    if (this.state.phase === 'levelup') {
      input.mechPressed = false;
      input.shipPressed = false;
      input.repulsorPressed = false;
      input.dodgePressed = false;
      input.pausePressed = false;
    }
    if (this.settingsOpen) {
      input.mechPressed = false;
      input.shipPressed = false;
      input.repulsorPressed = false;
      input.dodgePressed = false;
      input.pausePressed = false;
      input.moveX = 0;
      input.moveY = 0;
    }

    this.accumulator += rawDt;
    let steps = 0;
    while (this.accumulator >= SURVIVOR.fixedDt && steps < 5) {
      stepSurvivor(this.state, input, SURVIVOR.fixedDt);
      input.mechPressed = false;
      input.shipPressed = false;
      input.repulsorPressed = false;
      input.dodgePressed = false;
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
    this.hud?.publish(this.state, this.showMetrics || this.fixture === 'survivor-horde', {
      settingsOpen: this.settingsOpen,
      rebinding: this.rebindingAction,
      keybinds: this.keybinds,
    });
    this.renderer.render(this.scene, this.camera);
  }

  private applyUiScale(scale: number): void {
    document.documentElement.style.setProperty('--ui-scale', String(scale));
  }

  setUiScale(scale: number): void {
    this.uiScale = clampUiScale(scale);
    this.applyUiScale(this.uiScale);
    saveSettings({ version: 1, keybinds: this.keybinds, uiScale: this.uiScale });
    this.hud?.setUiScale(this.uiScale);
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

// re-export for tests/docs
export { formatKeyCode };

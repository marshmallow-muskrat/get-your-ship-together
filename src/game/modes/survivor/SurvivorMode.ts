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
  forceStartProtocol,
  stepSurvivor,
  tryShip,
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
  UPGRADE_NUMBERS_DEFAULT,
  resetKeybinds,
  saveSettings,
  type ActionId,
  type KeybindMap,
} from './survivorKeybinds';
import {
  focusLossTransition,
  shouldCloseRunReport,
  shouldHandleVisibility,
} from './survivorFocus';

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
  private upgradeNumbers = loadSettings().upgradeNumbers;
  private settingsOpen = false;
  private rebindingAction: ActionId | null = null;
  /** Block gameplay input while rebinding or settings open */
  private inputBlocked = false;
  private listenersBound = false;

  private onResize = (): void => this.resize();

  /** Shared blur / page-hidden handling. Never auto-resumes. */
  private handleFocusLoss(): void {
    // Held keys and one-shot edges must never survive a focus change.
    this.codesDown.clear();
    this.edge = { mech: false, ship: false, repulsor: false, dodge: false, pause: false, mute: false };

    const next = focusLossTransition({
      phase: this.state?.phase ?? null,
      settingsOpen: this.settingsOpen,
      rebinding: this.rebindingAction,
      choiceIndex: this.choiceIndex,
      inputBlocked: this.inputBlocked,
    });

    const hadCapture = this.rebindingAction !== null;
    this.rebindingAction = next.rebinding;
    this.choiceIndex = next.choiceIndex;
    this.inputBlocked = next.inputBlocked;
    if (hadCapture) this.hud?.setRebinding(null);
    if (this.state && next.phase) this.state.phase = next.phase;
  }

  private onBlur = (): void => this.handleFocusLoss();

  private onVisibilityChange = (): void => {
    // Acts only on going hidden — becoming visible again is not a focus event.
    if (!shouldHandleVisibility(document.hidden === true)) return;
    this.handleFocusLoss();
  };
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
      this.persistSettings();
      this.rebindingAction = null;
      this.hud?.setRebinding(null);
      this.hud?.refreshKeybindLabels(this.keybinds);
      return;
    }

    // A top-level report owns Escape before the pause action. Closing it reveals
    // the same paused/defeat screen beneath it and consumes this key press so the
    // simulation can never resume behind an open report.
    if (shouldCloseRunReport(this.hud?.isStatsOpen() ?? false, code, this.keybinds.pause)) {
      e.preventDefault();
      e.stopPropagation();
      this.hud?.setStatsOpen(false);
      this.codesDown.delete(code);
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
      // Cleanup Crew can arrive from any Mega Cache, and the renderer clones its
      // models synchronously, so the other three heroes must already be cached.
      this.assets.preloadCleanupCrew(this.heroId),
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
        this.upgradeNumbers = UPGRADE_NUMBERS_DEFAULT;
        this.persistSettings();
        this.applyUiScale(1);
        this.hud?.setUiScale(1);
        this.hud?.setUpgradeNumbers(this.upgradeNumbers);
        this.hud?.refreshKeybindLabels(this.keybinds);
      },
      onUiScale: (s: number) => this.setUiScale(s),
      onUpgradeNumbers: (on: boolean) => this.setUpgradeNumbers(on),
      onOpenLeaderboard: () => this.hud?.setLeaderboardOpen(true),

      getKeybinds: () => this.keybinds,
      projectWorld: (x, z) => this.projectToScreen(x, z),
    });
    this.hud.refreshKeybindLabels(this.keybinds);
    this.applyUiScale(this.uiScale);
    this.hud.setUiScale(this.uiScale);
    this.hud.setUpgradeNumbers(this.upgradeNumbers);

    this.bindWindowListeners();
    this.canvas.classList.add('game-mode');
    this.resize();

    this.lastTime = performance.now();
    this.raf = requestAnimationFrame((t) => this.frame(t));
  }

  /** Idempotent: re-binding after a remount can never leave duplicate listeners. */
  private bindWindowListeners(): void {
    this.unbindWindowListeners();
    window.addEventListener('keydown', this.onKeyDown);
    window.addEventListener('keyup', this.onKeyUp);
    window.addEventListener('resize', this.onResize);
    window.addEventListener('blur', this.onBlur);
    document.addEventListener('visibilitychange', this.onVisibilityChange);
    this.listenersBound = true;
  }

  private unbindWindowListeners(): void {
    if (!this.listenersBound) return;
    window.removeEventListener('keydown', this.onKeyDown);
    window.removeEventListener('keyup', this.onKeyUp);
    window.removeEventListener('resize', this.onResize);
    window.removeEventListener('blur', this.onBlur);
    document.removeEventListener('visibilitychange', this.onVisibilityChange);
    this.listenersBound = false;
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
      state.player.mechCd = 0;
    } else if (
      this.fixture === 'survivor-cleanup-arrival' ||
      this.fixture === 'survivor-cleanup-combat' ||
      this.fixture === 'survivor-cleanup-departure'
    ) {
      /*
       * Activate through the real protocol path so the fixture shows the production
       * lifecycle, not a hand-assembled squad. Combat and departure fast-forward past
       * the arrival choreography; departure additionally drives the timer to zero so
       * the fly-out plays immediately.
       */
      forceStartProtocol(state, 'cleanup-crew', 1);
      if (this.fixture !== 'survivor-cleanup-arrival') {
        const cfg = SURVIVOR.megaProtocol.cleanup;
        const settle = cfg.arriveDuration + cfg.arriveStagger * 3 + 0.4;
        const steps = Math.round(settle / SURVIVOR.fixedDt);
        for (let i = 0; i < steps; i += 1) stepSurvivor(state, EMPTY_SURVIVOR_INPUT, SURVIVOR.fixedDt);
      }
      if (this.fixture === 'survivor-cleanup-departure') state.megaProtocol.remaining = 0;
    } else if (this.fixture === 'survivor-orbital') {
      /*
       * Advance to just past a detonation so the two-zone strike — core impact,
       * expanding shockwave and floor scorch — is on screen in the first frame. The
       * lance is a slow, telegraphed weapon, so a freshly-built fixture otherwise shows
       * nothing but the telegraph.
       */
      // The first lance fires immediately and arms for `life` (~0.7s), so stopping just
      // past that lands inside the detonation's effect window.
      const steps = Math.round(0.95 / SURVIVOR.fixedDt);
      for (let i = 0; i < steps; i += 1) stepSurvivor(state, EMPTY_SURVIVOR_INPUT, SURVIVOR.fixedDt);
    } else if (this.fixture === 'survivor-plasma-l1' || this.fixture === 'survivor-plasma-ship') {
      /*
       * Fast-forward a curved run so the trail already exists on the first frame.
       *
       * Plasma Wake only forms while moving, so a freshly-constructed fixture shows an
       * empty floor and nothing to inspect. Driving a real arc through the production
       * step makes the fixture statically reviewable — which also matters because a
       * hidden browser tab suspends the animation loop entirely.
       */
      if (this.fixture === 'survivor-plasma-ship') {
        state.player.shipCd = 0;
        tryShip(state);
      }
      const ship = this.fixture === 'survivor-plasma-ship';
      const input = { ...EMPTY_SURVIVOR_INPUT };
      // Ship form travels 2.6x faster, so it needs a tighter arc and a shorter run to
      // stay framed near the arena centre instead of reaching the wall.
      const seconds = ship ? 1.7 : 2.2;
      const rate = ship ? 2.7 : 1.15;
      const steps = Math.round(seconds / SURVIVOR.fixedDt);
      for (let i = 0; i < steps; i += 1) {
        const a = i * SURVIVOR.fixedDt * rate;
        input.moveX = Math.cos(a);
        input.moveY = Math.sin(a);
        stepSurvivor(state, input, SURVIVOR.fixedDt);
      }
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
    // Renderer resource counters for the F3 overlay / GPU stability procedure.
    const info = this.renderer.info;
    this.state.metrics.geometries = info.memory.geometries;
    this.state.metrics.textures = info.memory.textures;
    this.state.metrics.programs = info.programs?.length ?? 0;
    this.state.metrics.drawCalls = info.render.calls;
    const pools = this.actors?.poolStats();
    if (pools) {
      this.state.metrics.effects = pools.effects;
      this.state.metrics.attacks = pools.attacks;
      this.state.metrics.railPool = pools.railPool;
    }
    SurvivorArena.followPlayer(
      this.camera,
      this.state.player.x,
      this.state.player.z,
      this.state.player.hitShake,
      this.state.time,
    );
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

  /**
   * The single writer for persisted settings.
   *
   * Four call sites used to build the payload by hand, which is exactly how a newly
   * added preference gets silently dropped by whichever one nobody remembered to update.
   */
  private persistSettings(): void {
    saveSettings({
      version: 1,
      keybinds: this.keybinds,
      uiScale: this.uiScale,
      upgradeNumbers: this.upgradeNumbers,
    });
  }

  setUpgradeNumbers(on: boolean): void {
    this.upgradeNumbers = on === true;
    this.persistSettings();
    this.hud?.setUpgradeNumbers(this.upgradeNumbers);
  }

  setUiScale(scale: number): void {
    this.uiScale = clampUiScale(scale);
    this.applyUiScale(this.uiScale);
    this.persistSettings();
    this.hud?.setUiScale(this.uiScale);
  }

  dispose(): void {

    if (this.disposed) return;
    this.disposed = true;
    cancelAnimationFrame(this.raf);
    this.unbindWindowListeners();
    this.codesDown.clear();
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

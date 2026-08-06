import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import type { HeroId } from './content/heroes';
import { TUNING } from './content/combatTuning';
import { AssetLibrary } from './assets/AssetLibrary';
import { InputController } from './input/InputController';
import {
  buildHudSnapshot,
  createInitialState,
  restartFromCheckpoint,
  stepSimulation,
  type GameState,
  type InputFrame,
  EMPTY_INPUT,
} from './simulation';
import { IsoCamera } from './render/IsoCamera';
import { EnvironmentBuilder } from './render/EnvironmentBuilder';
import { ActorRenderer } from './render/ActorRenderer';
import { VfxRenderer } from './render/VfxRenderer';
import { HudController } from './ui/HudController';
import { AudioBus } from './audio/AudioBus';

export type RuntimeHandlers = {
  onReturnToCrew: () => void;
};

export type RuntimeOptions = {
  heroId: HeroId;
  host: HTMLElement;
  canvas: HTMLCanvasElement;
  fixture?: 'combat' | 'boss' | 'mech' | null;
  handlers: RuntimeHandlers;
};

/**
 * Owns the single game RAF loop, fixed-step simulation, renderer, input, audio, HUD.
 */
export class GystRuntime {
  private readonly host: HTMLElement;
  private readonly canvas: HTMLCanvasElement;
  private readonly handlers: RuntimeHandlers;
  private readonly heroId: HeroId;
  private readonly fixture: RuntimeOptions['fixture'];

  private renderer: THREE.WebGLRenderer | null = null;
  private scene: THREE.Scene | null = null;
  private camera: IsoCamera | null = null;
  private assets = new AssetLibrary();
  private input = new InputController();
  private audio = new AudioBus();
  private env: EnvironmentBuilder | null = null;
  private actors: ActorRenderer | null = null;
  private vfx: VfxRenderer | null = null;
  private hud: HudController | null = null;

  private state: GameState | null = null;
  private accumulator = 0;
  private lastTime = 0;
  private raf = 0;
  private disposed = false;
  private pointer = { x: 0, y: 0 };
  private lastKill = 0;
  private lastBossHp = 0;
  private lastPhase = '';
  private wasFiring = false;

  private onResize = (): void => this.resize();
  private onPointerMove = (e: PointerEvent): void => {
    const rect = this.canvas.getBoundingClientRect();
    this.pointer.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
    this.pointer.y = -(((e.clientY - rect.top) / rect.height) * 2 - 1);
  };

  constructor(options: RuntimeOptions) {
    this.host = options.host;
    this.canvas = options.canvas;
    this.handlers = options.handlers;
    this.heroId = options.heroId;
    this.fixture = options.fixture ?? null;
  }

  async start(): Promise<void> {
    if (this.disposed) return;

    this.renderer = new THREE.WebGLRenderer({
      canvas: this.canvas,
      antialias: true,
      alpha: false,
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
    this.scene.fog = new THREE.FogExp2('#070c14', 0.008);

    const pmrem = new THREE.PMREMGenerator(this.renderer);
    const room = new RoomEnvironment();
    this.scene.environment = pmrem.fromScene(room, 0.04).texture;
    room.dispose();
    pmrem.dispose();

    this.camera = new IsoCamera();
    this.env = new EnvironmentBuilder();
    this.actors = new ActorRenderer(this.assets);
    this.vfx = new VfxRenderer();

    // Load combat cast + asset-driven environment in parallel.
    await Promise.all([
      this.assets.preloadHero(this.heroId),
      this.assets.preloadCombat(),
      this.env.build().then((group) => {
        this.scene?.add(group);
      }),
    ]);
    if (this.disposed) return;

    this.scene.add(this.actors.root);
    this.scene.add(this.vfx.root);
    await this.actors.setupPlayer(this.heroId);

    this.state = createInitialState({ heroId: this.heroId, fixture: this.fixture });
    this.lastBossHp = this.state.boss.health;
    this.lastPhase = this.state.phase;

    this.hud = new HudController(this.host, {
      onRestart: () => this.restart(),
      onCrew: () => this.handlers.onReturnToCrew(),
    });

    this.input.attach(this.canvas);
    window.addEventListener('resize', this.onResize);
    this.canvas.addEventListener('pointermove', this.onPointerMove);
    this.canvas.classList.add('game-mode');
    this.resize();

    this.lastTime = performance.now();
    this.raf = requestAnimationFrame((t) => this.frame(t));
  }

  private restart(): void {
    if (!this.state) return;
    this.state = restartFromCheckpoint(this.state);
    this.accumulator = 0;
    this.lastKill = this.state.killCount;
    this.lastBossHp = this.state.boss.health;
    this.lastPhase = this.state.phase;
  }

  private resize(): void {
    if (!this.renderer || !this.camera) return;
    const w = window.innerWidth;
    const h = window.innerHeight;
    this.renderer.setSize(w, h, false);
    this.canvas.style.width = '100%';
    this.canvas.style.height = '100%';
    this.camera.resize(w, h);
  }

  private sampleInput(): InputFrame {
    if (!this.camera || !this.state) return { ...EMPTY_INPUT };
    const world = this.camera.pointerToWorld(this.pointer.x, this.pointer.y);
    this.input.setAimWorld(world.x, world.z);
    const frame = this.input.sample();

    if (frame.pausePressed && this.state.phase !== 'dead' && this.state.phase !== 'complete') {
      this.state.paused = !this.state.paused;
    }
    if (frame.mutePressed) {
      this.state.muted = !this.state.muted;
      this.audio.setMuted(this.state.muted);
    }
    if ((this.state.phase === 'dead' || this.state.phase === 'complete') && frame.interactPressed) {
      this.restart();
    }
    return frame;
  }

  private frame(now: number): void {
    if (this.disposed || !this.renderer || !this.scene || !this.camera || !this.state) return;
    this.raf = requestAnimationFrame((t) => this.frame(t));

    const rawDt = Math.min(0.05, (now - this.lastTime) / 1000);
    this.lastTime = now;

    const input = this.sampleInput();
    this.accumulator += rawDt;
    let steps = 0;
    while (this.accumulator >= TUNING.fixedDt && steps < TUNING.maxSubsteps) {
      const before = this.state;
      stepSimulation(before, input, TUNING.fixedDt);
      this.playFeedback(before, input);
      this.accumulator -= TUNING.fixedDt;
      steps += 1;
    }

    const renderDt = rawDt;
    const p = this.state.player;
    const look = TUNING.camera.lookAhead;
    this.camera.setFollow(p.x, 0, p.z, p.facingX * look * 0.3, p.facingZ * look);
    // Consume shake effects
    for (const e of this.state.effects) {
      if (e.kind === 'shake' && e.life > e.maxLife - TUNING.fixedDt * 1.5) {
        this.camera.addShake(e.scale ?? 0.3);
      }
    }
    this.camera.update(renderDt);

    this.actors?.sync(this.state, renderDt);
    this.vfx?.sync(this.state);
    this.hud?.publish(buildHudSnapshot(this.state));

    this.renderer.render(this.scene, this.camera.camera);
  }

  private playFeedback(state: GameState, input: InputFrame): void {
    if (state.muted) return;
    if (input.fireHeld && state.player.fireCooldown > TUNING.fixedDt * 0.5 && !this.wasFiring) {
      // handled below via cadence detection is hard; fire on muzzle effects
    }
    this.wasFiring = input.fireHeld;

    for (const e of state.effects) {
      if (e.life < e.maxLife - TUNING.fixedDt) continue;
      switch (e.kind) {
        case 'muzzle':
          this.audio.fire();
          break;
        case 'impact':
          this.audio.hit();
          break;
        case 'repair':
          this.audio.repair();
          break;
        case 'transform':
          this.audio.transform();
          break;
        case 'pulse':
        case 'rail':
        case 'rocket':
          this.audio.ability();
          break;
        case 'pickup':
          this.audio.pickup();
          break;
        case 'death':
          if (state.boss.state === 'dead') this.audio.bossDeath();
          break;
        case 'telegraph':
          if (e.scale && e.scale > 2) this.audio.enemyAttack();
          break;
        default:
          break;
      }
    }
    if (input.dodgePressed && state.player.dodgeActive > 0) this.audio.dodge();
    void this.lastKill;
    void this.lastBossHp;
    void this.lastPhase;
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    cancelAnimationFrame(this.raf);
    window.removeEventListener('resize', this.onResize);
    this.canvas.removeEventListener('pointermove', this.onPointerMove);
    this.canvas.classList.remove('game-mode');
    this.input.detach();
    this.hud?.dispose();
    this.actors?.dispose();
    this.vfx?.dispose();
    this.env?.dispose();
    this.audio.dispose();
    this.assets.dispose();
    this.scene?.clear();
    this.renderer?.dispose();
    this.renderer = null;
    this.scene = null;
    this.state = null;
  }
}

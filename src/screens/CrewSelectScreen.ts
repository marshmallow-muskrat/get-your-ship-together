import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import * as SkeletonUtils from 'three/addons/utils/SkeletonUtils.js';
import { HERO_LIST, type HeroDef, type HeroId } from '../game/content/heroes';
import { AssetLibrary } from '../game/assets/AssetLibrary';
import { AudioBus } from '../game/audio/AudioBus';
import {
  formatSurvivalTime,
  getHeroLeaderboard,
  getRunHistory,
} from '../game/modes/survivor/survivorRecords';

export type CrewSelectHandlers = {
  /** Launch Containment Protocol with the selected hero. */
  onLaunch: (heroId: HeroId) => void;
};

/**
 * Mountable/disposable crew selection screen.
 * Owns its scene, renderer binding, listeners, and RAF.
 */
export class CrewSelectScreen {
  private readonly host: HTMLElement;
  private readonly canvas: HTMLCanvasElement;
  private readonly handlers: CrewSelectHandlers;
  private readonly audio: AudioBus;
  private readonly assets = new AssetLibrary();

  private renderer: THREE.WebGLRenderer | null = null;
  private scene: THREE.Scene | null = null;
  private camera: THREE.PerspectiveCamera | null = null;
  private selectedHeroGroup = new THREE.Group();
  private stageGroup = new THREE.Group();
  private stageRotors: Array<{ object: THREE.Object3D; speed: number }> = [];
  private stagePulseMaterials: THREE.MeshBasicMaterial[] = [];
  private selectedHeroLight = new THREE.PointLight('#f5ae42', 3.6, 24, 2);
  private floaters: Array<{ object: THREE.Object3D; baseY: number; phase: number }> = [];
  private selectedIndex = 0;
  private selectionScale = 1;
  private raf = 0;
  private scaleObserver: MutationObserver | null = null;
  private disposed = false;
  private leaderboardHistory = false;
  private clock = new THREE.Clock();
  private hud: HTMLElement | null = null;
  private loading: HTMLElement | null = null;

  private onResize = (): void => this.resize();
  private onPointerDown = (): void => {
    void this.audio.unlock();
  };
  private syncUiScaleClass = (): void => {
    const uiScale = Number.parseFloat(
      getComputedStyle(document.documentElement).getPropertyValue('--ui-scale'),
    ) || 1;
    this.hud?.classList.toggle('selection-ui-large', uiScale >= 1.4);
  };
  private onKeyDown = (e: KeyboardEvent): void => {
    void this.audio.unlock();
    if (e.key === 'ArrowLeft' || e.key === 'a' || e.key === 'A') {
      this.updateSelection((this.selectedIndex + HERO_LIST.length - 1) % HERO_LIST.length);
    } else if (e.key === 'ArrowRight' || e.key === 'd' || e.key === 'D') {
      this.updateSelection((this.selectedIndex + 1) % HERO_LIST.length);
    } else if (e.key === 'Enter') {
      this.launch();
    } else if (e.key === 'm' || e.key === 'M') {
      this.audio.setMuted(!this.audio.isMuted());
      this.updateAudioLabel();
    }
  };

  constructor(host: HTMLElement, canvas: HTMLCanvasElement, handlers: CrewSelectHandlers, audio: AudioBus) {
    this.host = host;
    this.canvas = canvas;
    this.handlers = handlers;
    this.audio = audio;
  }

  async mount(): Promise<void> {
    if (this.disposed) return;
    this.audio.setMode('menu');
    this.audio.preload();

    this.renderer = new THREE.WebGLRenderer({
      canvas: this.canvas,
      antialias: true,
      alpha: true,
      powerPreference: 'high-performance',
    });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.setClearColor(0x000000, 0);
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 0.8;
    this.renderer.shadowMap.enabled = false;

    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(31, 1, 0.1, 100);
    this.camera.position.set(0, 7.6, 35);
    this.camera.lookAt(0, 4.1, 0);

    const pmrem = new THREE.PMREMGenerator(this.renderer);
    const room = new RoomEnvironment();
    this.scene.environment = pmrem.fromScene(room, 0.035).texture;
    room.dispose();
    pmrem.dispose();

    this.selectedHeroGroup.position.y = 1.4;
    this.createHangarStage();
    this.scene.add(this.stageGroup);
    this.scene.add(this.selectedHeroGroup);
    this.createLighting();
    this.buildHud();
    this.resize();

    this.loading = document.createElement('div');
    this.loading.className = 'loading-screen';
    this.loading.innerHTML = `
      <div class="loading-card">
        <div class="loading-mark">GYST</div>
        <p class="eyebrow">CREW SELECTION</p>
        <h1>Loading the roster…</h1>
        <div class="loading-track"><span id="crew-loading-bar"></span></div>
        <p class="loading-status">Loading crew assets</p>
      </div>`;
    this.host.appendChild(this.loading);

    // Load all selection models (astronaut + mech + ship).
    const total = HERO_LIST.length * 3;
    let loaded = 0;
    const bar = this.loading.querySelector<HTMLElement>('#crew-loading-bar');
    const bump = () => {
      loaded += 1;
      if (bar) bar.style.width = `${Math.round((loaded / total) * 100)}%`;
    };

    await Promise.all(
      HERO_LIST.flatMap((hero) => [
        this.assets.loadUrl(hero.astronaut.url, 4.1).then(bump),
        this.assets.loadUrl(hero.mech.url, 6.0).then(bump),
        this.assets.loadUrl(hero.shipUrl).then((entry) => {
          // Fit ship by width-ish for display
          const box = new THREE.Box3().setFromObject(entry.template);
          const size = box.getSize(new THREE.Vector3());
          const dim = Math.max(size.x, size.z, 0.001);
          entry.template.scale.multiplyScalar(5.8 / dim);
          entry.template.updateMatrixWorld(true);
          const b2 = new THREE.Box3().setFromObject(entry.template);
          entry.template.position.y -= b2.min.y;
          bump();
        }),
      ]),
    );

    if (this.disposed) return;
    this.loading.remove();
    this.loading = null;
    this.updateSelection(0);
    window.addEventListener('resize', this.onResize);
    window.addEventListener('keydown', this.onKeyDown);
    window.addEventListener('pointerdown', this.onPointerDown);
    this.scaleObserver = new MutationObserver(this.syncUiScaleClass);
    this.scaleObserver.observe(document.documentElement, { attributes: true, attributeFilter: ['style'] });
    this.syncUiScaleClass();
    this.canvas.classList.remove('game-mode', 'map-mode');
    this.clock.start();
    this.raf = requestAnimationFrame(() => this.animate());
  }

  private buildHud(): void {
    this.hud = document.createElement('section');
    this.hud.id = 'selection-hud';
    this.hud.className = 'hud';
    this.hud.setAttribute('aria-label', 'Hero selection screen');
    this.hud.innerHTML = `
      <header class="selection-header">
        <div class="game-lockup">
          <h1 class="game-title" aria-label="Get Your Ship Together">
            <span>GET YOUR</span>
            <em>SHIP</em>
            <span>TOGETHER</span>
          </h1>
          <strong class="select-heading">SELECT YOUR CREW</strong>
        </div>
        <div class="selected-identity" aria-live="polite">
          <span id="selected-number" class="selected-number">01 / 04</span>
          <strong id="selected-hero">Boswell</strong>
          <span id="selected-species">The Bee</span>
        </div>
      </header>
      <div class="lower-hud">
        <nav id="bay-selector" class="bay-selector" aria-label="Choose a hero"></nav>
      </div>
      <div class="form-telemetry" aria-label="Three combat forms">
        <span><i>01</i><strong>ASTRONAUT</strong><small>TACTICAL CORE</small></span>
        <span><i>02</i><strong>AFTERBURNER</strong><small>SHIP FORM</small></span>
        <span><i>03</i><strong>MECH</strong><small>OVERDRIVE</small></span>
      </div>
      <aside class="selection-dossier" aria-live="polite">
        <div class="dossier-status"><span></span> CREW LINK VERIFIED</div>
        <p class="eyebrow">OPERATIVE DOSSIER</p>
        <strong id="selected-role">Swarm Systems Specialist</strong>
        <p id="selected-brief">Deploys autonomous interceptors that turn encirclement into a firing solution.</p>
        <dl>
          <div><dt>ACTIVE SYSTEM</dt><dd id="selected-ability">Microdrone Screen</dd></div>
          <div><dt>FORM LINK</dt><dd>TRI-FORM READY</dd></div>
        </dl>
      </aside>
      <div class="corner-actions" aria-label="Screen actions">
        <div class="utility-actions">
          <button class="select-hero-button exit-button" type="button" id="exit-button">EXIT</button>
          <button class="select-hero-button audio-button" type="button" id="audio-button">AUDIO ON · M</button>
        </div>
        <div class="mode-actions">
          <button id="leaderboard-button" class="select-hero-button ghost-button" type="button">LEADERBOARDS</button>
          <button id="launch-button" class="select-hero-button survivor-button" type="button"><span>CONTINUE</span><small>BEGIN RUN</small></button>
        </div>
      </div>
      <div id="crew-leaderboard" class="crew-leaderboard hidden" role="dialog" aria-label="Local leaderboards">
        <div class="crew-lb-panel">
          <header class="crew-lb-header">
            <div><p class="eyebrow">LOCAL RECORDS // REACTOR PLATFORM 7</p><h2>Hall of Survivors</h2></div>
            <span class="crew-lb-live"><i></i> LOCAL ARCHIVE ONLINE</span>
          </header>
          <div class="crew-lb-shell">
            <aside class="crew-lb-profile">
              <div id="crew-lb-portrait" class="crew-lb-portrait" aria-hidden="true"></div>
              <span id="crew-lb-species">THE BEE</span>
              <strong id="crew-lb-hero">BOSWELL</strong>
              <div class="crew-lb-best"><small>PERSONAL BEST</small><b id="crew-lb-best">—</b></div>
              <div class="crew-lb-totals"><span><small>RUNS</small><b id="crew-lb-runs">0</b></span><span><small>CAREER KILLS</small><b id="crew-lb-kills">0</b></span></div>
            </aside>
            <main class="crew-lb-records">
              <div id="crew-lb-view-tabs" class="crew-lb-tabs"></div>
              <div id="crew-lb-tabs" class="crew-lb-tabs crew-lb-hero-tabs"></div>
              <div class="crew-lb-column-labels"><span>RANK</span><span>ENDURANCE</span><span>RUN DATA</span></div>
              <div id="crew-lb-list" class="crew-lb-list"></div>
            </main>
          </div>
          <footer class="crew-lb-footer"><span>INDEPENDENT LOCAL RECORDS · NO CLOUD SYNC</span><button type="button" id="crew-lb-close" class="select-hero-button">RETURN TO BAY</button></footer>
        </div>
      </div>
    `;
    this.host.appendChild(this.hud);

    const bay = this.hud.querySelector('#bay-selector')!;
    const portraits = ['0% 0%', '100% 0%', '0% 100%', '100% 100%'];
    HERO_LIST.forEach((hero, index) => {
      const button = document.createElement('button');
      button.className = 'bay-button';
      button.type = 'button';
      button.style.setProperty('--bay-accent', hero.accent);
      button.setAttribute('aria-label', `Select ${hero.name} ${hero.species}`);
      button.innerHTML = `
        <span class="hero-card-art" aria-hidden="true"></span>
        <span class="hero-card-info"><strong>${hero.name}</strong><small>${hero.species}</small></span>
      `;
      button.querySelector<HTMLElement>('.hero-card-art')?.style.setProperty('background-position', portraits[index]!);
      button.addEventListener('click', () => this.updateSelection(index));
      bay.appendChild(button);
    });

    this.hud.querySelector('#launch-button')?.addEventListener('click', () => this.launch());
    this.hud.querySelector('#leaderboard-button')?.addEventListener('click', () => this.openLeaderboard());
    this.hud.querySelector('#crew-lb-close')?.addEventListener('click', () => this.closeLeaderboard());
    this.hud.querySelector('#audio-button')?.addEventListener('click', () => {
      this.audio.setMuted(!this.audio.isMuted());
      this.updateAudioLabel();
    });
    this.hud.querySelector('#exit-button')?.addEventListener('click', () => {
      // Soft exit: stay on selection.
    });
    this.updateAudioLabel();
  }

  private updateAudioLabel(): void {
    const button = this.hud?.querySelector<HTMLButtonElement>('#audio-button');
    if (button) button.textContent = `${this.audio.isMuted() ? 'AUDIO OFF' : 'AUDIO ON'} · M`;
  }

  private openLeaderboard(): void {
    this.audio.uiConfirm();
    const hero = HERO_LIST[this.selectedIndex]!.id;
    this.renderCrewLeaderboard(hero);
    this.hud?.querySelector('#crew-leaderboard')?.classList.remove('hidden');
  }

  private closeLeaderboard(): void {
    this.audio.uiMove();
    this.hud?.querySelector('#crew-leaderboard')?.classList.add('hidden');
  }

  private renderCrewLeaderboard(heroId: HeroId): void {
    const heroIndex = HERO_LIST.findIndex((hero) => hero.id === heroId);
    const hero = HERO_LIST[Math.max(0, heroIndex)]!;
    const history = getRunHistory(heroId);
    const best = getHeroLeaderboard(heroId)[0];
    const portrait = this.hud?.querySelector<HTMLElement>('#crew-lb-portrait');
    const heroName = this.hud?.querySelector('#crew-lb-hero');
    const species = this.hud?.querySelector('#crew-lb-species');
    const bestTime = this.hud?.querySelector('#crew-lb-best');
    const runCount = this.hud?.querySelector('#crew-lb-runs');
    const careerKills = this.hud?.querySelector('#crew-lb-kills');
    if (portrait) portrait.style.backgroundPosition = ['0% 0%', '100% 0%', '0% 100%', '100% 100%'][Math.max(0, heroIndex)]!;
    if (heroName) heroName.textContent = hero.name;
    if (species) species.textContent = hero.species;
    if (bestTime) bestTime.textContent = best ? formatSurvivalTime(best.survivalTime) : '—';
    if (runCount) runCount.textContent = String(history.length);
    if (careerKills) careerKills.textContent = history.reduce((total, run) => total + run.kills, 0).toLocaleString();

    const viewTabs = this.hud?.querySelector('#crew-lb-view-tabs');
    const tabs = this.hud?.querySelector('#crew-lb-tabs');
    const list = this.hud?.querySelector('#crew-lb-list');
    if (viewTabs) {
      viewTabs.replaceChildren();
      for (const [history, label] of [[false, 'TOP SCORES'], [true, 'RUN HISTORY']] as const) {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = `crew-lb-tab${this.leaderboardHistory === history ? ' active' : ''}`;
        btn.textContent = label;
        btn.addEventListener('click', () => {
          this.leaderboardHistory = history;
          this.renderCrewLeaderboard(heroId);
        });
        viewTabs.appendChild(btn);
      }
    }
    if (tabs) {
      tabs.innerHTML = HERO_LIST.map(
        (h) =>
          `<button type="button" class="crew-lb-tab${h.id === heroId ? ' active' : ''}" data-hero="${h.id}">${h.name}</button>`,
      ).join('');
      tabs.querySelectorAll<HTMLButtonElement>('.crew-lb-tab').forEach((btn) => {
        btn.addEventListener('click', () => this.renderCrewLeaderboard(btn.dataset.hero as HeroId));
      });
    }
    if (list) {
      const runs = this.leaderboardHistory ? getRunHistory(heroId) : getHeroLeaderboard(heroId);
      list.replaceChildren();
      if (runs.length === 0) {
        const empty = document.createElement('p');
        empty.className = 'crew-lb-empty';
        empty.innerHTML = '<strong>NO SIGNALS RECORDED</strong><span>Complete a run to establish this operative’s first endurance record.</span>';
        list.appendChild(empty);
      } else {
        runs.forEach((run, index) => {
          const row = document.createElement('div');
          row.className = `crew-lb-row${!this.leaderboardHistory && index < 3 ? ` podium podium-${index + 1}` : ''}`;
          const rank = document.createElement('strong');
          rank.className = 'crew-lb-rank';
          rank.textContent = this.leaderboardHistory ? `RUN ${runs.length - index}` : `#${index + 1}`;
          const endurance = document.createElement('span');
          endurance.className = 'crew-lb-time';
          endurance.textContent = formatSurvivalTime(run.survivalTime);
          const data = document.createElement('span');
          data.className = 'crew-lb-data';
          data.textContent = `${run.kills.toLocaleString()} KILLS  ·  LEVEL ${run.level}  ·  ${run.bossesDefeated} BOSSES`;
          const meta = document.createElement('span');
          meta.className = 'crew-lb-meta';
          meta.textContent = `${new Date(run.timestamp).toLocaleDateString()}  //  ${run.balanceVersion}`;
          const build = document.createElement('span');
          build.className = 'crew-lb-build';
          build.textContent = run.weapons.length > 0
            ? run.weapons.map((weapon) => `${weapon.weaponId} L${weapon.level}`).join('  ·  ')
            : 'NO WEAPON TELEMETRY';
          row.append(rank, endurance, data, meta, build);
          list.appendChild(row);
        });
      }
    }
  }

  private createLighting(): void {
    if (!this.scene) return;
    this.scene.add(new THREE.AmbientLight('#a7b8ff', 0.52));
    this.scene.add(new THREE.HemisphereLight('#b9c9ff', '#071126', 0.48));
    const key = new THREE.DirectionalLight('#eef2ff', 1.5);
    key.position.set(-14, 24, 18);
    this.scene.add(key);
    const rim = new THREE.DirectionalLight('#8f64ff', 1.1);
    rim.position.set(18, 16, -18);
    this.scene.add(rim);
    const frontFill = new THREE.PointLight('#fff2d5', 2, 30, 2);
    frontFill.position.set(0, 8, 15);
    this.scene.add(frontFill);
    const cyanFill = new THREE.PointLight('#4edbff', 2.6, 32, 2);
    cyanFill.position.set(-12, 6, 8);
    this.scene.add(cyanFill);
    const magentaRim = new THREE.PointLight('#d76cff', 2, 32, 2);
    magentaRim.position.set(13, 9, -10);
    this.scene.add(magentaRim);
  }

  /** Procedural command-deck architecture; runtime asset packs remain untouched. */
  private createHangarStage(): void {
    this.stageGroup.clear();
    this.stageRotors.length = 0;
    this.stagePulseMaterials.length = 0;

    const metal = new THREE.MeshStandardMaterial({
      color: '#111a31',
      metalness: 0.82,
      roughness: 0.32,
      emissive: '#07152c',
      emissiveIntensity: 0.55,
    });
    const deck = new THREE.MeshStandardMaterial({
      color: '#091226',
      metalness: 0.76,
      roughness: 0.42,
      emissive: '#07132a',
      emissiveIntensity: 0.72,
    });
    const cyan = new THREE.MeshBasicMaterial({
      color: '#63e9ff',
      transparent: true,
      opacity: 0.5,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
    const violet = new THREE.MeshBasicMaterial({
      color: '#9a72ff',
      transparent: true,
      opacity: 0.3,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
    const frost = new THREE.MeshBasicMaterial({
      color: '#d9f7ff',
      transparent: true,
      opacity: 0.62,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
    this.stagePulseMaterials.push(cyan, violet, frost);

    const mesh = (
      geometry: THREE.BufferGeometry,
      material: THREE.Material,
      position: [number, number, number],
      rotation: [number, number, number] = [0, 0, 0],
    ): THREE.Mesh => {
      const object = new THREE.Mesh(geometry, material);
      object.position.set(...position);
      object.rotation.set(...rotation);
      this.stageGroup.add(object);
      return object;
    };

    // Deep deck and two form-specific elevator plinths establish real scale beneath
    // the hero, instead of leaving three models floating against a flat space image.
    mesh(new THREE.CylinderGeometry(15.8, 17.4, 0.7, 64), deck, [0, 0.65, -0.8]);
    mesh(new THREE.TorusGeometry(13.3, 0.055, 8, 128), cyan, [0, 1.02, -0.8], [-Math.PI / 2, 0, 0]);
    mesh(new THREE.TorusGeometry(9.2, 0.035, 8, 96), violet, [0, 1.04, -0.8], [-Math.PI / 2, 0, 0]);

    const plinths: Array<[number, number, number]> = [
      [-3.4, 3.17, 1.1],
      [3.4, 2.22, 1.1],
    ];
    for (const [x, y, z] of plinths) {
      mesh(new THREE.CylinderGeometry(2.05, 2.35, 0.2, 48), metal, [x, y, z]);
      mesh(new THREE.TorusGeometry(1.86, 0.055, 8, 64), cyan, [x, y + 0.115, z], [-Math.PI / 2, 0, 0]);
      for (let i = -1; i <= 1; i += 2) {
        mesh(new THREE.BoxGeometry(0.08, 0.025, 2.7), frost, [x + i * 1.05, y + 0.13, z]);
      }
    }

    // Ship diagnostic portal and counter-rotating guidance rings.
    mesh(new THREE.CylinderGeometry(0.12, 0.2, 11.5, 10), metal, [-7.8, 7.2, -3.8]);
    mesh(new THREE.CylinderGeometry(0.12, 0.2, 11.5, 10), metal, [7.8, 7.2, -3.8]);
    const portal = mesh(new THREE.TorusGeometry(4.7, 0.08, 12, 128), cyan, [0, 10.8, -4]);
    const portalInner = mesh(new THREE.TorusGeometry(4.15, 0.035, 8, 96), violet, [0, 10.8, -3.96]);
    this.stageRotors.push({ object: portal, speed: 0.055 }, { object: portalInner, speed: -0.09 });
    for (let i = 0; i < 12; i += 1) {
      const angle = (i / 12) * Math.PI * 2;
      const tick = mesh(new THREE.BoxGeometry(0.055, 0.48, 0.04), frost, [Math.cos(angle) * 4.7, 10.8 + Math.sin(angle) * 4.7, -3.9]);
      tick.rotation.z = angle;
      portal.add(tick);
      tick.position.x -= portal.position.x;
      tick.position.y -= portal.position.y;
      tick.position.z -= portal.position.z;
    }

    // Architectural light fins and a deterministic star/dust volume add parallax.
    for (let i = -3; i <= 3; i += 1) {
      mesh(new THREE.BoxGeometry(0.045, 8.6, 0.04), i % 2 === 0 ? cyan : violet, [i * 2.35, 7.1, -6.2]);
    }
    const dustGeometry = new THREE.BufferGeometry();
    const dust = new Float32Array(150 * 3);
    for (let i = 0; i < 150; i += 1) {
      const u = ((i * 73) % 151) / 150;
      const v = ((i * 41 + 17) % 149) / 148;
      dust[i * 3] = (u - 0.5) * 30;
      dust[i * 3 + 1] = 1.4 + v * 14;
      dust[i * 3 + 2] = -5.8 - ((i * 29) % 31) * 0.1;
    }
    dustGeometry.setAttribute('position', new THREE.BufferAttribute(dust, 3));
    const dustMaterial = new THREE.PointsMaterial({
      color: '#9deeff',
      size: 0.055,
      transparent: true,
      opacity: 0.55,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
    const dustPoints = new THREE.Points(dustGeometry, dustMaterial);
    this.stageGroup.add(dustPoints);
    this.stageRotors.push({ object: dustPoints, speed: 0.0025 });

    this.stageGroup.add(new THREE.PointLight('#62dfff', 3.2, 20, 2));
    const stageLight = this.stageGroup.children[this.stageGroup.children.length - 1] as THREE.PointLight;
    stageLight.position.set(0, 10.5, -1.5);
  }

  private fitModel(model: THREE.Object3D, target: number, mode: 'height' | 'width'): THREE.Object3D {
    model.updateMatrixWorld(true);
    const initialBounds = new THREE.Box3().setFromObject(model);
    const initialSize = initialBounds.getSize(new THREE.Vector3());
    const dimension = mode === 'height' ? initialSize.y : Math.max(initialSize.x, initialSize.z);
    if (dimension > 0) model.scale.multiplyScalar(target / dimension);
    model.updateMatrixWorld(true);
    const finalBounds = new THREE.Box3().setFromObject(model);
    model.position.y -= finalBounds.min.y;
    return model;
  }

  private centerModel(model: THREE.Object3D, x: number, centerY: number, z: number): void {
    model.position.x = x;
    model.position.z = z;
    model.updateMatrixWorld(true);
    const bounds = new THREE.Box3().setFromObject(model);
    const currentCenter = bounds.getCenter(new THREE.Vector3());
    model.position.y += centerY - currentCenter.y;
  }

  private addForm(hero: HeroDef, kind: 'astronaut' | 'mech' | 'ship'): void {
    const url = kind === 'ship' ? hero.shipUrl : kind === 'astronaut' ? hero.astronaut.url : hero.mech.url;
    const entry = this.assets.get(url);
    if (!entry) return;
    const model = SkeletonUtils.clone(entry.template);
    if (kind === 'ship') {
      // already fitted during load
      model.rotation.set(THREE.MathUtils.degToRad(42), 0, 0);
      this.centerModel(model, 0, 9.9, 0);
      this.floaters.push({ object: model, baseY: model.position.y, phase: this.selectedIndex * 0.8 });
    } else if (kind === 'astronaut') {
      this.fitModel(model, 4.1, 'height');
      model.rotation.y = 0;
      this.centerModel(model, -3.4, 4.0, 0);
    } else {
      this.fitModel(model, 6.0, 'height');
      model.rotation.y = 0;
      this.centerModel(model, 3.4, 4.0, 0);
    }
    this.selectedHeroGroup.add(model);
  }

  private updateSelection(index: number): void {
    const shouldCue = this.selectedHeroGroup.children.length > 1 && index !== this.selectedIndex;
    this.selectedIndex = index;
    const hero = HERO_LIST[index]!;
    document.documentElement.style.setProperty('--bay-accent', hero.accent);

    const num = this.hud?.querySelector('#selected-number');
    const name = this.hud?.querySelector('#selected-hero');
    const species = this.hud?.querySelector('#selected-species');
    const role = this.hud?.querySelector('#selected-role');
    const brief = this.hud?.querySelector('#selected-brief');
    const ability = this.hud?.querySelector('#selected-ability');
    if (num) num.textContent = `${String(index + 1).padStart(2, '0')} / 04`;
    if (name) name.textContent = hero.name;
    if (species) species.textContent = hero.species;
    if (role) role.textContent = hero.role;
    if (brief) brief.textContent = hero.brief;
    if (ability) ability.textContent = hero.abilityName;

    this.hud?.querySelectorAll('.bay-button').forEach((btn, i) => {
      btn.classList.toggle('active', i === index);
      btn.setAttribute('aria-selected', String(i === index));
    });

    this.selectedHeroGroup.clear();
    this.floaters.length = 0;
    this.selectedHeroGroup.add(this.selectedHeroLight);
    this.selectedHeroLight.color.set(hero.accent);
    this.selectedHeroLight.position.set(0, 6, 2);
    this.addForm(hero, 'astronaut');
    this.addForm(hero, 'mech');
    this.addForm(hero, 'ship');
    this.selectionScale = 0.78;
    this.selectedHeroGroup.scale.setScalar(this.selectionScale);
    if (shouldCue) this.audio.uiMove();
  }

  private launch(): void {
    const hero = HERO_LIST[this.selectedIndex]!;
    this.audio.uiConfirm();
    this.handlers.onLaunch(hero.id);
  }

  private resize(): void {
    if (!this.renderer || !this.camera) return;
    const w = window.innerWidth;
    const h = window.innerHeight;
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(w, h, false);
    this.canvas.style.width = '100%';
    this.canvas.style.height = '100%';
  }

  private animate(): void {
    if (this.disposed || !this.renderer || !this.scene || !this.camera) return;
    this.raf = requestAnimationFrame(() => this.animate());
    const elapsed = this.clock.elapsedTime;
    this.selectionScale = THREE.MathUtils.lerp(this.selectionScale, 0.9, 0.075);
    this.selectedHeroGroup.scale.setScalar(this.selectionScale);
    for (const { object, baseY, phase } of this.floaters) {
      object.position.y = baseY + Math.sin(elapsed * 1.35 + phase) * 0.12;
      object.rotation.y = elapsed * 0.09 + phase * 0.08;
    }
    for (const { object, speed } of this.stageRotors) {
      object.rotation.z = elapsed * speed;
    }
    for (let i = 0; i < this.stagePulseMaterials.length; i += 1) {
      this.stagePulseMaterials[i]!.opacity = (i === 0 ? 0.46 : i === 1 ? 0.28 : 0.58) + Math.sin(elapsed * 0.7 + i * 1.8) * 0.06;
    }
    this.selectedHeroLight.position.x = Math.sin(elapsed * 0.55) * 4.2;
    this.selectedHeroLight.position.z = 5 + Math.cos(elapsed * 0.55) * 1.8;
    this.selectedHeroLight.intensity = 3.6 + Math.sin(elapsed * 0.8) * 0.2;
    this.renderer.render(this.scene, this.camera);
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    cancelAnimationFrame(this.raf);
    window.removeEventListener('resize', this.onResize);
    window.removeEventListener('keydown', this.onKeyDown);
    window.removeEventListener('pointerdown', this.onPointerDown);
    this.scaleObserver?.disconnect();
    this.scaleObserver = null;
    this.hud?.remove();
    this.loading?.remove();
    this.hud = null;
    this.loading = null;
    const geometries = new Set<THREE.BufferGeometry>();
    const materials = new Set<THREE.Material>();
    this.stageGroup.traverse((object) => {
      const renderable = object as THREE.Mesh;
      if (renderable.geometry) geometries.add(renderable.geometry);
      const material = renderable.material;
      if (Array.isArray(material)) material.forEach((entry) => materials.add(entry));
      else if (material) materials.add(material);
    });
    geometries.forEach((geometry) => geometry.dispose());
    materials.forEach((material) => material.dispose());
    this.stageRotors.length = 0;
    this.stagePulseMaterials.length = 0;
    this.scene?.clear();
    this.assets.dispose();
    this.renderer?.dispose();
    this.renderer = null;
    this.scene = null;
    this.camera = null;
  }
}

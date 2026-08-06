import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import * as SkeletonUtils from 'three/addons/utils/SkeletonUtils.js';
import { HERO_LIST, type HeroDef, type HeroId } from '../game/content/heroes';
import { AssetLibrary } from '../game/assets/AssetLibrary';
import {
  formatSurvivalTime,
  getHeroLeaderboard,
} from '../game/modes/survivor/survivorRecords';

export type CrewSelectHandlers = {
  onContinue: (heroId: HeroId) => void;
  onSurvivor?: (heroId: HeroId) => void;
};

/**
 * Mountable/disposable crew selection screen.
 * Owns its scene, renderer binding, listeners, and RAF.
 */
export class CrewSelectScreen {
  private readonly host: HTMLElement;
  private readonly canvas: HTMLCanvasElement;
  private readonly handlers: CrewSelectHandlers;
  private readonly assets = new AssetLibrary();

  private renderer: THREE.WebGLRenderer | null = null;
  private scene: THREE.Scene | null = null;
  private camera: THREE.PerspectiveCamera | null = null;
  private selectedHeroGroup = new THREE.Group();
  private selectedHeroLight = new THREE.PointLight('#f5ae42', 3.6, 24, 2);
  private floaters: Array<{ object: THREE.Object3D; baseY: number; phase: number }> = [];
  private selectedIndex = 0;
  private selectionScale = 1;
  private raf = 0;
  private disposed = false;
  private clock = new THREE.Clock();
  private hud: HTMLElement | null = null;
  private loading: HTMLElement | null = null;

  private onResize = (): void => this.resize();
  private onKeyDown = (e: KeyboardEvent): void => {
    if (e.key === 'ArrowLeft' || e.key === 'a' || e.key === 'A') {
      this.updateSelection((this.selectedIndex + HERO_LIST.length - 1) % HERO_LIST.length);
    } else if (e.key === 'ArrowRight' || e.key === 'd' || e.key === 'D') {
      this.updateSelection((this.selectedIndex + 1) % HERO_LIST.length);
    } else if (e.key === 'Enter') {
      this.continue();
    }
  };

  constructor(host: HTMLElement, canvas: HTMLCanvasElement, handlers: CrewSelectHandlers) {
    this.host = host;
    this.canvas = canvas;
    this.handlers = handlers;
  }

  async mount(): Promise<void> {
    if (this.disposed) return;

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
      <div class="corner-actions" aria-label="Screen actions">
        <button class="select-hero-button exit-button" type="button" id="exit-button">EXIT</button>
        <div class="mode-actions">
          <button id="leaderboard-button" class="select-hero-button ghost-button" type="button">LEADERBOARDS</button>
          <button id="survivor-button" class="select-hero-button survivor-button" type="button">CONTAINMENT PROTOCOL</button>
          <button id="select-hero-button" class="select-hero-button" type="button">CAMPAIGN</button>
        </div>
      </div>
      <div id="crew-leaderboard" class="crew-leaderboard hidden" role="dialog" aria-label="Local leaderboards">
        <div class="crew-lb-panel">
          <p class="eyebrow">LOCAL RECORDS</p>
          <h2>Leaderboards</h2>
          <div id="crew-lb-tabs" class="crew-lb-tabs"></div>
          <div id="crew-lb-list" class="crew-lb-list"></div>
          <button type="button" id="crew-lb-close" class="select-hero-button">BACK</button>
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

    this.hud.querySelector('#select-hero-button')?.addEventListener('click', () => this.continue());
    this.hud.querySelector('#survivor-button')?.addEventListener('click', () => this.launchSurvivor());
    this.hud.querySelector('#leaderboard-button')?.addEventListener('click', () => this.openLeaderboard());
    this.hud.querySelector('#crew-lb-close')?.addEventListener('click', () => this.closeLeaderboard());
    this.hud.querySelector('#exit-button')?.addEventListener('click', () => {
      // Soft exit: stay on selection.
    });
  }

  private openLeaderboard(): void {
    const hero = HERO_LIST[this.selectedIndex]!.id;
    this.renderCrewLeaderboard(hero);
    this.hud?.querySelector('#crew-leaderboard')?.classList.remove('hidden');
  }

  private closeLeaderboard(): void {
    this.hud?.querySelector('#crew-leaderboard')?.classList.add('hidden');
  }

  private renderCrewLeaderboard(heroId: HeroId): void {
    const tabs = this.hud?.querySelector('#crew-lb-tabs');
    const list = this.hud?.querySelector('#crew-lb-list');
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
      const runs = getHeroLeaderboard(heroId);
      if (runs.length === 0) {
        list.innerHTML = '<p class="crew-lb-empty">No runs recorded yet for this hero.</p>';
      } else {
        list.innerHTML = runs
          .map((r, i) => {
            const build = r.weapons.map((w) => `${w.weaponId} L${w.level}`).join(', ');
            const date = new Date(r.timestamp).toLocaleDateString();
            return `<div class="crew-lb-row">
              <strong>#${i + 1}</strong>
              <span>${formatSurvivalTime(r.survivalTime)}</span>
              <span>K ${r.kills}</span>
              <span>L${r.level}</span>
              <span>B ${r.bossesDefeated}</span>
              <span class="crew-lb-meta">${date} · ${r.balanceVersion}</span>
              <span class="crew-lb-build">${build}</span>
            </div>`;
          })
          .join('');
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
    this.selectedIndex = index;
    const hero = HERO_LIST[index]!;
    document.documentElement.style.setProperty('--bay-accent', hero.accent);

    const num = this.hud?.querySelector('#selected-number');
    const name = this.hud?.querySelector('#selected-hero');
    const species = this.hud?.querySelector('#selected-species');
    if (num) num.textContent = `${String(index + 1).padStart(2, '0')} / 04`;
    if (name) name.textContent = hero.name;
    if (species) species.textContent = hero.species;

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
  }

  private continue(): void {
    const hero = HERO_LIST[this.selectedIndex]!;
    this.handlers.onContinue(hero.id);
  }

  private launchSurvivor(): void {
    const hero = HERO_LIST[this.selectedIndex]!;
    if (this.handlers.onSurvivor) this.handlers.onSurvivor(hero.id);
    else this.handlers.onContinue(hero.id);
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
      object.rotation.y += 0.0015;
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
    this.hud?.remove();
    this.loading?.remove();
    this.hud = null;
    this.loading = null;
    this.scene?.clear();
    this.assets.dispose();
    this.renderer?.dispose();
    this.renderer = null;
    this.scene = null;
    this.camera = null;
  }
}

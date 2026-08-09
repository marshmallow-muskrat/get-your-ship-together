import { HEROES } from '../../content/heroes';
import {
  PASSIVES,
  SURVIVOR,
  SURVIVOR_BALANCE_VERSION,
  WEAPONS,
  formatOverclockLabel,
  overclockLevel,
} from './survivorContent';
import type { SurvivorState } from './survivorState';
import {
  ACTION_LABELS,
  REBINDABLE_ACTIONS,
  formatKeyCode,
  type ActionId,
  type KeybindMap,
} from './survivorKeybinds';
import {
  formatSurvivalTime,
  getHeroLeaderboard,
  makeRunSummary,
  recordRun,
} from './survivorRecords';
import { aliveBossCount, primaryBoss } from './survivorState';
import type { HeroId } from '../../content/heroes';

export type HudPublishOpts = {
  settingsOpen: boolean;
  rebinding: ActionId | null;
  keybinds: KeybindMap;
};

export class SurvivorHud {
  private root: HTMLElement;
  private dmgLayer: HTMLElement;
  private onRestart: () => void;
  private onCrew: () => void;
  private onChoice: (i: number) => void;
  private onResume: () => void;
  private onOpenSettings: () => void;
  private onCloseSettings: () => void;
  private onStartRebind: (a: ActionId) => void;
  private onResetKeybinds: () => void;
  private onUiScale: (s: number) => void;
  private onOpenLeaderboard: () => void;
  private getKeybinds: () => KeybindMap;
  private projectWorld: (x: number, z: number) => { x: number; y: number } | null;
  private lastChoicesKey = '';
  private helpTimer = 0;
  private helpHidden = false;
  private startedAt = performance.now();
  private dmgPool: HTMLElement[] = [];
  private lastWeaponsKey = '';
  private lastBindKey = '';
  private settingsOpen = false;
  private rebinding: ActionId | null = null;

  constructor(
    host: HTMLElement,
    handlers: {
      onRestart: () => void;
      onCrew: () => void;
      onChoice: (i: number) => void;
      onResume: () => void;
      onOpenSettings: () => void;
      onCloseSettings: () => void;
      onStartRebind: (a: ActionId) => void;
      onResetKeybinds: () => void;
      onUiScale?: (s: number) => void;
      onOpenLeaderboard?: () => void;
      getKeybinds: () => KeybindMap;
      projectWorld: (x: number, z: number) => { x: number; y: number } | null;
    },
  ) {
    this.onRestart = handlers.onRestart;
    this.onCrew = handlers.onCrew;
    this.onChoice = handlers.onChoice;
    this.onResume = handlers.onResume;
    this.onOpenSettings = handlers.onOpenSettings;
    this.onCloseSettings = handlers.onCloseSettings;
    this.onStartRebind = handlers.onStartRebind;
    this.onResetKeybinds = handlers.onResetKeybinds;
    this.onUiScale = handlers.onUiScale ?? (() => undefined);
    this.onOpenLeaderboard = handlers.onOpenLeaderboard ?? (() => undefined);
    this.getKeybinds = handlers.getKeybinds;
    this.projectWorld = handlers.projectWorld;
    this.root = document.createElement('section');
    this.root.className = 'survivor-hud';
    this.root.innerHTML = `
      <div class="sv-top">
        <div class="sv-identity">
          <span class="eyebrow">CONTAINMENT PROTOCOL</span>
          <strong id="sv-hero">—</strong>
        </div>
        <div class="sv-timer-wrap">
          <div id="sv-boss" class="sv-boss hidden">
            <span class="eyebrow"><span id="sv-boss-name">CONTAINMENT BREACH</span> · P<span id="sv-boss-phase">1</span></span>
            <div class="sv-track boss"><i id="sv-boss-hp"></i></div>
          </div>
          <div id="sv-miniboss" class="sv-miniboss hidden">
            <span class="eyebrow" id="sv-mb-name">WARDEN</span>
            <div class="sv-track miniboss"><i id="sv-mb-hp"></i></div>
          </div>
          <span class="eyebrow">SURVIVAL TIME</span>
          <strong id="sv-timer">00:00</strong>
          <div id="sv-inbound" class="sv-inbound hidden">CONTAINMENT BREACH</div>
          <div id="sv-bosses-active" class="sv-bosses-active hidden"></div>
          <div id="sv-bosses-queued" class="sv-bosses-active hidden"></div>
        </div>
        <div class="sv-meta">
          <span>LVL <strong id="sv-level">1</strong></span>
          <span>KILLS <strong id="sv-kills">0</strong></span>
          <span>BOSSES <strong id="sv-bosses">0</strong></span>
        </div>
      </div>

      <div id="sv-aegis-float" class="sv-aegis-float hidden">
        <span class="sv-aegis-icon" aria-hidden="true">◈</span>
        <div class="sv-aegis-body">
          <span class="eyebrow">AEGIS</span>
          <span id="sv-shield-num" class="sv-num">0</span>
          <div class="sv-track shield"><i id="sv-shield"></i></div>
        </div>
      </div>
      <div class="sv-command">
        <div class="sv-vitals">
          <div class="sv-vital">
            <div class="sv-vital-label">
              <span class="eyebrow">INTEGRITY</span>
              <span id="sv-hp-num" class="sv-num">100 / 100</span>
            </div>
            <div class="sv-track"><i id="sv-hp"></i></div>
          </div>
          <div class="sv-vital">
            <div class="sv-vital-label">
              <span class="eyebrow">ENERGY <span id="sv-lvl-inline">LVL 1</span></span>
              <span id="sv-xp-num" class="sv-num">0 / 12</span>
            </div>
            <div class="sv-track xp"><i id="sv-xp"></i></div>
          </div>
        </div>
        <div class="sv-abilities">
          <button type="button" class="sv-ability" id="sv-ab-dodge" disabled tabindex="-1">
            <span class="sv-ab-key" id="sv-key-dodge">SPC</span>
            <span class="sv-ab-name">DODGE</span>
            <span class="sv-ab-state" id="sv-dodge-state">READY</span>
          </button>
          <button type="button" class="sv-ability" id="sv-ab-q" disabled tabindex="-1">
            <span class="sv-ab-key" id="sv-key-repulsor">Q</span>
            <span class="sv-ab-name">REPULSE</span>
            <span class="sv-ab-state" id="sv-q-state">READY</span>
          </button>
          <button type="button" class="sv-ability" id="sv-ab-e" disabled tabindex="-1">
            <span class="sv-ab-key" id="sv-key-ship">E</span>
            <span class="sv-ab-name">SHIP</span>
            <span class="sv-ab-state" id="sv-e-state">READY</span>
          </button>
          <button type="button" class="sv-ability ultimate" id="sv-ab-r" disabled tabindex="-1">
            <span class="sv-ab-key" id="sv-key-mech">R</span>
            <span class="sv-ab-name">MECH CORE</span>
            <span class="sv-ab-state" id="sv-r-state">0%</span>
          </button>
        </div>
      </div>
      <div id="sv-build" class="sv-build"></div>
      <div id="sv-mech-toast" class="sv-mech-toast hidden">MECH CORE READY</div>

      <div id="sv-metrics" class="sv-metrics hidden"></div>
      <div id="sv-dmg" class="sv-dmg-layer"></div>

      <div id="sv-pause" class="sv-modal sv-pause hidden">
        <p class="eyebrow">SYSTEM HOLD</p>
        <h2>Paused</h2>
        <div class="sv-end-actions sv-pause-actions">
          <button type="button" id="sv-resume" class="sv-btn">RESUME</button>
          <button type="button" id="sv-settings" class="sv-btn">SETTINGS</button>
          <button type="button" id="sv-leaderboard" class="sv-btn ghost">LEADERBOARDS</button>
          <button type="button" id="sv-pause-restart" class="sv-btn ghost">RESTART RUN</button>
          <button type="button" id="sv-pause-crew" class="sv-btn ghost">CREW SELECT</button>
        </div>
      </div>

      <div id="sv-settings-modal" class="sv-modal sv-settings hidden">
        <p class="eyebrow">CONFIGURATION</p>
        <h2>Controls</h2>
        <p class="sv-settings-hint" id="sv-rebind-hint">Click a row, then press a key. Escape cancels capture.</p>
        <div class="sv-ui-scale-row">
          <label class="eyebrow" for="sv-ui-scale">UI SCALE</label>
          <div class="sv-ui-scale-controls">
            <input type="range" id="sv-ui-scale" min="75" max="150" step="5" value="100" />
            <span id="sv-ui-scale-val">100%</span>
          </div>
        </div>
        <div id="sv-bind-list" class="sv-bind-list"></div>
        <div class="sv-end-actions">
          <button type="button" id="sv-reset-binds" class="sv-btn ghost">RESET TO DEFAULTS</button>
          <button type="button" id="sv-close-settings" class="sv-btn">BACK</button>
        </div>
      </div>
      <div id="sv-leaderboard-modal" class="sv-modal sv-leaderboard hidden">
        <p class="eyebrow">LOCAL RECORDS</p>
        <h2>Leaderboards</h2>
        <div id="sv-lb-tabs" class="sv-lb-tabs"></div>
        <div id="sv-lb-list" class="sv-lb-list"></div>
        <div class="sv-end-actions">
          <button type="button" id="sv-close-lb" class="sv-btn">BACK</button>
        </div>
      </div>

      <div id="sv-banner-arc" class="sv-unlock-banner hidden">PROTOTYPE UNLOCKED · ARC CONDUCTOR</div>
      <div id="sv-banner-orbital" class="sv-unlock-banner hidden">PROTOTYPE UNLOCKED · ORBITAL LANCE</div>
      <div id="sv-banner-mega" class="sv-unlock-banner mega hidden">MEGA BREACH</div>
      <div id="sv-cache-arrow" class="sv-cache-arrow hidden">
        <span class="sv-cache-icon" aria-hidden="true">
          <svg viewBox="0 0 32 32" width="28" height="28" focusable="false">
            <path d="M16 2 L28 16 L20 16 L20 30 L12 30 L12 16 L4 16 Z" fill="currentColor"/>
          </svg>
        </span>
        <div class="sv-cache-text">
          <span class="sv-cache-label">CACHE</span>
          <span class="sv-cache-meta">—</span>
        </div>
      </div>
      <div id="sv-levelup" class="sv-modal hidden">
        <p class="eyebrow">SYSTEM UPLINK</p>
        <h2>Choose Upgrade</h2>
        <div id="sv-choices" class="sv-choices"></div>
      </div>
      <div id="sv-protocol" class="sv-modal sv-protocol-modal hidden">
        <p class="eyebrow">PROTOCOL CACHE</p>
        <h2>Select Protocol</h2>
        <div id="sv-protocol-choices" class="sv-choices"></div>
      </div>
      <div id="sv-end" class="sv-modal hidden">
        <p class="eyebrow" id="sv-end-eye">RUN COMPLETE</p>
        <h2 id="sv-end-title">Victory</h2>
        <p id="sv-end-body"></p>
        <p id="sv-end-record" class="sv-end-record hidden">NEW RECORD</p>
        <div id="sv-end-build" class="sv-end-build"></div>
        <div class="sv-end-actions">
          <button type="button" id="sv-restart" class="sv-btn">RUN AGAIN</button>
          <button type="button" id="sv-end-lb" class="sv-btn ghost">LEADERBOARDS</button>
          <button type="button" id="sv-crew" class="sv-btn ghost">CREW SELECT</button>
        </div>
      </div>
      <div id="sv-help" class="sv-help">
        <span id="sv-help-move">WASD move · auto fire</span>
        <span id="sv-help-abil">abilities</span>
        <span id="sv-help-pause">pause</span>
      </div>
    `;
    host.appendChild(this.root);
    this.dmgLayer = this.root.querySelector('#sv-dmg') as HTMLElement;

    this.root.querySelector('#sv-restart')?.addEventListener('click', this.onRestart);
    this.root.querySelector('#sv-crew')?.addEventListener('click', this.onCrew);
    this.root.querySelector('#sv-resume')?.addEventListener('click', this.onResume);
    this.root.querySelector('#sv-settings')?.addEventListener('click', this.onOpenSettings);
    this.root.querySelector('#sv-pause-restart')?.addEventListener('click', this.onRestart);
    this.root.querySelector('#sv-pause-crew')?.addEventListener('click', this.onCrew);
    this.root.querySelector('#sv-close-settings')?.addEventListener('click', this.onCloseSettings);
    this.root.querySelector('#sv-reset-binds')?.addEventListener('click', this.onResetKeybinds);

    this.buildBindList();
    this.root.querySelector('#sv-leaderboard')?.addEventListener('click', () => this.setLeaderboardOpen(true));
    this.root.querySelector('#sv-end-lb')?.addEventListener('click', () => this.setLeaderboardOpen(true));
    this.root.querySelector('#sv-close-lb')?.addEventListener('click', () => this.setLeaderboardOpen(false));
    const scale = this.root.querySelector<HTMLInputElement>('#sv-ui-scale');
    scale?.addEventListener('input', () => {
      const v = Number(scale.value) / 100;
      const lab = this.root.querySelector('#sv-ui-scale-val');
      if (lab) lab.textContent = `${scale.value}%`;
      this.onUiScale(v);
    });
  }

  setUiScale(scale: number): void {
    document.documentElement.style.setProperty('--ui-scale', String(scale));
    const el = this.root.querySelector<HTMLInputElement>('#sv-ui-scale');
    if (el) el.value = String(Math.round(scale * 100));
    const lab = this.root.querySelector('#sv-ui-scale-val');
    if (lab) lab.textContent = `${Math.round(scale * 100)}%`;
  }

  setLeaderboardOpen(open: boolean): void {
    const modal = this.root.querySelector('#sv-leaderboard-modal');
    modal?.classList.toggle('hidden', !open);
    if (open) this.renderLeaderboard(this._lbHero);
  }

  private _lbHero: import('../../content/heroes').HeroId = 'bee';

  private renderLeaderboard(hero: HeroId): void {
    this._lbHero = hero;
    const tabs = this.root.querySelector('#sv-lb-tabs');
    const list = this.root.querySelector('#sv-lb-list');
    if (tabs) {
      const names: Record<HeroId, string> = {
        bee: 'Bee',
        flamingo: 'Flamingo',
        frog: 'Frog',
        'red-panda': 'Red Panda',
      };
      tabs.innerHTML = (['bee', 'flamingo', 'frog', 'red-panda'] as HeroId[])
        .map(
          (h) =>
            `<button type="button" class="sv-lb-tab${h === hero ? ' active' : ''}" data-hero="${h}">${names[h]}</button>`,
        )
        .join('');
      tabs.querySelectorAll<HTMLButtonElement>('.sv-lb-tab').forEach((btn) => {
        btn.addEventListener('click', () => this.renderLeaderboard(btn.dataset.hero as HeroId));
      });
    }
    if (list) {
      // Sanitize via textContent builders — never interpolate untrusted strings into HTML.
      list.replaceChildren();
      const runs = getHeroLeaderboard(hero);
      if (runs.length === 0) {
        const empty = document.createElement('p');
        empty.className = 'sv-lb-empty';
        empty.textContent = `No ${SURVIVOR_BALANCE_VERSION} runs yet. Older scores are archived by balance version.`;
        list.appendChild(empty);
      } else {
        runs.forEach((r, i) => {
          const row = document.createElement('div');
          row.className = 'sv-lb-row';
          const add = (tag: string, text: string, cls?: string) => {
            const el = document.createElement(tag);
            if (cls) el.className = cls;
            el.textContent = text;
            row.appendChild(el);
          };
          add('strong', `#${i + 1}`);
          add('span', formatSurvivalTime(r.survivalTime));
          add('span', `K ${r.kills}`);
          add('span', `L${r.level}`);
          add('span', `B ${r.bossesDefeated}`);
          add(
            'span',
            `${new Date(r.timestamp).toLocaleDateString()} · ${r.balanceVersion}`,
            'sv-lb-meta',
          );
          const build = r.weapons.map((w) => `${w.weaponId} L${w.level}`).join(', ');
          add('span', build, 'sv-lb-build');
          list.appendChild(row);
        });
      }
    }
  }

  setSettingsOpen(open: boolean): void {
    this.settingsOpen = open;
    this.root.querySelector('#sv-settings-modal')?.classList.toggle('hidden', !open);
  }

  setRebinding(action: ActionId | null): void {
    this.rebinding = action;
    const hint = this.root.querySelector('#sv-rebind-hint');
    if (hint) {
      hint.textContent = action
        ? `Press a key for ${ACTION_LABELS[action]}… (Esc cancels)`
        : 'Click a row, then press a key. Escape cancels capture. Conflicts swap.';
    }
    this.root.querySelectorAll('.sv-bind-row').forEach((row) => {
      row.classList.toggle('capturing', row.getAttribute('data-action') === action);
    });
  }

  refreshKeybindLabels(binds: KeybindMap): void {
    const set = (id: string, text: string) => {
      const el = this.root.querySelector(`#${id}`);
      if (el) el.textContent = text;
    };
    set('sv-key-dodge', formatKeyCode(binds.dodge));
    set('sv-key-repulsor', formatKeyCode(binds.repulsor));
    set('sv-key-ship', formatKeyCode(binds.ship));
    set('sv-key-mech', formatKeyCode(binds.mech));
    set(
      'sv-help-move',
      `${formatKeyCode(binds.moveUp)}${formatKeyCode(binds.moveLeft)}${formatKeyCode(binds.moveDown)}${formatKeyCode(binds.moveRight)} move · auto fire`,
    );
    set(
      'sv-help-abil',
      `<${formatKeyCode(binds.repulsor)}> Repulsor · <${formatKeyCode(binds.ship)}> Ship · <${formatKeyCode(binds.mech)}> Mech · ${formatKeyCode(binds.choice1)}/${formatKeyCode(binds.choice2)}/${formatKeyCode(binds.choice3)} upgrades`.replace(
        /[<>]/g,
        '',
      ),
    );
    // rebuild help with kbd tags properly
    const helpAbil = this.root.querySelector('#sv-help-abil');
    if (helpAbil) {
      helpAbil.innerHTML = `<kbd>${formatKeyCode(binds.dodge)}</kbd> Dodge · <kbd>${formatKeyCode(binds.repulsor)}</kbd> Repulsor · <kbd>${formatKeyCode(binds.ship)}</kbd> Ship · <kbd>${formatKeyCode(binds.mech)}</kbd> Mech · <kbd>${formatKeyCode(binds.choice1)}</kbd><kbd>${formatKeyCode(binds.choice2)}</kbd><kbd>${formatKeyCode(binds.choice3)}</kbd> upgrades`;
    }
    const helpPause = this.root.querySelector('#sv-help-pause');
    if (helpPause) {
      helpPause.innerHTML = `<kbd>${formatKeyCode(binds.pause)}</kbd> pause · Settings in pause menu`;
    }
    this.buildBindList();
    this.lastBindKey = JSON.stringify(binds);
  }

  private buildBindList(): void {
    const list = this.root.querySelector('#sv-bind-list');
    if (!list) return;
    const binds = this.getKeybinds();
    list.innerHTML = REBINDABLE_ACTIONS.map(
      (a) =>
        `<button type="button" class="sv-bind-row${this.rebinding === a ? ' capturing' : ''}" data-action="${a}">
          <span class="sv-bind-label">${ACTION_LABELS[a]}</span>
          <span class="sv-bind-key">${formatKeyCode(binds[a])}</span>
        </button>`,
    ).join('');
    list.querySelectorAll<HTMLButtonElement>('.sv-bind-row').forEach((btn) => {
      btn.addEventListener('click', () => {
        const action = btn.dataset.action as ActionId;
        this.onStartRebind(action);
      });
    });
  }

  publish(state: SurvivorState, showMetrics = false, opts?: HudPublishOpts): void {
    if (opts) {
      this.settingsOpen = opts.settingsOpen;
      this.rebinding = opts.rebinding;
      const bk = JSON.stringify(opts.keybinds);
      if (bk !== this.lastBindKey) {
        this.refreshKeybindLabels(opts.keybinds);
      }
    }
    const binds = opts?.keybinds ?? this.getKeybinds();
    const hero = HEROES[state.heroId];
    this.root.style.setProperty('--hud-accent', state.accent);
    const set = (id: string, text: string) => {
      const el = this.root.querySelector(`#${id}`);
      if (el) el.textContent = text;
    };
    set('sv-hero', hero.fullName);
    set('sv-level', String(state.level));
    set('sv-kills', String(state.kills));
    set('sv-bosses', String(state.bossesDefeated));
    set('sv-lvl-inline', `LVL ${state.level}`);
    this._lbHero = state.heroId;

    set('sv-timer', formatSurvivalTime(state.time));
    const inbound = this.root.querySelector('#sv-inbound');
    if (inbound) {
      inbound.classList.toggle('hidden', state.inboundBanner <= 0);
      if (state.inboundBanner > 0) {
        const pb = primaryBoss(state);
        inbound.textContent = pb
          ? `BOSS INBOUND · ${pb.displayName.toUpperCase()}`
          : 'CONTAINMENT BREACH';
      }
    }
    const ba = this.root.querySelector('#sv-bosses-active');
    const nBoss = aliveBossCount(state);
    if (ba) {
      ba.classList.toggle('hidden', nBoss < 2);
      if (nBoss >= 2) ba.textContent = `BOSSES ACTIVE: ${nBoss}`;
    }
    // Boss backlog has exactly one source of truth.
    const bq = this.root.querySelector('#sv-bosses-queued');
    const nQueued = state.pendingBossIndices.length;
    if (bq) {
      bq.classList.toggle('hidden', nQueued < 1);
      if (nQueued >= 1) bq.textContent = `BREACH QUEUE: ${nQueued}`;
    }

    const p = state.player;
    const hp = this.root.querySelector<HTMLElement>('#sv-hp');
    if (hp) hp.style.width = `${(p.health / p.maxHealth) * 100}%`;
    set('sv-hp-num', `${Math.ceil(p.health)} / ${Math.ceil(p.maxHealth)}`);

    const xp = this.root.querySelector<HTMLElement>('#sv-xp');
    if (xp) xp.style.width = `${Math.min(100, (state.xp / state.xpNext) * 100)}%`;
    set('sv-xp-num', `${Math.floor(state.xp)} / ${state.xpNext}`);

    this.publishAbilities(state);
    this.publishShield(state);
    this.publishBanners(state);
    this.publishProtocol(state);
    this.publishBossBars(state);
    this.publishWeapons(state);
    this.publishPause(state);
    this.root.querySelector('#sv-settings-modal')?.classList.toggle('hidden', !this.settingsOpen);

    const metrics = this.root.querySelector('#sv-metrics');
    if (metrics) {
      metrics.classList.toggle('hidden', !showMetrics);
      if (showMetrics) {
        const m = state.metrics;
        metrics.textContent =
          `FPS ${m.fps.toFixed(0)} · ${m.frameMs.toFixed(1)}ms · ` +
          `E ${m.enemies} · P ${m.projectiles} · K ${m.pickups}\n` +
          `geo ${m.geometries} · tex ${m.textures} · prog ${m.programs} · draws ${m.drawCalls}\n` +
          `fx ${m.effects} · atk ${m.attacks} · rail ${m.railPool}`;
      }
    }

    this.publishLevelUp(state, binds);
    this.publishEnd(state);
    this.publishDamage(state);
    this.publishHelp();
  }

  private formatCd(seconds: number): string {
    if (seconds > 10) return `${Math.ceil(seconds)}s`;
    return `${seconds.toFixed(1)}s`;
  }

  private publishAbilities(state: SurvivorState): void {
    const p = state.player;
    const dEl = this.root.querySelector('#sv-ab-dodge');
    const dState = this.root.querySelector('#sv-dodge-state');
    const dReady = p.dodgeCd <= 0 && p.form !== 'ship' && p.alive && p.dodgeActive <= 0;
    dEl?.classList.toggle('ready', dReady);
    dEl?.classList.toggle('pulse-ready', dReady);
    dEl?.classList.toggle('blocked', p.form === 'ship');
    dEl?.classList.toggle('cooling', p.dodgeCd > 0);
    if (dState) {
      if (p.form === 'ship') dState.textContent = 'SHIP';
      else if (p.dodgeActive > 0) dState.textContent = 'DASH';
      else if (p.dodgeCd > 0) dState.textContent = this.formatCd(p.dodgeCd);
      else dState.textContent = 'READY';
    }
    this.setCooldownOverlay(dEl, p.dodgeCd, SURVIVOR.dodge.cooldown);

    // Mech ready flourish
    if (p.mechCharge >= 1 && !p.mechReadyAnnounced && p.form === 'astronaut' && state.phase === 'playing') {
      p.mechReadyAnnounced = true;
      const toast = this.root.querySelector('#sv-mech-toast');
      if (toast) {
        toast.classList.remove('hidden');
        window.setTimeout(() => toast.classList.add('hidden'), 2000);
      }
      this.root.querySelector('#sv-ab-r')?.classList.add('mech-flourish');
      window.setTimeout(() => this.root.querySelector('#sv-ab-r')?.classList.remove('mech-flourish'), 900);
    }

    const qEl = this.root.querySelector('#sv-ab-q');
    const eEl = this.root.querySelector('#sv-ab-e');
    const rEl = this.root.querySelector('#sv-ab-r');
    const qState = this.root.querySelector('#sv-q-state');
    const eState = this.root.querySelector('#sv-e-state');
    const rState = this.root.querySelector('#sv-r-state');

    const qReady = p.repulsorCd <= 0 && p.form !== 'ship' && p.alive;
    const qBlocked = p.form === 'ship';
    qEl?.classList.toggle('ready', qReady);
    qEl?.classList.toggle('pulse-ready', qReady);
    qEl?.classList.toggle('blocked', qBlocked);
    qEl?.classList.toggle('cooling', p.repulsorCd > 0);
    if (qState) {
      if (qBlocked) qState.textContent = 'SHIP';
      else if (p.repulsorCd > 0) qState.textContent = this.formatCd(p.repulsorCd);
      else qState.textContent = 'READY';
    }
    this.setCooldownOverlay(qEl, p.repulsorCd, SURVIVOR.repulsor.cooldown);

    const eReady = p.shipCd <= 0 && p.form === 'astronaut' && p.alive;
    const eActive = p.form === 'ship';
    const eBlocked = p.form === 'mech';
    eEl?.classList.toggle('ready', eReady);
    eEl?.classList.toggle('pulse-ready', eReady);
    eEl?.classList.toggle('active', eActive);
    eEl?.classList.toggle('blocked', eBlocked);
    eEl?.classList.toggle('cooling', p.shipCd > 0 && !eActive);
    if (eState) {
      if (eActive) eState.textContent = `${Math.max(0, p.shipDuration).toFixed(1)}s`;
      else if (eBlocked) eState.textContent = 'MECH';
      else if (p.shipCd > 0) eState.textContent = this.formatCd(p.shipCd);
      else eState.textContent = 'READY';
    }
    if (eActive) this.setCooldownOverlay(eEl, 0, 1);
    else this.setCooldownOverlay(eEl, p.shipCd, SURVIVOR.ship.cooldown);

    const rActive = p.form === 'mech';
    const rReady = p.mechCharge >= 1 && p.form === 'astronaut' && p.alive;
    const rBlocked = p.form === 'ship';
    rEl?.classList.toggle('ready', rReady);
    rEl?.classList.toggle('pulse-ready', rReady);
    rEl?.classList.toggle('active', rActive);
    rEl?.classList.toggle('blocked', rBlocked);
    if (rState) {
      if (rActive) rState.textContent = `${Math.max(0, p.mechDuration).toFixed(1)}s`;
      else if (rBlocked) rState.textContent = 'SHIP';
      else if (rReady) rState.textContent = 'READY';
      else rState.textContent = `${Math.floor(p.mechCharge * 100)}%`;
    }
    if (rActive) {
      this.setCooldownOverlay(rEl, SURVIVOR.mech.duration - p.mechDuration, SURVIVOR.mech.duration);
    } else {
      this.setChargeOverlay(rEl, p.mechCharge);
    }
  }

  private setCooldownOverlay(el: Element | null | undefined, remaining: number, max: number): void {
    if (!(el instanceof HTMLElement)) return;
    if (remaining <= 0 || max <= 0) {
      el.style.setProperty('--cd', '0deg');
      el.classList.remove('on-cd');
      return;
    }
    const pct = Math.min(1, remaining / max);
    el.style.setProperty('--cd', `${pct * 360}deg`);
    el.classList.add('on-cd');
  }

  private setChargeOverlay(el: Element | null | undefined, charge: number): void {
    if (!(el instanceof HTMLElement)) return;
    const pct = Math.min(1, Math.max(0, 1 - charge));
    el.style.setProperty('--cd', `${pct * 360}deg`);
    el.classList.toggle('on-cd', charge < 1);
    el.classList.toggle('charged', charge >= 1);
  }


  private publishShield(state: SurvivorState): void {
    // Independent float above command HUD — never reflows vitals/abilities.
    const row = this.root.querySelector('#sv-aegis-float');
    const p = state.player;
    const show = p.shieldPoints > 0 && p.shieldTime > 0;
    row?.classList.toggle('hidden', !show);
    if (show) {
      const bar = this.root.querySelector<HTMLElement>('#sv-shield');
      if (bar && p.shieldMax > 0) bar.style.width = `${(p.shieldPoints / p.shieldMax) * 100}%`;
      const num = this.root.querySelector('#sv-shield-num');
      if (num) num.textContent = `${Math.ceil(p.shieldPoints)} · ${Math.ceil(p.shieldTime)}s`;
    }
  }

  private publishBanners(state: SurvivorState): void {
    this.root.querySelector('#sv-banner-arc')?.classList.toggle('hidden', state.unlocks.arcBanner <= 0);
    this.root.querySelector('#sv-banner-orbital')?.classList.toggle('hidden', state.unlocks.orbitalBanner <= 0);
    this.root.querySelector('#sv-banner-mega')?.classList.toggle('hidden', state.megaBanner <= 0);
    const arrow = this.root.querySelector('#sv-cache-arrow');
    if (arrow) {
      const show = state.cache.active && state.phase === 'playing';
      arrow.classList.toggle('hidden', !show);
      if (show) {
        const dx = state.cache.x - state.player.x;
        const dz = state.cache.z - state.player.z;
        const dist = Math.hypot(dx, dz);
        // Screen-basis: world +Z is "up-right" on isometric; use atan2 for edge marker.
        const ang = Math.atan2(dx, -dz);
        // Keep label horizontal — rotate only the icon.
        (arrow as HTMLElement).style.transform = 'translateX(-50%)';
        const icon = arrow.querySelector('.sv-cache-icon') as HTMLElement | null;
        if (icon) icon.style.transform = `rotate(${(ang * 180) / Math.PI}deg)`;
        const label = arrow.querySelector('.sv-cache-label');
        if (label) label.textContent = 'CACHE';
        const meta = arrow.querySelector('.sv-cache-meta');
        if (meta) {
          const lifeBit =
            state.cache.mega || state.cache.life > 100
              ? '∞'
              : `${Math.max(0, Math.ceil(state.cache.life))}s`;
          meta.textContent = `— ${lifeBit} · ${dist.toFixed(0)}m`;
        }
        // Edge-clamped offset toward cache direction without covering center combat HUD.
        const el = arrow as HTMLElement;
        const ox = Math.sin(ang) * 42;
        const oy = -Math.cos(ang) * 18;
        el.style.marginLeft = `${ox}px`;
        el.style.marginTop = `${oy}px`;
      }
    }
  }

  private lastProtocolKey = '';
  private publishProtocol(state: SurvivorState): void {
    const modal = this.root.querySelector('#sv-protocol');
    if (!modal) return;
    const open = state.phase === 'protocol';
    modal.classList.toggle('hidden', !open);
    if (!open) {
      this.lastProtocolKey = '';
      return;
    }
    const key = state.protocolChoices.map((c) => c.id).join('|');
    if (key === this.lastProtocolKey) return;
    this.lastProtocolKey = key;
    const box = this.root.querySelector('#sv-protocol-choices');
    if (!box) return;
    box.innerHTML = state.protocolChoices
      .map(
        (c, i) =>
          `<button type="button" class="sv-choice protocol" data-i="${i}">
            <span class="eyebrow">PROTOCOL · ${i + 1}</span>
            <strong>${c.title}</strong>
            <small>${c.body}</small>
          </button>`,
      )
      .join('');
    box.querySelectorAll<HTMLButtonElement>('.sv-choice').forEach((btn) => {
      btn.addEventListener('pointerdown', (ev) => {
        ev.preventDefault();
        this.onChoice(Number(btn.dataset.i));
      });
    });
  }

  private publishBossBars(state: SurvivorState): void {
    const pb = primaryBoss(state);
    const boss = this.root.querySelector('#sv-boss');
    if (boss) {
      boss.classList.toggle('hidden', !pb);
      const bh = this.root.querySelector<HTMLElement>('#sv-boss-hp');
      if (bh && pb && pb.maxHealth > 0) {
        bh.style.width = `${(pb.health / pb.maxHealth) * 100}%`;
      }
      const phase = this.root.querySelector('#sv-boss-phase');
      if (phase && pb) phase.textContent = String(pb.phase);
      const bname = this.root.querySelector('#sv-boss-name');
      if (bname) bname.textContent = pb ? pb.displayName.toUpperCase() : 'CONTAINMENT BREACH';
      boss.classList.toggle('mega', !!(pb && pb.isMega));
    }
    const mb = this.root.querySelector('#sv-miniboss');
    if (mb) {
      mb.classList.toggle('hidden', !state.miniboss.alive);
      const name = this.root.querySelector('#sv-mb-name');
      if (name) name.textContent = state.miniboss.name.toUpperCase();
      const bar = this.root.querySelector<HTMLElement>('#sv-mb-hp');
      if (bar && state.miniboss.maxHealth > 0) {
        bar.style.width = `${(state.miniboss.health / state.miniboss.maxHealth) * 100}%`;
      }
    }
  }

  private publishWeapons(state: SurvivorState): void {
    const key =
      state.weapons.map((w) => `${w.weaponId}:${w.level}`).join('|') +
      '|' +
      Object.entries(state.passives)
        .map(([k, v]) => `${k}:${v}`)
        .join('|') +
      '|' +
      state.tempBuffs.map((t) => `${t.id}:${t.remaining.toFixed(0)}`).join('|') +
      '|' +
      state.protocolActive.map((t) => `${t.id}:${t.remaining.toFixed(0)}`).join('|') +
      `|sh:${state.player.shieldPoints.toFixed(0)}`;
    if (key === this.lastWeaponsKey) return;
    this.lastWeaponsKey = key;
    const build = this.root.querySelector('#sv-build');
    if (!build) return;
    const weps = state.weapons
      .map((w) => {
        const fam = WEAPONS[w.weaponId];
        const oc = overclockLevel(w.level);
        const ocBit =
          oc > 0
            ? `<small class="sv-build-oc">${formatOverclockLabel(oc)} · Dmg +${Math.round(oc * 8)}%</small>`
            : '';
        const proto = w.prototype || fam.prototype ? ' · PROTO' : '';
        return `<div class="sv-build-item" style="--wep:${fam.color}"><span>${fam.name}${proto}${ocBit}</span><strong>L${w.level}</strong></div>`;
      })
      .join('');
    const pass = Object.entries(state.passives)
      .filter(([, lv]) => (lv ?? 0) > 0)
      .map(([id, lv]) => {
        const def = PASSIVES.find((p) => p.id === id);
        const capped =
          def && Number.isFinite(def.maxLevel) && (lv ?? 0) >= def.maxLevel ? ' MAX' : '';
        return `<div class="sv-build-item passive"><span>${def?.name ?? id}</span><strong>L${lv}${capped}</strong></div>`;
      })
      .join('');
    const protos = state.protocolActive
      .map(
        (t) =>
          `<div class="sv-build-item temp protocol-fx"><span>${t.id.replace(/-/g, ' ')}</span><strong>${Math.ceil(t.remaining)}s</strong></div>`,
      )
      .join('');
    const shield =
      state.player.shieldPoints > 0
        ? `<div class="sv-build-item temp"><span>Aegis Shield</span><strong>${Math.ceil(state.player.shieldPoints)} · ${Math.ceil(state.player.shieldTime)}s</strong></div>`
        : '';
    const temps = state.tempBuffs
      .map(
        (t) =>
          `<div class="sv-build-item temp"><span>${t.id.replace(/-/g, ' ')}</span><strong>${Math.ceil(t.remaining)}s</strong></div>`,
      )
      .join('');
    const tempSection =
      protos || shield || temps
        ? `<div class="sv-build-section">TEMP / PROTOCOL</div>${protos}${shield}${temps}`
        : '';
    build.innerHTML = `<div class="eyebrow">BUILD</div><div class="sv-build-scroll"><div class="sv-build-section">WEAPONS</div>${weps || '<div class="sv-build-item"><span>None</span></div>'}<div class="sv-build-section">PASSIVES</div>${pass || '<div class="sv-build-item passive"><span>None</span></div>'}${tempSection}</div>`;
  }

  private publishPause(state: SurvivorState): void {
    const pause = this.root.querySelector('#sv-pause');
    if (!pause) return;
    const show = state.phase === 'paused' && !this.settingsOpen;
    pause.classList.toggle('hidden', !show);
  }

  private publishLevelUp(state: SurvivorState, binds: KeybindMap): void {
    const levelup = this.root.querySelector('#sv-levelup');
    if (!levelup) return;
    const open = state.phase === 'levelup';
    levelup.classList.toggle('hidden', !open);
    levelup.classList.toggle('sv-levelup-open', open);
    if (open) {
      const key = state.choices.map((c) => c.id).join('|') + formatKeyCode(binds.choice1);
      if (key !== this.lastChoicesKey) {
        this.lastChoicesKey = key;
        const box = this.root.querySelector('#sv-choices');
        if (box) {
          const labels = [
            formatKeyCode(binds.choice1),
            formatKeyCode(binds.choice2),
            formatKeyCode(binds.choice3),
          ];
          const kindLabel = (c: (typeof state.choices)[0]) => {
            if (c.kind === 'passive' && c.passiveId) {
              const owned = (state.passives[c.passiveId] ?? 0) > 0;
              return owned ? 'PASSIVE' : 'NEW PASSIVE';
            }
            if (c.kind === 'new-weapon') return 'NEW WEAPON';
            if (c.kind === 'protocol') return 'PROTOCOL';
            if (c.kind === 'weapon' && c.weaponId) {
              const slot = state.weapons.find((w) => w.weaponId === c.weaponId);
              if (slot && slot.level >= 5) return 'WEAPON OVERCLOCK';
            }
            return 'WEAPON';
          };
          box.innerHTML = state.choices
            .map(
              (c, i) =>
                `<button type="button" class="sv-choice" data-i="${i}">
                  <span class="eyebrow">${kindLabel(c)} · ${labels[i] ?? i + 1}</span>
                  <strong>${c.title}</strong>
                  <small>${c.body.replace(/\n/g, '<br/>')}</small>
                </button>`,
            )
            .join('');
          box.querySelectorAll<HTMLButtonElement>('.sv-choice').forEach((btn) => {
            btn.addEventListener('pointerdown', (ev) => {
              ev.preventDefault();
              ev.stopPropagation();
              this.onChoice(Number(btn.dataset.i));
            });
          });
        }
      }
    } else {
      this.lastChoicesKey = '';
    }
  }

  private publishEnd(state: SurvivorState): void {
    const end = this.root.querySelector('#sv-end');
    if (!end) return;
    const done = state.phase === 'defeat';
    end.classList.toggle('hidden', !done);
    if (done) {
      if (!state.runRecorded) {
        const summary = makeRunSummary({
          survivalTime: state.time,
          kills: state.kills,
          level: state.level,
          bossesDefeated: state.bossesDefeated,
          heroId: state.heroId,
          weapons: state.weapons,
          passives: state.passives,
        });
        const result = recordRun(summary);
        state.runRecorded = true;
        (this as { _lastRecord?: typeof result })._lastRecord = result;
      }
      const rec = (this as { _lastRecord?: ReturnType<typeof recordRun> })._lastRecord;
      const set = (id: string, text: string) => {
        const el = this.root.querySelector(`#${id}`);
        if (el) el.textContent = text;
      };
      set('sv-end-eye', 'CREW DOWN');
      set('sv-end-title', 'Run Complete');
      const prev = rec?.previousBest ?? 0;
      set(
        'sv-end-body',
        `Survived ${formatSurvivalTime(state.time)} · Best ${formatSurvivalTime(prev)} · L${state.level} · ${state.kills} kills · ${state.bossesDefeated} bosses · ${state.megasDefeated} mega`,
      );
      const nr = this.root.querySelector('#sv-end-record');
      if (nr) nr.classList.toggle('hidden', !(rec?.isNewOverall || rec?.isNewHeroBest));
      const eb = this.root.querySelector('#sv-end-build');
      if (eb) {
        eb.innerHTML = state.weapons
          .map((w) => `${WEAPONS[w.weaponId].name} L${w.level}`)
          .join(' · ');
      }
    }
  }

  private publishDamage(state: SurvivorState): void {
    while (this.dmgPool.length < state.damageEvents.length) {
      const n = document.createElement('span');
      n.className = 'sv-dmg';
      this.dmgLayer.appendChild(n);
      this.dmgPool.push(n);
    }
    for (let i = 0; i < this.dmgPool.length; i += 1) {
      const node = this.dmgPool[i]!;
      const ev = state.damageEvents[i];
      if (!ev) {
        node.classList.add('hidden');
        continue;
      }
      const scr = this.projectWorld(ev.x, ev.z);
      if (!scr) {
        node.classList.add('hidden');
        continue;
      }
      const t = 1 - ev.life / ev.maxLife;
      // scale pop: start large, settle
      const pop = 1 + (ev.pop || 0.5) * 0.4 * Math.exp(-t * 8);
      const drift = t * 42 + (ev.kind === 'kill' ? t * 12 : 0);
      node.classList.remove('hidden');
      node.className = `sv-dmg sv-dmg-${ev.kind}`;
      // Semantic labels: heal +, absorb BLOCK, otherwise raw amount.
      if (ev.kind === 'heal') node.textContent = `+${Math.round(ev.amount)}`;
      else if (ev.kind === 'absorb') node.textContent = `◈${Math.round(ev.amount)}`;
      else node.textContent = String(Math.round(ev.amount));
      const sizeScale = SURVIVOR.damageNumbers.sizeScale * 1.2;
      node.style.transform = `translate(-50%, -50%) translate(${scr.x + Math.sin(ev.id * 1.7) * 10}px, ${scr.y - drift}px) scale(${pop * sizeScale})`;
      node.style.opacity = String(Math.max(0, 1 - t * 1.05));
    }
  }

  private publishHelp(): void {
    if (this.helpHidden) return;
    this.helpTimer = (performance.now() - this.startedAt) / 1000;
    if (this.helpTimer > 7) {
      this.root.querySelector('#sv-help')?.classList.add('fade');
      this.helpHidden = true;
    }
  }

  dispose(): void {
    this.root.remove();
  }
}

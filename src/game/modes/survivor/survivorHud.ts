import { HEROES } from '../../content/heroes';
import {
  PASSIVES,
  SURVIVOR,
  SURVIVOR_BALANCE_VERSION,
  WEAPONS,
  formatOverclockLabel,
  isSignatureWeapon,
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
  DEATH_LOG_WINDOW,
  damageTakenLabel,
  deathLogEntries,
  formReport,
  sourceFormRows,
  sourceLabel,
  sourceReport,
} from './survivorTelemetry';
import {
  formatSurvivalTime,
  getHeroLeaderboard,
  makeRunSummary,
  recordRun,
} from './survivorRecords';
import { aliveBossCount, primaryBoss } from './survivorState';
import type { HeroId } from '../../content/heroes';

/** Run-report views. Source and form remain separate top-level views. */
type StatsTab = 'source' | 'form' | 'run';

/** Player-facing form names, shared by the form view and the source cross-tab rows. */
const FORM_LABEL: Record<import('./survivorContent').SurvivorForm, string> = {
  astronaut: 'Astronaut',
  mech: 'Mech',
  ship: 'Ship',
};

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

      <div class="sv-command">
        <!--
          Aegis lives *inside* the command deck and is anchored to its top edge with
          bottom: calc(100% + gap). It is absolutely positioned, so it never
          participates in the deck's grid and cannot resize or reflow it, and it
          inherits the deck's --ui-scale transform instead of guessing a second one.
        -->
        <div id="sv-aegis-float" class="sv-aegis-float hidden">
          <span class="sv-aegis-icon" aria-hidden="true">◈</span>
          <div class="sv-aegis-body">
            <span class="eyebrow">AEGIS</span>
            <span id="sv-shield-num" class="sv-num">0</span>
            <div class="sv-track shield"><i id="sv-shield"></i></div>
          </div>
        </div>
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
      <div id="sv-surge-banner" class="sv-surge-banner hidden">SURGE INCOMING</div>
      <div id="sv-build" class="sv-build"></div>
      <div id="sv-mech-toast" class="sv-mech-toast hidden">MECH CORE READY</div>

      <div id="sv-hit-vignette" class="sv-hit-vignette"></div>
      <div id="sv-metrics" class="sv-metrics hidden"></div>
      <div id="sv-dmg" class="sv-dmg-layer"></div>

      <div id="sv-pause" class="sv-modal sv-pause hidden">
        <p class="eyebrow">SYSTEM HOLD</p>
        <h2>Paused</h2>
        <div class="sv-end-actions sv-pause-actions">
          <button type="button" id="sv-resume" class="sv-btn">RESUME</button>
          <button type="button" id="sv-pause-stats" class="sv-btn ghost">RUN STATS</button>
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
        <div class="sv-cache-text">
          <span class="sv-cache-label">CACHE SIGNAL · HUNT ACTIVE</span>
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
        <div id="sv-death-log" class="sv-death-log"></div>
        <div class="sv-end-actions">
          <button type="button" id="sv-restart" class="sv-btn">RUN AGAIN</button>
          <button type="button" id="sv-end-stats" class="sv-btn">RUN STATS</button>
          <button type="button" id="sv-end-lb" class="sv-btn ghost">LEADERBOARDS</button>
          <button type="button" id="sv-crew" class="sv-btn ghost">CREW SELECT</button>
        </div>
      </div>

      <div id="sv-stats-modal" class="sv-modal sv-stats hidden">
        <p class="eyebrow">RUN TELEMETRY</p>
        <h2>Run Report</h2>
        <div id="sv-stats-tabs" class="sv-lb-tabs"></div>
        <div id="sv-stats-body" class="sv-stats-body"></div>
        <div class="sv-end-actions">
          <button type="button" id="sv-close-stats" class="sv-btn">BACK</button>
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

    this.root.querySelector('#sv-pause-stats')?.addEventListener('click', () => this.setStatsOpen(true));
    this.root.querySelector('#sv-end-stats')?.addEventListener('click', () => this.setStatsOpen(true));
    this.root.querySelector('#sv-close-stats')?.addEventListener('click', () => this.setStatsOpen(false));

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

    this.statsState = state;
    this.publishHitFeedback(state);
    this.publishAbilities(state);
    this.publishPressure(state);
    this.publishShield(state);
    this.publishBanners(state);
    this.publishProtocol(state);
    this.publishBossBars(state);
    this.publishWeapons(state);
    this.publishPause(state);
    this.root.querySelector('#sv-settings-modal')?.classList.toggle('hidden', !this.settingsOpen);
    this.root.querySelector('#sv-stats-modal')?.classList.toggle('hidden', !this.statsOpen);

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
    if (p.mechCd <= 0 && !p.mechReadyAnnounced && p.form === 'astronaut' && state.phase === 'playing') {
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

    // Mech is a fixed-cooldown ultimate: the meter shows readiness, not kill charge.
    const rActive = p.form === 'mech';
    const rReady = p.mechCd <= 0 && p.form === 'astronaut' && p.alive;
    const rBlocked = p.form === 'ship';
    rEl?.classList.toggle('ready', rReady);
    rEl?.classList.toggle('pulse-ready', rReady);
    rEl?.classList.toggle('active', rActive);
    rEl?.classList.toggle('blocked', rBlocked);
    if (rState) {
      if (rActive) rState.textContent = `${Math.max(0, p.mechDuration).toFixed(1)}s`;
      else if (rBlocked) rState.textContent = 'SHIP';
      else if (rReady) rState.textContent = 'READY';
      else rState.textContent = this.formatCd(p.mechCd);
    }
    if (rActive) {
      this.setCooldownOverlay(rEl, p.mechDuration, SURVIVOR.mech.duration);
    } else {
      this.setCooldownOverlay(rEl, p.mechCd, Math.max(0.001, p.mechCdMax));
      rEl?.classList.toggle('charged', p.mechCd <= 0);
    }
  }

  /** Player-facing director warning. Internal surge types and recovery state stay hidden. */
  private publishPressure(state: SurvivorState): void {
    const banner = this.root.querySelector('#sv-surge-banner');
    const s = state.surge;
    if (banner) {
      const show = s.phase === 'telegraph' && state.phase === 'playing';
      banner.classList.toggle('hidden', !show);
      if (show) banner.textContent = 'SURGE INCOMING';
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
        const label = arrow.querySelector('.sv-cache-label');
        if (label) label.textContent = state.cache.mega ? 'TITAN CACHE · CLAIM ARMAMENT' : 'CACHE SIGNAL · HUNT ACTIVE';
        const meta = arrow.querySelector('.sv-cache-meta');
        if (meta) {
          const lifeBit =
            state.cache.mega || state.cache.life > 100
              ? '∞'
              : `${Math.max(0, Math.ceil(state.cache.life))}s`;
          meta.textContent = state.cache.mega ? 'PERSISTENT' : `SIGNAL LOST IN ${lifeBit}`;
        }
      }
    }
  }

  private lastProtocolKey = '';
  private publishProtocol(state: SurvivorState): void {
    const modal = this.root.querySelector('#sv-protocol');
    if (!modal) return;
    const open = state.phase === 'protocol';
    modal.classList.toggle('hidden', !open);
    modal.classList.toggle('mega-protocol', open && state.cache.mega);
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
          `<button type="button" class="sv-choice protocol${state.cache.mega ? ' mega-protocol' : ''}" data-i="${i}">
            <span class="eyebrow">${state.cache.mega ? 'MEGA PROTOCOL' : 'PROTOCOL'} · ${i + 1}</span>
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
        const signature = isSignatureWeapon(w.weaponId) ? ' · SIGNATURE' : '';
        return `<div class="sv-build-item${signature ? ' signature' : ''}" style="--wep:${fam.color}"><span>${fam.name}${signature}${proto}${ocBit}</span><strong>L${w.level}</strong></div>`;
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
    const titanIds = new Set(['carrier-wing', 'cleanup-crew', 'singularity-engine']);
    const titan = state.protocolActive
      .filter((t) => titanIds.has(t.id))
      .map(
        (t) =>
          `<div class="sv-build-item temp titan-armament"><span>${t.id.replace(/-/g, ' ')}</span><strong>${Math.floor(t.remaining / 60)}:${String(Math.ceil(t.remaining % 60)).padStart(2, '0')}</strong></div>`,
      )
      .join('');
    const protos = state.protocolActive
      .filter((t) => !titanIds.has(t.id))
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
      titan || protos || shield || temps
        ? `${titan ? `<div class="sv-build-section">TITAN ARMAMENT</div>${titan}` : ''}<div class="sv-build-section">TEMP / PROTOCOL</div>${protos}${shield}${temps}`
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
          const fallbackLabel = (c: (typeof state.choices)[0]) => {
            if (c.kind === 'passive' && c.passiveId) {
              return (state.passives[c.passiveId] ?? 0) > 0 ? 'PASSIVE UPGRADE' : 'NEW PASSIVE';
            }
            if (c.kind === 'new-weapon') return 'NEW WEAPON';
            if (c.kind === 'protocol') return 'PROTOCOL';
            return 'WEAPON UPGRADE';
          };
          // Built with DOM nodes and textContent — card copy is data, never markup.
          box.replaceChildren();
          state.choices.forEach((c, i) => {
            const card = c.card;
            const btn = document.createElement('button');
            btn.type = 'button';
            btn.className = 'sv-choice sv-card';
            btn.dataset.i = String(i);

            const badge = document.createElement('span');
            badge.className = 'eyebrow sv-card-badge';
            badge.textContent = `${card?.category ?? fallbackLabel(c)} · ${labels[i] ?? i + 1}`;
            btn.appendChild(badge);

            // Parent weapon/passive and the exact level transition.
            const parent = document.createElement('span');
            parent.className = 'sv-card-parent';
            parent.textContent = card
              ? card.levels
                ? `${card.parent} · ${card.levels}`
                : card.parent
              : '';
            if (parent.textContent) btn.appendChild(parent);

            const name = document.createElement('strong');
            name.className = 'sv-card-name';
            name.textContent = card?.name ?? c.title;
            btn.appendChild(name);

            const summary = document.createElement('small');
            summary.className = 'sv-card-summary';
            summary.textContent = card?.summary ?? c.body;
            btn.appendChild(summary);

            if (card && card.stats.length > 0) {
              const stats = document.createElement('span');
              stats.className = 'sv-card-stats';
              for (const line of card.stats) {
                const row = document.createElement('span');
                row.className = 'sv-card-stat';
                row.textContent = line;
                stats.appendChild(row);
              }
              btn.appendChild(stats);
            }

            if (card?.tradeoff) {
              const trade = document.createElement('span');
              trade.className = 'sv-card-tradeoff';
              trade.textContent = card.tradeoff;
              btn.appendChild(trade);
            }

            btn.addEventListener('pointerdown', (ev) => {
              ev.preventDefault();
              ev.stopPropagation();
              this.onChoice(i);
            });
            box.appendChild(btn);
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
      this.renderDeathLog(state);
      const eb = this.root.querySelector('#sv-end-build');
      if (eb) {
        eb.innerHTML = state.weapons
          .map((w) => `${WEAPONS[w.weaponId].name} L${w.level}`)
          .join(' · ');
      }
    }
  }

  /** Red screen-edge vignette on damage — strong but brief, never opaque. */
  private publishHitFeedback(state: SurvivorState): void {
    const el = this.root.querySelector<HTMLElement>('#sv-hit-vignette');
    if (!el) return;
    const p = state.player;
    // Cap well below 1 so the arena stays readable even on a heavy hit.
    el.style.opacity = String(Math.min(0.85, Math.max(0, p.hitVignette)));
  }

  private statsOpen = false;
  private statsTab: StatsTab = 'source';
  /** Source ids whose per-form breakdown is expanded in the Run Report. */
  private expandedSources = new Set<string>();
  private statsState: SurvivorState | null = null;

  setStatsOpen(open: boolean): void {
    this.statsOpen = open;
    this.root.classList.toggle('stats-open', open);
    const modal = this.root.querySelector('#sv-stats-modal');
    modal?.classList.toggle('hidden', !open);
    modal?.setAttribute('aria-hidden', String(!open));
    if (open && this.statsState) this.renderStats(this.statsState);
  }

  isStatsOpen(): boolean {
    return this.statsOpen;
  }

  /** Small helper: a labelled row in the run report. */
  private statRow(parent: Element, cells: string[], cls = ''): HTMLElement {
    const row = document.createElement('div');
    row.className = `sv-stats-row ${cls}`.trim();
    for (const c of cells) {
      const el = document.createElement('span');
      el.textContent = c;
      row.appendChild(el);
    }
    parent.appendChild(row);
    return row;
  }

  /**
   * Recount-style run report.
   *
   * Source and form are separate views on purpose. A Mech-form Rail Lance hit belongs
   * to both "Rail Lance" and "Mech"; presenting them as one nested tree would make the
   * percentages sum past 100%.
   */
  private renderStats(state: SurvivorState): void {
    const tabs = this.root.querySelector('#sv-stats-tabs');
    const body = this.root.querySelector('#sv-stats-body');
    if (!tabs || !body) return;
    const t = state.telemetry;

    tabs.replaceChildren();
    const tabDefs: Array<{ id: StatsTab; label: string }> = [
      { id: 'source', label: 'BY SOURCE' },
      { id: 'form', label: 'BY FORM' },
      { id: 'run', label: 'RUN' },
    ];
    for (const def of tabDefs) {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = `sv-lb-tab${def.id === this.statsTab ? ' active' : ''}`;
      btn.textContent = def.label;
      btn.addEventListener('click', () => {
        this.statsTab = def.id;
        this.renderStats(state);
      });
      tabs.appendChild(btn);
    }

    body.replaceChildren();
    const pct = (v: number) => `${(v * 100).toFixed(1)}%`;
    const num = (v: number) => Math.round(v).toLocaleString();

    if (this.statsTab === 'source') {
      const rows = sourceReport(t);
      this.statRow(body, ['Source', 'Damage', '%', 'DPS', 'Hits', 'Kills', 'Boss dmg', 'Max hit'], 'head');
      if (rows.length === 0) {
        this.statRow(body, ['No damage recorded yet']);
      }
      for (const r of rows) {
        /*
         * Source × form is presented as an expandable row rather than a fourth
         * always-on column block. The default report stays exactly as dense as before;
         * a player asking "how much of this happened in ship form?" opens one row.
         */
        const perForm = sourceFormRows(t, r.id);
        const expandable = perForm.length > 1;
        const open = this.expandedSources.has(r.id);
        const marker = expandable ? (open ? '▾ ' : '▸ ') : '';
        const label = sourceLabel(r.id, (id) => WEAPONS[id as keyof typeof WEAPONS]?.name ?? id);
        const row = this.statRow(body, [
          `${marker}${label}`,
          num(r.damage),
          pct(r.share),
          r.dps.toFixed(1),
          String(r.hits),
          String(r.kills),
          num(r.bossDamage),
          num(r.maxHit),
        ]);
        if (expandable) {
          row.classList.add('expandable');
          row.setAttribute('role', 'button');
          row.setAttribute('tabindex', '0');
          row.setAttribute('aria-expanded', open ? 'true' : 'false');
          const toggle = () => {
            if (this.expandedSources.has(r.id)) this.expandedSources.delete(r.id);
            else this.expandedSources.add(r.id);
            this.renderStats(state);
          };
          row.addEventListener('click', toggle);
          row.addEventListener('keydown', (ev) => {
            if (ev.key === 'Enter' || ev.key === ' ') {
              ev.preventDefault();
              toggle();
            }
          });
        }
        if (open) {
          for (const f of perForm) {
            this.statRow(
              body,
              [
                FORM_LABEL[f.form],
                num(f.damage),
                pct(f.shareOfSource),
                '',
                String(f.hits),
                String(f.kills),
                num(f.bossDamage),
                num(f.maxHit),
              ],
              'sub',
            );
          }
        }
      }
      const note = document.createElement('p');
      note.className = 'sv-stats-note';
      note.textContent =
        'Damage is health actually removed. Overkill on an already-dying target is not counted. Select a source to break it down by form; the form rows sum to that source exactly.';
      body.appendChild(note);
    } else if (this.statsTab === 'form') {
      this.statRow(body, ['Form', 'Damage', '%', 'Uptime', 'Time', 'DPS while active'], 'head');
      for (const r of formReport(t)) {
        this.statRow(body, [
          r.form === 'astronaut' ? 'Astronaut' : r.form === 'ship' ? 'Ship' : 'Mech',
          num(r.damage),
          pct(r.share),
          pct(r.uptime),
          formatSurvivalTime(r.time),
          r.dps.toFixed(1),
        ]);
      }
    } else {
      this.statRow(body, ['Metric', 'Value'], 'head');
      this.statRow(body, ['Elite kills', String(t.eliteKills)]);
      this.statRow(body, ['Miniboss kills', String(t.minibossKills)]);
      this.statRow(body, ['Healed by repair orbs', num(t.healedByOrbs)]);
      this.statRow(body, ['Healed by Nanite Bleed', num(t.healedByRegen)]);
      this.statRow(body, ['Absorbed by Aegis', num(t.shieldAbsorbed)]);
      const forms = formReport(t);
      const mech = forms.find((f) => f.form === 'mech');
      const ship = forms.find((f) => f.form === 'ship');
      this.statRow(body, ['Mech uptime', mech ? pct(mech.uptime) : '0%']);
      this.statRow(body, ['Ship uptime', ship ? pct(ship.uptime) : '0%']);

      if (t.bossKills.length > 0) {
        this.statRow(body, ['Boss', 'Time to kill'], 'head');
        for (const b of t.bossKills) {
          this.statRow(body, [
            `#${b.index} ${b.displayName}${b.isMega ? ' (Mega)' : ''}`,
            `${b.timeToKill.toFixed(1)}s`,
          ]);
        }
      }
      if (t.damageTaken.size > 0) {
        this.statRow(body, ['Damage taken by source', 'Total'], 'head');
        const taken = [...t.damageTaken.entries()].sort((a, b) => b[1] - a[1]);
        for (const [kind, amount] of taken) {
          this.statRow(body, [damageTakenLabel(kind), num(amount)]);
        }
      }
      const choices = [...t.cacheChoices.entries()];
      if (choices.length > 0) {
        this.statRow(body, ['Protocol Cache picks', 'Count'], 'head');
        for (const [id, n] of choices) this.statRow(body, [id.replace(/-/g, ' '), String(n)]);
      }
      const megas = [...t.megaChoices.entries()];
      if (megas.length > 0) {
        this.statRow(body, ['Mega Protocol picks', 'Count'], 'head');
        for (const [id, n] of megas) this.statRow(body, [id.replace(/-/g, ' '), String(n)]);
      }
    }
  }

  /**
   * Exact death log.
   *
   * States what killed the player and with which mechanic, then lists the recent hits
   * that got them there. Built entirely with DOM nodes and textContent — enemy and
   * attack names are data and never become markup.
   */
  private renderDeathLog(state: SurvivorState): void {
    const host = this.root.querySelector('#sv-death-log');
    if (!host) return;
    host.replaceChildren();
    const t = state.telemetry;
    const blow = t.killingBlow;

    const headline = document.createElement('p');
    headline.className = 'sv-death-headline';
    headline.textContent = blow
      ? `Killed by ${blow.source.displayName} — ${blow.source.attackName}`
      : 'Containment lost';
    host.appendChild(headline);

    if (blow) {
      const detail = document.createElement('p');
      detail.className = 'sv-death-detail';
      detail.textContent = `Final hit ${Math.round(blow.applied)} damage (${Math.round(blow.raw)} raw)`;
      host.appendChild(detail);
    }

    const recent = deathLogEntries(t, state.time);
    if (recent.length === 0) return;
    const list = document.createElement('div');
    list.className = 'sv-death-list';
    const title = document.createElement('span');
    title.className = 'eyebrow';
    title.textContent = `LAST ${Math.round(DEATH_LOG_WINDOW)} SECONDS`;
    list.appendChild(title);
    for (const r of recent) {
      const row = document.createElement('div');
      row.className = 'sv-death-row';
      const add = (text: string, cls?: string) => {
        const el = document.createElement('span');
        if (cls) el.className = cls;
        el.textContent = text;
        row.appendChild(el);
      };
      add(formatSurvivalTime(r.time), 'sv-death-time');
      add(`${r.source.displayName} · ${r.source.attackName}`, 'sv-death-src');
      add(`−${Math.round(r.applied)}`, 'sv-death-amt');
      if (r.shieldAbsorbed > 0) add(`◈${Math.round(r.shieldAbsorbed)}`, 'sv-death-shield');
      add(`${Math.round(r.remaining)} left`, 'sv-death-left');
      list.appendChild(row);
    }
    host.appendChild(list);
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

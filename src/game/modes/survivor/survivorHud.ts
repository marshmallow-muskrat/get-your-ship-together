import { HEROES } from '../../content/heroes';
import { SURVIVOR, WEAPONS } from './survivorContent';
import type { SurvivorState } from './survivorState';
import {
  ACTION_LABELS,
  REBINDABLE_ACTIONS,
  formatKeyCode,
  type ActionId,
  type KeybindMap,
} from './survivorKeybinds';

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
            <span class="eyebrow">CONTAINMENT BREACH · P<span id="sv-boss-phase">1</span></span>
            <div class="sv-track boss"><i id="sv-boss-hp"></i></div>
          </div>
          <div id="sv-miniboss" class="sv-miniboss hidden">
            <span class="eyebrow" id="sv-mb-name">WARDEN</span>
            <div class="sv-track miniboss"><i id="sv-mb-hp"></i></div>
          </div>
          <span class="eyebrow">T-MINUS</span>
          <strong id="sv-timer">08:00</strong>
        </div>
        <div class="sv-meta">
          <span>LVL <strong id="sv-level">1</strong></span>
          <span>KILLS <strong id="sv-kills">0</strong></span>
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
        <div id="sv-weapons" class="sv-weapons"></div>
      </div>

      <div id="sv-metrics" class="sv-metrics hidden"></div>
      <div id="sv-dmg" class="sv-dmg-layer"></div>

      <div id="sv-pause" class="sv-modal sv-pause hidden">
        <p class="eyebrow">SYSTEM HOLD</p>
        <h2>Paused</h2>
        <div class="sv-end-actions sv-pause-actions">
          <button type="button" id="sv-resume" class="sv-btn">RESUME</button>
          <button type="button" id="sv-settings" class="sv-btn">SETTINGS</button>
          <button type="button" id="sv-pause-restart" class="sv-btn ghost">RESTART RUN</button>
          <button type="button" id="sv-pause-crew" class="sv-btn ghost">CREW SELECT</button>
        </div>
      </div>

      <div id="sv-settings-modal" class="sv-modal sv-settings hidden">
        <p class="eyebrow">CONFIGURATION</p>
        <h2>Controls</h2>
        <p class="sv-settings-hint" id="sv-rebind-hint">Click a row, then press a key. Escape cancels capture.</p>
        <div id="sv-bind-list" class="sv-bind-list"></div>
        <div class="sv-end-actions">
          <button type="button" id="sv-reset-binds" class="sv-btn ghost">RESET TO DEFAULTS</button>
          <button type="button" id="sv-close-settings" class="sv-btn">BACK</button>
        </div>
      </div>

      <div id="sv-levelup" class="sv-modal hidden">
        <p class="eyebrow">SYSTEM UPLINK</p>
        <h2>Choose Upgrade</h2>
        <div id="sv-choices" class="sv-choices"></div>
      </div>
      <div id="sv-end" class="sv-modal hidden">
        <p class="eyebrow" id="sv-end-eye">RUN COMPLETE</p>
        <h2 id="sv-end-title">Victory</h2>
        <p id="sv-end-body"></p>
        <div class="sv-end-actions">
          <button type="button" id="sv-restart" class="sv-btn">RUN AGAIN</button>
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
      helpAbil.innerHTML = `<kbd>${formatKeyCode(binds.repulsor)}</kbd> Repulsor · <kbd>${formatKeyCode(binds.ship)}</kbd> Ship · <kbd>${formatKeyCode(binds.mech)}</kbd> Mech · <kbd>${formatKeyCode(binds.choice1)}</kbd><kbd>${formatKeyCode(binds.choice2)}</kbd><kbd>${formatKeyCode(binds.choice3)}</kbd> upgrades`;
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
    set('sv-lvl-inline', `LVL ${state.level}`);

    const remain = Math.max(0, 480 - state.time);
    const m = Math.floor(remain / 60);
    const s = Math.floor(remain % 60);
    set(
      'sv-timer',
      state.boss.active && state.boss.state !== 'dead'
        ? `BOSS P${state.boss.phase}`
        : `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`,
    );

    const p = state.player;
    const hp = this.root.querySelector<HTMLElement>('#sv-hp');
    if (hp) hp.style.width = `${(p.health / p.maxHealth) * 100}%`;
    set('sv-hp-num', `${Math.ceil(p.health)} / ${Math.ceil(p.maxHealth)}`);

    const xp = this.root.querySelector<HTMLElement>('#sv-xp');
    if (xp) xp.style.width = `${Math.min(100, (state.xp / state.xpNext) * 100)}%`;
    set('sv-xp-num', `${Math.floor(state.xp)} / ${state.xpNext}`);

    this.publishAbilities(state);
    this.publishBossBars(state);
    this.publishWeapons(state);
    this.publishPause(state);
    this.root.querySelector('#sv-settings-modal')?.classList.toggle('hidden', !this.settingsOpen);

    const metrics = this.root.querySelector('#sv-metrics');
    if (metrics) {
      metrics.classList.toggle('hidden', !showMetrics);
      if (showMetrics) {
        metrics.textContent = `FPS ${state.metrics.fps.toFixed(0)} · ${state.metrics.frameMs.toFixed(1)}ms · E ${state.metrics.enemies} · P ${state.metrics.projectiles}`;
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

  private publishBossBars(state: SurvivorState): void {
    const boss = this.root.querySelector('#sv-boss');
    if (boss) {
      boss.classList.toggle('hidden', !state.boss.active || state.boss.state === 'dead');
      const bh = this.root.querySelector<HTMLElement>('#sv-boss-hp');
      if (bh && state.boss.maxHealth > 0) {
        bh.style.width = `${(state.boss.health / state.boss.maxHealth) * 100}%`;
      }
      const phase = this.root.querySelector('#sv-boss-phase');
      if (phase) phase.textContent = String(state.boss.phase);
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
    const key = state.weapons.map((w) => `${w.weaponId}:${w.level}`).join('|');
    if (key === this.lastWeaponsKey) return;
    this.lastWeaponsKey = key;
    const weapons = this.root.querySelector('#sv-weapons');
    if (!weapons) return;
    weapons.innerHTML = state.weapons
      .map((w) => {
        const fam = WEAPONS[w.weaponId];
        return `<div class="sv-wep" style="--wep:${fam.color}">
          <span class="sv-wep-dot"></span>
          <span>${fam.name}</span>
          <strong>L${w.level}</strong>
        </div>`;
      })
      .join('');
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
          box.innerHTML = state.choices
            .map(
              (c, i) =>
                `<button type="button" class="sv-choice" data-i="${i}">
                  <span class="eyebrow">${c.kind === 'passive' ? 'PASSIVE' : c.kind === 'new-weapon' ? 'NEW WEAPON' : 'WEAPON'} · ${labels[i] ?? i + 1}</span>
                  <strong>${c.title}</strong>
                  <small>${c.body}</small>
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
    const done = state.phase === 'victory' || state.phase === 'defeat';
    end.classList.toggle('hidden', !done);
    if (done) {
      const set = (id: string, text: string) => {
        const el = this.root.querySelector(`#${id}`);
        if (el) el.textContent = text;
      };
      set('sv-end-eye', state.phase === 'victory' ? 'CONTAINMENT HELD' : 'CREW DOWN');
      set('sv-end-title', state.phase === 'victory' ? 'Protocol Complete' : 'Protocol Failed');
      set('sv-end-body', `Level ${state.level} · ${state.kills} kills · ${Math.floor(state.time)}s`);
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
      node.textContent = String(ev.amount);
      node.style.transform = `translate(-50%, -50%) translate(${scr.x + Math.sin(ev.id * 1.7) * 10}px, ${scr.y - drift}px) scale(${pop})`;
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

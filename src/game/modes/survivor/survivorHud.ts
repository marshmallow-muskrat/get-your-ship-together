import { HEROES } from '../../content/heroes';
import { WEAPONS } from './survivorContent';
import type { SurvivorState } from './survivorState';

export class SurvivorHud {
  private root: HTMLElement;
  private onRestart: () => void;
  private onCrew: () => void;
  private onChoice: (i: number) => void;

  constructor(
    host: HTMLElement,
    handlers: { onRestart: () => void; onCrew: () => void; onChoice: (i: number) => void },
  ) {
    this.onRestart = handlers.onRestart;
    this.onCrew = handlers.onCrew;
    this.onChoice = handlers.onChoice;
    this.root = document.createElement('section');
    this.root.className = 'survivor-hud';
    this.root.innerHTML = `
      <div class="sv-top">
        <div class="sv-identity">
          <span class="eyebrow">CONTAINMENT PROTOCOL</span>
          <strong id="sv-hero">—</strong>
        </div>
        <div class="sv-timer-wrap">
          <span class="eyebrow">T-MINUS</span>
          <strong id="sv-timer">08:00</strong>
        </div>
        <div class="sv-meta">
          <span>LVL <strong id="sv-level">1</strong></span>
          <span>KILLS <strong id="sv-kills">0</strong></span>
        </div>
      </div>
      <div class="sv-bars">
        <div class="sv-bar">
          <span class="eyebrow">INTEGRITY</span>
          <div class="sv-track"><i id="sv-hp"></i></div>
        </div>
        <div class="sv-bar">
          <span class="eyebrow">ENERGY</span>
          <div class="sv-track xp"><i id="sv-xp"></i></div>
        </div>
        <div class="sv-bar">
          <span class="eyebrow">MECH CORE</span>
          <div class="sv-track mech"><i id="sv-mech"></i></div>
        </div>
      </div>
      <div id="sv-boss" class="sv-boss hidden">
        <span class="eyebrow">CONTAINMENT BREACH</span>
        <div class="sv-track boss"><i id="sv-boss-hp"></i></div>
      </div>
      <div id="sv-weapons" class="sv-weapons"></div>
      <div id="sv-metrics" class="sv-metrics hidden"></div>
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
      <div class="sv-help">
        <span><kbd>WASD</kbd> move · auto fire</span>
        <span><kbd>R</kbd> mech when charged · <kbd>Esc</kbd> pause</span>
      </div>
    `;
    host.appendChild(this.root);
    this.root.querySelector('#sv-restart')?.addEventListener('click', this.onRestart);
    this.root.querySelector('#sv-crew')?.addEventListener('click', this.onCrew);
  }

  publish(state: SurvivorState, showMetrics = false): void {
    const hero = HEROES[state.heroId];
    this.root.style.setProperty('--hud-accent', state.accent);
    const set = (id: string, text: string) => {
      const el = this.root.querySelector(`#${id}`);
      if (el) el.textContent = text;
    };
    set('sv-hero', hero.fullName);
    set('sv-level', String(state.level));
    set('sv-kills', String(state.kills));

    const remain = Math.max(0, 480 - state.time);
    const m = Math.floor(remain / 60);
    const s = Math.floor(remain % 60);
    set('sv-timer', state.boss.active ? 'BOSS' : `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`);

    const hp = this.root.querySelector<HTMLElement>('#sv-hp');
    if (hp) hp.style.width = `${(state.player.health / state.player.maxHealth) * 100}%`;
    const xp = this.root.querySelector<HTMLElement>('#sv-xp');
    if (xp) xp.style.width = `${Math.min(100, (state.xp / state.xpNext) * 100)}%`;
    const mech = this.root.querySelector<HTMLElement>('#sv-mech');
    if (mech) {
      const v =
        state.player.form === 'mech'
          ? state.player.mechDuration / 14
          : state.player.mechCharge;
      mech.style.width = `${Math.max(0, Math.min(1, v)) * 100}%`;
    }

    const boss = this.root.querySelector('#sv-boss');
    if (boss) {
      boss.classList.toggle('hidden', !state.boss.active || state.boss.state === 'dead');
      const bh = this.root.querySelector<HTMLElement>('#sv-boss-hp');
      if (bh && state.boss.maxHealth > 0) {
        bh.style.width = `${(state.boss.health / state.boss.maxHealth) * 100}%`;
      }
    }

    const weapons = this.root.querySelector('#sv-weapons');
    if (weapons) {
      weapons.innerHTML = state.weapons
        .map((w) => {
          const fam = WEAPONS[w.weaponId];
          return `<div class="sv-wep"><span>${fam.name}</span><strong>L${w.level}</strong></div>`;
        })
        .join('');
    }

    const metrics = this.root.querySelector('#sv-metrics');
    if (metrics) {
      metrics.classList.toggle('hidden', !showMetrics);
      if (showMetrics) {
        metrics.textContent = `FPS ${state.metrics.fps.toFixed(0)} · ${state.metrics.frameMs.toFixed(1)}ms · E ${state.metrics.enemies} · P ${state.metrics.projectiles} · X ${state.metrics.pickups}`;
      }
    }

    // Level up
    const levelup = this.root.querySelector('#sv-levelup');
    if (levelup) {
      const open = state.phase === 'levelup';
      levelup.classList.toggle('hidden', !open);
      if (open) {
        const box = this.root.querySelector('#sv-choices');
        if (box) {
          box.innerHTML = state.choices
            .map(
              (c, i) =>
                `<button type="button" class="sv-choice" data-i="${i}">
                  <span class="eyebrow">${c.kind === 'passive' ? 'PASSIVE' : c.kind === 'new-weapon' ? 'NEW WEAPON' : 'WEAPON'}</span>
                  <strong>${c.title}</strong>
                  <small>${c.body}</small>
                </button>`,
            )
            .join('');
          box.querySelectorAll<HTMLButtonElement>('.sv-choice').forEach((btn) => {
            btn.onclick = () => this.onChoice(Number(btn.dataset.i));
          });
        }
      }
    }

    const end = this.root.querySelector('#sv-end');
    if (end) {
      const done = state.phase === 'victory' || state.phase === 'defeat';
      end.classList.toggle('hidden', !done);
      if (done) {
        set('sv-end-eye', state.phase === 'victory' ? 'CONTAINMENT HELD' : 'CREW DOWN');
        set('sv-end-title', state.phase === 'victory' ? 'Protocol Complete' : 'Protocol Failed');
        set(
          'sv-end-body',
          `Level ${state.level} · ${state.kills} kills · ${Math.floor(state.time)}s`,
        );
      }
    }
  }

  dispose(): void {
    this.root.querySelector('#sv-restart')?.removeEventListener('click', this.onRestart);
    this.root.querySelector('#sv-crew')?.removeEventListener('click', this.onCrew);
    this.root.remove();
  }
}

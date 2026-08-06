import type { HudSnapshot } from '../simulation/types';

function readyClass(ready: number): string {
  if (ready >= 0.999) return 'ready';
  if (ready <= 0.001) return 'empty';
  return 'cooling';
}

/** DOM HUD adapter — sci-fi, selection-screen family. */
export class HudController {
  private root: HTMLElement;
  private onRestart: () => void;
  private onCrew: () => void;

  constructor(host: HTMLElement, handlers: { onRestart: () => void; onCrew: () => void }) {
    this.root = document.createElement('section');
    this.root.id = 'game-hud';
    this.root.className = 'game-hud';
    this.root.innerHTML = `
      <div class="hud-top">
        <div class="hud-identity">
          <span class="eyebrow">CREW ONLINE</span>
          <strong id="hud-hero">—</strong>
        </div>
        <div class="hud-objective">
          <span class="eyebrow">OBJECTIVE</span>
          <p id="hud-objective">—</p>
        </div>
        <div class="hud-health-wrap">
          <span class="eyebrow">INTEGRITY</span>
          <div class="hud-health-track"><span id="hud-health-fill"></span></div>
          <strong id="hud-health-text">100</strong>
        </div>
      </div>

      <div id="hud-boss" class="hud-boss hidden">
        <span class="eyebrow">FACILITY WARDEN · PHASE <span id="hud-boss-phase">1</span></span>
        <div class="hud-boss-track"><span id="hud-boss-fill"></span></div>
      </div>

      <div class="hud-abilities">
        <div class="ability" data-key="dodge"><kbd>SPC</kbd><span class="ability-name">Dodge</span><span class="ability-bar"><i id="cd-dodge"></i></span></div>
        <div class="ability" data-key="ability"><kbd>Q</kbd><span class="ability-name">Ability</span><span class="ability-bar"><i id="cd-ability"></i></span></div>
        <div class="ability" data-key="repair"><kbd>E</kbd><span class="ability-name">Repair</span><span class="ability-bar"><i id="cd-repair"></i></span></div>
        <div class="ability" data-key="mech"><kbd>R</kbd><span class="ability-name">Mech</span><span class="ability-bar"><i id="cd-mech"></i></span></div>
      </div>

      <div id="hud-mech-timer" class="hud-mech-timer hidden">MECH <span id="hud-mech-time">0.0</span>s</div>

      <div id="hud-pause" class="hud-modal hidden">
        <p class="eyebrow">SYSTEMS PAUSED</p>
        <h2>Paused</h2>
        <p>Esc to resume · M mute</p>
      </div>

      <div id="hud-dead" class="hud-modal hidden">
        <p class="eyebrow">CREW DOWN</p>
        <h2>Restart Encounter</h2>
        <div class="hud-modal-actions">
          <button type="button" id="btn-restart" class="hud-btn">RESTART</button>
          <button type="button" id="btn-crew-dead" class="hud-btn ghost">CREW SELECT</button>
        </div>
      </div>

      <div id="hud-complete" class="hud-modal hidden">
        <p class="eyebrow">PROTOTYPE COMPLETE</p>
        <h2>Ship Part Recovered</h2>
        <p>Vertical slice objective secured.</p>
        <div class="hud-modal-actions">
          <button type="button" id="btn-again" class="hud-btn">RUN AGAIN</button>
          <button type="button" id="btn-crew-done" class="hud-btn ghost">CREW SELECT</button>
        </div>
      </div>

      <div id="hud-help" class="hud-help">
        <span><kbd>WASD</kbd> move</span>
        <span><kbd>Mouse</kbd> aim · <kbd>LMB</kbd>/<kbd>J</kbd> fire</span>
        <span><kbd>Space</kbd> dodge · <kbd>Q</kbd> ability · <kbd>E</kbd> repair · <kbd>R</kbd> mech</span>
      </div>
    `;
    host.appendChild(this.root);
    this.onRestart = handlers.onRestart;
    this.onCrew = handlers.onCrew;
    this.root.querySelector('#btn-restart')?.addEventListener('click', this.onRestart);
    this.root.querySelector('#btn-again')?.addEventListener('click', this.onRestart);
    this.root.querySelector('#btn-crew-dead')?.addEventListener('click', this.onCrew);
    this.root.querySelector('#btn-crew-done')?.addEventListener('click', this.onCrew);
  }

  publish(snap: HudSnapshot): void {
    this.root.style.setProperty('--hud-accent', snap.accent);
    const hero = this.root.querySelector('#hud-hero');
    if (hero) hero.textContent = snap.heroName;
    const obj = this.root.querySelector('#hud-objective');
    if (obj) obj.textContent = snap.objective;

    const fill = this.root.querySelector<HTMLElement>('#hud-health-fill');
    const ht = this.root.querySelector('#hud-health-text');
    const pct = Math.max(0, Math.min(1, snap.health / snap.maxHealth));
    if (fill) fill.style.width = `${pct * 100}%`;
    if (ht) ht.textContent = String(Math.ceil(snap.health));

    const boss = this.root.querySelector('#hud-boss');
    if (boss) {
      boss.classList.toggle('hidden', !snap.bossActive);
      if (snap.bossActive) {
        const bf = this.root.querySelector<HTMLElement>('#hud-boss-fill');
        const bp = this.root.querySelector('#hud-boss-phase');
        if (bf) bf.style.width = `${(snap.bossHealth / snap.bossMaxHealth) * 100}%`;
        if (bp) bp.textContent = String(snap.bossPhase);
      }
    }

    this.setCd('cd-dodge', snap.dodgeReady);
    this.setCd('cd-ability', snap.abilityReady);
    this.setCd('cd-repair', snap.repairReady);
    this.setCd('cd-mech', snap.form === 'mech' ? snap.mechDuration / snap.mechMaxDuration : snap.mechReady);

    const mechTimer = this.root.querySelector('#hud-mech-timer');
    const mechTime = this.root.querySelector('#hud-mech-time');
    if (mechTimer && mechTime) {
      const show = snap.form === 'mech' || snap.formState === 'entering' || snap.formState === 'exiting';
      mechTimer.classList.toggle('hidden', !show);
      mechTime.textContent = snap.mechDuration.toFixed(1);
    }

    this.root.querySelector('#hud-pause')?.classList.toggle('hidden', !snap.paused || snap.dead || snap.complete);
    this.root.querySelector('#hud-dead')?.classList.toggle('hidden', !snap.dead);
    this.root.querySelector('#hud-complete')?.classList.toggle('hidden', !snap.complete);

    // Hide help after intro-ish.
    const help = this.root.querySelector('#hud-help');
    if (help && (snap.phase !== 'intro' && snap.phase !== 'explore')) {
      help.classList.add('faded');
    }
  }

  private setCd(id: string, ready: number): void {
    const el = this.root.querySelector<HTMLElement>(`#${id}`);
    if (!el) return;
    el.style.transform = `scaleX(${Math.max(0, Math.min(1, ready))})`;
    el.parentElement?.parentElement?.classList.toggle('ready', ready >= 0.999);
    el.parentElement?.parentElement?.classList.toggle('cooling', ready < 0.999);
    void readyClass;
  }

  dispose(): void {
    this.root.querySelector('#btn-restart')?.removeEventListener('click', this.onRestart);
    this.root.querySelector('#btn-again')?.removeEventListener('click', this.onRestart);
    this.root.querySelector('#btn-crew-dead')?.removeEventListener('click', this.onCrew);
    this.root.querySelector('#btn-crew-done')?.removeEventListener('click', this.onCrew);
    this.root.remove();
  }
}

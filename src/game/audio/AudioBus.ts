import type { SurvivorState } from '../modes/survivor/survivorState';

type AudioMode = 'menu' | 'combat';
type Cue =
  | 'ui-move'
  | 'ui-confirm'
  | 'weapon-fire'
  | 'plasma-wake'
  | 'gravity-collapse'
  | 'boomerang'
  | 'pulsar'
  | 'gunship-cannon'
  | 'singularity-open'
  | 'singularity-collapse'
  | 'pickup'
  | 'repair'
  | 'dodge'
  | 'repulsor'
  | 'transform'
  | 'boss-warning'
  | 'boss-death'
  | 'hit';

const CUES: readonly Cue[] = [
  'ui-move',
  'ui-confirm',
  'weapon-fire',
  'plasma-wake',
  'gravity-collapse',
  'boomerang',
  'pulsar',
  'gunship-cannon',
  'singularity-open',
  'singularity-collapse',
  'pickup',
  'repair',
  'dodge',
  'repulsor',
  'transform',
  'boss-warning',
  'boss-death',
  'hit',
] as const;

const AUDIO_ROOT = '/audio';
const MUTE_KEY = 'gyst.audio.muted';

/**
 * Bounded mixer for pre-rendered, project-owned masters.
 *
 * Combat still belongs wholly to simulation. `sync` observes semantic state/effect IDs
 * after a fixed step and chooses a sound; it cannot damage, target, spawn, or mutate the
 * run. Voices are capped and high-frequency cues are throttled so late-game density
 * grows intensity without turning into clipping or listener fatigue.
 */
export class AudioBus {
  private context: AudioContext | null = null;
  private master: GainNode | null = null;
  private musicBus: GainNode | null = null;
  private sfxBus: GainNode | null = null;
  private compressor: DynamicsCompressorNode | null = null;
  private musicSource: AudioBufferSourceNode | null = null;
  private readonly buffers = new Map<string, AudioBuffer>();
  private readonly voices = new Set<AudioBufferSourceNode>();
  private readonly lastCueAt = new Map<Cue, number>();
  private rawLoads: Promise<Map<string, ArrayBuffer>> | null = null;
  private loadPromise: Promise<void> | null = null;
  private mode: AudioMode = 'menu';
  private muted = false;
  private disposed = false;
  private lastEffectId = 0;
  private lastHazardId = 0;
  private lastTime = 0;
  private lastHealth = 0;
  private lastBossCount = 0;
  private lastForm = '';

  constructor() {
    try {
      this.muted = localStorage.getItem(MUTE_KEY) === '1';
    } catch {
      this.muted = false;
    }
  }

  /** Begin network reads without creating/resuming an AudioContext. */
  preload(): void {
    if (this.rawLoads || typeof fetch !== 'function') return;
    const names = [...CUES, 'command-deck'] as const;
    this.rawLoads = Promise.all(
      names.map(async (name) => {
        const response = await fetch(`${AUDIO_ROOT}/${name}.wav`);
        if (!response.ok) throw new Error(`audio ${name}: HTTP ${response.status}`);
        return [name, await response.arrayBuffer()] as const;
      }),
    )
      .then((rows) => new Map(rows))
      .catch((error) => {
        // Audio is enhancement, never a reason to take down gameplay.
        console.warn('Audio preload unavailable', error);
        return new Map();
      });
  }

  async unlock(): Promise<void> {
    if (this.disposed || typeof window === 'undefined') return;
    const Ctx = window.AudioContext ?? (window as typeof window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctx) return;
    this.preload();
    if (!this.context) {
      const ctx = new Ctx();
      const master = ctx.createGain();
      const music = ctx.createGain();
      const sfx = ctx.createGain();
      const compressor = ctx.createDynamicsCompressor();
      compressor.threshold.value = -17;
      compressor.knee.value = 18;
      compressor.ratio.value = 5;
      compressor.attack.value = 0.008;
      compressor.release.value = 0.24;
      music.gain.value = this.mode === 'menu' ? 0.34 : 0.27;
      sfx.gain.value = 0.72;
      master.gain.value = this.muted ? 0 : 0.92;
      music.connect(master);
      sfx.connect(master);
      master.connect(compressor);
      compressor.connect(ctx.destination);
      this.context = ctx;
      this.master = master;
      this.musicBus = music;
      this.sfxBus = sfx;
      this.compressor = compressor;
    }
    if (this.context.state === 'suspended') await this.context.resume();
    if (!this.loadPromise) {
      this.loadPromise = (async () => {
        const raws = (await this.rawLoads) ?? new Map<string, ArrayBuffer>();
        await Promise.all(
          [...raws].map(async ([name, raw]) => {
            try {
              this.buffers.set(name, await this.context!.decodeAudioData(raw.slice(0)));
            } catch (error) {
              console.warn(`Audio decode unavailable: ${name}`, error);
            }
          }),
        );
        this.startMusic();
      })();
    }
    await this.loadPromise;
    this.startMusic();
  }

  setMode(mode: AudioMode): void {
    this.mode = mode;
    this.preload();
    if (this.context && this.musicBus) {
      const target = mode === 'menu' ? 0.34 : 0.27;
      this.musicBus.gain.setTargetAtTime(target, this.context.currentTime, 0.45);
      if (this.musicSource) this.musicSource.playbackRate.setTargetAtTime(mode === 'menu' ? 0.96 : 1, this.context.currentTime, 0.7);
    }
  }

  isMuted(): boolean {
    return this.muted;
  }

  setMuted(muted: boolean): void {
    const next = muted === true;
    if (next === this.muted) return;
    this.muted = next;
    try {
      localStorage.setItem(MUTE_KEY, this.muted ? '1' : '0');
    } catch {
      // Storage may be blocked; the in-memory preference still works.
    }
    if (this.context && this.master) {
      this.master.gain.setTargetAtTime(this.muted ? 0 : 0.92, this.context.currentTime, 0.035);
    }
  }

  private startMusic(): void {
    if (!this.context || !this.musicBus || this.musicSource || this.disposed) return;
    const buffer = this.buffers.get('command-deck');
    if (!buffer) return;
    const source = this.context.createBufferSource();
    source.buffer = buffer;
    source.loop = true;
    source.playbackRate.value = this.mode === 'menu' ? 0.96 : 1;
    source.connect(this.musicBus);
    source.start();
    this.musicSource = source;
  }

  private playNow(cue: Cue, volume: number, pan: number, minGap: number, rate = 1): void {
    const ctx = this.context;
    const bus = this.sfxBus;
    const buffer = this.buffers.get(cue);
    if (!ctx || !bus || !buffer || this.muted || this.voices.size >= 24) return;
    const last = this.lastCueAt.get(cue) ?? -Infinity;
    if (ctx.currentTime - last < minGap) return;
    this.lastCueAt.set(cue, ctx.currentTime);

    const source = ctx.createBufferSource();
    const gain = ctx.createGain();
    const panner = ctx.createStereoPanner();
    source.buffer = buffer;
    source.playbackRate.value = rate;
    gain.gain.value = clampAudio(volume, 0, 1.25);
    panner.pan.value = clampAudio(pan, -0.88, 0.88);
    source.connect(gain);
    gain.connect(panner);
    panner.connect(bus);
    source.onended = () => {
      this.voices.delete(source);
      source.disconnect();
      gain.disconnect();
      panner.disconnect();
    };
    this.voices.add(source);
    source.start();
  }

  play(cue: Cue, volume = 0.5, pan = 0, minGap = 0.04, rate = 1): void {
    if (this.disposed || this.muted || !this.context) return;
    if (this.buffers.has(cue)) {
      this.playNow(cue, volume, pan, minGap, rate);
      return;
    }
    void this.unlock().then(() => this.playNow(cue, volume, pan, minGap, rate));
  }

  uiMove(): void { this.play('ui-move', 0.34, 0, 0.07); }
  uiConfirm(): void { this.play('ui-confirm', 0.52, 0, 0.12); }
  fire(): void { this.play('weapon-fire', 0.18, 0, 0.075, 0.94 + Math.random() * 0.1); }
  hit(): void { this.play('hit', 0.17, 0, 0.07); }
  dodge(): void { this.play('dodge', 0.48, 0, 0.18); }
  repair(): void { this.play('repair', 0.5, 0, 0.16); }
  ability(): void { this.play('repulsor', 0.58, 0, 0.24); }
  transform(): void { this.play('transform', 0.58, 0, 0.3); }
  enemyAttack(): void { this.play('hit', 0.14, 0, 0.12, 0.82); }
  bossDeath(): void { this.play('boss-death', 0.78, 0, 0.8); }
  pickup(): void { this.play('pickup', 0.24, 0, 0.055); }

  /** Read-only semantic bridge from deterministic state to the bounded mixer. */
  sync(state: SurvivorState): void {
    if (this.disposed) return;
    if (state.time + 0.2 < this.lastTime) {
      this.lastEffectId = 0;
      this.lastHazardId = 0;
      this.lastHealth = state.player.health;
      this.lastBossCount = 0;
      this.lastForm = state.player.form;
    }
    this.lastTime = state.time;
    const panAt = (x: number): number => clampAudio((x - state.player.x) / 15, -0.8, 0.8);

    for (const effect of state.effects) {
      if (effect.id <= this.lastEffectId) continue;
      const pan = panAt(effect.x);
      switch (effect.kind) {
        case 'muzzle': this.play('weapon-fire', 0.12, pan, 0.07, 0.93 + (effect.id % 5) * 0.025); break;
        case 'impact': this.play('hit', 0.105, pan, 0.065, 0.9 + (effect.id % 7) * 0.025); break;
        case 'pickup': this.play('pickup', 0.2, pan, 0.05); break;
        case 'heal': this.play('repair', 0.42, pan, 0.18); break;
        case 'repulsor': this.play('repulsor', 0.62, pan, 0.25); break;
        case 'transform': this.play('transform', 0.58, pan, 0.28); break;
        case 'gravity-collapse': this.play('gravity-collapse', 0.54, pan, 0.32); break;
        case 'pulsar': this.play('pulsar', 0.5, pan, 0.36, 0.96 + (effect.id % 2) * 0.06); break;
        case 'boomerang-rift': this.play('boomerang', 0.36, pan, 0.24, effect.color === '#ffd46a' ? 0.86 : 1); break;
        case 'gunship-shot': this.play('gunship-cannon', 0.32, pan, 0.13, 0.92 + (effect.id % 3) * 0.05); break;
        case 'singularity': this.play('singularity-open', 0.68, pan, 0.7); break;
        case 'singularity-collapse': this.play('singularity-collapse', 0.8, pan, 0.7); break;
        default: break;
      }
    }
    this.lastEffectId = Math.max(this.lastEffectId, ...state.effects.map((e) => e.id), 0);

    for (const hazard of state.hazards) {
      if (!hazard.active || hazard.id <= this.lastHazardId) continue;
      if (hazard.kind === 'plasma-wake') this.play('plasma-wake', 0.2, panAt(hazard.x), 0.28, 0.92 + (hazard.id % 5) * 0.025);
    }
    this.lastHazardId = Math.max(this.lastHazardId, ...state.hazards.map((h) => h.id), 0);

    const bossCount = state.bosses.filter((b) => b.active && b.state !== 'dead').length;
    if (bossCount > this.lastBossCount) this.play('boss-warning', 0.76, 0, 1.2);
    if (bossCount < this.lastBossCount) this.play('boss-death', 0.8, 0, 0.8);
    this.lastBossCount = bossCount;
    if (this.lastHealth > 0 && state.player.health < this.lastHealth - 0.5) this.play('hit', 0.28, 0, 0.12, 0.82);
    this.lastHealth = state.player.health;
    if (this.lastForm && this.lastForm !== state.player.form) this.play('transform', 0.56, 0, 0.35);
    this.lastForm = state.player.form;
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    try { this.musicSource?.stop(); } catch { /* already stopped */ }
    for (const voice of this.voices) {
      try { voice.stop(); } catch { /* already stopped */ }
    }
    this.voices.clear();
    this.musicSource = null;
    void this.context?.close();
    this.context = null;
    this.master = null;
    this.musicBus = null;
    this.sfxBus = null;
    this.compressor = null;
    this.buffers.clear();
  }
}

function clampAudio(value: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, value));
}

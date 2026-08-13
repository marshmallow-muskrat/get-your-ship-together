import type { SurvivorState } from '../modes/survivor/survivorState';

type AudioMode = 'menu' | 'combat';

const TRACK_URL = '/audio/command-deck.wav';
// Keep the established key so existing players retain their mute preference after the
// music-only redesign.
const MUTE_KEY = 'gyst.audio.muted';

/**
 * Music-only audio system.
 *
 * The first audio pass attached a cue to nearly every combat event. At endless-mode
 * density those individually restrained sounds still accumulated into an exhausting
 * wall of noise. This bus now has exactly one voice: the project-owned ambient score.
 * The semantic methods remain as deliberately silent compatibility hooks so screens do
 * not need to know whether a future mix contains UI feedback.
 */
export class AudioBus {
  private context: AudioContext | null = null;
  private master: GainNode | null = null;
  private musicBus: GainNode | null = null;
  private musicSource: AudioBufferSourceNode | null = null;
  private rawLoad: Promise<ArrayBuffer | null> | null = null;
  private loadPromise: Promise<void> | null = null;
  private musicBuffer: AudioBuffer | null = null;
  private mode: AudioMode = 'menu';
  private muted = false;
  private disposed = false;

  constructor() {
    try {
      this.muted = localStorage.getItem(MUTE_KEY) === '1';
    } catch {
      this.muted = false;
    }
  }

  /** Begin the one network read without creating or resuming an AudioContext. */
  preload(): void {
    if (this.rawLoad || typeof fetch !== 'function') return;
    this.rawLoad = fetch(TRACK_URL)
      .then(async (response) => {
        if (!response.ok) throw new Error(`ambient score: HTTP ${response.status}`);
        return response.arrayBuffer();
      })
      .catch((error) => {
        // Music is an enhancement, never a reason to take down gameplay.
        console.warn('Ambient score unavailable', error);
        return null;
      });
  }

  async unlock(): Promise<void> {
    if (this.disposed || typeof window === 'undefined') return;
    const Ctx =
      window.AudioContext ??
      (window as typeof window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctx) return;
    this.preload();
    if (!this.context) {
      const ctx = new Ctx();
      const master = ctx.createGain();
      const music = ctx.createGain();
      master.gain.value = this.muted ? 0 : 0.86;
      music.gain.value = this.targetMusicVolume();
      music.connect(master);
      master.connect(ctx.destination);
      this.context = ctx;
      this.master = master;
      this.musicBus = music;
    }
    if (this.context.state === 'suspended') await this.context.resume();
    if (!this.loadPromise) {
      this.loadPromise = (async () => {
        const raw = await this.rawLoad;
        if (!raw || !this.context) return;
        try {
          this.musicBuffer = await this.context.decodeAudioData(raw.slice(0));
        } catch (error) {
          console.warn('Ambient score decode unavailable', error);
        }
      })();
    }
    await this.loadPromise;
    this.startMusic();
  }

  private targetMusicVolume(): number {
    // Combat stays slightly quieter so the score supports focus instead of demanding it.
    return this.mode === 'menu' ? 0.19 : 0.16;
  }

  setMode(mode: AudioMode): void {
    this.mode = mode;
    this.preload();
    if (this.context && this.musicBus) {
      this.musicBus.gain.setTargetAtTime(this.targetMusicVolume(), this.context.currentTime, 1.4);
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
      this.master.gain.setTargetAtTime(this.muted ? 0 : 0.86, this.context.currentTime, 0.18);
    }
  }

  private startMusic(): void {
    if (!this.context || !this.musicBus || !this.musicBuffer || this.musicSource || this.disposed) return;
    const source = this.context.createBufferSource();
    source.buffer = this.musicBuffer;
    source.loop = true;
    source.connect(this.musicBus);
    source.start();
    this.musicSource = source;
  }

  // Intentionally silent. There are no UI, weapon, spell, pickup, hit, or boss cues in
  // the current mix; only the ambient score is allowed to reach the output graph.
  uiMove(): void {}
  uiConfirm(): void {}
  fire(): void {}
  hit(): void {}
  dodge(): void {}
  repair(): void {}
  ability(): void {}
  transform(): void {}
  enemyAttack(): void {}
  bossDeath(): void {}
  pickup(): void {}
  sync(_state: SurvivorState): void {}

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    try {
      this.musicSource?.stop();
    } catch {
      // Already stopped.
    }
    this.musicSource?.disconnect();
    this.musicSource = null;
    this.musicBuffer = null;
    void this.context?.close();
    this.context = null;
    this.master = null;
    this.musicBus = null;
  }
}

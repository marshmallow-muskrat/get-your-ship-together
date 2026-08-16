import type { SurvivorState } from '../modes/survivor/survivorState';

type AudioMode = 'menu' | 'combat';

/**
 * Compressed masters, best first.
 *
 * The score used to ship as a 22.6 MB uncompressed WAV — larger than the JavaScript
 * bundle, every hero model and every boss model combined, and 57% of everything a
 * first-time visitor downloaded. Opus at 96 kbps is 1.6 MB for the same 128 seconds.
 * AAC is carried for Safari, which only gained Ogg Opus support very recently.
 */
const TRACK_SOURCES: ReadonlyArray<{ url: string; mime: string }> = [
  { url: '/audio/command-deck.opus', mime: 'audio/ogg; codecs="opus"' },
  { url: '/audio/command-deck.m4a', mime: 'audio/mp4; codecs="mp4a.40.2"' },
];

/**
 * Authored loop length, matching `DURATION` in `scripts/generateAudioAssets.mjs`.
 *
 * A lossy encoder pads the tail — Opus adds ~6.5 ms here — and looping the decoded
 * buffer's full length would replay that padding as a gap every time around. Pinning
 * the loop to the authored length keeps the seam exact whatever the codec does.
 */
const LOOP_SECONDS = 128;

// Keep the established key so existing players retain their mute preference after the
// music-only redesign.
const MUTE_KEY = 'gyst.audio.muted';

/** First source this browser claims it can decode; null when none are playable. */
function pickTrackUrl(): string | null {
  if (typeof document === 'undefined') return TRACK_SOURCES[0]!.url;
  const probe = document.createElement('audio');
  for (const source of TRACK_SOURCES) {
    // '' means no; 'maybe' and 'probably' are both worth attempting.
    if (probe.canPlayType(source.mime) !== '') return source.url;
  }
  return null;
}

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
    const url = pickTrackUrl();
    if (!url) {
      this.rawLoad = Promise.resolve(null);
      return;
    }
    this.rawLoad = fetch(url)
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

  /**
   * Set the mix mode. Deliberately does *not* start the download: screens call
   * `preload()` themselves once their blocking assets are in, so the score does not
   * compete for bandwidth with the models they cannot start without. `unlock()` also
   * preloads, so a user gesture still guarantees the fetch on any path.
   */
  setMode(mode: AudioMode): void {
    this.mode = mode;
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
    source.loopStart = 0;
    // Never loop past the authored end, even if the decoder handed back codec padding.
    source.loopEnd = Math.min(LOOP_SECONDS, this.musicBuffer.duration);
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

/**
 * Audio intentionally disabled for the vertical slice.
 * Re-enable later with licensed/mixed SFX — do not reintroduce the synth bus as final audio.
 */
export class AudioBus {
  setMuted(_muted: boolean): void {
    // no-op
  }

  fire(): void {}
  hit(): void {}
  dodge(): void {}
  repair(): void {}
  ability(): void {}
  transform(): void {}
  enemyAttack(): void {}
  bossDeath(): void {}
  pickup(): void {}

  dispose(): void {}
}

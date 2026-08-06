/** Combat tuning anchors — adjust from playtesting, not sacred. */
export const TUNING = {
  fixedDt: 1 / 60,
  maxSubsteps: 5,
  playerMaxHealth: 100,
  dodge: {
    duration: 0.28,
    invuln: 0.28,
    cooldown: 0.85,
    speed: 16,
  },
  repair: {
    fraction: 0.3,
    cooldown: 14,
  },
  mech: {
    duration: 15,
    cooldown: 8, // slice-friendly; intended eventual ~60s
    enterDuration: 0.45,
    exitDuration: 0.35,
  },
  /**
   * Abilities are meant to spike hard vs primary hold-fire.
   * Primary ~12 dmg / 0.18s ≈ 67 DPS; abilities should clear or chunk packs.
   */
  ability: {
    microdrone: { count: 5, life: 2.6, speed: 13, damage: 32, radius: 0.2, turnRate: 10 },
    railLance: { damage: 160, width: 0.65, length: 16, life: 0.3 },
    gravityPulse: { radius: 3.8, damage: 95, slowDuration: 1.8, slowMul: 0.3 },
    rocketBarrage: { count: 6, delay: 0.4, radius: 1.55, damage: 48, fuse: 0.5 },
  },
  hitstop: {
    light: 0.03,
    medium: 0.055,
    heavy: 0.09,
  },
  camera: {
    /** Half of ortho frustum height — roomy enough for a bigger authored map. */
    frustumHalfHeight: 5.8,
    followLerp: 7.5,
    lookAhead: 1.8,
    shakeDecay: 8,
  },
} as const;

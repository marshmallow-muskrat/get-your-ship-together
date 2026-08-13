/**
 * Deterministic, project-owned audio render.
 *
 * These are pre-rendered PCM assets, not a live browser synth. Running this script with
 * Node reproduces every file in public/audio byte-for-byte. No third-party samples or
 * imported asset-pack files are used.
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const OUT = fileURLToPath(new URL('../public/audio/', import.meta.url));
const SR = 32_000;
const TAU = Math.PI * 2;
mkdirSync(OUT, { recursive: true });

function rng(seed) {
  let s = seed >>> 0;
  return () => {
    s ^= s << 13;
    s ^= s >>> 17;
    s ^= s << 5;
    return (s >>> 0) / 0x1_0000_0000;
  };
}

const clamp = (x, lo = -1, hi = 1) => Math.max(lo, Math.min(hi, x));
const smooth = (x) => {
  const k = clamp(x, 0, 1);
  return k * k * (3 - 2 * k);
};
const attackRelease = (t, d, a = 0.02, r = 0.2) => smooth(t / a) * smooth((d - t) / r);
const chirp = (t, f0, f1, d, phase = 0) => Math.sin(TAU * (f0 * t + ((f1 - f0) * t * t) / (2 * d)) + phase);
const osc = (t, f, phase = 0) => Math.sin(TAU * f * t + phase);

function reverberate(samples, amount = 0.18) {
  const delays = [0.047, 0.083, 0.137, 0.211].map((s) => Math.round(s * SR));
  const gains = [0.42, 0.31, 0.22, 0.15];
  const out = Float64Array.from(samples);
  for (let n = 0; n < samples.length; n += 1) {
    for (let i = 0; i < delays.length; i += 1) {
      const from = n - delays[i];
      if (from >= 0) out[n] += samples[from] * gains[i] * amount;
    }
  }
  return out;
}

function polish(samples, peak = 0.88) {
  let max = 1e-9;
  for (let i = 0; i < samples.length; i += 1) {
    samples[i] = Math.tanh(samples[i] * 1.24);
    max = Math.max(max, Math.abs(samples[i]));
  }
  const gain = peak / max;
  for (let i = 0; i < samples.length; i += 1) samples[i] *= gain;
  return samples;
}

function renderMono(duration, seed, voice, reverb = 0.16) {
  const count = Math.round(duration * SR);
  const out = new Float64Array(count);
  const random = rng(seed);
  let low = 0;
  let band = 0;
  for (let n = 0; n < count; n += 1) {
    const t = n / SR;
    const white = random() * 2 - 1;
    low += (white - low) * 0.035;
    band += (white - band) * 0.18;
    out[n] = voice(t, duration, white, low, band);
  }
  return polish(reverberate(out, reverb));
}

function wavBuffer(channels, sampleRate = SR) {
  const frames = channels[0].length;
  const channelCount = channels.length;
  const bytes = frames * channelCount * 2;
  const b = Buffer.alloc(44 + bytes);
  b.write('RIFF', 0);
  b.writeUInt32LE(36 + bytes, 4);
  b.write('WAVEfmt ', 8);
  b.writeUInt32LE(16, 16);
  b.writeUInt16LE(1, 20);
  b.writeUInt16LE(channelCount, 22);
  b.writeUInt32LE(sampleRate, 24);
  b.writeUInt32LE(sampleRate * channelCount * 2, 28);
  b.writeUInt16LE(channelCount * 2, 32);
  b.writeUInt16LE(16, 34);
  b.write('data', 36);
  b.writeUInt32LE(bytes, 40);
  let at = 44;
  for (let i = 0; i < frames; i += 1) {
    for (const channel of channels) {
      b.writeInt16LE(Math.round(clamp(channel[i]) * 32767), at);
      at += 2;
    }
  }
  return b;
}

function save(name, samples) {
  writeFileSync(join(OUT, `${name}.wav`), wavBuffer(Array.isArray(samples) ? samples : [samples]));
}

const voices = {
  'ui-move': [0.13, 0x101, (t, d) => attackRelease(t, d, 0.006, 0.07) * (osc(t, 760 + t * 1500) * 0.62 + osc(t, 1520 + t * 900) * 0.2), 0.04],
  'ui-confirm': [0.48, 0x102, (t, d) => attackRelease(t, d, 0.008, 0.22) * (osc(t, 392) * 0.42 + osc(t, 588, 0.3) * 0.34 + osc(t, 784, 0.8) * 0.2), 0.3],
  'weapon-fire': [0.18, 0x103, (t, d, w, l) => attackRelease(t, d, 0.002, 0.1) * (chirp(t, 1700, 340, d) * 0.6 + l * 0.55), 0.08],
  'plasma-wake': [0.72, 0x104, (t, d, w, l, b) => attackRelease(t, d, 0.035, 0.3) * (chirp(t, 180, 880, d) * 0.32 + osc(t, 73, Math.sin(t * 14)) * 0.24 + b * 0.42), 0.32],
  'gravity-collapse': [1.05, 0x105, (t, d, w, l) => attackRelease(t, d, 0.015, 0.4) * (chirp(t, 360, 42, d) * 0.38 + osc(t, 46) * 0.5 + l * (0.25 + t * 0.35)), 0.45],
  'boomerang': [0.82, 0x106, (t, d, w, l) => attackRelease(t, d, 0.012, 0.25) * (osc(t, 430 + Math.sin(t * 18) * 180, Math.sin(t * 31) * 1.8) * 0.45 + chirp(t, 1200, 260, d) * 0.3 + l * 0.18), 0.28],
  'pulsar': [1.2, 0x107, (t, d, w, l) => attackRelease(t, d, 0.004, 0.55) * (osc(t, 43) * 0.62 + chirp(t, 2100, 280, d) * 0.28 + osc(t, 860, t * 8) * 0.18 + l * 0.25), 0.48],
  'gunship-cannon': [0.42, 0x108, (t, d, w, l) => attackRelease(t, d, 0.001, 0.28) * (osc(t, 52) * 0.68 + chirp(t, 220, 48, d) * 0.36 + l * 0.62), 0.42],
  'singularity-open': [1.45, 0x109, (t, d, w, l) => attackRelease(t, d, 0.08, 0.5) * (chirp(t, 780, 36, d) * 0.32 + osc(t, 38 + Math.sin(t * 4) * 4) * 0.56 + l * (0.18 + t * 0.32)), 0.62],
  'singularity-collapse': [1.55, 0x10a, (t, d, w, l, b) => {
    const pre = t < 0.42 ? smooth(t / 0.42) * chirp(t, 260, 1900, 0.42) * 0.28 : 0;
    const u = Math.max(0, t - 0.42);
    const boom = u > 0 ? Math.exp(-u * 3.3) * (osc(u, 37) * 0.75 + chirp(u, 420, 52, d - 0.42) * 0.35 + l * 0.62) : 0;
    return pre + boom + b * Math.exp(-u * 7) * 0.18;
  }, 0.68],
  pickup: [0.3, 0x10b, (t, d) => attackRelease(t, d, 0.004, 0.16) * (chirp(t, 620, 1680, d) * 0.46 + osc(t, 1240) * 0.22), 0.22],
  repair: [0.78, 0x10c, (t, d) => attackRelease(t, d, 0.015, 0.35) * (osc(t, 330) * 0.3 + osc(t, 495, 0.2) * 0.28 + osc(t, 660, 0.6) * 0.22 + chirp(t, 460, 980, d) * 0.2), 0.48],
  dodge: [0.36, 0x10d, (t, d, w, l, b) => attackRelease(t, d, 0.004, 0.15) * (chirp(t, 120, 1500, d) * 0.2 + b * 0.7 + l * 0.25), 0.14],
  repulsor: [0.9, 0x10e, (t, d, w, l) => attackRelease(t, d, 0.002, 0.42) * (chirp(t, 1800, 70, d) * 0.32 + osc(t, 49) * 0.64 + l * 0.38), 0.52],
  transform: [1.15, 0x10f, (t, d, w, l) => attackRelease(t, d, 0.025, 0.3) * (chirp(t, 90, 1450, d) * 0.38 + osc(t, 220 + t * 400, t * 6) * 0.3 + l * 0.32), 0.5],
  'boss-warning': [1.4, 0x110, (t, d, w, l) => attackRelease(t, d, 0.025, 0.48) * ((osc(t, 73) + osc(t, 109.5, 0.4) + osc(t, 146, 0.8)) * 0.28 + l * 0.2), 0.58],
  'boss-death': [1.9, 0x111, (t, d, w, l) => attackRelease(t, d, 0.002, 0.8) * (chirp(t, 820, 32, d) * 0.3 + osc(t, 41) * 0.56 + l * 0.52), 0.7],
  hit: [0.16, 0x112, (t, d, w, l) => attackRelease(t, d, 0.001, 0.1) * (chirp(t, 520, 90, d) * 0.35 + l * 0.75), 0.06],
};

for (const [name, [duration, seed, voice, reverb]] of Object.entries(voices)) {
  save(name, renderMono(duration, seed, voice, reverb));
}

// Seamless 32-second command-deck score: low propulsion bed, glass harmonics and a
// restrained four-second pulse. All modulations are periodic across the loop boundary.
const musicDuration = 32;
const frames = musicDuration * SR;
const left = new Float64Array(frames);
const right = new Float64Array(frames);
const random = rng(0x47595354);
let airL = 0;
let airR = 0;
for (let n = 0; n < frames; n += 1) {
  const t = n / SR;
  const loop = TAU * t / musicDuration;
  airL += ((random() * 2 - 1) - airL) * 0.003;
  airR += ((random() * 2 - 1) - airR) * 0.0034;
  const drone = osc(t, 55) * 0.18 + osc(t, 82.5, 0.4) * 0.11 + osc(t, 110, 1.1) * 0.07;
  const choir = osc(t, 220, Math.sin(loop * 2) * 0.8) * 0.055 + osc(t, 330, Math.cos(loop * 3) * 0.6) * 0.04;
  const pulsePhase = (t % 4) / 4;
  const pulse = Math.exp(-pulsePhase * 8) * (osc(t, 55) * 0.13 + osc(t, 880, 0.3) * 0.025);
  const glassL = osc(t, 440, Math.sin(loop * 5) * 2.2) * (0.025 + 0.018 * Math.sin(loop * 4));
  const glassR = osc(t, 440, Math.cos(loop * 5) * 2.2 + 0.7) * (0.025 + 0.018 * Math.cos(loop * 4));
  left[n] = drone + choir + pulse + glassL + airL * 0.09;
  right[n] = drone * 0.96 + choir * 1.04 + pulse + glassR + airR * 0.09;
}
save('command-deck', [polish(reverberate(left, 0.42), 0.72), polish(reverberate(right, 0.46), 0.72)]);

console.log(`Generated ${Object.keys(voices).length + 1} project-owned audio assets in ${OUT}`);

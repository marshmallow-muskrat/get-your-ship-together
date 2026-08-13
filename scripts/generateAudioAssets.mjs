/**
 * Deterministic, project-owned ambient score render.
 *
 * The game deliberately ships no UI, weapon, spell, hit, pickup, or boss sounds. This
 * script renders one long-form stereo master: a restrained sci-fi lofi bed designed to
 * sit behind a dense survival run without adding fatigue. No samples, asset-pack files,
 * or third-party recordings are used.
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const OUT = fileURLToPath(new URL('../public/audio/', import.meta.url));
const SR = 44_100;
const DURATION = 128;
const FRAMES = SR * DURATION;
const TAU = Math.PI * 2;
const CHORD_SECONDS = 8;
mkdirSync(OUT, { recursive: true });

const clamp = (value, lo = -1, hi = 1) => Math.max(lo, Math.min(hi, value));
const smooth = (value) => {
  const t = clamp(value, 0, 1);
  return t * t * (3 - 2 * t);
};
const midiHz = (midi) => 440 * 2 ** ((midi - 69) / 12);

function rng(seed) {
  let state = seed >>> 0;
  return () => {
    state ^= state << 13;
    state ^= state >>> 17;
    state ^= state << 5;
    return (state >>> 0) / 0x1_0000_0000;
  };
}

// Sixteen harmonically related eight-second scenes. The second half reharmonises the
// first instead of repeating it verbatim, then resolves to Cm9 for a seamless return.
const CHORDS = [
  [48, 51, 55, 58, 62], // Cm9
  [44, 48, 51, 55, 58], // Abmaj9
  [51, 55, 58, 62, 65], // Ebmaj9
  [46, 50, 53, 55, 60], // Bb6/9
  [53, 56, 60, 63, 67], // Fm9
  [43, 48, 51, 58, 62], // Cm9/G
  [44, 48, 51, 55, 60], // Abmaj7/9
  [43, 50, 53, 56, 60], // G7sus(b9)
  [48, 55, 58, 62, 63], // Cm11
  [41, 48, 53, 55, 60], // Fm9/C
  [44, 51, 55, 58, 60], // Abmaj13
  [46, 53, 55, 60, 62], // Bb13sus
  [39, 46, 51, 53, 58], // Ebmaj9/Bb
  [41, 48, 53, 56, 60], // Fm11
  [43, 50, 53, 56, 62], // G7sus(b9/13)
  [48, 51, 55, 58, 62], // Cm9 resolution
];

// A sparse, non-loop-obvious electric-piano line. It moves every four seconds and is
// derived from the current harmony, so there is no short repeating arpeggiator motif.
const MELODY_VOICE = [
  4, 2, 3, 1, 4, 0, 2, 3, 1, 4, 2, 0, 3, 1, 4, 2,
  2, 4, 1, 3, 0, 4, 2, 1, 3, 2, 4, 0, 2, 3, 1, 4,
];
const MELODY_OCTAVE = [
  12, 12, 24, 12, 12, 24, 12, 12, 24, 12, 12, 24, 12, 12, 24, 12,
  24, 12, 12, 24, 12, 12, 24, 12, 12, 24, 12, 12, 24, 12, 12, 24,
];

function eventEnvelope(relative, duration, attack, release) {
  if (relative < 0 || relative >= duration) return 0;
  return smooth(relative / attack) * smooth((duration - relative) / release);
}

function wrappedEvent(index, count) {
  return ((index % count) + count) % count;
}

function padVoice(relative, midi, phase, detuneCents, driftPhase) {
  const hz = midiHz(midi) * 2 ** (detuneCents / 1200);
  const drift = Math.sin(TAU * relative * 0.071 + driftPhase) * 0.025;
  const angle = TAU * hz * relative + phase + drift;
  return Math.sin(angle) + Math.sin(angle * 2 + 0.37) * 0.18 + Math.sin(angle * 0.5 + 1.1) * 0.1;
}

function addPadScene(left, right, sceneIndex, relative) {
  const scene = wrappedEvent(sceneIndex, CHORDS.length);
  const chord = CHORDS[scene];
  const env = eventEnvelope(relative, CHORD_SECONDS + 3.2, 2.8, 3.2);
  if (env <= 0) return;
  const breath = 0.86 + Math.sin(TAU * relative / 9.6 + scene * 0.91) * 0.14;
  for (let note = 0; note < chord.length; note += 1) {
    const phase = scene * 1.731 + note * 0.937;
    const pan = (note / (chord.length - 1) - 0.5) * 0.54;
    const level = (note === 0 ? 0.034 : 0.026) * env * breath;
    left.value += padVoice(relative, chord[note], phase, -3.5 - note * 0.2, phase) * level * (1 - pan);
    right.value += padVoice(relative, chord[note], phase + 0.23, 3.2 + note * 0.25, phase + 1.2) * level * (1 + pan);
  }
  // A soft sub fundamental anchors the harmony without behaving like a kick drum.
  const sub = Math.sin(TAU * midiHz(chord[0] - 12) * relative + scene * 0.41);
  left.value += sub * 0.038 * env;
  right.value += sub * 0.037 * env;
}

function addRhodesEvent(left, right, eventIndex, relative) {
  const event = wrappedEvent(eventIndex, MELODY_VOICE.length);
  if (relative < 0 || relative >= 7.2) return;
  const scene = Math.floor(event / 2);
  const midi = CHORDS[scene][MELODY_VOICE[event]] + MELODY_OCTAVE[event];
  const hz = midiHz(midi);
  const attack = smooth(relative / 0.045);
  const body = Math.exp(-relative * 0.58) * attack;
  const phase = event * 1.177;
  const fundamental = Math.sin(TAU * hz * relative + phase);
  const tine = Math.sin(TAU * hz * 2.002 * relative + phase * 0.7) * Math.exp(-relative * 1.65);
  const glass = Math.sin(TAU * hz * 3.995 * relative + 0.8) * Math.exp(-relative * 2.9);
  const tremoloL = 0.82 + Math.sin(TAU * 0.31 * relative + phase) * 0.18;
  const tremoloR = 0.82 + Math.sin(TAU * 0.31 * relative + phase + Math.PI * 0.72) * 0.18;
  const note = fundamental * 0.055 + tine * 0.028 + glass * 0.012;
  left.value += note * body * tremoloL;
  right.value += note * body * tremoloR;
}

function periodicAir(seed) {
  const random = rng(seed);
  const white = new Float64Array(FRAMES);
  for (let i = 0; i < FRAMES; i += 1) white[i] = random() * 2 - 1;
  let state = 0;
  // Repeated circular passes converge the filter state at the loop boundary.
  for (let pass = 0; pass < 3; pass += 1) {
    for (let i = 0; i < FRAMES; i += 1) state += (white[i] - state) * 0.012;
  }
  const air = new Float64Array(FRAMES);
  for (let i = 0; i < FRAMES; i += 1) {
    state += (white[i] - state) * 0.012;
    air[i] = state;
  }
  return air;
}

function circularReverb(dry, side) {
  const out = Float64Array.from(dry);
  const delays = [0.173, 0.317, 0.521, 0.887, 1.313, 2.071];
  const gains = [0.2, 0.15, 0.12, 0.095, 0.07, 0.05];
  for (let tap = 0; tap < delays.length; tap += 1) {
    const delay = Math.round((delays[tap] + side * (tap % 2 ? 0.011 : -0.007)) * SR);
    for (let i = 0; i < FRAMES; i += 1) {
      out[i] += dry[(i - delay + FRAMES) % FRAMES] * gains[tap];
    }
  }
  return out;
}

function master(left, right) {
  let peak = 1e-9;
  for (let i = 0; i < FRAMES; i += 1) {
    // Gentle tape saturation rounds Rhodes transients without pumping the pad.
    left[i] = Math.tanh(left[i] * 1.16);
    right[i] = Math.tanh(right[i] * 1.16);
    peak = Math.max(peak, Math.abs(left[i]), Math.abs(right[i]));
  }
  const gain = 0.56 / peak;
  for (let i = 0; i < FRAMES; i += 1) {
    left[i] *= gain;
    right[i] *= gain;
  }
}

function wavBuffer(channels) {
  const bytes = FRAMES * channels.length * 2;
  const buffer = Buffer.alloc(44 + bytes);
  buffer.write('RIFF', 0);
  buffer.writeUInt32LE(36 + bytes, 4);
  buffer.write('WAVEfmt ', 8);
  buffer.writeUInt32LE(16, 16);
  buffer.writeUInt16LE(1, 20);
  buffer.writeUInt16LE(channels.length, 22);
  buffer.writeUInt32LE(SR, 24);
  buffer.writeUInt32LE(SR * channels.length * 2, 28);
  buffer.writeUInt16LE(channels.length * 2, 32);
  buffer.writeUInt16LE(16, 34);
  buffer.write('data', 36);
  buffer.writeUInt32LE(bytes, 40);
  let at = 44;
  for (let i = 0; i < FRAMES; i += 1) {
    for (const channel of channels) {
      buffer.writeInt16LE(Math.round(clamp(channel[i]) * 32767), at);
      at += 2;
    }
  }
  return buffer;
}

const airLeft = periodicAir(0x47595354);
const airRight = periodicAir(0x434f534d);
const dryLeft = new Float64Array(FRAMES);
const dryRight = new Float64Array(FRAMES);
for (let frame = 0; frame < FRAMES; frame += 1) {
  const time = frame / SR;
  const sceneIndex = Math.floor(time / CHORD_SECONDS);
  const sceneRelative = time - sceneIndex * CHORD_SECONDS;
  const left = { value: 0 };
  const right = { value: 0 };
  addPadScene(left, right, sceneIndex, sceneRelative);
  addPadScene(left, right, sceneIndex - 1, sceneRelative + CHORD_SECONDS);

  const melodyIndex = Math.floor(time / 4);
  const melodyRelative = time - melodyIndex * 4;
  addRhodesEvent(left, right, melodyIndex, melodyRelative);
  addRhodesEvent(left, right, melodyIndex - 1, melodyRelative + 4);

  // Quiet filtered cabin air and two ultra-slow, loop-periodic synth harmonics provide
  // motion between notes without a beat or a conspicuous short cycle.
  const horizon =
    Math.sin(TAU * 119 * time / DURATION + 0.4) * 0.009 +
    Math.sin(TAU * 173 * time / DURATION + 2.1) * 0.006;
  dryLeft[frame] = left.value + horizon + airLeft[frame] * 0.018;
  dryRight[frame] = right.value + horizon * 0.92 + airRight[frame] * 0.018;
}

const left = circularReverb(dryLeft, -1);
const right = circularReverb(dryRight, 1);
master(left, right);
writeFileSync(join(OUT, 'command-deck.wav'), wavBuffer([left, right]));
console.log(`Generated one ${DURATION}s project-owned ambient score at ${SR}Hz in ${OUT}`);

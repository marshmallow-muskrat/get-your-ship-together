/**
 * Renderer resource stability.
 *
 * The browser procedure in `docs/CONTAINMENT_PROTOCOL.md` reports real
 * `renderer.info` counters, but it is a manual reading. This test is the
 * reproducible half: it drives the actual `SurvivorRenderer` against the
 * `survivor-stress` fixture for thousands of frames and asserts that the objects
 * it owns reach a high-water mark instead of growing without bound.
 *
 * No WebGL context is required — Three.js constructs geometries and materials
 * without one, and the leak we care about is object accounting, not GPU upload.
 */
import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { AssetLibrary } from '../../assets/AssetLibrary';
import { SurvivorRenderer } from './survivorRender';
import { SURVIVOR } from './survivorContent';
import { createSurvivorState, type SurvivorState } from './survivorState';
import { EMPTY_SURVIVOR_INPUT, forceStartProtocol, stepSurvivor } from './survivorSim';

interface ResourceCount {
  meshes: number;
  geometries: number;
  materials: number;
  effects: number;
  attacks: number;
  railPool: number;
}

function countResources(renderer: SurvivorRenderer): ResourceCount {
  const geo = new Set<THREE.BufferGeometry>();
  const mat = new Set<THREE.Material>();
  let meshes = 0;
  renderer.root.traverse((o) => {
    if (!(o instanceof THREE.Mesh)) return;
    meshes += 1;
    if (o.geometry) geo.add(o.geometry);
    const m = Array.isArray(o.material) ? o.material : [o.material];
    for (const x of m) if (x) mat.add(x);
  });
  const pools = renderer.poolStats();
  return {
    meshes,
    geometries: geo.size,
    materials: mat.size,
    effects: pools.effects,
    attacks: pools.attacks,
    railPool: pools.railPool,
  };
}

/** Drive sim + renderer for `seconds` of simulated time, sampling as we go. */
function runStress(
  state: SurvivorState,
  renderer: SurvivorRenderer,
  seconds: number,
  onSample?: (t: number, c: ResourceCount) => void,
): ResourceCount[] {
  const samples: ResourceCount[] = [];
  const steps = Math.floor(seconds / SURVIVOR.fixedDt);
  const sampleEvery = Math.floor(10 / SURVIVOR.fixedDt); // every 10 simulated seconds
  for (let i = 0; i < steps; i += 1) {
    stepSurvivor(state, EMPTY_SURVIVOR_INPUT, SURVIVOR.fixedDt);
    renderer.sync(state, SURVIVOR.fixedDt);
    // Keep the protocol effects churning so their visuals are created and released.
    if (i % 900 === 0) forceStartProtocol(state, 'gravitic-recall', 1);
    if (i % 1500 === 700) forceStartProtocol(state, 'gunship-flyby', 1);
    if (i % 1800 === 1200) forceStartProtocol(state, 'aegis-barrier', 1);
    if (i % 2100 === 1500) forceStartProtocol(state, 'titan-protocol', 1.5);
    if (i % 2400 === 1800) forceStartProtocol(state, 'fleet-annihilation', 1.5);
    if (i % 2700 === 2100) forceStartProtocol(state, 'singularity-event', 1.5);
    if (i > 0 && i % sampleEvery === 0) {
      const c = countResources(renderer);
      samples.push(c);
      onSample?.(i * SURVIVOR.fixedDt, c);
    }
  }
  return samples;
}

function stressState(seed: number): SurvivorState {
  const state = createSurvivorState('bee', 'survivor-stress', seed);
  state.player.invuln = 1e9;
  return state;
}

describe('renderer resource stability', () => {
  it('effect, attack and rail pools reach a high-water mark under sustained load', () => {
    const renderer = new SurvivorRenderer(new AssetLibrary());
    const state = stressState(9101);

    // Warm-up so first-use allocations are not counted as growth.
    runStress(state, renderer, 20);
    const warm = countResources(renderer);

    const samples = runStress(state, renderer, 240);
    const post = countResources(renderer);

    // Something must actually have been exercised, or this test proves nothing.
    expect(samples.length).toBeGreaterThan(5);
    expect(warm.meshes).toBeGreaterThan(0);

    const peakGeo = Math.max(...samples.map((s) => s.geometries));
    const peakMat = Math.max(...samples.map((s) => s.materials));

    // The second half must not exceed the first half's peak by a meaningful margin:
    // a real leak grows monotonically rather than oscillating around a ceiling.
    const half = Math.floor(samples.length / 2);
    const firstPeak = Math.max(...samples.slice(0, half).map((s) => s.geometries));
    const secondPeak = Math.max(...samples.slice(half).map((s) => s.geometries));
    expect(secondPeak).toBeLessThanOrEqual(firstPeak * 1.25 + 8);

    const firstMatPeak = Math.max(...samples.slice(0, half).map((s) => s.materials));
    const secondMatPeak = Math.max(...samples.slice(half).map((s) => s.materials));
    expect(secondMatPeak).toBeLessThanOrEqual(firstMatPeak * 1.25 + 8);

    // Pools are bounded, not unbounded caches.
    expect(post.attacks).toBeLessThanOrEqual(48);
    expect(post.railPool).toBeLessThanOrEqual(256);
    expect(post.effects).toBeLessThanOrEqual(400);
    expect(peakGeo).toBeLessThan(4000);
    expect(peakMat).toBeLessThan(4000);
  }, 120000);

  it('full teardown releases everything the renderer owns', () => {
    const renderer = new SurvivorRenderer(new AssetLibrary());
    const state = stressState(9102);
    runStress(state, renderer, 60);
    expect(countResources(renderer).meshes).toBeGreaterThan(0);

    renderer.dispose();
    const after = countResources(renderer);
    expect(after.meshes).toBe(0);
    expect(after.geometries).toBe(0);
    expect(after.materials).toBe(0);
    expect(after.effects).toBe(0);
    expect(after.attacks).toBe(0);
    expect(after.railPool).toBe(0);
  }, 60000);

  it('repeated restart cycles do not accumulate renderer objects', () => {
    const peaks: number[] = [];
    for (let cycle = 0; cycle < 4; cycle += 1) {
      const renderer = new SurvivorRenderer(new AssetLibrary());
      const state = stressState(9200 + cycle);
      runStress(state, renderer, 45);
      peaks.push(countResources(renderer).meshes);
      renderer.dispose();
      expect(countResources(renderer).meshes).toBe(0);
    }
    // Each cycle starts clean, so peaks stay comparable rather than climbing.
    const first = peaks[0]!;
    for (const p of peaks) {
      expect(p).toBeLessThanOrEqual(first * 1.5 + 20);
    }
  }, 120000);
});

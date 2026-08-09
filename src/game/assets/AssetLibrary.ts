import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import * as SkeletonUtils from 'three/addons/utils/SkeletonUtils.js';
import type { AnimationAliases, FormProfile, HeroDef, HeroId } from '../content/heroes';
import { HEROES } from '../content/heroes';
import { ALL_ENEMIES, BOSS_DEMON } from '../content/enemies';

export interface LoadedModel {
  template: THREE.Object3D;
  clips: THREE.AnimationClip[];
  profile?: FormProfile;
}

function withoutRootMotion(clip: THREE.AnimationClip): THREE.AnimationClip {
  const tracks = clip.tracks.filter((track) => {
    const normalized = track.name.toLowerCase().replaceAll('"', '');
    return !(/(^|[./\]])root([./\[]|$)/.test(normalized) && normalized.endsWith('.position')); // eslint-disable-line no-useless-escape
  });
  return tracks.length === clip.tracks.length ? clip : new THREE.AnimationClip(clip.name, clip.duration, tracks);
}

function fitToHeight(model: THREE.Object3D, targetHeight: number): void {
  model.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(model);
  const size = box.getSize(new THREE.Vector3());
  if (size.y > 1e-4) {
    model.scale.multiplyScalar(targetHeight / size.y);
  }
  model.updateMatrixWorld(true);
  const fitted = new THREE.Box3().setFromObject(model);
  model.position.y -= fitted.min.y;
}

function enhanceMaterials(root: THREE.Object3D): void {
  root.traverse((child) => {
    if (!(child instanceof THREE.Mesh)) return;
    child.castShadow = true;
    child.receiveShadow = true;
    const sources = Array.isArray(child.material) ? child.material : [child.material];
    const mapped = sources.map((source) => {
      const material = source.clone();
      if (material instanceof THREE.MeshStandardMaterial || material instanceof THREE.MeshPhysicalMaterial) {
        material.metalness = Math.min(0.55, Math.max(material.metalness, 0.08));
        material.roughness = Math.max(0.45, material.roughness);
        material.envMapIntensity = 0.65;
      }
      material.needsUpdate = true;
      return material;
    });
    child.material = Array.isArray(child.material) ? mapped : mapped[0];
  });
}

export class AssetLibrary {
  private readonly loader = new GLTFLoader();
  private readonly cache = new Map<string, LoadedModel>();
  private disposed = false;

  async loadUrl(url: string, targetHeight?: number): Promise<LoadedModel> {
    const cached = this.cache.get(url);
    if (cached) return cached;

    const gltf = await this.loader.loadAsync(url);
    const template = gltf.scene;
    if (targetHeight != null) fitToHeight(template, targetHeight);
    enhanceMaterials(template);
    const clips = (gltf.animations ?? []).map(withoutRootMotion);
    const entry: LoadedModel = { template, clips };
    this.cache.set(url, entry);
    return entry;
  }

  async preloadHero(heroId: HeroId): Promise<void> {
    const hero = HEROES[heroId];
    await Promise.all([
      this.loadUrl(hero.astronaut.url, hero.astronaut.targetHeight),
      this.loadUrl(hero.mech.url, hero.mech.targetHeight),
    ]);
  }

  async preloadCombat(): Promise<void> {
    await Promise.all([
      ...ALL_ENEMIES.map((e) => this.loadUrl(e.url, e.targetHeight)),
      this.loadUrl(BOSS_DEMON.url, BOSS_DEMON.targetHeight),
    ]);
  }

  async preloadSelection(): Promise<void> {
    const tasks: Promise<unknown>[] = [];
    for (const hero of Object.values(HEROES)) {
      tasks.push(this.loadUrl(hero.astronaut.url, 4.1));
      tasks.push(this.loadUrl(hero.mech.url, 6.0));
      tasks.push(this.loadUrl(hero.shipUrl, undefined).then((entry) => {
        // Ships fitted by width-ish later; just cache.
        return entry;
      }));
    }
    await Promise.all(tasks);
  }

  get(url: string): LoadedModel | null {
    return this.cache.get(url) ?? null;
  }

  clone(url: string): { root: THREE.Object3D; clips: THREE.AnimationClip[] } | null {
    const entry = this.cache.get(url);
    if (!entry) return null;
    const root = SkeletonUtils.clone(entry.template);
    return { root, clips: entry.clips };
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    for (const entry of this.cache.values()) {
      entry.template.traverse((child) => {
        if (child instanceof THREE.Mesh) {
          child.geometry?.dispose();
          const mats = Array.isArray(child.material) ? child.material : [child.material];
          for (const m of mats) m?.dispose?.();
        }
      });
    }
    this.cache.clear();
  }
}

export function resolveClip(
  clips: THREE.AnimationClip[],
  aliases: string[],
): THREE.AnimationClip | null {
  for (const name of aliases) {
    const found = clips.find((c) => c.name === name);
    if (found) return found;
  }
  return clips[0] ?? null;
}

export function createAnimator(
  root: THREE.Object3D,
  clips: THREE.AnimationClip[],
  aliases: AnimationAliases,
): {
  mixer: THREE.AnimationMixer;
  play: (state: keyof AnimationAliases, fade?: number) => void;
  update: (dt: number) => void;
  current: () => string | null;
} {
  const mixer = new THREE.AnimationMixer(root);
  const actions = new Map<string, THREE.AnimationAction>();
  let current: string | null = null;

  for (const key of Object.keys(aliases) as (keyof AnimationAliases)[]) {
    const clip = resolveClip(clips, aliases[key]);
    if (!clip) continue;
    const action = mixer.clipAction(clip);
    action.enabled = true;
    actions.set(key, action);
  }

  return {
    mixer,
    current: () => current,
    play(state, fade = 0.12) {
      if (current === state) return;
      const next = actions.get(state);
      if (!next) return;
      const prev = current ? actions.get(current) : null;
      next.reset();
      next.setEffectiveWeight(1);
      if (state === 'idle' || state === 'walk' || state === 'run') {
        next.setLoop(THREE.LoopRepeat, Infinity);
      } else {
        next.setLoop(THREE.LoopOnce, 1);
        next.clampWhenFinished = true;
      }
      next.play();
      if (prev && prev !== next) {
        prev.crossFadeTo(next, fade, false);
      } else {
        next.fadeIn(fade);
      }
      current = state;
    },
    update(dt) {
      mixer.update(dt);
    },
  };
}

export type HeroPresentationBundle = {
  hero: HeroDef;
  astronaut: LoadedModel;
  mech: LoadedModel;
  ship: LoadedModel | null;
};

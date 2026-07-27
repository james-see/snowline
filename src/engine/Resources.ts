import * as THREE from 'three';
import type { LoadProgress, ResourceManager } from '@/types/assets.ts';
import { presetBudgets, type LodBudgets } from '@/engine/Lod.ts';
import {
  configureColorMap,
  configureDataMap,
  createMaterialLibrary,
  DEFAULT_TILE_SCALE,
  PBR_SET_IDS,
  type ManifestMaterialEntry,
  type MaterialLibrary,
  type PbrMaps,
  type PbrSetId,
} from '@/render/materials/index.ts';
import { bindAuthoredPropMaps } from '@/course/props/materials.ts';
import {
  loadTreePrototypes,
  type TreeModelManifestEntry,
} from '@/course/props/treePrototypes.ts';

export interface ResourcesPreloadOptions {
  budgets?: Pick<LodBudgets, 'textureSize' | 'anisotropy'>;
}

/** Procedural / lightweight resources; CC0 packs augment via manifest when present. */
export class Resources implements ResourceManager {
  #textures = new Map<string, THREE.Texture>();
  #pbr = new Map<string, PbrMaps>();
  #materials: MaterialLibrary;
  #env: THREE.Texture | null = null;
  #renderer: THREE.WebGLRenderer;
  #anisotropy = 8;

  constructor(renderer: THREE.WebGLRenderer) {
    this.#renderer = renderer;
    this.#materials = createMaterialLibrary(this);
  }

  async preload(
    onProgress?: (p: LoadProgress) => void,
    options?: ResourcesPreloadOptions
  ): Promise<void> {
    const budgets = options?.budgets ?? presetBudgets('high');
    this.#anisotropy = Math.min(
      budgets.anisotropy,
      this.#renderer.capabilities.getMaxAnisotropy()
    );
    const texSize = budgets.textureSize;
    const anisotropy = this.#anisotropy;
    const loader = new THREE.TextureLoader();

    const procIds = ['snow', 'rock', 'ice', 'wood', 'metal'] as const;
    const defaultMaterials = (): ManifestMaterialEntry[] =>
      PBR_SET_IDS.map((id) => ({
        id,
        albedo: `/assets/textures/${id}_albedo.webp`,
        normal: `/assets/textures/${id}_normal.jpg`,
        orm: `/assets/textures/${id}_orm.jpg`,
        tileScale: DEFAULT_TILE_SCALE[id],
      }));

    type Manifest = {
      textures?: Record<string, string>;
      materials?: ManifestMaterialEntry[];
      models?: TreeModelManifestEntry[];
      environments?: { id: string; url: string; intensity?: number }[];
      env?: string;
    };

    let manifest: Manifest | null = null;
    try {
      const res = await fetch('/assets/manifest.json');
      if (res.ok) manifest = (await res.json()) as Manifest;
    } catch {
      /* offline / no manifest */
    }

    const materials =
      manifest?.materials?.length ? manifest.materials : defaultMaterials();
    const texEntries = Object.entries(manifest?.textures ?? {});
    const treeEntries = (manifest?.models ?? []).filter(
      (e) => (e.kind ?? 'tree') === 'tree' && e.url
    );

    // Resolve total work before reporting so the bar never rewinds.
    const total =
      procIds.length + materials.length + texEntries.length + treeEntries.length;
    let done = 0;
    const report = (current: string): void => {
      onProgress?.({ loaded: done, total: Math.max(total, 1), current });
    };

    for (const id of procIds) {
      report(id);
      this.#textures.set(id, this.#makeNoiseTexture(id, texSize));
      done++;
    }
    this.#env = this.#makeSkyEnv();

    for (const entry of materials) {
      report(entry.id);
      await this.#loadPbrEntry(entry, loader, anisotropy);
      done++;
    }

    bindAuthoredPropMaps(this.#materials);

    for (const [id, url] of texEntries) {
      report(id);
      try {
        const tex = await loader.loadAsync(url);
        configureColorMap(tex, anisotropy);
        this.#textures.set(id, tex);
      } catch {
        /* keep procedural */
      }
      done++;
    }

    if (treeEntries.length && manifest?.models?.length) {
      const treeBase = done;
      await loadTreePrototypes(manifest.models, (loaded, _t, id) => {
        onProgress?.({
          loaded: treeBase + loaded,
          total: Math.max(total, 1),
          current: id,
        });
      });
      done += treeEntries.length;
    }

    onProgress?.({ loaded: total, total: Math.max(total, 1), current: 'done' });
  }

  getTexture(id: string): THREE.Texture | null {
    return this.#textures.get(id) ?? null;
  }

  getPbrMaps(id: string): PbrMaps | null {
    return this.#pbr.get(id) ?? null;
  }

  getMaterials(): MaterialLibrary {
    return this.#materials;
  }

  getEnvMap(): THREE.Texture | null {
    return this.#env;
  }

  dispose(): void {
    this.#materials.dispose();
    for (const t of this.#textures.values()) t.dispose();
    this.#textures.clear();
    for (const set of this.#pbr.values()) {
      set.albedo.dispose();
      set.normal.dispose();
      set.orm.dispose();
    }
    this.#pbr.clear();
    this.#env?.dispose();
    this.#env = null;
  }

  async #loadPbrEntry(
    entry: ManifestMaterialEntry,
    loader: THREE.TextureLoader,
    anisotropy: number
  ): Promise<void> {
    try {
      const [albedo, normal, orm] = await Promise.all([
        loader.loadAsync(entry.albedo),
        loader.loadAsync(entry.normal),
        loader.loadAsync(entry.orm),
      ]);
      configureColorMap(albedo, anisotropy);
      configureDataMap(normal, anisotropy);
      configureDataMap(orm, anisotropy);
      const tileScale =
        entry.tileScale ||
        DEFAULT_TILE_SCALE[entry.id as PbrSetId] ||
        4;
      this.#pbr.set(entry.id, { albedo, normal, orm, tileScale });
      this.#textures.set(`${entry.id}_albedo`, albedo);
      this.#textures.set(`${entry.id}_normal`, normal);
      this.#textures.set(`${entry.id}_orm`, orm);
    } catch {
      /* keep procedural fallbacks */
    }
  }

  #makeNoiseTexture(kind: string, size = 256): THREE.DataTexture {
    const data = new Uint8Array(size * size * 4);
    let seed = kind.split('').reduce((a, c) => a + c.charCodeAt(0), 0);
    const rand = (): number => {
      seed = (seed * 16807) % 2147483647;
      return (seed & 0xffff) / 0xffff;
    };
    const palette: Record<string, [number, number, number]> = {
      snow: [235, 242, 250],
      rock: [92, 88, 82],
      ice: [180, 210, 230],
      wood: [120, 82, 48],
      metal: [160, 168, 176],
    };
    const base = palette[kind] ?? [200, 200, 200];
    for (let i = 0; i < size * size; i++) {
      const n = rand() * 0.18 - 0.09;
      const o = i * 4;
      data[o] = Math.min(255, Math.max(0, base[0] * (1 + n)));
      data[o + 1] = Math.min(255, Math.max(0, base[1] * (1 + n)));
      data[o + 2] = Math.min(255, Math.max(0, base[2] * (1 + n)));
      data[o + 3] = 255;
    }
    const tex = new THREE.DataTexture(data, size, size);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
    tex.needsUpdate = true;
    return tex;
  }

  #makeSkyEnv(): THREE.DataTexture {
    const size = 64;
    const data = new Uint8Array(size * size * 4);
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        const t = y / size;
        const o = (y * size + x) * 4;
        data[o] = Math.floor(120 + t * 80);
        data[o + 1] = Math.floor(160 + t * 50);
        data[o + 2] = Math.floor(200 + t * 30);
        data[o + 3] = 255;
      }
    }
    const tex = new THREE.DataTexture(data, size, size);
    tex.mapping = THREE.EquirectangularReflectionMapping;
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.needsUpdate = true;
    return tex;
  }
}

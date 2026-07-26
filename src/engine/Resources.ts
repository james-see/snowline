import * as THREE from 'three';
import type { LoadProgress, ResourceManager } from '@/types/assets.ts';
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

/** Procedural / lightweight resources; CC0 packs augment via manifest when present. */
export class Resources implements ResourceManager {
  #textures = new Map<string, THREE.Texture>();
  #pbr = new Map<string, PbrMaps>();
  #materials: MaterialLibrary;
  #env: THREE.Texture | null = null;
  #renderer: THREE.WebGLRenderer;

  constructor(renderer: THREE.WebGLRenderer) {
    this.#renderer = renderer;
    this.#materials = createMaterialLibrary(this);
  }

  async preload(onProgress?: (p: LoadProgress) => void): Promise<void> {
    const ids = ['snow', 'rock', 'ice', 'wood', 'metal'];
    let loaded = 0;
    for (const id of ids) {
      onProgress?.({ loaded, total: ids.length, current: id });
      this.#textures.set(id, this.#makeNoiseTexture(id));
      loaded++;
    }
    this.#env = this.#makeSkyEnv();
    onProgress?.({ loaded: ids.length, total: ids.length, current: 'done' });

    try {
      const res = await fetch('/assets/manifest.json');
      if (res.ok) {
        const manifest = (await res.json()) as {
          textures?: Record<string, string>;
          materials?: ManifestMaterialEntry[];
          environments?: { id: string; url: string; intensity?: number }[];
          env?: string;
        };

        const anisotropy = this.#renderer.capabilities.getMaxAnisotropy();
        const loader = new THREE.TextureLoader();

        if (manifest.materials?.length) {
          const total = manifest.materials.length;
          let i = 0;
          for (const entry of manifest.materials) {
            onProgress?.({ loaded: i, total, current: entry.id });
            await this.#loadPbrEntry(entry, loader, anisotropy);
            i++;
          }
          onProgress?.({ loaded: total, total, current: 'materials' });
        } else {
          // Textures on disk even if manifest.materials is empty.
          await this.#loadDefaultPbrSets(loader, anisotropy, onProgress);
        }

        if (manifest.textures) {
          for (const [id, url] of Object.entries(manifest.textures)) {
            try {
              const tex = await loader.loadAsync(url);
              configureColorMap(tex, anisotropy);
              this.#textures.set(id, tex);
            } catch {
              /* keep procedural */
            }
          }
        }
      } else {
        await this.#loadDefaultPbrSets(
          new THREE.TextureLoader(),
          this.#renderer.capabilities.getMaxAnisotropy(),
          onProgress
        );
      }
    } catch {
      /* offline / no assets yet — try direct texture paths */
      try {
        await this.#loadDefaultPbrSets(
          new THREE.TextureLoader(),
          this.#renderer.capabilities.getMaxAnisotropy(),
          onProgress
        );
      } catch {
        /* procedural only */
      }
    }
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

  async #loadDefaultPbrSets(
    loader: THREE.TextureLoader,
    anisotropy: number,
    onProgress?: (p: LoadProgress) => void
  ): Promise<void> {
    const total = PBR_SET_IDS.length;
    let i = 0;
    for (const id of PBR_SET_IDS) {
      onProgress?.({ loaded: i, total, current: id });
      await this.#loadPbrEntry(
        {
          id,
          albedo: `/assets/textures/${id}_albedo.webp`,
          normal: `/assets/textures/${id}_normal.jpg`,
          orm: `/assets/textures/${id}_orm.jpg`,
          tileScale: DEFAULT_TILE_SCALE[id],
        },
        loader,
        anisotropy
      );
      i++;
    }
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

  #makeNoiseTexture(kind: string): THREE.DataTexture {
    const size = 256;
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

import * as THREE from 'three';
import type { LoadProgress, ResourceManager } from '@/types/assets.ts';
import { presetBudgets, type LodBudgets } from '@/engine/Lod.ts';

export interface ResourcesPreloadOptions {
  budgets?: Pick<LodBudgets, 'textureSize' | 'anisotropy'>;
}

/** Procedural / lightweight resources; CC0 packs augment via manifest when present. */
export class Resources implements ResourceManager {
  #textures = new Map<string, THREE.Texture>();
  #env: THREE.Texture | null = null;
  #renderer: THREE.WebGLRenderer;
  #anisotropy = 8;

  constructor(renderer: THREE.WebGLRenderer) {
    this.#renderer = renderer;
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

    const ids = ['snow', 'rock', 'ice', 'wood', 'metal'];
    let loaded = 0;
    for (const id of ids) {
      onProgress?.({ loaded, total: ids.length, current: id });
      this.#textures.set(id, this.#makeNoiseTexture(id, texSize));
      loaded++;
    }
    this.#env = this.#makeSkyEnv();
    onProgress?.({ loaded: ids.length, total: ids.length, current: 'done' });

    try {
      const res = await fetch('/assets/manifest.json');
      if (res.ok) {
        const manifest = (await res.json()) as {
          textures?: Record<string, string>;
          env?: string;
        };
        if (manifest.textures) {
          const loader = new THREE.TextureLoader();
          for (const [id, url] of Object.entries(manifest.textures)) {
            try {
              const tex = await loader.loadAsync(url);
              tex.colorSpace = THREE.SRGBColorSpace;
              tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
              tex.anisotropy = this.#anisotropy;
              this.#textures.set(id, tex);
            } catch {
              /* keep procedural */
            }
          }
        }
      }
    } catch {
      /* offline / no assets yet */
    }
  }

  #makeNoiseTexture(kind: string, size: number): THREE.DataTexture {
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
    tex.anisotropy = this.#anisotropy;
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

  getTexture(id: string): THREE.Texture | null {
    return this.#textures.get(id) ?? null;
  }

  getEnvMap(): THREE.Texture | null {
    return this.#env;
  }

  dispose(): void {
    for (const t of this.#textures.values()) t.dispose();
    this.#textures.clear();
    this.#env?.dispose();
    this.#env = null;
  }
}

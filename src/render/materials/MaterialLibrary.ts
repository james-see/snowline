import * as THREE from 'three';
import type { ResourceManager } from '@/types/assets.ts';
import type { SurfaceKind } from '@/types/gameplay.ts';
import {
  PBR_SET_IDS,
  SURFACE_TINTS,
  SNOW_VARIANT_TO_PBR,
  type PbrSetId,
  type PropMaterialId,
  type SnowVariantId,
} from '@/render/materials/ids.ts';
import {
  applyPbrMaps,
  cloneMaps,
  DEFAULT_TILE_SCALE,
  type PbrMaps,
} from '@/render/materials/pbrMaps.ts';

export interface TerrainApplyOptions {
  /** Corridor width in metres (UV.u span). */
  width: number;
  /** Course length in metres (UV.v span). */
  length: number;
}

interface SnowTuning {
  color: number;
  roughness: number;
  metalness: number;
  clearcoat: number;
  clearcoatRoughness: number;
  sheen: number;
  sheenColor: number;
  sheenRoughness: number;
  envMapIntensity: number;
  /** Multiplier on normal strength. */
  normalScale: number;
}

const SNOW_TUNING: Record<SnowVariantId, SnowTuning> = {
  powder: {
    color: 0xf4f8ff,
    roughness: 0.92,
    metalness: 0.0,
    clearcoat: 0.12,
    clearcoatRoughness: 0.55,
    sheen: 0.65,
    sheenColor: 0xd8ecff,
    sheenRoughness: 0.72,
    envMapIntensity: 0.55,
    normalScale: 0.85,
  },
  packed: {
    color: 0xe8f0f8,
    roughness: 0.72,
    metalness: 0.02,
    clearcoat: 0.28,
    clearcoatRoughness: 0.32,
    sheen: 0.4,
    sheenColor: 0xc8e4ff,
    sheenRoughness: 0.45,
    envMapIntensity: 0.7,
    normalScale: 1.0,
  },
  ice: {
    color: 0xd2e8f8,
    roughness: 0.22,
    metalness: 0.04,
    clearcoat: 0.85,
    clearcoatRoughness: 0.08,
    sheen: 0.2,
    sheenColor: 0xb8dcff,
    sheenRoughness: 0.25,
    envMapIntensity: 1.15,
    normalScale: 0.55,
  },
};

const SNOW_VARIANTS: readonly SnowVariantId[] = ['powder', 'packed', 'ice'];

/**
 * Cached PBR materials for terrain and props.
 *
 * Public API:
 * - `get(id)` — vendored CC0 set as MeshPhysicalMaterial
 * - `snow(variant)` — powder / packed / ice tuned physical snow
 * - `prop(id)` — rock / wood / metal / ice for Props
 * - `forSurface(kind)` — SurfaceKind → material
 * - `applyTerrain(mesh, opts)` — split terrain by vertex tint, assign snow mats
 */
export class MaterialLibrary {
  #resources: ResourceManager;
  #sets = new Map<PbrSetId, THREE.MeshPhysicalMaterial>();
  #snow = new Map<SnowVariantId, THREE.MeshPhysicalMaterial>();
  #props = new Map<PropMaterialId, THREE.MeshStandardMaterial>();
  #owned: THREE.Material[] = [];

  constructor(resources: ResourceManager) {
    this.#resources = resources;
  }

  /** Vendored set (`snow_powder`, `rock_face`, …). */
  get(id: PbrSetId): THREE.MeshPhysicalMaterial {
    let mat = this.#sets.get(id);
    if (mat) return mat;
    mat = this.#makeFromSet(id);
    this.#sets.set(id, mat);
    return mat;
  }

  /** Powder / packed groom / ice — distinct response, not plastic white. */
  snow(variant: SnowVariantId): THREE.MeshPhysicalMaterial {
    let mat = this.#snow.get(variant);
    if (mat) return mat;
    const setId = SNOW_VARIANT_TO_PBR[variant];
    const tuning = SNOW_TUNING[variant];
    const maps = this.#mapsFor(setId);
    mat = new THREE.MeshPhysicalMaterial({
      color: tuning.color,
      roughness: tuning.roughness,
      metalness: tuning.metalness,
      clearcoat: tuning.clearcoat,
      clearcoatRoughness: tuning.clearcoatRoughness,
      sheen: tuning.sheen,
      sheenColor: new THREE.Color(tuning.sheenColor),
      sheenRoughness: tuning.sheenRoughness,
      envMapIntensity: tuning.envMapIntensity,
      vertexColors: true,
      flatShading: false,
    });
    if (maps) {
      const local = cloneMaps(maps);
      applyPbrMaps(mat, local);
      mat.normalScale.set(tuning.normalScale, tuning.normalScale);
      // Ice frost overlay for race ice micro-sparkle variation.
      if (variant === 'ice') {
        const frost = this.#mapsFor('ice_frost');
        if (frost) {
          mat.roughness = 0.28;
          mat.clearcoatRoughness = 0.12;
        }
      }
    } else {
      this.#fallbackAlbedo(mat, variant === 'ice' ? 'ice' : 'snow');
    }
    mat.name = `snow-${variant}`;
    this.#snow.set(variant, mat);
    this.#owned.push(mat);
    return mat;
  }

  /** Shared materials for props — import via `@/render/materials`. */
  prop(id: PropMaterialId): THREE.MeshStandardMaterial {
    let mat = this.#props.get(id);
    if (mat) return mat;

    if (id === 'rock' || id === 'rockScree') {
      const setId: PbrSetId = id === 'rock' ? 'rock_face' : 'rock_scree';
      const maps = this.#mapsFor(setId);
      mat = new THREE.MeshStandardMaterial({
        color: id === 'rock' ? 0x8a8680 : 0x7a7670,
        roughness: 0.92,
        metalness: 0.04,
        envMapIntensity: 0.55,
      });
      if (maps) {
        const local = cloneMaps(maps);
        applyPbrMaps(mat, local, { repeatU: 2.5, repeatV: 2.5 });
      } else {
        this.#fallbackAlbedo(mat, 'rock');
      }
      mat.name = `prop-${id}`;
    } else if (id === 'ice') {
      const ice = this.snow('ice');
      this.#props.set(id, ice);
      return ice;
    } else if (id === 'wood') {
      mat = new THREE.MeshStandardMaterial({
        color: 0x6b4a2e,
        roughness: 0.88,
        metalness: 0.0,
        envMapIntensity: 0.4,
      });
      this.#fallbackAlbedo(mat, 'wood');
      mat.name = 'prop-wood';
    } else {
      mat = new THREE.MeshStandardMaterial({
        color: 0xb8c4d0,
        roughness: 0.28,
        metalness: 0.82,
        envMapIntensity: 1.0,
      });
      this.#fallbackAlbedo(mat, 'metal');
      mat.name = 'prop-metal';
    }

    this.#props.set(id, mat);
    this.#owned.push(mat);
    return mat;
  }

  forSurface(kind: SurfaceKind): THREE.Material {
    if (kind === 'powder' || kind === 'packed' || kind === 'ice') return this.snow(kind);
    if (kind === 'rock') return this.prop('rock');
    if (kind === 'wood') return this.prop('wood');
    if (kind === 'rail') return this.prop('metal');
    return this.snow('packed');
  }

  /**
   * Replace a terrain mesh material with powder / packed / ice groups classified
   * from authored vertex colours (no TerrainGenerator changes required).
   */
  applyTerrain(mesh: THREE.Mesh, opts: TerrainApplyOptions): void {
    const geo = mesh.geometry;
    const colorAttr = geo.getAttribute('color');
    const index = geo.getIndex();
    if (!colorAttr || !index) {
      mesh.material = this.snow('packed');
      mesh.receiveShadow = true;
      return;
    }

    const width = Math.max(1, opts.width);
    const length = Math.max(1, opts.length);

    const mats = SNOW_VARIANTS.map((v) => {
      const mat = this.snow(v).clone() as THREE.MeshPhysicalMaterial;
      mat.vertexColors = true;
      const setId = SNOW_VARIANT_TO_PBR[v];
      const maps = this.#mapsFor(setId);
      if (maps) {
        const local = cloneMaps(maps);
        const tile = maps.tileScale || DEFAULT_TILE_SCALE[setId];
        applyPbrMaps(mat, local, {
          repeatU: width / tile,
          repeatV: length / tile,
        });
        mat.normalScale.set(SNOW_TUNING[v].normalScale, SNOW_TUNING[v].normalScale);
      }
      mat.name = `terrain-${v}`;
      this.#owned.push(mat);
      return mat;
    });

    // Ensure AO has uv2.
    if (!geo.getAttribute('uv2')) {
      const uv = geo.getAttribute('uv');
      if (uv) geo.setAttribute('uv2', uv.clone());
    }

    const triCount = index.count / 3;
    const buckets: number[][] = [[], [], []];
    for (let t = 0; t < triCount; t++) {
      const i0 = index.getX(t * 3);
      const i1 = index.getX(t * 3 + 1);
      const i2 = index.getX(t * 3 + 2);
      const c0 = classifyTint(colorAttr.getX(i0), colorAttr.getY(i0), colorAttr.getZ(i0));
      const c1 = classifyTint(colorAttr.getX(i1), colorAttr.getY(i1), colorAttr.getZ(i1));
      const c2 = classifyTint(colorAttr.getX(i2), colorAttr.getY(i2), colorAttr.getZ(i2));
      const vote = [0, 0, 0];
      vote[c0]++;
      vote[c1]++;
      vote[c2]++;
      let winnerIdx = 1; // packed on ties
      let best = -1;
      for (let k = 0; k < 3; k++) {
        if (vote[k]! > best) {
          best = vote[k]!;
          winnerIdx = k;
        }
      }
      buckets[winnerIdx]!.push(i0, i1, i2);
    }

    // Rebuild index with groups (powder, packed, ice).
    const merged: number[] = [];
    geo.clearGroups();
    for (let g = 0; g < 3; g++) {
      const start = merged.length;
      merged.push(...buckets[g]!);
      const count = buckets[g]!.length;
      if (count > 0) geo.addGroup(start, count, g);
    }
    geo.setIndex(merged);

    const old = mesh.material;
    if (Array.isArray(old)) old.forEach((m) => m.dispose());
    else (old as THREE.Material | undefined)?.dispose();

    mesh.material = mats;
    mesh.receiveShadow = true;
  }

  dispose(): void {
    for (const m of this.#owned) m.dispose();
    this.#owned.length = 0;
    this.#sets.clear();
    this.#snow.clear();
    this.#props.clear();
  }

  #mapsFor(id: PbrSetId): PbrMaps | null {
    return this.#resources.getPbrMaps(id);
  }

  #makeFromSet(id: PbrSetId): THREE.MeshPhysicalMaterial {
    const maps = this.#mapsFor(id);
    const isSnow = id.startsWith('snow_');
    const isIce = id.startsWith('ice_');
    const mat = new THREE.MeshPhysicalMaterial({
      color: 0xffffff,
      roughness: isIce ? 0.25 : isSnow ? 0.8 : 0.9,
      metalness: isIce ? 0.05 : 0.02,
      clearcoat: isIce ? 0.8 : isSnow ? 0.25 : 0,
      clearcoatRoughness: isIce ? 0.1 : 0.4,
      sheen: isSnow ? 0.45 : 0,
      sheenColor: new THREE.Color(0xc8e8ff),
      sheenRoughness: 0.5,
      envMapIntensity: isIce ? 1.1 : 0.65,
    });
    if (maps) {
      const local = cloneMaps(maps);
      applyPbrMaps(mat, local);
    } else {
      this.#fallbackAlbedo(mat, isIce ? 'ice' : isSnow ? 'snow' : 'rock');
    }
    mat.name = id;
    this.#owned.push(mat);
    return mat;
  }

  #fallbackAlbedo(mat: THREE.MeshStandardMaterial, kind: string): void {
    const tex = this.#resources.getTexture(kind);
    if (tex) {
      mat.map = tex;
      mat.needsUpdate = true;
    }
  }
}

export function createMaterialLibrary(resources: ResourceManager): MaterialLibrary {
  return new MaterialLibrary(resources);
}

function classifyTint(r: number, g: number, b: number): 0 | 1 | 2 {
  let best = 0;
  let bestD = Infinity;
  for (let i = 0; i < SNOW_VARIANTS.length; i++) {
    const tint = SURFACE_TINTS[SNOW_VARIANTS[i]!];
    const dr = r - tint[0];
    const dg = g - tint[1];
    const db = b - tint[2];
    const d = dr * dr + dg * dg + db * db;
    if (d < bestD) {
      bestD = d;
      best = i;
    }
  }
  return best as 0 | 1 | 2;
}

/** Convenience: every PBR set id for preload / debug. */
export function listPbrSetIds(): readonly PbrSetId[] {
  return PBR_SET_IDS;
}

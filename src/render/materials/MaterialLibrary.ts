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
  type TerrainVariantId,
} from '@/render/materials/ids.ts';
import {
  applyPbrMaps,
  cloneMaps,
  DEFAULT_TILE_SCALE,
  type PbrMaps,
} from '@/render/materials/pbrMaps.ts';
import { makeProceduralPbr, speckledAlbedo } from '@/render/materials/proceduralMaps.ts';

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
  normalScale: number;
  /** Dirt/rock speckles composited onto albedo. */
  speckle: number;
}

/**
 * Tuned darker than pure white so the rider/board silhouette stays readable,
 * with clear powder / packed / ice separation under directional sun.
 */
const SNOW_TUNING: Record<SnowVariantId, SnowTuning> = {
  powder: {
    color: 0xdde6f0,
    roughness: 0.9,
    metalness: 0.0,
    clearcoat: 0.16,
    clearcoatRoughness: 0.5,
    sheen: 0.55,
    sheenColor: 0xc4dcf0,
    sheenRoughness: 0.7,
    envMapIntensity: 0.5,
    normalScale: 1.15,
    speckle: 0.1,
  },
  packed: {
    color: 0xc8d4e2,
    roughness: 0.62,
    metalness: 0.02,
    clearcoat: 0.35,
    clearcoatRoughness: 0.28,
    sheen: 0.32,
    sheenColor: 0xb0d0e8,
    sheenRoughness: 0.42,
    envMapIntensity: 0.75,
    normalScale: 1.35,
    speckle: 0.14,
  },
  ice: {
    color: 0xa8c8e0,
    roughness: 0.14,
    metalness: 0.06,
    clearcoat: 0.92,
    clearcoatRoughness: 0.06,
    sheen: 0.18,
    sheenColor: 0x9cc8e8,
    sheenRoughness: 0.2,
    envMapIntensity: 1.35,
    normalScale: 0.75,
    speckle: 0.05,
  },
};

const TERRAIN_VARIANTS: readonly TerrainVariantId[] = ['powder', 'packed', 'ice', 'rock'];
const SNOW_VARIANTS: readonly SnowVariantId[] = ['powder', 'packed', 'ice'];

/**
 * Cached PBR materials for terrain and props.
 *
 * Public API:
 * - `get(id)` — vendored CC0 set as MeshPhysicalMaterial
 * - `snow(variant)` — powder / packed / ice tuned physical snow
 * - `prop(id)` — rock / wood / metal / ice for Props
 * - `forSurface(kind)` — SurfaceKind → material
 * - `applyTerrain(mesh, opts)` — split terrain by vertex tint, assign mats
 */
export class MaterialLibrary {
  #resources: ResourceManager;
  #sets = new Map<PbrSetId, THREE.MeshPhysicalMaterial>();
  #snow = new Map<SnowVariantId, THREE.MeshPhysicalMaterial>();
  #props = new Map<PropMaterialId, THREE.MeshStandardMaterial>();
  #procedural = new Map<PbrSetId, PbrMaps>();
  #owned: THREE.Material[] = [];
  #ownedTextures: THREE.Texture[] = [];

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
    const cached = this.#snow.get(variant);
    // Rebuild if we cached before maps were bound (preload race).
    if (cached?.map) return cached;
    if (cached) {
      const idx = this.#owned.indexOf(cached);
      if (idx >= 0) this.#owned.splice(idx, 1);
      cached.dispose();
      this.#snow.delete(variant);
    }

    const setId = SNOW_VARIANT_TO_PBR[variant];
    const tuning = SNOW_TUNING[variant];
    const maps = this.#mapsFor(setId);
    const mat = new THREE.MeshPhysicalMaterial({
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
    this.#bindSnowMaps(mat, maps, setId, tuning);
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
        color: id === 'rock' ? 0x7a7670 : 0x6a6660,
        roughness: 0.94,
        metalness: 0.04,
        envMapIntensity: 0.5,
      });
      if (maps) {
        const local = cloneMaps(maps);
        applyPbrMaps(mat, local, { repeatU: 2.5, repeatV: 2.5 });
        mat.normalScale.set(1.6, 1.6);
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
   * Replace a terrain mesh material with powder / packed / ice / rock groups
   * classified from authored vertex colours (no TerrainGenerator changes).
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

    const mats: THREE.Material[] = TERRAIN_VARIANTS.map((v) => {
      if (v === 'rock') {
        const rock = this.prop('rock').clone() as THREE.MeshStandardMaterial;
        rock.vertexColors = true;
        const maps = this.#mapsFor('rock_face');
        if (maps) {
          const local = cloneMaps(maps);
          applyPbrMaps(rock, local, {
            repeatU: width / (maps.tileScale || DEFAULT_TILE_SCALE.rock_face),
            repeatV: length / (maps.tileScale || DEFAULT_TILE_SCALE.rock_face),
          });
          rock.normalScale.set(1.8, 1.8);
        }
        rock.color.setHex(0x6e6a64);
        rock.name = 'terrain-rock';
        this.#owned.push(rock);
        return rock;
      }

      const tuning = SNOW_TUNING[v];
      const mat = this.snow(v).clone() as THREE.MeshPhysicalMaterial;
      mat.vertexColors = true;
      const setId = SNOW_VARIANT_TO_PBR[v];
      const maps = this.#mapsFor(setId);
      this.#bindSnowMaps(mat, maps, setId, tuning, {
        repeatU: width / (maps.tileScale || DEFAULT_TILE_SCALE[setId]),
        repeatV: length / (maps.tileScale || DEFAULT_TILE_SCALE[setId]),
      });
      mat.name = `terrain-${v}`;
      this.#owned.push(mat);
      return mat;
    });

    if (!geo.getAttribute('uv2')) {
      const uv = geo.getAttribute('uv');
      if (uv) geo.setAttribute('uv2', uv.clone());
    }

    const triCount = index.count / 3;
    const buckets: number[][] = [[], [], [], []];
    for (let t = 0; t < triCount; t++) {
      const i0 = index.getX(t * 3);
      const i1 = index.getX(t * 3 + 1);
      const i2 = index.getX(t * 3 + 2);
      const c0 = classifyTint(colorAttr.getX(i0), colorAttr.getY(i0), colorAttr.getZ(i0));
      const c1 = classifyTint(colorAttr.getX(i1), colorAttr.getY(i1), colorAttr.getZ(i1));
      const c2 = classifyTint(colorAttr.getX(i2), colorAttr.getY(i2), colorAttr.getZ(i2));
      const vote = [0, 0, 0, 0];
      vote[c0]++;
      vote[c1]++;
      vote[c2]++;
      let winnerIdx = 1; // packed on ties
      let best = -1;
      for (let k = 0; k < 4; k++) {
        if (vote[k]! > best) {
          best = vote[k]!;
          winnerIdx = k;
        }
      }
      buckets[winnerIdx]!.push(i0, i1, i2);
    }

    const merged: number[] = [];
    geo.clearGroups();
    for (let g = 0; g < 4; g++) {
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
    mesh.castShadow = false;
  }

  dispose(): void {
    for (const m of this.#owned) m.dispose();
    this.#owned.length = 0;
    for (const t of this.#ownedTextures) t.dispose();
    this.#ownedTextures.length = 0;
    for (const maps of this.#procedural.values()) {
      maps.albedo.dispose();
      maps.normal.dispose();
      maps.orm.dispose();
    }
    this.#procedural.clear();
    this.#sets.clear();
    this.#snow.clear();
    this.#props.clear();
  }

  /** CC0 maps when loaded; otherwise high-contrast procedural PBR. */
  #mapsFor(id: PbrSetId): PbrMaps {
    const fromRes = this.#resources.getPbrMaps(id);
    if (fromRes) return fromRes;
    let proc = this.#procedural.get(id);
    if (!proc) {
      proc = makeProceduralPbr(id);
      this.#procedural.set(id, proc);
    }
    return proc;
  }

  #bindSnowMaps(
    mat: THREE.MeshPhysicalMaterial,
    maps: PbrMaps,
    setId: PbrSetId,
    tuning: SnowTuning,
    repeat?: { repeatU: number; repeatV: number }
  ): void {
    const local = cloneMaps(maps);
    // Speckle CC0 (image) albedos; procedural DataTextures already carry dirt/ice grain.
    const srcImg = local.albedo.image as { width?: number } | undefined;
    if (typeof document !== 'undefined' && srcImg && (srcImg.width ?? 0) > 0) {
      try {
        const speckled = speckledAlbedo(local.albedo, {
          amount: tuning.speckle,
          seed: setId.length * 97 + Math.floor(tuning.speckle * 100),
        });
        this.#ownedTextures.push(speckled);
        local.albedo = speckled;
      } catch {
        /* headless / no canvas — keep source albedo */
      }
    }
    applyPbrMaps(mat, local, repeat);
    mat.normalScale.set(tuning.normalScale, tuning.normalScale);
    mat.aoMapIntensity = 0.95;
    mat.color.setHex(tuning.color);
    mat.roughness = tuning.roughness;
    mat.metalness = tuning.metalness;
    mat.clearcoat = tuning.clearcoat;
    mat.clearcoatRoughness = tuning.clearcoatRoughness;
    mat.envMapIntensity = tuning.envMapIntensity;

    if (setId === 'ice_glass' || setId === 'ice_frost') {
      // Wet ice gloss — keep clearcoat dominant even if ORM pulls roughness up.
      mat.roughness = Math.min(mat.roughness, 0.22);
      mat.clearcoat = Math.max(mat.clearcoat, 0.85);
      mat.clearcoatRoughness = Math.min(mat.clearcoatRoughness, 0.1);
    }
  }

  #makeFromSet(id: PbrSetId): THREE.MeshPhysicalMaterial {
    const maps = this.#mapsFor(id);
    const isSnow = id.startsWith('snow_');
    const isIce = id.startsWith('ice_');
    const mat = new THREE.MeshPhysicalMaterial({
      color: isIce ? 0xb0d0e8 : isSnow ? 0xd0dce8 : 0x7a7670,
      roughness: isIce ? 0.2 : isSnow ? 0.78 : 0.92,
      metalness: isIce ? 0.05 : 0.02,
      clearcoat: isIce ? 0.85 : isSnow ? 0.28 : 0,
      clearcoatRoughness: isIce ? 0.08 : 0.4,
      sheen: isSnow ? 0.4 : 0,
      sheenColor: new THREE.Color(0xb8d8f0),
      sheenRoughness: 0.5,
      envMapIntensity: isIce ? 1.2 : 0.6,
    });
    const local = cloneMaps(maps);
    applyPbrMaps(mat, local);
    mat.normalScale.set(isSnow ? 1.2 : isIce ? 0.8 : 1.7, isSnow ? 1.2 : isIce ? 0.8 : 1.7);
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

function classifyTint(r: number, g: number, b: number): 0 | 1 | 2 | 3 {
  // Dark / low-chroma verts → rock (dirt patches, cliff paint).
  const luma = 0.2126 * r + 0.7152 * g + 0.0722 * b;
  if (luma < 0.58) {
    const rock = SURFACE_TINTS.rock;
    const dr = r - rock[0];
    const dg = g - rock[1];
    const db = b - rock[2];
    if (dr * dr + dg * dg + db * db < 0.12) return 3;
  }

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

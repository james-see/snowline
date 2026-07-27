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
import {
  bakeCorduroyGroom,
  isDrawableImageSource,
  makeProceduralPbr,
  speckledAlbedo,
} from '@/render/materials/proceduralMaps.ts';

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
  /** Warm sun-facing / cool shade albedo response strength. */
  sunResponse: number;
}

/** Matches RenderModule SUN_DIR — world-space, constant elevation. */
const ALPINE_SUN_DIR = { x: 0.82, y: 0.34, z: 0.46 };

/**
 * Intentionally mid alpine — not plastic white. Powder cool/soft,
 * packed warmer corduroy with readable specular, ice darker cyan.
 * Colors stay below ~0.75 luma so rider gear reads even under bright fill.
 */
const SNOW_TUNING: Record<SnowVariantId, SnowTuning> = {
  powder: {
    color: 0xb0c0d2,
    roughness: 0.94,
    metalness: 0.0,
    clearcoat: 0.06,
    clearcoatRoughness: 0.72,
    sheen: 0.78,
    sheenColor: 0xa8c4de,
    sheenRoughness: 0.84,
    envMapIntensity: 0.36,
    normalScale: 1.45,
    speckle: 0.14,
    sunResponse: 0.55,
  },
  packed: {
    color: 0xb2a898,
    roughness: 0.48,
    metalness: 0.03,
    clearcoat: 0.55,
    clearcoatRoughness: 0.14,
    sheen: 0.28,
    sheenColor: 0xd4c2a0,
    sheenRoughness: 0.34,
    envMapIntensity: 1.05,
    normalScale: 2.35,
    speckle: 0.08,
    sunResponse: 0.85,
  },
  ice: {
    color: 0x6a92ae,
    roughness: 0.1,
    metalness: 0.08,
    clearcoat: 1.0,
    clearcoatRoughness: 0.04,
    sheen: 0.1,
    sheenColor: 0x7ab0d0,
    sheenRoughness: 0.16,
    envMapIntensity: 1.55,
    normalScale: 1.05,
    speckle: 0.08,
    sunResponse: 0.35,
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
      // Terrain is already split by tint in applyTerrain; vertex multiply
      // against near-white authored colours washed albedo into plastic fill.
      vertexColors: false,
      flatShading: false,
    });
    this.#bindSnowMaps(mat, maps, setId, tuning);
    this.#attachSnowSunResponse(mat, tuning.sunResponse, variant);
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
        color: 0x8a6240,
        roughness: 0.9,
        metalness: 0.0,
        envMapIntensity: 0.4,
      });
      this.#bindPropSet(mat, 'wood_bark', { repeatU: 1.5, repeatV: 2.5 }, 'wood');
      mat.name = 'prop-wood';
    } else if (id === 'plank') {
      mat = new THREE.MeshStandardMaterial({
        color: 0x9a6a3c,
        roughness: 0.86,
        metalness: 0.0,
        envMapIntensity: 0.45,
      });
      this.#bindPropSet(mat, 'wood_plank', { repeatU: 2, repeatV: 2 }, 'wood');
      mat.name = 'prop-plank';
    } else if (id === 'fabric') {
      mat = new THREE.MeshStandardMaterial({
        color: 0xd8c8a8,
        roughness: 0.92,
        metalness: 0.0,
        envMapIntensity: 0.35,
        side: THREE.DoubleSide,
      });
      this.#bindPropSet(mat, 'fabric_banner', { repeatU: 2, repeatV: 1.2 }, 'wood');
      mat.name = 'prop-fabric';
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
      mat.vertexColors = false;
      const setId = SNOW_VARIANT_TO_PBR[v];
      const maps = this.#mapsFor(setId);
      // Tighter repeats → micro-detail + corduroy readable at chase distance.
      const tileMul = v === 'packed' ? 0.55 : 0.72;
      const tile = (maps.tileScale || DEFAULT_TILE_SCALE[setId]) * tileMul;
      this.#bindSnowMaps(mat, maps, setId, tuning, {
        repeatU: width / tile,
        repeatV: length / tile,
      });
      this.#attachSnowSunResponse(mat, tuning.sunResponse, v);
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
      const bucket = buckets[g]!;
      // Avoid `push(...bucket)` — apron meshes have huge tri counts and blow the stack.
      for (let i = 0; i < bucket.length; i++) merged.push(bucket[i]!);
      const count = bucket.length;
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
    let local = cloneMaps(maps);

    if (setId === 'snow_groom' && typeof document !== 'undefined') {
      // CC0 groom lacks corduroy — bake chase-scale grooves into albedo/normal/ORM.
      try {
        const baked = bakeCorduroyGroom(local, {
          strength: 1.25,
          seed: 77 + Math.floor(tuning.normalScale * 10),
        });
        if (baked) {
          this.#ownedTextures.push(baked.albedo, baked.normal, baked.orm);
          local = baked;
        }
      } catch {
        /* headless / decode failure — keep source maps */
      }
    } else if (
      typeof document !== 'undefined' &&
      isDrawableImageSource(local.albedo.image) &&
      tuning.speckle > 0
    ) {
      // Speckle CC0 image albedos only — never wipe procedural DataTextures.
      try {
        const speckled = speckledAlbedo(local.albedo, {
          amount: tuning.speckle,
          seed: setId.length * 97 + Math.floor(tuning.speckle * 100),
          warmCool: setId === 'snow_powder' ? 1.15 : 0.85,
        });
        this.#ownedTextures.push(speckled);
        local.albedo = speckled;
      } catch {
        /* headless / no canvas — keep source albedo */
      }
    }

    applyPbrMaps(mat, local, repeat);
    mat.normalScale.set(tuning.normalScale, tuning.normalScale);
    // Strong AO so micro-valleys / corduroy troughs read, not flat fill.
    mat.aoMapIntensity = setId === 'snow_groom' ? 1.45 : 1.25;
    mat.color.setHex(tuning.color);
    mat.roughness = tuning.roughness;
    mat.metalness = tuning.metalness;
    mat.clearcoat = tuning.clearcoat;
    mat.clearcoatRoughness = tuning.clearcoatRoughness;
    mat.envMapIntensity = tuning.envMapIntensity;
    mat.sheen = tuning.sheen;
    mat.sheenColor.setHex(tuning.sheenColor);
    mat.sheenRoughness = tuning.sheenRoughness;

    if (setId === 'ice_glass' || setId === 'ice_frost') {
      // Wet ice gloss — keep clearcoat dominant even if ORM pulls roughness up.
      mat.roughness = Math.min(mat.roughness, 0.16);
      mat.clearcoat = Math.max(mat.clearcoat, 0.95);
      mat.clearcoatRoughness = Math.min(mat.clearcoatRoughness, 0.05);
    } else if (setId === 'snow_groom') {
      // Packed: preserve specular response for sun glints on corduroy.
      mat.roughness = Math.min(mat.roughness, 0.52);
      mat.clearcoat = Math.max(mat.clearcoat, 0.5);
    } else if (setId === 'snow_powder') {
      // Powder stays soft — kill accidental hard specular from ORM lows.
      mat.roughness = Math.max(mat.roughness, 0.88);
      mat.clearcoat = Math.min(mat.clearcoat, 0.1);
    }
  }

  /**
   * Warm sun-facing / cool shade tint in world space (matches RenderModule sun).
   * Keeps snow from reading as flat grey under directional key light.
   */
  #attachSnowSunResponse(
    mat: THREE.MeshPhysicalMaterial,
    amount: number,
    variant: SnowVariantId
  ): void {
    if (amount <= 0) return;
    const key = `snow-sun-${variant}-${amount.toFixed(2)}`;
    mat.customProgramCacheKey = () => key;
    mat.onBeforeCompile = (shader) => {
      shader.uniforms.snowSunAmount = { value: amount };
      shader.uniforms.snowSunDir = {
        value: new THREE.Vector3(ALPINE_SUN_DIR.x, ALPINE_SUN_DIR.y, ALPINE_SUN_DIR.z),
      };
      shader.fragmentShader = shader.fragmentShader
        .replace(
          '#include <common>',
          /* glsl */ `#include <common>
uniform float snowSunAmount;
uniform vec3 snowSunDir;`
        )
        .replace(
          '#include <normal_fragment_maps>',
          /* glsl */ `#include <normal_fragment_maps>
{
  vec3 worldN = inverseTransformDirection( normal, viewMatrix );
  float sunFacing = clamp( dot( normalize( worldN ), normalize( snowSunDir ) ), 0.0, 1.0 );
  vec3 warmTint = vec3( 1.12, 1.04, 0.90 );
  vec3 coolTint = vec3( 0.88, 0.94, 1.10 );
  diffuseColor.rgb *= mix( coolTint, warmTint, sunFacing * sunFacing * snowSunAmount );
}`
        );
    };
    mat.needsUpdate = true;
  }

  #makeFromSet(id: PbrSetId): THREE.MeshPhysicalMaterial {
    const maps = this.#mapsFor(id);
    const isSnow = id.startsWith('snow_');
    const isIce = id.startsWith('ice_');
    const mat = new THREE.MeshPhysicalMaterial({
      color: isIce ? 0x6a92ae : isSnow ? 0xa0b4c6 : 0x7a7670,
      roughness: isIce ? 0.14 : isSnow ? 0.86 : 0.92,
      metalness: isIce ? 0.06 : 0.02,
      clearcoat: isIce ? 0.95 : isSnow ? 0.22 : 0,
      clearcoatRoughness: isIce ? 0.05 : 0.45,
      sheen: isSnow ? 0.55 : 0,
      sheenColor: new THREE.Color(0x9eb8d0),
      sheenRoughness: 0.65,
      envMapIntensity: isIce ? 1.4 : 0.55,
    });
    const local = cloneMaps(maps);
    applyPbrMaps(mat, local);
    mat.aoMapIntensity = isSnow || isIce ? 1.2 : 0.85;
    mat.normalScale.set(isSnow ? 1.7 : isIce ? 1.05 : 1.7, isSnow ? 1.7 : isIce ? 1.05 : 1.7);
    mat.name = id;
    this.#owned.push(mat);
    return mat;
  }

  #bindPropSet(
    mat: THREE.MeshStandardMaterial,
    setId: PbrSetId,
    repeat: { repeatU: number; repeatV: number },
    fallbackKind: string
  ): void {
    const maps = this.#mapsFor(setId);
    if (maps) {
      const local = cloneMaps(maps);
      applyPbrMaps(mat, local, repeat);
      mat.normalScale.set(1.4, 1.4);
      mat.aoMapIntensity = 1.05;
    } else {
      this.#fallbackAlbedo(mat, fallbackKind);
    }
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

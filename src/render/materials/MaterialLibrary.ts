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
const ALPINE_SUN_DIR = { x: 0.86, y: 0.24, z: 0.45 };

/**
 * Intentionally mid alpine — not plastic white. Powder cool/soft,
 * packed warmer corduroy with readable specular, ice darker cyan.
 * Colors stay below ~0.75 luma so rider gear reads even under bright fill.
 */
const SNOW_TUNING: Record<SnowVariantId, SnowTuning> = {
  powder: {
    // Cool alpine powder — reads as volume under directional sun, not grey fill.
    color: 0xc2d0de,
    roughness: 0.92,
    metalness: 0.0,
    clearcoat: 0.08,
    clearcoatRoughness: 0.68,
    sheen: 0.82,
    sheenColor: 0xb4cce2,
    sheenRoughness: 0.8,
    envMapIntensity: 0.42,
    normalScale: 1.35,
    speckle: 0.1,
    sunResponse: 0.72,
  },
  packed: {
    // Cooler packed groom — less muddy brown; corduroy + sun form for hills/kickers.
    color: 0xc8c6c0,
    roughness: 0.44,
    metalness: 0.03,
    clearcoat: 0.58,
    clearcoatRoughness: 0.12,
    sheen: 0.32,
    sheenColor: 0xd8d0c4,
    sheenRoughness: 0.32,
    envMapIntensity: 1.15,
    /** Stronger corduroy normals so hill volume / jump faces read under key light. */
    normalScale: 1.85,
    speckle: 0.06,
    sunResponse: 0.95,
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
    } else if (id === 'foliage') {
      mat = new THREE.MeshStandardMaterial({
        color: 0x245c34,
        roughness: 0.95,
        metalness: 0.0,
        envMapIntensity: 0.35,
        side: THREE.DoubleSide,
      });
      // Dense UV repeat — Kenney leaf UVs are sparse; keep LOD cheap (soft normals).
      this.#bindPropSet(mat, 'foliage_pine', { repeatU: 4.5, repeatV: 4.5 }, 'wood');
      mat.normalScale.set(0.45, 0.45);
      mat.aoMapIntensity = 0.85;
      mat.name = 'prop-foliage';
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
   * classified from authored vertex colours.
   *
   * Powder + packed share one material driven by `pathBlend` (+ seam noise) so
   * the race-strip edge is a shader fade, not a hard triangle-material stairstep.
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

    // Shared groom/powder field — corduroy fades via pathBlend, not a second draw group.
    const seamSnow = this.snow('packed').clone() as THREE.MeshPhysicalMaterial;
    seamSnow.vertexColors = false;
    {
      const setId = SNOW_VARIANT_TO_PBR.packed;
      const maps = this.#mapsFor(setId);
      const tuning = SNOW_TUNING.packed;
      const tile = (maps.tileScale || DEFAULT_TILE_SCALE[setId]) * 1.15;
      this.#bindSnowMaps(seamSnow, maps, setId, tuning, {
        repeatU: width / tile,
        repeatV: length / tile,
      });
      this.#attachSnowSunResponse(seamSnow, tuning.sunResponse, 'packed', {
        pathSeam: true,
        powderColor: SNOW_TUNING.powder.color,
        powderRoughness: SNOW_TUNING.powder.roughness,
      });
      seamSnow.name = 'terrain-snow-seam';
      this.#owned.push(seamSnow);
    }

    const iceMat = this.snow('ice').clone() as THREE.MeshPhysicalMaterial;
    iceMat.vertexColors = false;
    {
      const setId = SNOW_VARIANT_TO_PBR.ice;
      const maps = this.#mapsFor(setId);
      const tuning = SNOW_TUNING.ice;
      const tile = (maps.tileScale || DEFAULT_TILE_SCALE[setId]) * 1.15;
      this.#bindSnowMaps(iceMat, maps, setId, tuning, {
        repeatU: width / tile,
        repeatV: length / tile,
      });
      this.#attachSnowSunResponse(iceMat, tuning.sunResponse, 'ice');
      iceMat.name = 'terrain-ice';
      this.#owned.push(iceMat);
    }

    const rock = this.prop('rock').clone() as THREE.MeshStandardMaterial;
    rock.vertexColors = true;
    {
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
    }

    // Index order: powder, packed, ice, rock — powder+packed share seamSnow.
    const mats: THREE.Material[] = [seamSnow, seamSnow, iceMat, rock];

    if (!geo.getAttribute('uv2')) {
      const uv = geo.getAttribute('uv');
      if (uv) geo.setAttribute('uv2', uv.clone());
    }
    ensurePathBlendAttribute(geo, colorAttr);

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
      // Soft mid-tones from pathBlend paint can flip powder↔packed per tri —
      // both share seamSnow so the visual seam stays continuous.
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
      // CC0 groom lacks corduroy — bake soft chase-scale grooves (low contrast, multi-freq).
      try {
        const baked = bakeCorduroyGroom(local, {
          strength: 0.95,
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
    // Stronger AO in groom troughs so corduroy + jump faces get directional form.
    mat.aoMapIntensity = setId === 'snow_groom' ? 1.22 : setId === 'snow_powder' ? 1.05 : 1.0;
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
   * Also fades mapped microdetail with distance so tiled snow doesn't wallpaper midfield.
   * Optional pathSeam: blend groom↔powder via pathBlend + world-space seam noise.
   */
  #attachSnowSunResponse(
    mat: THREE.MeshPhysicalMaterial,
    amount: number,
    variant: SnowVariantId,
    seam?: { pathSeam: boolean; powderColor: number; powderRoughness: number }
  ): void {
    if (amount <= 0 && !seam?.pathSeam) return;
    const pathSeam = seam?.pathSeam === true;
    const powder = new THREE.Color(seam?.powderColor ?? SNOW_TUNING.powder.color);
    const powderRough = seam?.powderRoughness ?? SNOW_TUNING.powder.roughness;
    const key = `snow-sun-fade-${variant}-${amount.toFixed(2)}${pathSeam ? '-seam' : ''}`;
    mat.customProgramCacheKey = () => key;
    mat.onBeforeCompile = (shader) => {
      shader.uniforms.snowSunAmount = { value: amount };
      shader.uniforms.snowSunDir = {
        value: new THREE.Vector3(ALPINE_SUN_DIR.x, ALPINE_SUN_DIR.y, ALPINE_SUN_DIR.z),
      };
      if (pathSeam) {
        shader.uniforms.snowPowderColor = { value: powder };
        shader.uniforms.snowPowderRough = { value: powderRough };
        shader.vertexShader = shader.vertexShader
          .replace(
            '#include <common>',
            /* glsl */ `#include <common>
attribute float pathBlend;
varying float vPathBlend;
varying vec3 vSnowWorldPos;`
          )
          .replace(
            '#include <begin_vertex>',
            /* glsl */ `#include <begin_vertex>
vPathBlend = pathBlend;
vSnowWorldPos = ( modelMatrix * vec4( transformed, 1.0 ) ).xyz;`
          );
      }

      const commonInject = pathSeam
        ? /* glsl */ `#include <common>
uniform float snowSunAmount;
uniform vec3 snowSunDir;
uniform vec3 snowPowderColor;
uniform float snowPowderRough;
varying float vPathBlend;
varying vec3 vSnowWorldPos;
float snowSeamHash( vec2 p ) {
  return fract( sin( dot( p, vec2( 127.1, 311.7 ) ) ) * 43758.5453 );
}
float snowSeamNoise( vec2 p ) {
  vec2 i = floor( p );
  vec2 f = fract( p );
  f = f * f * ( 3.0 - 2.0 * f );
  float a = snowSeamHash( i );
  float b = snowSeamHash( i + vec2( 1.0, 0.0 ) );
  float c = snowSeamHash( i + vec2( 0.0, 1.0 ) );
  float d = snowSeamHash( i + vec2( 1.0, 1.0 ) );
  return mix( mix( a, b, f.x ), mix( c, d, f.x ), f.y );
}`
        : /* glsl */ `#include <common>
uniform float snowSunAmount;
uniform vec3 snowSunDir;`;

      const seamBody = pathSeam
        ? /* glsl */ `
  // Soft path↔powder: pathBlend + macro/micro seam noise kills triangle stairsteps.
  float seamN =
    snowSeamNoise( vSnowWorldPos.xz * 0.045 ) * 0.55 +
    snowSeamNoise( vSnowWorldPos.xz * 0.13 + 19.0 ) * 0.45;
  float packedW = clamp( vPathBlend + ( seamN - 0.5 ) * 0.28, 0.0, 1.0 );
  packedW = smoothstep( 0.12, 0.88, packedW );
  float powderFade = 1.0 - packedW;
  normal = normalize( mix( normal, snowGeoNormal, powderFade * 0.72 ) );
  vec3 powderRgb = snowPowderColor;
  diffuseColor.rgb = mix( diffuseColor.rgb, powderRgb, powderFade * 0.82 );
  float flatPow = dot( diffuseColor.rgb, vec3( 0.2126, 0.7152, 0.0722 ) );
  diffuseColor.rgb = mix( diffuseColor.rgb, vec3( flatPow ), powderFade * 0.12 );
  roughnessFactor = mix( roughnessFactor, snowPowderRough, powderFade * 0.9 );
`
        : '';

      shader.fragmentShader = shader.fragmentShader
        .replace('#include <common>', commonInject)
        .replace(
          '#include <normal_fragment_maps>',
          /* glsl */ `vec3 snowGeoNormal = normal;
#include <normal_fragment_maps>
{
  float viewDist = length( vViewPosition );
  // Soft distance fade — near corduroy stays, far fields read continuous.
  float detailFade = smoothstep( 24.0, 130.0, viewDist );
  normal = normalize( mix( normal, snowGeoNormal, detailFade * 0.68 ) );
  float flatLuma = dot( diffuseColor.rgb, vec3( 0.2126, 0.7152, 0.0722 ) );
  diffuseColor.rgb = mix( diffuseColor.rgb, vec3( flatLuma ), detailFade * 0.18 );
  ${seamBody}
  vec3 worldN = inverseTransformDirection( normal, viewMatrix );
  float sunFacing = clamp( dot( normalize( worldN ), normalize( snowSunDir ) ), 0.0, 1.0 );
  vec3 warmTint = vec3( 1.14, 1.05, 0.88 );
  vec3 coolTint = vec3( 0.82, 0.9, 1.12 );
  // Stronger warm/cool split so hills and kickers read soft volume under key light.
  diffuseColor.rgb *= mix( coolTint, warmTint, sunFacing * sunFacing * snowSunAmount );
  float shadeBoost = mix( 0.9, 1.06, sunFacing );
  diffuseColor.rgb *= mix( 1.0, shadeBoost, clamp( snowSunAmount, 0.0, 1.0 ) );
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

/**
 * Ensure `pathBlend` exists (0=powder … 1=packed). Reconstruct from vertex
 * colours when TerrainGenerator did not author the attribute.
 */
function ensurePathBlendAttribute(
  geo: THREE.BufferGeometry,
  colorAttr: THREE.BufferAttribute | THREE.InterleavedBufferAttribute
): void {
  if (geo.getAttribute('pathBlend')) return;
  const count = colorAttr.count;
  const blends = new Float32Array(count);
  const powder = SURFACE_TINTS.powder;
  const packed = SURFACE_TINTS.packed;
  for (let i = 0; i < count; i++) {
    const r = colorAttr.getX(i);
    const g = colorAttr.getY(i);
    const b = colorAttr.getZ(i);
    const dp =
      (r - powder[0]) * (r - powder[0]) +
      (g - powder[1]) * (g - powder[1]) +
      (b - powder[2]) * (b - powder[2]);
    const dk =
      (r - packed[0]) * (r - packed[0]) +
      (g - packed[1]) * (g - packed[1]) +
      (b - packed[2]) * (b - packed[2]);
    blends[i] = dp + dk > 1e-8 ? dp / (dp + dk) : 0.5;
  }
  geo.setAttribute('pathBlend', new THREE.Float32BufferAttribute(blends, 1));
}

/** Convenience: every PBR set id for preload / debug. */
export function listPbrSetIds(): readonly PbrSetId[] {
  return PBR_SET_IDS;
}

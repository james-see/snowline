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
    // Cool alpine powder — SSS wrap + soft normals, not grey fill.
    color: 0xc0cedc,
    roughness: 0.88,
    metalness: 0.0,
    clearcoat: 0.12,
    clearcoatRoughness: 0.62,
    sheen: 0.94,
    sheenColor: 0xb4cce4,
    sheenRoughness: 0.72,
    envMapIntensity: 0.52,
    /** Deep micro-normals — powder pillowy volume at chase distance. */
    normalScale: 1.72,
    speckle: 0.1,
    sunResponse: 0.88,
  },
  packed: {
    // Smooth groomed race strip — corduroy maps + specular, no geo moguls.
    color: 0xcac8c2,
    roughness: 0.42,
    metalness: 0.03,
    clearcoat: 0.62,
    clearcoatRoughness: 0.11,
    sheen: 0.38,
    sheenColor: 0xddd6ca,
    sheenRoughness: 0.3,
    envMapIntensity: 1.2,
    /** Readable corduroy normals — groomed sheet, not plastic zebra. */
    normalScale: 1.78,
    speckle: 0.05,
    sunResponse: 1.0,
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
  /** Rider board world position — contact AO under board (shader uniforms). */
  #boardContact = new THREE.Vector3(0, -1e6, 0);
  #boardContactUniforms: Array<{ value: THREE.Vector3 }> = [];

  constructor(resources: ResourceManager) {
    this.#resources = resources;
  }

  /** Per-frame board pose for snow contact darkening (chase cam ground). */
  setBoardContact(pos: THREE.Vector3Like): void {
    this.#boardContact.set(pos.x, pos.y, pos.z);
    for (const u of this.#boardContactUniforms) {
      u.value.copy(this.#boardContact);
    }
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
        roughness: 0.92,
        metalness: 0.0,
        envMapIntensity: 0.32,
        side: THREE.DoubleSide,
      });
      // Dense UV repeat — Kenney leaf UVs are sparse; keep LOD cheap (soft normals).
      this.#bindPropSet(mat, 'foliage_pine', { repeatU: 5.5, repeatV: 5.5 }, 'wood');
      mat.normalScale.set(0.62, 0.62);
      mat.aoMapIntensity = 0.9;
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
    this.#boardContactUniforms.length = 0;
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
      // Soft corduroy grooves — groom feel via maps, not path-scale geo moguls.
      try {
        const baked = bakeCorduroyGroom(local, {
          strength: 0.92,
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
    // AO troughs for corduroy form; powder a touch deeper for pillowy contact.
    mat.aoMapIntensity = setId === 'snow_groom' ? 1.18 : setId === 'snow_powder' ? 1.2 : 1.0;
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
      // Packed: soft corduroy specular (no emissive glow).
      mat.roughness = Math.min(mat.roughness, 0.48);
      mat.clearcoat = Math.max(mat.clearcoat, 0.55);
      mat.clearcoatRoughness = Math.min(mat.clearcoatRoughness, 0.14);
    } else if (setId === 'snow_powder') {
      // Powder stays soft — kill accidental hard specular from ORM lows.
      mat.roughness = Math.max(mat.roughness, 0.84);
      mat.clearcoat = Math.min(mat.clearcoat, 0.14);
    }
  }

  /**
   * Volumetric snow response (forward MeshPhysical — not a deferred G-buffer):
   * wrap SSS (cool shade / warm lit edge), view-dependent crystal sparkle,
   * board contact AO, horizon detail LOD.
   * Optional pathSeam: blend groom↔powder via pathBlend + world-space seam noise.
   *
   * Note: do NOT mutate fragment varyings (vMapUv etc.) — illegal in GLSL and
   * kills the whole snow program (flat untextured fallback). Volume stays in
   * normals / lighting, not POM UV offsets.
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
    const key = `snow-vol-${variant}-${amount.toFixed(2)}${pathSeam ? '-seam' : ''}`;
    mat.customProgramCacheKey = () => key;
    mat.onBeforeCompile = (shader) => {
      shader.uniforms.snowSunAmount = { value: amount };
      shader.uniforms.snowSunDir = {
        value: new THREE.Vector3(ALPINE_SUN_DIR.x, ALPINE_SUN_DIR.y, ALPINE_SUN_DIR.z),
      };
      const boardU = { value: this.#boardContact.clone() };
      shader.uniforms.snowBoardPos = boardU;
      this.#boardContactUniforms.push(boardU);
      if (pathSeam) {
        shader.uniforms.snowPowderColor = { value: powder };
        shader.uniforms.snowPowderRough = { value: powderRough };
      }

      shader.vertexShader = shader.vertexShader
        .replace(
          '#include <common>',
          pathSeam
            ? /* glsl */ `#include <common>
attribute float pathBlend;
varying float vPathBlend;
varying vec3 vSnowWorldPos;`
            : /* glsl */ `#include <common>
varying vec3 vSnowWorldPos;`
        )
        .replace(
          '#include <begin_vertex>',
          pathSeam
            ? /* glsl */ `#include <begin_vertex>
vPathBlend = pathBlend;
vSnowWorldPos = ( modelMatrix * vec4( transformed, 1.0 ) ).xyz;`
            : /* glsl */ `#include <begin_vertex>
vSnowWorldPos = ( modelMatrix * vec4( transformed, 1.0 ) ).xyz;`
        );

      const commonInject = pathSeam
        ? /* glsl */ `#include <common>
uniform float snowSunAmount;
uniform vec3 snowSunDir;
uniform vec3 snowBoardPos;
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
uniform vec3 snowSunDir;
uniform vec3 snowBoardPos;
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
}`;

      const seamBody = pathSeam
        ? /* glsl */ `
  // Soft path↔powder: pathBlend + seam noise — race strip stays groomed, apron powders.
  float seamN =
    snowSeamNoise( vSnowWorldPos.xz * 0.045 ) * 0.55 +
    snowSeamNoise( vSnowWorldPos.xz * 0.13 + 19.0 ) * 0.45;
  float packedW = clamp( vPathBlend + ( seamN - 0.5 ) * 0.28, 0.0, 1.0 );
  packedW = smoothstep( 0.12, 0.88, packedW );
  float powderFade = 1.0 - packedW;
  normal = normalize( mix( normal, snowGeoNormal, powderFade * 0.72 ) );
  // Soft world-space relief normals — volume without path-scale geo moguls.
  vec2 wp = vSnowWorldPos.xz;
  float cordN = sin( wp.x * 1.35 + wp.y * 0.28 ) * 0.22 + sin( wp.x * 2.8 - wp.y * 0.15 ) * 0.1;
  float bumpN = ( snowSeamNoise( wp * 0.4 ) - 0.5 ) * 0.38;
  float powderN = ( snowSeamNoise( wp * 0.85 + 7.0 ) - 0.5 ) * 0.48;
  vec3 reliefN = normalize( vec3(
    cordN * packedW + powderN * powderFade * 0.7,
    1.0 + bumpN * 0.45,
    cordN * 0.28 * packedW + powderN * powderFade * 0.32
  ) );
  vec3 reliefView = normalize( mat3( viewMatrix ) * reliefN );
  normal = normalize( mix( normal, normalize( normal + reliefView * 0.38 ), 0.48 ) );
  vec3 powderRgb = snowPowderColor;
  diffuseColor.rgb = mix( diffuseColor.rgb, powderRgb, powderFade * 0.82 );
  float flatPow = dot( diffuseColor.rgb, vec3( 0.2126, 0.7152, 0.0722 ) );
  diffuseColor.rgb = mix( diffuseColor.rgb, vec3( flatPow ), powderFade * 0.12 );
  roughnessFactor = mix( roughnessFactor, snowPowderRough, powderFade * 0.9 );
  roughnessFactor = mix( roughnessFactor, max( 0.24, roughnessFactor - 0.06 ), packedW * 0.28 );
`
        : variant === 'powder'
          ? /* glsl */ `
  float packedW = 0.0;
  float powderFade = 1.0;
  vec2 wp = vSnowWorldPos.xz;
  float powderN = ( snowSeamNoise( wp * 0.85 + 7.0 ) - 0.5 ) * 0.4;
  float powderN2 = ( snowSeamNoise( wp * 2.1 + 2.0 ) - 0.5 ) * 0.22;
  vec3 powderRelief = normalize( vec3( powderN, 1.0, powderN2 ) );
  vec3 powderReliefV = normalize( mat3( viewMatrix ) * powderRelief );
  normal = normalize( mix( normal, normalize( normal + powderReliefV * 0.38 ), 0.48 ) );
`
          : /* glsl */ `
  float packedW = ${variant === 'packed' ? '1.0' : '0.5'};
  float powderFade = 1.0 - packedW;
`;

      shader.fragmentShader = shader.fragmentShader
        .replace('#include <common>', commonInject)
        .replace(
          '#include <normal_fragment_maps>',
          /* glsl */ `vec3 snowGeoNormal = normal;
#include <normal_fragment_maps>
{
  float viewDist = length( vViewPosition );
  // Horizon softens microdetail — near snow keeps volume, far sheet stays continuous.
  float detailFade = smoothstep( 36.0, 160.0, viewDist );
  normal = normalize( mix( normal, snowGeoNormal, detailFade * 0.55 ) );
  float flatLuma = dot( diffuseColor.rgb, vec3( 0.2126, 0.7152, 0.0722 ) );
  diffuseColor.rgb = mix( diffuseColor.rgb, vec3( flatLuma ), detailFade * 0.14 );
  ${seamBody}
  vec3 worldN = inverseTransformDirection( normal, viewMatrix );
  vec3 sunDirN = normalize( snowSunDir );
  float nDotL = dot( normalize( worldN ), sunDirN );
  float sunFacing = clamp( nDotL, 0.0, 1.0 );
  // Warm lit / cool blue shade — thickness wrap (pillowy snow volume).
  vec3 warmTint = vec3( 1.16, 1.06, 0.9 );
  vec3 coolTint = vec3( 0.72, 0.84, 1.14 );
  float wrapL = clamp( nDotL * 0.5 + 0.5, 0.0, 1.0 );
  diffuseColor.rgb *= mix( coolTint, warmTint, pow( wrapL, 1.15 ) * snowSunAmount );
  float shadeBoost = mix( 0.86, 1.07, sunFacing );
  diffuseColor.rgb *= mix( 1.0, shadeBoost, clamp( snowSunAmount, 0.0, 1.0 ) );
  // Soft SSS: cool bleed into shadow, warm edge scatter — never emissive trail.
  float wrap = clamp( nDotL * 0.55 + 0.45, 0.0, 1.0 );
  float sss = pow( 1.0 - sunFacing, 1.45 ) * wrap;
  vec3 sssCool = vec3( 0.62, 0.78, 0.98 );
  vec3 sssWarm = vec3( 1.05, 0.96, 0.86 );
  diffuseColor.rgb += diffuseColor.rgb * mix( sssCool, sssWarm, wrapL ) * sss * snowSunAmount * 0.22;
  // Anisotropic crystal sparkles — flake reflect + graze stretch (no POM UV writes).
  vec3 viewW = normalize( cameraPosition - vSnowWorldPos );
  float graze = 1.0 - abs( dot( normalize( worldN ), viewW ) );
  vec2 sparkCell = floor( vSnowWorldPos.xz * mix( 7.2, 4.4, graze ) );
  float sparkHash = snowSeamHash( sparkCell + 17.0 );
  vec3 flakeN = normalize( vec3(
    sparkHash * 2.0 - 1.0,
    0.5 + snowSeamHash( sparkCell + 3.0 ) * 0.5,
    snowSeamHash( sparkCell + 9.0 ) * 2.0 - 1.0
  ) );
  flakeN = normalize( mix( normalize( worldN ), flakeN, 0.65 ) );
  vec3 flakeR = reflect( -sunDirN, flakeN );
  float sparkAlign = max( 0.0, dot( flakeR, viewW ) );
  float sparkThresh = mix( 0.97, 0.935, graze );
  float sparkMask = step( sparkThresh, sparkAlign ) * step( 0.88, sparkHash ) * ( 1.0 - detailFade );
  float sparkle = sparkMask * sunFacing * sunFacing;
  sparkle *= mix( 0.4, 1.0, powderFade );
  roughnessFactor = mix( roughnessFactor, max( 0.12, roughnessFactor * 0.32 ), sparkle * 0.8 );
  diffuseColor.rgb += vec3( 0.92, 0.96, 1.05 ) * sparkle * 0.16;
  // Board contact puddle — soft AO under rider.
  vec2 boardDelta = vSnowWorldPos.xz - snowBoardPos.xz;
  float boardDist = length( boardDelta );
  float contact = ( 1.0 - smoothstep( 0.35, 2.8, boardDist ) ) * ( 1.0 - detailFade );
  contact *= smoothstep( 1.6, 0.15, abs( vSnowWorldPos.y - snowBoardPos.y ) );
  diffuseColor.rgb *= 1.0 - contact * 0.22;
  float contactAo = contact * 0.35;
  roughnessFactor = mix( roughnessFactor, min( 0.95, roughnessFactor + 0.08 ), contactAo );
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

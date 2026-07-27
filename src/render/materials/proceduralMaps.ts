import * as THREE from 'three';
import type { PbrSetId } from '@/render/materials/ids.ts';
import { DEFAULT_TILE_SCALE, type PbrMaps } from '@/render/materials/pbrMaps.ts';

/** Deterministic LCG — same seed → same grain across sessions / critic runs. */
function makeRand(seed: number): () => number {
  let s = seed % 2147483647;
  if (s <= 0) s += 2147483646;
  return () => {
    s = (s * 16807) % 2147483647;
    return (s & 0xffff) / 0xffff;
  };
}

function hash2(x: number, y: number, seed: number): number {
  let n = x * 374761393 + y * 668265263 + seed * 982451653;
  n = (n ^ (n >>> 13)) * 1274126177;
  return ((n ^ (n >>> 16)) >>> 0) / 4294967295;
}

function valueNoise(x: number, y: number, seed: number): number {
  const x0 = Math.floor(x);
  const y0 = Math.floor(y);
  const fx = x - x0;
  const fy = y - y0;
  const ux = fx * fx * (3 - 2 * fx);
  const uy = fy * fy * (3 - 2 * fy);
  const a = hash2(x0, y0, seed);
  const b = hash2(x0 + 1, y0, seed);
  const c = hash2(x0, y0 + 1, seed);
  const d = hash2(x0 + 1, y0 + 1, seed);
  return a + (b - a) * ux + (c - a) * uy + (a - b - c + d) * ux * uy;
}

function fbm(x: number, y: number, seed: number, octaves = 5): number {
  let amp = 0.5;
  let freq = 1;
  let sum = 0;
  let norm = 0;
  for (let i = 0; i < octaves; i++) {
    sum += valueNoise(x * freq, y * freq, seed + i * 101) * amp;
    norm += amp;
    amp *= 0.5;
    freq *= 2;
  }
  return sum / norm;
}

interface VariantPalette {
  base: [number, number, number];
  dirt: [number, number, number];
  ice: [number, number, number];
  /** Mean green channel of ORM (roughness). */
  roughness: number;
  roughnessVar: number;
  dirtChance: number;
  iceChance: number;
  corduroy: number;
}

const PALETTES: Record<PbrSetId, VariantPalette> = {
  snow_powder: {
    // Cool soft powder — distinct from packed groom.
    base: [176, 190, 208],
    dirt: [92, 78, 64],
    ice: [140, 172, 196],
    roughness: 0.93,
    roughnessVar: 0.12,
    dirtChance: 0.08,
    iceChance: 0.03,
    corduroy: 0,
  },
  snow_groom: {
    // Warmer packed alpine — corduroy ridges catch sun.
    base: [168, 172, 170],
    dirt: [86, 72, 58],
    ice: [132, 156, 176],
    roughness: 0.5,
    roughnessVar: 0.24,
    dirtChance: 0.1,
    iceChance: 0.06,
    corduroy: 1.55,
  },
  ice_glass: {
    base: [110, 150, 178],
    dirt: [96, 108, 118],
    ice: [96, 148, 180],
    roughness: 0.12,
    roughnessVar: 0.16,
    dirtChance: 0.03,
    iceChance: 0.65,
    corduroy: 0,
  },
  ice_frost: {
    base: [132, 164, 188],
    dirt: [108, 106, 98],
    ice: [112, 158, 190],
    roughness: 0.28,
    roughnessVar: 0.2,
    dirtChance: 0.05,
    iceChance: 0.45,
    corduroy: 0,
  },
  rock_face: {
    base: [92, 88, 82],
    dirt: [58, 52, 46],
    ice: [140, 150, 160],
    roughness: 0.92,
    roughnessVar: 0.06,
    dirtChance: 0.35,
    iceChance: 0.01,
    corduroy: 0,
  },
  rock_scree: {
    base: [108, 102, 94],
    dirt: [70, 64, 56],
    ice: [150, 155, 160],
    roughness: 0.95,
    roughnessVar: 0.04,
    dirtChance: 0.45,
    iceChance: 0.01,
    corduroy: 0,
  },
  wood_bark: {
    base: [92, 62, 38],
    dirt: [48, 32, 22],
    ice: [120, 110, 100],
    roughness: 0.9,
    roughnessVar: 0.08,
    dirtChance: 0.25,
    iceChance: 0,
    corduroy: 0,
  },
  foliage_pine: {
    // Mid needle brown — runtime canopy mats multiply alpine green tints.
    base: [78, 92, 52],
    dirt: [48, 58, 34],
    ice: [110, 120, 90],
    roughness: 0.94,
    roughnessVar: 0.05,
    dirtChance: 0.18,
    iceChance: 0,
    corduroy: 0,
  },
  wood_plank: {
    base: [118, 78, 42],
    dirt: [70, 48, 28],
    ice: [140, 130, 120],
    roughness: 0.86,
    roughnessVar: 0.1,
    dirtChance: 0.2,
    iceChance: 0,
    corduroy: 0,
  },
  fabric_banner: {
    base: [168, 148, 110],
    dirt: [110, 96, 72],
    ice: [180, 170, 150],
    roughness: 0.92,
    roughnessVar: 0.06,
    dirtChance: 0.15,
    iceChance: 0,
    corduroy: 0,
  },
};

/** ~primary grooves per tile — coarse enough to read at chase distance after mips. */
const CORDUROY_PRIMARY = 28;
const CORDUROY_SECONDARY = 56;

function corduroyWave(v: number, wander: number): number {
  const primary = Math.sin(v * Math.PI * CORDUROY_PRIMARY + wander * 2.1);
  const secondary = Math.sin(v * Math.PI * CORDUROY_SECONDARY + 0.35) * 0.28;
  return primary * 0.5 + 0.5 + secondary;
}

/**
 * True for HTML/canvas/bitmap sources — not THREE.DataTexture `{ data, width, height }`.
 * Speckling DataTextures was wiping procedural corduroy into flat grey fill.
 */
export function isDrawableImageSource(image: unknown): image is CanvasImageSource {
  if (image == null || typeof image !== 'object') return false;
  if ('data' in (image as object) && ArrayBuffer.isView((image as { data: unknown }).data)) {
    return false;
  }
  if (typeof HTMLImageElement !== 'undefined' && image instanceof HTMLImageElement) return true;
  if (typeof HTMLCanvasElement !== 'undefined' && image instanceof HTMLCanvasElement) return true;
  if (typeof ImageBitmap !== 'undefined' && image instanceof ImageBitmap) return true;
  if (typeof OffscreenCanvas !== 'undefined' && image instanceof OffscreenCanvas) return true;
  return false;
}

/**
 * Procedural albedo + tangent normal + ORM (ao/rough/metal) for a PBR set.
 * High-contrast mid-grey snow so critic frames never read as plastic fill
 * when vendored CC0 maps fail to load (or wash out under soft fill).
 */
export function makeProceduralPbr(id: PbrSetId, size = 512): PbrMaps {
  const pal = PALETTES[id];
  const seed = id.split('').reduce((a, c) => a + c.charCodeAt(0), 17);
  const rand = makeRand(seed * 9973);
  const isPowder = id === 'snow_powder';
  const isGroom = id === 'snow_groom';

  const albedo = new Uint8Array(size * size * 4);
  const normal = new Uint8Array(size * size * 4);
  const orm = new Uint8Array(size * size * 4);
  const height = new Float32Array(size * size);

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const u = x / size;
      const v = y / size;
      const nMacro = fbm(u * 5, v * 5, seed, 5);
      const nMicro = fbm(u * 36, v * 36, seed + 3, 4);
      const nDetail = fbm(u * 96, v * 96, seed + 7, 3);
      const nCrumb = fbm(u * 180, v * 180, seed + 11, 2);
      let h = nMacro * 0.42 + nMicro * 0.32 + nDetail * 0.18 + nCrumb * 0.08;
      let cord = 0.5;

      if (pal.corduroy > 0) {
        // Dense groomed corduroy ridges along V — packed signature at chase scale.
        cord = corduroyWave(v, nMacro);
        const w = Math.min(0.92, 0.62 * pal.corduroy);
        h = h * (1 - w) + cord * w;
      }

      if (isPowder) {
        // Soft wind ripples — powder signature vs packed ridges.
        const rip = Math.sin(u * Math.PI * 14 + nMacro * 3) * 0.5 + 0.5;
        h = h * 0.78 + rip * 0.22;
      }

      height[y * size + x] = h;

      const dirtMask = nMacro * nMicro;
      const isDirt = dirtMask < pal.dirtChance || rand() < pal.dirtChance * 0.45;
      const isIcePatch = nDetail > 1 - pal.iceChance || rand() < pal.iceChance * 0.3;

      let r = pal.base[0];
      let g = pal.base[1];
      let b = pal.base[2];

      // Wider shade range — valleys dark enough to kill flat fill.
      const shade = 0.68 + h * 0.48;
      r = Math.min(255, r * shade);
      g = Math.min(255, g * shade);
      b = Math.min(255, b * shade);

      if (isGroom) {
        // Warm ridge / cool trough albedo grooves — readable without relying on normals alone.
        const ridge = Math.min(1, Math.max(0, cord));
        const warmR = 214,
          warmG = 196,
          warmB = 168;
        const coolR = 118,
          coolG = 140,
          coolB = 168;
        const t = ridge * ridge;
        r = r * 0.42 + (warmR * t + coolR * (1 - t)) * 0.58;
        g = g * 0.42 + (warmG * t + coolG * (1 - t)) * 0.58;
        b = b * 0.42 + (warmB * t + coolB * (1 - t)) * 0.58;
        // Sharpen trough darkening for corduroy stripe read.
        const groove = Math.pow(Math.abs(Math.sin(v * Math.PI * CORDUROY_PRIMARY + nMacro * 2.1)), 0.55);
        const grooveShade = 0.78 + groove * 0.32;
        r *= grooveShade;
        g *= grooveShade;
        b *= grooveShade * 1.02;
      } else if (isPowder) {
        // Cooler powder with soft warm sun-side mottling — not grey speckles.
        const mott = nMacro * 2 - 1;
        r = Math.min(255, r + mott * 10 + 6);
        g = Math.min(255, g + mott * 4 + 2);
        b = Math.min(255, b - mott * 12 + 8);
      }

      if (isDirt) {
        const mix = 0.35 + rand() * 0.4;
        r = r * (1 - mix) + pal.dirt[0] * mix;
        g = g * (1 - mix) + pal.dirt[1] * mix;
        b = b * (1 - mix) + pal.dirt[2] * mix;
      } else if (isIcePatch) {
        const mix = 0.3 + rand() * 0.45;
        r = r * (1 - mix) + pal.ice[0] * mix;
        g = g * (1 - mix) + pal.ice[1] * mix;
        b = b * (1 - mix) + pal.ice[2] * mix;
      }

      // Micro grain — keep detail without blowing to white or flat grey.
      const grain = (rand() - 0.5) * (isGroom ? 18 : 26);
      r = Math.min(255, Math.max(0, r + grain * (isGroom ? 1.05 : 1)));
      g = Math.min(255, Math.max(0, g + grain * (isGroom ? 0.92 : 0.88)));
      b = Math.min(255, Math.max(0, b + grain * (isGroom ? 0.75 : 1.1)));

      const i = (y * size + x) * 4;
      albedo[i] = r;
      albedo[i + 1] = g;
      albedo[i + 2] = b;
      albedo[i + 3] = 255;

      let rough = pal.roughness + (h - 0.5) * pal.roughnessVar * 2.4;
      if (isDirt) rough = Math.min(0.98, rough + 0.22);
      if (isIcePatch) rough = Math.max(0.06, rough - 0.42);
      if (isGroom) {
        // Ridges catch light (lower rough); troughs stay softer.
        rough += (0.5 - h) * 0.28;
      }
      rough = Math.min(0.98, Math.max(0.05, rough + (rand() - 0.5) * 0.08));

      const ao = Math.min(
        1,
        Math.max(
          0.22,
          0.38 + h * 0.52 - (isDirt ? 0.16 : 0) - nCrumb * 0.12 - (isGroom ? (1 - h) * 0.18 : 0)
        )
      );
      const metal = isIcePatch && !isDirt ? 0.08 + rand() * 0.05 : rand() * 0.02;

      orm[i] = Math.floor(ao * 255);
      orm[i + 1] = Math.floor(rough * 255);
      orm[i + 2] = Math.floor(metal * 255);
      orm[i + 3] = 255;
    }
  }

  // Sobel → tangent-space normal from height (stronger grooves for groom).
  const strength = id.startsWith('ice_')
    ? 1.8
    : id.startsWith('rock_')
      ? 2.4
      : isGroom
        ? 4.2
        : isPowder
          ? 2.4
          : 2.85;
  writeNormalsFromHeight(height, normal, size, strength);

  return {
    albedo: toDataTex(albedo, size, true),
    normal: toDataTex(normal, size, false),
    orm: toDataTex(orm, size, false),
    tileScale: DEFAULT_TILE_SCALE[id],
  };
}

function writeNormalsFromHeight(
  height: Float32Array,
  normal: Uint8Array,
  size: number,
  strength: number
): void {
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const xl = height[y * size + ((x - 1 + size) % size)]!;
      const xr = height[y * size + ((x + 1) % size)]!;
      const yu = height[((y - 1 + size) % size) * size + x]!;
      const yd = height[((y + 1) % size) * size + x]!;
      const dx = (xl - xr) * strength;
      const dy = (yu - yd) * strength;
      const invLen = 1 / Math.hypot(dx, dy, 1);
      const nx = dx * invLen;
      const ny = dy * invLen;
      const nz = invLen;
      const i = (y * size + x) * 4;
      normal[i] = Math.floor((nx * 0.5 + 0.5) * 255);
      normal[i + 1] = Math.floor((ny * 0.5 + 0.5) * 255);
      normal[i + 2] = Math.floor((nz * 0.5 + 0.5) * 255);
      normal[i + 3] = 255;
    }
  }
}

function toDataTex(data: Uint8Array, size: number, srgb: boolean): THREE.DataTexture {
  const tex = new THREE.DataTexture(data, size, size);
  tex.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.magFilter = THREE.LinearFilter;
  tex.minFilter = THREE.LinearMipmapLinearFilter;
  tex.generateMipmaps = true;
  tex.needsUpdate = true;
  return tex;
}

function sampleTexRgba(
  tex: THREE.Texture,
  size: number
): Uint8ClampedArray | null {
  const img = tex.image as
    | CanvasImageSource
    | { data: ArrayBufferView; width: number; height: number }
    | undefined;
  if (!img) return null;

  if ('data' in img && ArrayBuffer.isView(img.data)) {
    const src = new Uint8Array(
      img.data.buffer,
      img.data.byteOffset,
      img.data.byteLength
    );
    const out = new Uint8ClampedArray(size * size * 4);
    const sw = img.width;
    const sh = img.height;
    for (let y = 0; y < size; y++) {
      const sy = Math.min(sh - 1, Math.floor((y / size) * sh));
      for (let x = 0; x < size; x++) {
        const sx = Math.min(sw - 1, Math.floor((x / size) * sw));
        const si = (sy * sw + sx) * 4;
        const di = (y * size + x) * 4;
        out[di] = src[si] ?? 0;
        out[di + 1] = src[si + 1] ?? 0;
        out[di + 2] = src[si + 2] ?? 0;
        out[di + 3] = src[si + 3] ?? 255;
      }
    }
    return out;
  }

  if (typeof document === 'undefined' || !isDrawableImageSource(img)) return null;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;
  ctx.drawImage(img, 0, 0, size, size);
  return ctx.getImageData(0, 0, size, size).data;
}

/**
 * Bake chase-scale corduroy grooves into CC0 (or any) groom maps.
 * Rewrites albedo stripes + tangent normals + ORM so packed snow reads as groomed.
 */
export function bakeCorduroyGroom(
  maps: PbrMaps,
  opts: { size?: number; strength?: number; seed?: number } = {}
): PbrMaps | null {
  if (typeof document === 'undefined') return null;
  const size = opts.size ?? 512;
  const strength = opts.strength ?? 1.2;
  const seed = opts.seed ?? 77;

  const srcAlbedo = sampleTexRgba(maps.albedo, size);
  const srcOrm = sampleTexRgba(maps.orm, size);
  if (!srcAlbedo) return null;

  const albedo = new Uint8Array(size * size * 4);
  const normal = new Uint8Array(size * size * 4);
  const orm = new Uint8Array(size * size * 4);
  const height = new Float32Array(size * size);

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const u = x / size;
      const v = y / size;
      const nMacro = fbm(u * 5, v * 5, seed, 4);
      const cord = corduroyWave(v, nMacro);
      const micro = fbm(u * 48, v * 48, seed + 3, 3);
      const h = cord * 0.78 + micro * 0.22;
      height[y * size + x] = h;

      const i = (y * size + x) * 4;
      let r = srcAlbedo[i]!;
      let g = srcAlbedo[i + 1]!;
      let b = srcAlbedo[i + 2]!;

      // Pull pale CC0 toward mid alpine, then stripe warm/cool corduroy.
      const mid = 0.82 + h * 0.22;
      r = Math.min(255, r * mid * 0.88);
      g = Math.min(255, g * mid * 0.9);
      b = Math.min(255, b * mid * 0.94);

      const ridge = Math.min(1, Math.max(0, cord));
      const t = ridge * ridge;
      const warmR = 208,
        warmG = 190,
        warmB = 162;
      const coolR = 112,
        coolG = 134,
        coolB = 160;
      const stripe = Math.min(1, 0.55 * strength);
      r = r * (1 - stripe) + (warmR * t + coolR * (1 - t)) * stripe;
      g = g * (1 - stripe) + (warmG * t + coolG * (1 - t)) * stripe;
      b = b * (1 - stripe) + (warmB * t + coolB * (1 - t)) * stripe;

      const groove = Math.pow(
        Math.abs(Math.sin(v * Math.PI * CORDUROY_PRIMARY + nMacro * 2.1)),
        0.55
      );
      const grooveShade = 0.74 + groove * 0.36;
      r *= grooveShade;
      g *= grooveShade;
      b *= grooveShade * 1.03;

      albedo[i] = Math.min(255, Math.max(0, r));
      albedo[i + 1] = Math.min(255, Math.max(0, g));
      albedo[i + 2] = Math.min(255, Math.max(0, b));
      albedo[i + 3] = 255;

      let ao = 0.4 + h * 0.5;
      let rough = 0.42 + (0.5 - h) * 0.35;
      let metal = 0.02;
      if (srcOrm) {
        ao = (srcOrm[i]! / 255) * 0.45 + ao * 0.55;
        rough = (srcOrm[i + 1]! / 255) * 0.4 + rough * 0.6;
        metal = srcOrm[i + 2]! / 255;
      }
      orm[i] = Math.floor(Math.min(1, Math.max(0.2, ao)) * 255);
      orm[i + 1] = Math.floor(Math.min(0.95, Math.max(0.12, rough)) * 255);
      orm[i + 2] = Math.floor(Math.min(0.2, metal) * 255);
      orm[i + 3] = 255;
    }
  }

  writeNormalsFromHeight(height, normal, size, 3.8 * strength);

  const albedoTex = toDataTex(albedo, size, true);
  const normalTex = toDataTex(normal, size, false);
  const ormTex = toDataTex(orm, size, false);
  albedoTex.anisotropy = maps.albedo.anisotropy;
  normalTex.anisotropy = maps.normal.anisotropy;
  ormTex.anisotropy = maps.orm.anisotropy;

  return {
    albedo: albedoTex,
    normal: normalTex,
    orm: ormTex,
    tileScale: maps.tileScale,
  };
}

/**
 * Composite darker dirt/rock speckles onto an existing albedo (CC0 or procedural)
 * so large snow fields never read as uniform fill under soft fill light.
 */
export function speckledAlbedo(
  source: THREE.Texture,
  opts: { amount?: number; seed?: number; size?: number; warmCool?: number } = {}
): THREE.CanvasTexture {
  const size = opts.size ?? 512;
  const amount = opts.amount ?? 0.2;
  const seed = opts.seed ?? 42;
  const warmCool = opts.warmCool ?? 1;
  const rand = makeRand(seed);

  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d')!;

  const img = source.image as unknown;
  if (isDrawableImageSource(img)) {
    ctx.drawImage(img, 0, 0, size, size);
  } else {
    // DataTexture / missing — mid alpine base (not blown white).
    ctx.fillStyle = '#9aabba';
    ctx.fillRect(0, 0, size, size);
    const sampled = sampleTexRgba(source, size);
    if (sampled) {
      const tmp = ctx.createImageData(size, size);
      tmp.data.set(sampled);
      ctx.putImageData(tmp, 0, 0);
    }
  }

  const imageData = ctx.getImageData(0, 0, size, size);
  const d = imageData.data;
  for (let i = 0; i < size * size; i++) {
    const x = i % size;
    const y = (i / size) | 0;
    const n = fbm((x / size) * 14, (y / size) * 14, seed, 4);
    const nFine = fbm((x / size) * 48, (y / size) * 48, seed + 9, 2);
    const o = i * 4;
    // Soft macro — keep micro-detail; warm/cool mottling instead of grey wash.
    const shade = 0.88 + n * 0.1;
    const wc = (n * 2 - 1) * warmCool;
    d[o] = Math.floor(Math.min(255, Math.max(0, d[o]! * shade + wc * 14)));
    d[o + 1] = Math.floor(Math.min(255, Math.max(0, d[o + 1]! * shade + wc * 4)));
    d[o + 2] = Math.floor(Math.min(255, Math.max(0, d[o + 2]! * shade * 0.98 - wc * 16)));

    if (n < amount * 0.55 || rand() < amount * 0.12 || nFine < amount * 0.2) {
      const mix = 0.22 + rand() * 0.28;
      d[o] = Math.floor(d[o]! * (1 - mix) + (70 + rand() * 28) * mix);
      d[o + 1] = Math.floor(d[o + 1]! * (1 - mix) + (62 + rand() * 22) * mix);
      d[o + 2] = Math.floor(d[o + 2]! * (1 - mix) + (52 + rand() * 18) * mix);
    } else if (n > 0.86 && rand() < 0.1) {
      // Wet ice flecks — cooler; clearcoat carries the gloss.
      const mix = 0.22 + rand() * 0.25;
      d[o] = Math.floor(d[o]! * (1 - mix) + 118 * mix);
      d[o + 1] = Math.floor(d[o + 1]! * (1 - mix) + 158 * mix);
      d[o + 2] = Math.floor(d[o + 2]! * (1 - mix) + 188 * mix);
    }
  }
  ctx.putImageData(imageData, 0, 0);

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.anisotropy = source.anisotropy;
  tex.needsUpdate = true;
  return tex;
}

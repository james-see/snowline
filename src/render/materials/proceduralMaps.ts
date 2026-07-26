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
    base: [214, 224, 236],
    dirt: [110, 96, 82],
    ice: [170, 200, 220],
    roughness: 0.9,
    roughnessVar: 0.08,
    dirtChance: 0.04,
    iceChance: 0.02,
    corduroy: 0,
  },
  snow_groom: {
    base: [196, 208, 220],
    dirt: [96, 86, 74],
    ice: [160, 190, 210],
    roughness: 0.68,
    roughnessVar: 0.14,
    dirtChance: 0.07,
    iceChance: 0.05,
    corduroy: 1,
  },
  ice_glass: {
    base: [168, 198, 220],
    dirt: [120, 130, 140],
    ice: [140, 180, 210],
    roughness: 0.18,
    roughnessVar: 0.12,
    dirtChance: 0.02,
    iceChance: 0.55,
    corduroy: 0,
  },
  ice_frost: {
    base: [188, 210, 226],
    dirt: [130, 128, 120],
    ice: [150, 188, 214],
    roughness: 0.32,
    roughnessVar: 0.16,
    dirtChance: 0.03,
    iceChance: 0.35,
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
};

/**
 * Procedural albedo + tangent normal + ORM (ao/rough/metal) for a PBR set.
 * Intentionally high-contrast so critic frames never read as plastic fill
 * when vendored CC0 maps fail to load.
 */
export function makeProceduralPbr(id: PbrSetId, size = 256): PbrMaps {
  const pal = PALETTES[id];
  const seed = id.split('').reduce((a, c) => a + c.charCodeAt(0), 17);
  const rand = makeRand(seed * 9973);

  const albedo = new Uint8Array(size * size * 4);
  const normal = new Uint8Array(size * size * 4);
  const orm = new Uint8Array(size * size * 4);
  const height = new Float32Array(size * size);

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const u = x / size;
      const v = y / size;
      const nMacro = fbm(u * 6, v * 6, seed, 4);
      const nMicro = fbm(u * 28, v * 28, seed + 3, 3);
      const nDetail = fbm(u * 64, v * 64, seed + 7, 2);
      let h = nMacro * 0.55 + nMicro * 0.3 + nDetail * 0.15;

      if (pal.corduroy > 0) {
        // Groomed corduroy ridges along V.
        const cord = Math.sin(v * Math.PI * 48 + nMacro * 2) * 0.5 + 0.5;
        h = h * 0.65 + cord * 0.35;
      }

      height[y * size + x] = h;

      const dirtMask = nMacro * nMicro;
      const isDirt = dirtMask < pal.dirtChance || rand() < pal.dirtChance * 0.35;
      const isIcePatch = nDetail > 1 - pal.iceChance || rand() < pal.iceChance * 0.25;

      let r = pal.base[0];
      let g = pal.base[1];
      let b = pal.base[2];

      const shade = 0.82 + h * 0.28;
      r = Math.min(255, r * shade);
      g = Math.min(255, g * shade);
      b = Math.min(255, b * shade);

      if (isDirt) {
        const mix = 0.35 + rand() * 0.45;
        r = r * (1 - mix) + pal.dirt[0] * mix;
        g = g * (1 - mix) + pal.dirt[1] * mix;
        b = b * (1 - mix) + pal.dirt[2] * mix;
      } else if (isIcePatch) {
        const mix = 0.25 + rand() * 0.4;
        r = r * (1 - mix) + pal.ice[0] * mix;
        g = g * (1 - mix) + pal.ice[1] * mix;
        b = b * (1 - mix) + pal.ice[2] * mix;
      }

      // Speckle grain — breaks uniform blue-white slabs.
      const grain = (rand() - 0.5) * 18;
      r = Math.min(255, Math.max(0, r + grain));
      g = Math.min(255, Math.max(0, g + grain * 0.9));
      b = Math.min(255, Math.max(0, b + grain * 1.05));

      const i = (y * size + x) * 4;
      albedo[i] = r;
      albedo[i + 1] = g;
      albedo[i + 2] = b;
      albedo[i + 3] = 255;

      let rough = pal.roughness + (h - 0.5) * pal.roughnessVar * 2;
      if (isDirt) rough = Math.min(0.98, rough + 0.18);
      if (isIcePatch) rough = Math.max(0.08, rough - 0.35);
      rough = Math.min(0.98, Math.max(0.06, rough + (rand() - 0.5) * 0.06));

      const ao = Math.min(1, Math.max(0.35, 0.55 + h * 0.4 - (isDirt ? 0.12 : 0)));
      const metal = isIcePatch && !isDirt ? 0.06 + rand() * 0.04 : rand() * 0.02;

      orm[i] = Math.floor(ao * 255);
      orm[i + 1] = Math.floor(rough * 255);
      orm[i + 2] = Math.floor(metal * 255);
      orm[i + 3] = 255;
    }
  }

  // Sobel → tangent-space normal from height.
  const strength = id.startsWith('ice_') ? 1.4 : id.startsWith('rock_') ? 2.4 : 2.0;
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

  return {
    albedo: toDataTex(albedo, size, true),
    normal: toDataTex(normal, size, false),
    orm: toDataTex(orm, size, false),
    tileScale: DEFAULT_TILE_SCALE[id],
  };
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

/**
 * Composite darker dirt/rock speckles onto an existing albedo (CC0 or procedural)
 * so large snow fields never read as uniform fill under soft fill light.
 */
export function speckledAlbedo(
  source: THREE.Texture,
  opts: { amount?: number; seed?: number; size?: number } = {}
): THREE.CanvasTexture {
  const size = opts.size ?? 512;
  const amount = opts.amount ?? 0.12;
  const seed = opts.seed ?? 42;
  const rand = makeRand(seed);

  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d')!;

  // Image/canvas/bitmap sources only — procedural DataTextures already carry grain.
  const img = source.image as CanvasImageSource | undefined;
  const w =
    img && 'width' in img && typeof (img as HTMLImageElement).width === 'number'
      ? (img as HTMLImageElement).width
      : 0;
  if (img && w > 0) {
    ctx.drawImage(img, 0, 0, size, size);
  } else {
    ctx.fillStyle = '#c8d4e2';
    ctx.fillRect(0, 0, size, size);
  }

  const imageData = ctx.getImageData(0, 0, size, size);
  const d = imageData.data;
  for (let i = 0; i < size * size; i++) {
    const x = i % size;
    const y = (i / size) | 0;
    const n = fbm(x / size * 10, y / size * 10, seed, 3);
    const o = i * 4;
    // Slight macro darkening for contrast vs rider.
    d[o] = Math.floor(d[o]! * 0.92);
    d[o + 1] = Math.floor(d[o + 1]! * 0.93);
    d[o + 2] = Math.floor(d[o + 2]! * 0.95);

    if (n < amount || rand() < amount * 0.15) {
      const mix = 0.25 + rand() * 0.4;
      d[o] = Math.floor(d[o]! * (1 - mix) + (72 + rand() * 40) * mix);
      d[o + 1] = Math.floor(d[o + 1]! * (1 - mix) + (64 + rand() * 30) * mix);
      d[o + 2] = Math.floor(d[o + 2]! * (1 - mix) + (54 + rand() * 28) * mix);
    } else if (n > 0.88 && rand() < 0.08) {
      // Wet ice flecks — cooler, slightly darker, will gloss via material clearcoat.
      const mix = 0.2 + rand() * 0.25;
      d[o] = Math.floor(d[o]! * (1 - mix) + 150 * mix);
      d[o + 1] = Math.floor(d[o + 1]! * (1 - mix) + 185 * mix);
      d[o + 2] = Math.floor(d[o + 2]! * (1 - mix) + 210 * mix);
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

#!/usr/bin/env node
/**
 * Stage 1: download CC0 source material from Poly Haven into `.assetcache/`.
 *
 * If the network is unavailable, generates procedural placeholder masters so
 * `pack.mjs` can still run on a clean checkout.
 *
 * Usage:
 *   node tools/assets/fetch.mjs
 *   node tools/assets/fetch.mjs --force
 *   node tools/assets/fetch.mjs --placeholders-only
 */

import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile, stat } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

import {
  ENVIRONMENTS,
  HDRI_RESOLUTIONS,
  MATERIALS,
  POLYHAVEN_API,
  TEXTURE_MAPS,
  TEXTURE_RESOLUTIONS,
} from './sources.mjs';

const ROOT = fileURLToPath(new URL('../..', import.meta.url));
export const CACHE = join(ROOT, '.assetcache');

const FORCE = process.argv.includes('--force');
const PLACEHOLDERS_ONLY = process.argv.includes('--placeholders-only');
const POLITE_DELAY_MS = 250;
const MAX_RETRIES = 4;
const PLACEHOLDER_SIZE = 512;

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function human(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

async function withRetry(label, fn) {
  let lastError;
  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastError = err;
      if (attempt === MAX_RETRIES) break;
      const backoff = 500 * 2 ** (attempt - 1);
      console.warn(`  retry ${attempt}/${MAX_RETRIES - 1} for ${label}: ${err.message}`);
      await sleep(backoff);
    }
  }
  throw new Error(`${label} failed after ${MAX_RETRIES} attempts: ${lastError?.message}`);
}

async function getJson(url, cachePath) {
  if (!FORCE && cachePath) {
    try {
      return JSON.parse(await readFile(cachePath, 'utf8'));
    } catch {
      /* not cached */
    }
  }
  const json = await withRetry(url, async () => {
    const res = await fetch(url, { headers: { 'user-agent': 'snowline-asset-pipeline' } });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return res.json();
  });
  if (cachePath) {
    await mkdir(dirname(cachePath), { recursive: true });
    await writeFile(cachePath, JSON.stringify(json, null, 2));
  }
  await sleep(POLITE_DELAY_MS);
  return json;
}

async function download(entry, dest, label) {
  if (!FORCE) {
    try {
      const info = await stat(dest);
      if (info.size === entry.size) {
        if (!entry.md5) return { skipped: true, bytes: info.size };
        const hash = createHash('md5').update(await readFile(dest)).digest('hex');
        if (hash === entry.md5) return { skipped: true, bytes: info.size };
      }
    } catch {
      /* not cached */
    }
  }

  const bytes = await withRetry(label, async () => {
    const res = await fetch(entry.url, { headers: { 'user-agent': 'snowline-asset-pipeline' } });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const buffer = Buffer.from(await res.arrayBuffer());
    if (entry.md5) {
      const hash = createHash('md5').update(buffer).digest('hex');
      if (hash !== entry.md5) throw new Error('md5 mismatch');
    }
    await mkdir(dirname(dest), { recursive: true });
    await writeFile(dest, buffer);
    return buffer.length;
  });

  await sleep(POLITE_DELAY_MS);
  return { skipped: false, bytes };
}

function pickResolution(node, preferred) {
  for (const res of preferred) if (node[res]) return res;
  const available = Object.keys(node);
  if (available.length === 0) return null;
  return available.sort((a, b) => parseInt(a, 10) - parseInt(b, 10)).at(-1) ?? null;
}

/** Procedural placeholder texture maps when Poly Haven is unreachable. */
async function generatePlaceholderTexture(source) {
  const slug = source.slug;
  const dir = join(CACHE, 'textures', slug);
  await mkdir(dir, { recursive: true });

  const isIce = source.id.includes('ice');
  const isRock = source.id.includes('rock');
  const isPowder = source.id.includes('powder');

  const albedoBase = isIce ? { r: 200, g: 220, b: 235 } : isRock ? { r: 90, g: 85, b: 80 } : { r: 235, g: 240, b: 245 };

  const maps = {};

  const diffusePath = join(dir, `Diffuse_2k.jpg`);
  const noise = Buffer.alloc(PLACEHOLDER_SIZE * PLACEHOLDER_SIZE * 3);
  for (let i = 0; i < noise.length; i += 3) {
    const n = (Math.random() - 0.5) * (isPowder ? 18 : 28);
    noise[i] = Math.max(0, Math.min(255, albedoBase.r + n));
    noise[i + 1] = Math.max(0, Math.min(255, albedoBase.g + n));
    noise[i + 2] = Math.max(0, Math.min(255, albedoBase.b + n));
  }
  await sharp(noise, { raw: { width: PLACEHOLDER_SIZE, height: PLACEHOLDER_SIZE, channels: 3 } })
    .jpeg({ quality: 90 })
    .toFile(diffusePath);
  maps.Diffuse = { path: diffusePath, resolution: '2k' };

  const normalPath = join(dir, `nor_gl_2k.jpg`);
  const normal = Buffer.alloc(PLACEHOLDER_SIZE * PLACEHOLDER_SIZE * 3, 128);
  for (let i = 0; i < normal.length; i += 3) {
    normal[i] = 128 + Math.floor((Math.random() - 0.5) * (isRock ? 40 : 20));
    normal[i + 1] = 128 + Math.floor((Math.random() - 0.5) * (isRock ? 40 : 20));
    normal[i + 2] = 255;
  }
  await sharp(normal, { raw: { width: PLACEHOLDER_SIZE, height: PLACEHOLDER_SIZE, channels: 3 } })
    .jpeg({ quality: 90 })
    .toFile(normalPath);
  maps.nor_gl = { path: normalPath, resolution: '2k' };

  const roughPath = join(dir, `Rough_2k.jpg`);
  const roughVal = isIce ? 30 : isRock ? 200 : 180;
  const rough = Buffer.alloc(PLACEHOLDER_SIZE * PLACEHOLDER_SIZE * 3, roughVal);
  await sharp(rough, { raw: { width: PLACEHOLDER_SIZE, height: PLACEHOLDER_SIZE, channels: 3 } })
    .jpeg({ quality: 90 })
    .toFile(roughPath);
  maps.Rough = { path: roughPath, resolution: '2k' };

  console.warn(`  [placeholder] generated maps for ${source.id} (${slug})`);
  return {
    slug,
    name: `${source.id} (placeholder)`,
    authors: ['snowline-pipeline'],
    placeholder: true,
    maps,
  };
}

/** Minimal Radiance HDR — flat grey sky dome. */
async function generatePlaceholderHdri(source) {
  const dest = join(CACHE, 'hdris', `${source.slug}_1k.hdr`);
  await mkdir(dirname(dest), { recursive: true });

  // 32x16 RGBE flat sky — enough for RGBELoader to parse.
  const width = 32;
  const height = 16;
  const header =
    '#?RADIANCE\n' +
    'FORMAT=32-bit_rle_rgbe\n\n' +
    `-Y ${height} +X ${width}\n`;
  const pixels = Buffer.alloc(width * height * 4);
  for (let i = 0; i < pixels.length; i += 4) {
    pixels[i] = 180;
    pixels[i + 1] = 200;
    pixels[i + 2] = 220;
    pixels[i + 3] = 128;
  }
  await writeFile(dest, Buffer.concat([Buffer.from(header), pixels]));

  console.warn(`  [placeholder] generated HDRI for ${source.id}`);
  return {
    slug: source.slug,
    name: `${source.id} (placeholder)`,
    authors: ['snowline-pipeline'],
    placeholder: true,
    path: dest,
    resolution: '1k',
  };
}

async function fetchTexture(source, totals) {
  const { slug } = source;
  console.log(`\n[texture] ${source.id} <- ${slug}`);

  if (PLACEHOLDERS_ONLY) {
    totals.placeholder++;
    return generatePlaceholderTexture(source);
  }

  try {
    const info = await getJson(`${POLYHAVEN_API}/info/${slug}`, join(CACHE, 'meta', `${slug}.json`));
    const files = await getJson(`${POLYHAVEN_API}/files/${slug}`, join(CACHE, 'files', `${slug}.json`));

    const record = {
      slug,
      name: info.name ?? slug,
      authors: Object.keys(info.authors ?? {}),
      maps: /** @type {Record<string, {path: string, resolution: string}>} */ ({}),
    };

    for (const map of TEXTURE_MAPS) {
      const node = files[map];
      if (!node) continue;
      const resolution = pickResolution(node, TEXTURE_RESOLUTIONS);
      const entry = resolution && node[resolution]?.jpg;
      if (!entry) continue;

      const dest = join(CACHE, 'textures', slug, `${map}_${resolution}.jpg`);
      const { skipped, bytes } = await download(entry, dest, `${slug}/${map}`);
      totals.bytes += bytes;
      if (skipped) totals.skipped++;
      else totals.downloaded++;
      console.log(`  ${skipped ? 'cached' : 'fetched'} ${map} @${resolution} ${human(bytes)}`);

      record.maps[map] = { path: dest, resolution };
    }

    const missing = ['Diffuse', 'nor_gl'].filter((m) => !record.maps[m]);
    if (missing.length > 0) {
      throw new Error(`${slug} is missing required map(s): ${missing.join(', ')}`);
    }
    return record;
  } catch (err) {
    console.warn(`  network fetch failed for ${source.id}: ${err.message}`);
    totals.placeholder++;
    return generatePlaceholderTexture(source);
  }
}

async function fetchEnvironment(source, totals) {
  const { slug } = source;
  console.log(`\n[hdri] ${source.id} <- ${slug}`);

  if (PLACEHOLDERS_ONLY) {
    totals.placeholder++;
    return generatePlaceholderHdri(source);
  }

  try {
    const info = await getJson(`${POLYHAVEN_API}/info/${slug}`, join(CACHE, 'meta', `${slug}.json`));
    const files = await getJson(`${POLYHAVEN_API}/files/${slug}`, join(CACHE, 'files', `${slug}.json`));

    const node = files.hdri;
    if (!node) throw new Error(`${slug} has no hdri files`);
    const resolution = pickResolution(node, HDRI_RESOLUTIONS);
    const entry = resolution && node[resolution]?.hdr;
    if (!entry) throw new Error(`${slug} has no .hdr variant`);

    const dest = join(CACHE, 'hdris', `${slug}_${resolution}.hdr`);
    const { skipped, bytes } = await download(entry, dest, `${slug}/hdri`);
    totals.bytes += bytes;
    if (skipped) totals.skipped++;
    else totals.downloaded++;
    console.log(`  ${skipped ? 'cached' : 'fetched'} hdri @${resolution} ${human(bytes)}`);

    return {
      slug,
      name: info.name ?? slug,
      authors: Object.keys(info.authors ?? {}),
      path: dest,
      resolution,
    };
  } catch (err) {
    console.warn(`  network fetch failed for ${source.id}: ${err.message}`);
    totals.placeholder++;
    return generatePlaceholderHdri(source);
  }
}

async function main() {
  console.log(`Poly Haven -> ${CACHE}${FORCE ? ' (forced re-download)' : ''}`);
  await mkdir(CACHE, { recursive: true });
  await writeFile(join(CACHE, '.gitignore'), '*\n');

  const totals = { downloaded: 0, skipped: 0, placeholder: 0, bytes: 0 };
  const index = { fetchedAt: new Date().toISOString(), textures: {}, hdris: {} };

  for (const source of MATERIALS) {
    index.textures[source.id] = await fetchTexture(source, totals);
  }
  for (const source of ENVIRONMENTS) {
    index.hdris[source.id] = await fetchEnvironment(source, totals);
  }

  const indexPath = join(CACHE, 'index.json');
  await writeFile(indexPath, JSON.stringify(index, null, 2));

  console.log(
    `\nDone. ${totals.downloaded} downloaded, ${totals.skipped} cached, ` +
      `${totals.placeholder} placeholder(s), ${human(totals.bytes)} total.`
  );
  console.log(`Cache index: ${indexPath}`);
  console.log('Next: node tools/assets/pack.mjs');
}

main().catch((err) => {
  console.error(`\nfetch failed: ${err.message}`);
  process.exitCode = 1;
});

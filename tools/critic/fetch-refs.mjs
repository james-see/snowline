#!/usr/bin/env node
/**
 * Fetch snowboard critic reference images into refs/snowboard/images/.
 * Usage: node tools/critic/fetch-refs.mjs [--force]
 */

import { createWriteStream } from 'node:fs';
import { mkdir, readFile, access } from 'node:fs/promises';
import { constants } from 'node:fs';
import path from 'node:path';
import { pipeline } from 'node:stream/promises';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const MANIFEST = path.join(ROOT, 'refs/snowboard/manifest.json');
const force = process.argv.includes('--force');

async function exists(p) {
  try {
    await access(p, constants.F_OK);
    return true;
  } catch {
    return false;
  }
}

async function download(url, dest) {
  const res = await fetch(url, {
    headers: {
      'User-Agent': 'SnowlineCriticRefs/1.0 (local QA; +https://github.com/)',
      Accept: 'image/*,*/*',
    },
    redirect: 'follow',
  });
  if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
  await mkdir(path.dirname(dest), { recursive: true });
  await pipeline(res.body, createWriteStream(dest));
}

async function main() {
  const manifest = JSON.parse(await readFile(MANIFEST, 'utf8'));
  let ok = 0;
  let skip = 0;
  let fail = 0;

  for (const ref of manifest.refs) {
    const dest = path.join(ROOT, 'refs/snowboard', ref.file);
    if (!force && (await exists(dest))) {
      console.log(`  skip  ${ref.id} (exists)`);
      skip++;
      continue;
    }
    if (!ref.url) {
      if (ref.optional) {
        console.log(`  skip  ${ref.id} (no url — optional manual drop)`);
        skip++;
        continue;
      }
      fail++;
      console.log(`  fail  ${ref.id} (missing url)`);
      continue;
    }
    process.stdout.write(`  fetch ${ref.id} … `);
    try {
      await download(ref.url, dest);
      console.log('ok');
      ok++;
    } catch (err) {
      fail++;
      console.log(`FAIL (${err.message})`);
      if (!ref.optional) {
        console.log(`         drop manually → ${path.relative(ROOT, dest)}`);
      }
    }
  }

  console.log(`\ndone: ${ok} fetched, ${skip} skipped, ${fail} failed`);
  console.log('critic will include any files present under refs/snowboard/images/');
  if (fail > 0) process.exitCode = 2;
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

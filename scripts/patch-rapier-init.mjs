#!/usr/bin/env node
/**
 * Rapier 0.19.3 compat `init()` passes a bare ArrayBuffer into wasm-bindgen's
 * loader, which warns: pass `{ module_or_path }` instead. Patch until upstream
 * ships a fixed compat bundle.
 */
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);

function patchFile(filePath) {
  if (!existsSync(filePath)) return false;
  const src = readFileSync(filePath, 'utf8');
  if (src.includes('{module_or_path:Lg.toByteArray(')) return false;

  // Compat init: yield xA(Lg.toByteArray("...").buffer)
  const open = 'yield xA(Lg.toByteArray(';
  const start = src.indexOf(open);
  if (start < 0) return false;

  const afterOpen = start + open.length;
  if (src[afterOpen] !== '"') return false;

  const endQuote = src.indexOf('"', afterOpen + 1);
  if (endQuote < 0) return false;

  const tail = ').buffer)';
  if (src.slice(endQuote + 1, endQuote + 1 + tail.length) !== tail) {
    // Fallback: bare Uint8Array form without .buffer
    if (src.slice(endQuote + 1, endQuote + 3) === '))') {
      const next =
        src.slice(0, start) +
        'yield xA({module_or_path:Lg.toByteArray(' +
        src.slice(afterOpen, endQuote + 1) +
        '})' +
        src.slice(endQuote + 2);
      writeFileSync(filePath, next);
      return true;
    }
    return false;
  }

  const next =
    src.slice(0, start) +
    'yield xA({module_or_path:Lg.toByteArray(' +
    src.slice(afterOpen, endQuote + 1) +
    ').buffer})' +
    src.slice(endQuote + 1 + tail.length);
  writeFileSync(filePath, next);
  return true;
}

let pkgRoot;
try {
  pkgRoot = dirname(require.resolve('@dimforge/rapier3d-compat'));
} catch {
  process.exit(0);
}

const targets = ['rapier.mjs', 'rapier.cjs'].map((name) => join(pkgRoot, name));
let patched = 0;
for (const target of targets) {
  if (patchFile(target)) {
    process.stdout.write(`patched rapier init object form: ${target}\n`);
    patched += 1;
  }
}
if (patched === 0) {
  // Still ok — already patched or unexpected bundle shape.
  process.exit(0);
}

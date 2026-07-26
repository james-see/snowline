#!/usr/bin/env node
/**
 * Capture smoke gate.
 *
 * Captures `course_start` (or analyses an existing PNG) and fails if the
 * frame is near-uniform blank sky — the critical washed-out gameplay defect.
 *
 * Usage:
 *   node tools/critic/smoke.mjs
 *   node tools/critic/smoke.mjs --file captures/latest/course_start.png
 *   npm run smoke
 */

import path from 'node:path';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { capture } from './capture.mjs';
import { detectBlankFrame } from './blank-frame.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

function parseArgs(argv) {
  const args = { file: null, shot: 'course_start', out: null };
  for (let i = 2; i < argv.length; i++) {
    if (argv[i] === '--file') args.file = path.resolve(argv[++i]);
    else if (argv[i] === '--shot') args.shot = argv[++i];
    else if (argv[i] === '--out') args.out = path.resolve(argv[++i]);
  }
  return args;
}

async function main() {
  const args = parseArgs(process.argv);
  let file = args.file;

  if (!file) {
    if (!existsSync(path.join(ROOT, 'node_modules'))) {
      console.error('run npm install first');
      process.exit(1);
    }
    const outDir =
      args.out ?? path.join(ROOT, 'captures', `_smoke-${process.pid}`);
    process.stdout.write(`smoke: capturing ${args.shot} -> ${path.relative(ROOT, outDir)}\n`);
    const { results } = await capture({
      out: outDir,
      shot: args.shot,
      actions: false,
      label: 'smoke',
      verify: true,
    });
    const hit = results.find((r) => r.id === args.shot);
    if (!hit) {
      console.error(`smoke FAIL: shot "${args.shot}" was not captured`);
      process.exit(1);
    }
    file = hit.file;
  }

  if (!existsSync(file)) {
    console.error(`smoke FAIL: file not found: ${file}`);
    process.exit(1);
  }

  const result = await detectBlankFrame(file);
  process.stdout.write(
    `smoke: ${path.basename(file)}  mean=${result.mean}  stddev=${result.stddev}  ` +
      `range=${result.range}  ${result.width}x${result.height}\n`
  );

  if (result.blank) {
    process.stdout.write(`smoke FAIL: blank / near-uniform frame — ${result.reason}\n`);
    process.exit(1);
  }

  process.stdout.write('smoke PASS: course frame has readable contrast\n');
}

main().catch((err) => {
  console.error(`smoke failed: ${err.message}`);
  process.exit(1);
});

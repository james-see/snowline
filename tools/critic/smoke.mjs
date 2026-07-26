#!/usr/bin/env node
/**
 * Capture smoke gate.
 *
 * Captures a gameplay shot (default `course_start`) and fails if the frame is
 * blank / washed — mean luma too high or luminance variance too low.
 *
 * Usage:
 *   npm run smoke
 *   npm run smoke -- --shot forest
 *   npm run smoke -- --shot carve
 *   npm run smoke -- --file captures/latest/course_start.png
 *   node tools/critic/smoke.mjs --help
 */

import path from 'node:path';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { capture, GATE_SHOT_IDS } from './capture.mjs';
import { detectBlankFrame } from './blank-frame.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

function printHelp() {
  process.stdout.write(`smoke — capture + blank/washed-frame gate

Usage:
  npm run smoke
  npm run smoke -- --shot forest
  npm run smoke -- --shot carve
  npm run smoke -- --file captures/latest/course_start.png

Gate shots: ${GATE_SHOT_IDS.join(', ')}
`);
}

function parseArgs(argv) {
  const args = { file: null, shot: 'course_start', out: null, help: false };
  for (let i = 2; i < argv.length; i++) {
    if (argv[i] === '--file') args.file = path.resolve(argv[++i]);
    else if (argv[i] === '--shot') args.shot = argv[++i];
    else if (argv[i] === '--out') args.out = path.resolve(argv[++i]);
    else if (argv[i] === '--help' || argv[i] === '-h') args.help = true;
  }
  return args;
}

async function main() {
  const args = parseArgs(process.argv);
  if (args.help) {
    printHelp();
    process.exit(0);
  }

  let file = args.file;

  if (!file) {
    if (!existsSync(path.join(ROOT, 'node_modules'))) {
      console.error('run npm install first');
      process.exit(1);
    }
    const outDir = args.out ?? path.join(ROOT, 'captures', `_smoke-${process.pid}`);
    process.stdout.write(`smoke: capturing ${args.shot} -> ${path.relative(ROOT, outDir)}\n`);
    // capture() already blank-checks; we re-analyse for a clear smoke report.
    const { results } = await capture({
      out: outDir,
      shot: args.shot,
      actions: args.shot === 'carve' || args.shot === 'forest_run' ? true : false,
      label: 'smoke',
      verify: true,
      blankCheck: true,
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
      `variance=${result.variance}  range=${result.range}  ${result.width}x${result.height}\n`
  );

  if (result.blank) {
    process.stdout.write(`smoke FAIL: blank / washed frame — ${result.reason}\n`);
    process.exit(1);
  }

  process.stdout.write('smoke PASS: frame has readable contrast\n');
}

main().catch((err) => {
  console.error(`smoke failed: ${err.message}`);
  process.exit(1);
});

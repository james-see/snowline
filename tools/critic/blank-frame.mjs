/**
 * Blank-sky / washed-frame detector.
 *
 * Fails fast when a capture is unusable for critic review:
 *   - mean luminance too high (blown-out / sky wash), OR
 *   - luminance variance too low (flat gradient / near-uniform)
 *
 * Uses sharp for luminance stats — no GPU required at analysis time.
 *
 * CLI:
 *   node tools/critic/blank-frame.mjs <png> [<png>...]
 *   npm run smoke -- --file captures/latest/course_start.png
 */

import sharp from 'sharp';
import { existsSync } from 'node:fs';
import path from 'node:path';

/** Default thresholds tuned against washed alpine sky vs readable mountain frames. */
export const BLANK_THRESHOLDS = {
  /**
   * Max luminance stddev (0–255). At or below → low-variance / flat gradient.
   * Independent fail path (does not require high mean).
   */
  maxStddev: 14,
  /**
   * Max luminance variance (stddev²). At or below → low-variance fail.
   * Kept in sync with maxStddev (14² = 196); either trip fails.
   */
  maxVariance: 196,
  /**
   * Absolute mean luminance (0–255). At or above → blown-out wash.
   * Independent fail path (does not require low variance).
   */
  maxMean: 210,
  /**
   * Soft bright-wash band: mean ≥ brightMean AND stddev ≤ brightMaxStddev.
   * Catches sky-dominated frames that are bright but not fully white.
   */
  brightMean: 155,
  brightMaxStddev: 22,
  /** Diagnostic: max − min range often collapses with flat gradients. */
  maxRange: 40,
};

/**
 * Softer floors for UI-only plates (title/results/pause/…) that intentionally
 * sit on flat gradients with sparse high-contrast chrome. Still rejects
 * near-uniform empties (σ≲6) and blown-out wash.
 */
export const UI_BLANK_THRESHOLDS = {
  maxStddev: 6,
  maxVariance: 36,
  maxMean: 210,
  brightMean: 180,
  brightMaxStddev: 14,
  maxRange: 40,
};

/** Scene presets that are menus / overlays, not gameplay mountain frames. */
export const UI_SHOT_IDS = new Set([
  'title',
  'course_select',
  'pause',
  'results',
  'settings',
]);

/**
 * Analyse a PNG (path or Buffer) and return luminance statistics.
 * @param {string | Buffer} input
 */
export async function analyzeFrame(input) {
  const { data, info } = await sharp(input)
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });

  const channels = info.channels;
  const pixels = info.width * info.height;
  if (pixels === 0) {
    return {
      width: info.width,
      height: info.height,
      mean: 0,
      variance: 0,
      stddev: 0,
      min: 0,
      max: 0,
      range: 0,
      nearUniform: true,
      reason: 'empty image',
    };
  }

  let sum = 0;
  let sumSq = 0;
  let min = 255;
  let max = 0;

  for (let i = 0; i < data.length; i += channels) {
    const y = 0.2126 * data[i] + 0.7152 * data[i + 1] + 0.0722 * data[i + 2];
    sum += y;
    sumSq += y * y;
    if (y < min) min = y;
    if (y > max) max = y;
  }

  const mean = sum / pixels;
  const variance = Math.max(0, sumSq / pixels - mean * mean);
  const stddev = Math.sqrt(variance);
  const range = max - min;

  return {
    width: info.width,
    height: info.height,
    mean: +mean.toFixed(3),
    variance: +variance.toFixed(3),
    stddev: +stddev.toFixed(3),
    min: +min.toFixed(3),
    max: +max.toFixed(3),
    range: +range.toFixed(3),
    nearUniform: false,
    reason: null,
  };
}

/**
 * True when the frame looks blank / washed (unusable gameplay capture).
 * Fail paths are independent ORs: high mean OR low variance (plus soft wash).
 *
 * @param {Awaited<ReturnType<typeof analyzeFrame>>} stats
 * @param {Partial<typeof BLANK_THRESHOLDS>} [thresholds]
 */
export function isNearUniform(stats, thresholds = {}) {
  if (stats.nearUniform && stats.reason === 'empty image') {
    return { blank: true, reason: stats.reason };
  }

  const t = { ...BLANK_THRESHOLDS, ...thresholds };
  const variance =
    typeof stats.variance === 'number' ? stats.variance : stats.stddev * stats.stddev;

  // OR path 1: variance / stddev too low (flat gradient, old blank sky plates).
  if (stats.stddev <= t.maxStddev || variance <= t.maxVariance) {
    return {
      blank: true,
      reason:
        `low variance (stddev ${stats.stddev} ≤ ${t.maxStddev} or ` +
        `variance ${variance.toFixed(3)} ≤ ${t.maxVariance})`,
    };
  }

  // OR path 2: mean luma too high (blown-out wash).
  if (stats.mean >= t.maxMean) {
    return {
      blank: true,
      reason: `mean luma too high (mean ${stats.mean} ≥ ${t.maxMean})`,
    };
  }

  // Soft bright-wash: bright + relatively flat (sky-dominated blanks).
  if (stats.mean >= t.brightMean && stats.stddev <= t.brightMaxStddev) {
    return {
      blank: true,
      reason:
        `bright wash (mean ${stats.mean} ≥ ${t.brightMean}, ` +
        `stddev ${stats.stddev} ≤ ${t.brightMaxStddev})`,
    };
  }

  return { blank: false, reason: null };
}

/**
 * Analyse a PNG and return whether it fails the blank / washed-frame check.
 * @param {string | Buffer} input
 * @param {Partial<typeof BLANK_THRESHOLDS>} [thresholds]
 */
export async function detectBlankFrame(input, thresholds) {
  const stats = await analyzeFrame(input);
  const verdict = isNearUniform(stats, thresholds);
  return { ...stats, ...verdict };
}

function printHelp() {
  process.stdout.write(`blank-frame — detect washed / near-uniform capture PNGs

Usage:
  node tools/critic/blank-frame.mjs <png> [<png>...]
  npm run smoke                              # capture course_start + blank-check
  npm run smoke -- --shot forest             # blank-check a specific shot
  npm run smoke -- --file path/to/shot.png   # analyse existing PNG
  npm run capture -- --shot course_start     # capture (blank-check on by default)

Exit 0 = all frames pass; exit 1 = at least one blank/washed frame.
`);
}

async function main(argv) {
  if (argv.includes('--help') || argv.includes('-h') || argv.length <= 2) {
    printHelp();
    process.exit(argv.length <= 2 ? 2 : 0);
  }

  let failed = 0;
  for (let i = 2; i < argv.length; i++) {
    const file = path.resolve(argv[i]);
    if (!existsSync(file)) {
      process.stderr.write(`blank-frame FAIL: not found ${file}\n`);
      failed++;
      continue;
    }
    const result = await detectBlankFrame(file);
    const tag = result.blank ? 'FAIL' : 'PASS';
    process.stdout.write(
      `${tag} ${path.basename(file)}  mean=${result.mean}  stddev=${result.stddev}  ` +
        `variance=${result.variance}  range=${result.range}` +
        (result.reason ? `  — ${result.reason}` : '') +
        '\n'
    );
    if (result.blank) failed++;
  }
  process.exit(failed > 0 ? 1 : 0);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main(process.argv).catch((err) => {
    console.error(`blank-frame failed: ${err.message}`);
    process.exit(1);
  });
}

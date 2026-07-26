/**
 * Blank-sky / near-uniform frame detector.
 *
 * Gameplay captures that wash out to flat sky fail the capture smoke gate.
 * Uses sharp for luminance stats — no GPU required at analysis time.
 */

import sharp from 'sharp';

/** Default thresholds tuned against washed-out Alpine sky vs real mountain frames. */
export const BLANK_THRESHOLDS = {
  /** Max luminance stddev (0–255) before a frame is considered near-uniform. */
  maxStddev: 14,
  /** Max luminance range (max − min) for near-uniform classification. */
  maxRange: 40,
  /** Min mean luminance for the "bright wash" path (sky-dominated blanks). */
  brightMean: 160,
  /** Stricter stddev when the frame is mostly bright. */
  brightMaxStddev: 18,
};

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
    stddev: +stddev.toFixed(3),
    min: +min.toFixed(3),
    max: +max.toFixed(3),
    range: +range.toFixed(3),
    nearUniform: false,
    reason: null,
  };
}

/**
 * True when the frame looks like blank / washed sky.
 * @param {Awaited<ReturnType<typeof analyzeFrame>>} stats
 * @param {Partial<typeof BLANK_THRESHOLDS>} [thresholds]
 */
export function isNearUniform(stats, thresholds = {}) {
  if (stats.nearUniform && stats.reason === 'empty image') {
    return { blank: true, reason: stats.reason };
  }

  const t = { ...BLANK_THRESHOLDS, ...thresholds };

  if (stats.stddev <= t.maxStddev && stats.range <= t.maxRange) {
    return {
      blank: true,
      reason: `near-uniform (stddev ${stats.stddev} ≤ ${t.maxStddev}, range ${stats.range} ≤ ${t.maxRange})`,
    };
  }

  if (stats.mean >= t.brightMean && stats.stddev <= t.brightMaxStddev) {
    return {
      blank: true,
      reason: `bright wash (mean ${stats.mean} ≥ ${t.brightMean}, stddev ${stats.stddev} ≤ ${t.brightMaxStddev})`,
    };
  }

  return { blank: false, reason: null };
}

/**
 * Analyse a PNG and return whether it fails the blank-sky smoke check.
 * @param {string | Buffer} input
 * @param {Partial<typeof BLANK_THRESHOLDS>} [thresholds]
 */
export async function detectBlankFrame(input, thresholds) {
  const stats = await analyzeFrame(input);
  const verdict = isNearUniform(stats, thresholds);
  return { ...stats, ...verdict };
}

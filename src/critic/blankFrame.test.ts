import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import sharp from 'sharp';
import { detectBlankFrame, isNearUniform } from '../../tools/critic/blank-frame.mjs';

async function solidPng(r: number, g: number, b: number, size = 64): Promise<Buffer> {
  return sharp({
    create: {
      width: size,
      height: size,
      channels: 3,
      background: { r, g, b },
    },
  })
    .png()
    .toBuffer();
}

async function noisyPng(size = 128): Promise<Buffer> {
  const buf = Buffer.alloc(size * size * 3);
  for (let i = 0; i < buf.length; i += 3) {
    const x = (i / 3) % size;
    const y = Math.floor(i / 3 / size);
    buf[i] = (x * 3 + y * 7) % 256;
    buf[i + 1] = (x * 11 + y * 5) % 180;
    buf[i + 2] = (x * 2 + y * 13) % 220;
  }
  return sharp(buf, { raw: { width: size, height: size, channels: 3 } })
    .png()
    .toBuffer();
}

/** Soft gradient: low variance, mid mean — the old blank sky plate pattern. */
async function gradientPng(size = 128): Promise<Buffer> {
  const buf = Buffer.alloc(size * size * 3);
  for (let i = 0; i < buf.length; i += 3) {
    const y = Math.floor(i / 3 / size);
    const v = 180 + Math.floor((y / size) * 20);
    buf[i] = v;
    buf[i + 1] = v + 5;
    buf[i + 2] = v + 12;
  }
  return sharp(buf, { raw: { width: size, height: size, channels: 3 } })
    .png()
    .toBuffer();
}

describe('blank-frame detector', () => {
  it('flags near-uniform bright sky wash via low variance', async () => {
    const png = await solidPng(210, 225, 240);
    const result = await detectBlankFrame(png);
    assert.equal(result.blank, true);
    assert.ok(result.stddev < 1);
    assert.ok(result.variance < 1);
    assert.ok(result.reason);
  });

  it('flags soft blank gradients (low variance OR path)', async () => {
    const png = await gradientPng();
    const result = await detectBlankFrame(png);
    assert.equal(result.blank, true);
    assert.ok(/variance|wash/i.test(result.reason ?? ''));
  });

  it('flags blown-out mean luma even with moderate contrast', () => {
    const verdict = isNearUniform({
      width: 1,
      height: 1,
      mean: 220,
      variance: 900,
      stddev: 30,
      min: 190,
      max: 250,
      range: 60,
      nearUniform: false,
      reason: null,
    });
    assert.equal(verdict.blank, true);
    assert.ok(/mean luma/i.test(verdict.reason ?? ''));
  });

  it('passes a high-contrast mountain-like frame', async () => {
    const png = await noisyPng();
    const result = await detectBlankFrame(png);
    assert.equal(result.blank, false);
    assert.ok(result.stddev > 20);
  });

  it('isNearUniform respects bright-wash path', () => {
    const verdict = isNearUniform({
      width: 1,
      height: 1,
      mean: 180,
      variance: 400,
      stddev: 20,
      min: 160,
      max: 200,
      range: 40,
      nearUniform: false,
      reason: null,
    });
    assert.equal(verdict.blank, true);
  });
});

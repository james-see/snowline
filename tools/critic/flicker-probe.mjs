/**
 * Measures temporal stability of shadowed snow regions while the engine runs.
 *
 * Sampling happens in-page via readPixels on each presented frame, not via
 * Playwright screenshots, to avoid round-trip aliasing.
 */
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { startServer, launchBrowser, DEFAULTS } from './capture.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

const FRAMES = process.argv.includes('--frames')
  ? Number(process.argv[process.argv.indexOf('--frames') + 1])
  : 120;

const SETTLE_FRAMES = 300;

const CONDITIONS = [
  { id: 'baseline', settings: {} },
  { id: 'frozen-scene', settings: {}, freeze: true },
  { id: 'no-ssao', settings: { ssaoEnabled: false } },
  { id: 'no-taa', settings: { antialias: 'none' } },
  { id: 'no-autoexposure', settings: { autoExposureEnabled: false }, matchExposure: true },
  { id: 'no-motionblur', settings: { motionBlurEnabled: false } },
  { id: 'no-bloom', settings: { bloomEnabled: false } },
  { id: 'no-snow-sparkle', settings: { snowSparkleEnabled: false } },
];

function collectInPage({ frames, freeze, settleFrames }) {
  return new Promise((resolve) => {
    const engine = window.engine;
    const gl = engine.renderer.getContext();
    const canvas = engine.renderer.domElement;

    const w = 256;
    const h = 256;
    const x = Math.max(0, ((canvas.width - w) / 2) | 0);
    const y = Math.max(0, ((canvas.height - h) / 2) | 0);
    const buf = new Uint8Array(w * h * 4);

    const series = [];
    let mask = null;
    let count = 0;

    const previousScale = engine.time.scale;
    engine.time.scale = freeze ? 0 : 1;

    let settled = 0;

    const sample = () => {
      if (settled < settleFrames) {
        settled++;
        requestAnimationFrame(sample);
        return;
      }

      gl.readPixels(x, y, w, h, gl.RGBA, gl.UNSIGNED_BYTE, buf);

      if (mask === null) {
        mask = [];
        for (let i = 0; i < buf.length; i += 4) {
          const l = 0.2126 * buf[i] + 0.7152 * buf[i + 1] + 0.0722 * buf[i + 2];
          // Tree-line shadows and north-facing snow — darker than open groom.
          if (l < 100) mask.push(i);
        }
      }

      if (mask.length >= 200) {
        let sum = 0;
        for (const i of mask) {
          sum += 0.2126 * buf[i] + 0.7152 * buf[i + 1] + 0.0722 * buf[i + 2];
        }
        series.push(sum / mask.length);
      }

      if (++count < frames) {
        requestAnimationFrame(sample);
      } else {
        engine.time.scale = previousScale;
        resolve({ series, maskPixels: mask.length });
      }
    };

    requestAnimationFrame(sample);
  });
}

function dominantPeriod(series) {
  const n = series.length;
  const mean = series.reduce((a, b) => a + b, 0) / n;
  const centred = series.map((v) => v - mean);
  const total = centred.reduce((a, b) => a + b * b, 0);
  if (total === 0) return { periodFrames: 0, share: 0 };

  let best = { k: 0, power: 0 };
  for (let k = 1; k <= n / 2; k++) {
    let re = 0;
    let im = 0;
    for (let t = 0; t < n; t++) {
      const a = (-2 * Math.PI * k * t) / n;
      re += centred[t] * Math.cos(a);
      im += centred[t] * Math.sin(a);
    }
    const power = (re * re + im * im) / n;
    if (power > best.power) best = { k, power };
  }

  return {
    periodFrames: best.k === 0 ? 0 : +(n / best.k).toFixed(1),
    share: +(best.power / total).toFixed(3),
  };
}

function summarise(id, series, maskPixels) {
  if (series.length < 8) return { id, error: `only ${series.length} samples` };
  const mean = series.reduce((a, b) => a + b, 0) / series.length;
  const sd = Math.sqrt(series.reduce((a, b) => a + (b - mean) ** 2, 0) / series.length);
  const range = Math.max(...series) - Math.min(...series);
  const { periodFrames, share } = dominantPeriod(series);
  let jitter = 0;
  for (let i = 1; i < series.length; i++) jitter += Math.abs(series[i] - series[i - 1]);
  jitter /= series.length - 1;

  return {
    id,
    mean: +mean.toFixed(3),
    sd: +sd.toFixed(4),
    range: +range.toFixed(3),
    jitter: +jitter.toFixed(4),
    periodFrames,
    share,
    maskPixels,
  };
}

async function main() {
  const argv = process.argv;
  const shot = argv.includes('--shot') ? argv[argv.indexOf('--shot') + 1] : 'forest';

  const server = await startServer({});
  const browser = await launchBrowser();

  try {
    const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });

    const boot = async () => {
      await page.goto(`${server.url}/?capture=1&seed=${DEFAULTS.seed}&hud=0`, {
        waitUntil: 'domcontentloaded',
        timeout: DEFAULTS.timeoutMs,
      });
      await page.waitForFunction(() => window.__READY === true, null, {
        timeout: DEFAULTS.timeoutMs,
        polling: 100,
      });
      const hasEngine = await page.evaluate(() => typeof window.engine === 'object');
      if (!hasEngine) throw new Error('window.engine is not exposed; probe needs a dev build');
    };

    await boot();
    process.stdout.write(`flicker probe on "${shot}", ${FRAMES} frames per condition\n\n`);

    const rows = [];
    for (const condition of CONDITIONS) {
      await page.evaluate((id) => window.__snowline.setShot(id), shot);

      if (condition.matchExposure) {
        const settled = await page.evaluate(async (settleFrames) => {
          await new Promise((resolve) => {
            let n = 0;
            const tick = () => (++n < settleFrames ? requestAnimationFrame(tick) : resolve());
            requestAnimationFrame(tick);
          });
          return window.__snowlinePost?.exposure()?.exposure ?? null;
        }, SETTLE_FRAMES);

        if (settled === null) throw new Error('cannot read exposure; matched comparison impossible');
        await page.evaluate((v) => window.__snowlinePost.setManualExposure(v), settled);
        process.stdout.write(`  (matching fixed exposure to ${settled.toFixed(4)})\n`);
      }

      await page.evaluate((settings) => {
        for (const [k, v] of Object.entries(settings)) window.__snowline.setSetting(k, v);
      }, condition.settings);

      const { series, maskPixels } = await page.evaluate(collectInPage, {
        frames: FRAMES,
        freeze: condition.freeze === true,
        settleFrames: condition.matchExposure ? 0 : SETTLE_FRAMES,
      });
      const row = summarise(condition.id, series, maskPixels);
      rows.push(row);

      if (row.error) {
        process.stdout.write(`  ${row.id.padEnd(18)} skipped: ${row.error}\n`);
      } else {
        process.stdout.write(
          `  ${row.id.padEnd(18)} sd ${String(row.sd).padEnd(8)} jitter ${String(row.jitter).padEnd(8)}` +
            ` range ${String(row.range).padEnd(7)} period ${String(row.periodFrames).padStart(6)}f` +
            ` (${(row.share * 100).toFixed(0)}% of variance)\n`
        );
      }

      await boot();
    }

    const base = rows.find((r) => r.id === 'baseline');
    if (base && !base.error) {
      process.stdout.write('\n  reduction in frame-to-frame jitter versus baseline:\n');
      for (const r of rows) {
        if (r.id === 'baseline' || r.error) continue;
        const drop = ((1 - r.jitter / base.jitter) * 100).toFixed(0);
        process.stdout.write(`    ${r.id.padEnd(18)} ${String(drop).padStart(4)}%\n`);
      }
    }

    void ROOT;
  } finally {
    await browser.close();
    server.stop();
  }
}

main().catch((err) => {
  process.stderr.write(`${err.stack}\n`);
  process.exit(1);
});

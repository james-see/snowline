#!/usr/bin/env node
/**
 * Deterministic screenshot capture for Snowline.
 *
 * Boots the game in real Chrome (not bundled Chromium headless shell),
 * drives it through `window.__snowline`, and writes one PNG per scenario.
 *
 * Usage:
 *   node tools/critic/capture.mjs [--out <dir>] [--shot <id>] [--width 2560]
 *                                 [--height 1440] [--seed 24189] [--hud]
 *                                 [--build] [--label <name>] [--query k=v]
 */

import { chromium } from 'playwright';
import { spawn, spawnSync } from 'node:child_process';
import { mkdir, rm, symlink, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import net from 'node:net';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

/**
 * Macro → perform() action sequences for gameplay scenarios.
 * Keys are shot IDs; values map to CaptureBridge `#mapMacroActions` macros.
 */
export const ACTION_MACROS = {
  carve: {
    intent: 'gentle carve: edge spray, body lean, readable line',
    actions: ['carve'],
    frames: 36,
    settle: 8,
  },
  hard_carve: {
    intent: 'aggressive carve: deep edge, rooster tail spray, high g-force lean',
    actions: ['hard_carve'],
    frames: 40,
    settle: 6,
  },
  max_speed: {
    intent: 'top speed tuck: minimal drag, motion blur cues, stable cam',
    actions: ['boost', 'tuck'],
    frames: 60,
    settle: 10,
  },
  jump_takeoff: {
    intent: 'kicker takeoff: compression, pop, board leaving snow',
    actions: ['jump'],
    frames: 24,
    settle: 0,
  },
  midair_spin: {
    intent: '360 spin mid-air: clean rotation, readable board',
    actions: ['jump', 'spin_360'],
    frames: 48,
    settle: 0,
  },
  midair_flip: {
    intent: 'backflip mid-air: inverted pose, extension on recovery',
    actions: ['jump', 'flip_back'],
    frames: 52,
    settle: 0,
  },
  grab: {
    intent: 'indy/method grab: hand to board, stylish tuck',
    actions: ['jump', 'grab_indy'],
    frames: 44,
    settle: 0,
  },
  grind: {
    intent: 'rail/box grind: sparks or snow scrape, balanced slide',
    actions: ['grind'],
    frames: 50,
    settle: 4,
  },
  perfect_landing: {
    intent: 'clean landing: compression, spray, no tumble',
    actions: ['jump', 'spin_180', 'land_clean'],
    frames: 56,
    settle: 8,
  },
  failed_landing: {
    intent: 'sketchy landing: back seat, wobble, near-fall',
    actions: ['jump', 'land_sketchy'],
    frames: 48,
    settle: 6,
  },
  crash: {
    intent: 'wipeout: tumble, snow plume, board separation',
    actions: ['crash'],
    frames: 40,
    settle: 4,
  },
  boost: {
    intent: 'boost pad activation: speed lines, rider stretch',
    actions: ['boost_pad'],
    frames: 36,
    settle: 6,
  },
};

/** Static scene / UI presets that are not driven by perform() macros. */
export const SCENE_SHOT_IDS = [
  'title',
  'course_select',
  'course_start',
  'forest',
  'summit',
  'pause',
  'results',
  'settings',
];

/** Scenarios driven through perform() rather than static preset setup. */
export const ACTION_SHOTS = Object.entries(ACTION_MACROS).map(([id, macro]) => ({
  id,
  base: 'course_start',
  intent: macro.intent,
  actions: macro.actions,
  frames: macro.frames,
  settle: macro.settle,
}));

/** Full suite expected when capturing without --shot. */
export const REQUIRED_SHOT_IDS = [...SCENE_SHOT_IDS, ...ACTION_SHOTS.map((s) => s.id)];

const ACTION_SHOT_IDS = new Set(ACTION_SHOTS.map((s) => s.id));

export const DEFAULTS = {
  width: 2560,
  height: 1440,
  seed: 24189,
  convergeFrames: 32,
  timeoutMs: 90_000,
};

const DEFAULT_OUT = path.join(ROOT, 'captures', `run-${process.pid}`);

function parseArgs(argv) {
  const args = {
    out: DEFAULT_OUT,
    shot: null,
    width: DEFAULTS.width,
    height: DEFAULTS.height,
    seed: DEFAULTS.seed,
    hud: false,
    build: false,
    label: null,
    keepOpen: false,
    verify: true,
    query: [],
    actions: true,
  };
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--out') args.out = path.resolve(argv[++i]);
    else if (a === '--shot') args.shot = argv[++i];
    else if (a === '--width') args.width = Number(argv[++i]);
    else if (a === '--height') args.height = Number(argv[++i]);
    else if (a === '--seed') args.seed = Number(argv[++i]);
    else if (a === '--hud') args.hud = true;
    else if (a === '--build') args.build = true;
    else if (a === '--label') args.label = argv[++i];
    else if (a === '--keep-open') args.keepOpen = true;
    else if (a === '--no-verify') args.verify = false;
    else if (a === '--no-actions') args.actions = false;
    else if (a === '--query') {
      for (const pair of new URLSearchParams(String(argv[++i]))) {
        args.query.push(pair);
      }
    }
  }
  return args;
}

async function findFreePort(start) {
  const base = start ?? 5300 + Math.floor(Math.random() * 400);
  for (let port = base; port < base + 200; port++) {
    const free = await new Promise((resolve) => {
      const server = net.createServer();
      server.once('error', () => resolve(false));
      server.once('listening', () => server.close(() => resolve(true)));
      server.listen(port, '127.0.0.1');
    });
    if (free) return port;
  }
  throw new Error('no free port available');
}

export async function startServer(options = {}) {
  const attempts = options.attempts ?? 4;
  let lastError;
  for (let i = 0; i < attempts; i++) {
    try {
      return await startServerOnce(options);
    } catch (err) {
      lastError = err;
      if (!/already in use|EADDRINUSE/i.test(err.message)) throw err;
      await new Promise((r) => setTimeout(r, 300 + Math.random() * 700));
    }
  }
  throw lastError;
}

function reapOrphanSnapshots() {
  let entries;
  try {
    entries = fs.readdirSync(ROOT);
  } catch {
    return;
  }

  for (const name of entries) {
    const match = /^\.capture-snapshot-(\d+)$/.exec(name);
    if (!match) continue;

    const pid = Number(match[1]);
    if (pid === process.pid) continue;

    try {
      process.kill(pid, 0);
      continue;
    } catch (err) {
      if (err.code === 'EPERM') continue;
    }
    fs.rmSync(path.join(ROOT, name), { recursive: true, force: true });
  }
}

function makeSnapshot() {
  const dir = path.join(ROOT, `.capture-snapshot-${process.pid}`);
  reapOrphanSnapshots();
  fs.mkdirSync(dir, { recursive: true });

  const sources = ['src', 'public', 'index.html', 'vite.config.ts', 'tsconfig.json', 'package.json'];
  const result = spawnSync('rsync', ['-a', '--delete', ...sources, `${dir}/`], {
    cwd: ROOT,
    encoding: 'utf8',
  });
  if (result.status !== 0) {
    throw new Error(`snapshot failed: ${result.stderr || result.stdout}`);
  }

  const modules = path.join(dir, 'node_modules');
  if (!fs.existsSync(modules)) fs.symlinkSync(path.join(ROOT, 'node_modules'), modules, 'dir');

  return dir;
}

function verifySnapshot(dir) {
  const started = Date.now();
  const result = spawnSync('npx', ['tsc', '--noEmit', '-p', 'tsconfig.json'], {
    cwd: dir,
    encoding: 'utf8',
  });
  if (result.status === 0) return Date.now() - started;

  const errors = (result.stdout || result.stderr || '').trim().split('\n').slice(0, 8);
  throw new Error(
    'snapshot does not type-check, so it was captured mid-edit by another ' +
      'process. Re-run once the tree settles.\n\n' +
      errors.map((l) => `  ${l}`).join('\n')
  );
}

async function startServerOnce({ build = false, snapshot = true, verify = true } = {}) {
  const port = await findFreePort();
  const mode = build ? 'preview' : 'dev';
  const cwd = snapshot && !build ? makeSnapshot() : ROOT;

  if (cwd !== ROOT && verify) {
    const ms = verifySnapshot(cwd);
    process.stdout.write(`  snapshot verified in ${(ms / 1000).toFixed(1)}s\n`);
  }

  if (build) {
    await new Promise((resolve, reject) => {
      const proc = spawn('npx', ['vite', 'build'], { cwd: ROOT, stdio: 'inherit' });
      proc.on('exit', (code) => (code === 0 ? resolve() : reject(new Error('build failed'))));
    });
  }

  const args = build
    ? ['vite', 'preview', '--port', String(port), '--strictPort', '--host', '127.0.0.1']
    : ['vite', '--port', String(port), '--strictPort', '--host', '127.0.0.1'];

  const proc = spawn('npx', args, {
    cwd,
    stdio: ['ignore', 'pipe', 'pipe'],
    env: { ...process.env, NO_COLOR: '1', SNOWLINE_NO_HMR: '1' },
  });

  let log = '';
  proc.stdout.on('data', (d) => (log += d.toString()));
  proc.stderr.on('data', (d) => (log += d.toString()));

  const url = `http://127.0.0.1:${port}`;
  const deadline = Date.now() + 60_000;
  while (Date.now() < deadline) {
    if (proc.exitCode !== null) {
      throw new Error(`vite ${mode} exited early:\n${log}`);
    }
    try {
      const res = await fetch(url, { signal: AbortSignal.timeout(1500) });
      if (res.ok) {
        return {
          url,
          port,
          stop: () => {
            try {
              process.kill(-proc.pid, 'SIGTERM');
            } catch {
              proc.kill('SIGTERM');
            }
            if (cwd !== ROOT) fs.rmSync(cwd, { recursive: true, force: true });
          },
          get log() {
            return log;
          },
        };
      }
    } catch {
      /* not up yet */
    }
    await new Promise((r) => setTimeout(r, 250));
  }
  proc.kill('SIGTERM');
  throw new Error(`vite ${mode} did not start in time:\n${log}`);
}

export async function launchBrowser() {
  return chromium.launch({
    channel: 'chrome',
    args: [
      '--use-angle=metal',
      '--ignore-gpu-blocklist',
      '--enable-gpu-rasterization',
      '--enable-zero-copy',
      '--disable-features=CalculateNativeWinOcclusion',
      '--force-color-profile=srgb',
      '--hide-scrollbars',
      '--mute-audio',
    ],
  });
}

export async function capture(options = {}) {
  const opts = { ...parseArgs([]), ...options };
  const outDir = opts.out;

  await rm(outDir, { recursive: true, force: true });
  await mkdir(outDir, { recursive: true });

  const server = opts.server ?? (await startServer({ build: opts.build, verify: opts.verify }));
  const ownsServer = !opts.server;
  const browser = opts.browser ?? (await launchBrowser());
  const ownsBrowser = !opts.browser;

  const results = [];
  const consoleErrors = [];

  try {
    const page = await browser.newPage({
      viewport: { width: opts.width, height: opts.height },
      deviceScaleFactor: 1,
      colorScheme: 'dark',
    });

    page.on('console', (msg) => {
      if (msg.type() === 'error') consoleErrors.push(msg.text());
    });
    page.on('pageerror', (err) => consoleErrors.push(`pageerror: ${err.message}`));

    const cdp = await page.context().newCDPSession(page);
    await cdp.send('Page.bringToFront').catch(() => {});

    const withTimeout = (promise, ms, label) =>
      Promise.race([
        promise,
        new Promise((_, reject) =>
          setTimeout(() => reject(new Error(`${label} timed out after ${ms}ms`)), ms)
        ),
      ]);

    const query = new URLSearchParams({
      capture: '1',
      seed: String(opts.seed),
      hud: opts.hud ? '1' : '0',
    });
    for (const [key, value] of opts.query ?? []) query.set(key, value);
    const step = (msg) => process.stdout.write(`  [${new Date().toISOString().slice(11, 19)}] ${msg}\n`);

    step('navigating');
    await page.goto(`${server.url}/?${query}`, {
      waitUntil: 'domcontentloaded',
      timeout: DEFAULTS.timeoutMs,
    });

    step('waiting for __READY');
    try {
      await page.waitForFunction(() => window.__READY === true, null, {
        timeout: 45_000,
        polling: 100,
      });
    } catch {
      const diag = await page.evaluate(() => ({
        ready: window.__READY ?? null,
        api: typeof window.__snowline,
        status: document.getElementById('loader-status')?.textContent ?? null,
        error: document.getElementById('error-text')?.textContent ?? null,
      }));
      throw new Error(
        `__READY never became true.\n  diagnostics: ${JSON.stringify(diag, null, 2)}\n` +
          `  console: ${consoleErrors.slice(0, 5).join('\n           ') || '(none)'}`
      );
    }

    step('reading presets');
    const api = await page.evaluate(() => ({
      ready: typeof window.__snowline?.ready,
      presets: typeof window.__snowline?.presets,
      setShot: typeof window.__snowline?.setShot,
      perform: typeof window.__snowline?.perform,
      converge: typeof window.__snowline?.converge,
      hold: typeof window.__snowline?.hold,
      stats: typeof window.__snowline?.stats,
    }));
    for (const [key, kind] of Object.entries(api)) {
      if (kind !== 'function') {
        throw new Error(`window.__snowline.${key} missing (got ${kind})`);
      }
    }

    const presets = await page.evaluate(() => window.__snowline.presets());
    const presetIds = new Set(presets.map((p) => p.id));
    for (const id of SCENE_SHOT_IDS) {
      if (!presetIds.has(id)) {
        throw new Error(`required scene shot "${id}" missing from window.__snowline.presets()`);
      }
    }
    for (const id of ACTION_SHOT_IDS) {
      if (!presetIds.has(id) && !presetIds.has('course_start')) {
        throw new Error(`action shot "${id}" needs course_start base preset`);
      }
    }

    const actionShots =
      opts.actions === false
        ? []
        : ACTION_SHOTS.filter((c) => !opts.shot || c.id === opts.shot);

    // Prefer perform() macros over static presets when both share an id.
    let selected = opts.shot
      ? presets.filter((p) => p.id === opts.shot && !ACTION_SHOT_IDS.has(p.id))
      : presets.filter((p) => !ACTION_SHOT_IDS.has(p.id) || opts.actions === false);

    if (selected.length === 0 && actionShots.length === 0) {
      if (opts.shot && ACTION_SHOT_IDS.has(opts.shot) && opts.actions === false) {
        const fallback = presets.filter((p) => p.id === opts.shot);
        if (fallback.length === 0) {
          throw new Error(
            `no matching shot "${opts.shot}"; available: ${presets.map((p) => p.id).join(', ')}`
          );
        }
        selected.push(...fallback);
      } else if (!opts.shot) {
        throw new Error('no presets returned from window.__snowline.presets()');
      } else {
        throw new Error(
          `no matching shot "${opts.shot}"; available: ${[...presetIds].join(', ')}, ` +
            `actions: ${[...ACTION_SHOT_IDS].join(', ')}`
        );
      }
    }

    const jobs = [
      ...selected.map((preset) => ({ preset, act: null })),
      ...actionShots
        .filter((c) => presetIds.has(c.base) || opts.shot === c.id)
        .map((c) => {
          const basePreset = presets.find((p) => p.id === c.base) ?? {
            id: c.id,
            intent: c.intent,
          };
          return {
            preset: { ...basePreset, id: c.id, intent: c.intent },
            act: c,
          };
        }),
    ];

    if (jobs.length === 0) {
      throw new Error(`no capture jobs for shot "${opts.shot}"`);
    }

    if (jobs.length > 0) {
      step('warmup (discarded)');
      const warmId = jobs[0].act ? jobs[0].act.base : jobs[0].preset.id;
      await page.evaluate(async (id) => {
        await window.__snowline.setShot(id);
        window.__snowline.converge();
        window.__snowline.hold();
      }, warmId);
      await withTimeout(
        cdp.send('Page.captureScreenshot', { format: 'png', fromSurface: true }),
        30_000,
        'warmup screenshot'
      );
    }

    for (const { preset, act } of jobs) {
      step(`shot ${preset.id}`);
      await page.evaluate(async (id) => {
        await window.__snowline.setShot(id);
      }, act ? act.base : preset.id);

      if (act) {
        await page.evaluate(
          ({ actions, frames, settle }) => window.__snowline.perform(actions, frames, settle),
          act
        );
      }

      await page.evaluate((frames) => window.__snowline.converge(frames), DEFAULTS.convergeFrames);

      const stats = await page.evaluate(() => window.__snowline.stats());

      const held = await page.evaluate(() => window.__snowline.hold());
      if (!held.stable) {
        process.stdout.write(
          `    warning: ${preset.id} did not settle in ${held.frames} frames; ` +
            `this capture is not reproducible\n`
        );
      }

      await page.waitForTimeout(120);

      await page.evaluate(
        () => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)))
      );

      const file = path.join(outDir, `${preset.id}.png`);
      const { data } = await withTimeout(
        cdp.send('Page.captureScreenshot', {
          format: 'png',
          captureBeyondViewport: false,
          fromSurface: true,
        }),
        30_000,
        `screenshot "${preset.id}"`
      );
      await writeFile(file, Buffer.from(data, 'base64'));

      results.push({ ...preset, file, stats });
      process.stdout.write(
        `  captured ${preset.id.padEnd(20)} ${stats.mean.toFixed(2)}ms  ` +
          `${stats.calls} calls  ${(stats.triangles / 1000).toFixed(0)}k tris\n`
      );
    }

    if (!opts.shot) {
      const got = new Set(results.map((r) => r.id));
      const missing = REQUIRED_SHOT_IDS.filter((id) => !got.has(id));
      if (missing.length > 0) {
        throw new Error(`capture suite missing required shot(s): ${missing.join(', ')}`);
      }
    }

    const meta = {
      capturedAt: new Date().toISOString(),
      label: opts.label,
      seed: opts.seed,
      resolution: { width: opts.width, height: opts.height },
      requiredShotIds: REQUIRED_SHOT_IDS,
      actionMacros: Object.fromEntries(
        Object.entries(ACTION_MACROS).map(([id, m]) => [id, m.actions])
      ),
      gpu: await page.evaluate(() => {
        const gl = document.createElement('canvas').getContext('webgl2');
        const dbg = gl?.getExtension('WEBGL_debug_renderer_info');
        return dbg ? gl.getParameter(dbg.UNMASKED_RENDERER_WEBGL) : 'unknown';
      }),
      shots: results.map(({ file, ...rest }) => ({ ...rest, file: path.basename(file) })),
      consoleErrors,
    };
    await writeFile(path.join(outDir, 'meta.json'), JSON.stringify(meta, null, 2));

    if (outDir === DEFAULT_OUT) {
      const link = path.join(ROOT, 'captures', 'latest');
      await rm(link, { recursive: true, force: true });
      await symlink(outDir, link, 'dir');
    }

    if (consoleErrors.length > 0) {
      process.stdout.write(`\n  ${consoleErrors.length} console error(s):\n`);
      for (const e of consoleErrors.slice(0, 10)) process.stdout.write(`    ${e}\n`);
    }

    if (!opts.keepOpen) await page.close();
    return { outDir, meta, results };
  } finally {
    if (ownsBrowser) await browser.close();
    if (ownsServer) server.stop();
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const args = parseArgs(process.argv);
  if (!existsSync(path.join(ROOT, 'node_modules'))) {
    console.error('run npm install first');
    process.exit(1);
  }
  console.log(`capturing at ${args.width}x${args.height} -> ${path.relative(ROOT, args.out)}`);
  capture(args)
    .then(({ outDir, meta }) => {
      console.log(`\ndone: ${meta.shots.length} shot(s) in ${path.relative(ROOT, outDir)}`);
      console.log(`gpu: ${meta.gpu}`);
      process.exit(meta.consoleErrors.length > 0 ? 2 : 0);
    })
    .catch((err) => {
      console.error(`capture failed: ${err.message}`);
      process.exit(1);
    });
}

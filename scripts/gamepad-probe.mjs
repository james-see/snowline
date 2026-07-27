#!/usr/bin/env node
/**
 * Playwright probe: boot Snowline, dump window.__snowline.gamepadDebug().
 * Usage: node scripts/gamepad-probe.mjs [baseUrl]
 */
import { chromium } from 'playwright';

const base = process.argv[2] ?? 'http://127.0.0.1:5173/?capture=1';

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage();
try {
  await page.goto(base, { waitUntil: 'domcontentloaded', timeout: 60_000 });
  await page.waitForFunction(() => window.__READY === true, null, { timeout: 120_000 });
  // Give the Gamepad API a couple frames; press simulation isn't possible headless.
  await page.waitForTimeout(200);
  const dump = await page.evaluate(() => {
    const api = window.__snowline;
    if (!api?.gamepadDebug) return { error: 'gamepadDebug missing' };
    return api.gamepadDebug();
  });
  console.log(JSON.stringify(dump, null, 2));
} finally {
  await browser.close();
}

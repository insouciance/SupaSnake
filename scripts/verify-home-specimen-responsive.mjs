/**
 * Deterministic browser check for the Serpent Chamber's viewport contract.
 * Start a local dev server first; override HOME_SPECIMEN_BASE_URL when needed.
 */

import { mkdir } from 'node:fs/promises';
import path from 'node:path';
import { chromium } from 'playwright';

const BASE_URL = process.env.HOME_SPECIMEN_BASE_URL ?? 'http://127.0.0.1:3107';
const SCREENSHOT_DIR = process.env.HOME_SPECIMEN_SCREENSHOT_DIR;
const VIEWPORTS = [
  { name: 'compact', width: 320, height: 568 },
  { name: 'phone', width: 390, height: 844 },
  { name: 'desktop', width: 1440, height: 900 },
];

function invariant(condition, message) {
  if (!condition) throw new Error(message);
}

const browser = await chromium.launch({ headless: true });
let checks = 0;
try {
  for (const viewport of VIEWPORTS) {
    const context = await browser.newContext({
      viewport: { width: viewport.width, height: viewport.height },
      reducedMotion: 'reduce',
    });
    await context.addInitScript(() => {
      // Legal preference only; no player, economy, or progression state.
      localStorage.setItem('cookie-consent', JSON.stringify({
        essential: true,
        functional: false,
        analytics: false,
        marketing: false,
        timestamp: '2026-08-03T00:00:00.000Z',
      }));
    });
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', (error) => errors.push(error.message));
    await page.goto(`${BASE_URL}/`, { waitUntil: 'domcontentloaded', timeout: 120_000 });
    const stage = page.locator('[data-testid="home-specimen-full-stage"]');
    await stage.waitFor({ state: 'visible', timeout: 60_000 });
    const canvas = stage.locator('canvas');
    await canvas.waitFor({ state: 'visible', timeout: 60_000 });
    await page.waitForTimeout(250);

    const metrics = await page.evaluate(() => {
      const box = (element) => {
        const rect = element.getBoundingClientRect();
        return {
          x: rect.x,
          y: rect.y,
          width: rect.width,
          height: rect.height,
          right: rect.right,
          bottom: rect.bottom,
        };
      };
      const stageElement = document.querySelector('[data-testid="home-specimen-full-stage"]');
      const canvasElement = stageElement?.querySelector('canvas');
      if (!stageElement || !canvasElement) throw new Error('Home specimen stage or Canvas missing');
      return {
        stage: box(stageElement),
        canvas: box(canvasElement),
        pageOverflow: document.documentElement.scrollWidth > document.documentElement.clientWidth,
      };
    });

    invariant(errors.length === 0, `home/${viewport.name}: ${errors.join('; ')}`);
    for (const [surface, box] of Object.entries({ stage: metrics.stage, canvas: metrics.canvas })) {
      invariant(
        Math.abs(box.x) <= 0.5 && Math.abs(box.y) <= 0.5,
        `home/${viewport.name}: ${surface} is inset at ${box.x},${box.y}`
      );
      invariant(Math.abs(box.width - viewport.width) <= 0.5, `home/${viewport.name}: ${surface} width ${box.width}`);
      invariant(Math.abs(box.height - viewport.height) <= 0.5, `home/${viewport.name}: ${surface} height ${box.height}`);
    }
    invariant(!metrics.pageOverflow, `home/${viewport.name}: horizontal page overflow`);

    if (SCREENSHOT_DIR) {
      await mkdir(SCREENSHOT_DIR, { recursive: true });
      await page.screenshot({
        path: path.join(SCREENSHOT_DIR, `serpent-chamber-${viewport.name}.png`),
        fullPage: false,
      });
    }
    checks += 1;
    await context.close();
  }
  console.log(`PASS ${checks} Serpent Chamber viewport checks`);
} finally {
  await browser.close();
}

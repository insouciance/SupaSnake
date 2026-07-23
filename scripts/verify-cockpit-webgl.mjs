/**
 * Focused real-render audit for cockpit-v1 arena geometry.
 * Start the dev server before running this script.
 */

import { chromium } from 'playwright';

const BASE_URL = process.env.COCKPIT_BASE_URL ?? 'http://127.0.0.1:3107';
const CASES = [
  { width: 390, height: 844, dynasty: 'PRIMAL', state: 'portal' },
  { width: 844, height: 390, dynasty: 'CYBER', state: 'active' },
  { width: 1440, height: 900, dynasty: 'PRIMAL', state: 'portal' },
  { width: 2560, height: 1080, dynasty: 'COSMIC', state: 'apex' },
];

function invariant(condition, message) {
  if (!condition) throw new Error(message);
}

const browser = await chromium.launch({ headless: true });

async function measure(testCase, arena) {
  const { width, height, dynasty, state } = testCase;
  const context = await browser.newContext({
    viewport: { width, height },
    reducedMotion: 'reduce',
  });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.addInitScript(() => {
    localStorage.setItem(
      'cookie-consent',
      JSON.stringify({
        essential: true,
        functional: false,
        analytics: false,
        marketing: false,
        timestamp: '2026-07-23T00:00:00.000Z',
      })
    );
  });

  const query = new URLSearchParams({
    renderer: 'webgl',
    arena,
    dynasty,
    state,
    mode: 'anomaly',
    genes: '6',
    motion: 'reduced',
    effects: 'off',
  });
  await page.goto(`${BASE_URL}/dev/cockpit?${query}`, { waitUntil: 'domcontentloaded' });
  const host = page.locator('[data-testid="cockpit-webgl-board"]');
  await host.locator('canvas').waitFor({ state: 'visible' });
  await page.waitForFunction(() => {
    const element = document.querySelector('[data-testid="cockpit-webgl-board"]');
    return Number(element?.getAttribute('data-draw-calls')) > 0;
  });

  const result = await host.evaluate((element) => {
    const hostRect = element.getBoundingClientRect();
    const canvas = element.querySelector('canvas');
    const canvasRect = canvas?.getBoundingClientRect();
    return {
      drawCalls: Number(element.getAttribute('data-draw-calls')),
      triangles: Number(element.getAttribute('data-triangles')),
      host: { width: hostRect.width, height: hostRect.height },
      canvas: canvasRect
        ? { width: canvasRect.width, height: canvasRect.height }
        : null,
    };
  });
  await context.close();
  return { ...result, errors };
}

try {
  for (const testCase of CASES) {
    const released = await measure(testCase, 'released');
    const cockpit = await measure(testCase, 'cockpit');
    const label = `${testCase.width}x${testCase.height} ${testCase.dynasty}`;

    invariant(released.errors.length === 0, `${label}: released render error: ${released.errors.join('; ')}`);
    invariant(cockpit.errors.length === 0, `${label}: cockpit render error: ${cockpit.errors.join('; ')}`);
    invariant(cockpit.canvas !== null, `${label}: WebGL canvas missing`);
    invariant(Math.abs(cockpit.host.width - cockpit.host.height) < 1, `${label}: arena host is not square`);
    invariant(Math.abs(cockpit.canvas.width - cockpit.host.width) < 1, `${label}: canvas width does not fill host`);
    invariant(Math.abs(cockpit.canvas.height - cockpit.host.height) < 1, `${label}: canvas height does not fill host`);

    const callDelta = cockpit.drawCalls - released.drawCalls;
    invariant(callDelta <= 8, `${label}: cockpit adds ${callDelta} draw calls (budget 8)`);
    invariant(callDelta >= 0, `${label}: invalid negative draw-call comparison (${callDelta})`);
    invariant(cockpit.triangles > 0, `${label}: triangle telemetry missing`);

    console.log(
      `PASS ${label} — ${cockpit.drawCalls} calls (${callDelta >= 0 ? '+' : ''}${callDelta}), ${cockpit.triangles} triangles`
    );
  }
} finally {
  await browser.close();
}

console.log(`PASS ${CASES.length} real WebGL cockpit profiles`);

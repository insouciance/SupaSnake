/**
 * Mean-luminance probe for the governor's floor tier.
 *
 * Loads the cockpit fixture pinned to a tier, screenshots the WebGL canvas,
 * and reports mean luminance (Rec. 709) over the canvas. Run for tiers 0, 3, 4
 * and compare: T4 (composer off + exposure repayment) must sit within ~1% of
 * T3 (composer on at 1/8); T4 without repayment would read ~12% darker.
 */
import { chromium } from '@playwright/test';

const BASE = 'http://127.0.0.1:3107';
const tiers = process.argv.slice(2).map(Number);

function meanLuminance(pixels) {
  let sum = 0;
  const count = pixels.length / 4;
  for (let i = 0; i < pixels.length; i += 4) {
    sum += 0.2126 * pixels[i] + 0.7152 * pixels[i + 1] + 0.0722 * pixels[i + 2];
  }
  return sum / count;
}

const browser = await chromium.launch();
const results = {};
for (const tier of tiers) {
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  await page.goto(
    `${BASE}/dev/cockpit?renderer=webgl&state=active&tier=${tier}`,
    { waitUntil: 'networkidle' }
  );
  await page.waitForSelector('[data-testid="cockpit-webgl-board"] canvas', {
    timeout: 30000,
  });
  // Let the scene settle: warm-up frames, texture decode, first composer pass.
  await page.waitForTimeout(4000);
  const published = await page.getAttribute(
    '[data-testid="cockpit-webgl-board"]',
    'data-render-tier'
  );
  const canvas = page.locator('[data-testid="cockpit-webgl-board"] canvas');
  const shot = await canvas.screenshot({ type: 'png' });
  // Decode the PNG via the browser itself - no extra deps.
  const pixels = await page.evaluate(async (b64) => {
    const img = new Image();
    img.src = `data:image/png;base64,${b64}`;
    await img.decode();
    const c = document.createElement('canvas');
    c.width = img.width;
    c.height = img.height;
    const ctx = c.getContext('2d');
    ctx.drawImage(img, 0, 0);
    return Array.from(ctx.getImageData(0, 0, c.width, c.height).data);
  }, shot.toString('base64'));
  results[tier] = { mean: meanLuminance(pixels), published };
  console.log(
    `tier=${tier} published=${published} meanLuminance=${results[tier].mean.toFixed(3)}`
  );
  await page.close();
}
await browser.close();

if (results[3] && results[4]) {
  const delta = (results[4].mean / results[3].mean - 1) * 100;
  console.log(`T4 vs T3 delta: ${delta.toFixed(2)}%`);
}
if (results[0] && results[4]) {
  const delta = (results[4].mean / results[0].mean - 1) * 100;
  console.log(`T4 vs T0 delta: ${delta.toFixed(2)}%`);
}

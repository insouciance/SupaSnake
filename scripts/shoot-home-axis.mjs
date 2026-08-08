/**
 * HOME AXIS / COMPOSITION HARNESS — review tooling, not a gate.
 *
 *   node scripts/shoot-home-axis.mjs [outDir]
 *
 * Home Round 2 item 3 is an OPTICAL claim ("logo, snake and buttons are not on
 * one axis"), and an optical claim is settled with pixels rather than with the
 * camera maths that produced them. So this script does two things a screenshot
 * alone cannot:
 *
 *   1. It MEASURES the specimen's horizontal position off the rendered frame.
 *      The chamber room is blue at every step of its ladder (`--fill-room-*`)
 *      and the creature is warm at every step of its own, so `R > B` isolates
 *      the character from its room with no model of the pose involved. The
 *      mask's centroid and its bounding box are then reported in pixels against
 *      the canvas centre — the same two definitions of "centre" the fix has to
 *      choose between, measured rather than predicted.
 *
 *   2. It draws the vertical centre guide the review asks for, plus the
 *      measured marks, as a DOM overlay so the guide lands on the real
 *      composition and not on a re-rendered approximation.
 *
 * A running dev server is required; point HOME_BASE_URL at it (default :3122,
 * the owner's live review server — this script only reads it).
 */
import { mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { chromium } from 'playwright';
import sharp from 'sharp';

const BASE_URL = process.env.HOME_BASE_URL ?? 'http://127.0.0.1:3122';
const OUT = process.argv[2] ?? 'home-shots';

/** The two viewports the round is reviewed at. */
const VIEWPORTS = (process.env.HOME_SHOT_VIEWPORTS ?? 'desktop-1440,mobile-390')
  .split(',')
  .map((name) => {
    const known = {
      'desktop-1440': { name: 'desktop-1440', width: 1440, height: 900 },
      'mobile-390': { name: 'mobile-390', width: 390, height: 844 },
      'compact-320': { name: 'compact-320', width: 320, height: 568 },
      'tablet-768': { name: 'tablet-768', width: 768, height: 1024 },
    }[name.trim()];
    if (!known) throw new Error(`unknown viewport ${name}`);
    return known;
  });

/**
 * The guide is EVIDENCE, not the composition. Shots meant for the review folder
 * are taken without it; the axis proof is taken with it. Same run, same frame,
 * so the two cannot disagree about what was measured.
 */
const DRAW_GUIDE = process.env.HOME_SHOT_GUIDE !== '0';

/**
 * WebGL needs a moment after `onCreated` before the first drawn frame carries
 * the creature: the GLB streams in behind an `AssetGate`. The page's own fade
 * is 600ms, so anything under that is measuring the fade rather than the frame.
 */
const SETTLE_MS = 4500;

async function shoot(browser, viewport, label) {
  const context = await browser.newContext({
    viewport: { width: viewport.width, height: viewport.height },
    deviceScaleFactor: 1,
    reducedMotion: 'reduce',
  });
  // Pre-seed consent so the banner never mounts and never moves the dock.
  await context.addInitScript((value) => {
    // constitution-allow: local-progress  isolated review fixture, no player state
    window.localStorage.setItem('cookie-consent', value);
  }, JSON.stringify({
    essential: true,
    functional: false,
    analytics: false,
    marketing: false,
    timestamp: new Date().toISOString(),
  }));

  const page = await context.newPage();
  await page.goto(`${BASE_URL}/`, { waitUntil: 'domcontentloaded', timeout: 180_000 });
  await page.waitForSelector('[data-testid="home-specimen-full-stage"] canvas', {
    timeout: 180_000,
  });
  await page.waitForTimeout(SETTLE_MS);

  // ---- measure the specimen off the RENDERED FRAME -------------------------
  // Not off the live canvas: `preserveDrawingBuffer` is false, so the drawing
  // buffer is empty by the time any script can read it and `drawImage` yields a
  // blank surface. Playwright's screenshot is the composited frame, which is
  // both readable and the thing the owner is actually looking at.
  //
  // The band comes from the DOM rather than from guessed fractions. Home has
  // three warm objects and only one of them is the creature: the Mark is amber,
  // and so is the Play chip. Measuring strictly between the wordmark's lower
  // edge and the command dock's upper edge excludes both by construction, at
  // any viewport, without a magic number.
  const band = await page.evaluate(() => {
    const rect = (selector) => {
      const node = document.querySelector(selector);
      if (!node) return null;
      const r = node.getBoundingClientRect();
      return { top: r.top, bottom: r.bottom, left: r.left, right: r.right };
    };
    const mark = rect('[data-home-identity-hud] h1');
    const dock = rect('[data-home-command-dock]');
    const relic = rect('[data-testid="home-codex-relic"]');
    return {
      top: mark ? Math.ceil(mark.bottom) + 8 : 0,
      bottom: dock ? Math.floor(dock.top) - 8 : window.innerHeight,
      relic,
    };
  });

  const raw = await page.screenshot({ animations: 'disabled' });
  const { data, info } = await sharp(raw)
    .raw()
    .toBuffer({ resolveWithObject: true });

  const top = Math.max(0, Math.min(info.height - 1, Math.round(band.top)));
  const bottom = Math.max(top + 1, Math.min(info.height, Math.round(band.bottom)));
  const columns = new Float64Array(info.width);
  let count = 0;
  for (let y = top; y < bottom; y++) {
    for (let x = 0; x < info.width; x++) {
      // Skip the codex relic, the one other warm object that can share the band.
      if (
        band.relic &&
        x >= band.relic.left - 4 && x <= band.relic.right + 4 &&
        y >= band.relic.top - 4 && y <= band.relic.bottom + 4
      ) continue;
      const i = (y * info.width + x) * info.channels;
      // The room is blue at every step of its ladder; the character is warm at
      // every step of its own. Nothing else in the band is warm.
      if (data[i] > data[i + 2] + 18) {
        columns[x]++;
        count++;
      }
    }
  }

  let report = null;
  let centroidPx = null;
  if (count > 0) {
    let weighted = 0;
    for (let x = 0; x < info.width; x++) weighted += columns[x] * x;
    const centroid = weighted / count;
    // Trim 2% off each tail before taking the box, so one stray lit pixel
    // cannot define the silhouette the way a hard min/max would.
    let acc = 0;
    let lo = 0;
    let hi = info.width - 1;
    for (let x = 0; x < info.width; x++) {
      acc += columns[x];
      if (acc >= count * 0.02) { lo = x; break; }
    }
    acc = 0;
    for (let x = info.width - 1; x >= 0; x--) {
      acc += columns[x];
      if (acc >= count * 0.02) { hi = x; break; }
    }
    const mid = info.width / 2;
    centroidPx = centroid;
    report = {
      viewport: viewport.name,
      centroidOffsetPx: +(centroid - mid).toFixed(1),
      silhouetteMidOffsetPx: +((lo + hi) / 2 - mid).toFixed(1),
      maskPixels: count,
    };
    console.log(
      `${label} ${viewport.name}: silhouette-mid ` +
        `${report.silhouetteMidOffsetPx >= 0 ? '+' : ''}${report.silhouetteMidOffsetPx}px, ` +
        `mass-centroid ${report.centroidOffsetPx >= 0 ? '+' : ''}${report.centroidOffsetPx}px ` +
        `(+ = right of centre; ${count} px of creature in band ${top}..${bottom})`
    );
  } else {
    console.log(`${label} ${viewport.name}: no creature pixels found`);
  }

  // ---- draw the guide -----------------------------------------------------
  if (DRAW_GUIDE) await page.evaluate((marks) => {
    const overlay = document.createElement('div');
    overlay.id = '__axis_guide';
    overlay.style.cssText =
      'position:fixed;inset:0;z-index:2147483647;pointer-events:none;';
    // The optical axis under review.
    const centre = document.createElement('div');
    centre.style.cssText =
      'position:absolute;top:0;bottom:0;left:50%;width:1px;background:#ff2fd0;' +
      'box-shadow:0 0 0 0.5px rgba(0,0,0,0.55);';
    overlay.appendChild(centre);
    // Where the creature actually is, if it was measured.
    if (marks && Number.isFinite(marks.centroid)) {
      const c = document.createElement('div');
      c.style.cssText =
        `position:absolute;top:0;bottom:0;left:${marks.centroid}px;width:1px;` +
        'background:#57ff8a;opacity:0.9;';
      overlay.appendChild(c);
    }
    document.body.appendChild(overlay);
  }, centroidPx === null ? null : { centroid: centroidPx });

  await page.screenshot({
    path: join(OUT, `${label}-${viewport.name}.png`),
    animations: 'disabled',
  });
  await context.close();
  return report;
}

async function main() {
  await mkdir(OUT, { recursive: true });
  const label = process.env.HOME_SHOT_LABEL ?? 'HOME-axis';
  const browser = await chromium.launch({
    args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
  });
  const reports = [];
  try {
    for (const viewport of VIEWPORTS) {
      reports.push(await shoot(browser, viewport, label));
    }
  } finally {
    await browser.close();
  }
  console.log(`\nwrote ${reports.length} shots to ${OUT}/`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

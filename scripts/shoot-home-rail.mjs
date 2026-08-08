/**
 * HOME RAIL / GLYPH HARNESS — review tooling, not a gate.
 *
 *   node scripts/shoot-home-rail.mjs [outDir]
 *
 * Round 4's first two items are both claims about PIXELS that CSS alone cannot
 * settle, so this measures them off the rendered page rather than asserting
 * them from the stylesheet:
 *
 *   1. THE GUTTER. "play and lab have good spacing, but the other 2 are too far
 *      away." The rail was four equal grid tracks holding fixed-width cubes, so
 *      each track's leftover slack landed in the gutter and the gutters differed
 *      by 5px. The fix is a flex row, where `gap` IS the gutter — and the proof
 *      is the three measured distances between the cubes' own boxes, taken from
 *      `getBoundingClientRect` at each reviewed viewport and required to agree.
 *
 *   2. THE GLYPHS. The close-ups are cropped from the same frames, upscaled with
 *      a nearest-neighbour kernel so a stroke weight can be counted in pixels
 *      instead of squinted at.
 *
 * It also shoots the head cube with the face projection FORCED OFF, so the
 * "projected vs screen-straight" judgment is made on two images of the same
 * frame rather than on memory.
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
const LABEL = process.env.HOME_SHOT_LABEL ?? 'HOME-r4';

const VIEWPORTS = [
  { name: 'desktop-1440', width: 1440, height: 900 },
  { name: 'tablet-768', width: 768, height: 1024 },
  { name: 'mobile-390', width: 390, height: 844 },
  { name: 'compact-320', width: 320, height: 568 },
];

/** The GLB streams in behind an AssetGate; the page's own fade is 600ms. */
const SETTLE_MS = 4500;

const RAIL = ['play', 'lab', 'compete', 'you'];

async function openHome(browser, viewport) {
  const context = await browser.newContext({
    viewport: { width: viewport.width, height: viewport.height },
    deviceScaleFactor: 1,
    reducedMotion: 'reduce',
  });
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
  return { context, page };
}

/** The four cube boxes and the three gutters between them, in device pixels. */
async function measureRail(page) {
  return page.evaluate((commands) => {
    const boxes = commands.map((command) => {
      const node = document.querySelector(`[data-home-command="${command}"]`);
      if (!node) return null;
      const r = node.getBoundingClientRect();
      return {
        command,
        left: r.left,
        right: r.right,
        top: r.top,
        bottom: r.bottom,
        width: r.width,
        height: r.height,
      };
    });
    if (boxes.some((b) => b === null)) return null;
    const gaps = [];
    for (let i = 1; i < boxes.length; i++) {
      gaps.push({
        from: boxes[i - 1].command,
        to: boxes[i].command,
        px: +(boxes[i].left - boxes[i - 1].right).toFixed(2),
      });
    }
    const rail = document.querySelector('[data-testid="home-command-rail"]');
    return { boxes, gaps, railWidth: rail ? rail.getBoundingClientRect().width : null };
  }, RAIL);
}

/** Gap callipers, drawn on the frame so the measurement and the image agree. */
async function drawGapGuide(page, rail) {
  await page.evaluate(({ boxes, gaps }) => {
    const overlay = document.createElement('div');
    overlay.id = '__rail_guide';
    overlay.style.cssText =
      'position:fixed;inset:0;z-index:2147483647;pointer-events:none;';
    const equal = new Set(gaps.map((g) => Math.round(g.px))).size === 1;
    // ONE baseline for all three callipers. Hanging each off its own pair puts
    // the one beside the taller head lower than the others, which reads as a
    // difference in the thing being measured.
    const baseline = Math.max(...boxes.map((b) => b.bottom)) + 10;
    gaps.forEach((gap, i) => {
      const a = boxes[i];
      const b = boxes[i + 1];
      const y = baseline;
      const bar = document.createElement('div');
      bar.style.cssText =
        `position:absolute;left:${a.right}px;top:${y}px;width:${gap.px}px;` +
        `height:3px;background:${equal ? '#57ff8a' : '#ff2fd0'};`;
      overlay.appendChild(bar);
      for (const x of [a.right, b.left]) {
        const tick = document.createElement('div');
        tick.style.cssText =
          `position:absolute;left:${x}px;top:${y - 6}px;width:1px;height:15px;` +
          `background:${equal ? '#57ff8a' : '#ff2fd0'};`;
        overlay.appendChild(tick);
      }
      const cap = document.createElement('div');
      cap.style.cssText =
        `position:absolute;left:${a.right + gap.px / 2}px;top:${y + 8}px;` +
        `transform:translateX(-50%);color:${equal ? '#57ff8a' : '#ff2fd0'};` +
        'font:700 11px Helvetica,Arial;text-shadow:0 1px 2px rgba(0,0,0,0.9);';
      cap.textContent = `${Math.round(gap.px)}px`;
      overlay.appendChild(cap);
    });
    document.body.appendChild(overlay);
  }, rail);
}

/** Crop a box out of a frame and blow it up, pixels intact. */
async function closeUp(raw, box, pad, width, path) {
  const meta = await sharp(raw).metadata();
  const left = Math.max(0, Math.round(box.left - pad));
  const top = Math.max(0, Math.round(box.top - pad));
  await sharp(raw)
    .extract({
      left,
      top,
      width: Math.min(meta.width - left, Math.round(box.width + pad * 2)),
      height: Math.min(meta.height - top, Math.round(box.height + pad * 2)),
    })
    .resize({ width, kernel: 'nearest' })
    .toFile(path);
}

async function main() {
  await mkdir(OUT, { recursive: true });
  const browser = await chromium.launch({
    args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
  });
  let failures = 0;
  try {
    for (const viewport of VIEWPORTS) {
      const { context, page } = await openHome(browser, viewport);
      const rail = await measureRail(page);
      if (!rail) {
        console.log(`${viewport.name}: rail not found`);
      } else {
        const measured = rail.gaps.map((g) => Math.round(g.px));
        const equal = new Set(measured).size === 1;
        if (!equal) failures++;
        console.log(
          `${viewport.name}: gutters ` +
            rail.gaps.map((g) => `${g.from}->${g.to} ${g.px}px`).join('  ') +
            `  [${equal ? 'EQUAL' : 'UNEQUAL'}]  cubes ` +
            rail.boxes.map((b) => `${Math.round(b.width)}`).join('/') +
            `  rail ${Math.round(rail.railWidth)}px`
        );
      }

      // The clean review frame.
      await page.screenshot({
        path: join(OUT, `${LABEL}-${viewport.name}.png`),
        animations: 'disabled',
      });

      if (viewport.name === 'desktop-1440' && rail) {
        const raw = await page.screenshot({ animations: 'disabled' });
        // The gene runes, at the size the ruling is about.
        const relic = await page.evaluate(() => {
          const node = document.querySelector('[data-testid="home-codex-relic"]');
          if (!node) return null;
          const r = node.getBoundingClientRect();
          return { left: r.left, top: r.top, width: r.width, height: r.height };
        });
        if (relic) {
          await closeUp(raw, relic, 16, 560, join(OUT, `${LABEL}-GLYPHS.png`));
        }
        // The head cube alone, for the projection judgment.
        await closeUp(raw, rail.boxes[0], 10, 460, join(OUT, `${LABEL}-PLAY-projected.png`));

        // The same frame with the face projection forced off.
        await page.addStyleTag({
          content: '.snake-cube__glyph { transform: none !important; }',
        });
        const flat = await page.screenshot({ animations: 'disabled' });
        await closeUp(flat, rail.boxes[0], 10, 460, join(OUT, `${LABEL}-PLAY-straight.png`));
        await closeUp(
          flat,
          { left: rail.boxes[0].left, top: rail.boxes[0].top, width: rail.boxes[3].right - rail.boxes[0].left, height: rail.boxes[0].height },
          10,
          1280,
          join(OUT, `${LABEL}-RAIL-straight.png`)
        );

        // The annotated rail, on a fresh frame with the projection back on.
        await page.reload({ waitUntil: 'domcontentloaded' });
        await page.waitForSelector('[data-testid="home-specimen-full-stage"] canvas', {
          timeout: 180_000,
        });
        await page.waitForTimeout(SETTLE_MS);
        const again = await measureRail(page);
        await drawGapGuide(page, again);
        const annotated = await page.screenshot({ animations: 'disabled' });
        await closeUp(
          annotated,
          {
            left: again.boxes[0].left,
            top: again.boxes[0].top,
            width: again.boxes[3].right - again.boxes[0].left,
            height: again.boxes[0].height + 34,
          },
          14,
          1280,
          join(OUT, `${LABEL}-RAIL.png`)
        );
      }
      await context.close();
    }
  } finally {
    await browser.close();
  }
  console.log(
    failures === 0
      ? `\nevery gutter equal at every viewport; shots in ${OUT}/`
      : `\n${failures} viewport(s) with unequal gutters`
  );
  if (failures > 0) process.exitCode = 1;
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

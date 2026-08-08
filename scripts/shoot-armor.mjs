/**
 * ARMOR - the wearable's review harness.
 *
 * REVIEW TOOLING, not a gate. `armor90s.test.ts` and `SegmentArmor.test.ts`
 * assert; this script only LOOKS, because what is being decided here is a
 * SHAPE and the owner decides that with their eyes. It exists so the sheet can
 * be reproduced exactly - same viewport, same DPR, same crop, same wait -
 * rather than trusted as a screenshot somebody took once by hand.
 *
 *   node scripts/shoot-armor.mjs [outDir]
 *
 * A running dev server is required; point BASE at it (default :3198).
 *
 * WHAT THE SHEET HAS TO ANSWER, and which shot answers it:
 *
 *   chamber-{1,2}seg     Does it look premium close up? Hero detail: rivets,
 *                        harness, the full ziggurat. This is the merch test -
 *                        silhouette first, would it read as a plush.
 *   board-dense-*        Does an armoured segment read as ARMOURED mid-coil,
 *                        at speed, on a crowded board? Shot with the BARE
 *                        baseline in the same frame set, because a silhouette
 *                        change is a comparison and a lone screenshot of a
 *                        thing is not evidence that the thing changed.
 *   board-neck-*         The same board at DPR 4, cropped to the head and the
 *                        two cells behind it - the segment-anchor read.
 *   board-glide-*        The WALKING fixture: a snake actually travelling one
 *                        cell per tick through the real interpolation buffer,
 *                        caught at three points inside one tick. This is the
 *                        anchor claim in pixels - the plate holds a rigid cell
 *                        behind the head at every motion.
 *   phone-*              390x844 at DPR 3. The plate is ~9 device pixels wide
 *                        here; if the read survives this it survives.
 *   t4-composer-off-*    TIER=4, the true floor: the composer is OFF and the
 *                        brightness it carried is repaid by exposure. Gear
 *                        that only reads under bloom is gear that vanishes on
 *                        a starving main thread.
 *
 * The armour is pinned by `?armor=1|2`, which `resolveArmorFixture` refuses in
 * a production bundle - so this harness only exists against a dev server, by
 * construction.
 */

import { mkdir } from 'node:fs/promises';
import { chromium } from 'playwright';

const BASE = process.env.BASE ?? 'http://127.0.0.1:3198';
const OUT = process.argv[2] ?? '/tmp/supasnake-armor';

const BOARD = '[data-testid="cockpit-webgl-board"]';
const BAY = '[data-testid="cockpit-arena-bay"]';
const CHAMBER = '[data-testid="home-specimen-full-stage"]';

/** The ratified creature. A board shot wearing the shipped snake is the only
 *  one answering a question anybody asked. */
const SNAKE = 'guide';

function boardUrl({ armor, density, tier, arrival, theme = 'primal' }) {
  const parts = [
    `${BASE}/dev/cockpit?renderer=webgl`,
    'state=active',
    'dynasty=PRIMAL',
    `boardTheme=${theme}`,
    `snake90s=${SNAKE}`,
  ];
  if (density) parts.push(`density=${density}`);
  if (arrival) parts.push(`arrival=${arrival}`);
  if (tier !== undefined) parts.push(`tier=${tier}`);
  if (armor) parts.push(`armor=${armor}`);
  return parts.join('&');
}

/**
 * Wait for a REAL frame, not for the DOM. The board publishes its renderer
 * stats onto the host element, so a non-zero draw count is proof that WebGL
 * produced a frame; the settle after it covers the intro camera move and the
 * adaptive-quality governor's first decision.
 */
async function waitForBoard(page) {
  await page.waitForFunction(
    (selector) => {
      const host = document.querySelector(selector);
      return host && Number(host.dataset.drawCalls) > 0;
    },
    BOARD,
    { timeout: 120000 }
  );
  await page.waitForTimeout(2600);
}

async function shootElement(page, selector, file, crop) {
  const box = await page.locator(selector).boundingBox();
  const clip = crop
    ? {
        x: box.x + box.width * crop.x,
        y: box.y + box.height * crop.y,
        width: box.width * crop.width,
        height: box.height * crop.height,
      }
    : box;
  await page.screenshot({ path: file, clip });
  console.log(`  wrote ${file}`);
}

async function openBoard(browser, url, { viewport, dpr }) {
  const context = await browser.newContext({
    viewport,
    deviceScaleFactor: dpr,
  });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 180000 });
  await waitForBoard(page);
  if (errors.length) console.log(`  ! page errors: ${errors.join(' | ')}`);
  return { context, page };
}

async function boardShot(browser, name, urlOptions, opts = {}) {
  const {
    viewport = { width: 1280, height: 820 },
    dpr = 2,
    crop = null,
  } = opts;
  const url = boardUrl(urlOptions);
  console.log(`${name}\n  ${url}`);
  const { context, page } = await openBoard(browser, url, { viewport, dpr });
  const host = await page.locator(BOARD).getAttribute('data-render-tier');
  console.log(`  render tier ${host}`);
  await shootElement(page, BAY, `${OUT}/${name}.png`, crop);
  await context.close();
}

/**
 * Three frames inside ONE tick of the walking fixture.
 *
 * Playwright's clock is installed and paused, then stepped, so the three
 * frames are at KNOWN points of the interval rather than at whatever wall time
 * the screenshot happened to land on. The walker ticks every
 * ARRIVAL_WALK_TICK_MS (120), so 30/60/90ms are alpha 0.25/0.5/0.75 - entry
 * edge, cell centre, exit edge.
 */
async function glideStrip(browser, armor) {
  const url = boardUrl({ armor, arrival: 'glide' });
  console.log(`board-glide-${armor}seg\n  ${url}`);
  const context = await browser.newContext({
    viewport: { width: 1280, height: 820 },
    deviceScaleFactor: 3,
  });
  const page = await context.newPage();
  await page.clock.install({ time: 0 });
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 180000 });
  await page.clock.runFor(4000);
  await page.waitForFunction(
    (selector) => {
      const host = document.querySelector(selector);
      return host && Number(host.dataset.drawCalls) > 0;
    },
    BOARD,
    { timeout: 120000 }
  );
  await page.clock.runFor(3000);
  for (const [label, step] of [
    ['entry', 30],
    ['centre', 30],
    ['exit', 30],
  ]) {
    await page.clock.runFor(step);
    await shootElement(
      page,
      BAY,
      `${OUT}/board-glide-${armor}seg-${label}.png`,
      { x: 0.24, y: 0.2, width: 0.42, height: 0.46 }
    );
  }
  await context.close();
}

async function chamberShot(browser, armor) {
  // `snake90s` is REQUIRED here, not optional. The dev env leaves
  // NEXT_PUBLIC_NINETIES_COMPOSITION unset, so an unpinned home page renders
  // the CLASSIC creature - and the armour's cel treatment is applied only
  // under the 90s style (`IS_SNAKE_90S`), so an unpinned chamber shot is a
  // picture of the plate with its whole shading law switched off.
  const url = `${BASE}/?snake90s=${SNAKE}&armor=${armor}`;
  const name = `chamber-${armor}seg`;
  console.log(`${name}\n  ${url}`);
  const context = await browser.newContext({
    viewport: { width: 1280, height: 900 },
    deviceScaleFactor: 3,
  });
  const page = await context.newPage();
  await page.addInitScript(() => {
    // constitution-allow: local-progress  isolated review fixture, no player state
    localStorage.setItem(
      'cookie-consent',
      JSON.stringify({
        essential: true,
        functional: false,
        analytics: false,
        marketing: false,
        timestamp: '2026-08-08T00:00:00.000Z',
      })
    );
  });
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 180000 });
  await page.waitForSelector(`${CHAMBER} canvas`, { timeout: 120000 });
  await page.waitForTimeout(4000);
  await shootElement(page, CHAMBER, `${OUT}/${name}.png`);
  await context.close();
}

/** ONLY=chamber|dense|neck|glide|phone|t4 runs one band of the sheet. */
const ONLY = process.env.ONLY;
const wants = (band) => ONLY === undefined || ONLY === band;

async function main() {
  await mkdir(OUT, { recursive: true });
  const browser = await chromium.launch({
    args: [
      '--use-gl=angle',
      '--use-angle=metal',
      '--enable-unsafe-swiftshader',
      '--ignore-gpu-blocklist',
    ],
  });

  // THE CHAMBER - premium at close range, hero detail.
  // '0' is the BARE baseline. A silhouette change is a comparison, and a lone
  // screenshot of a thing is not evidence that the thing changed.
  if (wants('chamber'))
    for (const armor of ['0', '1', '2']) await chamberShot(browser, armor);

  // THE CROWDED BOARD - the mid-coil silhouette question, with its baseline.
  if (wants('dense')) {
    await boardShot(browser, 'board-dense-bare', { density: 'extreme' });
    await boardShot(browser, 'board-dense-1seg', {
      armor: '1',
      density: 'extreme',
    });
    await boardShot(browser, 'board-dense-2seg', {
      armor: '2',
      density: 'extreme',
    });
  }

  // THE NECK, close. Where the gear actually sits.
  const necks = wants('neck')
    ? [
        ['board-neck-bare', undefined],
        ['board-neck-1seg', '1'],
        ['board-neck-2seg', '2'],
      ]
    : [];
  for (const [name, armor] of necks) {
    await boardShot(
      browser,
      name,
      { armor, density: 'extreme' },
      { dpr: 4, crop: { x: 0.26, y: 0.13, width: 0.26, height: 0.27 } }
    );
  }

  // MID-RUN - the anchor, in motion.
  if (wants('glide'))
    for (const armor of ['1', '2']) await glideStrip(browser, armor);

  // PHONE.
  for (const armor of wants('phone') ? ['1', '2'] : []) {
    await boardShot(
      browser,
      `phone-${armor}seg`,
      { armor, density: 'extreme' },
      { viewport: { width: 390, height: 844 }, dpr: 3 }
    );
  }

  // T4 - the composer is OFF.
  if (wants('t4')) {
    await boardShot(browser, 't4-composer-off-2seg', {
      armor: '2',
      density: 'extreme',
      tier: 4,
    });
    await boardShot(browser, 't4-composer-off-bare', {
      density: 'extreme',
      tier: 4,
    });
  }

  await browser.close();
  console.log(`\nsheet written to ${OUT}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});

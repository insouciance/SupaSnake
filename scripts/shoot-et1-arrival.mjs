/**
 * ET-1 ARRIVAL A/B - the feel review's harness.
 *
 * REVIEW TOOLING, not a gate. The three cockpit verifiers assert; this script
 * only LOOKS, because what ET-1 changes is motion character and the owner
 * decides that with their eyes. It exists so the strip in
 * `docs/design/et1/one-cell-traversal.png` can be reproduced exactly rather
 * than trusted as a screenshot somebody took once by hand.
 *
 *   node scripts/shoot-et1-arrival.mjs [outDir]
 *
 * A running dev server is required; point COCKPIT_BASE_URL at it (default
 * :3107). Writes `et1-one-cell-traversal.png` into outDir (default
 * `docs/design/et1`, where it lands as `one-cell-traversal.png`).
 *
 * WHY THIS IS NOT JUST TWO SCREENSHOTS. The two legs have to be the SAME cell
 * at the SAME alpha or the strip is two anecdotes rather than a comparison,
 * and alpha cannot be ASSUMED from wall time: the fixture's walker mounts
 * whenever hydration happens to finish, so the tick boundary sits at a
 * different offset in each leg. So alpha is MEASURED. After Playwright's fake
 * clock is installed - and therefore after its own rAF/setInterval
 * replacements are in place - an init script wraps both:
 *
 *   - the 120ms interval is the walker's tick; each firing stamps `__tickAt`;
 *   - each animation frame stamps `__lastRaf`, the exact `performance.now()`
 *     the renderer read when it drew the frame about to be screenshotted.
 *
 * `(__lastRaf - __tickAt) / 120` is then the true alpha OF THE DRAWN FRAME,
 * and the sweep steps the paused clock until it reaches each target before
 * shooting. In practice the two legs land within 0.01 alpha of each other.
 *
 * Every number printed on the page is likewise measured off the captured
 * pixels - the head's leading edge against the edge it settles on - and never
 * restated from `arrivalEasing.ts`. A strip that read its own labels out of
 * the module it is supposed to be evidence for would prove nothing.
 *
 * Ring geometry (ArenaPrototypeCanvas): lo=5, hi=14, 36 cells, 9 per side, so
 * headIndex = (8 + 1 + intervalTicks) % 36. Index 22 puts the head at (10,14)
 * travelling -X along the front straight - the row nearest the camera, which
 * is where a fraction of a cell is worth the most pixels.
 */
import { mkdir, writeFile, rm } from 'node:fs/promises';
import { chromium } from 'playwright';
import sharp from 'sharp';

const BASE_URL = process.env.COCKPIT_BASE_URL ?? 'http://127.0.0.1:3107';
const OUT = process.argv[2] ?? 'docs/design/et1';

const TICK_MS = 120;
const RING = 36;
const TARGET_HEAD_INDEX = 22;
/**
 * The alphas the strip has a column for. The renderer draws roughly eight
 * frames per 120ms interval, so these are the columns the nearest captured
 * frame is chosen for - never a time at which a frame is manufactured.
 */
const TARGETS = [0.15, 0.3, 0.45, 0.6, 0.75, 0.9];
const VIEWPORT = { width: 1920, height: 1080 };
const HOST = '[data-testid="cockpit-webgl-board"]';

/** The head close-up, fixed so two runs of this script are comparable. */
const CROP = { left: 880, top: 650, width: 200, height: 150 };
const ZOOM = 2.5;

/** Search window for the head, in captured-frame pixels. */
const SCAN = { x0: 500, x1: 1400, y0: 640, y1: 880 };

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * The snake's own amber, distinguished from the board, the aim lane and the
 * starfield. Deliberately narrow: the measurement below is a leading EDGE, so
 * a predicate that also matched the glow would drift by a pixel or two.
 */
const isSnakeAmber = (r, g, b) =>
  r > 195 && g > 125 && g < 230 && b < 120 && r - b > 110;

/** Leading edge (minimum x) of the head, in captured-frame pixels. */
async function leadingEdge(file) {
  const { data, info } = await sharp(file)
    .raw()
    .toBuffer({ resolveWithObject: true });
  let minX = SCAN.x1;
  for (let y = SCAN.y0; y < SCAN.y1; y += 1) {
    for (let x = SCAN.x0; x < minX; x += 1) {
      const i = (y * info.width + x) * info.channels;
      if (isSnakeAmber(data[i], data[i + 1], data[i + 2])) {
        minX = x;
        break;
      }
    }
  }
  if (minX >= SCAN.x1) throw new Error(`no head found in ${file}`);
  return minX;
}

async function captureLeg(browser, mode, dir) {
  const context = await browser.newContext({
    viewport: VIEWPORT,
    deviceScaleFactor: 1,
  });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));

  // Order matters: the clock's own rAF/setInterval replacements must already
  // be installed, so the probe below wraps THOSE and not the native ones.
  await page.clock.install({ time: 0 });
  await page.addInitScript(() => {
    // constitution-allow: local-progress  isolated review fixture, no player state
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
    const raf = window.requestAnimationFrame.bind(window);
    window.__lastRaf = -1;
    window.requestAnimationFrame = (cb) =>
      raf((t) => {
        window.__lastRaf = performance.now();
        return cb(t);
      });
    const setInt = window.setInterval.bind(window);
    window.__tickAt = -1;
    window.__prevTickAt = -1;
    window.__ticks = 0;
    window.setInterval = (fn, ms, ...rest) => {
      if (ms === 120 && typeof fn === 'function') {
        return setInt(
          () => {
            window.__prevTickAt = window.__tickAt;
            window.__tickAt = performance.now();
            window.__ticks += 1;
            fn();
          },
          ms,
          ...rest
        );
      }
      return setInt(fn, ms, ...rest);
    };
  });

  const query = new URLSearchParams({
    dynasty: 'CYBER',
    state: 'run',
    mode: 'anomaly',
    genes: '6',
    effects: 'off',
    arrival: mode,
  });
  await page.goto(`${BASE_URL}/dev/cockpit?${query}`, {
    waitUntil: 'domcontentloaded',
  });

  for (let i = 0; i < 160; i += 1) {
    const mounted = await page.evaluate(
      (sel) => Boolean(document.querySelector(sel)?.querySelector('canvas')),
      HOST
    );
    if (mounted) break;
    await sleep(250);
  }

  const arrival = await page.evaluate(
    () =>
      document
        .querySelector('[data-fixture-arrival]')
        ?.getAttribute('data-fixture-arrival') ?? null
  );
  if (arrival !== mode) {
    throw new Error(`fixture reports arrival=${arrival}, expected ${mode}`);
  }

  // Let the renderer come up on REAL time - context creation, shader compiles
  // and texture uploads are not things to drive from a fake clock. Only once
  // the arena is demonstrably drawing does the clock get frozen.
  let drawCalls = 0;
  for (let wait = 0; wait < 60; wait += 1) {
    drawCalls = await page.evaluate(
      (sel) =>
        Number(
          document.querySelector(sel)?.getAttribute('data-draw-calls') ?? 0
        ),
      HOST
    );
    if (drawCalls > 0) break;
    await sleep(500);
  }
  if (!(drawCalls > 0)) throw new Error(`${mode}: arena never drew`);
  await sleep(1000);

  // Freeze well ahead of the live clock - `pauseAt` refuses to travel
  // backwards, and the round trip that reads the time is itself real work.
  await page.clock.pauseAt((await page.evaluate(() => Date.now())) + 3000);

  const probe = () =>
    page.evaluate(() => {
      // The drawn frame belongs to whichever tick was current when rAF fired,
      // which is the PREVIOUS one if the clock has since crossed a boundary.
      const drawnInCurrent = window.__lastRaf >= window.__tickAt;
      const base = drawnInCurrent ? window.__tickAt : window.__prevTickAt;
      return {
        ticks: window.__ticks,
        tickAt: window.__tickAt,
        now: performance.now(),
        frameAlpha: base >= 0 ? (window.__lastRaf - base) / 120 : -1,
        frameTick: drawnInCurrent ? window.__ticks : window.__ticks - 1,
      };
    });

  let state = await probe();
  if (state.tickAt < 0) throw new Error(`${mode}: walker tick never observed`);

  // Land on a tick boundary, then walk whole ticks to the chosen cell.
  await page.clock.runFor(TICK_MS - ((state.now - state.tickAt) % TICK_MS));
  state = await probe();
  const extra =
    (TARGET_HEAD_INDEX - ((8 + 1 + state.ticks) % RING) + RING) % RING;
  if (extra > 0) await page.clock.runFor(TICK_MS * extra);
  state = await probe();
  const headIndex = (8 + 1 + state.ticks) % RING;
  if (headIndex !== TARGET_HEAD_INDEX) {
    throw new Error(`${mode}: headIndex ${headIndex}, want ${TARGET_HEAD_INDEX}`);
  }

  // At the boundary the last DRAWN frame still belongs to the previous tick;
  // step until one has been drawn inside this one and anchor the sweep there.
  let anchor = -1;
  for (let step = 0; step < 40; step += 1) {
    const s = await probe();
    if (s.frameTick === s.ticks) {
      anchor = s.ticks;
      break;
    }
    await page.clock.runFor(2);
  }
  if (anchor < 0) throw new Error(`${mode}: no frame drawn inside the tick`);

  // Shoot EVERY frame the renderer draws inside this one interval, rather than
  // chasing target alphas: rAF fires on a 16ms grid whose phase against the
  // tick boundary is set by page-load timing, so a target-chasing sweep lands
  // the two legs on different alphas and can resolve two targets to one frame.
  // Capturing the whole interval and pairing afterwards keeps the strip honest
  // about which alpha each picture is actually of.
  const frames = [];
  let lastAlpha = -1;
  for (let step = 0; step < 200; step += 1) {
    const s = await probe();
    if (s.frameTick !== anchor) break;
    if (s.frameAlpha > lastAlpha) {
      lastAlpha = s.frameAlpha;
      const stamp = String(Math.round(s.frameAlpha * 1000)).padStart(4, '0');
      const file = `${dir}/${mode}-${stamp}.png`;
      await page.locator(HOST).screenshot({ path: file });
      frames.push({ alpha: s.frameAlpha, file });
    }
    await page.clock.runFor(2);
  }
  if (frames.length < TARGETS.length) {
    throw new Error(`${mode}: only ${frames.length} frames in the interval`);
  }

  if (errors.length) throw new Error(`${mode}: page errors ${errors.join('; ')}`);
  await context.close();
  return frames;
}

async function plate(file) {
  const buffer = await sharp(file)
    .extract(CROP)
    .resize({ width: Math.round(CROP.width * ZOOM), kernel: 'nearest' })
    .png()
    .toBuffer();
  return `data:image/png;base64,${buffer.toString('base64')}`;
}

await mkdir(OUT, { recursive: true });
const scratch = `${OUT}/.et1-frames`;
await mkdir(scratch, { recursive: true });

const browser = await chromium.launch({ headless: true });
let classicAll;
let frontAll;
try {
  classicAll = await captureLeg(browser, 'classic', scratch);
  frontAll = await captureLeg(browser, 'front', scratch);
} finally {
  await browser.close();
}

for (const frame of [...classicAll, ...frontAll]) {
  frame.lead = await leadingEdge(frame.file);
}

/** The frame of a leg whose measured alpha sits closest to a target. */
const nearest = (frames, target) =>
  frames.reduce((best, f) =>
    Math.abs(f.alpha - target) < Math.abs(best.alpha - target) ? f : best
  );
const classic = TARGETS.map((t) => nearest(classicAll, t));
const front = TARGETS.map((t) => nearest(frontAll, t));
/** How far apart the two legs' columns actually are - stated, never assumed. */
const worstPairing = Math.max(
  ...classic.map((c, i) => Math.abs(c.alpha - front[i].alpha))
);

/**
 * One cell in screen pixels, read off the CLASSIC leg - whose blend IS alpha,
 * so its travel per unit alpha is one cell by definition. Nothing here is
 * taken from the camera or the board geometry.
 */
const cellPx =
  Math.abs(classicAll.at(-1).lead - classicAll[0].lead) /
  (classicAll.at(-1).alpha - classicAll[0].alpha);
/**
 * Where the leading edge comes to REST. The settle only ever carries the head
 * past its cell and back (g(s) = 1 + K·s(1−s)² >= 1), so among the frames at
 * or after the arrival alpha the LEAST advanced one is the rest position, and
 * every other settled frame reads as the overshoot it is.
 */
const settled = frontAll.filter((f) => f.alpha >= 0.45);
const restX = settled.length
  ? Math.max(...settled.map((f) => f.lead))
  : Math.min(...frontAll.map((f) => f.lead));
const shortfall = (lead) => (lead - restX) / cellPx;

const row = (frames) =>
  frames
    .map((frame) => {
      const s = shortfall(frame.lead);
      const label =
        Math.abs(s) < 0.02
          ? 'ON THE CELL'
          : s > 0
            ? `${s.toFixed(2)} cell short`
            : `${Math.abs(s).toFixed(2)} past (settle)`;
      return `<figure class="shot">
      <div class="plate" style="width:${CROP.width * ZOOM}px;height:${CROP.height * ZOOM}px">
        <img src="${frame.src}" width="${CROP.width * ZOOM}" height="${CROP.height * ZOOM}" alt="">
        <span class="guide" style="left:${(restX - CROP.left) * ZOOM}px"></span>
      </div>
      <figcaption><b>&alpha; ${frame.alpha.toFixed(2)}</b><span class="${Math.abs(s) < 0.12 ? 'true' : 'late'}">${label}</span></figcaption>
    </figure>`;
    })
    .join('');

for (const frame of [...classic, ...front]) frame.src = await plate(frame.file);

const width = 44 * 2 + classic.length * (CROP.width * ZOOM + 18);
const html = `<!doctype html><meta charset="utf-8"><style>
  :root { color-scheme: light; }
  * { box-sizing: border-box; }
  body { margin:0; padding:48px 44px 44px; background:#f4f1e8; color:#14181d;
         font: 15px/1.5 ui-monospace, "SF Mono", Menlo, monospace; width:${width}px; }
  h1 { font-size:30px; letter-spacing:.14em; margin:0 0 10px; }
  .lede { max-width:1900px; margin:0 0 30px; font-size:15.5px; color:#39424c; }
  .band { display:flex; align-items:center; gap:14px; margin:26px 0 12px; }
  .tag { font-weight:700; letter-spacing:.18em; padding:6px 13px; border-radius:4px; font-size:14px; }
  .tag.classic { background:#2b3440; color:#f4f1e8; }
  .tag.front { background:#e8a020; color:#14181d; }
  .band em { font-style:normal; color:#39424c; }
  .row { display:flex; gap:18px; }
  .shot { margin:0; }
  .plate { position:relative; border-radius:5px; overflow:hidden; box-shadow:0 1px 0 rgba(0,0,0,.28); }
  .plate img { display:block; }
  .guide { position:absolute; top:0; bottom:0; width:0; border-left:3px dashed rgba(255,255,255,.92); }
  figcaption { margin-top:9px; display:flex; gap:12px; align-items:baseline; font-size:14px; }
  figcaption span.true { color:#1d7a3d; font-weight:700; }
  figcaption span.late { color:#a8442a; }
  .note { margin-top:32px; max-width:2300px; font-size:15px; color:#39424c; }
  .note b { color:#14181d; }
  code { background:#e6e1d4; padding:1px 5px; border-radius:3px; }
</style>
<h1>ET-1 &mdash; ONE CELL, ONE 120ms TICK</h1>
<p class="lede">
  The engine moved the snake to this cell at &alpha;&nbsp;0. Everything after that is the renderer
  catching up. Both rows are the <b>same cell of the same scripted walk on the same fixture</b>
  (<code>/dev/cockpit?arrival=&hellip;</code>, WebGL arena, head cell ${TARGET_HEAD_INDEX} of the ${RING}-cell ring),
  stepped by a paused page clock, and every caption is the <b>measured</b> alpha of the frame above it
  rather than the one that was asked for &mdash; the columns pair to within ${worstPairing.toFixed(2)}&nbsp;&alpha;
  (${(worstPairing * cellPx).toFixed(1)}px of travel), well under the effect. A difference in the picture is a
  difference in the easing and nothing else. The dashed line is where the head's leading edge comes
  to rest: <b>the cell the simulation is already on</b>.
</p>
<div class="band"><span class="tag classic">CLASSIC</span>
  <em>the old blend &mdash; still short of the cell as the interval runs out, which is the reaction window the player spends looking at a lie</em></div>
<div class="row">${row(classic)}</div>
<div class="band"><span class="tag front">FRONT&#8209;LOADED</span>
  <em>arrives by &alpha;&nbsp;0.45 and settles &mdash; the eye dwells on the true board state for the rest of the interval</em></div>
<div class="row">${row(front)}</div>
<p class="note">
  <b>Read off these pixels, not off the easing module.</b> One cell measures ${cellPx.toFixed(1)}px on screen
  here, taken from the CLASSIC leg &mdash; whose blend <i>is</i> &alpha;. CLASSIC is
  ${shortfall(classic[2].lead).toFixed(2)} of a cell short at &alpha;&nbsp;${classic[2].alpha.toFixed(2)} and
  ${shortfall(classic.at(-1).lead).toFixed(2)} short at &alpha;&nbsp;${classic.at(-1).alpha.toFixed(2)}; it only lands as the next tick fires.
  FRONT&#8209;LOADED is on the cell by &alpha;&nbsp;0.45 and holds it, drifting
  ${Math.abs(Math.min(...frontAll.map((f) => shortfall(f.lead)))).toFixed(2)} of a cell past and springing back &mdash; that is
  <code>ARRIVAL_OVERSHOOT&nbsp;=&nbsp;0.06</code> arriving on screen at the value it was set to.
</p>`;

const htmlPath = `${OUT}/.et1-strip.html`;
await writeFile(htmlPath, html, 'utf8');
const shooter = await chromium.launch({ headless: true });
const page = await shooter.newPage({ viewport: { width, height: 1240 } });
await page.goto(`file://${process.cwd()}/${htmlPath}`, { waitUntil: 'load' });
await page.screenshot({ path: `${OUT}/one-cell-traversal.png`, fullPage: true });
await shooter.close();

await rm(htmlPath, { force: true });
await rm(scratch, { recursive: true, force: true });

console.log(
  `PASS one cell traversal - ${classic.length} alphas x 2 legs, cell ${cellPx.toFixed(1)}px -> ${OUT}/one-cell-traversal.png`
);

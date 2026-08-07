/**
 * Geometry/readability audit for the dev-only Run Cockpit prototype.
 *
 * Start the local app first, then run `npm run verify:cockpit-prototype`.
 * Override COCKPIT_BASE_URL when the dev server is not on port 3107.
 */

import { chromium } from 'playwright';

const BASE_URL = process.env.COCKPIT_BASE_URL ?? 'http://127.0.0.1:3107';
const EPSILON = 0.6;

const VIEWPORTS = [
  [320, 568],
  [375, 667],
  [390, 844],
  [844, 390],
  [768, 1024],
  [1280, 720],
  [1440, 900],
  [2560, 1080],
];

const VARIANTS = [
  'dynasty=PRIMAL&state=ready&mode=standard&genes=0&motion=reduced',
  'dynasty=CYBER&state=active&mode=free&genes=3&motion=reduced',
  'dynasty=PRIMAL&state=portal&mode=anomaly&genes=6&motion=reduced',
  'dynasty=COSMIC&state=apex&mode=anomaly&genes=6&contrast=high&motion=reduced',
];

function invariant(condition, message) {
  if (!condition) throw new Error(message);
}

function near(a, b, tolerance = EPSILON) {
  return Math.abs(a - b) <= tolerance;
}

async function readMetrics(page) {
  return page.evaluate(() => {
    const root = document.querySelector('[data-testid="cockpit-prototype"]');
    const boardElement = document.querySelector('[data-testid="cockpit-board"]');
    const frameElement = document.querySelector('[data-testid="cockpit-arena-frame"]');
    if (!root || !boardElement || !frameElement) throw new Error('Cockpit fixture did not render');

    const rect = (element) => {
      const value = element.getBoundingClientRect();
      return {
        x: value.x,
        y: value.y,
        width: value.width,
        height: value.height,
        right: value.right,
        bottom: value.bottom,
      };
    };
    const intersects = (a, b) =>
      Math.max(a.x, b.x) < Math.min(a.right, b.right) &&
      Math.max(a.y, b.y) < Math.min(a.bottom, b.bottom);

    const board = rect(boardElement);
    const frame = rect(frameElement);
    const visibleRegions = [
      ...root.querySelectorAll('section, [role="status"], button'),
    ].filter((element) => {
      const value = element.getBoundingClientRect();
      const style = getComputedStyle(element);
      return value.width > 0 && value.height > 0 && style.display !== 'none' && style.visibility !== 'hidden';
    });

    const overlaps = visibleRegions
      .filter((element) => intersects(board, rect(element)))
      .map((element) => element.getAttribute('aria-label') ?? element.getAttribute('role') ?? element.tagName);

    const leafText = [...root.querySelectorAll('*')]
      .filter((element) => {
        const value = element.getBoundingClientRect();
        return (
          element.children.length === 0 &&
          element.textContent?.trim() &&
          value.width > 0 &&
          value.height > 0 &&
          getComputedStyle(element).display !== 'none'
        );
      })
      .map((element) => ({
        text: element.textContent.trim().slice(0, 40),
        fontSize: Number.parseFloat(getComputedStyle(element).fontSize),
      }));

    const buttons = [...root.querySelectorAll('button')].map(rect);

    /*
     * THE HUD GUARANTEE: the board may paint over any tray, but it may never
     * take a tray's click.
     *
     * The pop-out gives the board canvas a drawing surface 1.5x its bay,
     * sitting over the HUD at a higher z-index. That ruling is about what the
     * player SEES; it must never become input capture. It did once:
     * `@react-three/fiber` writes `pointerEvents: 'auto'` as an INLINE style on
     * its canvas wrapper, which beat the surface's inherited
     * `pointer-events: none` and swallowed the click on "Abandon run".
     *
     * `elementFromPoint` at each control's own centre is the same question the
     * browser asks when a player taps, so this catches any future bleed,
     * overlay or stacking change that reintroduces the capture.
     *
     * SCOPED TO THE BOARD'S SUBTREE, DELIBERATELY. A control covered by an
     * OPEN DECISION SURFACE is not a defect - it is the point: while an
     * abandon confirmation is up, the dock's scrim covers the HUD and the run
     * is paused. This asserts the narrower and actually-ratified rule: the
     * thing on top of a HUD control is never the board.
     */
    /*
     * SINGLE-FINGER FLICK MUST REACH THE STEERING LAYER, ALWAYS.
     *
     * Reported from real mobile play as unplayable: flicking rotated the board
     * instead of turning the snake. `FlickSurface` is a page-level layer at
     * z-index 5, and the arena bay paints at 20 so a twisted board can break
     * out over the HUD - but nothing between the bay and the page establishes
     * a stacking context, so everything inside the bay competed with flick
     * directly and won. The camera's grab surface, then a CHILD of the bay,
     * captured the gesture and handed it to OrbitControls.
     *
     * The fix is that input and paint no longer share a z-index: the grab
     * surface is a sibling at the board's old level and the bay is
     * pointer-transparent. This proves it, the only way that is meaningful -
     * by putting a layer with FlickSurface's exact geometry and z-index on the
     * page and asking the browser what a finger in the middle of the board
     * would hit.
     */
    const flickProbe = document.createElement('div');
    flickProbe.setAttribute('data-flick-probe', '');
    flickProbe.style.cssText = 'position:absolute;inset:0;z-index:5;touch-action:none;';
    /*
     * Mounted INSIDE the fixture root, which is where `FlickSurface` sits
     * relative to the cockpit in the live game: it is a sibling of the element
     * containing `.liveRoot`, and `.liveRoot` is `position: relative` with
     * `z-index: auto`, so flick and the cockpit's internals share one stacking
     * context. The fixture root carries its own z-index, so appending to
     * `body` would compare the probe against the whole fixture instead of
     * against the board - and would prove nothing.
     */
    root.appendChild(flickProbe);
    const boardRect = boardElement.getBoundingClientRect();
    const steeringTarget = document.elementFromPoint(
      boardRect.x + boardRect.width / 2,
      boardRect.y + boardRect.height / 2
    );
    const flickReachesBoard = steeringTarget === flickProbe;
    const steeringTargetName = steeringTarget
      ? `${steeringTarget.tagName.toLowerCase()}.${(steeringTarget.className || '').toString().split(' ')[0]}`
      : 'nothing';
    // With the steering layer gone, the camera must still be grabbable exactly
    // where the board is - a fix that killed camera control would be no fix.
    flickProbe.remove();
    const cameraTarget = document.elementFromPoint(
      boardRect.x + boardRect.width / 2,
      boardRect.y + boardRect.height / 2
    );
    const cameraGrabWorks = Boolean(
      cameraTarget?.closest('[data-arena-input-island]')
    );

    const arenaBay = document.querySelector('[data-testid="cockpit-arena-bay"]');
    const blockedControls = [...document.querySelectorAll('button')]
      .map((element) => {
        const box = element.getBoundingClientRect();
        if (box.width < 1 || box.height < 1) return null;
        const style = getComputedStyle(element);
        if (style.display === 'none' || style.visibility === 'hidden') return null;
        const top = document.elementFromPoint(
          box.x + box.width / 2,
          box.y + box.height / 2
        );
        if (top === element || element.contains(top)) return null;
        // Only the BOARD taking the click is a defect.
        if (!top || !arenaBay || !arenaBay.contains(top)) return null;
        const label =
          element.getAttribute('aria-label') ??
          element.textContent?.trim().slice(0, 24) ??
          'button';
        return `${label} <- ${top.tagName.toLowerCase()}`;
      })
      .filter(Boolean);

    const environment = root.querySelector('[data-testid="game-environment"]');
    const background = environment?.firstElementChild
      ? getComputedStyle(environment.firstElementChild)
      : null;

    return {
      flickReachesBoard,
      steeringTargetName,
      cameraGrabWorks,
      root: rect(root),
      board,
      frame,
      overlaps,
      blockedControls,
      smallText: leafText.filter(({ fontSize }) => fontSize < 14),
      buttons,
      scrollWidth: document.documentElement.scrollWidth,
      scrollHeight: document.documentElement.scrollHeight,
      backgroundImage: background?.backgroundImage ?? '',
      backgroundPosition: background?.backgroundPosition ?? '',
    };
  });
}

const browser = await chromium.launch({ headless: true });

try {
  for (const [width, height] of VIEWPORTS) {
    const context = await browser.newContext({
      viewport: { width, height },
      reducedMotion: 'reduce',
    });
    const page = await context.newPage();
    await page.addInitScript(() => {
      // constitution-allow: local-progress  isolated test consent fixture contains no player state
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

    let baseline = null;
    for (const variant of VARIANTS) {
      await page.goto(`${BASE_URL}/dev/cockpit?${variant}`, { waitUntil: 'domcontentloaded' });
      await page.locator('[data-testid="cockpit-prototype"]').waitFor({ state: 'visible' });
      await page.evaluate(async () => {
        await document.fonts.ready;
        await new Promise((resolve) =>
          requestAnimationFrame(() => requestAnimationFrame(resolve))
        );
      });
      await page.locator('[data-testid="cockpit-board"]').waitFor({ state: 'visible' });
      const metrics = await readMetrics(page);
      const prefix = `${width}x${height} (${variant})`;

      invariant(metrics.overlaps.length === 0, `${prefix}: HUD intersects board: ${metrics.overlaps.join(', ')}`);
      invariant(metrics.smallText.length === 0, `${prefix}: text below 14px: ${JSON.stringify(metrics.smallText)}`);
      invariant(metrics.scrollWidth === width, `${prefix}: horizontal overflow ${metrics.scrollWidth}px`);
      invariant(metrics.scrollHeight === height, `${prefix}: vertical overflow ${metrics.scrollHeight}px`);
      // Extension-agnostic on purpose: the contract is that the CANONICAL
      // authored plate is the backdrop, not which delivery format it is
      // served in. Pinning `.png` here would have made the WebP derivation a
      // verifier failure rather than the 91% saving it is.
      invariant(metrics.backgroundImage.includes('minimalistic_background_texture_of_space_1.'), `${prefix}: canonical background missing`);
      invariant(metrics.board.width >= Math.min(270, width * 0.82), `${prefix}: board is too small (${metrics.board.width}px)`);
      invariant(metrics.buttons.every(({ width: w, height: h }) => w >= 44 - EPSILON && h >= 44 - EPSILON), `${prefix}: control below 44px touch target`);
      invariant(
        metrics.blockedControls.length === 0,
        `${prefix}: board surface intercepts HUD controls: ${metrics.blockedControls.join('; ')}`
      );
      invariant(
        metrics.flickReachesBoard,
        `${prefix}: a single-finger flick over the board lands on ${metrics.steeringTargetName}, not the steering layer`
      );
      invariant(
        metrics.cameraGrabWorks,
        `${prefix}: the camera grab surface no longer covers the board`
      );

      const centerX = metrics.board.x + metrics.board.width / 2;
      const centerY = metrics.board.y + metrics.board.height / 2;
      invariant(near(centerX, width / 2, 1), `${prefix}: board is ${centerX - width / 2}px off horizontal center`);
      invariant(near(centerY, height / 2, width / height < 0.8 ? 8.1 : 1), `${prefix}: board is ${centerY - height / 2}px off vertical center`);

      if (baseline === null) {
        baseline = metrics;
      } else {
        for (const key of ['x', 'y', 'width', 'height']) {
          invariant(near(metrics.board[key], baseline.board[key]), `${prefix}: board ${key} shifted with telemetry state`);
          invariant(near(metrics.frame[key], baseline.frame[key]), `${prefix}: arena frame ${key} shifted with telemetry state`);
        }
      }
    }

    const expectedCrop = width / height < 0.8 ? '61% 52%' : height <= 500 ? '50% 47%' : '52% 50%';
    invariant(baseline?.backgroundPosition === expectedCrop, `${width}x${height}: expected crop ${expectedCrop}, got ${baseline?.backgroundPosition}`);
    console.log(`PASS ${width}x${height} — centered, protected, stable, readable`);
    await context.close();
  }
} finally {
  await browser.close();
}

console.log(`PASS ${VIEWPORTS.length} viewports × ${VARIANTS.length} cockpit states`);

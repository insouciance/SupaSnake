/**
 * Focused real-render audit for cockpit-v1 arena geometry.
 * Start the dev server before running this script.
 */

import { chromium } from 'playwright';

/**
 * How far the board's drawing surface overhangs its bay, per side.
 *
 * Mirrors `COCKPIT_CANVAS_OVERHANG` in
 * `src/components/game/screen/gameScreenTokens.ts`, which is the single source
 * the CSS token and `CameraRig`'s `COCKPIT_FIT_SCALE` are both derived from.
 * This script is plain node with no bundler, so it cannot import it; the
 * assertion below fails loudly if the two ever diverge, which is the point.
 */
const CANVAS_OVERHANG = 0.25;
const CANVAS_GROWTH = 1 + 2 * CANVAS_OVERHANG;

/**
 * THE ET-5 CANONICAL VIEWPOINT, MIRRORED FROM
 * `src/components/game/canonicalViewpoint.ts`.
 *
 * Same rule as CANVAS_OVERHANG above: plain node, no bundler, so the numbers
 * are copied and the assertion is what catches divergence. These are not a
 * restatement of a prop - `CameraRig` publishes what the camera ACTUALLY
 * rendered, measured back out of its position and live projection, onto the
 * canvas element. So this checks the pixels' camera, not the code's intent.
 *
 * The viewpoint was ratified by the owner on 2026-08-07 and recorded in
 * Product Constitution v1.16 (§5, §15 row 38). Changing any number here
 * without that ruling being amended first is the drift this gate exists to
 * stop - including "fixing" far/near back up to 0.70.
 */
const CANONICAL_AZIMUTH_DEG = 0;
const CANONICAL_POLAR_DEG = 28;
const CANONICAL_FOV = 44;
const CANONICAL_FIT_MULTIPLE = 1;
const CANONICAL_ANGLE_TOLERANCE_DEG = 0.5;
const CANONICAL_FIT_TOLERANCE = 0.01;
/**
 * far/near is only viewport-independent on landscape aspects (the fit becomes
 * depth-driven past ~1.13:1); portrait fits from further away and measures
 * HIGHER. So the exact pin applies to landscape cases and portrait is held to
 * the floor - which is the honest shape of the guarantee.
 */
const CANONICAL_FAR_NEAR_RATIO = 0.6774;
const CANONICAL_RATIO_TOLERANCE = 0.001;

const BASE_URL = process.env.COCKPIT_BASE_URL ?? 'http://127.0.0.1:3107';
const CASES = [
  { width: 390, height: 844, dynasty: 'PRIMAL', state: 'portal' },
  { width: 844, height: 390, dynasty: 'CYBER', state: 'active' },
  { width: 1440, height: 900, dynasty: 'PRIMAL', state: 'portal' },
  { width: 2560, height: 1080, dynasty: 'COSMIC', state: 'apex' },
];
const STRESS_CASES = [CASES[0], CASES[1], CASES[3]];

function invariant(condition, message) {
  if (!condition) throw new Error(message);
}

const browser = await chromium.launch({ headless: true });

async function measure(testCase, arena, density = 'standard') {
  const { width, height, dynasty, state } = testCase;
  const context = await browser.newContext({
    viewport: { width, height },
    reducedMotion: 'reduce',
  });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
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

  const query = new URLSearchParams({
    renderer: 'webgl',
    arena,
    dynasty,
    state,
    mode: 'anomaly',
    genes: '6',
    motion: 'reduced',
    effects: 'off',
    density,
  });
  await page.goto(`${BASE_URL}/dev/cockpit?${query}`, { waitUntil: 'domcontentloaded' });
  const host = page.locator('[data-testid="cockpit-webgl-board"]');
  await host.locator('canvas').waitFor({ state: 'visible' });
  await page.waitForFunction(() => {
    const element = document.querySelector('[data-testid="cockpit-webgl-board"]');
    // The camera pose is published by CameraRig's fit, which runs in an
    // effect before the first painted frame - so waiting on draw calls alone
    // would already imply it. Both are required explicitly so a missing
    // publish fails as a timeout on the thing that is missing.
    return (
      Number(element?.getAttribute('data-draw-calls')) > 0 &&
      element?.querySelector('canvas')?.dataset.cameraPolarDeg !== undefined
    );
  });

  const result = await host.evaluate((element) => {
    const hostRect = element.getBoundingClientRect();
    const canvas = element.querySelector('canvas');
    const canvasRect = canvas?.getBoundingClientRect();
    // The board's RECTANGLE, as distinct from its drawing surface. This is
    // what the HUD-overlap and decision-geometry audits measure against.
    const bay = document
      .querySelector('[data-testid="cockpit-board"]')
      ?.getBoundingClientRect();
    return {
      bay: bay ? { width: bay.width, height: bay.height } : null,
      camera: canvas
        ? {
            locked: canvas.dataset.cameraLocked ?? null,
            azimuthDeg: Number(canvas.dataset.cameraAzimuthDeg),
            polarDeg: Number(canvas.dataset.cameraPolarDeg),
            fitMultiple: Number(canvas.dataset.cameraFitMultiple),
            fov: Number(canvas.dataset.cameraFov),
            farNear: Number(canvas.dataset.cameraFarNear),
            published: canvas.dataset.cameraPolarDeg !== undefined,
          }
        : null,
      renderTier: element.getAttribute('data-render-tier'),
      drawCalls: Number(element.getAttribute('data-draw-calls')),
      triangles: Number(element.getAttribute('data-triangles')),
      density: element.getAttribute('data-fixture-density'),
      snakeCells: Number(element.getAttribute('data-fixture-snake-cells')),
      terrainCells: Number(element.getAttribute('data-fixture-terrain-cells')),
      host: { width: hostRect.width, height: hostRect.height },
      canvas: canvasRect
        ? { width: canvasRect.width, height: canvasRect.height }
        : null,
    };
  });
  const screenshot = await host.screenshot({ type: 'png' });
  await context.close();
  return { ...result, screenshotBytes: screenshot.length, errors };
}

try {
  const baselines = new Map();
  for (const testCase of CASES) {
    const released = await measure(testCase, 'released');
    const cockpit = await measure(testCase, 'cockpit');
    const label = `${testCase.width}x${testCase.height} ${testCase.dynasty}`;

    invariant(released.errors.length === 0, `${label}: released render error: ${released.errors.join('; ')}`);
    invariant(cockpit.errors.length === 0, `${label}: cockpit render error: ${cockpit.errors.join('; ')}`);
    invariant(cockpit.canvas !== null, `${label}: WebGL canvas missing`);

    /*
     * THE BOARD IS NO LONGER A SQUARE CLIPPED WELL, AND THIS IS WHERE THAT IS
     * ASSERTED.
     *
     * This used to require `|host.width - host.height| < 1`, because the arena
     * was an octagonal well sized to `min(100cqw, 100cqh)`. That shape was
     * removed deliberately: on desktop it made roughly half the bay's width
     * chassis, and zoom and pan ran straight into its clip-path, which is what
     * made both controls feel pointless. A square-host check now measures a
     * shape the product does not draw.
     *
     * The replacement is strictly stronger, not weaker. Squareness was one
     * loose relation between two numbers; the pop-out has an EXACT one, and it
     * is the relation that actually matters - the surface the board paints on
     * must be the bay grown by exactly the shared overhang on BOTH axes,
     * because the fit compensation in CameraRig is a single scalar and is only
     * correct while the growth is uniform. A non-uniform bleed would render the
     * board at the wrong size at rest, silently, on one aspect ratio.
     */
    invariant(cockpit.bay !== null, `${label}: board rectangle missing`);
    const expectedWidth = cockpit.bay.width * CANVAS_GROWTH;
    const expectedHeight = cockpit.bay.height * CANVAS_GROWTH;
    invariant(
      Math.abs(cockpit.host.width - expectedWidth) < 1,
      `${label}: paint surface is ${cockpit.host.width.toFixed(1)}px wide, expected ${expectedWidth.toFixed(1)} (bay x ${CANVAS_GROWTH})`
    );
    invariant(
      Math.abs(cockpit.host.height - expectedHeight) < 1,
      `${label}: paint surface is ${cockpit.host.height.toFixed(1)}px tall, expected ${expectedHeight.toFixed(1)} (bay x ${CANVAS_GROWTH})`
    );
    invariant(Math.abs(cockpit.canvas.width - cockpit.host.width) < 1, `${label}: canvas width does not fill host`);
    invariant(Math.abs(cockpit.canvas.height - cockpit.host.height) < 1, `${label}: canvas height does not fill host`);

    const callDelta = cockpit.drawCalls - released.drawCalls;
    invariant(callDelta <= 8, `${label}: cockpit adds ${callDelta} draw calls (budget 8)`);
    invariant(callDelta >= 0, `${label}: invalid negative draw-call comparison (${callDelta})`);
    invariant(cockpit.triangles > 0, `${label}: triangle telemetry missing`);

    /*
     * THE TIER TABLE IS HONOURED.
     *
     * The adaptive-quality governor resolves a tier from
     * `RENDER_QUALITY_TIERS`; this proves the board is rendering a real entry
     * from that table rather than an undefined quality object that happens to
     * read as "everything off". Which tier a runner settles at is its own
     * business - a headless software rasteriser is not a player device - so
     * this pins the CONTRACT (a valid tier, always published) and not a value.
     */
    for (const [tierLabel, measured] of [
      [`${label} released`, released],
      [`${label} cockpit`, cockpit],
    ]) {
      const tier = Number(measured.renderTier);
      invariant(
        measured.renderTier !== null && Number.isInteger(tier) && tier >= 0 && tier <= 4,
        `${tierLabel}: render tier is "${measured.renderTier}", not a tier from the table`
      );
    }
    /*
     * THE RATIFIED VIEWPOINT IS WHAT ACTUALLY RENDERS.
     *
     * Every number here is read back out of the posed camera by
     * `readViewpoint` - the same function the four-wall fairness gate asserts
     * on and the same one the dev surveyor's meter displays - so the tray, the
     * unit gate and this browser gate cannot report three different cameras.
     *
     * `locked` is the input half of the ruling: no OrbitControls exists on a
     * played board, so a `false` here means someone handed the fixture the dev
     * surveyor's free camera.
     */
    for (const [cameraLabel, measured] of [
      [`${label} released`, released],
      [`${label} cockpit`, cockpit],
    ]) {
      const camera = measured.camera;
      invariant(
        camera && camera.published,
        `${cameraLabel}: the camera published no viewpoint - CameraRig did not fit`
      );
      invariant(
        camera.locked === 'true',
        `${cameraLabel}: the board camera is not locked (data-camera-locked="${camera.locked}")`
      );
      invariant(
        Math.abs(camera.polarDeg - CANONICAL_POLAR_DEG) <= CANONICAL_ANGLE_TOLERANCE_DEG,
        `${cameraLabel}: pitch renders at ${camera.polarDeg}deg, not the ratified ${CANONICAL_POLAR_DEG}deg`
      );
      invariant(
        Math.abs(camera.azimuthDeg - CANONICAL_AZIMUTH_DEG) <= CANONICAL_ANGLE_TOLERANCE_DEG,
        `${cameraLabel}: azimuth renders at ${camera.azimuthDeg}deg, not the ratified ${CANONICAL_AZIMUTH_DEG}deg`
      );
      invariant(
        Math.abs(camera.fitMultiple - CANONICAL_FIT_MULTIPLE) <= CANONICAL_FIT_TOLERANCE,
        `${cameraLabel}: distance is ${camera.fitMultiple}x the auto-fit, not ${CANONICAL_FIT_MULTIPLE}x`
      );
      invariant(
        Math.abs(camera.fov - CANONICAL_FOV) < 0.01,
        `${cameraLabel}: fov renders at ${camera.fov}, not the ratified ${CANONICAL_FOV}`
      );
      // Landscape is where far/near is a constant; portrait fits from further
      // away and is held to the floor instead.
      const landscape = testCase.width >= testCase.height * 1.2;
      if (landscape) {
        invariant(
          Math.abs(camera.farNear - CANONICAL_FAR_NEAR_RATIO) <= CANONICAL_RATIO_TOLERANCE,
          `${cameraLabel}: far/near renders at ${camera.farNear}, not the ratified ${CANONICAL_FAR_NEAR_RATIO}`
        );
      } else {
        invariant(
          camera.farNear >= CANONICAL_FAR_NEAR_RATIO - CANONICAL_RATIO_TOLERANCE,
          `${cameraLabel}: far/near renders at ${camera.farNear}, below the ratified floor ${CANONICAL_FAR_NEAR_RATIO}`
        );
      }
    }

    invariant(cockpit.screenshotBytes > 5_000, `${label}: rendered image payload is empty`);
    baselines.set(`${testCase.width}x${testCase.height}:${testCase.dynasty}`, cockpit);

    console.log(
      `PASS ${label} — ${cockpit.drawCalls} calls (${callDelta >= 0 ? '+' : ''}${callDelta}), ${cockpit.triangles} triangles, camera az ${cockpit.camera.azimuthDeg} pitch ${cockpit.camera.polarDeg} fit ${cockpit.camera.fitMultiple} far/near ${cockpit.camera.farNear}`
    );
  }

  for (const testCase of STRESS_CASES) {
    const key = `${testCase.width}x${testCase.height}:${testCase.dynasty}`;
    const baseline = baselines.get(key);
    const stress = await measure(testCase, 'cockpit', 'extreme');
    const label = `${testCase.width}x${testCase.height} ${testCase.dynasty} dense`;
    invariant(Boolean(baseline), `${label}: standard baseline missing`);
    invariant(stress.errors.length === 0, `${label}: render error: ${stress.errors.join('; ')}`);
    invariant(stress.density === 'extreme', `${label}: wrong deterministic fixture mounted`);
    invariant(stress.snakeCells >= 150, `${label}: long snake fixture is too short (${stress.snakeCells})`);
    invariant(stress.terrainCells >= 80, `${label}: terrain fixture is not dense (${stress.terrainCells})`);
    invariant(stress.triangles > baseline.triangles, `${label}: actual long-snake/terrain render did not increase geometry`);
    invariant(stress.screenshotBytes > 8_000, `${label}: dense rendered image payload is empty`);
    console.log(
      `PASS ${label} — ${stress.snakeCells} snake cells, ${stress.terrainCells} terrain cells, ${stress.triangles} triangles`
    );
  }
} finally {
  await browser.close();
}

console.log(`PASS ${CASES.length} real WebGL cockpit profiles + ${STRESS_CASES.length} dense long-snake profiles`);

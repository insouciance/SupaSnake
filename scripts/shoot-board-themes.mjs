/**
 * NEON DYNASTY THEMES - the concept's review harness.
 *
 * CONCEPT TOOLING, not a gate. `verify:cockpit-webgl` and
 * `verify:cockpit-prototype` are the gates and they assert; this script only
 * LOOKS, because what is being decided here is a colour language and the owner
 * decides that with their eyes. It exists so the review can be reproduced
 * exactly - same viewport, same DPR, same crop, same wait - instead of from a
 * screenshot somebody took once by hand.
 *
 *   node scripts/shoot-board-themes.mjs [mode] [themes] [suffix]
 *
 *   mode     board   (default) the whole bay, one file per theme
 *            dense   the whole bay under the extreme fixture load - a long
 *                    coiled snake over a dense causal terrain field, which is
 *                    the state readability actually has to survive
 *            cubes   the CHARACTER close-up: the tail run and the head at the
 *                    scale the owner annotates them at. Round 3 added it
 *                    because the note that round was about a mark a few pixels
 *                    tall on a body cube, and a whole-bay shot cannot carry a
 *                    before/after of that. The crop is fixed so two runs of it
 *                    are comparable frame for frame.
 *            zoom    tile close-up: bevel, seam and a major crossing at DPR 4
 *            terrain calcified terrain against the board, DPR 3 - the
 *                    readability question that decides the cyan theme
 *            stats   draw calls and triangles per theme, with the shipped
 *                    stone board and the released arena as the baselines
 *   themes   comma list of cyber,primal,cosmic,stone (default all three neon)
 *   suffix   appended to the filename, for before/after pairs
 *
 * A running dev server is required; point BASE at it (default :3114) and OUT
 * at a directory to write into. TIER=0..4 pins the adaptive-quality tier, so
 * the "identity at every tier" contract can be looked at rather than assumed.
 *
 * PURPLE=underglow|frame|both drives THE BRAND PURPLE EXPERIMENT
 * (`?boardPurple=`), unset being the shipped board. The judgement sheet is four
 * passes of `dense` over all three themes - one per variant plus the off
 * baseline - which is twelve consistently framed shots of a crowded board.
 *
 * SNAKE=1|guide puts the 90s cartoon character on the board (see
 * `snake90s.ts`). The board and the character are ONE composition and the
 * owner reviews them together, so a board shot with the shipped snake on it is
 * answering a question nobody asked. PREFIX renames the files - use it to keep
 * a composition set apart from a board-only set.
 */

import { chromium } from 'playwright';

const BASE = process.env.BASE ?? 'http://127.0.0.1:3114';
const OUT = process.env.OUT ?? '/tmp';
const TIER = process.env.TIER;
const SNAKE = process.env.SNAKE;
/**
 * Camera polar angle in degrees. The ratified canonical gameplay view is 28,
 * and board relief is a function of exactly this number - a groove wall
 * projects at sin(polar) - so a review shot that is not taken at it is a
 * picture of a different board.
 */
const PITCH = process.env.PITCH;
const PREFIX = process.env.PREFIX ?? '';
/**
 * THE BRAND PURPLE EXPERIMENT: `underglow`, `frame`, `both`, or unset for the
 * shipped board. Unset is the A side of every pair - the review is four passes
 * over the same three themes, and the only thing that differs between them is
 * this value.
 */
const PURPLE = process.env.PURPLE;
/**
 * THE FOOD-STATE FIXTURE. `FOODS=variants` puts the golden and wager pickups
 * on the board beside the ordinary one (`?foods=variants`).
 *
 * The played board only ever mounts the ordinary pickup, so the three states
 * that have to be told apart at a glance exist in one frame nowhere else. A
 * distinctness rule can be unit-tested; whether a player reads it at 175ms on
 * a crowded board is decided by looking at all three at once, in each theme.
 */
const FOODS = process.env.FOODS;

/**
 * The scene's dynasty for each theme. `?boardTheme` is independent of
 * `?dynasty` on purpose - that is what lets a theme be flipped against one
 * fixed scene - but a review shot wants the pairing the game would actually
 * ship, so the snake, the food and the terrain in frame are that dynasty's.
 */
const SCENE_DYNASTY = {
  cyber: 'CYBER',
  primal: 'PRIMAL',
  cosmic: 'COSMIC',
  stone: 'CYBER',
};

const BOARD = '[data-testid="cockpit-webgl-board"]';
const BAY = '[data-testid="cockpit-arena-bay"]';

const mode = process.argv[2] ?? 'board';
const themes = (process.argv[3] ?? 'cyber,primal,cosmic').split(',');
const suffix = process.argv[4] ?? '';

function url(theme, extra = '') {
  const dynasty = SCENE_DYNASTY[theme] ?? 'PRIMAL';
  const tier = TIER === undefined ? '' : `&tier=${TIER}`;
  const snake = SNAKE === undefined ? '' : `&snake90s=${SNAKE}`;
  const pitch = PITCH === undefined ? '' : `&pitch=${PITCH}`;
  const purple = PURPLE === undefined ? '' : `&boardPurple=${PURPLE}`;
  const foods = FOODS === undefined ? '' : `&foods=${FOODS}`;
  return `${BASE}/dev/cockpit?renderer=webgl&state=active&dynasty=${dynasty}&boardTheme=${theme}${extra}${tier}${snake}${pitch}${purple}${foods}`;
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
    { timeout: 90000 }
  );
  await page.waitForTimeout(2500);
}

/**
 * The renderer's own counters, off the host element.
 *
 * `calls` and `triangles` are only meaningful with the COMPOSER OFF. Three
 * resets `renderer.info` every render, so with post-processing running the
 * last thing to reset it is the composer's final copy pass and the probe reads
 * that pass's one draw instead of the scene's. `stats` mode therefore runs
 * `effects=off`, exactly as `verify:cockpit-webgl` does, and the picture modes
 * report only the tier and the theme they actually rendered.
 */
async function readStats(page) {
  return page.evaluate((selector) => {
    const host = document.querySelector(selector);
    return {
      calls: Number(host.dataset.drawCalls),
      triangles: Number(host.dataset.triangles),
      tier: host.dataset.renderTier,
      theme: host.dataset.fixtureBoardTheme,
      foods: host.dataset.fixtureFoodStates,
      purple: host.dataset.fixtureBoardPurple,
    };
  }, BOARD);
}

/** A crop of the arena bay, in fractions of it. */
async function shoot(page, file, crop) {
  const box = await page.locator(BAY).boundingBox();
  const clip = crop
    ? {
        x: box.x + box.width * crop.x,
        y: box.y + box.height * crop.y,
        width: box.width * crop.width,
        height: box.height * crop.height,
      }
    : box;
  await page.screenshot({ path: file, clip });
  return file;
}

const MODES = {
  board: {
    viewport: { width: 1280, height: 820 },
    deviceScaleFactor: 2,
    query: '',
    crop: null,
    name: (theme) => `${PREFIX}board-theme-${theme}${suffix}.png`,
  },
  dense: {
    viewport: { width: 1280, height: 820 },
    deviceScaleFactor: 2,
    query: '&density=extreme',
    crop: null,
    name: (theme) => `${PREFIX}dense-${theme}${suffix}.png`,
  },
  cubes: {
    viewport: { width: 1280, height: 820 },
    deviceScaleFactor: 4,
    query: '',
    // The fixture's idle snake: the tail run, the corner and the head. Framed
    // to match the owner's own round-3 annotation so a before/after pair can
    // be laid side by side without either one being re-cropped by hand.
    crop: { x: 0.33, y: 0.55, width: 0.23, height: 0.26 },
    name: (theme) => `${PREFIX}cubes-${theme}${suffix}.png`,
  },
  heading: {
    viewport: { width: 1280, height: 820 },
    deviceScaleFactor: 4,
    query: '&density=extreme',
    /**
     * The dense fixture's HEAD, at the far corner of the coil.
     *
     * Round 3's orientation note is only answerable here: the standard fixture
     * draws bare cubes with no face at all (`StaticSnake` mounts `SnakeModel`,
     * which carries no eyes and no cosmetics), so the only surface on which
     * "which way is the character looking" is even a question is the crowded
     * board. The head sits at cell (3,3) - the START of the boustrophedon - and
     * the crop is centred on it.
     */
    crop: { x: 0.27, y: 0.17, width: 0.16, height: 0.18 },
    name: (theme) => `${PREFIX}heading-${theme}${suffix}.png`,
  },
  /**
   * THE FOOD CLOSE-UP - the supersession judgement.
   *
   * Same crop, same scale, same pose on both legs, so an old apple and a new
   * one can be laid side by side without either being re-cropped by hand. The
   * question this frame answers is the resemblance law: does the pickup belong
   * to the same cartoon as the character standing next to it? That is decided
   * at the scale the owner annotates at, not at board scale.
   *
   * Run it with FOODS=variants and all three states are in the crop together.
   */
  foods: {
    viewport: { width: 1280, height: 820 },
    deviceScaleFactor: 4,
    query: '&density=extreme',
    crop: { x: 0.56, y: 0.24, width: 0.22, height: 0.5 },
    name: (theme) => `${PREFIX}foods-${theme}${suffix}.png`,
  },
  zoom: {
    viewport: { width: 1280, height: 820 },
    deviceScaleFactor: 4,
    query: '',
    // Centre-left of the board: empty tiles, a major crossing, minor seams.
    crop: { x: 0.3, y: 0.22, width: 0.26, height: 0.24 },
    name: (theme) => `${PREFIX}zoom-${theme}${suffix}.png`,
  },
  terrain: {
    viewport: { width: 1280, height: 820 },
    deviceScaleFactor: 3,
    query: '&density=extreme',
    // Lower-left: the dense causal terrain field sits here.
    crop: { x: 0.16, y: 0.6, width: 0.5, height: 0.36 },
    name: (theme) => `${PREFIX}terrain-${theme}${suffix}.png`,
  },
};

const browser = await chromium.launch({
  args: ['--use-gl=angle', '--enable-unsafe-swiftshader'],
});

try {
  if (mode === 'stats') {
    /**
     * Effects OFF so the number is the SCENE's cost, not the composer's, and
     * one fixed dynasty so the only variable is the board. The stone row and
     * the released row are the two baselines the theme has to not move.
     */
    const cases = [
      ['stone    cockpit', 'boardTheme=stone&arena=cockpit'],
      ['cyan     cockpit', 'boardTheme=cyber&arena=cockpit'],
      ['sol      cockpit', 'boardTheme=primal&arena=cockpit'],
      ['dark     cockpit', 'boardTheme=cosmic&arena=cockpit'],
      ['stone    released', 'boardTheme=stone&arena=released'],
    ];
    const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
    for (const [label, query] of cases) {
      await page.goto(
        `${BASE}/dev/cockpit?renderer=webgl&state=active&dynasty=PRIMAL&effects=off&${query}`,
        { waitUntil: 'networkidle', timeout: 120000 }
      );
      await waitForBoard(page);
      const stats = await readStats(page);
      console.log(
        label.padEnd(18),
        `draws=${String(stats.calls).padStart(3)}`,
        `tris=${String(stats.triangles).padStart(7)}`,
        `tier=${stats.tier}`,
        `theme=${stats.theme}`
      );
    }
  } else {
    const preset = MODES[mode];
    if (!preset) {
      throw new Error(`unknown mode "${mode}" (board|dense|cubes|foods|heading|zoom|terrain|stats)`);
    }
    const page = await browser.newPage({
      viewport: preset.viewport,
      deviceScaleFactor: preset.deviceScaleFactor,
    });
    const errors = [];
    page.on('pageerror', (error) => errors.push(error.message));

    for (const theme of themes) {
      await page.goto(url(theme, preset.query), {
        waitUntil: 'networkidle',
        timeout: 120000,
      });
      // The consent banner is chrome, not board, and it sits over the bay on
      // a fresh profile. Hidden rather than dismissed so no state is written.
      await page.addStyleTag({
        content:
          '[data-testid="consent-banner"],[role="region"][aria-label*="ookie"]{display:none !important}',
      });
      await waitForBoard(page);
      const stats = await readStats(page);
      const file = await shoot(page, `${OUT}/${preset.name(theme)}`, preset.crop);
      console.log(
        JSON.stringify({
          requested: theme,
          rendered: stats.theme,
          // Read back off the host element rather than echoed from the URL, so
          // a shot whose filename says "underglow" is PROVEN to have rendered
          // one - a typo'd flag parses to null and would otherwise be filed as
          // a variant while showing the shipped board.
          purple: stats.purple,
          tier: stats.tier,
          foods: stats.foods,
          file,
        })
      );
    }
    if (errors.length) {
      console.log(`PAGE ERRORS:\n${errors.join('\n')}`);
      process.exitCode = 1;
    }
  }
} finally {
  await browser.close();
}

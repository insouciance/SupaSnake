/**
 * SETUP ROUND — review tooling, not a gate.
 *
 *   node scripts/shoot-setup-round.mjs [outDir]
 *
 * Shoots the four surfaces the owner's 2026-08-08 setup rulings changed, on a
 * running dev server (`SETUP_BASE_URL`, default :3198):
 *
 *   1. Run Setup on the dark ground, desktop and 390 phone, with the portraits
 *      filling the tray faces and exactly one card badged FLYING.
 *   2. The empty-state exception: a house with no favorite opens the
 *      dynasty-filtered picker.
 *   3. The Lab's SET AS FAVORITE affordance on the variant detail.
 *   4. The Daily Take, re-dressed as one of the creature's cubes.
 *   5. Phone landscape, where Setup's vertical budget is tightest.
 *
 * The collection is STUBBED so the three states the review needs all exist in
 * one frame: CYBER equipped and favorited (flying, badged), PRIMAL favorited
 * (full), COSMIC not favorited (the empty socket). Auth is real — a guest
 * session — because the surfaces under review only render for a signed-in
 * player and faking that would be shooting a different page.
 */
import { mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { chromium } from 'playwright';

const BASE_URL = process.env.SETUP_BASE_URL ?? 'http://127.0.0.1:3198';
const OUT = process.argv[2] ?? 'setup-shots';

/** The GLB streams in behind an AssetGate and the portraits take one frame. */
const SETTLE_MS = 6000;

const OWNED = [
  {
    id: 'setup-cyber',
    playerId: 'setup-player',
    isEquipped: true,
    isFavorited: true,
    generation: 5,
    variantName: 'Voltcoil',
    variantId: 'cyber',
    snakeVariantId: 'v-cyber',
    dynastyName: 'CYBER',
    parent1Id: null,
    parent2Id: null,
    acquiredAt: '2026-07-01T12:00:00.000Z',
    acquiredMethod: 'tutorial',
    traits: ['scavenger'],
    lineage: null,
  },
  {
    id: 'setup-primal',
    playerId: 'setup-player',
    isEquipped: false,
    isFavorited: true,
    generation: 3,
    variantName: 'Mossback',
    variantId: 'primal',
    snakeVariantId: 'v-primal',
    dynastyName: 'PRIMAL',
    parent1Id: null,
    parent2Id: null,
    acquiredAt: '2026-07-01T12:00:00.000Z',
    acquiredMethod: 'tutorial',
    traits: [],
    lineage: null,
  },
  {
    id: 'setup-cosmic',
    playerId: 'setup-player',
    isEquipped: false,
    isFavorited: false,
    generation: 2,
    variantName: 'Nova',
    variantId: 'cosmic',
    snakeVariantId: 'v-cosmic',
    dynastyName: 'COSMIC',
    parent1Id: null,
    parent2Id: null,
    acquiredAt: '2026-07-01T12:00:00.000Z',
    acquiredMethod: 'tutorial',
    traits: [],
    lineage: null,
  },
];

const ENERGY = {
  available: 6,
  capacity: 6,
  recoveryIntervalSeconds: 3600,
  recoveryStartedAt: '2026-08-08T08:00:00.000Z',
  nextRecoveryAt: null,
  recoveryProgress: 1,
  serverNow: '2026-08-08T08:30:00.000Z',
  remaining: 6,
  perDay: 6,
  usedToday: 0,
  day: '2026-08-08',
  refillsAt: null,
  visible: true,
};

const DYNASTY_ROWS = ['CYBER', 'PRIMAL', 'COSMIC'].map((name, index) => ({
  id: `d-${name.toLowerCase()}`,
  name,
  displayName: `${name} Dynasty`,
  description: 'A house with its own rules.',
  colorPrimary: '#facc15',
  colorSecondary: '#a855f7',
  statBonusType: 'size',
  statBonusValue: 0,
  sortOrder: index + 1,
  isActive: true,
  createdAt: '2026-07-01T12:00:00.000Z',
  updatedAt: '2026-07-01T12:00:00.000Z',
}));

const VARIANT_ROWS = OWNED.map((snake, index) => ({
  id: snake.snakeVariantId,
  dynastyId: `d-${snake.dynastyName.toLowerCase()}`,
  name: snake.variantName,
  rarity: 'common',
  loreText: 'A patient wall-coiler.',
  artUrl: null,
  baseStats: { speed: 10, size: 5, hp: 100 },
  unlockCostDna: 0,
  isStarter: true,
  sortOrder: index + 1,
  isActive: true,
  createdAt: '2026-07-01T12:00:00.000Z',
  updatedAt: '2026-07-01T12:00:00.000Z',
}));

const json = (route, body) =>
  route.fulfill({ status: 200, contentType: 'application/json', json: body });

async function installFixtures(context) {
  await context.route('**/api/player', (route) =>
    route.request().method() === 'GET'
      ? json(route, {
          player: { id: 'setup-player', total_games_played: 20, high_score: 10_000 },
          energy: ENERGY,
          charge: ENERGY,
          ladder: { available: true, attemptable: 3 },
          needsStarterSelection: false,
          hasCompletedFirstRun: true,
          aimSystem: 'deadeye',
        })
      : route.continue()
  );
  await context.route('**/api/collection', (route) =>
    route.request().method() === 'GET'
      ? json(route, { dnaBalance: 2_500, snakes: OWNED })
      : route.continue()
  );
  await context.route('**/api/dynasties', (route) =>
    route.request().method() === 'GET'
      ? json(route, { dynasties: DYNASTY_ROWS })
      : route.continue()
  );
  await context.route('**/api/variants', (route) =>
    route.request().method() === 'GET'
      ? json(route, { variants: VARIANT_ROWS })
      : route.continue()
  );
  await context.route('**/api/mastery', (route) =>
    route.request().method() === 'GET' ? json(route, { mastery: [] }) : route.continue()
  );
  await context.route('**/api/progression/lineage', (route) =>
    route.request().method() === 'GET'
      ? json(route, { live: true, dossiers: [] })
      : route.continue()
  );
  await context.route('**/api/game/session', (route) =>
    route.request().method() === 'GET'
      ? json(route, { activeRun: null })
      : route.continue()
  );
  /*
   * THE WARDROBE, EQUIPPED.
   *
   * The owner's clause is "the cosmetics should be visible", and the guide's
   * shades and braids are `default_owned` but not equipped for a fresh guest —
   * so an unstubbed wardrobe would shoot a bare head and prove nothing about
   * the clause. These are the two rows migration 069 seeds, worn.
   */
  await context.route('**/api/player/cosmetics', (route) =>
    route.request().method() === 'GET'
      ? json(route, {
          live: true,
          // COMPONENT ids, not item ids — `parseSnakeLoadout` carries what the
          // renderer resolves, and `SnakeCosmetics`' registry is keyed by
          // `shades_deadpan` / `braids_amber`.
          loadout: {
            face: 'shades_deadpan',
            crown: 'braids_amber',
            food_skin: null,
          },
          items: [
            {
              id: 'face_shades_deadpan',
              slot: 'face',
              name: 'Deadpan Shades',
              rarity: 'uncommon',
              component: 'shades_deadpan',
              owned: true,
              equipped: true,
              supporterOnly: false,
            },
            {
              id: 'crown_braids_amber',
              slot: 'crown',
              name: 'Amber Braids',
              rarity: 'uncommon',
              component: 'braids_amber',
              owned: true,
              equipped: true,
              supporterOnly: false,
            },
          ],
        })
      : route.continue()
  );
  // The Take has to be ON for its cube to exist at all — it renders `null`
  // when there is nothing to collect, which is the whole point of a token.
  await context.route('**/api/daily-take', (route) =>
    json(route, {
      live: true,
      firstRunOfDay: true,
      amount: 150,
      streakDays: 3,
      multiplier: 1.5,
      collected: false,
    })
  );
}

async function newPage(browser, width, height) {
  const context = await browser.newContext({
    viewport: { width, height },
    deviceScaleFactor: 2,
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
  await installFixtures(context);
  const page = await context.newPage();
  page.setDefaultTimeout(120_000);
  return { context, page };
}

async function signIn(page) {
  await page.goto(`${BASE_URL}/login`, { waitUntil: 'domcontentloaded' });
  await page.getByRole('button', { name: /play as guest/i }).click();
  await page.waitForTimeout(4000);
}

async function openSetup(page) {
  await page.goto(`${BASE_URL}/game`, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('[data-testid="run-setup"]', { timeout: 120_000 });
  await page.waitForTimeout(SETTLE_MS);
}

async function shoot(page, name) {
  await page.screenshot({ path: join(OUT, `${name}.png`) });
  console.log(`  wrote ${name}.png`);
}

async function main() {
  await mkdir(OUT, { recursive: true });
  const browser = await chromium.launch();

  // ---- 1. Setup, desktop -------------------------------------------------
  {
    const { context, page } = await newPage(browser, 1440, 900);
    await signIn(page);
    await openSetup(page);
    await shoot(page, '01-setup-desktop-1440');
    // The favorites row on its own, so the three faces can be read closely.
    const row = page.getByTestId('run-setup-favorites');
    await row.screenshot({ path: join(OUT, '02-setup-favorites-closeup.png') });
    console.log('  wrote 02-setup-favorites-closeup.png');
    await context.close();
  }

  // ---- 2. Setup, 390 phone, and the empty-socket picker -------------------
  {
    const { context, page } = await newPage(browser, 390, 844);
    await signIn(page);
    await openSetup(page);
    await shoot(page, '03-setup-mobile-390');

    // COSMIC is the house with no favorite under these fixtures.
    await page.getByTestId('run-setup-favorite-cosmic').click();
    await page.waitForSelector('[data-testid="snake-picker-sheet"]', { timeout: 60_000 });
    await page.waitForTimeout(900);
    await shoot(page, '04-setup-empty-socket-picker');
    await context.close();
  }

  // ---- 2b. THE VERTICAL BUDGET, MEASURED ---------------------------------
  //
  // A square face is a TALLER card than the one it replaces, and Setup's
  // binding constraint has always been that the Energy reactor survives above
  // the fold on a 320x568 phone (`run-flow.spec.ts` asserts exactly this). So
  // it is measured here rather than eyeballed off a screenshot.
  {
    const { context, page } = await newPage(browser, 320, 568);
    await signIn(page);
    for (const viewport of [
      { width: 320, height: 568 },
      { width: 375, height: 667 },
      { width: 390, height: 844 },
    ]) {
      await page.setViewportSize(viewport);
      await openSetup(page);
      const box = await page.evaluate(() => {
        const read = (id) => {
          const node = document.querySelector(`[data-testid="${id}"]`);
          if (!node) return null;
          const r = node.getBoundingClientRect();
          return { y: Math.round(r.y), bottom: Math.round(r.bottom) };
        };
        return {
          favorites: read('run-setup-favorites'),
          reactor: read('energy-commitment'),
          play: read('earn-start'),
          overflow: document.documentElement.scrollWidth - window.innerWidth,
        };
      });
      const fits =
        box.reactor && box.reactor.y >= 0 && box.reactor.bottom <= viewport.height + 1;
      console.log(
        `  ${viewport.width}x${viewport.height}  favorites→${box.favorites?.bottom}  reactor ${box.reactor?.y}..${box.reactor?.bottom}  play→${box.play?.y}  hOverflow=${box.overflow}  reactorFits=${fits}`
      );
      if (viewport.width === 320) await shoot(page, '03b-setup-compact-320x568');
    }
    await context.close();
  }

  // ---- 3. Setup, phone landscape -----------------------------------------
  {
    const { context, page } = await newPage(browser, 844, 390);
    await signIn(page);
    await openSetup(page);
    await shoot(page, '05-setup-phone-landscape-844x390');
    await context.close();
  }

  // ---- 4. The Lab's SET AS FAVORITE affordance ----------------------------
  {
    const { context, page } = await newPage(browser, 1440, 900);
    await signIn(page);
    await page.goto(`${BASE_URL}/lab`, { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('[data-testid="active-lineage-deck"]', { timeout: 120_000 });
    await page.waitForTimeout(3000);
    await page.locator('[data-testid="active-lineage-deck"] button').first().click();
    await page.waitForSelector('[data-testid="variant-action-row"]', { timeout: 60_000 });
    await page.waitForTimeout(1200);
    await shoot(page, '06-lab-set-favorite');
    await page
      .getByTestId('variant-action-row')
      .screenshot({ path: join(OUT, '07-lab-set-favorite-closeup.png') });
    console.log('  wrote 07-lab-set-favorite-closeup.png');
    // And the ON state, one tap later.
    await page.getByTestId('variant-favorite-toggle').click();
    await page.waitForTimeout(1200);
    await page
      .getByTestId('variant-action-row')
      .screenshot({ path: join(OUT, '08-lab-favorited-closeup.png') });
    console.log('  wrote 08-lab-favorited-closeup.png');
    await context.close();
  }

  // ---- 5. The Daily Take cube on Home -------------------------------------
  {
    const { context, page } = await newPage(browser, 390, 844);
    await signIn(page);
    await page.goto(`${BASE_URL}/`, { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('[data-testid="daily-take-float"]', { timeout: 120_000 });
    await page.waitForTimeout(SETTLE_MS);
    await shoot(page, '09-home-daily-take-cube');
    const take = page.getByTestId('daily-take-float');
    const box = await take.boundingBox();
    if (box) {
      await page.screenshot({
        path: join(OUT, '10-home-daily-take-closeup.png'),
        clip: {
          x: Math.max(0, box.x - 34),
          y: Math.max(0, box.y - 22),
          width: box.width + 68,
          height: box.height + 66,
        },
      });
      console.log('  wrote 10-home-daily-take-closeup.png');
    }
    await context.close();
  }

  await browser.close();
  console.log(`\nsetup-round shots -> ${OUT}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});

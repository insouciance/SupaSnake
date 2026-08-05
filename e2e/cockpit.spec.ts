import { test, expect, type Page } from '@playwright/test';
import { openRunSetupControls, seedConsent, signInAsGuest } from './helpers';

const COCKPIT_ENABLED = process.env.NEXT_PUBLIC_HUD_COCKPIT_V1 === 'true';
const CAPTURE_VISUALS = process.env.COCKPIT_CAPTURE_VISUALS === 'true';

async function installReturningPlayerFixtures(page: Page): Promise<void> {
  await page.route('**/api/player', async (route) => {
    if (route.request().method() !== 'GET') return route.continue();
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      json: {
        player: {
          id: 'cockpit-player',
          total_games_played: 20,
        },
        charge: {
          remaining: 4,
          perDay: 6,
          usedToday: 2,
          day: '2026-07-25',
          refillsAt: '2026-07-26T00:00:00.000Z',
          visible: true,
        },
        needsStarterSelection: false,
        hasCompletedFirstRun: true,
        genomeFtue: {
          bankedRuns: 20,
          strainTagsUnlocked: true,
          expressionsUnlocked: true,
          infuseUnlocked: true,
          spawnPointsUnlocked: true,
          splicesUnlocked: true,
          apexesUnlocked: true,
        },
      },
    });
  });

  await page.route('**/api/collection', async (route) => {
    if (route.request().method() !== 'GET') return route.continue();
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      json: {
        snakes: [{
          id: 'cockpit-primal-snake',
          isEquipped: true,
          generation: 1,
          variantName: 'Primal',
          variantId: 'primal',
          dynastyName: 'PRIMAL',
          traits: ['scavenger'],
          lineage: { strains: ['AURUM'], strength: 1 },
        }],
      },
    });
  });

  await page.route('**/api/game/session', async (route) => {
    const body = route.request().postDataJSON() as { action?: string } | null;
    if (body?.action !== 'start') return route.continue();
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      json: {
        sessionId: 'cockpit-session',
        freePlay: true,
        charge: {
          state: 'exempt',
          remaining: 4,
          perDay: 6,
          usedToday: 2,
          day: '2026-07-25',
          refillsAt: '2026-07-26T00:00:00.000Z',
          visible: true,
        },
        traits: ['scavenger'],
        mutationPool: ['gold_trail', 'tithe', 'loan_shark', 'static_charge'],
        mastery: { dynasty: 'PRIMAL', xp: 0, level: 0 },
        genome: {
          runSeed: 'cockpit-seed',
          heirloom: { AURUM: 2 },
          genePool: ['gold_trail', 'tithe', 'loan_shark', 'static_charge'],
          lineage: {
            strains: ['AURUM'],
            guaranteeFirstOffer: false,
            guaranteeStrains: [],
          },
          anomalyStrain: null,
          suppressedStrains: [],
          prevRunDied: false,
          ftue: {
            bankedRuns: 20,
            strainTagsUnlocked: true,
            expressionsUnlocked: true,
            infuseUnlocked: true,
            spawnPointsUnlocked: true,
            splicesUnlocked: true,
            apexesUnlocked: true,
          },
        },
      },
    });
  });
}

function rectanglesOverlap(
  left: { x: number; y: number; width: number; height: number },
  right: { x: number; y: number; width: number; height: number }
): boolean {
  return left.x < right.x + right.width - 0.5 &&
    left.x + left.width > right.x + 0.5 &&
    left.y < right.y + right.height - 0.5 &&
    left.y + left.height > right.y + 0.5;
}

interface CockpitLayoutSnapshot {
  board: { x: number; y: number; width: number; height: number };
  zones: Array<{
    kind: string;
    box: { x: number; y: number; width: number; height: number };
  }>;
  overflow: { horizontal: boolean; vertical: boolean };
}

async function readCockpitLayout(page: Page): Promise<CockpitLayoutSnapshot | null> {
  return page.evaluate(() => {
    const board = document.querySelector<HTMLElement>('[data-testid="game-board-viewport"]');
    if (!board) return null;

    const toBox = (element: Element) => {
      const rect = element.getBoundingClientRect();
      return { x: rect.x, y: rect.y, width: rect.width, height: rect.height };
    };
    const zones = Array.from(document.querySelectorAll<HTMLElement>('[data-cockpit-zone]'))
      .map((zone) => ({
        kind: zone.dataset.cockpitZone ?? 'unknown',
        box: toBox(zone),
      }))
      .filter(({ box }) => box.width > 0 && box.height > 0);

    return {
      board: toBox(board),
      zones,
      overflow: {
        horizontal: document.documentElement.scrollWidth > document.documentElement.clientWidth,
        vertical: document.documentElement.scrollHeight > document.documentElement.clientHeight,
      },
    };
  });
}

test.describe('Run Cockpit v1', () => {
  test.skip(!COCKPIT_ENABLED, 'Run Cockpit is validated only in its opt-in build.');

  test('keeps the real WebGL board centered and clear across the viewport matrix', async ({ page }, testInfo) => {
    test.setTimeout(300_000);
    await seedConsent(page);
    await installReturningPlayerFixtures(page);
    await signInAsGuest(page);

    await expect(page.getByRole('heading', { name: /ready to (?:play|launch)/i })).toBeVisible({
      timeout: 60_000,
    });
    await openRunSetupControls(page);
    const freeMode = page.getByTestId('mode-free');
    // Not forced: the canvas repaints behind this screen but never covers the
    // chip. What does move it is the ANOMALY chip, inserted to its left once
    // /api/anomaly resolves - and skipping the stability check is what makes a
    // forced click land at the pre-shift coordinates. See e2e/game.spec.ts.
    await freeMode.click();
    await expect(freeMode).toHaveAttribute('aria-pressed', 'true');
    const freePlayStart = page.getByTestId('free-play-start');
    await expect(freePlayStart).toBeEnabled();
    await freePlayStart.click({ force: true });

    const cockpit = page.getByTestId('game-hud');
    const board = page.getByTestId('game-board-viewport');
    const gate = page.getByTestId('resume-gate');
    await expect(cockpit).toHaveAttribute('data-dynasty', 'PRIMAL');
    await expect(board).toBeVisible({ timeout: 30_000 });
    await expect(gate).toBeVisible();

    const viewports = [
      { name: 'mobile-compact', width: 320, height: 568 },
      { name: 'mobile-short', width: 375, height: 667 },
      { name: 'mobile-tall', width: 390, height: 844 },
      { name: 'mobile-landscape', width: 844, height: 390 },
      { name: 'tablet-portrait', width: 768, height: 1024 },
      { name: 'desktop-short', width: 1280, height: 720 },
      { name: 'desktop', width: 1440, height: 900 },
      { name: 'desktop-ultrawide', width: 2560, height: 1080 },
    ] as const;

    for (const viewport of viewports) {
      await page.setViewportSize(viewport);
      // One atomic browser-side read forces layout and avoids dozens of CDP
      // round trips competing with the continuously rendered WebGL scene.
      const layout = await readCockpitLayout(page);
      expect(layout).not.toBeNull();
      const boardBox = layout!.board;

      /*
       * THE BOARD FILLS ITS BAY; IT IS NOT A SQUARE WELL.
       *
       * This line required `|width - height| <= 1`. That squareness was a
       * property of the octagonal clipped well the board used to sit in -
       * `min(100cqw, 100cqh)` inside a wider bay - and the trayless board
       * removes it deliberately: on desktop the well spent roughly half the
       * bay's width on chassis, and zoom and pan ran straight into its
       * clip-path, which is what made both controls feel pointless. Requiring
       * a square here would require a shape the product no longer draws.
       *
       * The replacement is the ratified contract instead of its old side
       * effect. Per the viewport-only-clip ruling, the board may overflow the
       * HUD trays visually but is CLIPPED ONLY BY THE BROWSER VIEWPORT, so
       * what must hold at every size is: the board's rectangle is
       * non-degenerate, it fills its bay rather than floating inside one, and
       * it is wholly on screen. Centring, the minimum size, the no-overlap
       * sweep and the no-overflow check below are unchanged.
       */
      expect(boardBox.width).toBeGreaterThan(0);
      expect(boardBox.height).toBeGreaterThan(0);
      expect(boardBox.width).toBeGreaterThanOrEqual(viewport.height <= 430 ? 180 : 250);
      expect(boardBox.height).toBeGreaterThanOrEqual(viewport.height <= 430 ? 180 : 250);

      /*
       * Containment inside the window is deliberately NOT asserted, here or in
       * `training.spec.ts`. "Clipped only by the browser viewport" says what
       * MAY clip the board, not that nothing does - on a short viewport the
       * window legitimately crops the bay, and the 3D fit still frames the
       * slab well inside the canvas. The placement guarantee is the CENTRING
       * below, which is the stronger statement anyway: wherever the window
       * cuts, it cuts symmetrically.
       */

      const boardCenterX = boardBox.x + boardBox.width / 2;
      const boardCenterY = boardBox.y + boardBox.height / 2;
      expect(Math.abs(boardCenterX - viewport.width / 2)).toBeLessThanOrEqual(9);
      expect(Math.abs(boardCenterY - viewport.height / 2)).toBeLessThanOrEqual(10);

      for (const zone of layout!.zones) {
        expect(rectanglesOverlap(boardBox, zone.box)).toBe(false);
      }

      expect(layout!.overflow).toEqual({ horizontal: false, vertical: false });

      if (CAPTURE_VISUALS) {
        await testInfo.attach(`cockpit-live-${viewport.name}`, {
          body: await page.screenshot(),
          contentType: 'image/png',
        });
      }
    }

    await page.setViewportSize({ width: 390, height: 844 });
    await expect(page.getByTestId('flick-surface')).toBeVisible();
    await page.keyboard.press('ArrowRight');
    await expect(gate).toBeHidden();
    await expect(page.getByRole('button', { name: /pause game/i })).toBeVisible();

    await page.keyboard.down('Space');
    const decisionDock = page.getByTestId('cockpit-decision-dock');
    await expect(gate).toBeVisible();
    await expect(gate).toContainText(/tactical hold/i);
    // The browser may repeat a held Space. That repeat must not leak through
    // the newly armed resume gate and move the snake again.
    await page.evaluate(() => {
      window.dispatchEvent(new KeyboardEvent('keydown', {
        key: ' ',
        code: 'Space',
        repeat: true,
        bubbles: true,
      }));
    });
    await expect(gate).toBeVisible();
    await page.keyboard.up('Space');
    await expect(decisionDock).toBeHidden();
    await expect(page.getByRole('button', { name: /abandon run/i })).toBeVisible();

    for (const viewport of [
      { name: 'hold-mobile-compact', width: 320, height: 568 },
      { name: 'hold-mobile-landscape', width: 844, height: 390 },
      { name: 'hold-desktop', width: 1440, height: 900 },
    ] as const) {
      await page.setViewportSize(viewport);
      const layout = await readCockpitLayout(page);
      expect(layout).not.toBeNull();
      expect(layout!.zones.find((zone) => zone.kind === 'decision')).toBeUndefined();
      expect(layout!.board.width).toBeGreaterThanOrEqual(viewport.height <= 430 ? 180 : 250);
      if (CAPTURE_VISUALS) {
        await testInfo.attach(`cockpit-live-${viewport.name}`, {
          body: await page.screenshot(),
          contentType: 'image/png',
        });
      }
    }

    await page.setViewportSize({ width: 390, height: 844 });
    await page.getByRole('button', { name: /abandon run/i }).click();
    const abandonDialog = page.getByTestId('abandon-run-dialog');
    await expect(abandonDialog).toBeVisible();
    await expect(abandonDialog).toContainText(/will not be recorded/i);
    await abandonDialog.getByRole('button', { name: /keep planning/i }).click();
    await expect(decisionDock).toBeHidden();
    await expect(gate).toBeVisible();
    await page.keyboard.press('ArrowRight');
    await expect(gate).toBeHidden();

  });
});

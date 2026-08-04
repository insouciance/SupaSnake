import { test, expect } from '@playwright/test';
import { openRunSetupControls, seedConsent, signInAsGuest } from './helpers';

const COCKPIT_ENABLED = process.env.NEXT_PUBLIC_HUD_COCKPIT_V1 === 'true';

test.describe('Genome capability UI', () => {
  test('reveals Build Seed and keeps the full telemetry deck clear of the board', async ({ page }, testInfo) => {
    test.setTimeout(300_000);
    await seedConsent(page);

    // This is a layout/input journey, not a hosted-database bootstrap test.
    // Install the returning-player fixture before /game mounts so migration
    // rollout state cannot make the HUD assertions flaky.
    await page.route('**/api/player', async (route) => {
      if (route.request().method() !== 'GET') return route.continue();
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        json: {
          player: {
            id: 'playwright-player',
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
          snakes: [
            {
              id: 'playwright-primal-snake',
              isEquipped: true,
              generation: 1,
              variantName: 'Playwright Primal',
              variantId: 'primal',
              dynastyName: 'PRIMAL',
              traits: ['scavenger'],
              lineage: { strains: ['AURUM'], strength: 1 },
            },
          ],
        },
      });
    });

    await page.route('**/api/game/session', async (route) => {
      const request = route.request();
      const body = request.postDataJSON() as { action?: string } | null;
      if (body?.action !== 'start') return route.continue();
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        json: {
          sessionId: 'playwright-genome-session',
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
            runSeed: 'playwright-genome-seed',
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

    await signInAsGuest(page);
    await expect(page.getByRole('heading', { name: /ready to (?:play|launch)/i })).toBeVisible({
      timeout: 60_000,
    });
    await openRunSetupControls(page);
    await expect(page.getByTestId('build-seed')).toBeVisible({ timeout: 60_000 });
    // Heirlooms are NO LONGER inside Build Seed. WP-2.07a moved them into
    // `heirloom-summary`, which renders ungated, because traits are always
    // live at settlement while the spawn points beside them genuinely are
    // not below 12 banked runs — the old code gated both on one flag and
    // conflated two different facts. Asserting the new location is the
    // stronger claim: it fails if the traits ever slide back behind the
    // ramp, which is the regression that made Ascetic unknowable on a phone.
    await expect(page.getByTestId('heirloom-summary')).toContainText(/heirlooms/i);
    await expect(page.getByTestId('build-seed')).not.toContainText(/heirlooms/i);
    const researchLink = page.getByRole('link', {
      name: 'Open Genome Research',
      exact: true,
    });
    await expect(researchLink).toBeVisible();
    await expect(researchLink).toHaveAttribute('href', '/codex');

    const freeMode = page.getByTestId('mode-free');
    await freeMode.click();
    await expect(freeMode).toHaveAttribute('aria-pressed', 'true');
    const freePlayStart = page.getByTestId('free-play-start');
    await expect(freePlayStart).toBeEnabled();
    await freePlayStart.click();
    await expect(page.getByTestId('strain-meter')).toBeVisible({ timeout: 20_000 });
    // The meter tile's accessible name is its `title`: the Path identity and
    // the rung it has reached. The previous regex here (`Aurum 2 of 4, tier
    // 1`) matched no string this component has rendered on `origin/main`
    // either — it described an aria-label that had already moved to the pip
    // group. Assert what the element actually exposes.
    await expect(page.getByTestId('strain-meter-AURUM')).toHaveAccessibleName(
      /Make food worth more\./i
    );

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
    const measurements: Array<Record<string, number | string>> = [];

    for (const viewport of viewports) {
      await page.setViewportSize(viewport);
      await page.evaluate(
        () =>
          new Promise<void>((resolve) =>
            requestAnimationFrame(() => requestAnimationFrame(() => resolve()))
          )
      );

      // Read the settled geometry in one browser task. Four sequential
      // locator.boundingBox() protocol calls can stall under software WebGL
      // load even though every target is already visible.
      const { hud, board, gateBox, strain } = await page.evaluate(() => {
        const bounds = (testId: string) => {
          const element = document.querySelector<HTMLElement>(
            `[data-testid="${testId}"]`
          );
          if (!element || element.getClientRects().length === 0) return null;
          const { x, y, width, height } = element.getBoundingClientRect();
          return { x, y, width, height };
        };

        return {
          hud: bounds('game-hud'),
          board: bounds('game-board-viewport'),
          gateBox: bounds('resume-gate'),
          strain: bounds('strain-meter'),
        };
      });
      expect(hud).not.toBeNull();
      expect(board).not.toBeNull();
      expect(strain).not.toBeNull();
      if (COCKPIT_ENABLED) {
        const boardCenterX = board!.x + board!.width / 2;
        const boardCenterY = board!.y + board!.height / 2;
        expect(Math.abs(boardCenterX - viewport.width / 2)).toBeLessThanOrEqual(9);
        expect(Math.abs(boardCenterY - viewport.height / 2)).toBeLessThanOrEqual(10);
        if (gateBox) {
          expect(gateBox.y + gateBox.height).toBeLessThanOrEqual(board!.y + 0.5);
        } else {
          expect(viewport.height).toBeLessThanOrEqual(430);
        }
      } else {
        expect(gateBox).not.toBeNull();
        expect(board!.y).toBeGreaterThanOrEqual(hud!.y + hud!.height - 0.5);
        expect(gateBox!.y).toBeGreaterThanOrEqual(board!.y);
        expect(gateBox!.y + gateBox!.height).toBeLessThanOrEqual(
          board!.y + board!.height + 0.5
        );
      }
      expect(board!.height).toBeGreaterThanOrEqual(
        viewport.height <= 430 ? 180 : Math.min(360, viewport.height * 0.5)
      );

      const hasHorizontalOverflow = await page.evaluate(
        () => document.documentElement.scrollWidth > document.documentElement.clientWidth
      );
      expect(hasHorizontalOverflow).toBe(false);

      measurements.push({
        viewport: viewport.name,
        width: viewport.width,
        height: viewport.height,
        hudBottom: Math.round((hud!.y + hud!.height) * 10) / 10,
        boardTop: Math.round(board!.y * 10) / 10,
        boardHeight: Math.round(board!.height * 10) / 10,
      });
      await testInfo.attach(`hud-${viewport.name}`, {
        body: await page.screenshot(),
        contentType: 'image/png',
      });
    }

    await testInfo.attach('hud-layout-measurements', {
      body: Buffer.from(JSON.stringify(measurements, null, 2)),
      contentType: 'application/json',
    });

    // Mobile flick: a deliberate duplicate of the opening RIGHT heading is
    // still a valid start command. The gate must disappear only after the
    // recognizer crosses its threshold. FTUE v2 uses a quieter first-run
    // prompt; returning players retain the full Ready treatment.
    await page.setViewportSize({ width: 390, height: 844 });
    const gate = page.getByTestId('resume-gate');
    const flickSurface = page.getByTestId('flick-surface');
    await expect(gate).toContainText(
      /Ready!|Swipe or press an arrow to move|(?:Flick|Tap) a direction to start/
    );
    await expect(page.getByRole('button', { name: /pause game/i })).toBeHidden();
    const flickBox = await flickSurface.boundingBox();
    expect(flickBox).not.toBeNull();
    const flickY = Math.max(flickBox!.y + 40, flickBox!.y + flickBox!.height / 2);
    await flickSurface.dispatchEvent('pointerdown', {
      pointerId: 41,
      pointerType: 'touch',
      isPrimary: true,
      clientX: flickBox!.x + 80,
      clientY: flickY,
    });
    await flickSurface.dispatchEvent('pointermove', {
      pointerId: 41,
      pointerType: 'touch',
      isPrimary: true,
      clientX: flickBox!.x + 130,
      clientY: flickY,
    });
    await flickSurface.dispatchEvent('pointerup', {
      pointerId: 41,
      pointerType: 'touch',
      isPrimary: true,
      clientX: flickBox!.x + 130,
      clientY: flickY,
    });
    await expect(gate).toBeHidden();

    // The rollback HUD retains its legacy two-step pause menu. The refined
    // cockpit enters tactical hold directly, so movement remains the only
    // resume action.
    await page.keyboard.press('p');
    const pausedHeading = page.getByRole('heading', { name: /^paused$/i });
    if (!COCKPIT_ENABLED) {
      await expect(pausedHeading).toBeVisible();
      await page.keyboard.press('Escape');
      await expect(gate).toContainText('Choose Your Line');
      await page.keyboard.press('ArrowRight');
      await expect(gate).toBeHidden();
      return;
    }

    await expect(pausedHeading).toBeHidden();
    await expect(gate).toContainText(/tactical hold/i);
    await expect(page.getByRole('button', { name: /abandon run/i })).toBeVisible();

    // Tactical hold never replaces the board. Portrait uses the status deck;
    // short landscape uses a compact chassis rail because its status deck is
    // intentionally collapsed.
    for (const viewport of [
      { name: 'planning-mobile-compact', width: 320, height: 568 },
      { name: 'planning-mobile-tall', width: 390, height: 844 },
      { name: 'planning-mobile-landscape', width: 844, height: 390 },
    ] as const) {
      await page.setViewportSize(viewport);
      await page.evaluate(
        () =>
          new Promise<void>((resolve) =>
            requestAnimationFrame(() => requestAnimationFrame(() => resolve()))
          )
      );
      const heldBoard = await page.getByTestId('game-board-viewport').boundingBox();
      expect(heldBoard).not.toBeNull();
      expect(heldBoard!.height).toBeGreaterThanOrEqual(180);
      await expect(page.getByTestId('cockpit-decision-dock')).toBeHidden();
      if (viewport.height <= 430) {
        await expect(page.getByTestId('tactical-hold')).toBeVisible();
      } else {
        await expect(gate).toBeVisible();
      }
      await testInfo.attach(viewport.name, {
        body: await page.screenshot(),
        contentType: 'image/png',
      });
    }
    await page.setViewportSize({ width: 390, height: 844 });
    await page.waitForTimeout(700);
    await expect(gate).toContainText(/tactical hold/i);

    // Escape/P do not bounce into a redundant pause screen. A reversal is
    // rejected while held; a duplicate safe direction deliberately resumes.
    await page.keyboard.press('Escape');
    await expect(gate).toContainText(/tactical hold/i);
    await page.keyboard.press('p');
    await expect(gate).toContainText(/tactical hold/i);
    await page.keyboard.press('ArrowLeft');
    await expect(gate).toContainText(/tactical hold/i);
    await page.keyboard.press('ArrowRight');
    await expect(gate).toBeHidden();

    // Pause cannot be spammed in the 600ms rearm window. Once rearmed, the
    // cockpit enters hold directly. The abandon confirmation blocks movement
    // leakage and cancel returns to the same frozen tactical state.
    await page.keyboard.press('p');
    await expect(gate).toBeHidden();
    await page.waitForTimeout(650);
    await page.keyboard.press('p');
    await expect(gate).toContainText(/tactical hold/i);
    await page.getByRole('button', { name: /abandon run/i }).click();
    const abandonDialog = page.getByTestId('abandon-run-dialog');
    await expect(abandonDialog).toBeVisible();
    await page.keyboard.press('ArrowRight');
    await expect(abandonDialog).toBeVisible();
    await abandonDialog.getByRole('button', { name: /keep planning/i }).click();
    await expect(gate).toContainText(/tactical hold/i);
    await page.keyboard.press('Space');
    await expect(gate).toBeHidden();

  });
});

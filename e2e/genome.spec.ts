import { test, expect } from '@playwright/test';
import { seedConsent, signInAsGuest } from './helpers';

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
            energy: 5,
            max_energy: 5,
            energy_regen_at: null,
            total_games_played: 20,
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
          energy: 5,
          energyRegenAt: null,
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
    await expect(page.getByRole('heading', { name: /ready to play/i })).toBeVisible({
      timeout: 60_000,
    });
    await expect(page.getByTestId('build-seed')).toBeVisible({ timeout: 60_000 });
    await expect(page.getByTestId('build-seed')).toContainText(/heirlooms/i);
    await expect(page.getByRole('link', { name: /open codex/i })).toBeVisible();

    const freeMode = page.getByTestId('mode-free');
    await freeMode.click();
    await expect(freeMode).toHaveAttribute('aria-pressed', 'true');
    const freePlayStart = page.getByTestId('free-play-start');
    await expect(freePlayStart).toBeEnabled();
    await freePlayStart.click();
    await expect(page.getByTestId('strain-meter')).toBeVisible({ timeout: 20_000 });
    await expect(page.getByTestId('strain-meter-AURUM')).toContainText('Aurum');

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

      const hud = await page.getByTestId('game-hud').boundingBox();
      const board = await page.getByTestId('game-board-viewport').boundingBox();
      const gateBox = await page.getByTestId('resume-gate').boundingBox();
      const strain = await page.getByTestId('strain-meter').boundingBox();
      expect(hud).not.toBeNull();
      expect(board).not.toBeNull();
      expect(gateBox).not.toBeNull();
      expect(strain).not.toBeNull();
      expect(board!.y).toBeGreaterThanOrEqual(hud!.y + hud!.height - 0.5);
      expect(gateBox!.y).toBeGreaterThanOrEqual(board!.y);
      expect(gateBox!.y + gateBox!.height).toBeLessThanOrEqual(
        board!.y + board!.height + 0.5
      );
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
    await expect(gate).toContainText(/Ready!|Swipe or press an arrow to move/);
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

    // Escape arms a move, the board remains gated across multiple would-be
    // ticks, a reversal is rejected, and a duplicate direction deliberately
    // resumes. P and Escape both return between menu and held board.
    await page.keyboard.press('p');
    const pausedHeading = page.getByRole('heading', { name: /^paused$/i });
    await expect(pausedHeading).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(gate).toContainText('Choose Your Line');

    // Planning is only useful when the frozen board remains readable. The
    // compact hold banner must stay near the board's top and leave most of
    // even the short-landscape playfield exposed.
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
      const heldBanner = await gate.boundingBox();
      expect(heldBoard).not.toBeNull();
      expect(heldBanner).not.toBeNull();
      expect(heldBanner!.y).toBeGreaterThanOrEqual(heldBoard!.y);
      expect(heldBanner!.y).toBeLessThanOrEqual(heldBoard!.y + 24);
      expect(heldBanner!.height).toBeLessThanOrEqual(
        Math.min(84, heldBoard!.height * 0.35)
      );
      expect(heldBoard!.height - heldBanner!.height).toBeGreaterThanOrEqual(180);
      await testInfo.attach(viewport.name, {
        body: await page.screenshot(),
        contentType: 'image/png',
      });
    }
    await page.setViewportSize({ width: 390, height: 844 });
    await page.waitForTimeout(700);
    await expect(gate).toContainText('Choose Your Line');
    await page.keyboard.press('Escape');
    await expect(pausedHeading).toBeVisible();
    await page.keyboard.press('p');
    await expect(gate).toContainText('Choose Your Line');
    await page.keyboard.press('ArrowLeft');
    await expect(gate).toContainText('Choose Your Line');
    await page.keyboard.press('ArrowRight');
    await expect(gate).toBeHidden();

    // Pause cannot be spammed in the 600ms rearm window. Once rearmed, the
    // HUD button can enter/leave planning without moving the board; Space is
    // an explicit desktop release that preserves the current heading.
    await page.keyboard.press('p');
    await expect(pausedHeading).toBeHidden();
    await page.waitForTimeout(650);
    await page.keyboard.press('p');
    await expect(pausedHeading).toBeVisible();
    await page.getByRole('button', { name: /plan next move/i }).click();
    await expect(gate).toContainText('Choose Your Line');
    await page.getByRole('button', { name: /return to pause menu/i }).click();
    await expect(pausedHeading).toBeVisible();
    await page.getByRole('button', { name: /plan next move/i }).click();
    await page.keyboard.press('Space');
    await expect(gate).toBeHidden();

    // D-pad uses the same atomic release path. Restart in the fallback mode
    // and prove a safe tap starts and resumes without an automatic tick.
    await page.waitForTimeout(650);
    await page.keyboard.press('p');
    await expect(pausedHeading).toBeVisible();
    await page.getByRole('button', { name: /quit to menu/i }).click();
    await expect(page.getByRole('heading', { name: /ready to play/i })).toBeVisible();
    await page.getByTestId('control-mode-dpad').click();
    await expect(page.getByTestId('control-mode-dpad')).toHaveAttribute(
      'aria-pressed',
      'true'
    );
    await page.getByTestId('mode-free').click({ force: true });
    const secondStart = page.waitForResponse(
      (response) =>
        response.request().method() === 'POST' &&
        new URL(response.url()).pathname === '/api/game/session' &&
        (response.request().postDataJSON() as { action?: string } | null)?.action === 'start'
    );
    await page.getByTestId('free-play-start').click({ force: true });
    await secondStart;
    await expect(gate).toContainText(
      /Ready!|Swipe or press an arrow to move/,
      { timeout: 20_000 }
    );
    await page.getByRole('button', { name: /move up/i }).click();
    await expect(gate).toBeHidden();
    await page.waitForTimeout(650);
    await page.keyboard.press('p');
    await expect(pausedHeading).toBeVisible();
    await page.getByRole('button', { name: /plan next move/i }).click();
    await page.getByRole('button', { name: /move left/i }).click();
    await expect(gate).toBeHidden();
  });
});

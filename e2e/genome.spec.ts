import { test, expect } from '@playwright/test';
import { pickStarter, seedConsent, signInAsGuest } from './helpers';

test.describe('Genome capability UI', () => {
  test('reveals Build Seed and keeps the full telemetry deck clear of the board', async ({ page }, testInfo) => {
    test.setTimeout(300_000);
    await seedConsent(page);
    await signInAsGuest(page);
    await pickStarter(page, 'CYBER');

    await page.route('**/api/player', async (route) => {
      if (route.request().method() !== 'GET') return route.continue();
      const authorization = route.request().headers().authorization;
      const response = await page.request.get(route.request().url(), {
        headers: authorization ? { authorization } : undefined,
        timeout: 60_000,
      });
      if (!response.ok()) {
        throw new Error(`Player fixture bootstrap failed (${response.status()})`);
      }
      const payload = await response.json();
      await route.fulfill({
        status: response.status(),
        contentType: 'application/json',
        json: {
          ...payload,
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
      const authorization = route.request().headers().authorization;
      const response = await page.request.get(route.request().url(), {
        headers: authorization ? { authorization } : undefined,
        timeout: 60_000,
      });
      if (!response.ok()) {
        throw new Error(`Collection fixture bootstrap failed (${response.status()})`);
      }
      const payload = await response.json();
      await route.fulfill({
        status: response.status(),
        contentType: 'application/json',
        json: {
          ...payload,
          snakes: (payload.snakes ?? []).map((snake: Record<string, unknown>) =>
            snake.isEquipped
              ? {
                  ...snake,
                  traits: ['scavenger'],
                  lineage: { strains: ['AURUM'], strength: 1 },
                }
              : snake
          ),
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
          mastery: { dynasty: 'CYBER', xp: 0, level: 0 },
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

    await page.reload();
    await expect(page.getByTestId('build-seed')).toBeVisible({ timeout: 60_000 });
    await expect(page.getByTestId('build-seed')).toContainText(/heirlooms/i);
    await expect(page.getByRole('link', { name: /open codex/i })).toBeVisible();

    await page.getByTestId('mode-free').click({ force: true });
    await page.getByTestId('free-play-start').click({ force: true });
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
      const strain = await page.getByTestId('strain-meter').boundingBox();
      expect(hud).not.toBeNull();
      expect(board).not.toBeNull();
      expect(strain).not.toBeNull();
      expect(board!.y).toBeGreaterThanOrEqual(hud!.y + hud!.height - 0.5);
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
    // recognizer crosses its threshold.
    await page.setViewportSize({ width: 390, height: 844 });
    const gate = page.getByTestId('resume-gate');
    const flickSurface = page.getByTestId('flick-surface');
    await expect(gate).toContainText('Ready!');
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

    // Keyboard pause/resume: P arms a move, the board remains gated across
    // multiple would-be ticks, a reversal is rejected, and a duplicate
    // direction deliberately resumes the current heading.
    await page.keyboard.press('p');
    const pausedHeading = page.getByRole('heading', { name: /^paused$/i });
    await expect(pausedHeading).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(gate).toContainText('Choose Your Line');
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
    // HUD button can enter/leave the planning gate without moving the board.
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

    // D-pad uses the same atomic release path. Restart in the persisted
    // fallback control mode and prove a safe tap starts and resumes.
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
    await expect(gate).toContainText('Ready!', { timeout: 20_000 });
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

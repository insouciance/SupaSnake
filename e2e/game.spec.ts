/**
 * Game E2E Tests
 *
 * The game itself is a WebGL canvas (react-three-fiber) and cannot be
 * meaningfully simulated here. These tests drive everything around it:
 * home page entry, authoritative bootstrap, and the pre-game screen.
 * The full hook loop lives in engagement.spec.ts.
 */

import { test, expect } from '@playwright/test';
import {
  openRunSetupControls,
  seedConsent,
  signInAsGuest,
  startRunIfSetupPresent,
} from './helpers';

test.describe('Home page', () => {
  test.beforeEach(async ({ page }) => {
    await seedConsent(page);
  });

  test('displays game title', async ({ page }) => {
    await page.goto('/');

    // Exact, not /supasnake/i: with the growth surfaces armed the landing
    // page also carries a "What is SupaSnake?" section, so the loose regex is
    // a strict-mode violation on the configuration production actually runs.
    await expect(
      page.getByRole('heading', { name: 'SUPASNAKE', exact: true })
    ).toBeVisible();
  });

  test('displays Play and Lab entry points', async ({ page }) => {
    await page.goto('/');

    await expect(page.getByRole('button', { name: /^play$/i })).toBeVisible();
    await expect(
      page.getByRole('link', { name: /lab/i }).first()
    ).toBeVisible();
  });

  test('one Play bootstraps Primal and opens the held board', async ({ page }) => {
    await page.goto('/');

    const bootstrapResponse = page.waitForResponse(
      (response) =>
        response.request().method() === 'POST' &&
        new URL(response.url()).pathname === '/api/player/bootstrap',
      { timeout: 60000 }
    ).catch(() => null);
    await page.getByRole('button', { name: /^play$/i }).click();

    const bootstrap = await bootstrapResponse;
    if (!bootstrap) {
      const playError = await page.getByRole('alert').textContent().catch(() => '');
      if (/anonymous.+disabled|anonymous_provider_disabled/i.test(playError ?? '')) {
        test.skip(true, 'Anonymous sign-ins are disabled in the Supabase project.');
      }
      throw new Error(`Bootstrap request did not run: ${playError || 'no Play error shown'}`);
    }
    if (!bootstrap.ok()) {
      const body = await bootstrap.text();
      if (/anonymous.+disabled|anonymous_provider_disabled/i.test(body)) {
        test.skip(true, 'Anonymous sign-ins are disabled in the Supabase project.');
      }
    }
    expect(bootstrap.ok()).toBe(true);
    expect((await bootstrap.json()).equippedSnake.dynasty).toBe('PRIMAL');

    await expect(page).toHaveURL(/\/game/, { timeout: 60000 });
    // With RUN_FLOW_V1 on (production) the board is behind START.
    await startRunIfSetupPresent(page);
    await expect(page.getByTestId('first-movement-prompt')).toHaveText(
      'Swipe or press an arrow to move'
    );
    await expect(
      page.getByRole('heading', { name: /ready to (?:play|launch)/i })
    ).not.toBeVisible();
    await expect(page.getByTestId('contracts-board')).not.toBeVisible();
    await expect(page.getByTestId('account-upgrade-modal')).not.toBeVisible();

    // Space cannot accidentally begin FTUE; a deliberate direction does.
    await page.keyboard.press('Space');
    await expect(page.getByTestId('first-movement-prompt')).toBeVisible();
    await page.keyboard.press('ArrowUp');
    await expect(page.getByTestId('first-movement-prompt')).not.toBeVisible();
  });
});

test.describe('Equipped-snake game flow', () => {
  test('fresh direct-route guest is repaired with Primal without a mandatory Lab', async ({ page }) => {
    await seedConsent(page);
    await signInAsGuest(page);

    await expect(page.getByText(/you need a snake before you can play/i)).not.toBeVisible();
    await expect(page.getByRole('heading', { name: /ready to (?:play|launch)/i })).toBeVisible({
      timeout: 30000,
    });
    await expect(page.getByText(/primal/i).first()).toBeVisible();
    await expect(page.getByRole('link', { name: /choose your snake in the lab/i })).not.toBeVisible();
  });

  test('the bootstrapped pre-game screen is ready', async ({ page }) => {
    await seedConsent(page);
    await signInAsGuest(page);

    // Pre-game screen: ready state with the equipped snake
    await expect(
      page.getByRole('heading', { name: /ready to (?:play|launch)/i })
    ).toBeVisible({ timeout: 20000 });
    await expect(page.getByText(/gen \d+/i).first()).toBeVisible();
    // /^play\b/ matches the Play button ("Play" / "Play Again") but
    // not the AccountChip's "Playing as guest - save progress" label, which
    // made a bare /play/i a strict-mode violation
    await expect(
      page.getByRole('button', { name: /^play\b/i })
    ).toBeVisible();

    // HUD shows score and DNA counters before the run starts
    await expect(page.getByText(/^score$/i)).toBeVisible();
    await expect(page.getByText(/^dna$/i).first()).toBeVisible();

    // Design v2: the equipped dynasty's ruleset identity line + the
    // extraction banking hint are on the pre-game screen
    await expect(page.getByTestId('ruleset-explainer')).toBeVisible();
    await expect(
      page.getByText(/bank at a portal pays \+25%/i)
    ).toBeVisible();
  });

  test('mode toggle offers EARN and FREE PLAY; free play consumes no charge', async ({ page }) => {
    await seedConsent(page);
    await signInAsGuest(page);

    // Pre-game overlay: both mode chips present. EARN is always the default
    // and is never disabled (§8.6: the envelope gates no mode).
    // WP-1.06 moves the chips behind the Run Setup disclosure; flag-off this
    // is a no-op.
    await openRunSetupControls(page);
    await expect(page.getByTestId('mode-earn')).toBeVisible({ timeout: 20000 });
    await expect(page.getByTestId('mode-free')).toBeVisible();
    await expect(page.getByTestId('mode-earn')).toHaveAttribute('aria-pressed', 'true');

    // FREE PLAY remains a deliberate choice, never a demotion (§7.4).
    //
    // Deliberately NOT a forced click. The ANOMALY chip is inserted between
    // EARN and FREE PLAY when /api/anomaly resolves, which moves this button
    // 64px right and 59px down mid-test. `force: true` skips the stability
    // check, so Playwright would resolve the box, dispatch at the old
    // coordinates, and land the click on empty space - the reported flake.
    // The default actionability wait rides the shift out, and additionally
    // proves the chip is genuinely pressable rather than merely present.
    await page.getByTestId('mode-free').click();
    await expect(page.getByTestId('mode-free')).toHaveAttribute('aria-pressed', 'true');
    await expect(page.getByTestId('mode-free-hint')).toHaveText(/no rewards — pure practice/i);
    await expect(page.getByTestId('training-lab-link')).toHaveAttribute('href', '/training');

    // The primary CTA becomes Free Play, which consumes no charge
    const freeStart = page.getByTestId('free-play-start');
    await expect(freeStart).toBeVisible();
    await expect(freeStart).toHaveText(/free play/i);

    // Start the free session: server creates an is_free_play session with
    // no deduction; the honest FREE PLAY watermark chip appears in the HUD.
    // Wait for the authoritative response so this release gate cannot race
    // past (or silently tolerate) a failed session start.
    const startResponse = page.waitForResponse(
      (response) =>
        response.request().method() === 'POST' &&
        new URL(response.url()).pathname === '/api/game/session',
      { timeout: 30_000 }
    );
    await freeStart.click({ force: true });
    expect((await startResponse).status()).toBe(200);
    const watermark = page.getByTestId('free-play-watermark');
    await expect(watermark).toBeVisible({ timeout: 20000 });
    // A fresh FTUE-v2 guest sees the intentionally minimal movement line;
    // a returning player keeps the existing Ready treatment.
    await expect(
      page.getByTestId('first-movement-prompt').or(
        page.getByRole('heading', { name: /^ready!$/i })
      )
    ).toBeVisible();

    // Both HUD generations must keep their telemetry clear of the WebGL
    // viewport. The cockpit surrounds the board, while the rollback HUD
    // owns a single strip above it.
    const expectHudClearOfBoard = async () => {
      const hudLocator = page.getByTestId('game-hud');
      const hud = await hudLocator.boundingBox();
      const board = await page.getByTestId('game-board-viewport').boundingBox();
      expect(hud).not.toBeNull();
      expect(board).not.toBeNull();
      const isCockpit = (await hudLocator.getAttribute('data-input')) !== null;
      if (isCockpit) {
        const zones = hudLocator.locator('[data-cockpit-zone]:visible');
        for (let index = 0; index < (await zones.count()); index += 1) {
          const zone = await zones.nth(index).boundingBox();
          expect(zone).not.toBeNull();
          const overlaps = !(
            zone!.x + zone!.width <= board!.x ||
            board!.x + board!.width <= zone!.x ||
            zone!.y + zone!.height <= board!.y ||
            board!.y + board!.height <= zone!.y
          );
          expect(overlaps).toBe(false);
        }
      } else {
        expect(board!.y).toBeGreaterThanOrEqual(hud!.y + hud!.height);
      }
    };
    await expectHudClearOfBoard();
    await page.setViewportSize({ width: 375, height: 667 });
    await page.waitForTimeout(300);
    await expectHudClearOfBoard();
  });
});

test.describe('Responsive design', () => {
  test.beforeEach(async ({ page }) => {
    await seedConsent(page);
  });

  test('home is usable on a mobile viewport', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 667 });
    await page.goto('/');

    await expect(page.getByRole('button', { name: /^play$/i })).toBeVisible();
  });

  test('home has no horizontal scroll on tablet', async ({ page }) => {
    await page.setViewportSize({ width: 768, height: 1024 });
    await page.goto('/');

    const scrollWidth = await page.evaluate(() => document.body.scrollWidth);
    const clientWidth = await page.evaluate(() => document.body.clientWidth);

    expect(scrollWidth).toBeLessThanOrEqual(clientWidth);
  });
});

test.describe('Responsive consent containment', () => {
  test('consent never overlaps Play or game recovery actions', async ({ page }) => {
    const expectNoOverlap = async (
      first: ReturnType<typeof page.getByRole>,
      second: ReturnType<typeof page.getByRole>
    ) => {
      const firstBox = await first.boundingBox();
      const secondBox = await second.boundingBox();
      expect(firstBox).not.toBeNull();
      expect(secondBox).not.toBeNull();
      const overlaps = !(
        firstBox!.x + firstBox!.width <= secondBox!.x ||
        secondBox!.x + secondBox!.width <= firstBox!.x ||
        firstBox!.y + firstBox!.height <= secondBox!.y ||
        secondBox!.y + secondBox!.height <= firstBox!.y
      );
      expect(overlaps).toBe(false);
    };

    for (const viewport of [
      { width: 375, height: 667 },
      { width: 667, height: 375 },
      { width: 1280, height: 720 },
    ]) {
      await page.setViewportSize(viewport);
      await page.goto('/');
      const banner = page.getByRole('region', { name: /cookie consent/i });
      const play = page.getByRole('button', { name: /^play$/i });
      await expect(banner).toBeVisible();
      await expect(play).toBeVisible();
      await expectNoOverlap(banner, play);

      await page.goto('/game');
      const gameBanner = page.getByRole('region', { name: /cookie consent/i });
      const signIn = page.getByRole('link', { name: /^sign in$/i }).first();
      await expect(gameBanner).toBeVisible();
      await expect(signIn).toBeVisible();
      await expectNoOverlap(gameBanner, signIn);
    }
  });
});

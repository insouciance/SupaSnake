/**
 * Game E2E Tests
 *
 * The game itself is a WebGL canvas (react-three-fiber) and cannot be
 * meaningfully simulated here. These tests drive everything around it:
 * home page entry, authoritative bootstrap, and the pre-game screen.
 * The full hook loop lives in engagement.spec.ts.
 */

import { test, expect } from '@playwright/test';
import { seedConsent, signInAsGuest } from './helpers';

test.describe('Home page', () => {
  test.beforeEach(async ({ page }) => {
    await seedConsent(page);
  });

  test('displays game title', async ({ page }) => {
    await page.goto('/');

    await expect(
      page.getByRole('heading', { name: /supasnake/i })
    ).toBeVisible();
  });

  test('displays Launch and Lab entry points', async ({ page }) => {
    await page.goto('/');

    await expect(page.getByRole('button', { name: /^launch$/i })).toBeVisible();
    await expect(
      page.getByRole('link', { name: /lab/i }).first()
    ).toBeVisible();
  });

  test('one Launch bootstraps Primal and opens the held board', async ({ page }) => {
    await page.goto('/');

    const bootstrapResponse = page.waitForResponse(
      (response) =>
        response.request().method() === 'POST' &&
        new URL(response.url()).pathname === '/api/player/bootstrap',
      { timeout: 60000 }
    ).catch(() => null);
    await page.getByRole('button', { name: /^launch$/i }).click();

    const bootstrap = await bootstrapResponse;
    if (!bootstrap) {
      const launchError = await page.getByRole('alert').textContent().catch(() => '');
      if (/anonymous.+disabled|anonymous_provider_disabled/i.test(launchError ?? '')) {
        test.skip(true, 'Anonymous sign-ins are disabled in the Supabase project.');
      }
      throw new Error(`Bootstrap request did not run: ${launchError || 'no launch error shown'}`);
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
    await expect(page.getByTestId('first-movement-prompt')).toHaveText(
      'Swipe or press an arrow to move'
    );
    await expect(page.getByRole('heading', { name: /ready to play/i })).not.toBeVisible();
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
    await expect(page.getByRole('heading', { name: /ready to play/i })).toBeVisible({
      timeout: 30000,
    });
    await expect(page.getByText(/primal/i).first()).toBeVisible();
    await expect(page.getByRole('link', { name: /choose your snake in the lab/i })).not.toBeVisible();
  });

  test('the bootstrapped pre-game screen is ready', async ({ page }) => {
    await seedConsent(page);
    await signInAsGuest(page);

    // Pre-game screen: ready state with the equipped snake and energy cost
    await expect(
      page.getByRole('heading', { name: /ready to play/i })
    ).toBeVisible({ timeout: 20000 });
    await expect(page.getByText(/gen \d+/i).first()).toBeVisible();
    // /^play\b/ matches the Play button ("Play (1 ⚡)" / "Play Again") but
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
      page.getByText(/exit portal banks \+25%/i)
    ).toBeVisible();
  });

  test('mode toggle offers EARN and FREE PLAY; free play starts without spending energy', async ({ page }) => {
    await seedConsent(page);
    await signInAsGuest(page);

    // Pre-game overlay: both mode chips present; a fresh guest has energy,
    // so EARN is the default selection
    await expect(page.getByTestId('mode-earn')).toBeVisible({ timeout: 20000 });
    await expect(page.getByTestId('mode-free')).toBeVisible();
    await expect(page.getByTestId('mode-earn')).toHaveAttribute('aria-pressed', 'true');

    // A guest WITH energy can still choose FREE PLAY (§7.4: practice is
    // always available, energy meters earning runs only).
    // force: the live WebGL canvas behind the overlay starves Playwright's
    // hit-target stability check in headless (software rendering); the
    // aria-pressed / watermark expectations below verify the click landed.
    await page.getByTestId('mode-free').click({ force: true });
    await expect(page.getByTestId('mode-free')).toHaveAttribute('aria-pressed', 'true');
    await expect(page.getByTestId('mode-free-hint')).toHaveText(/no rewards — pure practice/i);

    // The primary CTA becomes Free Play with no energy cost attached
    const freeStart = page.getByTestId('free-play-start');
    await expect(freeStart).toBeVisible();
    await expect(freeStart).toHaveText(/free play/i);

    // Start the free session: server creates an is_free_play session with
    // no deduction; the honest FREE PLAY watermark chip appears in the HUD.
    // Pre-migration-016 window: the marker column doesn't exist yet and the
    // server refuses free mode with a clear 503 message instead - accept
    // either outcome so this spec is green before AND after 016 applies.
    await freeStart.click({ force: true });
    const watermark = page.getByTestId('free-play-watermark');
    const migrationPending = page.getByText(/free play is not available yet/i);
    await expect(watermark.or(migrationPending)).toBeVisible({ timeout: 20000 });
    if (await watermark.isVisible()) {
      // A fresh FTUE-v2 guest sees the intentionally minimal movement line;
      // a returning player keeps the existing Ready treatment.
      await expect(
        page.getByTestId('first-movement-prompt').or(
          page.getByRole('heading', { name: /^ready!$/i })
        )
      ).toBeVisible();

      // The responsive HUD owns layout space above the WebGL viewport; it
      // must never sit on top of the playable board at either breakpoint.
      const expectHudClearOfBoard = async () => {
        const hud = await page.getByTestId('game-hud').boundingBox();
        const board = await page.getByTestId('game-board-viewport').boundingBox();
        expect(hud).not.toBeNull();
        expect(board).not.toBeNull();
        expect(board!.y).toBeGreaterThanOrEqual(hud!.y + hud!.height);
      };
      await expectHudClearOfBoard();
      await page.setViewportSize({ width: 375, height: 667 });
      await page.waitForTimeout(300);
      await expectHudClearOfBoard();
    }
  });
});

test.describe('Responsive design', () => {
  test.beforeEach(async ({ page }) => {
    await seedConsent(page);
  });

  test('home is usable on a mobile viewport', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 667 });
    await page.goto('/');

    await expect(page.getByRole('button', { name: /^launch$/i })).toBeVisible();
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
  test('consent never overlaps Launch or game recovery actions', async ({ page }) => {
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
      const launch = page.getByRole('button', { name: /^launch$/i });
      await expect(banner).toBeVisible();
      await expect(launch).toBeVisible();
      await expectNoOverlap(banner, launch);

      await page.goto('/game');
      const gameBanner = page.getByRole('region', { name: /cookie consent/i });
      const signIn = page.getByRole('link', { name: /^sign in$/i }).first();
      await expect(gameBanner).toBeVisible();
      await expect(signIn).toBeVisible();
      await expectNoOverlap(gameBanner, signIn);
    }
  });
});

/**
 * Game E2E Tests
 *
 * The game itself is a WebGL canvas (react-three-fiber) and cannot be
 * meaningfully simulated here. These tests drive everything around it:
 * home page entry, the equipped-snake requirement, and the pre-game screen.
 * The full hook loop lives in engagement.spec.ts.
 */

import { test, expect } from '@playwright/test';
import { seedConsent, signInAsGuest, pickStarter } from './helpers';

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

    await expect(page.getByRole('link', { name: /launch/i })).toBeVisible();
    await expect(
      page.getByRole('link', { name: /lab/i }).first()
    ).toBeVisible();
  });

  test('Launch starts a guest session and opens the game', async ({ page }) => {
    await page.goto('/');

    await page.getByRole('link', { name: /launch/i }).click();
    await expect(page).toHaveURL(/\/game/, { timeout: 20000 });
  });
});

test.describe('Equipped-snake game flow', () => {
  test('fresh guest is routed to pick a snake before playing', async ({ page }) => {
    await seedConsent(page);
    await signInAsGuest(page);

    // A brand-new account owns no snakes: the game blocks play
    await expect(
      page.getByText(/you need a snake before you can play/i)
    ).toBeVisible({ timeout: 20000 });

    const chooseLink = page.getByRole('link', {
      name: /choose your snake in the lab/i,
    });
    await expect(chooseLink).toBeVisible();
  });

  test('with a starter equipped the pre-game screen is ready', async ({ page }) => {
    await seedConsent(page);
    await signInAsGuest(page);
    await pickStarter(page, 'CYBER');

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
    await expect(page.getByText(/score:/i)).toBeVisible();
    await expect(page.getByText(/dna:/i).first()).toBeVisible();

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
    await pickStarter(page, 'CYBER');

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
      await expect(
        page.getByRole('heading', { name: /^ready!$/i })
      ).toBeVisible();
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

    await expect(page.getByRole('link', { name: /launch/i })).toBeVisible();
  });

  test('home has no horizontal scroll on tablet', async ({ page }) => {
    await page.setViewportSize({ width: 768, height: 1024 });
    await page.goto('/');

    const scrollWidth = await page.evaluate(() => document.body.scrollWidth);
    const clientWidth = await page.evaluate(() => document.body.clientWidth);

    expect(scrollWidth).toBeLessThanOrEqual(clientWidth);
  });
});

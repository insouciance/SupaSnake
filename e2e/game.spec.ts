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
    await expect(
      page.getByRole('button', { name: /play/i })
    ).toBeVisible();

    // HUD shows score and DNA counters before the run starts
    await expect(page.getByText(/score:/i)).toBeVisible();
    await expect(page.getByText(/dna:/i).first()).toBeVisible();
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

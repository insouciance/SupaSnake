/**
 * Engagement Loop E2E Test
 *
 * Full hook loop for a brand-new player, driven end to end against the real
 * server: anonymous signup -> FTUE starter selection (PRIMAL) -> game page
 * shows the equipped snake + energy -> Lab unlock attempt fails on
 * insufficient DNA -> Breeding Lab renders parent slots -> daily reward
 * (day 1, claimable on a fresh account) -> DNA balance increases.
 *
 * The snake run itself is a WebGL canvas and is not simulated; everything
 * around it is exercised. Steps run serially and share one page/session.
 */

import { test, expect, type Page } from '@playwright/test';
import { seedConsent, signInAsGuest, pickStarter } from './helpers';

test.describe.configure({ mode: 'serial' });

test.describe('Engagement hook loop (fresh anonymous player)', () => {
  let page: Page;

  test.beforeAll(async ({ browser }) => {
    const context = await browser.newContext();
    page = await context.newPage();
    await seedConsent(page);
  });

  test.afterAll(async () => {
    await page.context().close();
  });

  test('anonymous signup and PRIMAL starter selection land on the game', async () => {
    await signInAsGuest(page);

    // Fresh account: game blocks play until a snake is owned
    await expect(
      page.getByText(/you need a snake before you can play/i)
    ).toBeVisible({ timeout: 20000 });

    // FTUE starter chooser on home; pick PRIMAL
    await page.goto('/');
    const primal = page.getByTestId('starter-PRIMAL');
    await primal.waitFor({ state: 'visible', timeout: 20000 });
    await expect(
      page.getByRole('heading', { name: /choose your snake/i })
    ).toBeVisible();
    await primal.click();
    await page.getByRole('button', { name: /confirm & play/i }).click();
    await page.waitForURL(/\/game/, { timeout: 20000 });
  });

  test('game page shows the equipped snake name and energy', async () => {
    // Equipped starter is displayed by name next to the "Snake:" label
    await expect(page.getByText(/^snake:$/i)).toBeVisible({ timeout: 20000 });
    await expect(page.getByText(/primal/i).first()).toBeVisible();

    // Energy meter (EnergyTimer) shows current/max pills + count
    await expect(page.getByText(/^\d+\/\d+$/).first()).toBeVisible();

    // Ready-to-play state with the equipped snake
    await expect(
      page.getByRole('heading', { name: /ready to play/i })
    ).toBeVisible();
  });

  test('lab unlock attempt on a paid variant shows insufficient DNA', async () => {
    await page.goto('/lab');

    // Collection grid renders
    await expect(
      page.getByRole('region', { name: /snake variant collection/i }).or(
        page.locator('[aria-label="Snake variant collection"]')
      )
    ).toBeVisible({ timeout: 20000 });

    // Prefer the classic 500-DNA variant; fall back to any locked card
    const fiveHundred = page.locator('[aria-label*="Locked, 500 DNA"]').first();
    const anyLocked = page.locator('[aria-label*="Locked,"]').first();
    const target = (await fiveHundred.count()) > 0 ? fiveHundred : anyLocked;
    await target.click();

    // Unlock modal: balance (50 DNA at most at this point) cannot afford it
    const modal = page.getByTestId('unlock-confirm-modal');
    await expect(modal).toBeVisible({ timeout: 10000 });
    await expect(page.getByText(/need [\d,]+ more dna/i)).toBeVisible();
    await expect(page.getByTestId('unlock-confirm-button')).toBeDisabled();

    await page.getByTestId('unlock-cancel-button').click();
    await expect(modal).not.toBeVisible();
  });

  test('breeding lab renders both parent slots', async () => {
    await page.goto('/lab/breed');

    await expect(page.getByTestId('parent-slot-1')).toBeVisible({
      timeout: 20000,
    });
    await expect(page.getByTestId('parent-slot-2')).toBeVisible();
  });

  test('daily reward day 1 is claimable and increases DNA', async () => {
    await page.goto('/');

    // Fresh account: day 1 reward auto-opens as claimable
    const claimButton = page.getByRole('button', { name: /claim day 1 reward/i });
    await expect(claimButton).toBeVisible({ timeout: 20000 });
    await claimButton.click();

    // Success state reports the granted DNA
    await expect(page.getByText(/day 1 claimed/i)).toBeVisible({ timeout: 15000 });
    const grantedText = await page
      .locator('text=/^\\+\\d+$/')
      .first()
      .textContent();
    const granted = Number((grantedText ?? '').replace('+', ''));
    expect(granted).toBeGreaterThan(0);

    await page.getByRole('button', { name: /awesome/i }).click();

    // Home stats reflect the new balance (starter was free, so DNA == granted)
    await expect(
      page.locator(`text=/^${granted.toLocaleString('en-US')}$/`).first()
    ).toBeVisible({ timeout: 15000 });

    // Claim is idempotent for the day: reopening shows "Come Back Tomorrow"
    await page.reload();
    await expect(
      page.getByRole('button', { name: /claim day 1 reward/i })
    ).not.toBeVisible({ timeout: 10000 });
  });
});

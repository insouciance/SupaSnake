/**
 * Engagement Loop E2E Test
 *
 * Full hook loop for a brand-new player, driven end to end against the real
 * server: anonymous signup -> FTUE starter selection (PRIMAL) -> game page
 * shows the equipped snake + energy -> Lab unlock attempt fails on
 * insufficient DNA -> Breeding Lab renders parent slots -> daily contracts
 * (Design v2 section 7.3: board auto-opens with 3 offers, picks 2, picked
 * state persists across reload).
 *
 * The snake run itself is a WebGL canvas and is not simulated; everything
 * around it is exercised. Contract completion requires real banked runs, so
 * the claim path is covered by API/unit tests (claim_contract idempotency)
 * rather than driven live here. Steps run serially and share one
 * page/session.
 */

import { test, expect, type Page } from '@playwright/test';
import { seedConsent, signInAsGuest, pickStarter } from './helpers';

test.describe.configure({ mode: 'serial' });

test.describe('Engagement hook loop (fresh anonymous player)', () => {
  let page: Page;
  // Later steps depend on the guest session from step 1; when that step
  // skips (anonymous sign-ins disabled) the rest must skip, not fail.
  let guestReady = false;

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
    guestReady = true;

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
    test.skip(!guestReady, 'Requires the guest session from step 1 (anonymous sign-ins disabled)');
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
    test.skip(!guestReady, 'Requires the guest session from step 1 (anonymous sign-ins disabled)');
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
    test.skip(!guestReady, 'Requires the guest session from step 1 (anonymous sign-ins disabled)');
    await page.goto('/lab/breed');

    await expect(page.getByTestId('parent-slot-1')).toBeVisible({
      timeout: 20000,
    });
    await expect(page.getByTestId('parent-slot-2')).toBeVisible();
  });

  test('daily contracts board offers 3 and picking 2 persists', async () => {
    test.skip(!guestReady, 'Requires the guest session from step 1 (anonymous sign-ins disabled)');
    await page.goto('/');

    // Fresh account, fresh day: the contracts board auto-opens with the
    // deterministic 3-of-pool offers
    const board = page.getByTestId('contracts-board');
    await expect(board).toBeVisible({ timeout: 20000 });
    const cards = page.locator('[data-testid^="contract-card-"]');
    await expect(cards).toHaveCount(3);

    // Pick 2 of 3: toggle two cards, confirm
    await cards.nth(0).click();
    await cards.nth(1).click();
    const confirm = page.getByTestId('contracts-confirm');
    await expect(confirm).toHaveText(/start 2 contracts/i);
    await confirm.click();

    // Picked state lands from the server (progress bars, no confirm button)
    await expect(cards.nth(0)).toHaveAttribute('data-state', 'picked', {
      timeout: 15000,
    });
    await expect(cards.nth(1)).toHaveAttribute('data-state', 'picked');
    await expect(confirm).not.toBeVisible();

    // Playing a run to completion is not drivable (WebGL); completion +
    // claim are exercised in the API tests. Assert persistence instead:
    // picks survive a reload and the board no longer auto-opens (nothing
    // actionable), with the mission line reporting contract progress.
    await page.reload();
    const missionLine = page.getByText(/contracts: 0\/2 complete/i);
    await expect(missionLine).toBeVisible({ timeout: 20000 });
    await expect(page.getByTestId('contracts-board')).not.toBeVisible();

    // The mission line reopens the board with both picks intact
    await missionLine.click();
    await expect(page.getByTestId('contracts-board')).toBeVisible();
    await expect(page.locator('[data-state="picked"]')).toHaveCount(2);
  });
});

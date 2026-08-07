/**
 * Engagement Loop E2E Test
 *
 * Full hook loop for a brand-new player, driven end to end against the real
 * server: one-click anonymous Play -> authoritative PRIMAL bootstrap -> held
 * game board -> voluntary Lab -> Breeding Lab. It also proves the retired
 * contracts surface stays gone (WP-1.03 cutover, Constitution §7.2/§12.2/§13).
 *
 * The snake run itself is a WebGL canvas and is not simulated; everything
 * around it is exercised. Steps run serially and share one page/session.
 */

import { test, expect, type Page, type Request } from '@playwright/test';
import { runSetupReady, seedConsent, startRunIfSetupPresent } from './helpers';

// Serial, and budgeted for the flag-on build. Step 1 alone can spend 45s
// waiting for the bootstrap round trip, 45s on the route change and another
// 30s inside `startRunIfSetupPresent` (Run Setup only exists with
// NEXT_PUBLIC_RUN_FLOW_V1 on, so the rollback leg never paid for it). Against
// the default 60s per test that arithmetic can only end in a bare timeout,
// which then takes the rest of the file with it because the session is
// shared. The individual waits are kept long enough to be informative and the
// budget is raised to hold them.
test.describe.configure({ mode: 'serial', timeout: 150_000 });

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

  test('one Play authenticates, bootstraps PRIMAL, and lands on the board', async () => {
    await page.goto('/');
    const bootstrapPromise = page.waitForResponse(
      (response) =>
        response.request().method() === 'POST' &&
        new URL(response.url()).pathname === '/api/player/bootstrap',
      { timeout: 45000 }
    ).catch(() => null);
    await page.getByRole('button', { name: /^play$/i }).click();
    const response = await bootstrapPromise;
    if (!response) {
      const playError = await page.getByRole('alert').textContent().catch(() => '');
      if (/anonymous.+disabled|anonymous_provider_disabled/i.test(playError ?? '')) {
        test.skip(true, 'Anonymous sign-ins are disabled in the Supabase project.');
      }
      throw new Error(`Bootstrap request did not run: ${playError || 'no Play error shown'}`);
    }
    expect(response.ok()).toBe(true);
    const bootstrap = await response.json();
    expect(bootstrap.equippedSnake.dynasty).toBe('PRIMAL');
    expect(bootstrap.onboarding.needsStarterSelection).toBe(false);
    guestReady = true;

    await page.waitForURL(/\/game/, { timeout: 45000 });
    await startRunIfSetupPresent(page);
    // Fresh-account copy can be the minimal FTUE line or the normal cockpit
    // instruction depending on when bootstrap facts settle. In both cases
    // the authoritative board must be visibly held for deliberate input.
    const launchGate = page.getByTestId('resume-gate');
    await expect(launchGate).toBeVisible();
    await expect(launchGate).toContainText(/swipe|arrow|direction|board held/i);
    await expect(page.getByTestId('starter-PRIMAL')).not.toBeVisible();
    await expect(page.getByRole('heading', { name: /choose your snake/i })).not.toBeVisible();
  });

  test('game page exposes the authoritative run Energy state', async () => {
    test.skip(!guestReady, 'Requires the guest session from step 1 (anonymous sign-ins disabled)');
    // The production cockpit exposes the immutable commitment attached to
    // this run; the rollback layout retains its stored-Charge meter. Either
    // surface must provide one visible, accessible Energy fact after launch.
    const energyState = page.getByTestId('energy-stake')
      .or(page.getByLabel(/^Charges \d+ of \d+$/i))
      .or(page.getByText(/^\d+\/\d+$/))
      .filter({ visible: true })
      .first();
    await expect(energyState).toBeVisible();

    // The one-click route has no second Play screen and remains held until
    // the player's deliberate first direction.
    await expect(runSetupReady(page).first()).not.toBeVisible();
    await expect(page.getByTestId('resume-gate')).toBeVisible();
  });

  test('lab unlock attempt on a paid variant shows insufficient DNA', async () => {
    test.skip(!guestReady, 'Requires the guest session from step 1 (anonymous sign-ins disabled)');
    await page.goto('/lab');

    // Everyday lineages stay compact. Unlocks live in the deliberate deep
    // collection disclosure rather than competing with the active deck.
    const deepTools = page.getByTestId('lab-deep-tools');
    await expect(deepTools).toBeVisible({ timeout: 20000 });
    await expect(deepTools).toHaveJSProperty('open', false);
    await deepTools.locator('summary').click();
    await expect(
      deepTools.getByRole('list', { name: /undiscovered variants/i })
    ).toBeVisible();

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

  // Rewritten by WP-1.03, not weakened. This step used to assert that
  // contracts stayed absent UNTIL the first completed result — a timing rule
  // for a live mechanism. The cutover retired the mechanism (Constitution
  // §7.2, §12.2, §13), so the assertion is now unconditional: contracts are
  // never requested and never rendered, before or after any run. Passing this
  // is strictly harder than passing the old version.
  test('the retired contracts surface is never requested and never rendered', async () => {
    test.skip(!guestReady, 'Requires the guest session from step 1 (anonymous sign-ins disabled)');
    const contractRequests: string[] = [];
    const recordRequest = (request: Request) => {
      if (new URL(request.url()).pathname.startsWith('/api/contracts')) {
        contractRequests.push(request.url());
      }
    };
    page.on('request', recordRequest);
    await page.goto('/');

    await expect(page.getByText(/your first run is ready/i)).toBeVisible({
      timeout: 30000,
    });
    await expect(page.getByTestId('contracts-board')).not.toBeVisible();
    await expect(page.getByText(/daily contracts/i)).not.toBeVisible();

    // A stale inbox link is the one way a player could still ask for it.
    await page.goto('/#contracts');
    await expect(page.getByTestId('contracts-board')).not.toBeVisible();

    expect(contractRequests).toEqual([]);
    page.off('request', recordRequest);
  });
});

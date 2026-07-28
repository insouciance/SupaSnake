/**
 * Authentication E2E Tests
 *
 * Real flows as of Sprint 1:
 * - Home offers player-pulled sign-in choices; Launch starts an anonymous session.
 * - /login: email/password + Google/Apple OAuth + "Play as Guest".
 * - /signup: age gate (14+) shown before the account form.
 * - /game and /lab prompt for sign-in when there is no session.
 */

import { test, expect } from '@playwright/test';
import { seedConsent, signInAsGuest } from './helpers';

test.describe('Consent banner', () => {
  test('appears on first visit and can be rejected', async ({ page }) => {
    await page.goto('/');

    const banner = page.getByText(/we use cookies/i);
    await expect(banner).toBeVisible({ timeout: 10000 });

    await page.getByRole('button', { name: /reject all/i }).click();
    await expect(banner).not.toBeVisible();

    // Decision persists across reloads
    await page.reload();
    await expect(banner).not.toBeVisible({ timeout: 5000 });
  });
});

/**
 * One test per viewport, not one test over four.
 *
 * The assertions are unchanged; only the budget is. As a single test this
 * loaded Home four times inside one 60s allowance, and with the growth
 * surfaces armed - which is how production runs - Home is a heavier page with
 * more client fetches, so the fourth load was routinely paying for the first
 * three. A per-viewport test also names the viewport that failed instead of
 * making every failure read "the dialog test".
 */
const HOME_DIALOG_VIEWPORTS = [
  { width: 320, height: 568 },
  { width: 390, height: 844 },
  { width: 844, height: 390 },
  { width: 1280, height: 720 },
];

test.describe('Home authentication dialog', () => {
  for (const viewport of HOME_DIALOG_VIEWPORTS) {
    test(`stays above Home controls and within the ${viewport.width}x${viewport.height} viewport`, async ({
      page,
    }) => {
      await seedConsent(page);
      await page.setViewportSize(viewport);
      await page.goto('/');

      const trigger = page.getByTestId('account-chip');
      await expect(trigger).toBeVisible();
      // With the growth surfaces armed the landing page is taller, and at
      // 375px portrait the chip sits outside the initial viewport: Playwright
      // reports it visible, then fails the click with "element is outside of
      // the viewport" because its own auto-scroll does not reach it. Scroll
      // deliberately rather than forcing the click, so a genuinely
      // unreachable control still fails - which is what this caught on the
      // flag-on leg: the bottom nav rail overflowed 320px-wide viewports and
      // pushed the chip off screen entirely (fixed in `Navigation.tsx`).
      await trigger.scrollIntoViewIfNeeded();
      await trigger.click();

      const dialog = page.getByRole('dialog', { name: /join the run/i });
      const layer = page.locator('[data-modal-layer="true"]');
      await expect(dialog).toBeVisible();
      await expect(dialog.getByRole('link', { name: /^sign in$/i })).toBeVisible();

      const metrics = await page.evaluate(() => {
        const panel = document.querySelector<HTMLElement>('[data-testid="account-auth-dialog"]');
        const modalLayer = document.querySelector<HTMLElement>('[data-modal-layer="true"]');
        const accountTrigger = document.querySelector<HTMLElement>('[data-testid="account-chip"]');
        if (!panel || !modalLayer || !accountTrigger) {
          throw new Error('Authentication dialog elements did not mount');
        }

        const panelRect = panel.getBoundingClientRect();
        const triggerRect = accountTrigger.getBoundingClientRect();
        const topAtTrigger = document.elementFromPoint(
          triggerRect.left + triggerRect.width / 2,
          triggerRect.top + triggerRect.height / 2
        );

        return {
          panel: {
            left: panelRect.left,
            top: panelRect.top,
            right: panelRect.right,
            bottom: panelRect.bottom,
          },
          layerIsBodyChild: modalLayer.parentElement === document.body,
          layerPosition: getComputedStyle(modalLayer).position,
          layerZIndex: Number(getComputedStyle(modalLayer).zIndex),
          triggerZIndex: Number(
            getComputedStyle(accountTrigger.closest('nav')?.querySelector('.fixed') ?? accountTrigger)
              .zIndex || 0
          ),
          triggerIsTopmost: accountTrigger.contains(topAtTrigger),
          focusIsInside: panel.contains(document.activeElement),
        };
      });

      expect(metrics.panel.left).toBeGreaterThanOrEqual(0);
      expect(metrics.panel.top).toBeGreaterThanOrEqual(0);
      expect(metrics.panel.right).toBeLessThanOrEqual(viewport.width);
      expect(metrics.panel.bottom).toBeLessThanOrEqual(viewport.height);
      expect(metrics.layerIsBodyChild).toBe(true);
      expect(metrics.layerPosition).toBe('fixed');
      expect(metrics.layerZIndex).toBeGreaterThan(metrics.triggerZIndex);
      expect(metrics.triggerIsTopmost).toBe(false);
      expect(metrics.focusIsInside).toBe(true);

      await page.keyboard.press('Escape');
      await expect(dialog).not.toBeVisible();
      await expect(trigger).toBeFocused();
      await expect(layer).toHaveCount(0);
    });
  }
});

test.describe('Login page', () => {
  test.beforeEach(async ({ page }) => {
    await seedConsent(page);
  });

  test('displays email and password fields', async ({ page }) => {
    await page.goto('/login');

    await expect(page.getByLabel(/email/i)).toBeVisible();
    await expect(page.getByLabel(/password/i)).toBeVisible();
  });

  test('displays Google and Apple OAuth buttons', async ({ page }) => {
    await page.goto('/login');

    await expect(page.getByRole('button', { name: /google/i })).toBeVisible();
    await expect(page.getByRole('button', { name: /apple/i })).toBeVisible();
  });

  test('shows error for invalid credentials', async ({ page }) => {
    // Regression guard: the login page must keep LoginForm mounted during a
    // sign-in attempt (the full-page spinner is latched to the initial auth
    // check only), otherwise the error state is lost mid-request.
    await page.goto('/login');

    await page.getByLabel(/email/i).fill('invalid-e2e@test.com');
    await page.getByLabel(/password/i).fill('wrongpassword123');
    await page.getByRole('button', { name: /^sign in$/i }).click();

    await expect(
      page.getByText(/wrong email or password|invalid|error|incorrect/i)
    ).toBeVisible({
      timeout: 15000,
    });
  });

  test('submit is disabled until email and password are valid', async ({ page }) => {
    await page.goto('/login');

    const submit = page.getByRole('button', { name: /^sign in$/i });

    // Empty form: disabled
    await expect(submit).toBeDisabled();

    // Password only: still disabled (email required)
    await page.getByLabel(/password/i).fill('somepassword');
    await expect(submit).toBeDisabled();

    // Valid email + 8-char password: enabled
    await page.getByLabel(/email/i).fill('someone@example.com');
    await expect(submit).toBeEnabled();
  });

  test('navigates to signup page from login', async ({ page }) => {
    await page.goto('/login');

    await page.getByRole('link', { name: /sign up/i }).click();
    await expect(page).toHaveURL(/\/signup/);
  });

  test('offers guest play that lands on the game', async ({ page }) => {
    // Skips itself when anonymous sign-ins are disabled in Supabase
    await signInAsGuest(page);
    await expect(page).toHaveURL(/\/game/);
  });
});

test.describe('Signup age gate', () => {
  test.beforeEach(async ({ page }) => {
    await seedConsent(page);
  });

  test('displays age verification before the signup form', async ({ page }) => {
    await page.goto('/signup');

    await expect(page.getByTestId('age-gate')).toBeVisible({ timeout: 10000 });
    await expect(page.getByLabel(/what year were you born/i)).toBeVisible();
    await expect(page.getByLabel(/what month were you born/i)).toBeVisible();
  });

  test('blocks users under 13', async ({ page }) => {
    await page.goto('/signup');

    const underageYear = new Date().getFullYear() - 10;
    await page.getByLabel(/what year were you born/i).fill(String(underageYear));
    await page.getByLabel(/what month were you born/i).selectOption('1');
    await page.getByRole('button', { name: /continue/i }).click();

    await expect(page.getByText(/age requirement not met/i)).toBeVisible({
      timeout: 10000,
    });
  });

  test('lets 13+ users through to the account form', async ({ page }) => {
    await page.goto('/signup');

    const adultYear = new Date().getFullYear() - 30;
    await page.getByLabel(/what year were you born/i).fill(String(adultYear));
    await page.getByLabel(/what month were you born/i).selectOption('1');
    await page.getByRole('button', { name: /continue/i }).click();

    await expect(
      page.getByRole('heading', { name: /create account/i })
    ).toBeVisible({ timeout: 10000 });
    await expect(page.getByLabel(/email/i)).toBeVisible();
  });
});

test.describe('Protected routes', () => {
  test.beforeEach(async ({ page }) => {
    await seedConsent(page);
  });

  test('game page prompts sign-in without a session', async ({ page }) => {
    await page.goto('/game');

    await expect(page.getByText(/sign in to play/i)).toBeVisible({ timeout: 15000 });
    await expect(page.getByRole('link', { name: /sign in/i })).toBeVisible();
  });

  test('lab prompts sign-in without a session', async ({ page }) => {
    await page.goto('/lab');

    await expect(
      page.getByRole('link', { name: /sign in to play/i })
    ).toBeVisible({ timeout: 15000 });
  });

  test('privacy settings gate account actions behind sign-in', async ({ page }) => {
    await page.goto('/settings/privacy');

    await expect(page.getByText(/sign in to export your data/i)).toBeVisible({
      timeout: 15000,
    });
  });
});

test.describe('Guest upgrade flow', () => {
  // Live-dependent: exercises real Supabase signUp/updateUser. Self-skips
  // when anonymous sign-ins are disabled or the signup rate limit is hit,
  // following the signInAsGuest() pattern.
  test('guest upgrades to an email account and the shop unlocks the subscribe path', async ({
    page,
  }) => {
    await seedConsent(page);
    await signInAsGuest(page);

    // Anonymous gating. The one-time storefront this test used to walk is
    // gone (WP-0.09: ALL_PRODUCTS is empty, so there is no `create-account-cta-
    // <productId>` and no Buy button to gate). The subscription card is the
    // shop's only commercial surface now, and it is what the gate applies to.
    await page.goto('/shop');
    await expect(page.getByTestId('premium-create-account')).toBeVisible({
      timeout: 15000,
    });
    await expect(page.getByTestId('premium-subscribe')).toHaveCount(0);
    await expect(page.getByRole('button', { name: /^buy/i })).toHaveCount(0);

    // Open the upgrade modal from the save-progress notice
    await page.getByRole('button', { name: /^create account$/i }).click();
    const modal = page.getByTestId('account-upgrade-modal');
    await expect(modal).toBeVisible();

    const email = `e2e-upgrade-${Date.now()}@example.com`;
    await modal.getByLabel(/^email$/i).fill(email);
    await modal.getByLabel(/^password$/i).fill('E2eUpgradePass123');
    await modal.getByLabel(/confirm password/i).fill('E2eUpgradePass123');
    await modal.getByLabel(/I agree to the Terms of Service/i).check();
    await modal.getByRole('button', { name: /create account/i }).click();

    const success = page.getByTestId('upgrade-success');
    const rateLimited = modal.getByText(/too many attempts|rate limit/i);
    await success
      .or(rateLimited)
      .first()
      .waitFor({ state: 'visible', timeout: 20000 });

    if (await rateLimited.isVisible().catch(() => false)) {
      test.skip(
        true,
        'Supabase signup rate limit hit - upgrade flow cannot complete right now.'
      );
    }

    await expect(success).toBeVisible();

    // If email confirmations are enabled the account stays pending (and
    // anonymous) until the link is clicked - the buy buttons cannot unlock
    // in this run, so stop after verifying the pending messaging.
    if (
      await success
        .getByText(/check your email/i)
        .isVisible()
        .catch(() => false)
    ) {
      test.skip(
        true,
        'Email confirmations are enabled - upgraded account stays pending until the link is clicked.'
      );
    }

    await success.getByRole('button', { name: /^close$/i }).click();

    // is_anonymous cleared after the session refresh: every anonymous surface
    // is gone and the real commercial action - Subscribe - renders in place of
    // the account request.
    await expect(page.getByTestId('premium-create-account')).toHaveCount(0);
    await expect(page.getByText(/save your progress/i)).toHaveCount(0);
    await expect(page.getByTestId('premium-subscribe')).toBeVisible();

    // Upgrading unlocks the subscription, and nothing else: an account is not
    // a key to a one-time catalogue, because there is not one (§10.2/§10.4).
    await expect(page.getByRole('button', { name: /^buy/i })).toHaveCount(0);
  });
});

test.describe('Anonymous sessions', () => {
  test('guest session persists across navigation', async ({ page }) => {
    await seedConsent(page);
    await signInAsGuest(page);

    // Guest is authenticated: game page shows the game UI, not the prompt
    await expect(page.getByText(/sign in to play and save/i)).not.toBeVisible();

    // Navigating home keeps the session. This used to assert that the string
    // "launch a game to start" was NOT visible - a phrase that no longer
    // exists anywhere in the app, so the assertion held whether or not the
    // session survived. The positive form is the one worth making: Home's
    // ambient DNA counter renders only for an authenticated player.
    await page.goto('/');
    await expect(page.locator('[title="DNA"]')).toBeVisible({ timeout: 15000 });
  });
});

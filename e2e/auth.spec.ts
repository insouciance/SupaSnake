/**
 * Authentication E2E Tests
 *
 * Real flows as of Sprint 1:
 * - Home page has no login link; play starts an anonymous session.
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
  test('guest upgrades to an email account and the shop unlocks real purchases', async ({
    page,
  }) => {
    await seedConsent(page);
    await signInAsGuest(page);

    // Anonymous gating: the shop shows create-account CTAs instead of Buy
    await page.goto('/shop');
    await expect(page.getByTestId(/create-account-cta/).first()).toBeVisible({
      timeout: 15000,
    });

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

    // is_anonymous cleared after the session refresh: anonymous surfaces
    // are gone and real Buy buttons render
    await expect(page.getByTestId(/create-account-cta/)).toHaveCount(0);
    await expect(page.getByRole('button', { name: /^buy/i }).first()).toBeVisible();
  });
});

test.describe('Anonymous sessions', () => {
  test('guest session persists across navigation', async ({ page }) => {
    await seedConsent(page);
    await signInAsGuest(page);

    // Guest is authenticated: game page shows the game UI, not the prompt
    await expect(page.getByText(/sign in to play and save/i)).not.toBeVisible();

    // Navigating home keeps the session (stats panel renders for authed users)
    await page.goto('/');
    await expect(page.getByText(/launch a game to start/i)).not.toBeVisible({
      timeout: 15000,
    });
  });
});

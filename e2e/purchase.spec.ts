/**
 * Purchase Flow E2E Tests
 *
 * CI-safe: no Stripe network dependency. Anonymous (guest) accounts cannot
 * purchase - the server returns 403 account_required and the UI replaces
 * every buy button with a create-account CTA. Tests that would hit real
 * Stripe checkout are tagged @stripe and skipped by default.
 */

import { test, expect } from '@playwright/test';
import { seedConsent, signInAsGuest } from './helpers';

test.describe('Shop page', () => {
  test.beforeEach(async ({ page }) => {
    await seedConsent(page);
  });

  test('displays shop heading and energy products', async ({ page }) => {
    await page.goto('/shop');

    await expect(page.getByRole('heading', { name: /^shop$/i })).toBeVisible();
    await expect(
      page.getByRole('heading', { name: /energy packs/i })
    ).toBeVisible();

    // All three energy products render
    await expect(page.getByText('Energy Pack', { exact: true })).toBeVisible();
    await expect(page.getByText('Energy Bundle', { exact: true })).toBeVisible();
    await expect(page.getByText('Energy Vault', { exact: true })).toBeVisible();
  });

  test('displays product prices in USD', async ({ page }) => {
    await page.goto('/shop');

    await expect(page.getByText('$0.99')).toBeVisible();
    await expect(page.getByText('$2.49')).toBeVisible();
    await expect(page.getByText('$4.99')).toBeVisible();
  });

  test('displays fair play notice', async ({ page }) => {
    await page.goto('/shop');

    await expect(
      page.getByText(/purchases provide convenience, not power/i)
    ).toBeVisible();
  });
});

test.describe('Anonymous purchase gating', () => {
  test('guest sees create-account CTA instead of buy buttons', async ({ page }) => {
    await seedConsent(page);
    await signInAsGuest(page);
    await page.goto('/shop');

    // Save-progress notice for anonymous players
    await expect(page.getByText(/save your progress/i).first()).toBeVisible({
      timeout: 15000,
    });

    // Every energy product shows the account CTA, no buy button
    await expect(page.getByTestId('create-account-cta-energy_small')).toBeVisible();
    await expect(page.getByTestId('create-account-cta-energy_medium')).toBeVisible();
    await expect(page.getByTestId('create-account-cta-energy_large')).toBeVisible();
    await expect(page.getByRole('button', { name: /^buy$/i })).toHaveCount(0);
  });

  test('clicking the CTA opens the account upgrade modal', async ({ page }) => {
    await seedConsent(page);
    await signInAsGuest(page);
    await page.goto('/shop');

    const cta = page.getByTestId('create-account-cta-energy_small');
    await cta.waitFor({ state: 'visible', timeout: 15000 });
    await cta.click();

    await expect(page.getByTestId('account-upgrade-modal')).toBeVisible({
      timeout: 10000,
    });
  });

  test('server rejects guest checkout with 403 account_required', async ({ page }) => {
    await seedConsent(page);
    await signInAsGuest(page);

    // Call the checkout API directly with the guest session token
    const result = await page.evaluate(async () => {
      const keys = Object.keys(window.localStorage).filter((k) =>
        k.startsWith('sb-') && k.endsWith('-auth-token')
      );
      if (keys.length === 0) return { status: 0, error: 'no session' };
      const raw = window.localStorage.getItem(keys[0]);
      const session = raw ? JSON.parse(raw) : null;
      const token = session?.access_token;
      if (!token) return { status: 0, error: 'no token' };

      const res = await fetch('/api/checkout', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ productId: 'energy_small' }),
      });
      const data = await res.json().catch(() => ({}));
      return { status: res.status, error: data.error };
    });

    expect(result.status).toBe(403);
    expect(result.error).toBe('account_required');
  });
});

test.describe('Stripe checkout @stripe', () => {
  // Requires a registered (non-anonymous) account and live Stripe sandbox.
  // Run explicitly with: npx playwright test --grep @stripe
  test.skip(
    !process.env.E2E_STRIPE,
    'Stripe checkout tests need E2E_STRIPE=1 and a registered test account'
  );

  test('registered user reaches Stripe checkout', async ({ page }) => {
    await seedConsent(page);

    const email = process.env.E2E_STRIPE_EMAIL;
    const password = process.env.E2E_STRIPE_PASSWORD;
    test.skip(!email || !password, 'E2E_STRIPE_EMAIL/PASSWORD not set');

    await page.goto('/login');
    await page.getByLabel(/email/i).fill(email!);
    await page.getByLabel(/password/i).fill(password!);
    await page.getByRole('button', { name: /^sign in$/i }).click();
    await page.waitForURL(/\/game/, { timeout: 20000 });

    await page.goto('/shop');
    await page.getByRole('button', { name: /^buy$/i }).first().click();
    await page.waitForURL(/checkout\.stripe\.com/, { timeout: 30000 });
  });
});

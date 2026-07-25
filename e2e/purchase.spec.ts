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

  test('displays the shop heading', async ({ page }) => {
    await page.goto('/shop');

    await expect(page.getByRole('heading', { name: /^shop$/i })).toBeVisible();
  });

  test('sells no Energy (Constitution §8.6, §10.4 never-sold list)', async ({ page }) => {
    await page.goto('/shop');

    // Energy is a daily allotment with no balance to top up, so these SKUs
    // could no longer deliver anything. The storefront section and every
    // energy product are gone, and no bundle advertises an energy component.
    await expect(
      page.getByRole('heading', { name: /energy packs/i })
    ).toHaveCount(0);
    await expect(page.getByText('Energy Pack', { exact: true })).toHaveCount(0);
    await expect(page.getByText('Energy Bundle', { exact: true })).toHaveCount(0);
    await expect(page.getByText('Energy Vault', { exact: true })).toHaveCount(0);
    await expect(page.getByText(/\d+ Energy/)).toHaveCount(0);
  });

  test('displays gross prices in EUR (Austrian/EU storefront)', async ({ page }) => {
    await page.goto('/shop');

    // The remaining priced surface is the premium subscription; the energy
    // pack prices (€0.99 / €2.49 / €4.99) are gone with the products.
    await expect(page.getByText('€9.99').first()).toBeVisible();
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

    // No purchasable SKU is ever offered to a guest as a buy button. A
    // fresh guest account is also below the Day-2 bundle threshold, so the
    // product grid is empty; the premium subscribe path is the one
    // commercial action, and it too must demand a real account.
    await expect(page.getByRole('button', { name: /^buy$/i })).toHaveCount(0);
    await expect(page.getByRole('button', { name: /^buy bundle$/i })).toHaveCount(0);
  });

  test('the premium subscribe path demands a real account', async ({ page }) => {
    await seedConsent(page);
    await signInAsGuest(page);
    await page.goto('/shop');

    const subscribe = page.getByTestId('premium-subscribe');
    await subscribe.waitFor({ state: 'visible', timeout: 15000 });
    await subscribe.click();

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
        body: JSON.stringify({ productId: 'starter_bundle' }),
      });
      const data = await res.json().catch(() => ({}));
      return { status: res.status, error: data.error };
    });

    // 503 means STRIPE_SECRET_KEY is absent in this environment - the
    // anonymous gate sits behind the config check, so skip rather than fail.
    test.skip(result.status === 503, 'Payments not configured in this environment');

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
    // §18 FAGG immediate-delivery consent is required before checkout
    await page.locator('#withdrawal-consent').check();
    await page
      .getByRole('button', { name: /^buy( bundle)?$/i })
      .first()
      .click();
    await page.waitForURL(/checkout\.stripe\.com/, { timeout: 30000 });
  });
});

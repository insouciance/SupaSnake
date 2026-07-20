/**
 * SupaSnake Premium E2E Tests
 *
 * CI-safe: no Stripe network dependency. Covers the shop premium section
 * (gross EUR price, dual consent gate, anonymous CTA), the premium-gated
 * stats dashboard, and the server-side gates (403s) called directly.
 * The full billing lifecycle (renewal, past_due grace, cancellation) runs
 * against Stripe test clocks - see docs/game/QA_PREMIUM_BILLING.md.
 */

import { test, expect, type Page } from '@playwright/test';
import { seedConsent, signInAsGuest } from './helpers';

async function guestToken(page: Page): Promise<string | null> {
  return page.evaluate(() => {
    const keys = Object.keys(window.localStorage).filter(
      (k) => k.startsWith('sb-') && k.endsWith('-auth-token')
    );
    if (keys.length === 0) return null;
    const raw = window.localStorage.getItem(keys[0]);
    const session = raw ? JSON.parse(raw) : null;
    return session?.access_token ?? null;
  });
}

test.describe('Premium section in the shop', () => {
  test.beforeEach(async ({ page }) => {
    await seedConsent(page);
  });

  test('shows the subscription with gross EUR pricing and perks', async ({ page }) => {
    await page.goto('/shop');

    await expect(page.getByTestId('premium-section')).toBeVisible();
    await expect(page.getByText('€9.99')).toBeVisible();
    await expect(page.getByText(/incl\. VAT/)).toBeVisible();
    await expect(page.getByText('Season Pass included')).toBeVisible();
    // Never pay-to-win promise is stated right on the card
    await expect(page.getByText(/never pay-to-win/i)).toBeVisible();
  });

  test('yearly toggle shows the discounted yearly price', async ({ page }) => {
    await page.goto('/shop');

    await page.getByTestId('premium-plan-premium_yearly').click();
    await expect(page.getByText('€89.99')).toBeVisible();
    await expect(page.getByText(/2 months free/i)).toBeVisible();
  });

  test('shows both consent checkboxes (§10 FAGG + 18+)', async ({ page }) => {
    await page.goto('/shop');

    await expect(page.locator('#premium-service-consent')).toBeVisible();
    await expect(page.locator('#premium-adult-consent')).toBeVisible();
    await expect(page.getByText(/at least 18 years old/i)).toBeVisible();
  });

  test('guest sees the create-account CTA instead of subscribe', async ({ page }) => {
    await signInAsGuest(page);
    await page.goto('/shop');

    await expect(page.getByTestId('premium-create-account')).toBeVisible({
      timeout: 15000,
    });
    await expect(page.getByTestId('premium-subscribe')).toHaveCount(0);
  });
});

test.describe('Server-side premium gates', () => {
  test('guest premium checkout is rejected with 403 account_required', async ({ page }) => {
    await seedConsent(page);
    await signInAsGuest(page);

    const result = await page.evaluate(async () => {
      const keys = Object.keys(window.localStorage).filter(
        (k) => k.startsWith('sb-') && k.endsWith('-auth-token')
      );
      if (keys.length === 0) return { status: 0, error: 'no session' };
      const raw = window.localStorage.getItem(keys[0]);
      const session = raw ? JSON.parse(raw) : null;
      const token = session?.access_token;
      if (!token) return { status: 0, error: 'no token' };

      const res = await fetch('/api/premium/checkout', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          planId: 'premium_monthly',
          serviceStartConsent: true,
          adultConfirmation: true,
        }),
      });
      const data = await res.json().catch(() => ({}));
      return { status: res.status, error: data.error };
    });

    // 503 means STRIPE_SECRET_KEY is absent in this environment
    test.skip(result.status === 503, 'Payments not configured in this environment');

    expect(result.status).toBe(403);
    expect(result.error).toBe('account_required');
  });

  test('free accounts are locked out of the stats API with premium_required', async ({ page }) => {
    await seedConsent(page);
    await signInAsGuest(page);

    const token = await guestToken(page);
    test.skip(!token, 'No guest session token');

    const result = await page.evaluate(async (accessToken) => {
      const res = await fetch('/api/premium/stats', {
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      const data = await res.json().catch(() => ({}));
      return { status: res.status, error: data.error };
    }, token!);

    expect(result.status).toBe(403);
    expect(result.error).toBe('premium_required');
  });

  test('stipend claim without premium is rejected', async ({ page }) => {
    await seedConsent(page);
    await signInAsGuest(page);

    const token = await guestToken(page);
    test.skip(!token, 'No guest session token');

    const result = await page.evaluate(async (accessToken) => {
      const res = await fetch('/api/premium/claim-stipend', {
        method: 'POST',
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      const data = await res.json().catch(() => ({}));
      return { status: res.status, error: data.error };
    }, token!);

    // 503 = migration 028 not applied in this environment
    test.skip(result.status === 503, 'Premium infra not live in this environment');

    expect(result.status).toBe(403);
    expect(result.error).toBe('premium_required');
  });
});

test.describe('Stats dashboard gating', () => {
  test('free player sees the locked preview with a shop link', async ({ page }) => {
    await seedConsent(page);
    await signInAsGuest(page);
    await page.goto('/stats');

    await expect(page.getByTestId('stats-locked')).toBeVisible({ timeout: 15000 });
    await expect(page.getByTestId('stats-upsell')).toBeVisible();
    await expect(page.getByTestId('stats-dashboard')).toHaveCount(0);
  });
});

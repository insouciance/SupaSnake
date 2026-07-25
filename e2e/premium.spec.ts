/**
 * SupaSnake Premium E2E Tests
 *
 * CI-safe: no Stripe network dependency. Covers the shop premium section
 * (gross EUR price, the shipped perk list, dual consent gate, anonymous CTA),
 * the premium-gated stats dashboard, and the server-side gates called
 * directly. The full billing lifecycle (renewal, past_due grace, cancellation)
 * runs against Stripe test clocks - see docs/game/QA_PREMIUM_BILLING.md.
 *
 * WP-0.11 reconciled this file with what Phase 0 shipped. Premium is billing
 * plumbing plus expressive content (Constitution §10.2/§10.4): the energy
 * stipend, triple contracts, extended lab uptime and the Season Pass line are
 * all gone, so the assertions here are that they are gone - not that they are
 * gated. A perk that is merely gated can be un-gated.
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

  test('shows the subscription with gross EUR pricing and only shipped perks', async ({
    page,
  }) => {
    await page.goto('/shop');

    const section = page.getByTestId('premium-section');
    await expect(section).toBeVisible();
    await expect(page.getByText('€9.99')).toBeVisible();
    await expect(page.getByText(/incl\. VAT/)).toBeVisible();

    // The three perks WP-0.09 left standing. Each is expressive and has
    // shipped content behind it: the monthly drop (migration 028), the
    // supporter marks granted on activation, and the stats dashboard.
    await expect(section.getByText('Monthly exclusive cosmetic')).toBeVisible();
    await expect(section.getByText('Supporter prestige')).toBeVisible();
    await expect(section.getByText('Lab Analytics')).toBeVisible();

    // The three that were deleted, and the reason each had to go. The card is
    // the advertisement, so any of these reappearing is a false claim:
    // "Season Pass included" had no content behind it at all, and the other
    // two were paid progression rates (§10.4). The energy stipend went with
    // migration 039 - Energy is never sold, gifted or stipended (§8.6/§10.4).
    await expect(section.getByText(/season pass/i)).toHaveCount(0);
    await expect(section.getByText(/triple contracts/i)).toHaveCount(0);
    await expect(section.getByText(/extended lab uptime/i)).toHaveCount(0);
    await expect(section.getByText(/energy/i)).toHaveCount(0);
    await expect(section.getByText(/stipend/i)).toHaveCount(0);

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

  test('the premium energy stipend is gone entirely, not merely gated', async ({ page }) => {
    await seedConsent(page);
    await signInAsGuest(page);

    const token = await guestToken(page);
    test.skip(!token, 'No guest session token');

    const result = await page.evaluate(async (accessToken) => {
      const claim = await fetch('/api/premium/claim-stipend', {
        method: 'POST',
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      const status = await fetch('/api/premium/status', {
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      const statusBody = await status.json().catch(() => ({}));
      return { claimStatus: claim.status, statusBody };
    }, token!);

    // WP-0.01 deleted the route and `claim_premium_stipend` with migration
    // 039: Energy is a derived daily allotment, so there is no balance a
    // subscription could credit (§8.6/§10.4). The endpoint therefore does not
    // 403 - it does not exist. A 403 here would mean the faucet was merely
    // gated and could be re-opened by flipping a subscription flag.
    expect(result.claimStatus).toBe(404);

    // ...and the surviving premium surface never mentions one. The status
    // payload is billing plumbing plus the cosmetic drop; no energy, charge
    // or stipend field may return through it.
    const keys = Object.keys(result.statusBody as Record<string, unknown>);
    expect(keys).not.toContain('stipend');
    expect(keys.join(' ')).not.toMatch(/energy|charge|stipend/i);
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

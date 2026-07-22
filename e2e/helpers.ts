/**
 * Shared E2E helpers
 *
 * The consent banner mounts on first load (no stored `cookie-consent` key)
 * and covers the bottom of the viewport, so most specs pre-seed a consent
 * decision before navigation. Dedicated consent tests skip the pre-seed and
 * exercise the banner itself.
 */

import { test, type Page } from '@playwright/test';

export interface ConsentSeed {
  essential: boolean;
  functional: boolean;
  analytics: boolean;
  marketing: boolean;
  timestamp: string;
}

/**
 * Pre-seed a consent decision so the ConsentBanner never mounts.
 * Must be called before the first page.goto().
 */
export async function seedConsent(
  page: Page,
  overrides: Partial<ConsentSeed> = {}
): Promise<void> {
  const prefs: ConsentSeed = {
    essential: true,
    functional: false,
    analytics: false,
    marketing: false,
    timestamp: new Date().toISOString(),
    ...overrides,
  };
  await page.addInitScript((value) => {
    window.localStorage.setItem('cookie-consent', value);
  }, JSON.stringify(prefs));
}

/**
 * Dismiss the consent banner if it is currently visible (Reject All).
 * Safe to call when the banner is absent.
 */
export async function dismissConsentIfVisible(page: Page): Promise<void> {
  const reject = page.getByRole('button', { name: /reject all/i });
  if (await reject.isVisible({ timeout: 2000 }).catch(() => false)) {
    await reject.click();
  }
}

/**
 * Create a fresh anonymous (guest) session via the login page.
 * Deterministic: LoginForm awaits signInAnonymously before onSuccess
 * routes to /game.
 *
 * If anonymous sign-ins are disabled in the Supabase project
 * (error_code anonymous_provider_disabled), the app still navigates to
 * /game but stays unauthenticated. In that case the calling test is
 * SKIPPED with an actionable message instead of failing on a selector.
 */
export async function signInAsGuest(page: Page): Promise<void> {
  await page.goto('/login');
  await page.getByRole('button', { name: /play as guest/i }).click();
  await page.waitForURL(/\/game/, { timeout: 20000 });

  // Authenticated /game always renders the HUD ("Score"); a failed
  // anonymous sign-in lands on the sign-in prompt instead.
  const authedMarker = page.getByText(/^score$/i);
  const signInPrompt = page.getByText(/sign in to play and save/i);
  await authedMarker
    .or(signInPrompt)
    .first()
    .waitFor({ state: 'visible', timeout: 20000 });

  if (await signInPrompt.isVisible().catch(() => false)) {
    test.skip(
      true,
      'Anonymous sign-ins are disabled in the Supabase project ' +
        '(Dashboard > Authentication > Sign In / Up > Anonymous). ' +
        'Guest-flow tests cannot run until it is enabled.'
    );
  }
}

/**
 * Complete the FTUE starter selection from the home page.
 * Requires an authenticated session that still needs a starter.
 * Ends on /game with the starter equipped.
 */
export async function pickStarter(
  page: Page,
  dynasty: 'CYBER' | 'PRIMAL' | 'COSMIC' = 'PRIMAL'
): Promise<void> {
  await page.goto('/');
  const starterCard = page.getByTestId(`starter-${dynasty}`);
  await starterCard.waitFor({ state: 'visible', timeout: 20000 });
  await starterCard.click();
  await page.getByRole('button', { name: /confirm & play/i }).click();
  await page.waitForURL(/\/game/, { timeout: 20000 });
}

/**
 * Shared E2E helpers
 *
 * The consent banner mounts on first load (no stored `cookie-consent` key)
 * and covers the bottom of the viewport, so most specs pre-seed a consent
 * decision before navigation. Dedicated consent tests skip the pre-seed and
 * exercise the banner itself.
 */

import { expect, test, type Page } from '@playwright/test';

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
 * Reveal the Run Setup page's adjustable controls.
 *
 * WP-1.06 (Constitution §5) folds the mode toggle, the aim system, the
 * control scheme and the Build Seed into a single closed disclosure so that a
 * first-time player sees START as the only emphasised action. Specs that
 * exercise those controls call this first; it is a no-op with
 * NEXT_PUBLIC_RUN_FLOW_V1 off, where the controls are already laid out flat.
 */
export async function openRunSetupControls(page: Page): Promise<void> {
  const adjust = page.getByTestId('run-setup-adjust');
  if ((await adjust.count()) === 0) return;
  if (await adjust.evaluate((node) => (node as HTMLDetailsElement).open)) return;
  await adjust.getByText(/adjust this run/i).click();
  await expect(adjust).toHaveJSProperty('open', true);
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
  await page.goto('/login', { waitUntil: 'domcontentloaded' });
  await page.getByRole('button', { name: /play as guest/i }).click();

  // In Chromium software rendering, App Router navigation can be starved
  // after Supabase has already established the anonymous session. Accept the
  // authenticated guest notice as proof of the mutation, then navigate
  // explicitly so the test can continue from the server-bootstrapped game.
  const guestAuthenticated = page.getByText(/you(?:'|’)?re playing as a guest/i);
  await Promise.race([
    page.waitForURL(/\/game/, { timeout: 30000 }),
    guestAuthenticated.waitFor({ state: 'visible', timeout: 30000 }),
  ]);
  if (!/\/game(?:$|[/?#])/.test(new URL(page.url()).pathname)) {
    await page.goto('/game', { waitUntil: 'domcontentloaded' });
  }

  // Authenticated /game renders either the HUD or the ready-to-play setup
  // surface. The setup surface intentionally obscures the pre-run HUD, so it
  // is the stronger marker on slower production/WebGL boots.
  const authedMarker = page.getByText(/^score$/i)
    .or(page.getByRole('heading', { name: /ready to play/i }));
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

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
 * Run Setup keeps the ordinary mode choice directly in the cockpit, while
 * Aim, Ladder, anomaly detail, and Build Seed live in one closed disclosure.
 * Specs that exercise those advanced controls call this first; it is a no-op with
 * NEXT_PUBLIC_RUN_FLOW_V1 off, where the controls are already laid out flat.
 */
export async function openRunSetupControls(page: Page): Promise<void> {
  const adjust = page.getByTestId('run-setup-adjust');
  if ((await adjust.count()) === 0) return;
  if (await adjust.evaluate((node) => (node as HTMLDetailsElement).open)) return;
  await adjust.getByText(/tune run|adjust this run/i).click();
  await expect(adjust).toHaveJSProperty('open', true);
}

/**
 * Get a board that is actually live, under either flag configuration.
 *
 * With `NEXT_PUBLIC_RUN_FLOW_V1` ON - which is how PRODUCTION runs - `/game`
 * opens on the Run Setup page and the board does not exist until START is
 * pressed. With the flag off the board is live on arrival. Specs that assert
 * on in-run surfaces (`first-movement-prompt`, the HUD, the snake itself)
 * must call this first or they assert against a setup screen.
 *
 * This helper is why the flag-on e2e leg exists: three specs asserted the
 * flag-off flow and had never once run in the configuration players get.
 */
export async function startRunIfSetupPresent(page: Page): Promise<void> {
  const start = page.getByTestId('earn-start');
  if ((await start.count()) === 0) return; // flag off: already on the board
  await expect(start).toBeVisible({ timeout: 30_000 });
  await start.click();
  // The board replaces the setup page; `run-setup` disappearing is the
  // unambiguous signal, and waiting on it keeps the caller's own assertion
  // from racing the transition.
  await expect(page.getByTestId('run-setup')).toHaveCount(0, { timeout: 30_000 });
}

/**
 * Take the deliberate first movement that releases a held board.
 *
 * The board is HELD until the player's first direction (§5 input semantics).
 * `/game`'s keydown listener lives in an effect whose dependency list includes
 * the ready flag, so the status rail renders "press a direction to start" one
 * commit BEFORE a listener exists that can act on it. A key dispatched inside
 * that window is dropped for good — nothing re-arms it, the board stays held,
 * and the waiting assertion burns the whole 60s test budget. That is exactly
 * the "60-second timeout" signature the flag-on leg was reporting: automation
 * presses within milliseconds of the board appearing and loses the race every
 * time, where a human never gets near it.
 *
 * So: wait for the held-board prompt, then press until the board reports that
 * it is running. Every press here is the same single player action — the
 * repeat compensates for the listener, not for the player — which is why
 * callers that count taps count this as one.
 *
 * Works under both flag configurations: the cockpit's status rail and the
 * rollback screen's prompt use different markup but the same wording.
 */
export async function releaseHeldBoard(
  page: Page,
  key: 'ArrowRight' | 'ArrowLeft' | 'ArrowUp' | 'ArrowDown' = 'ArrowRight'
): Promise<void> {
  const heldPrompt = page
    .getByText(/direction to start|arrow to move|direction to resume/i)
    .first();
  await expect(heldPrompt).toBeVisible({ timeout: 30_000 });
  await expect(async () => {
    await page.keyboard.press(key);
    await expect(heldPrompt).toBeHidden({ timeout: 2_000 });
  }).toPass({ timeout: 30_000 });
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
  const scoreMarker = page.getByText(/^score$/i).first();
  const setupMarker = page
    .getByRole('heading', { name: /ready to (?:play|launch)/i })
    .first();
  const signInPrompt = page.getByText(/sign in to play and save/i);
  // Do not combine these locators with `.or(...).first()`: the pre-run HUD
  // keeps a visually hidden Score label before the visible Setup heading in
  // DOM order, so `.first()` can wait on the wrong branch forever.
  await expect
    .poll(
      async () =>
        (await scoreMarker.isVisible().catch(() => false)) ||
        (await setupMarker.isVisible().catch(() => false)) ||
        (await signInPrompt.first().isVisible().catch(() => false)),
      { timeout: 20_000 }
    )
    .toBe(true);

  if (await signInPrompt.isVisible().catch(() => false)) {
    test.skip(
      true,
      'Anonymous sign-ins are disabled in the Supabase project ' +
        '(Dashboard > Authentication > Sign In / Up > Anonymous). ' +
        'Guest-flow tests cannot run until it is enabled.'
    );
  }
}

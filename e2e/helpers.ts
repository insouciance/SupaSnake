/**
 * Shared E2E helpers
 *
 * The consent banner mounts on first load (no stored `cookie-consent` key)
 * and covers the bottom of the viewport, so most specs pre-seed a consent
 * decision before navigation. Dedicated consent tests skip the pre-seed and
 * exercise the banner itself.
 */

import { expect, test, type Locator, type Page } from '@playwright/test';

const RUN_FLOW_ENABLED = process.env.NEXT_PUBLIC_RUN_FLOW_V1 === 'true';

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
 * Reveal the Run Setup page's adjustable controls — a PERMANENT NO-OP.
 *
 * Run Setup is three elements (owner ruling 2026-08-07): Dynasty Favorites,
 * the Energy Reactor, PLAY. The `<details data-testid="run-setup-adjust">`
 * "Tune run" disclosure this helper used to open went with the four controls
 * it hid — the aim picker (moved to the Lab), the anomaly entry (moved to
 * Home), the difficulty ladder (deleted) and Build Seed. There is nothing left
 * to reveal, so the body is an immediate return rather than a count-then-open
 * that can only ever find zero.
 *
 * The export is kept so existing call sites still compile, and so that a spec
 * which needs a control cannot quietly reintroduce a disclosure by calling a
 * helper that opens one. New specs must not call it: every control Setup still
 * has is visible on arrival, which is the whole point of the ruling.
 */
export async function openRunSetupControls(_page: Page): Promise<void> {
  return;
}

/**
 * The pre-run screen, whichever one this build ships.
 *
 * The 2026-08-07 ruling removed Run Setup's "Ready to launch" heading along
 * with the launch chamber that carried it, so a spec that runs on every flag
 * leg can no longer ask for a heading: with NEXT_PUBLIC_RUN_FLOW_V1 ON the
 * pre-run surface is the `run-setup` tray and has no heading at all, and with
 * the flag OFF the shipped rollback screen still prints "Ready to Play".
 *
 * Branch on the flag rather than `.or()`-ing the two: only one of them exists
 * in any given build, and naming the build's own surface makes a failure say
 * which leg broke.
 */
export function runSetupReady(page: Page): Locator {
  return RUN_FLOW_ENABLED
    ? page.getByTestId('run-setup')
    : page.getByRole('heading', { name: /ready to play/i });
}

/**
 * Set up a FREE run — no Energy staked, no rewards.
 *
 * THE MODE COLLAPSE (owner ruling 2026-08-07). Run Setup has no Earn/Free
 * toggle any more: `gameMode` is DERIVED from the Energy Reactor, so a run
 * with no rod seated IS a free run and the start control becomes
 * `free-play-start` on its own. The rollback screen still carries the shipped
 * `ModeToggle`, so the two legs choose free play with two different gestures
 * and that split lives here instead of in every spec.
 *
 * `energy-run-lean` is disabled at zero, which is the state this helper wants:
 * an account with no recovered Energy already starts cold.
 */
export async function chooseFreePlay(page: Page): Promise<void> {
  if (RUN_FLOW_ENABLED) {
    const reactor = page.getByTestId('energy-commitment');
    await expect(reactor).toBeVisible({ timeout: 30_000 });
    const goCold = page.getByTestId('energy-run-lean');
    if (await goCold.isEnabled()) await goCold.click();
    await expect(page.getByTestId('energy-summary')).toHaveText(/free play/i);
    return;
  }
  const freeMode = page.getByTestId('mode-free');
  // Deliberately NOT a forced click: the ANOMALY chip is inserted to this
  // button's left once /api/anomaly resolves, and skipping the stability check
  // lands the click at the pre-shift coordinates.
  await freeMode.click();
  await expect(freeMode).toHaveAttribute('aria-pressed', 'true');
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
  // Do not infer the flag from one immediate DOM read. Home navigation can
  // commit `/game` before the Setup client tree mounts; returning on a
  // momentary count of zero leaves the test on Setup and falsely treats it as
  // the rollback board. CI builds each matrix leg with this exact flag.
  if (!RUN_FLOW_ENABLED) return;
  // The start control's test id is DERIVED from the Energy Reactor since the
  // 2026-08-07 mode collapse: no rod seated renders `free-play-start`, any rod
  // renders `earn-start`, and Home's `?mode=anomaly` card renders
  // `anomaly-start`. Exactly one of the three is ever mounted, so `.or()` is
  // not a strict-mode hazard — and asking only for `earn-start` would hang for
  // the full 30s on any account whose Energy has not recovered.
  const start = page
    .getByTestId('earn-start')
    .or(page.getByTestId('free-play-start'))
    .or(page.getByTestId('anomaly-start'));
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

  // Authenticated /game renders either the HUD or the pre-run setup surface.
  // The setup surface intentionally obscures the pre-run HUD, so it is the
  // stronger marker on slower production/WebGL boots. It is asked for by
  // `runSetupReady` because the 2026-08-07 ruling left Run Setup with no
  // heading at all — a heading locator would only ever resolve on the
  // rollback leg.
  const scoreMarker = page.getByText(/^score$/i).first();
  const setupMarker = runSetupReady(page).first();
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

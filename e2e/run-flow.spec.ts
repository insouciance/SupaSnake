/**
 * WP-1.06 — Run Setup + Results three layers (Constitution §5, §12.2).
 *
 * The acceptance criteria are tap counts, so they are counted here rather
 * than inspected: every interaction goes through `taps()`, which increments a
 * counter, and the assertions are on the counter.
 *
 *   §5 / cap §12.2:  open → LAUNCH → START → board   ≤ 3 taps
 *                    Results → REPLAY → next run     ≤ 2 taps
 *
 * The suite splits on NEXT_PUBLIC_RUN_FLOW_V1: the flag-on describe asserts
 * the new shape, the flag-off describe asserts the shipped screen is intact.
 * One of the two runs in any given build; both are exercised by running the
 * suite twice, which is what the WP's report does.
 */

import { test, expect, type Page } from '@playwright/test';
import { seedConsent, signInAsGuest } from './helpers';

const RUN_FLOW_ENABLED = process.env.NEXT_PUBLIC_RUN_FLOW_V1 === 'true';

/** A counted interaction. Every tap in this file goes through one of these. */
class Taps {
  count = 0;

  async click(page: Page, testId: string) {
    this.count += 1;
    // The WebGL canvas repaints under the overlay; the shipped specs click
    // start controls forced for exactly this reason.
    await page.getByTestId(testId).click({ force: true });
  }

  async press(page: Page, key: string) {
    this.count += 1;
    await page.keyboard.press(key);
  }
}

const CHARGE = {
  remaining: 4,
  perDay: 6,
  usedToday: 2,
  day: '2026-07-25',
  refillsAt: '2026-07-26T00:00:00.000Z',
  visible: true,
};

interface SettlementOptions {
  /** Include WP-1.04's `dailyTake` block (the day's first run). */
  withTake?: boolean;
}

/**
 * Deterministic fixtures for a returning player with one equipped PRIMAL
 * snake. Real auth, stubbed data - the house pattern from cockpit.spec.ts.
 */
async function installRunFlowFixtures(
  page: Page,
  options: SettlementOptions = {}
): Promise<void> {
  await page.route('**/api/player', async (route) => {
    if (route.request().method() !== 'GET') return route.continue();
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      json: {
        player: {
          id: 'run-flow-player',
          total_games_played: 20,
          high_score: 10_000,
        },
        charge: CHARGE,
        needsStarterSelection: false,
        hasCompletedFirstRun: true,
        aimSystem: 'deadeye',
      },
    });
  });

  await page.route('**/api/collection', async (route) => {
    if (route.request().method() !== 'GET') return route.continue();
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      json: {
        snakes: [
          {
            id: 'run-flow-snake',
            isEquipped: true,
            generation: 3,
            variantName: 'Ouroboros',
            variantId: 'primal',
            dynastyName: 'PRIMAL',
            traits: [],
            lineage: null,
          },
        ],
      },
    });
  });

  await page.route('**/api/game/session', async (route) => {
    const body = route.request().postDataJSON() as { action?: string } | null;
    if (body?.action === 'start') {
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        json: {
          sessionId: `run-flow-session-${Date.now()}`,
          charge: { state: 'charged', ...CHARGE },
          traits: [],
          mutationPool: [],
          mastery: { dynasty: 'PRIMAL', xp: 0, level: 2 },
        },
      });
    }
    if (body?.action === 'end') {
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        json: {
          success: true,
          player: { dna: 1234, total_games_played: 21, high_score: 10_000 },
          validation: {
            valid: true,
            adjustedDna: 96,
            baseDna: 120,
            rawDna: 120,
            genelessRawDna: 120,
            score: 40,
            extracted: false,
            yieldDna: 120,
            chargeState: 'charged',
          },
          ...(options.withTake
            ? {
                dailyTake: {
                  firstRunOfDay: true,
                  amount: 150,
                  streakDays: 3,
                  multiplier: 1.25,
                  collected: false,
                },
              }
            : {}),
        },
      });
    }
    return route.continue();
  });
}

test.describe('Run Flow v1 — Run Setup and three-layer Results', () => {
  test.skip(
    !RUN_FLOW_ENABLED,
    'NEXT_PUBLIC_RUN_FLOW_V1 is off in this build; the flag-off suite below runs instead.'
  );

  test.beforeEach(async ({ page }) => {
    await seedConsent(page);
  });

  test('open → LAUNCH → START → board in at most 3 taps (§5, cap §12.2)', async ({
    page,
  }) => {
    await installRunFlowFixtures(page);
    await signInAsGuest(page);

    const taps = new Taps();

    // Tap 0 is not a tap: arriving on the site.
    await page.goto('/', { waitUntil: 'domcontentloaded' });

    // Tap 1 — LAUNCH. It opens Run Setup; it does not start a run.
    await taps.click(page, 'launch-cta');
    await page.waitForURL(/\/game/, { timeout: 60_000 });

    // Run Setup: fully preset, START the only emphasised action.
    const setup = page.getByTestId('run-setup');
    await expect(setup).toBeVisible({ timeout: 60_000 });
    await expect(page.getByTestId('run-setup-summary')).toBeVisible();
    // The one sanctioned extra tap adds no required configuration: every
    // control is behind a single closed disclosure.
    await expect(page.getByTestId('run-setup-adjust')).toHaveJSProperty(
      'open',
      false
    );

    // Tap 2 — START.
    await taps.click(page, 'earn-start');
    await expect(page.getByTestId('game-board-viewport')).toBeVisible({
      timeout: 60_000,
    });

    // Tap 3 — the deliberate first movement (§5 input semantics). The board
    // is live from here.
    await taps.press(page, 'ArrowRight');

    expect(taps.count).toBeLessThanOrEqual(3);
  });

  test('Results → REPLAY → next run in at most 2 taps (§5, cap §12.2)', async ({
    page,
  }) => {
    await installRunFlowFixtures(page);
    await signInAsGuest(page);

    await page.goto('/game', { waitUntil: 'domcontentloaded' });
    await expect(page.getByTestId('run-setup')).toBeVisible({ timeout: 60_000 });
    await page.getByTestId('earn-start').click({ force: true });
    await expect(page.getByTestId('game-board-viewport')).toBeVisible({
      timeout: 60_000,
    });
    await page.keyboard.press('ArrowRight');

    // The run ends by itself against the wall.
    await expect(page.getByTestId('run-results')).toBeVisible({ timeout: 60_000 });

    const taps = new Taps();

    // Tap 1 — REPLAY. It skips setup entirely.
    await taps.click(page, 'results-replay');
    await expect(page.getByTestId('run-results')).toBeHidden({ timeout: 60_000 });
    await expect(page.getByTestId('run-setup')).toHaveCount(0);
    await expect(page.getByTestId('game-board-viewport')).toBeVisible({
      timeout: 60_000,
    });

    // Tap 2 — the deliberate first movement.
    await taps.press(page, 'ArrowRight');

    expect(taps.count).toBeLessThanOrEqual(2);
  });

  test('Results is exactly three layers with exactly one next action and no commerce', async ({
    page,
  }) => {
    await installRunFlowFixtures(page);
    await signInAsGuest(page);

    await page.goto('/game', { waitUntil: 'domcontentloaded' });
    await expect(page.getByTestId('run-setup')).toBeVisible({ timeout: 60_000 });
    await page.getByTestId('earn-start').click({ force: true });
    await expect(page.getByTestId('game-board-viewport')).toBeVisible({
      timeout: 60_000,
    });
    await page.keyboard.press('ArrowRight');

    const results = page.getByTestId('run-results');
    await expect(results).toBeVisible({ timeout: 60_000 });

    // Cap §12.2: three layers.
    await expect(results.locator('[data-testid^="results-layer-"]')).toHaveCount(3);
    await expect(page.getByTestId('results-layer-1')).toBeVisible();
    await expect(page.getByTestId('results-layer-2')).toBeVisible();
    await expect(page.getByTestId('results-layer-3')).toBeVisible();

    // Cap §12.2: exactly one recommended next action.
    await expect(results.getByTestId('results-next-action')).toHaveCount(1);

    // Layer 3 is a single collapsed digest.
    const digest = results.getByTestId('results-digest');
    if (await digest.count()) {
      await expect(digest).toHaveCount(1);
      await expect(digest).toHaveJSProperty('open', false);
    }

    // Layer 2 carries the two numbers.
    await expect(page.getByTestId('results-score')).toBeVisible();
    await expect(page.getByTestId('results-yield')).toBeVisible();

    // Rule 7: zero commercial surfaces on Results.
    const hrefs = await results.locator('a[href]').evaluateAll((nodes) =>
      nodes.map((node) => node.getAttribute('href') ?? '')
    );
    for (const href of hrefs) {
      expect(href).not.toMatch(/shop|premium|checkout|billing|stripe/i);
    }
    await expect(results).not.toContainText(
      /\b(buy|purchase|subscribe|season pass|keeper)\b/i
    );
  });

  test('the Take collect slot renders only on the day first run', async ({
    page,
  }) => {
    // No `dailyTake` in the settlement → the server did not call this the
    // day's first run → no slot, and nothing errors.
    await installRunFlowFixtures(page);
    await signInAsGuest(page);
    await page.goto('/game', { waitUntil: 'domcontentloaded' });
    await expect(page.getByTestId('run-setup')).toBeVisible({ timeout: 60_000 });
    await page.getByTestId('earn-start').click({ force: true });
    await page.keyboard.press('ArrowRight');
    await expect(page.getByTestId('run-results')).toBeVisible({ timeout: 60_000 });
    await expect(page.getByTestId('results-take')).toHaveCount(0);
  });

  test('the Take collect slot renders on a first-run-of-day settlement', async ({
    page,
  }) => {
    await installRunFlowFixtures(page, { withTake: true });
    await signInAsGuest(page);
    await page.goto('/game', { waitUntil: 'domcontentloaded' });
    await expect(page.getByTestId('run-setup')).toBeVisible({ timeout: 60_000 });
    await page.getByTestId('earn-start').click({ force: true });
    await page.keyboard.press('ArrowRight');
    await expect(page.getByTestId('run-results')).toBeVisible({ timeout: 60_000 });

    const take = page.getByTestId('results-take');
    await expect(take).toBeVisible();
    await expect(take).toContainText('150 DNA');
    // It belongs to Layer 1.
    await expect(page.getByTestId('results-layer-1').getByTestId('results-take'))
      .toHaveCount(1);

    // WP-1.04 has not shipped /api/daily-take/collect. Collecting must be a
    // quiet no-op, never an error surface.
    await page.getByTestId('results-take-collect').click({ force: true });
    await expect(page.getByTestId('results-take-status')).toContainText(
      /settles with the day/i,
      { timeout: 20_000 }
    );
  });

  test('SETUP reopens the setup page over a finished run', async ({ page }) => {
    await installRunFlowFixtures(page);
    await signInAsGuest(page);
    await page.goto('/game', { waitUntil: 'domcontentloaded' });
    await expect(page.getByTestId('run-setup')).toBeVisible({ timeout: 60_000 });
    await page.getByTestId('earn-start').click({ force: true });
    await page.keyboard.press('ArrowRight');
    await expect(page.getByTestId('run-results')).toBeVisible({ timeout: 60_000 });

    await page.getByTestId('results-setup').click({ force: true });
    await expect(page.getByTestId('run-setup')).toBeVisible();
    await expect(page.getByTestId('run-results')).toHaveCount(0);
  });
});

test.describe('Run Flow v1 off — the shipped screens are the rollback path', () => {
  test.skip(
    RUN_FLOW_ENABLED,
    'NEXT_PUBLIC_RUN_FLOW_V1 is on in this build; the flag-on suite above runs instead.'
  );

  test.beforeEach(async ({ page }) => {
    await seedConsent(page);
  });

  test('the released pre-run and game-over screens render, and the new ones do not', async ({
    page,
  }) => {
    await installRunFlowFixtures(page);
    await signInAsGuest(page);

    await page.goto('/game', { waitUntil: 'domcontentloaded' });

    // The shipped pre-run screen, unchanged.
    await expect(
      page.getByRole('heading', { name: /ready to play/i })
    ).toBeVisible({ timeout: 60_000 });
    await expect(page.getByTestId('run-setup')).toHaveCount(0);
    await expect(page.getByTestId('mode-earn')).toBeVisible();
    await expect(page.getByTestId('ruleset-explainer')).toBeVisible();

    await page.getByTestId('earn-start').click({ force: true });
    await expect(page.getByTestId('game-board-viewport')).toBeVisible({
      timeout: 60_000,
    });
    await page.keyboard.press('ArrowRight');

    // The shipped game-over screen, unchanged.
    await expect(page.getByTestId('gameover-crashed')).toBeVisible({
      timeout: 60_000,
    });
    await expect(page.getByTestId('run-results')).toHaveCount(0);
    await expect(page.getByTestId('results-layer-1')).toHaveCount(0);
    await expect(page.getByTestId('results-next-action')).toHaveCount(0);
    await expect(page.getByTestId('earn-start')).toBeVisible();
  });
});

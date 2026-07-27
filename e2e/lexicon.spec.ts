/**
 * WP-2.07a — The Lexicon.
 *
 * The defect these specs exist for is a touch defect, so they run on a
 * touch viewport. `TRAITS[].effect` has shipped for months, but only as an
 * HTML `title` attribute: a phone never shows one, so a player on a phone
 * could not find out what their own snake does. `hasTouch` is a context
 * option `playwright.config.ts` does not set, so it is set per-describe
 * here rather than globally.
 *
 * The second describe covers the other half of the package: `/codex` is in
 * the public sitemap and the public footer, and used to be auth-walled AND
 * 15-banked-run-gated. Its rules now render for a signed-out visitor.
 */

import { test, expect, type Page } from '@playwright/test';
import { seedConsent, signInAsGuest } from './helpers';

const PHONE = { width: 390, height: 844 } as const;

const CHARGE = {
  remaining: 4,
  perDay: 6,
  usedToday: 2,
  day: '2026-07-26',
  refillsAt: '2026-07-27T00:00:00.000Z',
  visible: true,
};

/**
 * A returning player whose equipped snake carries Ascetic — the trait that
 * removes an entire system from the run and said so nowhere.
 */
async function installAsceticSnake(page: Page): Promise<void> {
  await page.route('**/api/player', async (route) => {
    if (route.request().method() !== 'GET') return route.continue();
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      json: {
        player: { id: 'lexicon-player', total_games_played: 20, high_score: 10_000 },
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
            id: 'lexicon-snake',
            isEquipped: true,
            generation: 3,
            variantName: 'Ouroboros',
            variantId: 'primal',
            dynastyName: 'PRIMAL',
            traits: ['ascetic'],
            traitSlots: 2,
            lineage: null,
          },
        ],
      },
    });
  });
}

test.describe('Run Setup explains the snake on touch', () => {
  test.use({ viewport: PHONE, hasTouch: true });

  test.beforeEach(async ({ page }) => {
    await seedConsent(page);
  });

  test('a trait explains itself on tap, and the removed system is stated up front', async ({
    page,
  }) => {
    await installAsceticSnake(page);
    await signInAsGuest(page);

    await page.goto('/game', { waitUntil: 'domcontentloaded' });

    const heirloom = page.getByTestId('heirloom-summary');
    await expect(heirloom).toBeVisible({ timeout: 60_000 });

    // The warning needs no tap at all: Ascetic deletes mutation foods from
    // the run, and that has to be readable before START.
    await expect(page.getByTestId('heirloom-notice-ascetic')).toContainText(
      /no mutation foods/i
    );

    // The chip itself is now a real control. Tap it.
    const trigger = page.getByTestId('info-popover-trait-ascetic');
    await expect(trigger).toHaveAttribute('aria-expanded', 'false');
    await trigger.tap();

    const panel = page.getByTestId('info-panel-trait-ascetic');
    await expect(panel).toBeVisible();
    await expect(trigger).toHaveAttribute('aria-expanded', 'true');
    // Both halves of the deal, which a `title` tooltip never delivered here.
    await expect(panel).toContainText('All food ×1.4 base value');
    await expect(panel).toContainText(/Mutation foods never spawn/i);

    // It stays inside the viewport at 390px — the reason for the width clamp.
    const box = await panel.boundingBox();
    expect(box).not.toBeNull();
    expect(box!.x).toBeGreaterThanOrEqual(0);
    expect(box!.x + box!.width).toBeLessThanOrEqual(PHONE.width);

    // A second tap closes it, and a tap outside closes it.
    await trigger.tap();
    await expect(panel).toBeHidden();
    await trigger.tap();
    await expect(panel).toBeVisible();
    // Dismiss by tapping the heirloom block itself, NOT `run-setup`.
    // `run-setup` is the RunSetupPanel, which only renders under
    // NEXT_PUBLIC_RUN_FLOW_V1 — off in CI — so targeting it made this
    // assertion unreachable in exactly the configuration CI runs. The
    // heirloom summary renders in BOTH flag branches, which is the whole
    // point of the component, so it is the honest outside-tap target here.
    await page.getByTestId('heirloom-summary').tap({ position: { x: 5, y: 5 } });
    await expect(panel).toBeHidden();
  });

  test('the popover never becomes a modal dialog', async ({ page }) => {
    await installAsceticSnake(page);
    await signInAsGuest(page);
    await page.goto('/game', { waitUntil: 'domcontentloaded' });

    await expect(page.getByTestId('heirloom-summary')).toBeVisible({
      timeout: 60_000,
    });
    await page.getByTestId('info-popover-trait-ascetic').tap();
    await expect(page.getByTestId('info-panel-trait-ascetic')).toBeVisible();
    // No escalation at any viewport: one behaviour, one accessibility surface.
    await expect(page.locator('[role="dialog"]')).toHaveCount(0);
  });
});

test.describe('The Codex reads as a lexicon', () => {
  test.use({ viewport: PHONE, hasTouch: true });

  test.beforeEach(async ({ page }) => {
    await seedConsent(page);
  });

  test('a signed-out visitor can read the rules', async ({ page }) => {
    // /codex is in the public sitemap and the landing footer. Following
    // either used to reach an auth wall behind a 15-banked-run gate.
    await page.goto('/codex', { waitUntil: 'domcontentloaded' });

    await expect(page.getByTestId('codex-page')).toBeVisible({ timeout: 60_000 });
    await expect(page.getByTestId('codex-rules')).toBeVisible();

    // The three extraction verbs — the game's most load-bearing vocabulary,
    // documented nowhere before this work package.
    for (const verb of ['BANK', 'PASS', 'INFUSE']) {
      await expect(
        page.getByTestId(`lexicon-mechanic-extraction_${verb.toLowerCase()}`)
      ).toContainText(verb);
    }

    // Every documented section, no API call needed for any of them.
    for (const section of [
      'lexicon-mechanics',
      'lexicon-dynasties',
      'lexicon-traits',
      'lexicon-strains',
      'lexicon-anomalies',
    ]) {
      await expect(page.getByTestId(section)).toBeVisible();
    }
    // All fifteen strain tiers are spelled out.
    await expect(page.getByTestId('lexicon-tier-FERAL-2')).toContainText('Molt');

    // The discovery layer, and only it, still asks for an account.
    await expect(page.getByTestId('codex-signed-out')).toBeVisible();
  });

  test('a guest at zero banked runs still gets the whole catalog', async ({
    page,
  }) => {
    await signInAsGuest(page);
    await page.goto('/codex', { waitUntil: 'domcontentloaded' });

    await expect(page.getByTestId('codex-rules')).toBeVisible({ timeout: 60_000 });
    await expect(page.getByTestId('lexicon-mechanic-charges')).toBeVisible();
    // The old behaviour was a bare "Bank 15 runs to open the Genome Codex".
    await expect(page.getByText(/Bank 15 runs to open/i)).toHaveCount(0);
  });
});

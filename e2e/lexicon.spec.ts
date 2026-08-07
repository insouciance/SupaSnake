/**
 * WP-2.07a — Genome Research and touch-readable Heirlooms.
 *
 * The defect these specs exist for is a touch defect, so they run on a
 * touch viewport. `TRAITS[].effect` has shipped for months, but only as an
 * HTML `title` attribute: a phone never shows one, so a player on a phone
 * could not find out what their own snake does. `hasTouch` is a context
 * option `playwright.config.ts` does not set, so it is set per-describe
 * here rather than globally.
 *
 * The second describe protects the consolidated research architecture:
 * `/codex` remains a public compatibility URL, but it now opens one Workbench
 * rather than a duplicate rules/Archive surface. Genome v2 exposes the full
 * research table before sign-in; both mixed and full rollback states remain
 * explicit rather than silently inventing a second destination.
 */

import { test, expect, type Page } from '@playwright/test';
import { dismissTarget, seedConsent, signInAsGuest } from './helpers';

const PHONE = { width: 390, height: 844 } as const;
const GENOME_V2_ENABLED = process.env.NEXT_PUBLIC_GENOME_V2 === 'true';
const WORKBENCH_V1_ENABLED = process.env.NEXT_PUBLIC_WORKBENCH_V1 === 'true';

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
        player: {
          id: 'lexicon-player',
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
      /no mutation foods/i,
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
    const triggerBox = await trigger.boundingBox();
    expect(box).not.toBeNull();
    expect(triggerBox).not.toBeNull();
    expect(box!.x).toBeGreaterThanOrEqual(0);
    expect(box!.x + box!.width).toBeLessThanOrEqual(PHONE.width);
    expect(box!.y).toBeGreaterThanOrEqual(0);
    expect(box!.y + box!.height).toBeLessThanOrEqual(PHONE.height);
    expect(
      box!.y + box!.height <= triggerBox!.y ||
        box!.y >= triggerBox!.y + triggerBox!.height,
    ).toBe(true);

    // A second tap closes it, and a tap outside closes it.
    await trigger.tap();
    await expect(panel).toBeHidden();
    await trigger.tap();
    await expect(panel).toBeVisible();
    // Dismiss on a neutral point that exists in both flag branches. Run Setup
    // has no heading since the 2026-08-07 three-element ruling, so the target
    // is the "who is flying" label on the production leg and the rollback
    // screen's own heading on the other. The panel can legitimately cover part
    // of its own heirloom block when space is tight, so an "outside" test must
    // target a point that is actually outside and must not click through onto
    // a setup control — a label is inert on both legs.
    await dismissTarget(page).first().dispatchEvent('touchstart');
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

test.describe('Genome Research has one Workbench destination', () => {
  test.use({ viewport: PHONE, hasTouch: true });

  test.beforeEach(async ({ page }) => {
    await seedConsent(page);
  });

  test('a signed-out visitor reaches one coherent research destination', async ({
    page,
  }) => {
    // /codex remains in old links and the sitemap. It is now a compatibility
    // route into the Workbench, not a second Codex destination.
    await page.goto('/codex', { waitUntil: 'domcontentloaded' });

    await expect(page.getByTestId('codex-page')).toBeVisible({
      timeout: 60_000,
    });
    await expect(page.getByTestId('codex-rules')).toHaveCount(0);
    if (GENOME_V2_ENABLED && WORKBENCH_V1_ENABLED) {
      await expect(page.getByTestId('workbench-view')).toBeVisible();
      await expect(page.getByTestId('workbench-public-research')).toBeVisible();
      await expect(page.getByTestId('workbench-research-table')).toBeVisible();
      await expect(page.getByTestId('workbench-strains')).toBeVisible();
      await expect(page.getByTestId('workbench-gene-palette')).toBeVisible();
    } else if (!GENOME_V2_ENABLED && WORKBENCH_V1_ENABLED) {
      await expect(page.getByTestId('workbench-signed-out')).toBeVisible();
      await expect(
        page.getByText(
          'Sign in to plan your Powers against your collection and current conditions.',
        ),
      ).toBeVisible();
    } else {
      // Full rollback and Genome-without-Workbench both keep the compatibility
      // route and Research Record, but must not claim an active instrument.
      await expect(page.getByTestId('workbench-view')).toHaveCount(0);
      await expect(page.getByTestId('workbench-signed-out')).toHaveCount(0);
      await expect(
        page.getByText(
          'Power research instruments are not active in this version.',
        ),
      ).toBeVisible();
    }

    // Discovery history remains optional and subordinate. Opening it asks for
    // an account without hiding the v2 public research instrument above.
    const researchRecord = page.getByTestId('research-record');
    await researchRecord.locator('summary').click();
    const signedOutRecord = page.getByTestId('codex-signed-out');
    await expect(signedOutRecord).toBeVisible();
    if (GENOME_V2_ENABLED && WORKBENCH_V1_ENABLED) {
      await expect(signedOutRecord).toContainText(
        'The Workbench is open to everyone',
      );
    } else {
      await expect(signedOutRecord).toContainText(
        'Sign in to connect discoveries',
      );
      await expect(signedOutRecord).not.toContainText(
        'The Workbench is open to everyone',
      );
    }
  });

  test('a guest at zero banked runs gets the v2 research catalog', async ({
    page,
  }) => {
    test.skip(
      !(GENOME_V2_ENABLED && WORKBENCH_V1_ENABLED),
      'The public catalog belongs to Genome v2; rollback composition is covered by the signed-out route test.',
    );
    await signInAsGuest(page);
    await page.goto('/codex', { waitUntil: 'domcontentloaded' });

    await expect(page.getByTestId('workbench-view')).toBeVisible({
      timeout: 60_000,
    });
    await expect(page.getByTestId('workbench-research-table')).toBeVisible();
    await expect(page.getByTestId('workbench-gene-palette')).toBeVisible();
    // The old behaviour was a bare "Bank 15 runs to open the Genome Codex".
    await expect(page.getByText(/Bank 15 runs to open/i)).toHaveCount(0);
  });
});

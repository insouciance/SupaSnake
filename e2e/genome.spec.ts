import { test, expect } from '@playwright/test';
import { pickStarter, seedConsent, signInAsGuest } from './helpers';

test.describe('Genome capability UI', () => {
  test('reveals Build Seed and the strain HUD only from server-issued gates', async ({ page }) => {
    await seedConsent(page);
    await signInAsGuest(page);
    await pickStarter(page, 'CYBER');

    await page.route('**/api/player', async (route) => {
      if (route.request().method() !== 'GET') return route.continue();
      const response = await route.fetch();
      const payload = await response.json();
      await route.fulfill({
        response,
        json: {
          ...payload,
          genomeFtue: {
            bankedRuns: 20,
            strainTagsUnlocked: true,
            expressionsUnlocked: true,
            infuseUnlocked: true,
            spawnPointsUnlocked: true,
            splicesUnlocked: true,
            apexesUnlocked: true,
          },
        },
      });
    });

    await page.route('**/api/collection', async (route) => {
      if (route.request().method() !== 'GET') return route.continue();
      const response = await route.fetch();
      const payload = await response.json();
      await route.fulfill({
        response,
        json: {
          ...payload,
          snakes: (payload.snakes ?? []).map((snake: Record<string, unknown>) =>
            snake.isEquipped
              ? {
                  ...snake,
                  traits: ['scavenger'],
                  lineage: { strains: ['AURUM'], strength: 1 },
                }
              : snake
          ),
        },
      });
    });

    await page.route('**/api/game/session', async (route) => {
      const request = route.request();
      const body = request.postDataJSON() as { action?: string } | null;
      if (body?.action !== 'start') return route.continue();
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        json: {
          sessionId: 'playwright-genome-session',
          freePlay: true,
          energy: 5,
          energyRegenAt: null,
          traits: ['scavenger'],
          mutationPool: ['gold_trail', 'tithe', 'loan_shark', 'static_charge'],
          mastery: { dynasty: 'CYBER', xp: 0, level: 0 },
          genome: {
            runSeed: 'playwright-genome-seed',
            heirloom: { AURUM: 2 },
            genePool: ['gold_trail', 'tithe', 'loan_shark', 'static_charge'],
            lineage: {
              strains: ['AURUM'],
              guaranteeFirstOffer: false,
              guaranteeStrains: [],
            },
            anomalyStrain: null,
            suppressedStrains: [],
            prevRunDied: false,
            ftue: {
              bankedRuns: 20,
              strainTagsUnlocked: true,
              expressionsUnlocked: true,
              infuseUnlocked: true,
              spawnPointsUnlocked: true,
              splicesUnlocked: true,
              apexesUnlocked: true,
            },
          },
        },
      });
    });

    await page.reload();
    await expect(page.getByTestId('build-seed')).toBeVisible({ timeout: 20_000 });
    await expect(page.getByTestId('build-seed')).toContainText(/heirlooms/i);
    await expect(page.getByRole('link', { name: /open codex/i })).toBeVisible();

    await page.getByTestId('mode-free').click({ force: true });
    await page.getByTestId('free-play-start').click({ force: true });
    await expect(page.getByTestId('strain-meter')).toBeVisible({ timeout: 20_000 });
    await expect(page.getByTestId('strain-meter-AURUM')).toContainText('Aurum');
  });
});

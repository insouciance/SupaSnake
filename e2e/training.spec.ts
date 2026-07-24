import { test, expect, type Page } from '@playwright/test';
import { seedConsent, signInAsGuest } from './helpers';

interface Box {
  x: number;
  y: number;
  width: number;
  height: number;
}

function rectanglesOverlap(left: Box, right: Box): boolean {
  return left.x < right.x + right.width - 0.5 &&
    left.x + left.width > right.x + 0.5 &&
    left.y < right.y + right.height - 0.5 &&
    left.y + left.height > right.y + 0.5;
}

async function readTrainingLayout(page: Page) {
  return page.evaluate(() => {
    const board = document.querySelector<HTMLElement>('[data-testid="game-board-viewport"]');
    if (!board) return null;
    const toBox = (element: Element) => {
      const rect = element.getBoundingClientRect();
      return { x: rect.x, y: rect.y, width: rect.width, height: rect.height };
    };
    return {
      board: toBox(board),
      zones: Array.from(document.querySelectorAll<HTMLElement>('[data-cockpit-zone]'))
        .map(toBox)
        .filter((box) => box.width > 0 && box.height > 0),
      horizontalOverflow:
        document.documentElement.scrollWidth > document.documentElement.clientWidth,
    };
  });
}

async function releaseHeldBoard(page: Page): Promise<void> {
  const gate = page.getByTestId('resume-gate');
  for (const key of ['ArrowRight', 'ArrowUp', 'ArrowLeft', 'ArrowDown']) {
    if (!await gate.isVisible().catch(() => false)) return;
    await page.keyboard.press(key);
    await page.waitForTimeout(30);
  }
  await expect(gate).toBeHidden();
}

test.describe('Training Lab', () => {
  test('supports a rewardless deliberate-practice loop on the real board', async ({ page }) => {
    test.setTimeout(120_000);
    await seedConsent(page);
    await signInAsGuest(page);
    await page.goto('/training', { waitUntil: 'domcontentloaded' });

    await expect(page.getByRole('heading', { name: 'Training Lab' })).toBeVisible({
      timeout: 30_000,
    });
    await expect(page.getByText(/never spend Energy or grant DNA/i)).toBeVisible();
    for (const exercise of ['trace', 'route', 'tempo', 'escape']) {
      await expect(page.getByTestId(`training-card-${exercise}`)).toBeVisible();
    }
    await expect(page.getByTestId('start-circuit')).toBeVisible();
    await expect(page.getByTestId('path-composer')).toBeVisible();

    await page.getByTestId('start-trace').click();
    const cockpit = page.getByTestId('game-hud');
    const board = page.getByTestId('game-board-viewport');
    const gate = page.getByTestId('resume-gate');
    await expect(cockpit).toHaveAttribute('data-state', 'ready', { timeout: 30_000 });
    await expect(page.getByTestId('training-watermark')).toBeVisible();
    await expect(board).toBeVisible();
    await expect(gate).toContainText(/choose a direction/i);

    for (const viewport of [
      { width: 1280, height: 720 },
      { width: 375, height: 667 },
    ]) {
      await page.setViewportSize(viewport);
      const layout = await readTrainingLayout(page);
      expect(layout).not.toBeNull();
      expect(Math.abs(layout!.board.width - layout!.board.height)).toBeLessThanOrEqual(1);
      expect(layout!.board.width).toBeGreaterThanOrEqual(180);
      for (const zone of layout!.zones) {
        expect(rectanglesOverlap(layout!.board, zone)).toBe(false);
      }
      expect(layout!.horizontalOverflow).toBe(false);
    }

    await page.setViewportSize({ width: 1280, height: 720 });
    await releaseHeldBoard(page);
    await expect(page.getByRole('button', { name: 'Pause training' })).toBeVisible();
    await page.getByRole('button', { name: 'Pause training' }).click();
    await expect(page.getByTestId('tactical-hold')).toContainText(/move to resume/i);
    await page.getByRole('button', { name: 'Abandon run' }).click();

    const recap = page.getByTestId('training-recap');
    await expect(recap).toBeVisible();
    await expect(recap.getByRole('heading', { name: /attempt ended/i })).toBeVisible();
    await expect(recap.getByRole('region', { name: 'Attempt metrics' })).toBeVisible();
    await expect(recap.getByText(/next adjustment/i)).toBeVisible();
    await expect(page.getByTestId('training-verification')).toContainText(
      /verified locally|verified ·/i,
      { timeout: 30_000 }
    );

    await page.getByTestId('retry-training').click();
    await expect(page.getByTestId('training-watermark')).toBeVisible();
    await expect(page.getByTestId('resume-gate')).toContainText(/choose a direction/i);

    // A schema-offline refresh must retain this player's server-verified PB
    // for the rest of the session instead of erasing the practice evidence.
    await page.getByRole('button', { name: 'Abandon run' }).click();
    await expect(page.getByTestId('training-verification')).toContainText(
      /verified locally|verified ·/i,
      { timeout: 30_000 }
    );
    await page.getByRole('button', { name: 'Training Lab' }).click();
    await expect(page.getByTestId('training-card-trace')).not.toContainText('No PB');
  });
});

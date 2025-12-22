/**
 * Game E2E Tests
 * Tests gameplay flows, snake controls, and game mechanics
 */

import { test, expect } from '@playwright/test';

test.describe('Game Page', () => {
  test('should display game title on home page', async ({ page }) => {
    await page.goto('/');

    const title = page.getByRole('heading', { name: /og snake|supasnake|snake/i });
    await expect(title).toBeVisible();
  });

  test('should display play button', async ({ page }) => {
    await page.goto('/');

    const playButton = page.getByRole('link', { name: /play|start|begin/i });
    await expect(playButton).toBeVisible();
  });

  test('should navigate to game page when clicking play', async ({ page }) => {
    await page.goto('/');

    const playButton = page.getByRole('link', { name: /play|start|begin/i });
    await playButton.click();

    // Should either go to game or auth
    const url = page.url();
    expect(url).toMatch(/\/(game|login|auth)/);
  });
});

test.describe('Game Canvas', () => {
  test.skip('should display game canvas element', async ({ page }) => {
    // This test requires authentication
    await page.goto('/game');

    const canvas = page.locator('canvas');
    await expect(canvas).toBeVisible({ timeout: 10000 });
  });

  test.skip('should display score counter', async ({ page }) => {
    await page.goto('/game');

    const score = page.getByText(/score|points/i);
    await expect(score).toBeVisible({ timeout: 10000 });
  });

  test.skip('should display energy meter', async ({ page }) => {
    await page.goto('/game');

    const energy = page.getByText(/energy/i);
    await expect(energy).toBeVisible({ timeout: 10000 });
  });
});

test.describe('Game Controls', () => {
  test.skip('should respond to keyboard arrow keys', async ({ page }) => {
    await page.goto('/game');

    // Wait for game to load
    await page.waitForSelector('canvas', { timeout: 10000 });

    // Press arrow keys
    await page.keyboard.press('ArrowUp');
    await page.keyboard.press('ArrowRight');
    await page.keyboard.press('ArrowDown');
    await page.keyboard.press('ArrowLeft');

    // Game should still be running (no error state)
    const errorState = page.getByText(/error|crash/i);
    await expect(errorState).not.toBeVisible({ timeout: 1000 });
  });

  test.skip('should respond to WASD keys', async ({ page }) => {
    await page.goto('/game');

    await page.waitForSelector('canvas', { timeout: 10000 });

    // Press WASD keys
    await page.keyboard.press('w');
    await page.keyboard.press('d');
    await page.keyboard.press('s');
    await page.keyboard.press('a');

    const errorState = page.getByText(/error|crash/i);
    await expect(errorState).not.toBeVisible({ timeout: 1000 });
  });

  test.skip('should pause game on Escape', async ({ page }) => {
    await page.goto('/game');

    await page.waitForSelector('canvas', { timeout: 10000 });

    await page.keyboard.press('Escape');

    const pauseMenu = page.getByText(/paused|resume|continue/i);
    await expect(pauseMenu).toBeVisible({ timeout: 5000 });
  });
});

test.describe('Game Over', () => {
  test.skip('should display game over screen on death', async ({ page }) => {
    await page.goto('/game');

    await page.waitForSelector('canvas', { timeout: 10000 });

    // Simulate death by running into wall (move up repeatedly)
    for (let i = 0; i < 50; i++) {
      await page.keyboard.press('ArrowUp');
      await page.waitForTimeout(50);
    }

    const gameOver = page.getByText(/game over|try again|play again/i);
    await expect(gameOver).toBeVisible({ timeout: 10000 });
  });

  test.skip('should display final score on game over', async ({ page }) => {
    await page.goto('/game');

    await page.waitForSelector('canvas', { timeout: 10000 });

    // Wait for game over
    const gameOver = page.getByText(/game over/i);
    await expect(gameOver).toBeVisible({ timeout: 30000 });

    // Score should be displayed
    const score = page.getByText(/score|points/i);
    await expect(score).toBeVisible();
  });

  test.skip('should allow restart after game over', async ({ page }) => {
    await page.goto('/game');

    // Wait for game over
    const gameOver = page.getByText(/game over/i);
    await expect(gameOver).toBeVisible({ timeout: 30000 });

    // Click restart
    const restartButton = page.getByRole('button', { name: /play again|restart|retry/i });
    await restartButton.click();

    // Game should restart
    const canvas = page.locator('canvas');
    await expect(canvas).toBeVisible();
  });
});

test.describe('Snake Variants', () => {
  test.skip('should display variant selection', async ({ page }) => {
    await page.goto('/game');

    const variantSelector = page.getByText(/select.*snake|choose.*variant/i);
    await expect(variantSelector).toBeVisible({ timeout: 10000 });
  });

  test.skip('should show variant stats', async ({ page }) => {
    await page.goto('/lab');

    const stats = page.getByText(/speed|agility|hunger|stamina/i);
    await expect(stats).toBeVisible({ timeout: 10000 });
  });
});

test.describe('Responsive Design', () => {
  test('should be playable on mobile viewport', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 667 });
    await page.goto('/');

    const playButton = page.getByRole('link', { name: /play|start/i });
    await expect(playButton).toBeVisible();
  });

  test('should adapt layout for tablet', async ({ page }) => {
    await page.setViewportSize({ width: 768, height: 1024 });
    await page.goto('/');

    // Page should render without horizontal scroll
    const scrollWidth = await page.evaluate(() => document.body.scrollWidth);
    const clientWidth = await page.evaluate(() => document.body.clientWidth);

    expect(scrollWidth).toBeLessThanOrEqual(clientWidth);
  });
});

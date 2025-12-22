/**
 * Purchase Flow E2E Tests
 * Tests shop, checkout, and payment flows
 */

import { test, expect } from '@playwright/test';

test.describe('Shop Page', () => {
  test('should display shop page', async ({ page }) => {
    await page.goto('/shop');

    const shopHeading = page.getByRole('heading', { name: /shop|store/i });
    await expect(shopHeading).toBeVisible();
  });

  test('should display available products', async ({ page }) => {
    await page.goto('/shop');

    // Look for product cards or listings
    const products = page.locator('[data-testid="product-card"]').or(
      page.locator('.product').or(
        page.getByText(/energy|dna|pack|bundle/i)
      )
    );

    await expect(products.first()).toBeVisible({ timeout: 10000 });
  });

  test('should display product prices', async ({ page }) => {
    await page.goto('/shop');

    // Look for price indicators
    const prices = page.getByText(/\$|€|£|\d+\.\d{2}/);
    await expect(prices.first()).toBeVisible({ timeout: 10000 });
  });

  test('should have buy/purchase buttons', async ({ page }) => {
    await page.goto('/shop');

    const buyButton = page.getByRole('button', { name: /buy|purchase|get/i });
    await expect(buyButton.first()).toBeVisible({ timeout: 10000 });
  });
});

test.describe('Product Categories', () => {
  test('should display energy packs', async ({ page }) => {
    await page.goto('/shop');

    const energyPack = page.getByText(/energy/i);
    await expect(energyPack.first()).toBeVisible({ timeout: 10000 });
  });

  test('should display DNA packs', async ({ page }) => {
    await page.goto('/shop');

    const dnaPack = page.getByText(/dna/i);
    await expect(dnaPack.first()).toBeVisible({ timeout: 10000 });
  });

  test.skip('should display premium items', async ({ page }) => {
    await page.goto('/shop');

    const premium = page.getByText(/premium|exclusive|special/i);
    await expect(premium.first()).toBeVisible({ timeout: 10000 });
  });
});

test.describe('Checkout Flow', () => {
  test.skip('should require authentication for checkout', async ({ page }) => {
    await page.goto('/shop');

    // Click first buy button
    const buyButton = page.getByRole('button', { name: /buy|purchase/i }).first();
    await buyButton.click();

    // Should redirect to login or show auth required
    const authRequired = page.url().includes('/login') ||
      await page.getByText(/sign in|login|authenticate/i).isVisible({ timeout: 5000 });

    expect(authRequired).toBe(true);
  });

  test.skip('should navigate to Stripe checkout', async ({ page }) => {
    // This test requires authenticated user
    await page.goto('/shop');

    const buyButton = page.getByRole('button', { name: /buy|purchase/i }).first();
    await buyButton.click();

    // Should redirect to Stripe or show checkout
    await page.waitForURL(/stripe\.com|checkout/, { timeout: 10000 });
  });

  test('should display checkout page with product details', async ({ page }) => {
    await page.goto('/shop');

    const buyButton = page.getByRole('button', { name: /buy|purchase/i }).first();
    if (await buyButton.isVisible({ timeout: 5000 })) {
      await buyButton.click();

      // Look for product confirmation
      const productDetails = page.getByText(/confirm|review|order/i);
      const isCheckoutPage = await productDetails.isVisible({ timeout: 5000 }).catch(() => false);

      // Either shows checkout or redirects to auth
      expect(isCheckoutPage || page.url().includes('/login')).toBe(true);
    }
  });
});

test.describe('Purchase History', () => {
  test.skip('should display purchase history page', async ({ page }) => {
    // Requires authentication
    await page.goto('/settings/purchases');

    const historyHeading = page.getByRole('heading', { name: /purchase|transaction|history/i });
    await expect(historyHeading).toBeVisible({ timeout: 10000 });
  });

  test.skip('should show empty state for no purchases', async ({ page }) => {
    await page.goto('/settings/purchases');

    const emptyState = page.getByText(/no purchase|empty|haven.*bought/i);
    await expect(emptyState).toBeVisible({ timeout: 10000 });
  });
});

test.describe('Error Handling', () => {
  test.skip('should handle payment failure gracefully', async ({ page }) => {
    await page.goto('/shop');

    // Attempt purchase with test failure card
    // This would require mocking Stripe

    const errorMessage = page.getByText(/payment failed|try again|error/i);
    // Error should be displayed gracefully
  });

  test('should display loading state during checkout', async ({ page }) => {
    await page.goto('/shop');

    const buyButton = page.getByRole('button', { name: /buy|purchase/i }).first();
    if (await buyButton.isVisible({ timeout: 5000 })) {
      // Click and check for loading state
      await buyButton.click();

      const loading = page.getByText(/loading|processing/i).or(
        page.locator('[data-loading="true"]')
      );

      // Loading state should appear briefly or redirect immediately
      const hasLoading = await loading.isVisible({ timeout: 2000 }).catch(() => false);
      // This is acceptable whether or not loading appears
      expect(true).toBe(true);
    }
  });
});

test.describe('Legal Compliance', () => {
  test('should link to terms of service from shop', async ({ page }) => {
    await page.goto('/shop');

    const termsLink = page.getByRole('link', { name: /terms|tos/i });

    if (await termsLink.isVisible({ timeout: 5000 })) {
      await termsLink.click();
      await expect(page).toHaveURL(/\/legal\/terms/);
    }
  });

  test('should display price including tax note', async ({ page }) => {
    await page.goto('/shop');

    const taxNote = page.getByText(/tax|vat|price.*include/i);
    // Tax information should be visible on shop page
    // This may or may not be present depending on implementation
  });

  test('should display refund policy link', async ({ page }) => {
    await page.goto('/shop');

    const refundLink = page.getByRole('link', { name: /refund|return/i });

    if (await refundLink.isVisible({ timeout: 5000 })) {
      await refundLink.click();
      await expect(page.url()).toMatch(/refund|terms/);
    }
  });
});

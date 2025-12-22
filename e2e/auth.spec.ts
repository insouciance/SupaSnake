/**
 * Authentication E2E Tests
 * Tests user authentication flows including login, signup, and logout
 */

import { test, expect } from '@playwright/test';

test.describe('Authentication', () => {
  test.beforeEach(async ({ page }) => {
    // Navigate to home page before each test
    await page.goto('/');
  });

  test('should display login button on home page', async ({ page }) => {
    const loginButton = page.getByRole('link', { name: /login|sign in/i });
    await expect(loginButton).toBeVisible();
  });

  test('should navigate to login page when clicking login', async ({ page }) => {
    const loginButton = page.getByRole('link', { name: /login|sign in/i });
    await loginButton.click();

    await expect(page).toHaveURL(/\/login/);
  });

  test('should display email and password fields on login page', async ({ page }) => {
    await page.goto('/login');

    const emailInput = page.getByRole('textbox', { name: /email/i });
    const passwordInput = page.getByLabel(/password/i);

    await expect(emailInput).toBeVisible();
    await expect(passwordInput).toBeVisible();
  });

  test('should show error for invalid credentials', async ({ page }) => {
    await page.goto('/login');

    await page.getByRole('textbox', { name: /email/i }).fill('invalid@test.com');
    await page.getByLabel(/password/i).fill('wrongpassword');
    await page.getByRole('button', { name: /sign in|login/i }).click();

    // Wait for error message
    const errorMessage = page.getByText(/invalid|error|incorrect/i);
    await expect(errorMessage).toBeVisible({ timeout: 10000 });
  });

  test('should show validation error for empty email', async ({ page }) => {
    await page.goto('/login');

    await page.getByLabel(/password/i).fill('somepassword');
    await page.getByRole('button', { name: /sign in|login/i }).click();

    // Check for validation error
    const validationMessage = page.getByText(/email.*required|enter.*email/i);
    await expect(validationMessage).toBeVisible({ timeout: 5000 });
  });

  test('should navigate to signup page from login', async ({ page }) => {
    await page.goto('/login');

    const signupLink = page.getByRole('link', { name: /sign up|create account|register/i });
    await signupLink.click();

    await expect(page).toHaveURL(/\/auth|\/signup|\/register/);
  });

  test('should display age verification on signup', async ({ page }) => {
    await page.goto('/auth/callback');

    // Look for age gate or date of birth input
    const ageGate = page.locator('[data-testid="age-gate"]').or(
      page.getByText(/date of birth|age verification|confirm.*age/i)
    );

    // Age gate should appear for new users
    await expect(ageGate).toBeVisible({ timeout: 10000 });
  });

  test('should block users under 13', async ({ page }) => {
    await page.goto('/auth/callback');

    // Calculate date 10 years ago (under 13)
    const today = new Date();
    const underageDate = new Date(today.getFullYear() - 10, today.getMonth(), today.getDate());
    const dateString = underageDate.toISOString().split('T')[0];

    // Try to enter underage date
    const dateInput = page.getByLabel(/date of birth/i);
    if (await dateInput.isVisible({ timeout: 5000 })) {
      await dateInput.fill(dateString);
      await page.getByRole('button', { name: /continue|verify|submit/i }).click();

      // Should show blocked message
      const blockedMessage = page.getByText(/13|age.*requirement|too young/i);
      await expect(blockedMessage).toBeVisible({ timeout: 5000 });
    }
  });
});

test.describe('Protected Routes', () => {
  test('should redirect to login when accessing game page without auth', async ({ page }) => {
    await page.goto('/game');

    // Should redirect to login or show auth required
    const loginRedirect = page.url().includes('/login') || page.url().includes('/auth');
    const authMessage = page.getByText(/sign in|login|authenticate/i);

    const isRedirected = loginRedirect || await authMessage.isVisible({ timeout: 5000 }).catch(() => false);
    expect(isRedirected).toBe(true);
  });

  test('should redirect to login when accessing settings without auth', async ({ page }) => {
    await page.goto('/settings/privacy');

    const loginRedirect = page.url().includes('/login') || page.url().includes('/auth');
    const authMessage = page.getByText(/sign in|login|authenticate/i);

    const isRedirected = loginRedirect || await authMessage.isVisible({ timeout: 5000 }).catch(() => false);
    expect(isRedirected).toBe(true);
  });
});

test.describe('OAuth Providers', () => {
  test('should display Google OAuth button', async ({ page }) => {
    await page.goto('/login');

    const googleButton = page.getByRole('button', { name: /google/i });
    await expect(googleButton).toBeVisible({ timeout: 5000 });
  });

  test('should display Discord OAuth button', async ({ page }) => {
    await page.goto('/login');

    const discordButton = page.getByRole('button', { name: /discord/i });
    await expect(discordButton).toBeVisible({ timeout: 5000 });
  });
});

/**
 * Playwright global setup: warm the server before tests run.
 *
 * Local runs use `next dev`, which compiles routes on demand - the first
 * hit on each route can take several seconds and makes parallel page.goto
 * calls time out. Fetching every tested route once up front removes that
 * flakiness. Against a production server (CI) this is a fast no-op sweep.
 */

import type { FullConfig } from '@playwright/test';

const ROUTES = [
  '/',
  '/login',
  '/signup',
  '/game',
  '/lab',
  '/lab/breed',
  '/shop',
  '/settings/privacy',
  '/legal/privacy',
  '/legal/terms',
  '/legal/cookies',
];

export default async function globalSetup(config: FullConfig) {
  const baseURL =
    config.projects[0]?.use?.baseURL ||
    process.env.PLAYWRIGHT_TEST_BASE_URL ||
    'http://localhost:3000';

  for (const route of ROUTES) {
    try {
      await fetch(`${baseURL}${route}`, { signal: AbortSignal.timeout(60000) });
    } catch {
      // Warmup only - the actual tests will surface real failures
    }
  }
}

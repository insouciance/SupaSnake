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
  '/training',
  '/lab',
  '/lab/breed',
  '/shop',
  '/settings/privacy',
  '/legal/privacy',
  '/legal/terms',
  '/legal/cookies',
  // WP-1.08 artifact surfaces. The image routes compile separately from
  // their pages, so both are warmed.
  '/s/214',
  '/s/214/opengraph-image',
  '/r/D0badf00d',
  '/r/D0badf00d/opengraph-image',
  '/w/2026-07-20',
  '/w/2026-07-20/opengraph-image',
  '/c/FANG',
  '/c/FANG/opengraph-image',
  '/x/Vyper~CYBER~4~slipstream',
  '/x/Vyper~CYBER~4~slipstream/opengraph-image',
  '/p/Sans_Souci/opengraph-image',
  '/og/challenge?kind=signal&day=214&t=1240',
];

export default async function globalSetup(config: FullConfig) {
  // Focused local debugging often reuses an already-warm dev server. Allow
  // those runs to skip compiling every unrelated route; CI never sets this.
  if (process.env.PLAYWRIGHT_SKIP_WARMUP === '1') return;

  const baseURL =
    config.projects[0]?.use?.baseURL ||
    process.env.PLAYWRIGHT_TEST_BASE_URL ||
    'http://localhost:3000';
  const protectionBypass = process.env.VERCEL_AUTOMATION_BYPASS_SECRET;
  const headers = protectionBypass
    ? {
        'x-vercel-protection-bypass': protectionBypass,
        'x-vercel-set-bypass-cookie': 'true',
      }
    : undefined;

  for (const route of ROUTES) {
    try {
      await fetch(`${baseURL}${route}`, {
        headers,
        signal: AbortSignal.timeout(60000),
      });
    } catch {
      // Warmup only - the actual tests will surface real failures
    }
  }
}

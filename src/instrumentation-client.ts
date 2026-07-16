/**
 * Sentry browser configuration (Next.js 15.3+ / @sentry/nextjs v10 pattern:
 * client init lives in instrumentation-client.ts, not sentry.client.config.ts).
 *
 * Session Replay is intentionally NOT enabled: it adds significant bundle
 * weight and would require consent gating. Error capture alone is
 * legitimate interest and needs no consent.
 */

import * as Sentry from '@sentry/nextjs';

const environment =
  process.env.NEXT_PUBLIC_VERCEL_ENV ||
  process.env.NODE_ENV ||
  'development';

Sentry.init({
  dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,

  environment,

  // Keep tracing lean in production; full visibility in development.
  tracesSampleRate: environment === 'production' ? 0.1 : 1.0,

  // Error capture is legitimate interest - no PII beyond defaults.
  sendDefaultPii: false,
});

// Instruments App Router navigations for tracing (required export in v10).
export const onRouterTransitionStart = Sentry.captureRouterTransitionStart;

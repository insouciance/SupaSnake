/**
 * Sentry edge runtime configuration (middleware, edge routes).
 * Loaded via src/instrumentation.ts register() when NEXT_RUNTIME === 'edge'.
 */

import * as Sentry from '@sentry/nextjs';

const environment =
  process.env.VERCEL_ENV || process.env.NODE_ENV || 'development';

Sentry.init({
  dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,

  environment,

  tracesSampleRate: environment === 'production' ? 0.1 : 1.0,

  sendDefaultPii: false,
});

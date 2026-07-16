/**
 * Sentry server-side (Node.js runtime) configuration.
 * Loaded via src/instrumentation.ts register() when NEXT_RUNTIME === 'nodejs'.
 */

import * as Sentry from '@sentry/nextjs';

const environment =
  process.env.VERCEL_ENV || process.env.NODE_ENV || 'development';

Sentry.init({
  dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,

  environment,

  // Keep tracing lean in production; full visibility in development.
  tracesSampleRate: environment === 'production' ? 0.1 : 1.0,

  // Error capture is legitimate interest - no PII beyond defaults.
  sendDefaultPii: false,
});

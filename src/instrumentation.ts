/**
 * Next.js instrumentation hook (App Router).
 * Loads the runtime-specific Sentry config on server startup and forwards
 * request errors (server components, route handlers) to Sentry.
 */

import * as Sentry from '@sentry/nextjs';

export async function register() {
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    await import('../sentry.server.config');
  }

  if (process.env.NEXT_RUNTIME === 'edge') {
    await import('../sentry.edge.config');
  }
}

export const onRequestError = Sentry.captureRequestError;

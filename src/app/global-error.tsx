'use client';

/**
 * Global error boundary (App Router).
 * Catches render errors in the root layout and reports them to Sentry.
 * Must render its own <html>/<body> because it replaces the root layout.
 */

import * as Sentry from '@sentry/nextjs';
import { useEffect } from 'react';

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    Sentry.captureException(error);
  }, [error]);

  return (
    <html lang="en">
      <body
        style={{
          margin: 0,
          minHeight: '100vh',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          background: '#0a0a0f',
          color: '#e5e7eb',
          fontFamily:
            'system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
        }}
      >
        <div style={{ textAlign: 'center', padding: '2rem' }}>
          <h1 style={{ fontSize: '1.5rem', marginBottom: '0.75rem' }}>
            Something went wrong
          </h1>
          <p style={{ color: '#9ca3af', marginBottom: '1.5rem' }}>
            An unexpected error occurred. It has been reported and we are on
            it.
          </p>
          <button
            onClick={() => reset()}
            style={{
              padding: '0.6rem 1.4rem',
              borderRadius: '0.5rem',
              border: 'none',
              background: '#00ffff',
              color: '#0a0a0f',
              fontWeight: 600,
              cursor: 'pointer',
            }}
          >
            Try again
          </button>
        </div>
      </body>
    </html>
  );
}

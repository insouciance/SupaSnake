/**
 * Sentry Error Tracking
 * Centralized error capture and performance monitoring for OG Snake
 *
 * @see https://docs.sentry.io/platforms/javascript/guides/nextjs/
 */

import * as Sentry from '@sentry/nextjs';

export interface SentryConfig {
  dsn: string;
  environment: string;
  release?: string;
  debug?: boolean;
}

export interface UserContext {
  id: string;
  email?: string;
  username?: string;
}

export interface BreadcrumbOptions {
  category: string;
  message: string;
  level: 'debug' | 'info' | 'warning' | 'error' | 'fatal';
  data?: Record<string, unknown>;
}

type SeverityLevel = 'debug' | 'info' | 'warning' | 'error' | 'fatal';

/**
 * Initialize Sentry SDK with configuration
 * Should be called once at application startup
 */
export function initSentry(config: SentryConfig): void {
  if (!config.dsn) {
    console.warn('[Sentry] DSN not provided, error tracking disabled');
    return;
  }

  const tracesSampleRate = config.environment === 'production' ? 0.1 : 1.0;

  Sentry.init({
    dsn: config.dsn,
    environment: config.environment,
    release: config.release,
    debug: config.debug ?? false,
    tracesSampleRate,

    // Performance monitoring settings
    profilesSampleRate: config.environment === 'production' ? 0.1 : 1.0,

    // Integrations for enhanced error tracking
    integrations: [
      Sentry.replayIntegration({
        maskAllText: true,
        blockAllMedia: true,
      }),
    ],

    // Session replay sample rates
    replaysSessionSampleRate: config.environment === 'production' ? 0.1 : 1.0,
    replaysOnErrorSampleRate: 1.0,

    // Filter out noisy errors
    ignoreErrors: [
      // Browser extensions
      'ResizeObserver loop limit exceeded',
      'ResizeObserver loop completed with undelivered notifications',
      // Network errors (user connectivity issues)
      'NetworkError',
      'Failed to fetch',
      'Load failed',
      // Third-party scripts
      'Script error',
      // User aborted requests
      'AbortError',
    ],

    // Sanitize sensitive data before sending
    beforeSend(event) {
      // Remove any PII from error messages
      if (event.exception?.values) {
        event.exception.values.forEach((value) => {
          if (value.value) {
            // Remove potential email addresses
            value.value = value.value.replace(
              /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g,
              '[REDACTED_EMAIL]'
            );
            // Remove potential API keys
            value.value = value.value.replace(
              /[a-zA-Z0-9_-]{20,}/g,
              '[REDACTED_KEY]'
            );
          }
        });
      }
      return event;
    },
  });
}

/**
 * Capture an error with optional context
 */
export function captureError(
  error: Error | string,
  context?: Record<string, unknown>
): string {
  const errorObj = typeof error === 'string' ? new Error(error) : error;

  return Sentry.captureException(errorObj, {
    extra: context,
  });
}

/**
 * Capture a message at specified severity level
 */
export function captureMessage(
  message: string,
  level: SeverityLevel = 'info'
): string {
  return Sentry.captureMessage(message, level);
}

/**
 * Set user context for error tracking
 * Call this when user logs in
 */
export function setUserContext(user: UserContext): void {
  Sentry.setUser({
    id: user.id,
    email: user.email,
    username: user.username,
  });
}

/**
 * Clear user context
 * Call this when user logs out
 */
export function clearUserContext(): void {
  Sentry.setUser(null);
}

/**
 * Add a breadcrumb for debugging
 * Breadcrumbs are attached to errors for context
 */
export function addBreadcrumb(options: BreadcrumbOptions): void {
  Sentry.addBreadcrumb({
    category: options.category,
    message: options.message,
    level: options.level,
    data: options.data,
    timestamp: Date.now() / 1000,
  });
}

/**
 * Start a performance transaction
 * Use for monitoring custom operations
 */
export function startTransaction(
  name: string,
  op: string
): Sentry.Transaction {
  return Sentry.startTransaction({
    name,
    op,
  });
}

/**
 * Create a scoped span for measuring operation duration
 */
export async function withSpan<T>(
  name: string,
  op: string,
  callback: () => Promise<T>
): Promise<T> {
  const transaction = startTransaction(name, op);

  try {
    const result = await callback();
    transaction.setStatus('ok');
    return result;
  } catch (error) {
    transaction.setStatus('internal_error');
    throw error;
  } finally {
    transaction.finish();
  }
}

/**
 * Error boundary component wrapper
 * Use this to wrap components that may throw
 */
export function createErrorBoundaryConfig(componentName: string) {
  return {
    fallback: null,
    onError: (error: Error, componentStack: string) => {
      captureError(error, {
        componentName,
        componentStack,
      });
    },
    beforeCapture: (scope: Sentry.Scope) => {
      scope.setTag('component', componentName);
    },
  };
}

/**
 * Game-specific error capture with game context
 */
export function captureGameError(
  error: Error,
  gameContext: {
    sessionId?: string;
    variantId?: string;
    score?: number;
    gameTime?: number;
  }
): void {
  Sentry.withScope((scope) => {
    scope.setTag('error_type', 'game_error');
    scope.setContext('game', gameContext);
    Sentry.captureException(error);
  });
}

/**
 * API error capture with request context
 */
export function captureApiError(
  error: Error,
  requestContext: {
    endpoint: string;
    method: string;
    statusCode?: number;
    userId?: string;
  }
): void {
  Sentry.withScope((scope) => {
    scope.setTag('error_type', 'api_error');
    scope.setTag('endpoint', requestContext.endpoint);
    scope.setTag('http_method', requestContext.method);
    if (requestContext.statusCode) {
      scope.setTag('status_code', String(requestContext.statusCode));
    }
    scope.setContext('request', requestContext);
    Sentry.captureException(error);
  });
}

/**
 * Payment error capture with transaction context
 */
export function capturePaymentError(
  error: Error,
  paymentContext: {
    transactionId?: string;
    productId?: string;
    amount?: number;
    currency?: string;
    userId?: string;
  }
): void {
  Sentry.withScope((scope) => {
    scope.setTag('error_type', 'payment_error');
    scope.setLevel('error');
    scope.setContext('payment', {
      ...paymentContext,
      // Never log full transaction IDs
      transactionId: paymentContext.transactionId?.slice(0, 8) + '...',
    });
    Sentry.captureException(error);
  });
}

// Export Sentry for direct access when needed
export { Sentry };

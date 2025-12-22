/**
 * Structured Logging
 * Production-ready logging with correlation IDs and JSON formatting
 *
 * Features:
 * - Structured JSON output for log aggregation
 * - Correlation IDs for request tracing
 * - Log levels (debug, info, warn, error)
 * - Namespaced loggers for different modules
 */

export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

export interface LogData {
  [key: string]: unknown;
}

export interface LogEntry {
  timestamp: string;
  level: LogLevel;
  namespace: string;
  message: string;
  correlationId?: string;
  data?: LogData;
}

export interface Logger {
  debug: (message: string, data?: LogData) => void;
  info: (message: string, data?: LogData) => void;
  warn: (message: string, data?: LogData) => void;
  error: (message: string, data?: LogData) => void;
}

// Global correlation ID storage (per-request context)
let globalCorrelationId: string | null = null;

/**
 * Set the global correlation ID for the current request context
 */
export function setGlobalCorrelationId(id: string): void {
  globalCorrelationId = id;
}

/**
 * Clear the global correlation ID
 */
export function clearGlobalCorrelationId(): void {
  globalCorrelationId = null;
}

/**
 * Get the current correlation ID
 */
export function getGlobalCorrelationId(): string | null {
  return globalCorrelationId;
}

/**
 * Execute a callback with a specific correlation ID context
 * Automatically cleans up the correlation ID after completion
 */
export async function withCorrelationId<T>(
  id: string,
  callback: () => Promise<T>
): Promise<T> {
  const previousId = globalCorrelationId;
  setGlobalCorrelationId(id);

  try {
    return await callback();
  } finally {
    if (previousId) {
      setGlobalCorrelationId(previousId);
    } else {
      clearGlobalCorrelationId();
    }
  }
}

/**
 * Generate a unique correlation ID for request tracing
 */
export function generateCorrelationId(): string {
  const timestamp = Date.now().toString(36);
  const random = Math.random().toString(36).substring(2, 8);
  return `${timestamp}-${random}`;
}

/**
 * Create a namespaced logger
 */
export function createLogger(namespace: string): Logger {
  // Internal log emitter (tested via public API)
  function emitLog(level: LogLevel, message: string, data?: LogData): void {
    const entry: LogEntry = {
      timestamp: new Date().toISOString(),
      level,
      namespace,
      message,
      correlationId: globalCorrelationId || undefined,
      data,
    };

    const output: Record<string, unknown> = {
      timestamp: entry.timestamp,
      level: entry.level.toUpperCase(),
      namespace: entry.namespace,
      message: entry.message,
    };

    if (entry.correlationId) {
      output.correlationId = entry.correlationId;
    }

    if (entry.data && Object.keys(entry.data).length > 0) {
      const processedData: Record<string, unknown> = {};
      for (const [key, value] of Object.entries(entry.data)) {
        if (value instanceof Error) {
          processedData[key] = {
            name: value.name,
            message: value.message,
            stack: value.stack,
          };
        } else {
          processedData[key] = value;
        }
      }
      output.data = processedData;
    }

    const formattedLog = JSON.stringify(output);

    switch (level) {
      case 'debug':
        console.debug(formattedLog);
        break;
      case 'info':
        console.info(formattedLog);
        break;
      case 'warn':
        console.warn(formattedLog);
        break;
      case 'error':
        console.error(formattedLog);
        break;
    }
  }

  return {
    debug: (message: string, data?: LogData) => emitLog('debug', message, data),
    info: (message: string, data?: LogData) => emitLog('info', message, data),
    warn: (message: string, data?: LogData) => emitLog('warn', message, data),
    error: (message: string, data?: LogData) => emitLog('error', message, data),
  };
}

/**
 * Global default logger for convenience
 */
export const log = createLogger('app');

// Pre-configured loggers for common namespaces
export const loggers = {
  game: createLogger('game'),
  api: createLogger('api'),
  auth: createLogger('auth'),
  payment: createLogger('payment'),
  analytics: createLogger('analytics'),
};

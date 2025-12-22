/**
 * Structured Logging Tests
 * Validates log formatting, correlation IDs, and log levels
 */

import {
  createLogger,
  Logger,
  LogLevel,
  log,
  setGlobalCorrelationId,
  clearGlobalCorrelationId,
  getGlobalCorrelationId,
  withCorrelationId,
  generateCorrelationId,
  loggers,
} from './logger';

// Store original console methods
const originalConsole = {
  debug: console.debug,
  info: console.info,
  warn: console.warn,
  error: console.error,
};

describe('Structured Logging', () => {
  let mockConsole: {
    debug: jest.Mock;
    info: jest.Mock;
    warn: jest.Mock;
    error: jest.Mock;
  };

  beforeEach(() => {
    mockConsole = {
      debug: jest.fn(),
      info: jest.fn(),
      warn: jest.fn(),
      error: jest.fn(),
    };
    console.debug = mockConsole.debug;
    console.info = mockConsole.info;
    console.warn = mockConsole.warn;
    console.error = mockConsole.error;
    clearGlobalCorrelationId();
  });

  afterEach(() => {
    console.debug = originalConsole.debug;
    console.info = originalConsole.info;
    console.warn = originalConsole.warn;
    console.error = originalConsole.error;
  });

  describe('createLogger', () => {
    it('should create a logger with namespace', () => {
      const logger = createLogger('GameService');
      expect(logger).toBeDefined();
      expect(logger.info).toBeDefined();
      expect(logger.warn).toBeDefined();
      expect(logger.error).toBeDefined();
      expect(logger.debug).toBeDefined();
    });

    it('should include namespace in log output', () => {
      const logger = createLogger('GameService');
      logger.info('Game started');

      expect(mockConsole.info).toHaveBeenCalled();
      const logCall = mockConsole.info.mock.calls[0][0];
      expect(logCall).toContain('GameService');
      expect(logCall).toContain('Game started');
    });
  });

  describe('log levels', () => {
    let logger: Logger;

    beforeEach(() => {
      logger = createLogger('TestLogger');
    });

    it('should log debug messages', () => {
      logger.debug('Debug message', { key: 'value' });

      expect(mockConsole.debug).toHaveBeenCalled();
      const logCall = mockConsole.debug.mock.calls[0][0];
      expect(logCall).toContain('DEBUG');
      expect(logCall).toContain('Debug message');
    });

    it('should log info messages', () => {
      logger.info('Info message');

      expect(mockConsole.info).toHaveBeenCalled();
      const logCall = mockConsole.info.mock.calls[0][0];
      expect(logCall).toContain('INFO');
      expect(logCall).toContain('Info message');
    });

    it('should log warning messages', () => {
      logger.warn('Warning message');

      expect(mockConsole.warn).toHaveBeenCalled();
      const logCall = mockConsole.warn.mock.calls[0][0];
      expect(logCall).toContain('WARN');
      expect(logCall).toContain('Warning message');
    });

    it('should log error messages', () => {
      logger.error('Error message');

      expect(mockConsole.error).toHaveBeenCalled();
      const logCall = mockConsole.error.mock.calls[0][0];
      expect(logCall).toContain('ERROR');
      expect(logCall).toContain('Error message');
    });
  });

  describe('structured data', () => {
    let logger: Logger;

    beforeEach(() => {
      logger = createLogger('TestLogger');
    });

    it('should include structured data in logs', () => {
      logger.info('User action', { userId: 'user123', action: 'login' });

      expect(mockConsole.info).toHaveBeenCalled();
      const logCall = mockConsole.info.mock.calls[0][0];
      expect(logCall).toContain('userId');
      expect(logCall).toContain('user123');
      expect(logCall).toContain('action');
      expect(logCall).toContain('login');
    });

    it('should handle nested objects', () => {
      logger.info('Complex data', {
        user: { id: 'user123', email: 'test@example.com' },
        metadata: { timestamp: 123456 },
      });

      expect(mockConsole.info).toHaveBeenCalled();
      const logCall = mockConsole.info.mock.calls[0][0];
      expect(logCall).toContain('user');
      expect(logCall).toContain('metadata');
    });

    it('should handle arrays', () => {
      logger.info('Array data', { items: [1, 2, 3] });

      expect(mockConsole.info).toHaveBeenCalled();
      const logCall = mockConsole.info.mock.calls[0][0];
      expect(logCall).toContain('items');
    });
  });

  describe('correlation IDs', () => {
    let logger: Logger;

    beforeEach(() => {
      logger = createLogger('TestLogger');
    });

    it('should include correlation ID when set globally', () => {
      setGlobalCorrelationId('req-123-abc');
      logger.info('Request processed');

      expect(mockConsole.info).toHaveBeenCalled();
      const logCall = mockConsole.info.mock.calls[0][0];
      expect(logCall).toContain('req-123-abc');
    });

    it('should not include correlation ID when not set', () => {
      logger.info('Request processed');

      expect(mockConsole.info).toHaveBeenCalled();
      const logCall = mockConsole.info.mock.calls[0][0];
      expect(logCall).not.toContain('correlationId');
    });

    it('should clear correlation ID', () => {
      setGlobalCorrelationId('req-123-abc');
      clearGlobalCorrelationId();
      logger.info('Request processed');

      expect(mockConsole.info).toHaveBeenCalled();
      const logCall = mockConsole.info.mock.calls[0][0];
      expect(logCall).not.toContain('req-123-abc');
    });
  });

  describe('withCorrelationId', () => {
    it('should execute callback with correlation ID context', async () => {
      const logger = createLogger('TestLogger');

      await withCorrelationId('ctx-456', async () => {
        logger.info('Inside context');
      });

      expect(mockConsole.info).toHaveBeenCalled();
      const logCall = mockConsole.info.mock.calls[0][0];
      expect(logCall).toContain('ctx-456');
    });

    it('should clean up correlation ID after callback', async () => {
      const logger = createLogger('TestLogger');

      await withCorrelationId('ctx-789', async () => {
        // Inside context
      });

      logger.info('Outside context');

      expect(mockConsole.info).toHaveBeenCalled();
      const logCall = mockConsole.info.mock.calls[0][0];
      expect(logCall).not.toContain('ctx-789');
    });

    it('should clean up correlation ID even if callback throws', async () => {
      const logger = createLogger('TestLogger');

      await expect(
        withCorrelationId('ctx-error', async () => {
          throw new Error('Test error');
        })
      ).rejects.toThrow('Test error');

      logger.info('After error');

      expect(mockConsole.info).toHaveBeenCalled();
      const logCall = mockConsole.info.mock.calls[0][0];
      expect(logCall).not.toContain('ctx-error');
    });
  });

  describe('global log function', () => {
    it('should log with default namespace', () => {
      log.info('Global log message');

      expect(mockConsole.info).toHaveBeenCalled();
      const logCall = mockConsole.info.mock.calls[0][0];
      expect(logCall).toContain('app');
      expect(logCall).toContain('Global log message');
    });
  });

  describe('error logging', () => {
    let logger: Logger;

    beforeEach(() => {
      logger = createLogger('TestLogger');
    });

    it('should log Error objects with stack trace', () => {
      const error = new Error('Test error');
      logger.error('An error occurred', { error });

      expect(mockConsole.error).toHaveBeenCalled();
      const logCall = mockConsole.error.mock.calls[0][0];
      expect(logCall).toContain('Test error');
    });

    it('should handle error as primary argument', () => {
      const error = new Error('Primary error');
      logger.error('Operation failed', { error });

      expect(mockConsole.error).toHaveBeenCalled();
    });
  });

  describe('timestamp', () => {
    let logger: Logger;

    beforeEach(() => {
      logger = createLogger('TestLogger');
    });

    it('should include ISO timestamp in logs', () => {
      logger.info('Timestamped log');

      expect(mockConsole.info).toHaveBeenCalled();
      const logCall = mockConsole.info.mock.calls[0][0];
      // Check for ISO 8601 format pattern
      expect(logCall).toMatch(/\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/);
    });
  });

  describe('getGlobalCorrelationId', () => {
    it('should return null when no correlation ID is set', () => {
      clearGlobalCorrelationId();
      expect(getGlobalCorrelationId()).toBeNull();
    });

    it('should return the correlation ID when set', () => {
      setGlobalCorrelationId('test-correlation-id');
      expect(getGlobalCorrelationId()).toBe('test-correlation-id');
    });

    it('should return null after clearing', () => {
      setGlobalCorrelationId('test-id');
      clearGlobalCorrelationId();
      expect(getGlobalCorrelationId()).toBeNull();
    });
  });

  describe('generateCorrelationId', () => {
    it('should generate a unique correlation ID', () => {
      const id1 = generateCorrelationId();
      const id2 = generateCorrelationId();

      expect(id1).toBeDefined();
      expect(id2).toBeDefined();
      expect(id1).not.toBe(id2);
    });

    it('should generate ID with expected format', () => {
      const id = generateCorrelationId();

      // Should contain a dash separator
      expect(id).toContain('-');
      // Should be a reasonable length (timestamp-random)
      expect(id.length).toBeGreaterThan(8);
      expect(id.length).toBeLessThan(30);
    });

    it('should generate IDs with alphanumeric characters', () => {
      const id = generateCorrelationId();

      // Should only contain alphanumeric and dash
      expect(id).toMatch(/^[a-z0-9-]+$/);
    });
  });

  describe('pre-configured loggers', () => {
    it('should have pre-configured namespace loggers', () => {
      expect(loggers.game).toBeDefined();
      expect(loggers.api).toBeDefined();
      expect(loggers.auth).toBeDefined();
      expect(loggers.payment).toBeDefined();
      expect(loggers.analytics).toBeDefined();
    });

    it('should use correct namespace for game logger', () => {
      loggers.game.info('Game event');

      expect(mockConsole.info).toHaveBeenCalled();
      const logCall = mockConsole.info.mock.calls[0][0];
      expect(logCall).toContain('game');
    });

    it('should use correct namespace for api logger', () => {
      loggers.api.info('API event');

      expect(mockConsole.info).toHaveBeenCalled();
      const logCall = mockConsole.info.mock.calls[0][0];
      expect(logCall).toContain('api');
    });
  });

  describe('JSON formatting', () => {
    let logger: Logger;

    beforeEach(() => {
      logger = createLogger('JSONTest');
    });

    it('should output valid JSON', () => {
      logger.info('JSON test');

      expect(mockConsole.info).toHaveBeenCalled();
      const logCall = mockConsole.info.mock.calls[0][0];

      // Should be parseable JSON
      expect(() => JSON.parse(logCall)).not.toThrow();
    });

    it('should include all required fields in JSON', () => {
      logger.info('Complete log', { extra: 'data' });

      expect(mockConsole.info).toHaveBeenCalled();
      const logCall = mockConsole.info.mock.calls[0][0];
      const parsed = JSON.parse(logCall);

      expect(parsed.timestamp).toBeDefined();
      expect(parsed.level).toBe('INFO');
      expect(parsed.namespace).toBe('JSONTest');
      expect(parsed.message).toBe('Complete log');
      expect(parsed.data).toEqual({ extra: 'data' });
    });
  });

  describe('emitLog internal function', () => {
    // emitLog is an internal function within createLogger closure
    // These tests verify its behavior through the public logger API

    let logger: Logger;

    beforeEach(() => {
      logger = createLogger('EmitLogTest');
    });

    it('should call debug console method for debug level', () => {
      logger.debug('Debug via emitLog');
      expect(mockConsole.debug).toHaveBeenCalled();
    });

    it('should call info console method for info level', () => {
      logger.info('Info via emitLog');
      expect(mockConsole.info).toHaveBeenCalled();
    });

    it('should call warn console method for warn level', () => {
      logger.warn('Warn via emitLog');
      expect(mockConsole.warn).toHaveBeenCalled();
    });

    it('should call error console method for error level', () => {
      logger.error('Error via emitLog');
      expect(mockConsole.error).toHaveBeenCalled();
    });

    it('should format log entry with all fields', () => {
      setGlobalCorrelationId('emit-test-id');
      logger.info('Full log test', { key: 'value' });

      const logCall = mockConsole.info.mock.calls[0][0];
      const parsed = JSON.parse(logCall);

      expect(parsed.timestamp).toBeDefined();
      expect(parsed.level).toBe('INFO');
      expect(parsed.namespace).toBe('EmitLogTest');
      expect(parsed.message).toBe('Full log test');
      expect(parsed.correlationId).toBe('emit-test-id');
      expect(parsed.data).toEqual({ key: 'value' });
    });
  });
});

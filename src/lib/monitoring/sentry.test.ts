/**
 * Sentry Error Tracking Tests
 * Validates error capture, user context, and initialization
 */

import {
  initSentry,
  captureError,
  captureMessage,
  setUserContext,
  clearUserContext,
  addBreadcrumb,
  startTransaction,
  createErrorBoundaryConfig,
  captureGameError,
  captureApiError,
  capturePaymentError,
  SentryConfig,
} from './sentry';

// Mock Sentry SDK
jest.mock('@sentry/nextjs', () => ({
  init: jest.fn(),
  captureException: jest.fn(),
  captureMessage: jest.fn(),
  setUser: jest.fn(),
  addBreadcrumb: jest.fn(),
  startTransaction: jest.fn(() => ({
    finish: jest.fn(),
    setStatus: jest.fn(),
    startChild: jest.fn(() => ({
      finish: jest.fn(),
    })),
  })),
  withScope: jest.fn((callback) => {
    const mockScope = {
      setTag: jest.fn(),
      setContext: jest.fn(),
      setLevel: jest.fn(),
    };
    callback(mockScope);
  }),
  Severity: {
    Info: 'info',
    Warning: 'warning',
    Error: 'error',
    Fatal: 'fatal',
  },
}));

import * as Sentry from '@sentry/nextjs';

describe('Sentry Error Tracking', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('initSentry', () => {
    it('should initialize Sentry with provided config', () => {
      const config: SentryConfig = {
        dsn: 'https://test@sentry.io/123',
        environment: 'test',
        release: '1.0.0',
      };

      initSentry(config);

      expect(Sentry.init).toHaveBeenCalledWith(
        expect.objectContaining({
          dsn: config.dsn,
          environment: config.environment,
          release: config.release,
          tracesSampleRate: expect.any(Number),
          integrations: expect.any(Array),
        })
      );
    });

    it('should not initialize when DSN is missing', () => {
      const config: SentryConfig = {
        dsn: '',
        environment: 'test',
      };

      initSentry(config);

      expect(Sentry.init).not.toHaveBeenCalled();
    });

    it('should set correct sample rate for production', () => {
      const config: SentryConfig = {
        dsn: 'https://test@sentry.io/123',
        environment: 'production',
      };

      initSentry(config);

      expect(Sentry.init).toHaveBeenCalledWith(
        expect.objectContaining({
          tracesSampleRate: 0.1,
        })
      );
    });

    it('should set higher sample rate for development', () => {
      const config: SentryConfig = {
        dsn: 'https://test@sentry.io/123',
        environment: 'development',
      };

      initSentry(config);

      expect(Sentry.init).toHaveBeenCalledWith(
        expect.objectContaining({
          tracesSampleRate: 1.0,
        })
      );
    });
  });

  describe('captureError', () => {
    it('should capture an error with context', () => {
      const error = new Error('Test error');
      const context = { userId: 'user123', action: 'game_start' };

      captureError(error, context);

      expect(Sentry.captureException).toHaveBeenCalledWith(error, {
        extra: context,
      });
    });

    it('should capture error without context', () => {
      const error = new Error('Simple error');

      captureError(error);

      expect(Sentry.captureException).toHaveBeenCalledWith(error, {
        extra: undefined,
      });
    });

    it('should capture string errors', () => {
      captureError('String error message');

      expect(Sentry.captureException).toHaveBeenCalledWith(
        expect.any(Error),
        expect.any(Object)
      );
    });
  });

  describe('captureMessage', () => {
    it('should capture info message', () => {
      captureMessage('User logged in', 'info');

      expect(Sentry.captureMessage).toHaveBeenCalledWith(
        'User logged in',
        'info'
      );
    });

    it('should capture warning message', () => {
      captureMessage('Rate limit approaching', 'warning');

      expect(Sentry.captureMessage).toHaveBeenCalledWith(
        'Rate limit approaching',
        'warning'
      );
    });

    it('should default to info level', () => {
      captureMessage('Default level message');

      expect(Sentry.captureMessage).toHaveBeenCalledWith(
        'Default level message',
        'info'
      );
    });
  });

  describe('setUserContext', () => {
    it('should set user context with all fields', () => {
      const user = {
        id: 'user123',
        email: 'test@example.com',
        username: 'testuser',
      };

      setUserContext(user);

      expect(Sentry.setUser).toHaveBeenCalledWith({
        id: user.id,
        email: user.email,
        username: user.username,
      });
    });

    it('should set user context with minimal fields', () => {
      const user = { id: 'user123' };

      setUserContext(user);

      expect(Sentry.setUser).toHaveBeenCalledWith({
        id: user.id,
        email: undefined,
        username: undefined,
      });
    });
  });

  describe('clearUserContext', () => {
    it('should clear user context', () => {
      clearUserContext();

      expect(Sentry.setUser).toHaveBeenCalledWith(null);
    });
  });

  describe('addBreadcrumb', () => {
    it('should add navigation breadcrumb', () => {
      addBreadcrumb({
        category: 'navigation',
        message: 'User navigated to /game',
        level: 'info',
      });

      expect(Sentry.addBreadcrumb).toHaveBeenCalledWith({
        category: 'navigation',
        message: 'User navigated to /game',
        level: 'info',
        timestamp: expect.any(Number),
      });
    });

    it('should add action breadcrumb with data', () => {
      addBreadcrumb({
        category: 'game',
        message: 'Game started',
        level: 'info',
        data: { variantId: 'snake_001', mode: 'classic' },
      });

      expect(Sentry.addBreadcrumb).toHaveBeenCalledWith({
        category: 'game',
        message: 'Game started',
        level: 'info',
        data: { variantId: 'snake_001', mode: 'classic' },
        timestamp: expect.any(Number),
      });
    });
  });

  describe('startTransaction', () => {
    it('should start a transaction for performance monitoring', () => {
      const transaction = startTransaction('game-session', 'game.play');

      expect(Sentry.startTransaction).toHaveBeenCalledWith({
        name: 'game-session',
        op: 'game.play',
      });
      expect(transaction).toBeDefined();
    });

    it('should return transaction with finish method', () => {
      const transaction = startTransaction('api-call', 'http.request');

      expect(transaction.finish).toBeDefined();
      expect(typeof transaction.finish).toBe('function');
    });
  });

  describe('createErrorBoundaryConfig', () => {
    it('should create error boundary configuration', () => {
      const config = createErrorBoundaryConfig('GameBoard');

      expect(config.fallback).toBeNull();
      expect(config.onError).toBeDefined();
      expect(config.beforeCapture).toBeDefined();
    });

    it('should capture error with component context', () => {
      const config = createErrorBoundaryConfig('GameBoard');
      const error = new Error('Component crashed');
      const componentStack = 'at GameBoard (GameBoard.tsx:10)';

      config.onError(error, componentStack);

      expect(Sentry.captureException).toHaveBeenCalledWith(error, {
        extra: {
          componentName: 'GameBoard',
          componentStack,
        },
      });
    });

    it('should set component tag in beforeCapture', () => {
      const config = createErrorBoundaryConfig('PlayerStats');
      const mockScope = {
        setTag: jest.fn(),
      };

      config.beforeCapture(mockScope as unknown as Sentry.Scope);

      expect(mockScope.setTag).toHaveBeenCalledWith('component', 'PlayerStats');
    });
  });

  describe('captureGameError', () => {
    beforeEach(() => {
      (Sentry.withScope as jest.Mock) = jest.fn((callback) => {
        const mockScope = {
          setTag: jest.fn(),
          setContext: jest.fn(),
        };
        callback(mockScope);
      });
    });

    it('should capture game error with game context', () => {
      const error = new Error('Game crashed');
      const gameContext = {
        sessionId: 'session_123',
        variantId: 'snake_001',
        score: 150,
        gameTime: 45,
      };

      captureGameError(error, gameContext);

      expect(Sentry.withScope).toHaveBeenCalled();
      expect(Sentry.captureException).toHaveBeenCalledWith(error);
    });

    it('should set game error tags', () => {
      const error = new Error('Game crashed');
      let capturedScope: { setTag: jest.Mock; setContext: jest.Mock } | null = null;

      (Sentry.withScope as jest.Mock) = jest.fn((callback) => {
        capturedScope = {
          setTag: jest.fn(),
          setContext: jest.fn(),
        };
        callback(capturedScope);
      });

      captureGameError(error, { sessionId: 'test' });

      expect(capturedScope?.setTag).toHaveBeenCalledWith('error_type', 'game_error');
      expect(capturedScope?.setContext).toHaveBeenCalledWith('game', { sessionId: 'test' });
    });
  });

  describe('captureApiError', () => {
    beforeEach(() => {
      (Sentry.withScope as jest.Mock) = jest.fn((callback) => {
        const mockScope = {
          setTag: jest.fn(),
          setContext: jest.fn(),
        };
        callback(mockScope);
      });
    });

    it('should capture API error with request context', () => {
      const error = new Error('API request failed');
      const requestContext = {
        endpoint: '/api/game/submit',
        method: 'POST',
        statusCode: 500,
        userId: 'user_123',
      };

      captureApiError(error, requestContext);

      expect(Sentry.withScope).toHaveBeenCalled();
      expect(Sentry.captureException).toHaveBeenCalledWith(error);
    });

    it('should set API error tags', () => {
      const error = new Error('API error');
      let capturedScope: { setTag: jest.Mock; setContext: jest.Mock } | null = null;

      (Sentry.withScope as jest.Mock) = jest.fn((callback) => {
        capturedScope = {
          setTag: jest.fn(),
          setContext: jest.fn(),
        };
        callback(capturedScope);
      });

      captureApiError(error, {
        endpoint: '/api/test',
        method: 'GET',
        statusCode: 404,
      });

      expect(capturedScope?.setTag).toHaveBeenCalledWith('error_type', 'api_error');
      expect(capturedScope?.setTag).toHaveBeenCalledWith('endpoint', '/api/test');
      expect(capturedScope?.setTag).toHaveBeenCalledWith('http_method', 'GET');
      expect(capturedScope?.setTag).toHaveBeenCalledWith('status_code', '404');
    });
  });

  describe('capturePaymentError', () => {
    beforeEach(() => {
      (Sentry.withScope as jest.Mock) = jest.fn((callback) => {
        const mockScope = {
          setTag: jest.fn(),
          setLevel: jest.fn(),
          setContext: jest.fn(),
        };
        callback(mockScope);
      });
    });

    it('should capture payment error with transaction context', () => {
      const error = new Error('Payment failed');
      const paymentContext = {
        transactionId: 'txn_1234567890abcdef',
        productId: 'prod_001',
        amount: 999,
        currency: 'USD',
        userId: 'user_123',
      };

      capturePaymentError(error, paymentContext);

      expect(Sentry.withScope).toHaveBeenCalled();
      expect(Sentry.captureException).toHaveBeenCalledWith(error);
    });

    it('should redact transaction ID', () => {
      const error = new Error('Payment error');
      let capturedScope: { setTag: jest.Mock; setLevel: jest.Mock; setContext: jest.Mock } | null = null;

      (Sentry.withScope as jest.Mock) = jest.fn((callback) => {
        capturedScope = {
          setTag: jest.fn(),
          setLevel: jest.fn(),
          setContext: jest.fn(),
        };
        callback(capturedScope);
      });

      capturePaymentError(error, {
        transactionId: 'txn_1234567890abcdef',
        amount: 100,
      });

      expect(capturedScope?.setContext).toHaveBeenCalledWith(
        'payment',
        expect.objectContaining({
          transactionId: 'txn_1234...',
        })
      );
    });

    it('should set payment error tags and level', () => {
      const error = new Error('Payment error');
      let capturedScope: { setTag: jest.Mock; setLevel: jest.Mock; setContext: jest.Mock } | null = null;

      (Sentry.withScope as jest.Mock) = jest.fn((callback) => {
        capturedScope = {
          setTag: jest.fn(),
          setLevel: jest.fn(),
          setContext: jest.fn(),
        };
        callback(capturedScope);
      });

      capturePaymentError(error, { amount: 100 });

      expect(capturedScope?.setTag).toHaveBeenCalledWith('error_type', 'payment_error');
      expect(capturedScope?.setLevel).toHaveBeenCalledWith('error');
    });
  });
});

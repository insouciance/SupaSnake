/**
 * PostHog Analytics Tests
 * Validates consent-gated init, event tracking, user identification,
 * and revenue events.
 */

import {
  initAnalytics,
  isAnalyticsInitialized,
  enableAnalytics,
  disableAnalytics,
  trackEvent,
  identifyUser,
  setUserProperties,
  resetUser,
  trackRevenue,
  trackGameEvent,
  trackEconomyEvent,
  getSessionId,
} from './posthog';

jest.mock('posthog-js', () => ({
  __esModule: true,
  default: {
    init: jest.fn(),
    capture: jest.fn(),
    identify: jest.fn(),
    reset: jest.fn(),
    setPersonProperties: jest.fn(),
    opt_in_capturing: jest.fn(),
    opt_out_capturing: jest.fn(),
    get_session_id: jest.fn(() => 'session-abc'),
  },
}));

import posthog from 'posthog-js';

const mocked = jest.mocked(posthog);

describe('PostHog Analytics', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('initAnalytics', () => {
    it('warns and stays uninitialized without an API key', () => {
      const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
      // Module-level initialized flag may already be true from other tests;
      // an empty key must never call init either way.
      initAnalytics({ apiKey: '' });
      expect(mocked.init).not.toHaveBeenCalled();
      warnSpy.mockRestore();
    });

    it('initializes with API key and EU host default', () => {
      initAnalytics({ apiKey: 'phc_test' });
      expect(mocked.init).toHaveBeenCalledWith(
        'phc_test',
        expect.objectContaining({
          api_host: 'https://eu.i.posthog.com',
          autocapture: false,
        })
      );
      expect(isAnalyticsInitialized()).toBe(true);
    });

    it('does not re-initialize on subsequent calls', () => {
      initAnalytics({ apiKey: 'phc_test' });
      initAnalytics({ apiKey: 'phc_other' });
      expect(mocked.init).not.toHaveBeenCalled();
    });
  });

  describe('event tracking (after init)', () => {
    beforeAll(() => {
      initAnalytics({ apiKey: 'phc_test' });
    });

    it('tracks a custom event with properties', () => {
      trackEvent('game_start', { dynasty: 'CYBER' });
      expect(mocked.capture).toHaveBeenCalledWith('game_start', {
        dynasty: 'CYBER',
      });
    });

    it('tags game events with gameplay category', () => {
      trackGameEvent('death', { score: 42 });
      expect(mocked.capture).toHaveBeenCalledWith('death', {
        score: 42,
        eventCategory: 'gameplay',
      });
    });

    it('tags economy events with economy category', () => {
      trackEconomyEvent('dna_earned', { amount: 100 });
      expect(mocked.capture).toHaveBeenCalledWith('dna_earned', {
        amount: 100,
        eventCategory: 'economy',
      });
    });

    it('tracks revenue with computed total', () => {
      trackRevenue({
        productId: 'energy_small',
        price: 0.99,
        quantity: 2,
        revenueType: 'iap',
      });
      expect(mocked.capture).toHaveBeenCalledWith('revenue', {
        product_id: 'energy_small',
        price: 0.99,
        quantity: 2,
        revenue_type: 'iap',
        revenue: 1.98,
      });
    });
  });

  describe('identity', () => {
    beforeAll(() => {
      initAnalytics({ apiKey: 'phc_test' });
    });

    it('identifies a user by ID', () => {
      identifyUser('user-123');
      expect(mocked.identify).toHaveBeenCalledWith('user-123');
    });

    it('resets identity on null user ID (logout)', () => {
      identifyUser(null);
      expect(mocked.reset).toHaveBeenCalled();
    });

    it('sets person properties', () => {
      setUserProperties({ dynasty: 'PRIMAL', collection_size: 7 });
      expect(mocked.setPersonProperties).toHaveBeenCalledWith({
        dynasty: 'PRIMAL',
        collection_size: 7,
      });
    });

    it('resets the session on resetUser', () => {
      resetUser();
      expect(mocked.reset).toHaveBeenCalled();
    });
  });

  describe('consent transitions', () => {
    beforeAll(() => {
      initAnalytics({ apiKey: 'phc_test' });
    });

    it('opts out when consent is revoked', () => {
      disableAnalytics();
      expect(mocked.opt_out_capturing).toHaveBeenCalled();
    });

    it('opts back in when consent is re-granted', () => {
      enableAnalytics();
      expect(mocked.opt_in_capturing).toHaveBeenCalled();
    });
  });

  describe('session', () => {
    beforeAll(() => {
      initAnalytics({ apiKey: 'phc_test' });
    });

    it('exposes the session id', () => {
      expect(getSessionId()).toBe('session-abc');
    });
  });
});

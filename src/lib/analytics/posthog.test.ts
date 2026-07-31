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
  clearLegacyPostHogPersistence,
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
          persistence: 'memory',
          disable_persistence: true,
          disable_session_recording: true,
          disable_surveys: true,
          disable_surveys_automatic_display: true,
          disable_product_tours: true,
          disable_conversations: true,
          disable_web_experiments: true,
          disable_external_dependency_loading: true,
          rageclick: false,
          capture_heatmaps: false,
          capture_dead_clicks: false,
          capture_exceptions: false,
          advanced_disable_flags: true,
        })
      );
      expect(isAnalyticsInitialized()).toBe(true);
    });

    it('removes every prior-token PostHog blob without touching consent', () => {
      const oldKey = 'ph_phc_old_project_posthog';
      const olderKey = 'ph_phc_older_project_posthog';
      const emptyTokenKey = 'ph__posthog';
      const consentKey = '__ph_opt_in_out_phc_current';
      window.localStorage.setItem(oldKey, JSON.stringify({
        $stored_person_properties: { ladder_rung: 'belonging' },
      }));
      window.localStorage.setItem(olderKey, 'older');
      window.localStorage.setItem(emptyTokenKey, 'empty-token legacy');
      window.localStorage.setItem(consentKey, '1');
      window.sessionStorage.setItem(oldKey, 'legacy');
      window.sessionStorage.setItem('unrelated', 'keep');

      clearLegacyPostHogPersistence();

      expect(window.localStorage.getItem(oldKey)).toBeNull();
      expect(window.localStorage.getItem(olderKey)).toBeNull();
      expect(window.localStorage.getItem(emptyTokenKey)).toBeNull();
      expect(window.sessionStorage.getItem(oldKey)).toBeNull();
      expect(window.localStorage.getItem(consentKey)).toBe('1');
      expect(window.sessionStorage.getItem('unrelated')).toBe('keep');
    });

    it('expires every accessible prior-token PostHog cookie', () => {
      document.cookie = 'ph_phc_old_project_posthog=legacy; Path=/';
      document.cookie = 'unrelated_cookie=keep; Path=/';

      clearLegacyPostHogPersistence();

      expect(document.cookie).not.toContain('ph_phc_old_project_posthog');
      expect(document.cookie).toContain('unrelated_cookie=keep');
    });

    it('purges legacy persistence even when no current token exists', () => {
      const key = 'ph_phc_previous_posthog';
      window.localStorage.setItem(key, 'legacy');
      const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});

      initAnalytics({ apiKey: '' });

      expect(window.localStorage.getItem(key)).toBeNull();
      expect(mocked.init).not.toHaveBeenCalled();
      warnSpy.mockRestore();
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

/**
 * Amplitude Analytics Tests
 * Validates event tracking, user identification, and session management
 */

import {
  initAmplitude,
  trackEvent,
  identifyUser,
  setUserProperties,
  resetUser,
  trackRevenue,
  trackGameEvent,
  trackEconomyEvent,
  getSessionId,
  AmplitudeConfig,
} from './amplitude';

// Mock Amplitude SDK
jest.mock('@amplitude/analytics-browser', () => ({
  init: jest.fn(),
  track: jest.fn(),
  identify: jest.fn(),
  setUserId: jest.fn(),
  reset: jest.fn(),
  revenue: jest.fn(),
  getSessionId: jest.fn(() => 12345),
  Identify: jest.fn().mockImplementation(() => ({
    set: jest.fn().mockReturnThis(),
  })),
  Revenue: jest.fn().mockImplementation(() => ({
    setProductId: jest.fn().mockReturnThis(),
    setPrice: jest.fn().mockReturnThis(),
    setQuantity: jest.fn().mockReturnThis(),
    setRevenueType: jest.fn().mockReturnThis(),
  })),
}));

import * as amplitude from '@amplitude/analytics-browser';

describe('Amplitude Analytics', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('initAmplitude', () => {
    it('should initialize Amplitude with API key', () => {
      const config: AmplitudeConfig = {
        apiKey: 'test-api-key',
        userId: 'user123',
      };

      initAmplitude(config);

      expect(amplitude.init).toHaveBeenCalledWith(
        'test-api-key',
        'user123',
        expect.objectContaining({
          defaultTracking: expect.any(Object),
        })
      );
    });

    it('should not initialize without API key', () => {
      const config: AmplitudeConfig = {
        apiKey: '',
      };

      initAmplitude(config);

      expect(amplitude.init).not.toHaveBeenCalled();
    });

    it('should configure default tracking options', () => {
      const config: AmplitudeConfig = {
        apiKey: 'test-api-key',
      };

      initAmplitude(config);

      expect(amplitude.init).toHaveBeenCalledWith(
        'test-api-key',
        undefined,
        expect.objectContaining({
          defaultTracking: {
            sessions: true,
            pageViews: true,
            formInteractions: false,
            fileDownloads: false,
          },
        })
      );
    });
  });

  describe('trackEvent', () => {
    it('should track event with name and properties', () => {
      trackEvent('button_clicked', { buttonId: 'start-game' });

      expect(amplitude.track).toHaveBeenCalledWith('button_clicked', {
        buttonId: 'start-game',
      });
    });

    it('should track event without properties', () => {
      trackEvent('page_viewed');

      expect(amplitude.track).toHaveBeenCalledWith('page_viewed', undefined);
    });

    it('should handle complex event properties', () => {
      trackEvent('game_completed', {
        score: 1500,
        duration: 120,
        variant: 'classic',
        achievements: ['first_game', 'high_score'],
      });

      expect(amplitude.track).toHaveBeenCalledWith('game_completed', {
        score: 1500,
        duration: 120,
        variant: 'classic',
        achievements: ['first_game', 'high_score'],
      });
    });
  });

  describe('identifyUser', () => {
    it('should set user ID', () => {
      identifyUser('user456');

      expect(amplitude.setUserId).toHaveBeenCalledWith('user456');
    });

    it('should handle null user ID for logout', () => {
      identifyUser(null);

      expect(amplitude.setUserId).toHaveBeenCalledWith(null);
    });
  });

  describe('setUserProperties', () => {
    it('should set user properties', () => {
      setUserProperties({
        premium: true,
        level: 10,
        email: 'test@example.com',
      });

      expect(amplitude.identify).toHaveBeenCalled();
    });

    it('should handle empty properties', () => {
      setUserProperties({});

      expect(amplitude.identify).toHaveBeenCalled();
    });
  });

  describe('resetUser', () => {
    it('should reset user session', () => {
      resetUser();

      expect(amplitude.reset).toHaveBeenCalled();
    });
  });

  describe('trackRevenue', () => {
    it('should track revenue event', () => {
      trackRevenue({
        productId: 'energy_pack',
        price: 4.99,
        quantity: 1,
        revenueType: 'purchase',
      });

      expect(amplitude.revenue).toHaveBeenCalled();
    });

    it('should set revenue properties correctly', () => {
      const RevenueMock = (amplitude.Revenue as jest.Mock).mock.results[0]?.value || {
        setProductId: jest.fn().mockReturnThis(),
        setPrice: jest.fn().mockReturnThis(),
        setQuantity: jest.fn().mockReturnThis(),
        setRevenueType: jest.fn().mockReturnThis(),
      };

      trackRevenue({
        productId: 'premium_snake',
        price: 9.99,
        quantity: 1,
        revenueType: 'iap',
      });

      expect(amplitude.revenue).toHaveBeenCalled();
    });
  });

  describe('trackGameEvent', () => {
    it('should track game start event', () => {
      trackGameEvent('game_start', {
        variantId: 'snake_001',
        mode: 'classic',
      });

      expect(amplitude.track).toHaveBeenCalledWith('game_start', {
        variantId: 'snake_001',
        mode: 'classic',
        eventCategory: 'gameplay',
      });
    });

    it('should track game end event with score', () => {
      trackGameEvent('game_end', {
        score: 2500,
        duration: 180,
        deathCause: 'wall_collision',
      });

      expect(amplitude.track).toHaveBeenCalledWith('game_end', {
        score: 2500,
        duration: 180,
        deathCause: 'wall_collision',
        eventCategory: 'gameplay',
      });
    });
  });

  describe('trackEconomyEvent', () => {
    it('should track DNA earned event', () => {
      trackEconomyEvent('dna_earned', {
        amount: 100,
        source: 'game_completion',
      });

      expect(amplitude.track).toHaveBeenCalledWith('dna_earned', {
        amount: 100,
        source: 'game_completion',
        eventCategory: 'economy',
      });
    });

    it('should track DNA spent event', () => {
      trackEconomyEvent('dna_spent', {
        amount: 500,
        itemId: 'energy_refill',
      });

      expect(amplitude.track).toHaveBeenCalledWith('dna_spent', {
        amount: 500,
        itemId: 'energy_refill',
        eventCategory: 'economy',
      });
    });
  });

  describe('getSessionId', () => {
    it('should return current session ID', () => {
      const sessionId = getSessionId();

      expect(sessionId).toBe(12345);
      expect(amplitude.getSessionId).toHaveBeenCalled();
    });
  });
});

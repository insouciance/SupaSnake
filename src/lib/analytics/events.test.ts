/**
 * Event Taxonomy Tests
 * Validates event definitions and helper functions
 */

import {
  AnalyticsEvents,
  EventCategories,
  createLifecycleEvent,
  createGameplayEvent,
  createEconomyEvent,
  createCollectionEvent,
  createMonetizationEvent,
  createEngagementEvent,
  createSocialEvent,
} from './events';

describe('Event Taxonomy', () => {
  describe('EventCategories', () => {
    it('should have all required categories', () => {
      expect(EventCategories.LIFECYCLE).toBe('lifecycle');
      expect(EventCategories.GAMEPLAY).toBe('gameplay');
      expect(EventCategories.ECONOMY).toBe('economy');
      expect(EventCategories.COLLECTION).toBe('collection');
      expect(EventCategories.MONETIZATION).toBe('monetization');
      expect(EventCategories.ENGAGEMENT).toBe('engagement');
      expect(EventCategories.SOCIAL).toBe('social');
    });
  });

  describe('AnalyticsEvents', () => {
    describe('Lifecycle Events', () => {
      it('should have signup event', () => {
        expect(AnalyticsEvents.SIGNUP).toBe('signup');
      });

      it('should have login event', () => {
        expect(AnalyticsEvents.LOGIN).toBe('login');
      });

      it('should have logout event', () => {
        expect(AnalyticsEvents.LOGOUT).toBe('logout');
      });

      it('should have session_start event', () => {
        expect(AnalyticsEvents.SESSION_START).toBe('session_start');
      });

      it('should have session_end event', () => {
        expect(AnalyticsEvents.SESSION_END).toBe('session_end');
      });
    });

    describe('Gameplay Events', () => {
      it('should have game_start event', () => {
        expect(AnalyticsEvents.GAME_START).toBe('game_start');
      });

      it('should have game_end event', () => {
        expect(AnalyticsEvents.GAME_END).toBe('game_end');
      });

      it('should have food_collected event', () => {
        expect(AnalyticsEvents.FOOD_COLLECTED).toBe('food_collected');
      });

      it('should have death event', () => {
        expect(AnalyticsEvents.DEATH).toBe('death');
      });
    });

    describe('Economy Events', () => {
      it('should have dna_earned event', () => {
        expect(AnalyticsEvents.DNA_EARNED).toBe('dna_earned');
      });

      it('should have dna_spent event', () => {
        expect(AnalyticsEvents.DNA_SPENT).toBe('dna_spent');
      });

      it('should have energy_used event', () => {
        expect(AnalyticsEvents.ENERGY_USED).toBe('energy_used');
      });

      it('should have energy_regen event', () => {
        expect(AnalyticsEvents.ENERGY_REGEN).toBe('energy_regen');
      });
    });

    describe('Collection Events', () => {
      it('should have variant_unlocked event', () => {
        expect(AnalyticsEvents.VARIANT_UNLOCKED).toBe('variant_unlocked');
      });

      it('should have breeding_started event', () => {
        expect(AnalyticsEvents.BREEDING_STARTED).toBe('breeding_started');
      });

      it('should have breeding_complete event', () => {
        expect(AnalyticsEvents.BREEDING_COMPLETE).toBe('breeding_complete');
      });
    });

    describe('Monetization Events', () => {
      it('should have checkout_started event', () => {
        expect(AnalyticsEvents.CHECKOUT_STARTED).toBe('checkout_started');
      });

      it('should have purchase_complete event', () => {
        expect(AnalyticsEvents.PURCHASE_COMPLETE).toBe('purchase_complete');
      });

      it('should have refund event', () => {
        expect(AnalyticsEvents.REFUND).toBe('refund');
      });
    });

    describe('Engagement Events', () => {
      it('should have streak_claimed event', () => {
        expect(AnalyticsEvents.STREAK_CLAIMED).toBe('streak_claimed');
      });

      it('should have daily_reward_claimed event', () => {
        expect(AnalyticsEvents.DAILY_REWARD_CLAIMED).toBe('daily_reward_claimed');
      });

      it('should have achievement_unlocked event', () => {
        expect(AnalyticsEvents.ACHIEVEMENT_UNLOCKED).toBe('achievement_unlocked');
      });
    });

    describe('Social Events', () => {
      it('should have clan_joined event', () => {
        expect(AnalyticsEvents.CLAN_JOINED).toBe('clan_joined');
      });

      it('should have clan_left event', () => {
        expect(AnalyticsEvents.CLAN_LEFT).toBe('clan_left');
      });
    });
  });

  describe('Event Helpers', () => {
    describe('createLifecycleEvent', () => {
      it('should create lifecycle event with category', () => {
        const event = createLifecycleEvent(AnalyticsEvents.LOGIN, {
          method: 'email',
        });

        expect(event.name).toBe('login');
        expect(event.properties.category).toBe('lifecycle');
        expect(event.properties.method).toBe('email');
      });
    });

    describe('createGameplayEvent', () => {
      it('should create gameplay event with category', () => {
        const event = createGameplayEvent(AnalyticsEvents.GAME_START, {
          variantId: 'snake_001',
          mode: 'classic',
        });

        expect(event.name).toBe('game_start');
        expect(event.properties.category).toBe('gameplay');
        expect(event.properties.variantId).toBe('snake_001');
        expect(event.properties.mode).toBe('classic');
      });
    });

    describe('createEconomyEvent', () => {
      it('should create economy event with category', () => {
        const event = createEconomyEvent(AnalyticsEvents.DNA_EARNED, {
          amount: 100,
          source: 'game_completion',
        });

        expect(event.name).toBe('dna_earned');
        expect(event.properties.category).toBe('economy');
        expect(event.properties.amount).toBe(100);
        expect(event.properties.source).toBe('game_completion');
      });
    });

    describe('createCollectionEvent', () => {
      it('should create collection event with category', () => {
        const event = createCollectionEvent(AnalyticsEvents.VARIANT_UNLOCKED, {
          variantId: 'snake_legendary_001',
          rarity: 'legendary',
        });

        expect(event.name).toBe('variant_unlocked');
        expect(event.properties.category).toBe('collection');
        expect(event.properties.variantId).toBe('snake_legendary_001');
        expect(event.properties.rarity).toBe('legendary');
      });
    });

    describe('createMonetizationEvent', () => {
      it('should create monetization event with category', () => {
        const event = createMonetizationEvent(AnalyticsEvents.PURCHASE_COMPLETE, {
          productId: 'energy_pack',
          price: 4.99,
          currency: 'USD',
        });

        expect(event.name).toBe('purchase_complete');
        expect(event.properties.category).toBe('monetization');
        expect(event.properties.productId).toBe('energy_pack');
        expect(event.properties.price).toBe(4.99);
        expect(event.properties.currency).toBe('USD');
      });
    });

    describe('createEngagementEvent', () => {
      it('should create engagement event with category', () => {
        const event = createEngagementEvent(AnalyticsEvents.STREAK_CLAIMED, {
          streakDay: 7,
          reward: 'energy_bonus',
        });

        expect(event.name).toBe('streak_claimed');
        expect(event.properties.category).toBe('engagement');
        expect(event.properties.streakDay).toBe(7);
        expect(event.properties.reward).toBe('energy_bonus');
      });
    });

    describe('createSocialEvent', () => {
      it('should create social event with category', () => {
        const event = createSocialEvent(AnalyticsEvents.CLAN_JOINED, {
          clanId: 'clan_123',
          clanSize: 15,
        });

        expect(event.name).toBe('clan_joined');
        expect(event.properties.category).toBe('social');
        expect(event.properties.clanId).toBe('clan_123');
        expect(event.properties.clanSize).toBe(15);
      });
    });
  });
});

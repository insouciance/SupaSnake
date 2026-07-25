/**
 * Event Taxonomy
 * Standardized event definitions for SupaSnake analytics
 *
 * Categories:
 * - Lifecycle: User session and account events
 * - Gameplay: In-game actions and outcomes
 * - Economy: Virtual currency and resource events
 * - Collection: Snake variants and breeding
 * - Monetization: Purchase and payment events
 * - Engagement: Streaks, rewards, achievements
 * - Social: Clans and multiplayer
 * - Growth: Acquisition-funnel stages (Constitution §11.5)
 */

export const EventCategories = {
  LIFECYCLE: 'lifecycle',
  GAMEPLAY: 'gameplay',
  ECONOMY: 'economy',
  COLLECTION: 'collection',
  MONETIZATION: 'monetization',
  ENGAGEMENT: 'engagement',
  SOCIAL: 'social',
  GROWTH: 'growth',
} as const;

export type EventCategory = typeof EventCategories[keyof typeof EventCategories];

/**
 * All analytics events in the game
 * Naming convention: {noun}_{past_tense_verb}
 */
export const AnalyticsEvents = {
  // Lifecycle Events
  SIGNUP: 'signup',
  LOGIN: 'login',
  LOGOUT: 'logout',
  SESSION_START: 'session_start',
  SESSION_END: 'session_end',
  TUTORIAL_STARTED: 'tutorial_started',
  TUTORIAL_COMPLETED: 'tutorial_completed',
  TUTORIAL_SKIPPED: 'tutorial_skipped',

  // Gameplay Events
  GAME_START: 'game_start',
  GAME_END: 'game_end',
  GAME_PAUSED: 'game_paused',
  GAME_RESUMED: 'game_resumed',
  FOOD_COLLECTED: 'food_collected',
  POWER_UP_COLLECTED: 'power_up_collected',
  DEATH: 'death',
  HIGH_SCORE_ACHIEVED: 'high_score_achieved',
  LEVEL_UP: 'level_up',

  // Economy Events
  DNA_EARNED: 'dna_earned',
  DNA_SPENT: 'dna_spent',
  ENERGY_USED: 'energy_used',
  ENERGY_REGEN: 'energy_regen',
  // ENERGY_PURCHASED is deleted (WP-0.09): energy is never sold
  // (Constitution §10.4), so the event can never fire.
  // COINS_EARNED / COINS_SPENT are deleted with it: SupaSnake has exactly
  // one currency (DNA, §8.5) and a second currency name in the taxonomy is
  // how a two-currency dark pattern gets measured into existence.

  // Collection Events
  VARIANT_UNLOCKED: 'variant_unlocked',
  VARIANT_SELECTED: 'variant_selected',
  BREEDING_STARTED: 'breeding_started',
  BREEDING_COMPLETE: 'breeding_complete',
  BREEDING_CANCELLED: 'breeding_cancelled',
  VARIANT_LEVELED: 'variant_leveled',

  // Monetization Events
  SHOP_OPENED: 'shop_opened',
  SHOP_ITEM_VIEWED: 'shop_item_viewed',
  CHECKOUT_STARTED: 'checkout_started',
  CHECKOUT_ABANDONED: 'checkout_abandoned',
  PURCHASE_COMPLETE: 'purchase_complete',
  PURCHASE_FAILED: 'purchase_failed',
  REFUND: 'refund',
  // AD_WATCHED / AD_SKIPPED are deleted (WP-0.09). Advertising is a named
  // dark pattern (Constitution §10.6); there is no ad to watch or skip, and
  // a telemetry slot for one is a plan nobody approved.

  // Engagement Events
  DAILY_LOGIN: 'daily_login',
  STREAK_CLAIMED: 'streak_claimed',
  STREAK_LOST: 'streak_lost',
  DAILY_REWARD_CLAIMED: 'daily_reward_claimed',
  ACHIEVEMENT_UNLOCKED: 'achievement_unlocked',
  CHALLENGE_STARTED: 'challenge_started',
  CHALLENGE_COMPLETED: 'challenge_completed',
  NOTIFICATION_OPENED: 'notification_opened',
  NOTIFICATION_DISMISSED: 'notification_dismissed',

  // Social Events
  CLAN_VIEWED: 'clan_viewed',
  CLAN_CREATED: 'clan_created',
  CLAN_JOINED: 'clan_joined',
  CLAN_LEFT: 'clan_left',
  CLAN_INVITED: 'clan_invited',
  LEADERBOARD_VIEWED: 'leaderboard_viewed',
  FRIEND_ADDED: 'friend_added',
  SHARE_INITIATED: 'share_initiated',

  // Growth Events - the Acquisition Engine's eight stages (§11.5).
  // Emitted through trackFunnelStage() in ./funnel.ts, never directly.
  FUNNEL_REACH_ENTERED: 'funnel_reach_entered',
  FUNNEL_ARRIVE_ENTERED: 'funnel_arrive_entered',
  FUNNEL_ACTIVATE_ENTERED: 'funnel_activate_entered',
  FUNNEL_IDENTIFY_ENTERED: 'funnel_identify_entered',
  FUNNEL_HABITUATE_ENTERED: 'funnel_habituate_entered',
  FUNNEL_BELONG_ENTERED: 'funnel_belong_entered',
  FUNNEL_ADVOCATE_ENTERED: 'funnel_advocate_entered',
  FUNNEL_PATRONIZE_ENTERED: 'funnel_patronize_entered',
  DISPATCH_WAITLIST_SUBMITTED: 'dispatch_waitlist_submitted',
} as const;

export type AnalyticsEvent = typeof AnalyticsEvents[keyof typeof AnalyticsEvents];

export interface EventData {
  name: string;
  properties: Record<string, unknown>;
}

/**
 * Create a lifecycle event with standard properties
 */
export function createLifecycleEvent(
  eventName: string,
  properties: Record<string, unknown> = {}
): EventData {
  return {
    name: eventName,
    properties: {
      ...properties,
      category: EventCategories.LIFECYCLE,
    },
  };
}

/**
 * Create a gameplay event with standard properties
 */
export function createGameplayEvent(
  eventName: string,
  properties: Record<string, unknown> = {}
): EventData {
  return {
    name: eventName,
    properties: {
      ...properties,
      category: EventCategories.GAMEPLAY,
    },
  };
}

/**
 * Create an economy event with standard properties
 */
export function createEconomyEvent(
  eventName: string,
  properties: Record<string, unknown> = {}
): EventData {
  return {
    name: eventName,
    properties: {
      ...properties,
      category: EventCategories.ECONOMY,
    },
  };
}

/**
 * Create a collection event with standard properties
 */
export function createCollectionEvent(
  eventName: string,
  properties: Record<string, unknown> = {}
): EventData {
  return {
    name: eventName,
    properties: {
      ...properties,
      category: EventCategories.COLLECTION,
    },
  };
}

/**
 * Create a monetization event with standard properties
 */
export function createMonetizationEvent(
  eventName: string,
  properties: Record<string, unknown> = {}
): EventData {
  return {
    name: eventName,
    properties: {
      ...properties,
      category: EventCategories.MONETIZATION,
    },
  };
}

/**
 * Create an engagement event with standard properties
 */
export function createEngagementEvent(
  eventName: string,
  properties: Record<string, unknown> = {}
): EventData {
  return {
    name: eventName,
    properties: {
      ...properties,
      category: EventCategories.ENGAGEMENT,
    },
  };
}

/**
 * Create a social event with standard properties
 */
export function createSocialEvent(
  eventName: string,
  properties: Record<string, unknown> = {}
): EventData {
  return {
    name: eventName,
    properties: {
      ...properties,
      category: EventCategories.SOCIAL,
    },
  };
}

/**
 * Create a growth/acquisition-funnel event with standard properties
 */
export function createGrowthEvent(
  eventName: string,
  properties: Record<string, unknown> = {}
): EventData {
  return {
    name: eventName,
    properties: {
      ...properties,
      category: EventCategories.GROWTH,
    },
  };
}

/**
 * Engagement Configuration - Single Source of Truth
 * AAA 2026 Standard: Centralized engagement values
 */

export const ENGAGEMENT_CONFIG = {
  /**
   * Daily Rewards System
   */
  dailyRewards: {
    cycleDays: 28,
    milestoneDays: [7, 14, 21, 28] as const,
    minHoursBetweenClaims: 20,
    resetHourUTC: 0,
  },

  /**
   * Contracts (Design v2 section 7.3 - the daily loop)
   * Offered 3, pick 2; rewards defined in contract_definitions
   * (migration 015). Replaces the flat 28-day calendar DNA faucet;
   * the calendar's milestone days survive (its streak multiplier does
   * not - WP-0.02 deleted the whole stack).
   */
  contracts: {
    offersPerDay: 3,
    picksPerDay: 2,
    /** Season-track XP per completed contract (doc: ~150 XP each) */
    xpPerContract: 150,
    /** Combo/mutation contracts activate with Phase 2A session facts */
    comboContractsEnabled: false,
  },

  /**
   * Streak System
   *
   * WP-0.02 deleted the streak DNA multiplier and its tier energy bonus
   * (Constitution §8.5): a play streak is a count and a record, never a
   * factor on a payout. What survives is the grace window. The Daily Take
   * streak (§7.2) is a separate, Take-only multiplier owned by WP-1.04 -
   * it must never be reintroduced here as a global run multiplier.
   */
  streaks: {
    gracePeriodDays: 1,
    graceResetDays: 7,
  },

  /**
   * Battle Pass System
   */
  battlePass: {
    levelsPerSeason: 50,
    xpPerLevel: 1000,
    seasonDurationDays: 30,
    premiumPriceUsd: 4.99,
    claimGracePeriodHours: 24,
    xpSources: {
      gameComplete: 50,
      gameVictory: 100,
      dailyLogin: 25,
      breeding: 75,
    } as const,
  },

  /**
   * Passive Progress System (Tamagotchi-style)
   * Rewards players for time away from the game
   */
  passiveProgress: {
    /** DNA generated per snake per hour while offline */
    dnaPerSnakePerHour: 1,
    /** Maximum hours of offline progress to accumulate */
    maxOfflineHours: 24,
    /** Minimum minutes offline before showing Welcome Back modal */
    minOfflineMinutes: 5,
    /** Energy regeneration is handled separately by energyRegen.ts */
  },
} as const;

/**
 * Type exports
 */
export type EngagementConfig = typeof ENGAGEMENT_CONFIG;
// `StreakTier` and `AchievementCategory` both lived here. WP-0.02 deleted the
// streak tier ladder with the rest of the DNA multiplier stack, and WP-0.04
// retired achievements into the Legacy Records. Each branch removed the other's
// type, so the merge conflicted on the survivor; neither config exists now.

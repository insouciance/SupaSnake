/**
 * Engagement Configuration - Single Source of Truth
 * AAA 2026 Standard: Centralized engagement values
 */

export const ENGAGEMENT_CONFIG = {
  /**
   * Contracts (Design v2 section 7.3 - the daily loop)
   * Offered 3, pick 2; rewards defined in contract_definitions
   * (migration 015).
   *
   * WP-0.03 deleted the `dailyRewards` block that used to sit above this
   * one: the 28-day calendar it configured is gone (route, RPC, tier
   * table and login ledger), so the block described nothing. The one
   * daily surface the Constitution permits is the Signal (§12.2), and
   * the game's only claim will be the Daily Take's collect (WP-1.04).
   */
  contracts: {
    offersPerDay: 3,
    picksPerDay: 2,
    /** Season-track XP per completed contract (doc: ~150 XP each) */
    xpPerContract: 150,
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
   * The `battlePass` block that stood here was never read by any code
   * path (GROUND_TRUTH §10): it advertised 50 levels x 1,000 XP, a
   * 30-day season, a EUR 4.99 price and four XP sources, none of which
   * matched the live Season 1 (30 levels x 400 XP, contract-fed only,
   * migration 021). WP-0.03 deleted it rather than correct it - the
   * seasons tables are the authority on the season, and a config object
   * that restates them can only drift again.
   */

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

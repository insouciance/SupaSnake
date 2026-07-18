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
   * the calendar's streak multiplier and milestone days survive.
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
   */
  streaks: {
    gracePeriodDays: 1,
    graceResetDays: 7,
    // Design v2 retune: compressed so the extraction bank bonus (x1.25)
    // stacked on the top streak tier stays near today's economy ceiling.
    // Keep in sync with streak_bonus_tiers (migration 013).
    maxMultiplier: 1.35,
    tiers: [
      { days: 3, multiplier: 1.05, energyBonus: 0 },
      { days: 7, multiplier: 1.1, energyBonus: 1 },
      { days: 14, multiplier: 1.2, energyBonus: 2 },
      { days: 30, multiplier: 1.35, energyBonus: 3 },
    ] as const,
  },

  /**
   * Achievements System
   */
  achievements: {
    categories: ['games', 'dna', 'breeding', 'collection', 'score', 'streak'] as const,
    tiers: {
      1: { name: 'Bronze', color: '#CD7F32' },
      2: { name: 'Silver', color: '#C0C0C0' },
      3: { name: 'Gold', color: '#FFD700' },
    } as const,
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
      achievementBronze: 50,
      achievementSilver: 100,
      achievementGold: 200,
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
export type AchievementCategory = (typeof ENGAGEMENT_CONFIG.achievements.categories)[number];
export type StreakTier = (typeof ENGAGEMENT_CONFIG.streaks.tiers)[number];

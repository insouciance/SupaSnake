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
   * Streak System
   */
  streaks: {
    gracePeriodDays: 1,
    graceResetDays: 7,
    maxMultiplier: 2.0,
    tiers: [
      { days: 3, multiplier: 1.1, energyBonus: 0 },
      { days: 7, multiplier: 1.25, energyBonus: 1 },
      { days: 14, multiplier: 1.5, energyBonus: 2 },
      { days: 30, multiplier: 2.0, energyBonus: 3 },
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

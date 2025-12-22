/**
 * Achievement Checker Service
 *
 * Compares player stats against achievement thresholds
 * and identifies newly completed achievements.
 */

export interface AchievementDefinition {
  id: string;
  category: 'games' | 'dna' | 'breeding' | 'collection' | 'score' | 'streak';
  name: string;
  description: string;
  tier: number;
  requirement_value: number;
  reward_dna: number;
  reward_energy: number;
}

export interface PlayerStats {
  total_games_played: number;
  total_dna_earned: number;
  high_score: number;
  breeds_completed: number;
  collection_count: number;
  current_streak: number;
}

export interface AchievementCheckResult {
  /** Achievements that were just completed */
  newlyCompleted: AchievementDefinition[];
  /** Updated progress for all achievements */
  progressUpdates: Map<string, number>;
}

/**
 * Get the current progress value for an achievement based on player stats
 */
export function getAchievementProgress(
  achievement: AchievementDefinition,
  stats: PlayerStats
): number {
  switch (achievement.category) {
    case 'games':
      return stats.total_games_played;
    case 'dna':
      return stats.total_dna_earned;
    case 'score':
      return stats.high_score;
    case 'breeding':
      return stats.breeds_completed;
    case 'collection':
      return stats.collection_count;
    case 'streak':
      return stats.current_streak;
    default:
      return 0;
  }
}

/**
 * Check all achievements against current player stats
 *
 * @param stats - Current player statistics
 * @param achievements - All achievement definitions
 * @param existingProgress - Map of achievement_id -> { progress, completed }
 * @returns Newly completed achievements and progress updates
 */
export function checkAchievements(
  stats: PlayerStats,
  achievements: AchievementDefinition[],
  existingProgress: Map<string, { progress: number; completed: boolean }>
): AchievementCheckResult {
  const newlyCompleted: AchievementDefinition[] = [];
  const progressUpdates = new Map<string, number>();

  for (const achievement of achievements) {
    const currentProgress = getAchievementProgress(achievement, stats);
    progressUpdates.set(achievement.id, currentProgress);

    // Check if this achievement was already completed
    const existing = existingProgress.get(achievement.id);
    const wasCompleted = existing?.completed ?? false;

    // Check if now completed
    const isNowCompleted = currentProgress >= achievement.requirement_value;

    // If newly completed (wasn't before, is now)
    if (isNowCompleted && !wasCompleted) {
      newlyCompleted.push(achievement);
    }
  }

  return { newlyCompleted, progressUpdates };
}

/**
 * Calculate total rewards from a list of achievements
 */
export function calculateTotalRewards(achievements: AchievementDefinition[]): {
  totalDna: number;
  totalEnergy: number;
} {
  return achievements.reduce(
    (acc, a) => ({
      totalDna: acc.totalDna + a.reward_dna,
      totalEnergy: acc.totalEnergy + a.reward_energy,
    }),
    { totalDna: 0, totalEnergy: 0 }
  );
}

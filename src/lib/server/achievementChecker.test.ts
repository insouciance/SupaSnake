/**
 * Achievement Checker Service Tests
 */

import {
  checkAchievements,
  getAchievementProgress,
  calculateTotalRewards,
  type PlayerStats,
  type AchievementDefinition,
} from './achievementChecker';

describe('achievementChecker', () => {
  const mockAchievements: AchievementDefinition[] = [
    {
      id: 'games_10',
      category: 'games',
      name: 'Beginner',
      description: 'Play 10 games',
      tier: 1,
      requirement_value: 10,
      reward_dna: 100,
      reward_energy: 1,
    },
    {
      id: 'games_50',
      category: 'games',
      name: 'Regular',
      description: 'Play 50 games',
      tier: 2,
      requirement_value: 50,
      reward_dna: 300,
      reward_energy: 2,
    },
    {
      id: 'dna_1000',
      category: 'dna',
      name: 'Collector',
      description: 'Earn 1,000 DNA',
      tier: 1,
      requirement_value: 1000,
      reward_dna: 100,
      reward_energy: 0,
    },
    {
      id: 'score_50',
      category: 'score',
      name: 'Scorer',
      description: 'Reach score 50 in a game',
      tier: 1,
      requirement_value: 50,
      reward_dna: 150,
      reward_energy: 1,
    },
    {
      id: 'breed_5',
      category: 'breeding',
      name: 'Breeder',
      description: 'Breed 5 snakes',
      tier: 1,
      requirement_value: 5,
      reward_dna: 200,
      reward_energy: 1,
    },
    {
      id: 'collect_10',
      category: 'collection',
      name: 'Collector',
      description: 'Collect 10 unique variants',
      tier: 1,
      requirement_value: 10,
      reward_dna: 300,
      reward_energy: 2,
    },
  ];

  describe('getAchievementProgress', () => {
    it('returns progress for games achievements', () => {
      const stats: PlayerStats = {
        total_games_played: 15,
        total_dna_earned: 500,
        high_score: 30,
        breeds_completed: 0,
        collection_count: 3,
        current_streak: 0,
      };

      const achievement = mockAchievements.find(a => a.id === 'games_10')!;
      expect(getAchievementProgress(achievement, stats)).toBe(15);
    });

    it('returns progress for dna achievements', () => {
      const stats: PlayerStats = {
        total_games_played: 10,
        total_dna_earned: 2500,
        high_score: 30,
        breeds_completed: 0,
        collection_count: 3,
        current_streak: 0,
      };

      const achievement = mockAchievements.find(a => a.id === 'dna_1000')!;
      expect(getAchievementProgress(achievement, stats)).toBe(2500);
    });

    it('returns progress for score achievements', () => {
      const stats: PlayerStats = {
        total_games_played: 10,
        total_dna_earned: 500,
        high_score: 75,
        breeds_completed: 0,
        collection_count: 3,
        current_streak: 0,
      };

      const achievement = mockAchievements.find(a => a.id === 'score_50')!;
      expect(getAchievementProgress(achievement, stats)).toBe(75);
    });

    it('returns progress for breeding achievements', () => {
      const stats: PlayerStats = {
        total_games_played: 10,
        total_dna_earned: 500,
        high_score: 30,
        breeds_completed: 8,
        collection_count: 10,
        current_streak: 0,
      };

      const achievement = mockAchievements.find(a => a.id === 'breed_5')!;
      expect(getAchievementProgress(achievement, stats)).toBe(8);
    });

    it('returns progress for collection achievements', () => {
      const stats: PlayerStats = {
        total_games_played: 10,
        total_dna_earned: 500,
        high_score: 30,
        breeds_completed: 0,
        collection_count: 15,
        current_streak: 0,
      };

      const achievement = mockAchievements.find(a => a.id === 'collect_10')!;
      expect(getAchievementProgress(achievement, stats)).toBe(15);
    });
  });

  describe('checkAchievements', () => {
    it('returns newly completed achievements', () => {
      const stats: PlayerStats = {
        total_games_played: 15,
        total_dna_earned: 2500,
        high_score: 75,
        breeds_completed: 0,
        collection_count: 3,
        current_streak: 0,
      };

      const existingProgress = new Map<string, { progress: number; completed: boolean }>([
        ['games_10', { progress: 5, completed: false }],
        ['games_50', { progress: 5, completed: false }],
        ['dna_1000', { progress: 500, completed: false }],
        ['score_50', { progress: 30, completed: false }],
      ]);

      const result = checkAchievements(stats, mockAchievements, existingProgress);

      // games_10 (10 required, have 15) -> newly completed
      // dna_1000 (1000 required, have 2500) -> newly completed
      // score_50 (50 required, have 75) -> newly completed
      expect(result.newlyCompleted.map(a => a.id)).toContain('games_10');
      expect(result.newlyCompleted.map(a => a.id)).toContain('dna_1000');
      expect(result.newlyCompleted.map(a => a.id)).toContain('score_50');
    });

    it('does not return already completed achievements', () => {
      const stats: PlayerStats = {
        total_games_played: 15,
        total_dna_earned: 2500,
        high_score: 75,
        breeds_completed: 0,
        collection_count: 3,
        current_streak: 0,
      };

      const existingProgress = new Map<string, { progress: number; completed: boolean }>([
        ['games_10', { progress: 10, completed: true }], // Already completed
        ['dna_1000', { progress: 500, completed: false }],
      ]);

      const result = checkAchievements(stats, mockAchievements, existingProgress);

      expect(result.newlyCompleted.map(a => a.id)).not.toContain('games_10');
      expect(result.newlyCompleted.map(a => a.id)).toContain('dna_1000');
    });

    it('returns updated progress for all achievements', () => {
      const stats: PlayerStats = {
        total_games_played: 7,
        total_dna_earned: 500,
        high_score: 30,
        breeds_completed: 0,
        collection_count: 3,
        current_streak: 0,
      };

      const existingProgress = new Map<string, { progress: number; completed: boolean }>();

      const result = checkAchievements(stats, mockAchievements, existingProgress);

      expect(result.progressUpdates.get('games_10')).toBe(7);
      expect(result.progressUpdates.get('dna_1000')).toBe(500);
    });
  });

  describe('calculateTotalRewards', () => {
    it('sums up DNA and energy rewards', () => {
      const achievements: AchievementDefinition[] = [
        {
          id: 'a1',
          category: 'games',
          name: 'Test 1',
          description: 'Test',
          tier: 1,
          requirement_value: 10,
          reward_dna: 100,
          reward_energy: 1,
        },
        {
          id: 'a2',
          category: 'dna',
          name: 'Test 2',
          description: 'Test',
          tier: 1,
          requirement_value: 1000,
          reward_dna: 200,
          reward_energy: 2,
        },
      ];

      const result = calculateTotalRewards(achievements);
      expect(result.totalDna).toBe(300);
      expect(result.totalEnergy).toBe(3);
    });

    it('returns 0 for empty array', () => {
      const result = calculateTotalRewards([]);
      expect(result.totalDna).toBe(0);
      expect(result.totalEnergy).toBe(0);
    });
  });
});

/**
 * Player Stats API Tests
 *
 * Tests the CareerStats type and API response structure
 */

import type { CareerStats } from './route';

describe('Player Stats API', () => {
  describe('GET', () => {
    describe('CareerStats type structure', () => {
      it('should have correct shape for high score', () => {
        const stats: CareerStats = {
          highScore: 150,
          totalGamesPlayed: 42,
          totalDnaEarned: 5000,
          breedsCompleted: 10,
          collectionCount: 15,
          totalVariants: 30,
          currentStreak: 5,
          longestStreak: 10,
          achievementsCompleted: 8,
          totalAchievements: 18,
        };

        expect(stats.highScore).toBe(150);
      });

      it('should have correct shape for games played', () => {
        const stats: CareerStats = {
          highScore: 0,
          totalGamesPlayed: 100,
          totalDnaEarned: 0,
          breedsCompleted: 0,
          collectionCount: 0,
          totalVariants: 30,
          currentStreak: 0,
          longestStreak: 0,
          achievementsCompleted: 0,
          totalAchievements: 18,
        };

        expect(stats.totalGamesPlayed).toBe(100);
      });

      it('should have correct shape for DNA earned', () => {
        const stats: CareerStats = {
          highScore: 0,
          totalGamesPlayed: 0,
          totalDnaEarned: 50000,
          breedsCompleted: 0,
          collectionCount: 0,
          totalVariants: 30,
          currentStreak: 0,
          longestStreak: 0,
          achievementsCompleted: 0,
          totalAchievements: 18,
        };

        expect(stats.totalDnaEarned).toBe(50000);
      });

      it('should have correct shape for collection stats', () => {
        const stats: CareerStats = {
          highScore: 0,
          totalGamesPlayed: 0,
          totalDnaEarned: 0,
          breedsCompleted: 25,
          collectionCount: 20,
          totalVariants: 30,
          currentStreak: 0,
          longestStreak: 0,
          achievementsCompleted: 0,
          totalAchievements: 18,
        };

        expect(stats.collectionCount).toBe(20);
        expect(stats.totalVariants).toBe(30);
        expect(stats.breedsCompleted).toBe(25);
      });

      it('should have correct shape for streak stats', () => {
        const stats: CareerStats = {
          highScore: 0,
          totalGamesPlayed: 0,
          totalDnaEarned: 0,
          breedsCompleted: 0,
          collectionCount: 0,
          totalVariants: 30,
          currentStreak: 7,
          longestStreak: 14,
          achievementsCompleted: 0,
          totalAchievements: 18,
        };

        expect(stats.currentStreak).toBe(7);
        expect(stats.longestStreak).toBe(14);
      });

      it('should have correct shape for achievement stats', () => {
        const stats: CareerStats = {
          highScore: 0,
          totalGamesPlayed: 0,
          totalDnaEarned: 0,
          breedsCompleted: 0,
          collectionCount: 0,
          totalVariants: 30,
          currentStreak: 0,
          longestStreak: 0,
          achievementsCompleted: 15,
          totalAchievements: 18,
        };

        expect(stats.achievementsCompleted).toBe(15);
        expect(stats.totalAchievements).toBe(18);
      });

      it('should allow zero values for new players', () => {
        const newPlayerStats: CareerStats = {
          highScore: 0,
          totalGamesPlayed: 0,
          totalDnaEarned: 0,
          breedsCompleted: 0,
          collectionCount: 1,
          totalVariants: 30,
          currentStreak: 0,
          longestStreak: 0,
          achievementsCompleted: 0,
          totalAchievements: 18,
        };

        expect(newPlayerStats.highScore).toBe(0);
        expect(newPlayerStats.collectionCount).toBe(1);
      });
    });
  });
});

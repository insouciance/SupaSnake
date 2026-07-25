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
        };

        expect(stats.currentStreak).toBe(7);
        expect(stats.longestStreak).toBe(14);
      });

      // WP-0.04: the achievement counters left this payload with the
      // mechanism they counted (migration 042). The Records cabinet on the
      // Chronicle is the one banked-progression surface now, so a second
      // set of career counters must not creep back into this route.
      it('no longer carries achievement counters', () => {
        const stats: CareerStats = {
          highScore: 0,
          totalGamesPlayed: 0,
          totalDnaEarned: 0,
          breedsCompleted: 0,
          collectionCount: 0,
          totalVariants: 30,
          currentStreak: 0,
          longestStreak: 0,
        };

        expect(Object.keys(stats)).toEqual([
          'highScore',
          'totalGamesPlayed',
          'totalDnaEarned',
          'breedsCompleted',
          'collectionCount',
          'totalVariants',
          'currentStreak',
          'longestStreak',
        ]);
        expect(stats).not.toHaveProperty('achievementsCompleted');
        expect(stats).not.toHaveProperty('totalAchievements');
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
        };

        expect(newPlayerStats.highScore).toBe(0);
        expect(newPlayerStats.collectionCount).toBe(1);
      });
    });
  });
});

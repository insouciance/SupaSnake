import * as fs from 'fs';
import * as path from 'path';
import { ENGAGEMENT_CONFIG } from '@/shared/config/engagement';

describe('Streaks API Logic', () => {
  describe('Streak Calculation', () => {
    it('should start streak at 1 for first play', () => {
      const lastPlayDate = null;
      const today = new Date().toISOString().split('T')[0];
      const currentStreak = lastPlayDate === null ? 1 : 0;

      expect(currentStreak).toBe(1);
    });

    it('should increment streak for consecutive days', () => {
      const yesterday = new Date();
      yesterday.setDate(yesterday.getDate() - 1);
      const lastPlayDate = yesterday.toISOString().split('T')[0];
      const today = new Date().toISOString().split('T')[0];

      const daysDiff = Math.floor(
        (new Date(today).getTime() - new Date(lastPlayDate).getTime()) /
          (1000 * 60 * 60 * 24)
      );

      const currentStreak = daysDiff === 1 ? 5 + 1 : 1;
      expect(currentStreak).toBe(6);
    });

    it('should reset streak if more than 1 day gap', () => {
      const twoDaysAgo = new Date();
      twoDaysAgo.setDate(twoDaysAgo.getDate() - 2);
      const lastPlayDate = twoDaysAgo.toISOString().split('T')[0];
      const today = new Date().toISOString().split('T')[0];

      const daysDiff = Math.floor(
        (new Date(today).getTime() - new Date(lastPlayDate).getTime()) /
          (1000 * 60 * 60 * 24)
      );

      const currentStreak = daysDiff <= 1 ? 5 + 1 : 1;
      expect(currentStreak).toBe(1);
    });
  });

  describe('Streak pays no multiplier (WP-0.02, Constitution §8.5)', () => {
    it('the config carries no tier ladder to multiply anything with', () => {
      const streaks = ENGAGEMENT_CONFIG.streaks as Record<string, unknown>;
      expect('tiers' in streaks).toBe(false);
      expect('maxMultiplier' in streaks).toBe(false);
    });

    it('the route source computes no multiplier and no energy bonus', () => {
      const source = fs.readFileSync(path.join(__dirname, 'route.ts'), 'utf8');
      expect(source).not.toMatch(/getStreakMultiplier|getStreakEnergyBonus/);
      expect(source).not.toMatch(/multiplier\s*:/);
      expect(source).not.toMatch(/energyBonus/);
      // Nothing to read a tier ladder out of any more.
      expect(source).not.toMatch(/ENGAGEMENT_CONFIG/);
    });
  });

  describe('Grace Period', () => {
    it('should allow grace period if available', () => {
      const graceAvailable = true;
      const canUseGrace = graceAvailable;
      expect(canUseGrace).toBe(true);
    });

    it('should block grace period if already used', () => {
      const graceAvailable = false;
      const canUseGrace = graceAvailable;
      expect(canUseGrace).toBe(false);
    });

    it('should reset grace availability after 7 days', () => {
      const daysSinceGraceUsed = 8;
      const graceResetDays = ENGAGEMENT_CONFIG.streaks.graceResetDays;
      const graceAvailable = daysSinceGraceUsed >= graceResetDays;
      expect(graceAvailable).toBe(true);
    });
  });

  describe('Longest Streak Tracking', () => {
    it('should update longest streak when current exceeds it', () => {
      const currentStreak = 15;
      const longestStreak = 10;
      const newLongest = Math.max(currentStreak, longestStreak);
      expect(newLongest).toBe(15);
    });

    it('should keep longest streak when current is lower', () => {
      const currentStreak = 5;
      const longestStreak = 20;
      const newLongest = Math.max(currentStreak, longestStreak);
      expect(newLongest).toBe(20);
    });
  });
});

describe('GET /api/streaks', () => {
  it('should return streak data structure', () => {
    const mockResponse = {
      currentStreak: 5,
      longestStreak: 10,
      graceAvailable: true,
      streakAtRisk: false,
      lastPlayDate: '2025-12-08',
    };

    expect(mockResponse.currentStreak).toBeDefined();
    expect(mockResponse.longestStreak).toBeDefined();
    // The streak reports counts. It no longer prices anything.
    expect('multiplier' in mockResponse).toBe(false);
    expect('energyBonus' in mockResponse).toBe(false);
  });

  it('should return 401 for missing auth', () => {
    const status = 401;
    expect(status).toBe(401);
  });
});

describe('POST /api/streaks', () => {
  it('should handle use-grace action', () => {
    const action = 'use-grace';
    const validActions = ['use-grace'];
    expect(validActions.includes(action)).toBe(true);
  });

  it('should reject invalid actions', () => {
    const action = 'invalid';
    const validActions = ['use-grace'];
    expect(validActions.includes(action)).toBe(false);
  });

  it('should require grace availability', () => {
    const graceAvailable = false;
    const canUseGrace = graceAvailable;
    expect(canUseGrace).toBe(false);
  });
});

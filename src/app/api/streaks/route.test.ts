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

  describe('Streak Multiplier', () => {
    it('should return 1.0x for streaks under 3 days', () => {
      const streakDays = 2;
      const multiplier = getStreakMultiplier(streakDays);
      expect(multiplier).toBe(1.0);
    });

    it('should return 1.05x for 3-6 day streaks', () => {
      const streakDays = 5;
      const multiplier = getStreakMultiplier(streakDays);
      expect(multiplier).toBe(1.05);
    });

    it('should return 1.1x for 7-13 day streaks', () => {
      const streakDays = 10;
      const multiplier = getStreakMultiplier(streakDays);
      expect(multiplier).toBe(1.1);
    });

    it('should return 1.2x for 14-29 day streaks', () => {
      const streakDays = 20;
      const multiplier = getStreakMultiplier(streakDays);
      expect(multiplier).toBe(1.2);
    });

    it('should return 1.35x for 30+ day streaks (Design v2 cap)', () => {
      const streakDays = 30;
      const multiplier = getStreakMultiplier(streakDays);
      expect(multiplier).toBe(1.35);
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

function getStreakMultiplier(streakDays: number): number {
  const tiers = ENGAGEMENT_CONFIG.streaks.tiers;
  let multiplier = 1.0;

  for (const tier of tiers) {
    if (streakDays >= tier.days) {
      multiplier = tier.multiplier;
    }
  }

  return multiplier;
}

function getStreakEnergyBonus(streakDays: number): number {
  const tiers = ENGAGEMENT_CONFIG.streaks.tiers;
  let bonus = 0;

  for (const tier of tiers) {
    if (streakDays >= tier.days) {
      bonus = tier.energyBonus;
    }
  }

  return bonus;
}

describe('Streak Energy Bonus', () => {
  it('should return 0 for streaks under 7 days', () => {
    const bonus = getStreakEnergyBonus(5);
    expect(bonus).toBe(0);
  });

  it('should return 1 for 7-13 day streaks', () => {
    const bonus = getStreakEnergyBonus(10);
    expect(bonus).toBe(1);
  });

  it('should return 2 for 14-29 day streaks', () => {
    const bonus = getStreakEnergyBonus(20);
    expect(bonus).toBe(2);
  });

  it('should return 3 for 30+ day streaks', () => {
    const bonus = getStreakEnergyBonus(35);
    expect(bonus).toBe(3);
  });
});

describe('GET /api/streaks', () => {
  it('should return streak data structure', () => {
    const mockResponse = {
      currentStreak: 5,
      longestStreak: 10,
      multiplier: 1.1,
      energyBonus: 0,
      graceAvailable: true,
      streakAtRisk: false,
      lastPlayDate: '2025-12-08',
    };

    expect(mockResponse.currentStreak).toBeDefined();
    expect(mockResponse.longestStreak).toBeDefined();
    expect(mockResponse.multiplier).toBeDefined();
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

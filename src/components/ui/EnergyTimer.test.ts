/**
 * Tests for Energy Timer utilities
 */

import { describe, it, expect } from '@jest/globals';
import { GAME_CONFIG } from '@/shared/config/game';
import {
  calculateTimeUntilNextEnergy,
  formatTimeRemaining,
} from './EnergyTimer';

describe('Energy Timer Utils', () => {
  describe('calculateTimeUntilNextEnergy', () => {
    it('should return 0 when energy is at max', () => {
      const energyRegenAt = new Date(Date.now() + 60000).toISOString(); // 1 minute from now
      const energy = GAME_CONFIG.economy.energy.maxEnergy;
      const result = calculateTimeUntilNextEnergy(energyRegenAt, energy);
      expect(result).toBe(0);
    });

    it('should return remaining ms when energy below max', () => {
      const tenMinutesFromNow = new Date(Date.now() + 10 * 60 * 1000).toISOString();
      const energy = 3; // below max
      const result = calculateTimeUntilNextEnergy(tenMinutesFromNow, energy);

      // Should be approximately 10 minutes remaining
      const expectedRemaining = 10 * 60 * 1000;
      expect(result).toBeGreaterThan(expectedRemaining - 1000);
      expect(result).toBeLessThanOrEqual(expectedRemaining);
    });

    it('should return 0 when regen time has passed', () => {
      const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000).toISOString();
      const energy = 3;
      const result = calculateTimeUntilNextEnergy(fiveMinutesAgo, energy);
      expect(result).toBe(0);
    });

    it('should return 0 when energyRegenAt is null', () => {
      const energy = 3;
      const result = calculateTimeUntilNextEnergy(null, energy);
      expect(result).toBe(0);
    });

    it('should return 0 when energyRegenAt is undefined', () => {
      const energy = 3;
      const result = calculateTimeUntilNextEnergy(undefined, energy);
      expect(result).toBe(0);
    });
  });

  describe('formatTimeRemaining', () => {
    it('should format as MM:SS', () => {
      const fiveMinutes = 5 * 60 * 1000;
      expect(formatTimeRemaining(fiveMinutes)).toBe('5:00');
    });

    it('should handle single digit seconds', () => {
      const fiveMinFiveSec = 5 * 60 * 1000 + 5 * 1000;
      expect(formatTimeRemaining(fiveMinFiveSec)).toBe('5:05');
    });

    it('should return 0:00 for zero or negative', () => {
      expect(formatTimeRemaining(0)).toBe('0:00');
      expect(formatTimeRemaining(-1000)).toBe('0:00');
    });

    it('should handle hours correctly', () => {
      const oneHourThirty = 90 * 60 * 1000;
      expect(formatTimeRemaining(oneHourThirty)).toBe('90:00');
    });
  });
});

describe('Energy Timer Integration', () => {
  it('should respect game config regen rate', () => {
    expect(GAME_CONFIG.economy.energy.regenRateMinutes).toBe(20);
    expect(GAME_CONFIG.economy.energy.regenRateMs).toBe(20 * 60 * 1000);
  });

  it('should enforce max energy cap', () => {
    expect(GAME_CONFIG.economy.energy.maxEnergy).toBe(5);
  });
});

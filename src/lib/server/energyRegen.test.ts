import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import { calculateServerEnergy, calculateNextRegenAfterConsume } from './energyRegen';
import { GAME_CONFIG } from '@/shared/config/game';

const REGEN_RATE_MS = GAME_CONFIG.economy.energy.regenRateMs; // 20 minutes = 1,200,000ms
const MAX_ENERGY = GAME_CONFIG.economy.energy.maxEnergy; // 5

describe('Energy Regeneration', () => {
  let mockNow: number;
  const originalDateNow = Date.now;

  beforeEach(() => {
    mockNow = new Date('2025-01-01T12:00:00Z').getTime();
    Date.now = jest.fn(() => mockNow);
  });

  afterEach(() => {
    Date.now = originalDateNow;
  });

  describe('calculateServerEnergy', () => {
    it('should return max energy with null timer when already at max', () => {
      const result = calculateServerEnergy(5, 5, null, REGEN_RATE_MS);

      expect(result.currentEnergy).toBe(5);
      expect(result.newRegenAt).toBeNull();
      expect(result.energyRegenerated).toBe(0);
    });

    it('should preserve bonus energy above max and not regenerate', () => {
      // Documented behavior: bonus energy (from purchases) may exceed
      // maxEnergy; regen simply does not run while at/above max.
      const result = calculateServerEnergy(10, 5, null, REGEN_RATE_MS);

      expect(result.currentEnergy).toBe(10);
      expect(result.newRegenAt).toBeNull();
      expect(result.energyRegenerated).toBe(0);
    });

    it('should clamp negative energy to zero', () => {
      const result = calculateServerEnergy(-5, 5, null, REGEN_RATE_MS);

      expect(result.currentEnergy).toBe(0);
      expect(result.newRegenAt).not.toBeNull();
      expect(result.energyRegenerated).toBe(0);
    });

    it('should start timer when no regen timestamp exists', () => {
      const result = calculateServerEnergy(3, 5, null, REGEN_RATE_MS);

      expect(result.currentEnergy).toBe(3);
      expect(result.newRegenAt).toEqual(new Date(Date.now() + REGEN_RATE_MS));
      expect(result.energyRegenerated).toBe(0);
    });

    it('should not regenerate when timer is in the future', () => {
      const futureTime = new Date(Date.now() + 600000); // 10 minutes from now
      const result = calculateServerEnergy(3, 5, futureTime, REGEN_RATE_MS);

      expect(result.currentEnergy).toBe(3);
      expect(result.newRegenAt).toEqual(futureTime);
      expect(result.energyRegenerated).toBe(0);
    });

    it('should regenerate 1 energy when timer just passed', () => {
      const pastTime = new Date(Date.now() - 1000); // 1 second ago
      const result = calculateServerEnergy(3, 5, pastTime, REGEN_RATE_MS);

      expect(result.currentEnergy).toBe(4);
      expect(result.energyRegenerated).toBe(1);
      expect(result.newRegenAt).not.toBeNull();
    });

    it('should regenerate multiple energy points for extended time', () => {
      // Timer was 2.5 regen periods ago (50 minutes)
      const pastTime = new Date(Date.now() - (2.5 * REGEN_RATE_MS));
      const result = calculateServerEnergy(2, 5, pastTime, REGEN_RATE_MS);

      // Should have regenerated 3 energy (2.5 periods = 3 points, +1 for passing first timer)
      // Actually: elapsed/rate = 2.5, floor(2.5) = 2, +1 = 3 points
      expect(result.currentEnergy).toBe(5); // 2 + 3 = 5
      expect(result.energyRegenerated).toBe(3);
    });

    it('should cap regeneration at max energy', () => {
      // Timer was 5 regen periods ago (100 minutes)
      const pastTime = new Date(Date.now() - (5 * REGEN_RATE_MS));
      const result = calculateServerEnergy(3, 5, pastTime, REGEN_RATE_MS);

      // Would regenerate 6 but capped at max - current = 5 - 3 = 2
      expect(result.currentEnergy).toBe(5);
      expect(result.energyRegenerated).toBe(2);
      expect(result.newRegenAt).toBeNull(); // At max, no timer needed
    });

    it('should set next regen timer correctly when not at max', () => {
      // Timer was exactly 1 period ago, have 1 energy, max is 5
      // The initial timer passed (1 energy) + 1 complete additional period (1 more) = 2 total
      const pastTime = new Date(Date.now() - REGEN_RATE_MS);
      const result = calculateServerEnergy(1, 5, pastTime, REGEN_RATE_MS);

      expect(result.currentEnergy).toBe(3); // 1 + 2 = 3
      expect(result.energyRegenerated).toBe(2);
      // Next regen should be 2 periods after the original timer (we've consumed 2 periods worth)
      expect(result.newRegenAt).toEqual(new Date(pastTime.getTime() + 2 * REGEN_RATE_MS));
    });

    it('should handle string timestamp input', () => {
      const pastTimeStr = new Date(Date.now() - 1000).toISOString();
      const result = calculateServerEnergy(3, 5, pastTimeStr, REGEN_RATE_MS);

      expect(result.currentEnergy).toBe(4);
      expect(result.energyRegenerated).toBe(1);
    });

    it('should handle exactly 0 energy with regen', () => {
      // Timer was exactly 1 period ago = 2 energy points (initial + 1 complete period)
      const pastTime = new Date(Date.now() - REGEN_RATE_MS);
      const result = calculateServerEnergy(0, 5, pastTime, REGEN_RATE_MS);

      expect(result.currentEnergy).toBe(2);
      expect(result.energyRegenerated).toBe(2);
    });
  });

  describe('calculateNextRegenAfterConsume', () => {
    it('should return null when energy at max after consume', () => {
      const result = calculateNextRegenAfterConsume(5, 5, null, REGEN_RATE_MS);

      expect(result).toBeNull();
    });

    it('should preserve existing future timer', () => {
      const futureTime = new Date(Date.now() + 600000); // 10 minutes from now
      const result = calculateNextRegenAfterConsume(3, 5, futureTime, REGEN_RATE_MS);

      expect(result).toEqual(futureTime);
    });

    it('should preserve existing future timer as string', () => {
      const futureTime = new Date(Date.now() + 600000);
      const result = calculateNextRegenAfterConsume(3, 5, futureTime.toISOString(), REGEN_RATE_MS);

      expect(result).toEqual(futureTime);
    });

    it('should start new timer when no existing timer', () => {
      const result = calculateNextRegenAfterConsume(3, 5, null, REGEN_RATE_MS);

      expect(result).toEqual(new Date(Date.now() + REGEN_RATE_MS));
    });

    it('should start new timer when existing timer is in the past', () => {
      const pastTime = new Date(Date.now() - 60000); // 1 minute ago
      const result = calculateNextRegenAfterConsume(3, 5, pastTime, REGEN_RATE_MS);

      expect(result).toEqual(new Date(Date.now() + REGEN_RATE_MS));
    });

    it('should handle edge case of going from max to below max', () => {
      // User was at max (null timer), consumed energy, now at 4
      const result = calculateNextRegenAfterConsume(4, 5, null, REGEN_RATE_MS);

      expect(result).toEqual(new Date(Date.now() + REGEN_RATE_MS));
    });
  });
});

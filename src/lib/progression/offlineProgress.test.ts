/**
 * Offline Progress Calculation Tests
 * Tests for passive DNA and energy regeneration while offline
 */

import {
  calculateOfflineProgress,
  calculatePassiveDna,
  calculateEnergyRestored,
  formatOfflineDuration,
  type OfflineProgress,
  type OfflineProgressInput,
} from './offlineProgress';
import { ENGAGEMENT_CONFIG } from '@/shared/config/engagement';
import { GAME_CONFIG } from '@/shared/config/game';

describe('calculatePassiveDna', () => {
  const config = ENGAGEMENT_CONFIG.passiveProgress;

  it('calculates DNA based on collection size and hours', () => {
    // 10 snakes * 1 DNA/hour * 2 hours = 20 DNA
    expect(calculatePassiveDna(10, 2, config)).toBe(20);
  });

  it('caps DNA at maxOfflineHours', () => {
    // 10 snakes * 1 DNA/hour * 48 hours = 480, but capped at 24 hours = 240
    expect(calculatePassiveDna(10, 48, config)).toBe(240);
  });

  it('returns 0 for 0 collection size', () => {
    expect(calculatePassiveDna(0, 10, config)).toBe(0);
  });

  it('returns 0 for 0 hours', () => {
    expect(calculatePassiveDna(10, 0, config)).toBe(0);
  });

  it('floors partial hours', () => {
    // 10 snakes * 1 DNA/hour * 1.5 hours = 15 (not 15.0)
    expect(calculatePassiveDna(10, 1.5, config)).toBe(15);
  });

  it('handles negative hours gracefully', () => {
    expect(calculatePassiveDna(10, -5, config)).toBe(0);
  });
});

describe('calculateEnergyRestored', () => {
  const energyConfig = GAME_CONFIG.economy.energy;

  it('calculates energy based on elapsed time', () => {
    // 40 minutes elapsed, 20 min per energy = 2 energy restored
    const elapsedMs = 40 * 60 * 1000;
    expect(calculateEnergyRestored(0, 5, elapsedMs, energyConfig.regenRateMs)).toBe(2);
  });

  it('caps energy at maxEnergy', () => {
    // 200 minutes elapsed = 10 energy, but current is 2, max is 5 = only 3 restored
    const elapsedMs = 200 * 60 * 1000;
    expect(calculateEnergyRestored(2, 5, elapsedMs, energyConfig.regenRateMs)).toBe(3);
  });

  it('returns 0 if already at max energy', () => {
    const elapsedMs = 60 * 60 * 1000;
    expect(calculateEnergyRestored(5, 5, elapsedMs, energyConfig.regenRateMs)).toBe(0);
  });

  it('returns 0 for elapsed time less than regen rate', () => {
    // 10 minutes elapsed, 20 min per energy = 0 energy
    const elapsedMs = 10 * 60 * 1000;
    expect(calculateEnergyRestored(0, 5, elapsedMs, energyConfig.regenRateMs)).toBe(0);
  });

  it('handles negative elapsed time', () => {
    expect(calculateEnergyRestored(0, 5, -1000, energyConfig.regenRateMs)).toBe(0);
  });
});

describe('calculateOfflineProgress', () => {
  const now = Date.now();

  const createInput = (overrides: Partial<OfflineProgressInput> = {}): OfflineProgressInput => ({
    lastLoginAt: new Date(now - 2 * 60 * 60 * 1000).toISOString(), // 2 hours ago
    currentEnergy: 2,
    maxEnergy: 5,
    collectionSize: 10,
    ...overrides,
  });

  it('calculates complete offline progress', () => {
    const input = createInput();
    const result = calculateOfflineProgress(input);

    expect(result.elapsedMs).toBeGreaterThan(0);
    expect(result.elapsedHours).toBeCloseTo(2, 0);
    expect(result.passiveDnaEarned).toBe(20); // 10 snakes * 1 DNA/hr * 2 hrs
    expect(result.energyRestored).toBe(3); // From 2 to max 5 = 3 restored (2 hrs = 6 potential)
    expect(result.shouldShowModal).toBe(true);
    expect(result.hasRewards).toBe(true);
  });

  it('returns shouldShowModal false for short sessions', () => {
    const input = createInput({
      lastLoginAt: new Date(now - 3 * 60 * 1000).toISOString(), // 3 minutes ago
    });
    const result = calculateOfflineProgress(input);

    expect(result.shouldShowModal).toBe(false);
  });

  it('returns hasRewards false when no rewards earned', () => {
    const input = createInput({
      currentEnergy: 5, // Already at max
      collectionSize: 0, // No snakes
      lastLoginAt: new Date(now - 10 * 60 * 1000).toISOString(), // 10 minutes ago
    });
    const result = calculateOfflineProgress(input);

    expect(result.passiveDnaEarned).toBe(0);
    expect(result.energyRestored).toBe(0);
    expect(result.hasRewards).toBe(false);
  });

  it('handles null lastLoginAt', () => {
    const input = createInput({ lastLoginAt: null as unknown as string });
    const result = calculateOfflineProgress(input);

    expect(result.elapsedMs).toBe(0);
    expect(result.shouldShowModal).toBe(false);
    expect(result.hasRewards).toBe(false);
  });

  it('handles future lastLoginAt (clock skew)', () => {
    const input = createInput({
      lastLoginAt: new Date(now + 60 * 1000).toISOString(), // 1 minute in future
    });
    const result = calculateOfflineProgress(input);

    expect(result.elapsedMs).toBe(0);
    expect(result.shouldShowModal).toBe(false);
  });
});

describe('formatOfflineDuration', () => {
  it('formats minutes only', () => {
    expect(formatOfflineDuration(15 * 60 * 1000)).toBe('15 minutes');
  });

  it('formats hours only', () => {
    expect(formatOfflineDuration(2 * 60 * 60 * 1000)).toBe('2 hours');
  });

  it('formats hours and minutes', () => {
    expect(formatOfflineDuration(2.5 * 60 * 60 * 1000)).toBe('2 hours 30 minutes');
  });

  it('formats singular hour', () => {
    expect(formatOfflineDuration(1 * 60 * 60 * 1000)).toBe('1 hour');
  });

  it('formats singular minute', () => {
    expect(formatOfflineDuration(1 * 60 * 1000)).toBe('1 minute');
  });

  it('handles 0 duration', () => {
    expect(formatOfflineDuration(0)).toBe('0 minutes');
  });

  it('caps display at maxOfflineHours', () => {
    // 48 hours should display as 24+ hours
    expect(formatOfflineDuration(48 * 60 * 60 * 1000)).toBe('24+ hours');
  });
});

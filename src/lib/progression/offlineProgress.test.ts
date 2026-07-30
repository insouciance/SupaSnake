/**
 * Offline Progress Calculation Tests
 *
 * Passive-DNA claim only. Energy recovery belongs to its independent,
 * server-time ledger (Constitution §8.6), never this preview/claim module.
 */

import {
  calculateOfflineProgress,
  calculatePassiveDna,
  formatOfflineDuration,
  type OfflineProgress,
  type OfflineProgressInput,
} from './offlineProgress';
import { ENGAGEMENT_CONFIG } from '@/shared/config/engagement';

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

describe('energy restoration is gone (GT §9.1, §9.2)', () => {
  it('exports no energy-restore calculator', async () => {
    // This module was a client-side mirror of the server drip. Keeping the
    // export alive - even unused - invites a caller and re-creates the
    // second clock that GT §9.2 recorded.
    const mod = await import('./offlineProgress');
    expect('calculateEnergyRestored' in mod).toBe(false);
  });

  it('reports no energyRestored on its result', () => {
    const result = calculateOfflineProgress({
      lastLoginAt: new Date(Date.now() - 6 * 60 * 60 * 1000).toISOString(),
      collectionSize: 10,
    });
    expect('energyRestored' in result).toBe(false);
  });

  it('needs no energy state as input, so it cannot clamp one', () => {
    // The GT §9.1 destruction bug required the caller to hand this module
    // the player's current and maximum energy. It no longer accepts either.
    const input = {
      lastLoginAt: new Date(Date.now() - 6 * 60 * 60 * 1000).toISOString(),
      collectionSize: 10,
    };
    expect(Object.keys(input).sort()).toEqual(['collectionSize', 'lastLoginAt']);
    expect(() => calculateOfflineProgress(input)).not.toThrow();
  });
});

describe('calculateOfflineProgress', () => {
  const now = Date.now();

  const createInput = (overrides: Partial<OfflineProgressInput> = {}): OfflineProgressInput => ({
    lastLoginAt: new Date(now - 2 * 60 * 60 * 1000).toISOString(), // 2 hours ago
    collectionSize: 10,
    ...overrides,
  });

  it('calculates complete offline progress', () => {
    const input = createInput();
    const result = calculateOfflineProgress(input);

    expect(result.elapsedMs).toBeGreaterThan(0);
    expect(result.elapsedHours).toBeCloseTo(2, 0);
    expect(result.passiveDnaEarned).toBe(20); // 10 snakes * 1 DNA/hr * 2 hrs
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
      collectionSize: 0, // No snakes
      lastLoginAt: new Date(now - 10 * 60 * 1000).toISOString(), // 10 minutes ago
    });
    const result = calculateOfflineProgress(input);

    // DNA is now the only reward, so hasRewards tracks it alone.
    expect(result.passiveDnaEarned).toBe(0);
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

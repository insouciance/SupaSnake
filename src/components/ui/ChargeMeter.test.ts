/**
 * Tests for the ChargeMeter's display utilities.
 *
 * Energy now recovers per point, so this pins the visible next-tick clock.
 */

import { describe, it, expect } from '@jest/globals';
import { GAME_CONFIG } from '@/shared/config/game';
import { formatRefillCountdown, timeUntilRefill } from './ChargeMeter';

describe('timeUntilRefill', () => {
  it('returns the remaining milliseconds until the next recovery', () => {
    const now = Date.parse('2026-07-25T12:00:00Z');
    expect(timeUntilRefill('2026-07-26T00:00:00.000Z', now)).toBe(12 * 3600_000);
  });

  it('returns 0 once the recovery time has passed', () => {
    const now = Date.parse('2026-07-26T00:00:01Z');
    expect(timeUntilRefill('2026-07-26T00:00:00.000Z', now)).toBe(0);
  });

  it('returns 0 for a missing or unparseable timestamp', () => {
    expect(timeUntilRefill(null)).toBe(0);
    expect(timeUntilRefill(undefined)).toBe(0);
    expect(timeUntilRefill('not a date')).toBe(0);
  });
});

describe('formatRefillCountdown', () => {
  it('formats a multi-hour wait in hours and minutes', () => {
    expect(formatRefillCountdown(12 * 3600_000)).toBe('12h 0m');
    expect(formatRefillCountdown(90 * 60_000)).toBe('1h 30m');
  });

  it('formats a sub-hour wait in minutes and seconds', () => {
    expect(formatRefillCountdown(45 * 60_000)).toBe('45m 0s');
    expect(formatRefillCountdown(60_000)).toBe('1m 0s');
  });

  it('shows the final seconds at the boundary', () => {
    expect(formatRefillCountdown(0)).toBe('0s');
    expect(formatRefillCountdown(30_000)).toBe('30s');
  });

  it('can express a full day, which the old M:SS format could not', () => {
    expect(formatRefillCountdown(24 * 3600_000)).toBe('24h 0m');
  });
});

describe('ChargeMeter integration with game config', () => {
  it('draws one pill per stored Energy', () => {
    expect(GAME_CONFIG.economy.energy.capacity).toBe(6);
  });

  it('renders the centralized hourly cadence', () => {
    expect(GAME_CONFIG.economy.energy.recoveryIntervalSeconds).toBe(3600);
  });
});

/**
 * Tests for the ChargeMeter's display utilities.
 *
 * Replaces the EnergyTimer tests, which asserted a per-point regeneration
 * countdown (`calculateTimeUntilNextEnergy`) and an `M:SS` format. There is
 * no per-point regeneration to count down any more - only the daily reset,
 * which can be up to 24 hours away and is therefore formatted in hours.
 */

import { describe, it, expect } from '@jest/globals';
import { GAME_CONFIG } from '@/shared/config/game';
import { formatRefillCountdown, timeUntilRefill } from './ChargeMeter';

describe('timeUntilRefill', () => {
  it('returns the remaining milliseconds until the reset', () => {
    const now = Date.parse('2026-07-25T12:00:00Z');
    expect(timeUntilRefill('2026-07-26T00:00:00.000Z', now)).toBe(12 * 3600_000);
  });

  it('returns 0 once the reset has passed', () => {
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

  it('formats a sub-hour wait in minutes', () => {
    expect(formatRefillCountdown(45 * 60_000)).toBe('45m');
    expect(formatRefillCountdown(60_000)).toBe('1m');
  });

  it('avoids a bare "0m" at the boundary', () => {
    expect(formatRefillCountdown(0)).toBe('less than a minute');
    expect(formatRefillCountdown(30_000)).toBe('less than a minute');
  });

  it('can express a full day, which the old M:SS format could not', () => {
    expect(formatRefillCountdown(24 * 3600_000)).toBe('24h 0m');
  });
});

describe('ChargeMeter integration with game config', () => {
  it('draws one pill per daily charge', () => {
    expect(GAME_CONFIG.economy.energy.chargesPerDay).toBe(6);
  });

  it('has no regeneration rate or cap to render', () => {
    const energy = GAME_CONFIG.economy.energy as Record<string, unknown>;
    expect(energy.regenRateMinutes).toBeUndefined();
    expect(energy.maxEnergy).toBeUndefined();
  });
});

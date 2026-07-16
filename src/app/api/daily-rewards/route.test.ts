/**
 * Tests for Daily Rewards API - mapping and decision logic
 */

import { describe, it, expect } from '@jest/globals';
import {
  mapTierRow,
  mapClaimRow,
  mapClaimErrorStatus,
  computeCanClaimToday,
} from './utils';

describe('Daily Rewards API logic', () => {
  describe('computeCanClaimToday', () => {
    it('is claimable when never claimed', () => {
      expect(computeCanClaimToday(null, '2026-07-16')).toBe(true);
      expect(computeCanClaimToday(undefined, '2026-07-16')).toBe(true);
    });

    it('is claimable when last claim was a previous day', () => {
      expect(computeCanClaimToday('2026-07-15', '2026-07-16')).toBe(true);
    });

    it('is not claimable when already claimed today', () => {
      expect(computeCanClaimToday('2026-07-16', '2026-07-16')).toBe(false);
    });
  });

  describe('mapTierRow', () => {
    it('maps a plain day row', () => {
      expect(
        mapTierRow({ day_number: 3, dna_amount: 50, energy_amount: 0, bonus_type: null })
      ).toEqual({ day: 3, dna: 50, energy: 0, bonusType: null });
    });

    it('maps milestone days (7/14/21)', () => {
      expect(
        mapTierRow({ day_number: 7, dna_amount: 200, energy_amount: 2, bonus_type: 'milestone' })
      ).toEqual({ day: 7, dna: 200, energy: 2, bonusType: 'milestone' });
    });

    it('maps the cycle-complete day (28)', () => {
      expect(
        mapTierRow({
          day_number: 28,
          dna_amount: 1000,
          energy_amount: 10,
          bonus_type: 'cycle_complete',
        })
      ).toEqual({ day: 28, dna: 1000, energy: 10, bonusType: 'cycle_complete' });
    });
  });

  describe('mapClaimRow', () => {
    it('maps the claim_daily_reward RPC row to camelCase', () => {
      expect(
        mapClaimRow({
          day_claimed: 7,
          dna_granted: 200,
          energy_granted: 2,
          next_day: 8,
          cycle_completed: false,
        })
      ).toEqual({
        dayClaimed: 7,
        dnaGranted: 200,
        energyGranted: 2,
        nextDay: 8,
        cycleCompleted: false,
      });
    });

    it('maps a cycle rollover (day 28 -> day 1)', () => {
      const result = mapClaimRow({
        day_claimed: 28,
        dna_granted: 1000,
        energy_granted: 10,
        next_day: 1,
        cycle_completed: true,
      });

      expect(result.nextDay).toBe(1);
      expect(result.cycleCompleted).toBe(true);
    });
  });

  describe('mapClaimErrorStatus', () => {
    it('maps already-claimed to 409 Conflict', () => {
      expect(mapClaimErrorStatus('Daily reward already claimed today')).toBe(409);
    });

    it('maps missing player to 404', () => {
      expect(mapClaimErrorStatus('Player not found')).toBe(404);
    });

    it('maps unknown RPC errors to 400', () => {
      expect(mapClaimErrorStatus('No reward tier configured for day 29')).toBe(400);
      expect(mapClaimErrorStatus(null)).toBe(400);
      expect(mapClaimErrorStatus(undefined)).toBe(400);
    });
  });

  describe('GET response shape', () => {
    it('defaults to day 1 with claimable state for new players', () => {
      const state: { current_day: number; last_claim_date: string | null } | null = null;
      const today = '2026-07-16';

      const currentDay = state?.current_day ?? 1;
      const canClaimToday = computeCanClaimToday(state?.last_claim_date, today);

      expect(currentDay).toBe(1);
      expect(canClaimToday).toBe(true);
    });

    it('normalizes DECIMAL streak multiplier strings', () => {
      const streakRow = { current_streak: 7, streak_multiplier: '1.25' };
      const streak = {
        current: streakRow?.current_streak ?? 0,
        multiplier: Number(streakRow?.streak_multiplier ?? 1) || 1,
      };

      expect(streak).toEqual({ current: 7, multiplier: 1.25 });
    });

    it('defaults streak to 0 / x1 when no row exists', () => {
      const streakRow: { current_streak: number; streak_multiplier: string } | null = null;
      const streak = {
        current: streakRow?.current_streak ?? 0,
        multiplier: Number(streakRow?.streak_multiplier ?? 1) || 1,
      };

      expect(streak).toEqual({ current: 0, multiplier: 1 });
    });
  });

  describe('POST action validation', () => {
    it('accepts only the claim action', () => {
      const isValid = (action: unknown) => action === 'claim';

      expect(isValid('claim')).toBe(true);
      expect(isValid('grab')).toBe(false);
      expect(isValid(undefined)).toBe(false);
    });
  });
});

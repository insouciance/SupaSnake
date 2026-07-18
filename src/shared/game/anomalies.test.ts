/**
 * Weekly Anomaly boards (Design v2 section 7.2) - definitions, [E]/[P]
 * taxonomy, and the deterministic ISO-week rotation the SQL mirror
 * (anomaly_for_week, migration 021) must agree with.
 */

import { describe, expect, it } from '@jest/globals';
import {
  ANOMALIES,
  ANOMALY_ECONOMICS,
  ANOMALY_EPOCH_UTC,
  ANOMALY_PHYSICS,
  ANOMALY_ROTATION,
  anomalyBankOverride,
  anomalyFoodValueModifier,
  anomalyForWeek,
  anomalyWeekEnd,
  anomalyWeekStart,
  isAnomalyId,
} from '@/shared/game/anomalies';
import { gauntletWeekStart } from '@/shared/game/gauntlet';

describe('the four launch anomalies (section 7.2)', () => {
  it('defines exactly the doc pool, in rotation order', () => {
    expect(ANOMALY_ROTATION).toEqual([
      'meteor_shower',
      'gold_rush',
      'blackout',
      'twin_exits',
    ]);
    expect(Object.keys(ANOMALIES).sort()).toEqual(
      [...ANOMALY_ROTATION].sort()
    );
  });

  it('carries the doc numbers: 60-tick despawn, x1.5 food, +6 portal interval, radius 6, x1.15 bank', () => {
    expect(ANOMALY_PHYSICS.meteorShowerFoodDespawnTicks).toBe(60);
    expect(ANOMALY_ECONOMICS.goldRushFoodMultiplier).toBe(1.5);
    expect(ANOMALY_PHYSICS.goldRushPortalIntervalPenalty).toBe(6);
    expect(ANOMALY_PHYSICS.blackoutVisibilityRadius).toBe(6);
    expect(ANOMALY_ECONOMICS.twinExitsBankMultiplier).toBe(1.15);
    expect(ANOMALY_PHYSICS.twinExitsPortalCount).toBe(2);
  });

  it('taxonomy: Gold Rush food and Twin Exits bank are [E]; Meteor/Blackout are [P]', () => {
    expect(ANOMALIES.gold_rush.kind).toBe('EP');
    expect(ANOMALIES.twin_exits.kind).toBe('EP');
    expect(ANOMALIES.meteor_shower.kind).toBe('P');
    expect(ANOMALIES.blackout.kind).toBe('P');
  });

  it('isAnomalyId guards the id set', () => {
    expect(isAnomalyId('gold_rush')).toBe(true);
    expect(isAnomalyId('mirror_wager')).toBe(false);
    expect(isAnomalyId(null)).toBe(false);
  });
});

describe('[E] hooks (exact server recompute)', () => {
  it('only Gold Rush modifies food value - x1.5 on every food', () => {
    for (const n of [1, 25, 100]) {
      expect(anomalyFoodValueModifier('gold_rush', n)).toBe(1.5);
      expect(anomalyFoodValueModifier('meteor_shower', n)).toBe(1);
      expect(anomalyFoodValueModifier('blackout', n)).toBe(1);
      expect(anomalyFoodValueModifier('twin_exits', n)).toBe(1);
      expect(anomalyFoodValueModifier(null, n)).toBe(1);
    }
  });

  it('only Twin Exits overrides the base bank - x1.15', () => {
    expect(anomalyBankOverride('twin_exits')).toBe(1.15);
    expect(anomalyBankOverride('gold_rush')).toBeNull();
    expect(anomalyBankOverride('meteor_shower')).toBeNull();
    expect(anomalyBankOverride('blackout')).toBeNull();
    expect(anomalyBankOverride(null)).toBeNull();
  });
});

describe('rotation: deterministic function of the ISO week', () => {
  it('epoch is a Monday 00:00 UTC (2024-01-01)', () => {
    const epoch = new Date(ANOMALY_EPOCH_UTC);
    expect(epoch.toISOString()).toBe('2024-01-01T00:00:00.000Z');
    expect(epoch.getUTCDay()).toBe(1); // Monday
  });

  it('week boundaries agree with the Gauntlet week (Monday 00:00 UTC)', () => {
    for (const at of [
      new Date(Date.UTC(2026, 6, 15, 9)),
      new Date(Date.UTC(2026, 6, 19, 23, 59)),
      new Date(Date.UTC(2026, 6, 20, 0)),
    ]) {
      expect(anomalyWeekStart(at).toISOString()).toBe(
        gauntletWeekStart(at).toISOString()
      );
    }
    const week = anomalyWeekStart(new Date(Date.UTC(2026, 6, 15)));
    expect(anomalyWeekEnd(week).toISOString()).toBe('2026-07-20T00:00:00.000Z');
  });

  it('rotates through the 4-anomaly pool week by week from the epoch', () => {
    // Epoch week 0 = meteor_shower, then gold_rush, blackout, twin_exits
    expect(anomalyForWeek(new Date(Date.UTC(2024, 0, 1)))).toBe('meteor_shower');
    expect(anomalyForWeek(new Date(Date.UTC(2024, 0, 8)))).toBe('gold_rush');
    expect(anomalyForWeek(new Date(Date.UTC(2024, 0, 15)))).toBe('blackout');
    expect(anomalyForWeek(new Date(Date.UTC(2024, 0, 22)))).toBe('twin_exits');
    expect(anomalyForWeek(new Date(Date.UTC(2024, 0, 29)))).toBe('meteor_shower');
  });

  it('is stable within a week and has period 4 across any horizon', () => {
    const monday = new Date(Date.UTC(2026, 6, 20));
    const sunday = new Date(Date.UTC(2026, 6, 26, 23, 59, 59));
    expect(anomalyForWeek(monday)).toBe(anomalyForWeek(sunday));

    for (let w = 0; w < 12; w++) {
      const at = new Date(monday.getTime() + w * 7 * 86_400_000);
      const later = new Date(at.getTime() + 4 * 7 * 86_400_000);
      expect(anomalyForWeek(later)).toBe(anomalyForWeek(at));
    }
  });

  it('handles dates before the epoch without going negative', () => {
    expect(
      ANOMALY_ROTATION.includes(anomalyForWeek(new Date(Date.UTC(2023, 5, 7))))
    ).toBe(true);
  });
});

/**
 * Tests for Clan Duel ELO helper - mirrors SQL math in 011_clan_duels.sql
 */

import {
  ELO_K,
  STARTING_RATING,
  expectedScore,
  ratingDeltaForWin,
  projectedRatingChange,
} from './elo';

describe('elo constants', () => {
  it('uses K=32 and 1000 starting rating per locked design', () => {
    expect(ELO_K).toBe(32);
    expect(STARTING_RATING).toBe(1000);
  });
});

describe('expectedScore', () => {
  it('is 0.5 for equal ratings', () => {
    expect(expectedScore(1000, 1000)).toBeCloseTo(0.5);
  });

  it('sums to 1 for both sides', () => {
    expect(expectedScore(1100, 900) + expectedScore(900, 1100)).toBeCloseTo(1);
  });

  it('is ~0.64 for a +100 rating advantage (standard ELO table)', () => {
    expect(expectedScore(1100, 1000)).toBeCloseTo(0.6401, 3);
  });

  it('is ~0.909 for a +400 rating advantage', () => {
    expect(expectedScore(1400, 1000)).toBeCloseTo(10 / 11, 4);
  });
});

describe('ratingDeltaForWin', () => {
  it('transfers K/2 = 16 points between equally rated clans', () => {
    expect(ratingDeltaForWin(1000, 1000)).toBe(16);
  });

  it('gives the underdog a bigger win', () => {
    const underdogWin = ratingDeltaForWin(900, 1100);
    const favoriteWin = ratingDeltaForWin(1100, 900);
    expect(underdogWin).toBeGreaterThan(favoriteWin);
    // +200 gap: expected(favorite) ~ 0.7597 -> underdog win = round(32*0.7597) = 24
    expect(underdogWin).toBe(24);
    expect(favoriteWin).toBe(8);
  });

  it('never transfers more than K or less than 0', () => {
    expect(ratingDeltaForWin(0, 4000)).toBeLessThanOrEqual(ELO_K);
    expect(ratingDeltaForWin(4000, 0)).toBeGreaterThanOrEqual(0);
  });

  it('rounds like SQL ROUND (half up for positive values)', () => {
    // expected(1000 vs 1050) = 1/(1+10^(50/400)) ~ 0.4285 -> 32*0.5715 ~ 18.29 -> 18
    expect(ratingDeltaForWin(1000, 1050)).toBe(18);
  });
});

describe('projectedRatingChange', () => {
  it('is symmetric +16/-16 for equal ratings', () => {
    expect(projectedRatingChange(1000, 1000)).toEqual({ win: 16, loss: -16, tie: 0 });
  });

  it('projects small win / big loss for the favorite', () => {
    const projection = projectedRatingChange(1100, 900);
    expect(projection.win).toBe(8);
    expect(projection.loss).toBe(-24);
    expect(projection.tie).toBe(0);
  });

  it('projects big win / small loss for the underdog', () => {
    const projection = projectedRatingChange(900, 1100);
    expect(projection.win).toBe(24);
    expect(projection.loss).toBe(-8);
  });
});

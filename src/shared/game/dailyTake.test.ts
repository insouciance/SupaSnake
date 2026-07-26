/**
 * The Daily Take's arithmetic (Constitution §7.2, Rule 5, Rule 6).
 *
 * WP-1.04's acceptance criteria in executable form: the tier ladder at every
 * boundary, cooling that drops exactly one rung and never reaches zero once a
 * Take has been collected, and the 00:00 UTC day boundary.
 */

import {
  advanceTakeStreak,
  isTakeAvailable,
  MAX_TAKE_TIER,
  normalizeTakeState,
  previewDailyTake,
  TAKE_BASE_DNA,
  TAKE_TIER_MULTIPLIERS,
  TAKE_TIER_THRESHOLDS,
  takeAmountForTier,
  takeDayGap,
  takeDayKey,
  takeMultiplierForTier,
  takeTierForStreak,
  type TakeStreakState,
} from './dailyTake';

const at = (iso: string) => new Date(iso);

/** A chain of `days` days whose last collect was on `lastClaimDate`. */
function chain(days: number, lastClaimDate: string, longest = days): TakeStreakState {
  return normalizeTakeState({ streakDays: days, longestStreak: longest, lastClaimDate });
}

describe('the §7.2 ladder', () => {
  it('is 3 / 7 / 14 / 30 days → ×1.25 / ×1.5 / ×2 / ×3', () => {
    expect(TAKE_TIER_THRESHOLDS).toEqual([0, 3, 7, 14, 30]);
    expect(TAKE_TIER_MULTIPLIERS).toEqual([1, 1.25, 1.5, 2, 3]);
    expect(TAKE_BASE_DNA).toBe(100);
    expect(MAX_TAKE_TIER).toBe(4);
  });

  it.each([
    [0, 0],
    [1, 0],
    [2, 0], // below the first tier: base Take, ×1
    [3, 1], // the boundary itself earns the tier
    [4, 1],
    [6, 1],
    [7, 2],
    [13, 2],
    [14, 3],
    [29, 3],
    [30, 4],
    [365, 4], // the ladder tops out; it does not keep climbing
  ])('a %i-day chain sits at tier %i', (days, tier) => {
    expect(takeTierForStreak(days)).toBe(tier);
  });

  it.each([
    [0, 1, 100],
    [1, 1.25, 125],
    [2, 1.5, 150],
    [3, 2, 200],
    [4, 3, 300],
  ])('tier %i pays ×%s = %i DNA', (tier, multiplier, amount) => {
    expect(takeMultiplierForTier(tier)).toBe(multiplier);
    expect(takeAmountForTier(tier)).toBe(amount);
  });

  it('never pays more than ×3 for a tier outside the ladder', () => {
    expect(takeMultiplierForTier(9)).toBe(1);
    expect(takeMultiplierForTier(-1)).toBe(1);
    expect(takeAmountForTier(9)).toBe(TAKE_BASE_DNA);
  });

  it('multiplies the base and nothing else — the amount is a pure function of the tier', () => {
    // The signature is the guarantee: there is no argument here through which
    // a run's fold, its Yield or a balance could enter the multiplication.
    expect(takeAmountForTier.length).toBe(1);
    for (let tier = 0; tier <= MAX_TAKE_TIER; tier += 1) {
      expect(takeAmountForTier(tier)).toBe(
        Math.floor(TAKE_BASE_DNA * TAKE_TIER_MULTIPLIERS[tier])
      );
    }
  });
});

describe('growing the chain', () => {
  it('starts a first-ever Take at one day, tier 0, ×1', () => {
    const advance = advanceTakeStreak(
      { streakDays: 0, tier: 0, longestStreak: 0, lastClaimDate: null },
      at('2026-07-26T09:00:00Z')
    );
    expect(advance.alreadyCollected).toBe(false);
    expect(advance.cooled).toBe(false);
    expect(advance.amount).toBe(100);
    expect(advance.next).toEqual({
      streakDays: 1,
      tier: 0,
      longestStreak: 1,
      lastClaimDate: '2026-07-26',
    });
  });

  it('grows by one on a consecutive day and crosses the tier at day 3', () => {
    const day2 = advanceTakeStreak(chain(1, '2026-07-24'), at('2026-07-25T00:00:01Z'));
    expect(day2.next.streakDays).toBe(2);
    expect(day2.amount).toBe(100);

    const day3 = advanceTakeStreak(day2.next, at('2026-07-26T23:59:59Z'));
    expect(day3.next.streakDays).toBe(3);
    expect(day3.next.tier).toBe(1);
    expect(day3.amount).toBe(125);
  });

  it.each([
    [2, '2026-07-25', 3, 1, 125],
    [6, '2026-07-25', 7, 2, 150],
    [13, '2026-07-25', 14, 3, 200],
    [29, '2026-07-25', 30, 4, 300],
  ])(
    'a %i-day chain collected the next day becomes %i days, tier %i, %i DNA',
    (before, last, after, tier, amount) => {
      const advance = advanceTakeStreak(chain(before, last), at('2026-07-26T12:00:00Z'));
      expect(advance.next.streakDays).toBe(after);
      expect(advance.next.tier).toBe(tier);
      expect(advance.amount).toBe(amount);
    }
  );

  it('raises the Rule 6 high-water mark and never lowers it', () => {
    const advance = advanceTakeStreak(chain(4, '2026-07-25', 31), at('2026-07-26T12:00:00Z'));
    expect(advance.next.streakDays).toBe(5);
    expect(advance.next.longestStreak).toBe(31);
  });
});

describe('cooling — one tier, never zero (Rule 5)', () => {
  it.each([
    // [days before, tier before, days after, tier after, DNA paid]
    [30, 4, 14, 3, 200],
    [45, 4, 14, 3, 200],
    [14, 3, 7, 2, 150],
    [20, 3, 7, 2, 150],
    [7, 2, 3, 1, 125],
    [9, 2, 3, 1, 125],
    [3, 1, 1, 0, 100],
    [5, 1, 1, 0, 100],
    [1, 0, 1, 0, 100],
    [2, 0, 1, 0, 100],
  ])(
    'a %i-day chain at tier %i cools to %i days / tier %i and pays %i',
    (days, tierBefore, daysAfter, tierAfter, amount) => {
      const before = chain(days, '2026-07-20');
      expect(before.tier).toBe(tierBefore);
      // Two days later: 21 July was missed.
      const advance = advanceTakeStreak(before, at('2026-07-22T06:00:00Z'));
      expect(advance.cooled).toBe(true);
      expect(advance.next.tier).toBe(tierAfter);
      expect(advance.next.streakDays).toBe(daysAfter);
      expect(advance.amount).toBe(amount);
    }
  );

  it('drops exactly ONE tier however long the absence was (§7.1: "one streak tier")', () => {
    const before = chain(30, '2026-01-01');
    for (const gapDays of [2, 3, 10, 90, 400]) {
      const now = new Date(Date.parse('2026-01-01T00:00:00Z') + gapDays * 86_400_000);
      const advance = advanceTakeStreak(before, now);
      expect(advance.next.tier).toBe(before.tier - 1);
    }
  });

  it('never reaches zero once a Take has ever been collected, however many misses', () => {
    let state = chain(30, '2026-01-01');
    let day = Date.parse('2026-01-01T00:00:00Z');
    // Fifty separate absences, each two days long.
    for (let round = 0; round < 50; round += 1) {
      day += 2 * 86_400_000;
      const advance = advanceTakeStreak(state, new Date(day));
      state = advance.next;
      expect(state.streakDays).toBeGreaterThanOrEqual(1);
      expect(state.tier).toBeGreaterThanOrEqual(0);
      expect(state.lastClaimDate).not.toBeNull();
      // Migration 041's CHECK, asserted on every intermediate state.
      expect(state.streakDays).toBeGreaterThanOrEqual(TAKE_TIER_THRESHOLDS[state.tier]);
      expect((state.lastClaimDate === null) === (state.streakDays === 0)).toBe(true);
      expect(state.longestStreak).toBeGreaterThanOrEqual(state.streakDays);
    }
    // The floor is one day at tier 0 — a base Take, forever available.
    expect(state.streakDays).toBe(1);
    expect(state.tier).toBe(0);
    expect(state.longestStreak).toBe(30);
  });

  it('leaves every transition satisfying migration 041 for a long mixed history', () => {
    let state: TakeStreakState = normalizeTakeState({ lastClaimDate: null });
    let day = Date.parse('2026-03-01T00:00:00Z');
    // A deterministic pattern of hits and misses across 120 days.
    for (let index = 0; index < 120; index += 1) {
      day += (index % 7 === 5 ? 3 : 1) * 86_400_000;
      state = advanceTakeStreak(state, new Date(day)).next;
      expect(state.tier).toBeGreaterThanOrEqual(0);
      expect(state.tier).toBeLessThanOrEqual(MAX_TAKE_TIER);
      expect(state.streakDays).toBeGreaterThanOrEqual(TAKE_TIER_THRESHOLDS[state.tier]);
      expect((state.lastClaimDate === null) === (state.streakDays === 0)).toBe(true);
      expect(state.longestStreak).toBeGreaterThanOrEqual(state.streakDays);
    }
  });
});

describe('the day boundary is 00:00 UTC (§7.1)', () => {
  it('reads the UTC date, not the local one', () => {
    expect(takeDayKey(at('2026-07-26T00:00:00Z'))).toBe('2026-07-26');
    expect(takeDayKey(at('2026-07-26T23:59:59.999Z'))).toBe('2026-07-26');
    expect(takeDayKey(at('2026-07-27T00:00:00Z'))).toBe('2026-07-27');
  });

  it('counts whole days across a month and a year boundary', () => {
    expect(takeDayGap('2026-07-31', '2026-08-01')).toBe(1);
    expect(takeDayGap('2026-12-31', '2027-01-01')).toBe(1);
    expect(takeDayGap('2026-07-26', '2026-07-26')).toBe(0);
    expect(takeDayGap('2026-07-26', '2026-07-24')).toBe(-2);
  });

  it('offers the Take only until it is collected, and again after 00:00 UTC', () => {
    const justBefore = at('2026-07-26T23:59:59.999Z');
    const justAfter = at('2026-07-27T00:00:00.000Z');

    expect(isTakeAvailable(null, justBefore)).toBe(true);
    expect(isTakeAvailable('2026-07-26', justBefore)).toBe(false);
    expect(isTakeAvailable('2026-07-26', justAfter)).toBe(true);
  });

  it('treats a same-day second collect as already collected, whatever the hour', () => {
    const state = chain(4, '2026-07-26');
    for (const hour of ['00:00:00', '05:30:00', '12:00:00', '23:59:59']) {
      const advance = advanceTakeStreak(state, at(`2026-07-26T${hour}Z`));
      expect(advance.alreadyCollected).toBe(true);
      expect(advance.amount).toBe(0);
      expect(advance.next).toEqual(state);
    }
  });

  it('grants nothing when the stored claim date is in the future (clock skew)', () => {
    const advance = advanceTakeStreak(chain(4, '2026-08-01'), at('2026-07-26T12:00:00Z'));
    expect(advance.alreadyCollected).toBe(true);
    expect(advance.amount).toBe(0);
  });
});

describe('normalisation refuses states migration 041 forbids', () => {
  it('re-derives a tier that was stored above what the days earned', () => {
    const state = normalizeTakeState({
      streakDays: 2,
      tier: 4,
      longestStreak: 2,
      lastClaimDate: '2026-07-25',
    });
    expect(state.tier).toBe(0);
  });

  it('pairs a claim date with at least one day, and no claim date with none', () => {
    expect(normalizeTakeState({ streakDays: 0, lastClaimDate: '2026-07-25' }).streakDays).toBe(1);
    expect(normalizeTakeState({ streakDays: 9, lastClaimDate: null }).streakDays).toBe(0);
  });

  it('lifts the high-water mark to at least the current chain', () => {
    expect(
      normalizeTakeState({ streakDays: 9, longestStreak: 2, lastClaimDate: '2026-07-25' })
        .longestStreak
    ).toBe(9);
  });
});

describe('previewDailyTake', () => {
  it('shows what the next collect would pay', () => {
    expect(previewDailyTake(chain(2, '2026-07-25'), at('2026-07-26T12:00:00Z'))).toEqual({
      amount: 125,
      multiplier: 1.25,
      streakDays: 3,
      tier: 1,
    });
  });

  it('shows nothing left to pay once today is collected', () => {
    expect(previewDailyTake(chain(3, '2026-07-26'), at('2026-07-26T12:00:00Z'))).toEqual({
      amount: 0,
      multiplier: 1.25,
      streakDays: 3,
      tier: 1,
    });
  });
});

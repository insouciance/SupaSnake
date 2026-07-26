/**
 * The Ascension fold (Constitution §6.1, §7.1, §12.2).
 *
 * The month that has to be right is not the busy one. It is the month with
 * three Signals in it and twenty-eight days nobody played, because that is the
 * month Rule 5 is about — and the fold's job is to make it impossible to
 * render that month as damage. These tests hold three things:
 *
 *   1. best-ten-of-a-calendar-month is arithmetically correct;
 *   2. the number can never go down (§6.1 "Promotion-only within a cycle"),
 *      proved by brute force rather than asserted;
 *   3. absence has no representation — an unplayed day produces no row, no
 *      zero and no hole.
 */

import { describe, it, expect } from '@jest/globals';
import {
  ascensionMonthBounds,
  ascensionMonthKey,
  ascensionMonthSummary,
  ascensionPoints,
  ascensionTierFor,
  ascensionTierNote,
  formatAscensionMonth,
  isAscensionMonthKey,
  nextAscensionMonth,
  nextAscensionTier,
  previousAscensionMonth,
  readAscensionMonth,
  signalCount,
  ASCENSION_COUNTED_DAYS,
  ASCENSION_TIERS,
  type AscensionDay,
} from './ascension';

/** Mid-month, so "concluded" is false and there are scoring days ahead. */
const MID_JULY = Date.UTC(2026, 6, 15, 12);
/** After July has run out. */
const AUGUST = Date.UTC(2026, 7, 3, 12);

function day(d: number, score: number): AscensionDay {
  return { day: `2026-07-${String(d).padStart(2, '0')}`, score };
}

describe('the month calendar', () => {
  it('names the month from the Signal day containing the instant', () => {
    expect(ascensionMonthKey(Date.UTC(2026, 6, 31, 23, 59, 59, 999))).toBe('2026-07');
    expect(ascensionMonthKey(Date.UTC(2026, 7, 1, 0, 0, 0, 0))).toBe('2026-08');
  });

  it('bounds a 31-day, a 30-day, a common February and a leap February', () => {
    expect(ascensionMonthBounds('2026-07')).toMatchObject({
      firstDay: '2026-07-01',
      lastDay: '2026-07-31',
      daysInMonth: 31,
    });
    expect(ascensionMonthBounds('2026-04')).toMatchObject({
      firstDay: '2026-04-01',
      lastDay: '2026-04-30',
      daysInMonth: 30,
    });
    expect(ascensionMonthBounds('2026-02')).toMatchObject({
      lastDay: '2026-02-28',
      daysInMonth: 28,
    });
    expect(ascensionMonthBounds('2024-02')).toMatchObject({
      lastDay: '2024-02-29',
      daysInMonth: 29,
    });
  });

  it('starts and ends on 00:00 UTC, exclusive at the far end', () => {
    const bounds = ascensionMonthBounds('2026-07')!;
    expect(bounds.startsAt).toBe('2026-07-01T00:00:00.000Z');
    expect(bounds.endsAt).toBe('2026-08-01T00:00:00.000Z');
  });

  it('refuses anything that is not a month at or after the Signal epoch', () => {
    expect(isAscensionMonthKey('2026-07')).toBe(true);
    expect(isAscensionMonthKey('2024-01')).toBe(true);
    expect(isAscensionMonthKey('2023-12')).toBe(false); // before the epoch
    expect(isAscensionMonthKey('2026-13')).toBe(false);
    expect(isAscensionMonthKey('2026-00')).toBe(false);
    expect(isAscensionMonthKey('2026-7')).toBe(false);
    expect(isAscensionMonthKey('2026-07-01')).toBe(false);
    expect(isAscensionMonthKey('')).toBe(false);
    expect(ascensionMonthBounds('not-a-month')).toBeNull();
  });

  it('walks to adjacent months, across a year boundary, and stops at both ends', () => {
    expect(previousAscensionMonth('2026-01')).toBe('2025-12');
    expect(nextAscensionMonth('2025-12', Date.UTC(2026, 6, 1))).toBe('2026-01');
    expect(previousAscensionMonth('2024-01')).toBeNull();
    // A month nobody has lived through is not offered as a link.
    expect(nextAscensionMonth('2026-07', MID_JULY)).toBeNull();
    expect(nextAscensionMonth('2026-06', MID_JULY)).toBe('2026-07');
  });

  it('formats a month in UTC', () => {
    expect(formatAscensionMonth('2026-07')).toBe('July 2026');
    expect(formatAscensionMonth('nonsense')).toBe('nonsense');
  });
});

describe('the tiers are absolute, published, and floored at zero (§6.1)', () => {
  it('puts zero points at the entry tier — there is no unranked state', () => {
    expect(ASCENSION_TIERS[0].threshold).toBe(0);
    expect(ascensionTierFor(0).id).toBe('COIL');
  });

  it('rises monotonically and tops out at Apex', () => {
    for (let i = 1; i < ASCENSION_TIERS.length; i += 1) {
      expect(ASCENSION_TIERS[i].threshold).toBeGreaterThan(
        ASCENSION_TIERS[i - 1].threshold
      );
    }
    const apex = ASCENSION_TIERS[ASCENSION_TIERS.length - 1];
    expect(apex.id).toBe('APEX');
    expect(ascensionTierFor(apex.threshold).id).toBe('APEX');
    expect(ascensionTierFor(apex.threshold * 10).id).toBe('APEX');
    expect(nextAscensionTier(apex.threshold)).toBeNull();
  });

  it('reads no population — the same points give the same tier at N of 1', () => {
    // The tier function takes exactly one argument, and it is the player's own
    // points. There is no cohort, percentile or rank parameter to pass.
    expect(ascensionTierFor.length).toBe(1);
    expect(ascensionTierFor(7_500).id).toBe('SPIRE');
    expect(ascensionTierFor(7_499).id).toBe('ASCENT');
  });
});

describe('the fold over a fixture month', () => {
  it('counts the best ten and nothing else', () => {
    // Twelve days, scores 100..1200. The best ten are 300..1200.
    const scored = Array.from({ length: 12 }, (_, i) => day(i + 1, (i + 1) * 100));
    const reading = readAscensionMonth('2026-07', scored, MID_JULY)!;

    expect(reading.signalsScored).toBe(12);
    expect(reading.counted).toHaveLength(ASCENSION_COUNTED_DAYS);
    expect(reading.counted[0]).toBe(1200);
    expect(reading.counted[9]).toBe(300);
    expect(reading.points).toBe(7_500); // 300+400+...+1200
    expect(reading.best).toBe(1200);
    expect(reading.openPlaces).toBe(0);
    expect(reading.tier.id).toBe('SPIRE');
  });

  it('marks exactly the counting days, and leaves the rest as played-not-counted', () => {
    const scored = Array.from({ length: 12 }, (_, i) => day(i + 1, (i + 1) * 100));
    const reading = readAscensionMonth('2026-07', scored, MID_JULY)!;
    const counted = reading.days.filter((d) => d.counted).map((d) => d.score);
    expect(counted.sort((a, b) => a - b)).toEqual([
      300, 400, 500, 600, 700, 800, 900, 1000, 1100, 1200,
    ]);
    // The two that did not make the ten are still THERE. Nothing was removed.
    expect(reading.days).toHaveLength(12);
  });

  it('ignores days outside the month entirely', () => {
    const reading = readAscensionMonth(
      '2026-07',
      [
        { day: '2026-06-30', score: 9_999 },
        { day: '2026-08-01', score: 9_999 },
        day(4, 500),
      ],
      MID_JULY
    )!;
    expect(reading.signalsScored).toBe(1);
    expect(reading.points).toBe(500);
  });

  it('keeps the higher of two rows for the same day (Rule 6: raise, never lower)', () => {
    const reading = readAscensionMonth(
      '2026-07',
      [day(4, 400), day(4, 900), day(4, 100)],
      MID_JULY
    )!;
    expect(reading.signalsScored).toBe(1);
    expect(reading.points).toBe(900);
  });

  it('labels each day with signalDayIndex, the number the Signal itself prints', () => {
    const reading = readAscensionMonth('2026-07', [day(26, 500)], MID_JULY)!;
    // The authoritative 0-based index from `signal.ts` — 937, not 938. The
    // off-by-one is the exact defect `signal.calendar.test.ts` was written
    // for, so it is asserted here as a literal rather than re-derived.
    expect(reading.days[0].index).toBe(937);
  });

  it('orders days most recent first', () => {
    const reading = readAscensionMonth(
      '2026-07',
      [day(3, 100), day(11, 100), day(7, 100)],
      MID_JULY
    )!;
    expect(reading.days.map((d) => d.day)).toEqual([
      '2026-07-11',
      '2026-07-07',
      '2026-07-03',
    ]);
  });

  it('returns null for a month key that is not a month', () => {
    expect(readAscensionMonth('2026-13', [], MID_JULY)).toBeNull();
    expect(readAscensionMonth('', [], MID_JULY)).toBeNull();
  });
});

describe('a month with many days nobody played (Rule 5)', () => {
  const sparse = [day(2, 900), day(9, 640), day(23, 1_100)];

  it('is 3 Signals, not 28 holes — absence produces no row at all', () => {
    const reading = readAscensionMonth('2026-07', sparse, MID_JULY)!;
    expect(reading.signalsScored).toBe(3);
    expect(reading.days).toHaveLength(3);
    // No zero-scored placeholder anywhere.
    expect(reading.days.every((d) => d.score > 0)).toBe(true);
    expect(reading.counted).toEqual([1_100, 900, 640]);
    expect(reading.points).toBe(2_640);
  });

  it('counts every one of them — a short month has no cut line below it', () => {
    const reading = readAscensionMonth('2026-07', sparse, MID_JULY)!;
    expect(reading.days.every((d) => d.counted)).toBe(true);
    expect(reading.openPlaces).toBe(7);
    // Three Signals is a real tier, not "unranked".
    expect(reading.tier.id).toBe('ASCENT');
  });

  it('a month with NO Signal at all is still a readable month at the entry tier', () => {
    const reading = readAscensionMonth('2026-07', [], MID_JULY)!;
    expect(reading.points).toBe(0);
    expect(reading.best).toBe(0);
    expect(reading.days).toHaveLength(0);
    expect(reading.openPlaces).toBe(ASCENSION_COUNTED_DAYS);
    expect(reading.tier.id).toBe('COIL');
    expect(reading.nextTier).not.toBeNull();
  });

  it('never exposes a field that could render as "N of 31"', () => {
    const reading = readAscensionMonth('2026-07', sparse, MID_JULY)!;
    // `daysInMonth` exists for the calendar; nothing pairs it with a count of
    // days the player did not play, because no such count is computed.
    expect(Object.keys(reading)).not.toContain('daysMissed');
    expect(Object.keys(reading)).not.toContain('daysUnplayed');
    expect(Object.keys(reading)).not.toContain('gaps');
    expect(Object.keys(reading)).not.toContain('streak');
  });
});

describe('the month has no downward direction (§6.1 promotion-only)', () => {
  it('adding any day to any month can only raise the points', () => {
    const scores = [
      120, 4_400, 90, 2_010, 1_500, 780, 3_300, 55, 2_900, 640, 1_180, 7_000, 12, 990,
    ];
    const accumulated: AscensionDay[] = [];
    let previousPoints = 0;
    let previousTierIndex = 0;

    scores.forEach((score, i) => {
      accumulated.push(day(i + 1, score));
      const reading = readAscensionMonth('2026-07', accumulated, MID_JULY)!;
      expect(reading.points).toBeGreaterThanOrEqual(previousPoints);
      const tierIndex = ASCENSION_TIERS.findIndex((t) => t.id === reading.tier.id);
      expect(tierIndex).toBeGreaterThanOrEqual(previousTierIndex);
      previousPoints = reading.points;
      previousTierIndex = tierIndex;
    });
  });

  it('a day that does not make the ten leaves the number exactly where it was', () => {
    const ten = Array.from({ length: 10 }, (_, i) => day(i + 1, 1_000));
    const before = readAscensionMonth('2026-07', ten, MID_JULY)!;
    const after = readAscensionMonth('2026-07', [...ten, day(11, 5)], MID_JULY)!;
    expect(after.points).toBe(before.points);
    expect(after.tier.id).toBe(before.tier.id);
    // And it is still recorded as a Signal that was played.
    expect(after.signalsScored).toBe(11);
  });

  it('never reports a negative distance to the next tier', () => {
    for (const points of [0, 1, 2_499, 2_500, 17_999, 39_999, 40_000, 1_000_000]) {
      const reading = readAscensionMonth('2026-07', [day(1, points)], MID_JULY)!;
      expect(reading.toNextTier).toBeGreaterThanOrEqual(0);
    }
  });
});

describe('scoring days ahead is a calendar fact, never a deadline', () => {
  it('counts today and the rest of the month while it runs', () => {
    const reading = readAscensionMonth('2026-07', [], MID_JULY)!;
    expect(reading.concluded).toBe(false);
    expect(reading.scoringDaysAhead).toBe(17); // 15th..31st inclusive
  });

  it('is zero once the month is over, and the month reads as concluded', () => {
    const reading = readAscensionMonth('2026-07', [day(4, 500)], AUGUST)!;
    expect(reading.concluded).toBe(true);
    expect(reading.scoringDaysAhead).toBe(0);
    // The concluded month keeps everything it reached.
    expect(reading.points).toBe(500);
  });

  it('is the whole month for a month that has not started', () => {
    const reading = readAscensionMonth('2026-09', [], MID_JULY)!;
    expect(reading.scoringDaysAhead).toBe(30);
  });

  it('does not depend on how many days the player played', () => {
    const empty = readAscensionMonth('2026-07', [], MID_JULY)!;
    const busy = readAscensionMonth(
      '2026-07',
      Array.from({ length: 14 }, (_, i) => day(i + 1, 900)),
      MID_JULY
    )!;
    expect(empty.scoringDaysAhead).toBe(busy.scoringDaysAhead);
  });
});

describe('the words the fold hands a surface', () => {
  /** Rule 5 / Rule 6. `close` is caught because it contains `lose`. */
  const FORBIDDEN = /lost|lose|missed out|broke|expire|decay|debt|behind/i;

  const CASES: Array<[string, AscensionDay[], number]> = [
    ['an empty month in progress', [], MID_JULY],
    ['an empty month concluded', [], AUGUST],
    ['a single Signal', [day(4, 500)], MID_JULY],
    ['three Signals in a 31-day month', [day(2, 900), day(9, 640), day(23, 1_100)], MID_JULY],
    ['three Signals, concluded', [day(2, 900), day(9, 640), day(23, 1_100)], AUGUST],
    ['a full ten', Array.from({ length: 10 }, (_, i) => day(i + 1, 900)), MID_JULY],
    ['an Apex month', Array.from({ length: 10 }, (_, i) => day(i + 1, 5_000)), MID_JULY],
    ['an Apex month, concluded', Array.from({ length: 10 }, (_, i) => day(i + 1, 5_000)), AUGUST],
  ];

  it.each(CASES)('%s reads honestly', (_label, scored, now) => {
    const reading = readAscensionMonth('2026-07', scored, now)!;
    const text = `${ascensionMonthSummary(reading)} ${ascensionTierNote(reading)}`;
    expect(text).not.toMatch(FORBIDDEN);
    // And it never pairs what was played against the size of the month.
    expect(text).not.toMatch(new RegExp(`\\b${reading.signalsScored}\\s*/\\s*31\\b`));
    expect(text).not.toMatch(new RegExp(`\\b${reading.signalsScored} of 31\\b`));
    expect(text.trim().length).toBeGreaterThan(0);
  });

  it('says the sparse month plainly', () => {
    const reading = readAscensionMonth(
      '2026-07',
      [day(2, 900), day(9, 640), day(23, 1_100)],
      MID_JULY
    )!;
    const summary = ascensionMonthSummary(reading);
    expect(summary).toContain('3 Signals scored in July 2026');
    expect(summary).toContain('2,640 points');
    expect(summary).toContain('7 of the ten counting places are still open');
  });

  it('pluralises the real singular cases', () => {
    expect(ascensionPoints(1)).toBe('1 point');
    expect(ascensionPoints(0)).toBe('0 points');
    expect(ascensionPoints(12_480)).toBe('12,480 points');
    expect(signalCount(1)).toBe('1 Signal');
    expect(signalCount(2)).toBe('2 Signals');
  });

  it('points forward at the top tier instead of warning about keeping it', () => {
    const apex = readAscensionMonth(
      '2026-07',
      Array.from({ length: 10 }, (_, i) => day(i + 1, 5_000)),
      MID_JULY
    )!;
    expect(apex.tier.id).toBe('APEX');
    expect(ascensionTierNote(apex)).toContain('Apex reached');
    expect(ascensionTierNote(apex)).not.toMatch(/keep|hold|maintain|drop|fall/i);
  });
});

describe('§12.2 — no currency, no claim, no fourth thing', () => {
  it('exposes no currency, balance, reward or claim field', () => {
    const reading = readAscensionMonth(
      '2026-07',
      [day(2, 900), day(9, 640)],
      MID_JULY
    )!;
    const json = JSON.stringify(reading).toLowerCase();
    for (const banned of [
      'dna',
      'currency',
      'balance',
      'reward',
      'payout',
      'bonus',
      'claim',
      'collect',
      'price',
      'premium',
      'entitle',
      'purchase',
    ]) {
      expect(json).not.toContain(banned);
    }
  });

  it('is Score and nothing else — points is the sum of the counted scores', () => {
    const reading = readAscensionMonth(
      '2026-07',
      [day(1, 700), day(2, 300), day(3, 1_000)],
      MID_JULY
    )!;
    expect(reading.points).toBe(reading.counted.reduce((a, b) => a + b, 0));
    // No multiplier, no bonus, no build term. Rule 2 holds because nothing
    // beyond a run's Score ever enters this fold.
    expect(reading.points).toBe(2_000);
  });
});

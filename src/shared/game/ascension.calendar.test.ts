/**
 * ONE Signal calendar — the Ascension tripwire (Phase 2, WP-2.01).
 *
 * `signal.calendar.test.ts` exists because `challenge.ts` once wrote a SECOND
 * copy of the day derivation, and the two disagreed: index off by one, seed
 * hashed without the `signal:` domain, and a share link that advertised a seed
 * the engine would never play.
 *
 * Ascension aggregates days by their key. A second calendar here would be the
 * same defect one cadence up — a month that counts the Signal of 31 July into
 * August, or a `?month=` link that opens a month whose days the Signal never
 * had. So this file guards `ascension.ts` exactly as that file guards
 * `challenge.ts`, and it guards both ways: REFERENTIAL identity fails the
 * moment someone re-declares a local copy even if it is byte-identical, and
 * the VALUE sweep fails if a copy that slipped past identity ever produces a
 * different key.
 */

import { describe, it, expect } from '@jest/globals';
import * as ascension from './ascension';
import * as signal from './signal';

const DAY_MS = 86_400_000;

/** Instants a local-time calendar would get wrong, plus every month edge. */
const INSTANTS: ReadonlyArray<{ label: string; at: number; month: string }> = [
  { label: 'the epoch itself', at: Date.UTC(2024, 0, 1, 0, 0, 0, 0), month: '2024-01' },
  { label: 'midday, far from any boundary', at: Date.UTC(2026, 6, 26, 12), month: '2026-07' },

  // --- Month edges, from both sides ---------------------------------------
  { label: 'last ms of a 31-day month', at: Date.UTC(2026, 0, 31, 23, 59, 59, 999), month: '2026-01' },
  { label: 'first ms of the month after it', at: Date.UTC(2026, 1, 1, 0, 0, 0, 0), month: '2026-02' },
  { label: 'last ms of a 30-day month', at: Date.UTC(2026, 3, 30, 23, 59, 59, 999), month: '2026-04' },
  { label: 'last ms of a common-year February', at: Date.UTC(2026, 1, 28, 23, 59, 59, 999), month: '2026-02' },
  { label: 'a leap day', at: Date.UTC(2024, 1, 29, 12), month: '2024-02' },
  { label: 'the day after a leap day', at: Date.UTC(2024, 2, 1, 0, 0, 0, 0), month: '2024-03' },
  { label: 'last ms of a year', at: Date.UTC(2025, 11, 31, 23, 59, 59, 999), month: '2025-12' },
  { label: 'first ms of a year', at: Date.UTC(2026, 0, 1, 0, 0, 0, 0), month: '2026-01' },

  // --- DST transitions ----------------------------------------------------
  { label: 'US spring forward 2026', at: Date.UTC(2026, 2, 8, 7), month: '2026-03' },
  { label: 'US fall back 2026', at: Date.UTC(2026, 10, 1, 6), month: '2026-11' },
  { label: 'EU summer time begins 2026', at: Date.UTC(2026, 2, 29, 1), month: '2026-03' },
  { label: 'EU summer time ends 2026', at: Date.UTC(2026, 9, 25, 1), month: '2026-10' },
  { label: 'NZ daylight time ends 2026', at: Date.UTC(2026, 3, 4, 14), month: '2026-04' },
  // The one that would bite hardest: a southern-hemisphere transition on the
  // last day of a month, where a local calendar rolls the month over early.
  { label: 'NZ daylight time begins, late in a month', at: Date.UTC(2026, 8, 26, 14), month: '2026-09' },
];

describe('ascension.ts borrows the Signal calendar rather than owning one', () => {
  it('re-exports the very functions signal.ts defines — not copies of them', () => {
    expect(ascension.signalDayKey).toBe(signal.signalDayKey);
    expect(ascension.signalDayIndex).toBe(signal.signalDayIndex);
    expect(ascension.signalDayKeyToDate).toBe(signal.signalDayKeyToDate);
    expect(ascension.signalDayStart).toBe(signal.signalDayStart);
    expect(ascension.SIGNAL_EPOCH_UTC).toBe(signal.SIGNAL_EPOCH_UTC);
  });

  it('anchors its first month on the Signal epoch, not a literal', () => {
    expect(ascension.ASCENSION_FIRST_MONTH).toBe(
      signal.signalDayKey(signal.SIGNAL_EPOCH_UTC).slice(0, 7)
    );
  });
});

describe('the month is exactly the prefix of the Signal day', () => {
  it.each(INSTANTS)('$label', ({ at, month }) => {
    expect(ascension.ascensionMonthKey(at)).toBe(month);
    // The load-bearing identity: month == day.slice(0,7), always. If these
    // ever diverge, a month is aggregating days the Signal did not put in it.
    expect(ascension.ascensionMonthKey(at)).toBe(signal.signalDayKey(at).slice(0, 7));
  });

  it('holds for every day of three unbroken years', () => {
    const start = Date.UTC(2024, 0, 1);
    for (let offset = 0; offset < 1_100; offset += 1) {
      const at = start + offset * DAY_MS + 13 * 3_600_000;
      const dayKey = signal.signalDayKey(at);
      expect(ascension.ascensionMonthKey(at)).toBe(dayKey.slice(0, 7));
      // And the day falls inside its own month's bounds, inclusive at both
      // ends — the predicate the server's `gte`/`lte` filter relies on.
      const bounds = ascension.ascensionMonthBounds(ascension.ascensionMonthKey(at))!;
      expect(dayKey >= bounds.firstDay).toBe(true);
      expect(dayKey <= bounds.lastDay).toBe(true);
    }
  });

  it('holds for every hour of a month-end day', () => {
    for (let hour = 0; hour < 24; hour += 1) {
      const at = Date.UTC(2026, 6, 31, hour, 30, 30, 500);
      expect(ascension.ascensionMonthKey(at)).toBe('2026-07');
    }
    expect(ascension.ascensionMonthKey(Date.UTC(2026, 7, 1, 0, 0, 0, 0))).toBe('2026-08');
  });

  it('bounds every month of three years to a contiguous, non-overlapping span', () => {
    let previousEnd: string | null = null;
    for (let m = 0; m < 36; m += 1) {
      const month = ascension.ascensionMonthKey(Date.UTC(2024, m, 15));
      const bounds = ascension.ascensionMonthBounds(month)!;
      expect(signal.signalDayKey(new Date(bounds.startsAt))).toBe(bounds.firstDay);
      expect(signal.signalDayKey(new Date(bounds.endsAt).getTime() - 1)).toBe(
        bounds.lastDay
      );
      if (previousEnd) expect(bounds.startsAt).toBe(previousEnd);
      previousEnd = bounds.endsAt;
    }
  });
});

/**
 * ONE Signal calendar — the cross-module tripwire (WP-1.09).
 *
 * WHAT WENT WRONG, SO THE TEST BELOW IS NOT MISTAKEN FOR CEREMONY
 *
 * WP-1.03 wrote the Signal calendar in `signal.ts`: the server resolves the
 * day from it, `049_world_signal.sql` mirrors its seed derivation
 * (`FNV-1a` over `signal:<day>`), and the engine plays the day it produces.
 * WP-1.08 was branched before that landed and wrote a SECOND calendar inside
 * `challenge.ts`. Once both were merged they disagreed on the same instant:
 *
 *   2026-07-26T12:00:00Z   day key   2026-07-26  ==  2026-07-26   (agreed)
 *                          day index    938      vs      937      (off by one)
 *                          day seed  D811c9dc5   vs  D079f8afe    (disagreed)
 *
 * The index was 1-based on one side and 0-based on the other; the seed was
 * FNV-1a over a bare `YYYY-MM-DD` on one side and over the domain-separated
 * `signal:<day>` on the other. The consequence was not cosmetic: a challenge
 * link advertised a seed the engine would never play, which is the one thing
 * §11.3 requires of it ("drops the visitor onto the *same seed*").
 *
 * `challenge.ts` no longer defines any of it. This file is the guard that it
 * never does again — and it guards both ways: the IDENTITY assertions fail
 * the moment someone re-declares a local copy (even a byte-identical one),
 * and the VALUE sweep fails if a copy that slipped past identity ever
 * produces a different key or seed.
 *
 * WHY THESE INSTANTS
 *
 * Neither module reads a local calendar, so the answer must be independent of
 * the machine's zone. The instants below are the ones where a calendar
 * written against local time — the mistake this pair of modules is one
 * refactor away from at all times — first goes wrong: the two DST
 * transitions in each hemisphere's usual rules, the last millisecond of a
 * month, the last millisecond of a year, a leap day, and both sides of the
 * UTC midnight that ends a day.
 */

import { describe, it, expect } from '@jest/globals';
import * as challenge from './challenge';
import * as signal from './signal';
import { fnv1a } from './offerGravity';

const DAY_MS = 86_400_000;

/** Instants a local-time calendar would get wrong. Labelled, so a failure names itself. */
const INSTANTS: ReadonlyArray<{ label: string; at: number }> = [
  { label: 'the epoch itself', at: Date.UTC(2024, 0, 1, 0, 0, 0, 0) },
  { label: 'the day before the epoch (negative index)', at: Date.UTC(2023, 11, 31, 12) },

  // --- UTC midnight, from both sides -------------------------------------
  { label: 'last millisecond of a UTC day', at: Date.UTC(2026, 6, 26, 23, 59, 59, 999) },
  { label: 'first millisecond of the next UTC day', at: Date.UTC(2026, 6, 27, 0, 0, 0, 0) },
  { label: 'midday, far from any boundary', at: Date.UTC(2026, 6, 26, 12) },

  // --- DST transitions: US (2nd Sun Mar / 1st Sun Nov) --------------------
  { label: 'US spring forward 2026 (02:00 local)', at: Date.UTC(2026, 2, 8, 7) },
  { label: 'US spring forward 2026, one hour earlier', at: Date.UTC(2026, 2, 8, 6) },
  { label: 'US fall back 2026 (02:00 local)', at: Date.UTC(2026, 10, 1, 6) },
  { label: 'US fall back 2026, one hour later', at: Date.UTC(2026, 10, 1, 7) },

  // --- DST transitions: EU (last Sun Mar / last Sun Oct, 01:00 UTC) -------
  { label: 'EU summer time begins 2026', at: Date.UTC(2026, 2, 29, 1) },
  { label: 'EU summer time begins 2026, minus a minute', at: Date.UTC(2026, 2, 29, 0, 59) },
  { label: 'EU summer time ends 2026', at: Date.UTC(2026, 9, 25, 1) },

  // --- DST transitions: southern hemisphere (NZ, Apr/Sep) -----------------
  { label: 'NZ daylight time ends 2026', at: Date.UTC(2026, 3, 4, 14) },
  { label: 'NZ daylight time begins 2026', at: Date.UTC(2026, 8, 26, 14) },

  // --- Month ends ---------------------------------------------------------
  { label: 'end of a 31-day month', at: Date.UTC(2026, 0, 31, 23, 59, 59, 999) },
  { label: 'start of the month after it', at: Date.UTC(2026, 1, 1, 0, 0, 0, 0) },
  { label: 'end of a 30-day month', at: Date.UTC(2026, 3, 30, 23, 59, 59, 999) },
  { label: 'end of a common-year February', at: Date.UTC(2026, 1, 28, 23, 59, 59, 999) },
  { label: 'a leap day', at: Date.UTC(2024, 1, 29, 12) },
  { label: 'the day after a leap day', at: Date.UTC(2024, 2, 1, 0, 0, 0, 0) },

  // --- Year ends ----------------------------------------------------------
  { label: 'last millisecond of 2024', at: Date.UTC(2024, 11, 31, 23, 59, 59, 999) },
  { label: 'first millisecond of 2025', at: Date.UTC(2025, 0, 1, 0, 0, 0, 0) },
  { label: 'last millisecond of 2025', at: Date.UTC(2025, 11, 31, 23, 59, 59, 999) },
  { label: 'first millisecond of 2026', at: Date.UTC(2026, 0, 1, 0, 0, 0, 0) },
  { label: 'last millisecond of 2027', at: Date.UTC(2027, 11, 31, 23, 59, 59, 999) },
];

describe('challenge.ts borrows the Signal calendar rather than owning one', () => {
  it('re-exports the very functions signal.ts defines — not copies of them', () => {
    // Referential equality, so a re-declared local copy fails here even if it
    // happens to agree numerically on every instant the sweep below tries.
    expect(challenge.signalDayKey).toBe(signal.signalDayKey);
    expect(challenge.signalDayIndex).toBe(signal.signalDayIndex);
    expect(challenge.signalDaySeed).toBe(signal.signalDaySeed);
    expect(challenge.SIGNAL_EPOCH_UTC).toBe(signal.SIGNAL_EPOCH_UTC);
  });

  it('keeps the seed domain-separated, as the migration and the server hash it', () => {
    // The shipped WP-1.08 derivation, reproduced here ONLY to be excluded: a
    // bare day key hashed without the `signal:` domain is the seed the engine
    // never plays. 049_world_signal.sql hashes the domain-separated form.
    const bareKeyDerivation = `D${(fnv1a('2026-07-26') >>> 0).toString(16).padStart(8, '0')}`;
    expect(challenge.signalDaySeed('2026-07-26')).not.toBe(bareKeyDerivation);
    expect(challenge.signalDaySeed('2026-07-26')).toBe(
      `D${signal.signalSeedNumber('2026-07-26').toString(16).padStart(8, '0')}`
    );
  });
});

describe('the two modules agree on every instant that has ever broken a calendar', () => {
  it.each(INSTANTS)('$label', ({ at }) => {
    const index = signal.signalDayIndex(at);
    const authoritativeKey = signal.signalDayKey(at);
    const authoritativeSeed = signal.signalDaySeed(authoritativeKey);

    // The URL round-trip: instant -> #N -> day key -> seed.
    expect(challenge.signalIndexToDayKey(index)).toBe(authoritativeKey);
    expect(challenge.signalSeedForIndex(index)).toBe(authoritativeSeed);

    // And end to end, as a share actually builds it: the seed a challenge
    // link carries is the seed `describeSignalDay` hands the engine.
    const day = signal.describeSignalDay(at);
    const link = challenge.challengeFromSignal(index, { t: '1240' });
    expect(day.day).toBe(authoritativeKey);
    expect(link.seed).toBe(day.seed);
    expect(challenge.signalIndexToDayKey(link.day ?? -1)).toBe(day.day);
  });

  it('agrees across three unbroken years of days', () => {
    const start = Date.UTC(2024, 0, 1);
    for (let offset = -400; offset < 1100; offset += 1) {
      const at = start + offset * DAY_MS + 13 * 3_600_000;
      const index = signal.signalDayIndex(at);
      expect(index).toBe(offset);
      expect(challenge.signalIndexToDayKey(index)).toBe(signal.signalDayKey(at));
      expect(challenge.signalSeedForIndex(index)).toBe(
        signal.signalDaySeed(signal.signalDayKey(at))
      );
    }
  });

  it('agrees for every hour of a day, so no hour lands on the neighbouring seed', () => {
    for (let hour = 0; hour < 24; hour += 1) {
      const at = Date.UTC(2026, 6, 26, hour, 30, 30, 500);
      expect(challenge.signalIndexToDayKey(signal.signalDayIndex(at))).toBe('2026-07-26');
      expect(challenge.signalSeedForIndex(signal.signalDayIndex(at))).toBe(
        signal.signalDaySeed('2026-07-26')
      );
    }
  });
});

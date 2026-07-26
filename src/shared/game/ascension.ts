/**
 * Ascension — "Score, this month" (Constitution §6.1, §7.1, §12.2).
 *
 * WHAT THIS IS, AND — LOUDLY — WHAT IT IS NOT
 *
 * §12.2 caps daily ritual surfaces at ONE and names the exception in the same
 * breath: "Ascension is its monthly aggregation view, **not a surface**". That
 * sentence is the whole design brief for this file, so it is worth spelling
 * out what it forbids:
 *
 *   - No second ritual. Nothing here has a cadence a player must attend. A
 *     month is not opened, taken, started or finished; it is READ. Every
 *     number below is folded from Signal days that were already played, on
 *     the one daily surface that already exists (§7.2).
 *   - No second claim. §7.2's "rewards settle automatically — no claim
 *     cascades, ever" holds because this module is pure and the read path
 *     around it (`src/lib/server/ascension.ts`) contains no write. There is
 *     no `claim` in this file, no endpoint beside it, and nothing to collect.
 *   - No second currency. §12.2 caps currencies at 1 (DNA). `points` here is
 *     a RE-EXPRESSION of Score — the same skill number §6.1 already publishes,
 *     summed over a month. It buys nothing, is spent nowhere, and appears in
 *     no balance. "Ascension is presented everywhere as 'Score, this month' —
 *     an aggregation view of the skill number, not a third number" (§6.1).
 *   - No fourth pillar. §12.2 caps progression pillars at 3. Ascension serves
 *     Mastery, through the Signal, by giving a month of skill a reading.
 *
 * The test of whether this stayed a view: turn it off and every Signal plays
 * identically. §6.1 requires exactly that — "ignoring it costs nothing".
 *
 * WHY THE NUMBER CAN ONLY GO UP (§6.1 "Promotion-only within a cycle")
 *
 * League points are "the sum of your best **ten** daily Signal scores in the
 * calendar month". Sum-of-best-K over a set that only ever GROWS is
 * monotonically non-decreasing: a new day either displaces a smaller counted
 * score (raising the sum) or does not count at all (leaving it). So
 * promotion-only is not a rule this code remembers to obey — it is a property
 * of the fold, and `ascension.test.ts` proves it by brute force.
 *
 * That is also how Rule 5 and Rule 6 are kept. A day nobody played contributes
 * nothing; it cannot subtract, because there is no subtraction anywhere in
 * this file. A month with three Signals in it is a month with three Signals in
 * it — never a month with twenty-eight holes.
 *
 * ONE CALENDAR (WP-1.09)
 *
 * The day derivation is IMPORTED from `signal.ts` and re-exported unchanged.
 * A second copy of `signalDayKey` once shipped in `challenge.ts` and had the
 * Signal advertising a seed the engine would never play; `signal.calendar.test.ts`
 * exists because of it. `ascension.calendar.test.ts` guards this module the
 * same way, by referential identity — so a local re-declaration fails even if
 * it happens to agree on every instant.
 */

import {
  signalDayIndex,
  signalDayKey,
  signalDayKeyToDate,
  signalDayStart,
  SIGNAL_EPOCH_UTC,
} from './signal';

// The one calendar, borrowed rather than owned. Re-exported so callers reach
// the Signal's derivation through this module without a second import path,
// and so the identity tripwire has something to assert against.
export {
  signalDayIndex,
  signalDayKey,
  signalDayKeyToDate,
  signalDayStart,
  SIGNAL_EPOCH_UTC,
};

// ---------------------------------------------------------------------------
// The month
// ---------------------------------------------------------------------------

const MONTH_KEY = /^(\d{4})-(\d{2})$/;

/** The first month the Signal calendar has any days in (`SIGNAL_EPOCH_UTC`). */
export const ASCENSION_FIRST_MONTH = signalDayKey(SIGNAL_EPOCH_UTC).slice(0, 7);

/**
 * The calendar month, `YYYY-MM`, that contains an instant.
 *
 * Derived from the SIGNAL DAY containing that instant, not from the raw date,
 * so a month boundary and a day boundary are the same 00:00 UTC edge by
 * construction (§7.1: "Day boundary: 00:00 UTC, globally"). An instant at
 * 23:59:59.999 on 31 July belongs to July here for exactly the reason it
 * belongs to Signal #N there.
 */
export function ascensionMonthKey(at: Date | number = Date.now()): string {
  return signalDayKey(at).slice(0, 7);
}

/** Is this a `YYYY-MM` naming a real month at or after the Signal epoch? */
export function isAscensionMonthKey(month: string): boolean {
  const match = MONTH_KEY.exec(month);
  if (!match) return false;
  const monthNumber = Number(match[2]);
  if (monthNumber < 1 || monthNumber > 12) return false;
  return month >= ASCENSION_FIRST_MONTH;
}

export interface AscensionMonthBounds {
  /** First day of the month, `YYYY-MM-DD`. Inclusive. */
  firstDay: string;
  /** Last day of the month, `YYYY-MM-DD`. Inclusive. */
  lastDay: string;
  /** 00:00 UTC on the first, ISO. */
  startsAt: string;
  /** 00:00 UTC on the first of the NEXT month, ISO. Exclusive. */
  endsAt: string;
  /** 28 / 29 / 30 / 31. */
  daysInMonth: number;
}

function monthParts(month: string): { year: number; index: number } {
  const match = MONTH_KEY.exec(month);
  if (!match) return { year: NaN, index: NaN };
  return { year: Number(match[1]), index: Number(match[2]) - 1 };
}

/**
 * The month's edges, every one of them derived through `signalDayKey`.
 *
 * The dependency is real rather than decorative: `firstDay` and `lastDay` are
 * the day keys the Signal itself would produce for those instants, so a query
 * built from them selects exactly the `signal_days.day` values migration 049
 * stored.
 */
export function ascensionMonthBounds(month: string): AscensionMonthBounds | null {
  if (!isAscensionMonthKey(month)) return null;
  const { year, index } = monthParts(month);
  const startsAt = Date.UTC(year, index, 1);
  const endsAt = Date.UTC(year, index + 1, 1);
  const daysInMonth = Math.round((endsAt - startsAt) / 86_400_000);
  return {
    firstDay: signalDayKey(startsAt),
    lastDay: signalDayKey(endsAt - 1),
    startsAt: new Date(startsAt).toISOString(),
    endsAt: new Date(endsAt).toISOString(),
    daysInMonth,
  };
}

/** The month before this one, or null at the Signal epoch. */
export function previousAscensionMonth(month: string): string | null {
  const { year, index } = monthParts(month);
  if (Number.isNaN(year)) return null;
  const previous = ascensionMonthKey(Date.UTC(year, index - 1, 1));
  return isAscensionMonthKey(previous) ? previous : null;
}

/**
 * The month after this one, whether or not it has started. Calendar only.
 *
 * Split out from `nextAscensionMonth` so a caller that already knows the
 * current month — a surface holding a server payload, say — can decide
 * offerability against the SERVER's clock rather than the browser's. §7.1
 * decision 8: one clock for the whole world.
 */
export function monthAfter(month: string): string | null {
  const { year, index } = monthParts(month);
  if (Number.isNaN(year)) return null;
  const next = ascensionMonthKey(Date.UTC(year, index + 1, 1));
  return isAscensionMonthKey(next) ? next : null;
}

/**
 * The month after this one, or null when that month has not started.
 *
 * A month nobody has lived through yet is not offered as a link: Rule 14 wants
 * real artifacts behind URLs, and an empty January 2030 is not one.
 */
export function nextAscensionMonth(
  month: string,
  now: Date | number = Date.now()
): string | null {
  const next = monthAfter(month);
  if (!next) return null;
  return next <= ascensionMonthKey(now) ? next : null;
}

/** `'2026-07'` -> `'July 2026'`. UTC, like the month itself. */
export function formatAscensionMonth(month: string): string {
  const bounds = ascensionMonthBounds(month);
  if (!bounds) return month;
  return new Date(bounds.startsAt).toLocaleDateString('en-GB', {
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  });
}

// ---------------------------------------------------------------------------
// The tiers (§6.1)
// ---------------------------------------------------------------------------

export type AscensionTierId = 'COIL' | 'ASCENT' | 'SPIRE' | 'ZENITH' | 'APEX';

export interface AscensionTier {
  id: AscensionTierId;
  name: string;
  /** League points at or above which this tier is reached. */
  threshold: number;
}

/**
 * ABSOLUTE published thresholds, per §6.1: "Tiers are **absolute published
 * thresholds** at launch (they work at a population of one), converting to
 * percentile bands only when population justifies it".
 *
 * A ladder that reads a population cannot be climbed by the only player on it,
 * which is the state this game is actually in (415 rows, 15 with a completed
 * run). Absolute numbers work at N = 1 and are honest about what they measure:
 * the score, not the crowd.
 *
 * THE FLOOR IS ZERO, DELIBERATELY. COIL is reached at 0 points, so there is no
 * unranked state, no qualification, and no cut line below which a month reads
 * as nothing (Rule 5). A player who scored one Signal all month is at COIL,
 * exactly like a player who scored none — both are IN the cycle.
 *
 * The numbers are tuning dials, marked [H] in §6.1's own sense: Score is
 * `Σ round(10 × scoreMultiplier(n))` (`rulesets.ts`), so a strong Signal day
 * sits in the high hundreds to low thousands and a best-ten sum lands in the
 * thousands to tens of thousands. They are calibrated from the fold, not from
 * live data, because there is no live data yet. Changing them changes no
 * schema and destroys nothing — an archived month keeps the tier it reached.
 */
export const ASCENSION_TIERS: readonly AscensionTier[] = [
  { id: 'COIL', name: 'Coil', threshold: 0 },
  { id: 'ASCENT', name: 'Ascent', threshold: 2_500 },
  { id: 'SPIRE', name: 'Spire', threshold: 7_500 },
  { id: 'ZENITH', name: 'Zenith', threshold: 18_000 },
  { id: 'APEX', name: 'Apex', threshold: 40_000 },
];

/** The tier a points total has reached. Never null — COIL's threshold is 0. */
export function ascensionTierFor(points: number): AscensionTier {
  let reached = ASCENSION_TIERS[0];
  for (const tier of ASCENSION_TIERS) {
    if (points >= tier.threshold) reached = tier;
  }
  return reached;
}

/** The next tier up, or null at Apex. */
export function nextAscensionTier(points: number): AscensionTier | null {
  return ASCENSION_TIERS.find((tier) => points < tier.threshold) ?? null;
}

// ---------------------------------------------------------------------------
// The fold
// ---------------------------------------------------------------------------

/**
 * How many days count (§6.1: "the sum of your best **ten** daily Signal
 * scores").
 *
 * The cap is the whole anti-grind argument: "attendance helps up to ten days
 * and after that only *quality* helps — training is rewarded, attendance is
 * not farmable". It is also why a 31-day month and a 28-day month are
 * comparable, and why a player with ten good days has a complete month.
 */
export const ASCENSION_COUNTED_DAYS = 10;

/** One scored Signal day. The only input the fold has. */
export interface AscensionDay {
  /** `YYYY-MM-DD`, from `signal_days.day`. */
  day: string;
  /** The run's Score. Build-independent by Rule 2; see `rulesets.ts`. */
  score: number;
}

/** A scored day, with the two things a row needs to render itself. */
export interface AscensionMonthDay extends AscensionDay {
  /** `signalDayIndex` — the same number the Signal surface prints. */
  index: number;
  /** This day's score is one of the best ten. */
  counted: boolean;
}

export interface AscensionMonthReading {
  /** `YYYY-MM`. Also the URL's `?month=` value (Rule 14). */
  month: string;
  /** `'July 2026'`. */
  label: string;
  startsAt: string;
  /** Exclusive: 00:00 UTC on the first of the next month. */
  endsAt: string;
  daysInMonth: number;
  /** The month is over. Its reading is final; nothing about it can change. */
  concluded: boolean;
  /** Days of the month that still have a Signal to come, today included. */
  scoringDaysAhead: number;
  /** Signals scored this month. Never compared against `daysInMonth` in copy. */
  signalsScored: number;
  /** The best-ten scores that made `points`, descending. */
  counted: readonly number[];
  /** Sum of `counted`. Score, this month. Monotonic within the cycle. */
  points: number;
  /** The best single Signal of the month. */
  best: number;
  /** How many of the ten counting places are not yet taken. */
  openPlaces: number;
  tier: AscensionTier;
  /** Null at Apex. */
  nextTier: AscensionTier | null;
  /** Points from here to `nextTier`. Zero at Apex. Always forward-facing. */
  toNextTier: number;
  /** Every scored day, most recent first. Days with no Signal are ABSENT. */
  days: readonly AscensionMonthDay[];
}

/**
 * Read one month.
 *
 * `days` is whatever the player actually scored — the caller does not pad it,
 * and this function does not invent a row for a day nobody played. That is the
 * Rule 5 shape: absence has no representation here, so no surface downstream
 * can render absence as a gap, a hole, a broken chain or a debt. It can only
 * render what is there.
 *
 * Returns null for a month key that is not a month, so a stranger typing a URL
 * gets an honest "no such month" instead of a fabricated empty one.
 */
export function readAscensionMonth(
  month: string,
  scored: readonly AscensionDay[],
  now: Date | number = Date.now()
): AscensionMonthReading | null {
  const bounds = ascensionMonthBounds(month);
  if (!bounds) return null;

  // Deduplicate by day and keep the highest score seen for it. §7.2 allows one
  // Signal objective run per day, so a duplicate is a caller bug rather than a
  // second attempt — and GREATEST is the direction the rest of the Signal
  // resolves such things in (Rule 6: a recompute may raise, never lower).
  const byDay = new Map<string, number>();
  for (const entry of scored) {
    if (entry.day < bounds.firstDay || entry.day > bounds.lastDay) continue;
    const score = Math.max(0, Math.floor(Number(entry.score) || 0));
    byDay.set(entry.day, Math.max(byDay.get(entry.day) ?? 0, score));
  }

  const descending = Array.from(byDay.values()).sort((a, b) => b - a);
  const counted = descending.slice(0, ASCENSION_COUNTED_DAYS);
  const points = counted.reduce((sum, score) => sum + score, 0);
  // The lowest score that still counts. Everything at or above it is counted;
  // ties at the boundary all count, which can only ever be generous.
  const cutoff = counted.length > 0 ? counted[counted.length - 1] : Infinity;
  const countedFull = counted.length >= ASCENSION_COUNTED_DAYS;

  const days: AscensionMonthDay[] = Array.from(byDay.entries())
    .sort((a, b) => (a[0] < b[0] ? 1 : a[0] > b[0] ? -1 : 0))
    .map(([day, score]) => {
      const date = signalDayKeyToDate(day);
      return {
        day,
        score,
        index: date ? signalDayIndex(date) : 0,
        counted: !countedFull || score >= cutoff,
      };
    });

  const nowMs = new Date(now).getTime();
  const concluded = nowMs >= new Date(bounds.endsAt).getTime();
  const today = signalDayKey(nowMs);
  const scoringDaysAhead = concluded
    ? 0
    : today < bounds.firstDay
      ? bounds.daysInMonth
      : bounds.daysInMonth - Number(today.slice(8, 10)) + 1;

  const tier = ascensionTierFor(points);
  const nextTier = nextAscensionTier(points);

  return {
    month,
    label: formatAscensionMonth(month),
    startsAt: bounds.startsAt,
    endsAt: bounds.endsAt,
    daysInMonth: bounds.daysInMonth,
    concluded,
    scoringDaysAhead: Math.max(0, scoringDaysAhead),
    signalsScored: byDay.size,
    counted,
    points,
    best: descending.length > 0 ? descending[0] : 0,
    openPlaces: Math.max(0, ASCENSION_COUNTED_DAYS - counted.length),
    tier,
    nextTier,
    toNextTier: nextTier ? Math.max(0, nextTier.threshold - points) : 0,
    days,
  };
}

// ---------------------------------------------------------------------------
// The reading, in words
// ---------------------------------------------------------------------------
//
// THIS BLOCK IS UNDER A COPY LAW, AND THE TEST ENFORCES IT.
//
// Rule 5: absence is never destructive. A month with twenty-eight unplayed
// days is a month with three Signals in it, and it must read as one. Nothing
// below may say lost, lose, missed, broke, expire, decay, debt or behind, and
// nothing below may compare `signalsScored` against `daysInMonth` — "3 of 31"
// is a hole with a number on it, which is the guilt this rule forbids.
//
// The words point FORWARD instead: places still open, days still ahead, points
// still to climb. `AscensionMonth.test.tsx` sweeps the rendered text for the
// banned vocabulary, so a well-meant "don't lose your place" cannot land here.

/** `12480` -> `'12,480 points'`. Singular is a real case. */
export function ascensionPoints(points: number): string {
  return `${points.toLocaleString('en-US')} ${points === 1 ? 'point' : 'points'}`;
}

/** `3` -> `'3 Signals'`. Singular is a real case at the start of a month. */
export function signalCount(count: number): string {
  return `${count.toLocaleString('en-US')} ${count === 1 ? 'Signal' : 'Signals'}`;
}

/**
 * One honest sentence about the month, in every state it can be in.
 *
 * Written as four cases rather than one template, because the sparse month and
 * the concluded month are the ones that go wrong, and a template with holes in
 * it is how "0 of 31" gets shipped by accident.
 */
export function ascensionMonthSummary(reading: AscensionMonthReading): string {
  const { signalsScored, concluded, scoringDaysAhead, label } = reading;

  if (signalsScored === 0) {
    return concluded
      ? `No Signal was scored in ${label}. The month is archived as it stands, and every month opens its own fresh count.`
      : `${label} has no scored Signal yet. Its best ten places are all open, with ${scoringDaysAhead} scoring ${scoringDaysAhead === 1 ? 'day' : 'days'} ahead.`;
  }

  const scored = `${signalCount(signalsScored)} scored in ${label}, for ${ascensionPoints(reading.points)} at ${reading.tier.name}.`;

  if (concluded) {
    return `${scored} The month is archived at its high mark; the next one opens a fresh count.`;
  }
  if (reading.openPlaces > 0) {
    return `${scored} ${reading.openPlaces} of the ten counting places ${reading.openPlaces === 1 ? 'is' : 'are'} still open, with ${scoringDaysAhead} scoring ${scoringDaysAhead === 1 ? 'day' : 'days'} ahead.`;
  }
  return `${scored} All ten places are filled — from here only a better Signal moves the number.`;
}

/**
 * What the tier line says. Forward-facing at every tier, including the top.
 *
 * Never "you need N to keep your tier": §6.1 is promotion-only within a cycle
 * and the fold makes that structural, so there is nothing to keep.
 */
export function ascensionTierNote(reading: AscensionMonthReading): string {
  if (!reading.nextTier) {
    return `Apex reached for ${reading.label}. Nothing above it this cycle.`;
  }
  if (reading.concluded) {
    return `${reading.label} finished at ${reading.tier.name}.`;
  }
  return `${ascensionPoints(reading.toNextTier)} to ${reading.nextTier.name}. The month's number only climbs.`;
}

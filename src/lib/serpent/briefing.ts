/**
 * The Monday briefing — reading one submerged Serpent week (Constitution §7.3).
 *
 * "Sunday midnight UTC it submerges, the hunt settles, and Monday's Signal
 * carries the result. The Monday briefing leads with you vs your best week,
 * then the clan vs its best week, then the rival comparison if one was paired."
 *
 * This module is the pure half of that view: it turns the panel contract
 * (`GET /api/serpent/panel`) plus a week key into a reading. It is pure so the
 * hard cases — a clan of one, a week nobody hunted, a player who was away —
 * can be asserted without a DOM.
 *
 * THE THREE DESIGN CONSTRAINTS, ENCODED HERE
 *
 *   N = 1. Every field is derived from the player's own history. `priorBest`
 *   is the deepest week that came before this one, so the comparison is always
 *   self-referential and always available — a first week compares against zero
 *   and reads "your first week", never "unranked" and never an empty panel.
 *
 *   No cut lines. Nothing in `WeekBriefing` is a threshold, a bar, a position
 *   or a qualification. `deltaVsPriorBest` may be negative; that is a quieter
 *   week, not a failure, and §7.3's own headline number.
 *
 *   Rule 5. A week the player did not hunt is `hunted: false` with `yourDepth`
 *   0 — and `priorBest` still standing at whatever it was. Absence costs the
 *   week's opportunity and nothing else; no field here can go down because a
 *   week was missed, because no field here is ever written.
 */

import type { SerpentPanel } from '@/lib/server/serpent';
import {
  describeSerpentModifier,
  describeSerpentWeek,
  serpentWeekKeyToDate,
  serpentWeekStart,
  type SerpentModifier,
} from '@/shared/game/serpent';
import { formatAmount } from '@/shared/format/amount';

const WEEK_MS = 7 * 24 * 60 * 60 * 1000;
const WEEK_KEY = /^\d{4}-\d{2}-\d{2}$/;

/** How many past weeks the briefing's week list ever offers. */
export const BRIEFING_WEEK_LIMIT = 12;

export interface WeekBriefing {
  /** Monday of the week, `YYYY-MM-DD`. Also the URL's `?week=` value. */
  weekStart: string;
  /** Monday 00:00 UTC, ISO — the week the briefing describes. */
  startsAt: string;
  /** The following Monday 00:00 UTC, ISO. Exclusive. */
  endsAt: string;
  /** The week has submerged. False only for the week running right now. */
  submerged: boolean;
  /** The player has a Depth for this week — they were there. */
  hunted: boolean;
  /** Segments the player fed the hunt that week. */
  yourDepth: number;
  /** Their deepest week among the weeks BEFORE this one. Zero on a first week. */
  priorBest: number;
  /** `yourDepth - priorBest`. Negative is a quieter week, never a failure. */
  deltaVsPriorBest: number;
  /** This week went deeper than every week before it. */
  deepestYet: boolean;
  /** The clan's Depth that week; `null` when the player hunted without one. */
  clanDepth: number | null;
  /** The week's condition-set. Derived from the calendar, so past weeks read. */
  modifier: SerpentModifier | null;
}

/** Is this a `YYYY-MM-DD` that names the Monday of a real Serpent week? */
export function isSerpentWeekKey(weekKey: string): boolean {
  if (!WEEK_KEY.test(weekKey)) return false;
  const date = serpentWeekKeyToDate(weekKey);
  if (Number.isNaN(date.getTime())) return false;
  return describeSerpentWeek(date).weekStart === weekKey;
}

/**
 * The week a Monday briefing opens on: the one that just submerged.
 *
 * Deliberately calendar-derived rather than read from `history`, because the
 * player who most needs an honest Monday reading is the one with no row for
 * last week at all (Rule 5). They still get last week's briefing; it just says
 * they were away.
 */
export function defaultBriefingWeek(now: Date | number = Date.now()): string {
  const currentStart = serpentWeekStart(now).getTime();
  return describeSerpentWeek(currentStart - WEEK_MS).weekStart;
}

/**
 * Submerged weeks this player can open, newest first.
 *
 * The most recent submerged week is always offered — that is the Monday
 * briefing, and it reads whether or not they hunted it. Everything else comes
 * from their own history, so the list is short and personal rather than a
 * calendar stretching back to the epoch.
 */
export function listBriefingWeeks(
  panel: Pick<SerpentPanel, 'history'>,
  now: Date | number = Date.now()
): string[] {
  const currentStart = serpentWeekStart(now).getTime();
  const weeks = new Set<string>([defaultBriefingWeek(now)]);
  for (const entry of panel.history) {
    if (!isSerpentWeekKey(entry.weekStart)) continue;
    if (serpentWeekKeyToDate(entry.weekStart).getTime() >= currentStart) continue;
    weeks.add(entry.weekStart);
  }
  return Array.from(weeks)
    .sort((a, b) => (a < b ? 1 : a > b ? -1 : 0))
    .slice(0, BRIEFING_WEEK_LIMIT);
}

/**
 * Read one week.
 *
 * Returns `null` only when the key is not a Serpent week at all or names a week
 * that has not started — a stranger typing a URL gets an honest "no such week"
 * rather than a fabricated one. Every real past week returns a briefing, even
 * one with nothing in it.
 */
export function readWeekBriefing(
  panel: SerpentPanel,
  weekKey: string,
  now: Date | number = Date.now()
): WeekBriefing | null {
  if (!isSerpentWeekKey(weekKey)) return null;

  const date = serpentWeekKeyToDate(weekKey);
  const definition = describeSerpentWeek(date);
  const nowMs = new Date(now).getTime();
  if (new Date(definition.startsAt).getTime() > nowMs) return null;

  const isCurrent = panel.week?.weekStart === weekKey;
  const historyEntry = panel.history.find((entry) => entry.weekStart === weekKey);

  // The current week is folded live on the panel; past weeks come from the
  // settled history rows. A week with neither is a week they were away for.
  const hunted = isCurrent ? panel.you.attempts > 0 : historyEntry !== undefined;
  const yourDepth = isCurrent ? panel.you.depth : (historyEntry?.depth ?? 0);
  const clanDepth = isCurrent
    ? (panel.clan?.depth ?? null)
    : (historyEntry?.clanDepth ?? null);

  const priorBest = panel.history.reduce(
    (best, entry) => (entry.weekStart < weekKey ? Math.max(best, entry.depth) : best),
    0
  );

  // The stored modifiers are authoritative for the live week; past weeks are
  // re-derived from the same calendar function the migration's drift check
  // uses, so a briefing from ten weeks ago names the right condition.
  const modifierId = isCurrent
    ? (panel.week?.modifiers[0]?.id ?? definition.modifiers[0])
    : definition.modifiers[0];

  return {
    weekStart: weekKey,
    startsAt: definition.startsAt,
    endsAt: definition.endsAt,
    submerged: nowMs >= new Date(definition.endsAt).getTime(),
    hunted,
    yourDepth,
    priorBest,
    deltaVsPriorBest: yourDepth - priorBest,
    deepestYet: hunted && yourDepth > priorBest,
    clanDepth,
    modifier: modifierId ? describeSerpentModifier(modifierId) : null,
  };
}

/** `1234` -> `"1,234 segments"`. Singular is a real case at N=1. */
export function segments(count: number): string {
  return `${formatAmount(count)} ${count === 1 ? 'segment' : 'segments'}`;
}

/** A signed segment delta, e.g. `"+240 segments"` / `"-90 segments"`. */
export function signedSegments(delta: number): string {
  const sign = delta > 0 ? '+' : delta < 0 ? '-' : '';
  return `${sign}${segments(Math.abs(delta))}`;
}

/** `2026-07-20` -> `"20 July 2026"`. Rendered in UTC, like the week itself. */
export function formatWeekStart(weekKey: string): string {
  const date = serpentWeekKeyToDate(weekKey);
  if (Number.isNaN(date.getTime())) return weekKey;
  return date.toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  });
}

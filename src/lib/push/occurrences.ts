/**
 * THE TWO TRIGGER POINTS — where a notification-worthy event is recognised.
 *
 * `triggers.ts` says WHAT may be pushed. This file says WHEN, and there are
 * exactly two answers because there are exactly two triggers.
 *
 * ── WHY THESE ARE OBSERVATIONS AND NOT HOOKS ───────────────────────────────
 *
 *   The obvious implementation is a call inside `/api/ops/serpent-settlement`
 *   and a call wherever a Signal day is first created. Both were rejected:
 *
 *   · Signal days are created LAZILY, by `ensureCurrentSignalDay`, on the
 *     first request of the day that needs one — which is a player's request,
 *     inside a session start, potentially at the beginning of a run. Sending
 *     a push from that call path would put a notification dispatch on the
 *     critical path of somebody starting a game (Rule 1), and would make the
 *     first player of the day pay for everybody else's notification.
 *
 *   · Hooking the settlement cron couples "the week settled" to "notifications
 *     went out": a notification failure would then be able to fail a
 *     settlement run, or a settlement retry would re-enter the notification
 *     path.
 *
 *   So both triggers are OBSERVED by a separate cron that reads the world and
 *   asks two questions. Nothing in the run path, the session path or the
 *   settlement path imports this module or the send path, and
 *   `occurrences.test.ts` asserts that separation by scanning the source tree.
 *
 * ── FRESHNESS WINDOWS, AND WHY THEY EXIST ──────────────────────────────────
 *
 *   The dispatch ledger already guarantees once-only delivery, so a window is
 *   not needed for idempotency. It is needed for DIGNITY: without one, the
 *   first cron run after the owner arms the flag would announce whatever week
 *   settled most recently, even if that was in March, and would announce
 *   "a new Signal is up" at 9pm about a day that opened twenty-one hours ago.
 *
 *   A notification is only worth sending while it is still news:
 *
 *     · a Serpent settlement, within `SERPENT_NEWS_WINDOW_HOURS` of the week
 *       submerging;
 *     · a new Signal, within `SIGNAL_NEWS_WINDOW_HOURS` of the UTC day
 *       opening.
 *
 *   Outside its window the occurrence is simply not returned, and nothing is
 *   sent. A player who was never told about a missed week is not told late —
 *   which is also the Rule 5 reading: a stale notification about a week that
 *   has already gone is a notification about something they missed.
 */

import * as Sentry from '@sentry/nextjs';
import type { SupabaseClient } from '@supabase/supabase-js';
import { describeSignalDay, signalDayStart } from '@/shared/game/signal';
import { SIGNAL_V1_ENABLED } from '@/lib/signal/config';
import { SERPENT_V1_ENABLED } from '@/lib/serpent/config';
import { isMissingPushInfra } from '@/lib/push/subscriptions';

/** A settlement is news for a day and a half after the week submerges. */
export const SERPENT_NEWS_WINDOW_HOURS = 36;

/** A new Signal is news for the first quarter of its UTC day. */
export const SIGNAL_NEWS_WINDOW_HOURS = 6;

const HOUR_MS = 60 * 60 * 1000;

/**
 * TRIGGER POINT 1 — a Serpent settlement (§7.3).
 *
 * Reads the most recent SETTLED week and returns its `week_start` if the week
 * ended inside the news window. Never creates, settles or modifies anything:
 * this is a read, and the settlement itself remains entirely the business of
 * `/api/ops/serpent-settlement`.
 *
 * Returns null on flag-off, missing migration, an unsettled week, a stale
 * week, or any error. Null means "nothing to notify", which is the direction
 * every failure here should point.
 */
export async function settledSerpentOccurrence(
  supabase: SupabaseClient,
  now: Date | number = Date.now()
): Promise<string | null> {
  if (!SERPENT_V1_ENABLED) return null;

  const nowMs = new Date(now).getTime();
  const cutoff = new Date(nowMs - SERPENT_NEWS_WINDOW_HOURS * HOUR_MS).toISOString();

  const { data, error } = await supabase
    .from('serpent_weeks')
    .select('week_start, ends_at, settled_at')
    .not('settled_at', 'is', null)
    .gte('ends_at', cutoff)
    .lte('ends_at', new Date(nowMs).toISOString())
    .order('week_start', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    if (!isMissingPushInfra(error) && error.code !== '42P01') {
      console.error('Push serpent occurrence lookup failed:', { error });
      Sentry.captureException(new Error('Push serpent occurrence lookup failed'), {
        extra: { error },
      });
    }
    return null;
  }

  const row = data as { week_start?: unknown } | null;
  const weekStart = typeof row?.week_start === 'string' ? row.week_start.slice(0, 10) : null;
  return weekStart && /^\d{4}-\d{2}-\d{2}$/.test(weekStart) ? weekStart : null;
}

/**
 * TRIGGER POINT 2 — a new Signal (§7.2).
 *
 * Pure calendar: `describeSignalDay` is the single definition of a Signal day
 * that the panel, the settlement and the migration's drift check all read, so
 * this cannot disagree with them. No database read, no row creation — the
 * cron must not be the thing that brings a Signal day into existence, because
 * a day exists on the calendar whether or not anybody has played yet.
 *
 * Returns null outside the freshness window, and null when the Signal is off.
 */
export function newSignalOccurrence(now: Date | number = Date.now()): string | null {
  if (!SIGNAL_V1_ENABLED) return null;

  const nowMs = new Date(now).getTime();
  const dayStart = signalDayStart(nowMs).getTime();
  if (nowMs - dayStart > SIGNAL_NEWS_WINDOW_HOURS * HOUR_MS) return null;

  return describeSignalDay(nowMs).day;
}

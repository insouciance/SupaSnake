/**
 * Reading a month of Signals (Constitution §6.1, §7.1, §12.2).
 *
 * The whole server half of Ascension is this file, and it is a READ. There is
 * no INSERT, no UPDATE, no RPC and no grant anywhere in it — §12.2 forbids a
 * second claim and §7.2 forbids a claim cascade, and both are kept the same
 * way `readSignalObjectiveState` keeps them: by there being no write here to
 * abuse. A month cannot be settled, closed, collected or replayed, because a
 * month is not a thing this codebase stores. It is a fold over rows migration
 * 049 already wrote.
 *
 * NO MIGRATION. This was checked rather than assumed:
 *
 *   - `signal_objective_runs` (049) already holds one row per player per day,
 *     with `session_id` pointing at the run that owns the attempt.
 *   - `signal_days.day` (049) already holds the UTC date, `UNIQUE`.
 *   - `game_sessions.score` (001) already holds Score.
 *
 * Best-ten-of-a-month is a fold over those three, so there is nothing to add.
 * A `052_*.sql` would have been a new table holding a number that is already
 * derivable, which is the shape §12.2 exists to refuse.
 *
 * WHY TWO QUERIES AND NOT ONE EMBEDDED JOIN
 *
 * `game_sessions` and `signal_objective_runs` reference each other — runs have
 * `session_id`, and 049 added `game_sessions.signal_objective_run_id` as the
 * mirror. PostgREST cannot pick a direction between two foreign keys without a
 * hint, and a hint that names a constraint is a string that silently rots if
 * the constraint is ever renamed. Two unambiguous queries cost one extra round
 * trip on a page nobody opens mid-run, and they cannot resolve to the wrong
 * relationship. The `signal_days` embed IS used, because that pair has exactly
 * one foreign key between it.
 *
 * ELIGIBILITY IS SCORE'S OWN (§6.1)
 *
 * "Ascension is presented everywhere as 'Score, this month'", so a run counts
 * here if and only if it would count on the Score ladder — same predicate,
 * same module, `isEligibleRun`. Not a copy of it: importing the real one is
 * what stops a month from ranking a run the leaderboard refuses, which would
 * make the two readings of the same number disagree.
 *
 * That predicate rejects runs with an `anomaly_id` ("those score on their own
 * weekly board"). It is worth stating that this does NOT silently empty every
 * month: the Signal's condition-set is derived, never stamped — `mode:
 * 'signal'` writes no `anomaly_id` (only `mode: 'anomaly'` does, see
 * `api/game/session/route.ts`), so a Signal run passes.
 *
 * RULE 11. Every Supabase `error` is checked and reported to Sentry.
 */

import * as Sentry from '@sentry/nextjs';
import type { SupabaseClient } from '@supabase/supabase-js';
import {
  ascensionMonthBounds,
  ascensionMonthKey,
  ascensionTierFor,
  isAscensionMonthKey,
  readAscensionMonth,
  type AscensionDay,
  type AscensionMonthReading,
} from '@/shared/game/ascension';
import { ASCENSION_V1_ENABLED } from '@/lib/ascension/config';
import { isMissingSignalInfra } from '@/lib/server/signal';
import {
  isEligibleRun,
  LEADERBOARD_CONTENT_EPOCH,
  type RankableSessionRow,
} from '@/lib/leaderboard/eligibility';

function report(scope: string, error: unknown, extra: Record<string, unknown>) {
  console.error(`Ascension ${scope} failed:`, { ...extra, error });
  Sentry.captureException(
    error instanceof Error ? error : new Error(`Ascension ${scope} failed`),
    { extra: { scope, ...extra, error } }
  );
}

/**
 * The `game_sessions` columns a month reads.
 *
 * Exactly `RankableSessionRow` and nothing else. Deliberately absent:
 * `dna_earned` and `yield_dna` (§12.2 caps currencies at one and Ascension
 * touches neither — a month has no payout, so the numbers behind one have no
 * business travelling to a client), and every account, entitlement and premium
 * column (Rule 3, Rule 7: no euro can reach this number, and no offer can be
 * built from it).
 */
const SESSION_COLUMNS =
  'id, player_id, score, dynasty, started_at, ended_at, validated, is_free_play, anomaly_id, end_reason';

/** What `GET /api/signal/ascension` publishes. */
export interface AscensionView {
  /** False when the flag is off or migration 049 is not applied here. */
  live: boolean;
  /** Null only for a month key that is not a month. */
  reading: AscensionMonthReading | null;
  /** `YYYY-MM` of the month running now — the default `?month=`. */
  currentMonth: string;
}

/** The shape a flag-off or pre-migration reader sees. */
export function emptyAscensionView(
  month: string,
  now: Date | number = Date.now()
): AscensionView {
  return {
    live: false,
    reading: readAscensionMonth(month, [], now),
    currentMonth: ascensionMonthKey(now),
  };
}

/**
 * One player's Signal scores for one month, folded into a reading.
 *
 * Returns `live: false` — never an error — for every ordinary "not live"
 * reason: flag down, migration unapplied, or a read that failed after being
 * reported. A month is a readback; a failed readback shows no month, and never
 * an invented one.
 */
export async function buildAscensionView(
  supabase: SupabaseClient,
  playerId: string,
  month: string,
  now: Date | number = Date.now(),
  options: { enabled?: boolean } = {}
): Promise<AscensionView> {
  const enabled = options.enabled ?? ASCENSION_V1_ENABLED;
  const currentMonth = ascensionMonthKey(now);

  if (!isAscensionMonthKey(month)) {
    return { live: false, reading: null, currentMonth };
  }
  if (!enabled) return emptyAscensionView(month, now);

  const bounds = ascensionMonthBounds(month);
  if (!bounds) return { live: false, reading: null, currentMonth };

  // 1. The player's Signal attempts whose day falls inside the month. The
  //    `!inner` is load-bearing: without it the day filter would prune the
  //    embedded rows and keep every parent, which is how a month-scoped query
  //    quietly becomes an all-time one.
  const { data: attemptRows, error: attemptError } = await supabase
    .from('signal_objective_runs')
    .select('session_id, signal_days!inner(day)')
    .eq('player_id', playerId)
    .gte('signal_days.day', bounds.firstDay)
    .lte('signal_days.day', bounds.lastDay);

  if (attemptError) {
    if (isMissingSignalInfra(attemptError)) return emptyAscensionView(month, now);
    report('attempt read', attemptError, { playerId, month });
    return emptyAscensionView(month, now);
  }

  const dayBySession = new Map<string, string>();
  for (const row of (attemptRows ?? []) as Array<Record<string, unknown>>) {
    const sessionId = typeof row.session_id === 'string' ? row.session_id : null;
    // PostgREST returns an embedded to-one as an object; some driver versions
    // hand back a one-element array. Both are handled rather than assumed.
    const embedded = row.signal_days as { day?: string } | Array<{ day?: string }> | null;
    const joined = Array.isArray(embedded) ? (embedded[0] ?? null) : embedded;
    const day = String(joined?.day ?? '').slice(0, 10);
    // An attempt with no run behind it is a player who opened the day and did
    // not finish. It is simply absent from the fold — never a zero-scored row,
    // because a zero row is absence wearing a number (Rule 5).
    if (!sessionId || day.length !== 10) continue;
    dayBySession.set(sessionId, day);
  }

  if (dayBySession.size === 0) {
    return { live: true, reading: readAscensionMonth(month, [], now), currentMonth };
  }

  // 2. The runs behind those attempts, with the columns Score's own
  //    eligibility predicate reads. `player_id` is re-applied here even though
  //    the attempt rows were already scoped to the player — WP-0.05's two-gate
  //    shape, so a query that drifted cannot fold another player's runs into
  //    this month.
  const { data: sessionRows, error: sessionError } = await supabase
    .from('game_sessions')
    .select(SESSION_COLUMNS)
    .in('id', Array.from(dayBySession.keys()))
    .eq('player_id', playerId);

  if (sessionError) {
    if (isMissingSignalInfra(sessionError)) return emptyAscensionView(month, now);
    report('session read', sessionError, { playerId, month });
    return emptyAscensionView(month, now);
  }

  // The month's own window: the later of the month's first instant and the
  // content epoch, so a month that straddles a score-fold change ranks only
  // the comparable half rather than mixing two folds into one number.
  const windowStart = new Date(
    Math.max(
      new Date(bounds.startsAt).getTime(),
      new Date(LEADERBOARD_CONTENT_EPOCH).getTime()
    )
  ).toISOString();

  const scored: AscensionDay[] = [];
  for (const raw of (sessionRows ?? []) as Array<Record<string, unknown>>) {
    const row = raw as unknown as RankableSessionRow;
    // Gate two: the ownership predicate re-applied to whatever came back.
    if (row.player_id !== playerId) continue;
    if (!isEligibleRun(row, { windowStart })) continue;
    const day = dayBySession.get(row.id);
    if (!day) continue;
    scored.push({ day, score: Math.max(0, Number(row.score ?? 0)) });
  }

  return {
    live: true,
    reading: readAscensionMonth(month, scored, now),
    currentMonth,
  };
}

export { ascensionTierFor };
export type { AscensionMonthReading };

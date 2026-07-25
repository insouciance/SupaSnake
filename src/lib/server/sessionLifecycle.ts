/**
 * Server side of the session lifecycle (GT §9.6).
 *
 * Two sweeps and one lookup, all of them server-only:
 *
 *   `expireStaleSessions`  — the global sweep, called by the daily cron. Runs
 *                            in SQL (`expire_stale_game_sessions`, migration
 *                            045) so the whole batch is one statement.
 *   `abandonStalePlayerSessions` — the opportunistic sweep, called when a
 *                            player starts a new run. Closes only that
 *                            player's own stale rows, as `abandoned`.
 *   `excludedCohortPlayerIds` — the dev/QA/fixture accounts a public surface
 *                            must not render (GT §13).
 *
 * WHY NONE OF THIS CAN AWARD ANYTHING
 *
 * Every write below is an UPDATE of `ended_at` and `end_reason` on
 * `game_sessions`, guarded by `ended_at IS NULL`. No function here reads or
 * writes `players`, `economy_transactions`, `player_records`, `player_mastery`
 * or `collected_snakes`, and none of them touches `score`, `dna_earned`,
 * `yield_dna` or `validated`. A swept row is closed with a reason that is not
 * `completed`, and `endReasonSettles` — the one place that decides whether a
 * run settled — answers `false` for it everywhere: on the boards, on the
 * Anomaly board, and on the settlement route, which refuses to re-end an
 * already-ended session at all.
 *
 * Rule 11: every Supabase `error` is checked and reported to Sentry.
 */

import * as Sentry from '@sentry/nextjs';
import type { SupabaseClient } from '@supabase/supabase-js';
import {
  STALE_OPEN_MINUTES,
  STALE_PENDING_SETTLEMENT_MINUTES,
  staleSessionCutoffs,
} from '@/lib/session/lifecycle';
import { PUBLIC_COHORT } from '@/lib/cohort/cohort';

interface SupabaseErrorLike {
  code?: string;
  message?: string;
}

/**
 * Is this failure just "migration 045 has not been applied here yet"?
 *
 * 42703 unknown column, 42P01 unknown table, 42883/PGRST202 unknown function.
 * The name test catches drivers that report the same thing without a code.
 * Everything else is a real error and is reported.
 */
export function isMissingLifecycleInfra(
  error: SupabaseErrorLike | null | undefined
): boolean {
  if (!error) return false;
  if (
    error.code === '42P01' ||
    error.code === '42703' ||
    error.code === '42883' ||
    error.code === 'PGRST202' ||
    error.code === 'PGRST204'
  ) {
    return true;
  }
  return /end_reason|cohort|expire_stale_game_sessions/i.test(
    error.message || ''
  );
}

function report(scope: string, error: unknown, extra: Record<string, unknown>) {
  console.error(`Session lifecycle ${scope} failed:`, { ...extra, error });
  Sentry.captureException(
    error instanceof Error ? error : new Error(`Session lifecycle ${scope} failed`),
    { extra: { scope, ...extra, error } }
  );
}

export interface SweepResult {
  /** Rows closed by this call. `null` when the sweep could not run. */
  expired: number | null;
  /** True when the schema is not there yet — expected, not an error. */
  skipped: boolean;
}

/**
 * The global expiry sweep. Closes every stale open session as `expired`.
 *
 * Delegates to the SQL function so the batch is atomic and the two staleness
 * windows are enforced by the same predicate the migration documents.
 */
export async function expireStaleSessions(
  supabase: SupabaseClient,
  options: {
    openMaxMinutes?: number;
    pendingMaxMinutes?: number;
    batchLimit?: number;
  } = {}
): Promise<SweepResult> {
  const params = {
    p_open_max_minutes: options.openMaxMinutes ?? STALE_OPEN_MINUTES,
    p_pending_max_minutes:
      options.pendingMaxMinutes ?? STALE_PENDING_SETTLEMENT_MINUTES,
    p_batch_limit: options.batchLimit ?? 5000,
  };

  const { data, error } = await supabase.rpc('expire_stale_game_sessions', params);

  if (error) {
    if (isMissingLifecycleInfra(error)) {
      return { expired: null, skipped: true };
    }
    report('expiry sweep', error, params);
    return { expired: null, skipped: false };
  }

  return { expired: typeof data === 'number' ? data : 0, skipped: false };
}

/**
 * The opportunistic sweep, run when a player starts a new run.
 *
 * A run of theirs that has been open past the stale window while they are
 * starting another one was not interrupted — it was left behind. It closes as
 * `abandoned`, which is the same "settled to nothing" class as `expired`; the
 * two are separate only so the funnel can tell "the player moved on" from "the
 * player never came back".
 *
 * The `started_at` bound is deliberately the same one the cron uses. A run the
 * player might still finish — a second tab, a paused session — is younger than
 * the window and is not touched.
 *
 * Never fatal to starting a run: a failed sweep leaves the old row open, which
 * is exactly the status quo this work package inherited.
 */
export async function abandonStalePlayerSessions(
  supabase: SupabaseClient,
  playerId: string,
  now: Date = new Date()
): Promise<SweepResult> {
  const cutoffs = staleSessionCutoffs(now);

  const { data, error } = await supabase
    .from('game_sessions')
    .update({ ended_at: now.toISOString(), end_reason: 'abandoned' })
    .eq('player_id', playerId)
    .is('ended_at', null)
    // Never-settled rows only. A row carrying an end reason with `ended_at`
    // null settled and is waiting for an outbox replay worth real DNA; the
    // cron's longer window owns it (Rule 6).
    .is('end_reason', null)
    .lt('started_at', cutoffs.open)
    .select('id');

  if (error) {
    if (isMissingLifecycleInfra(error)) {
      return { expired: null, skipped: true };
    }
    report('abandon sweep', error, { playerId });
    return { expired: null, skipped: false };
  }

  return { expired: (data ?? []).length, skipped: false };
}

/**
 * The accounts no public surface may render (GT §13).
 *
 * One small read: the flagged minority only. At any realistic scale the
 * dev/QA/fixture set stays in the dozens, so the whole exclusion list fits in
 * a `Set` and every public surface can apply it without a join.
 *
 * Failure degrades to "nothing is excluded" — the behaviour of the release
 * before this one. Failing closed would blank the boards, which is a worse
 * answer to a transient database error than showing a developer's run.
 */
export async function excludedCohortPlayerIds(
  supabase: SupabaseClient
): Promise<{ ids: Set<string>; skipped: boolean }> {
  const { data, error } = await supabase
    .from('players')
    .select('id')
    .neq('cohort', PUBLIC_COHORT);

  if (error) {
    if (isMissingLifecycleInfra(error)) {
      return { ids: new Set(), skipped: true };
    }
    report('cohort lookup', error, {});
    return { ids: new Set(), skipped: false };
  }

  const ids = new Set<string>();
  for (const row of (data ?? []) as Array<{ id?: string | null }>) {
    if (row?.id) ids.add(row.id);
  }
  return { ids, skipped: false };
}

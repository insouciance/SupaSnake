/**
 * Leaderboard eligibility (Constitution §6.1, fixes GT §9.3).
 *
 * A run ranks only if it:
 *   1. ended            - `ended_at` is present (in-progress runs never rank)
 *   2. passed validation - `validated = true` (flagged runs never rank)
 *   3. is not Free Play  - practice runs are rewardless (Design v2 §7.4)
 *   4. is not an Anomaly run - those score on their own weekly board (§7.2)
 *   5. was played on a compatible content version
 *   6. falls inside the board's time window (daily / weekly / all-time)
 *   7. ended by SETTLING - `end_reason` is `completed` (WP-0.06). An expired,
 *      abandoned or disconnected run settled to nothing; it is not a result,
 *      so it is not a rank either.
 *   8. belongs to an account a stranger may be shown - the dev/QA/fixture
 *      cohorts are excluded (WP-0.06, GT §13).
 *
 * 7 and 8 COMPOSE with 1-6; they replace nothing. `validated` remains the
 * flag gate WP-0.05 established - a run still has to pass server validation.
 * The new conditions answer two different questions: did this run finish, and
 * is this account part of the audience.
 *
 * These are READ-SIDE rules only. Making a run ineligible never writes to,
 * deletes, or downgrades any player-owned row (Rule 6) - the run, its DNA,
 * its Chronicle entry and the player's stats are untouched. The board simply
 * stops counting it.
 *
 * The predicate here is the same set of conditions the route pushes into the
 * PostgREST query. The query is the enforcement point (Rule 11: eligibility is
 * decided server-side, never in a client); this module is the second gate the
 * route applies to whatever the database returned, so a filter regression can
 * never leak a flagged or in-progress run onto a board.
 */

import { endReasonSettles } from '@/lib/session/lifecycle';

/**
 * Content version of the currently ranked score fold.
 *
 * Score is `Σ round(FOOD_BASE_SCORE × ruleset.scoreMultiplier(n))`
 * (`src/shared/game/rulesets.ts`). That fold was introduced by migration
 * 013 (Design v2 phase 1, landed 2026-07-18), which flattened the previous
 * generation multiplier out of run stats. Runs started before that epoch were
 * scored under a different, non-comparable fold, so they are not eligible for
 * the boards that rank the current one.
 *
 * Bump BOTH constants together whenever a change makes new scores
 * incomparable with old ones; leave them alone for changes that provably do
 * not touch the score fold (the Genome work of migrations 029-033, for
 * example, left the score formula byte-identical - see GT §2.2).
 */
export const LEADERBOARD_CONTENT_VERSION = 'v2-designv2-2026-07-18';

/** First instant whose runs are comparable with `LEADERBOARD_CONTENT_VERSION`. */
export const LEADERBOARD_CONTENT_EPOCH = '2026-07-18T00:00:00.000Z';

/**
 * The `game_sessions` columns eligibility reads. Every field is nullable
 * because Postgres says so - the predicate treats "missing" as "not eligible"
 * rather than guessing.
 */
export interface RankableSessionRow {
  id: string;
  player_id: string | null;
  score: number | null;
  dynasty: string | null;
  started_at: string | null;
  ended_at: string | null;
  validated: boolean | null;
  is_free_play: boolean | null;
  anomaly_id: string | null;
  /**
   * How the run stopped being open (migration 045). `null` on rows written by
   * the pre-045 code path, which had exactly one end route and always settled
   * - `endReasonSettles` treats that as settled.
   */
  end_reason?: string | null;
}

export type IneligibleReason =
  | 'no_player'
  | 'in_progress'
  | 'not_validated'
  | 'free_play'
  | 'anomaly_board'
  | 'before_window'
  | 'did_not_settle'
  | 'excluded_cohort';

export interface EligibilityWindow {
  /**
   * Inclusive lower bound on `started_at`. Already folds in the content
   * epoch - see `boardWindowStart`.
   */
  windowStart: string;
  /**
   * `players.id` of the accounts no public surface renders - the dev/QA/
   * fixture cohorts (GT §13). Read-side only: excluding an account keeps every
   * run, reward and record it owns intact (Rule 6).
   *
   * Optional because the pre-045 window has no cohort column, and because the
   * pure fold is used in tests that do not care about cohorts. Absent means
   * "exclude nobody", which is the previous release's behaviour.
   */
  excludedPlayerIds?: ReadonlySet<string>;
}

/**
 * Start of the UTC day.
 */
export function utcDayStart(now: Date): Date {
  const d = new Date(now.getTime());
  d.setUTCHours(0, 0, 0, 0);
  return d;
}

/**
 * Start of the UTC ISO week (Monday 00:00).
 */
export function utcWeekStart(now: Date): Date {
  const d = utcDayStart(now);
  const day = d.getUTCDay(); // 0 = Sunday
  const delta = day === 0 ? -6 : 1 - day;
  d.setUTCDate(d.getUTCDate() + delta);
  return d;
}

/**
 * Inclusive `started_at` lower bound for a board: the later of the board's
 * own period start and the content epoch. The global board is all-time, so it
 * is bounded by the content epoch alone.
 */
export function boardWindowStart(
  type: 'global' | 'weekly' | 'daily',
  now: Date = new Date(),
  contentEpoch: string = LEADERBOARD_CONTENT_EPOCH
): string {
  const epoch = new Date(contentEpoch).getTime();
  let periodStart = 0;
  if (type === 'daily') periodStart = utcDayStart(now).getTime();
  else if (type === 'weekly') periodStart = utcWeekStart(now).getTime();
  return new Date(Math.max(epoch, periodStart)).toISOString();
}

/**
 * Why this run cannot rank, or `null` when it can. Order is diagnostic only -
 * a run can fail several conditions and reports the first.
 */
export function ineligibleReason(
  row: RankableSessionRow,
  window: EligibilityWindow
): IneligibleReason | null {
  if (!row.player_id) return 'no_player';
  if (!row.ended_at) return 'in_progress';
  if (row.validated !== true) return 'not_validated';
  if (row.is_free_play === true) return 'free_play';
  if (row.anomaly_id) return 'anomaly_board';
  // WP-0.06: an expired, abandoned or disconnected run settled to nothing.
  if (!endReasonSettles(row.end_reason)) return 'did_not_settle';
  // WP-0.06: dev/QA/fixture accounts are not shown to strangers (GT §13).
  if (window.excludedPlayerIds?.has(row.player_id)) return 'excluded_cohort';
  if (!row.started_at) return 'before_window';
  if (new Date(row.started_at).getTime() < new Date(window.windowStart).getTime()) {
    return 'before_window';
  }
  return null;
}

/** True when the run may appear on a board. */
export function isEligibleRun(
  row: RankableSessionRow,
  window: EligibilityWindow
): boolean {
  return ineligibleReason(row, window) === null;
}

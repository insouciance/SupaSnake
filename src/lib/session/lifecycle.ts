/**
 * Session lifecycle: how an open run stops being open, and what that costs.
 *
 * Authority: Constitution Rule 11 (server authority) and Rule 6 (what a
 * player earned is permanent). Defect: GT §9.6 — no expiry sweep existed and
 * roughly 30% of production session rows were open forever, so "in progress"
 * meant nothing and every funnel, duration and active-session number was
 * unreliable.
 *
 * There are exactly four ways a session closes, and exactly one of them can
 * carry a payout:
 *
 *   completed     the settlement path recomputed the run, granted what it was
 *                 worth and stamped the row. The ONLY reason a paid run has.
 *   abandoned     the player started a new run while an older one of theirs
 *                 had been open past the stale window. Server-observed at
 *                 session start; the client makes no claim.
 *   disconnected  the client forfeited a run it can no longer finish. The
 *                 forfeit endpoint has no branch that grants anything, so
 *                 this is a pure surrender.
 *   expired       the sweep found the row open past the stale window. Writes
 *                 two columns and touches nothing else.
 *
 * `SETTLED_END_REASON` is the single point where "did this run pay?" is
 * decided. Board eligibility, the Anomaly board RPC and the settlement route
 * all defer to it, so a fifth reason can never be added without deciding, in
 * one place, whether it settles.
 *
 * Everything in this module is pure. It reads no account state, no build
 * state and no score — Rule 2 is unaffected by anything here.
 */

/** Every value `game_sessions.end_reason` may hold (migration 045 CHECK). */
export const SESSION_END_REASONS = [
  'completed',
  'abandoned',
  'disconnected',
  'expired',
] as const;

export type SessionEndReason = (typeof SESSION_END_REASONS)[number];

/**
 * The one reason that means "this run settled". Everything else settled to
 * nothing: no DNA, no Yield, no record, no leaderboard entry.
 */
export const SETTLED_END_REASON: SessionEndReason = 'completed';

/**
 * The reasons a client may ask for when forfeiting its own run. Both close
 * the session for zero; neither can be used to end a run for value, and
 * `completed` and `expired` are deliberately absent — those two are written
 * by the server alone.
 */
export const CLIENT_FORFEIT_REASONS = ['abandoned', 'disconnected'] as const;

export type ClientForfeitReason = (typeof CLIENT_FORFEIT_REASONS)[number];

/**
 * How long a never-settled run may stay open before the sweep closes it.
 *
 * Longer than any run a human plays (the longest production run at audit time
 * was minutes, not hours) and short enough that the open-session count decays
 * within a day. A run still being played when this passes has already lost
 * its client — the engine posts its result at death or extraction, not later.
 */
export const STALE_OPEN_MINUTES = 180;

/**
 * How long a run that DID settle but whose reward write failed may stay open.
 *
 * The route re-opens such a row (`ended_at = null`) so the offline outbox can
 * replay the end and the player gets the DNA they earned. The outbox keeps an
 * entry for 7 days (`REWARD_OUTBOX_MAX_AGE_MS`), so closing the row before
 * then would destroy a payout the player is still owed — Rule 6. One day of
 * margin past the outbox's own expiry.
 */
export const STALE_PENDING_SETTLEMENT_MINUTES = 8 * 24 * 60;

export function isSessionEndReason(value: unknown): value is SessionEndReason {
  return (
    typeof value === 'string' &&
    (SESSION_END_REASONS as readonly string[]).includes(value)
  );
}

export function isClientForfeitReason(
  value: unknown
): value is ClientForfeitReason {
  return (
    typeof value === 'string' &&
    (CLIENT_FORFEIT_REASONS as readonly string[]).includes(value)
  );
}

/**
 * Did the run this reason describes settle?
 *
 * `null` — the row was ended by the pre-045 code path, which had exactly one
 * end route and always settled. Treated as settled so migration-045 rows and
 * the legacy backfill agree.
 */
export function endReasonSettles(reason: unknown): boolean {
  if (reason === null || reason === undefined) return true;
  return reason === SETTLED_END_REASON;
}

/**
 * The inverse, stated as the rule the boards enforce: a run that did not
 * settle is not a result and cannot rank, count, or hold a record.
 */
export function endReasonAwardsNothing(reason: unknown): boolean {
  return !endReasonSettles(reason);
}

/**
 * The `started_at` cutoffs the sweep uses, as ISO strings.
 *
 * Exposed as a pure function so the windows are unit-testable without a clock
 * or a database, and so the route and the RPC cannot drift apart.
 */
export function staleSessionCutoffs(now: Date = new Date()): {
  open: string;
  pendingSettlement: string;
} {
  const minute = 60_000;
  return {
    open: new Date(now.getTime() - STALE_OPEN_MINUTES * minute).toISOString(),
    pendingSettlement: new Date(
      now.getTime() - STALE_PENDING_SETTLEMENT_MINUTES * minute
    ).toISOString(),
  };
}

/** An open `game_sessions` row, reduced to what staleness depends on. */
export interface OpenSessionRow {
  id: string;
  started_at: string | null;
  ended_at: string | null;
  end_reason: string | null;
}

/**
 * Is this open row stale enough to close?
 *
 * A row that already has `ended_at` is not open and is never swept — the
 * sweep can only ever add an ending, never replace one.
 */
export function isStaleOpenSession(
  row: OpenSessionRow,
  now: Date = new Date()
): boolean {
  if (row.ended_at !== null && row.ended_at !== undefined) return false;
  if (!row.started_at) return false;

  const cutoffs = staleSessionCutoffs(now);
  const startedAt = new Date(row.started_at).getTime();
  if (Number.isNaN(startedAt)) return false;

  // A settled-but-unpaid row is waiting for an outbox replay worth real DNA.
  const cutoff =
    row.end_reason === null || row.end_reason === undefined
      ? cutoffs.open
      : cutoffs.pendingSettlement;

  return startedAt < new Date(cutoff).getTime();
}

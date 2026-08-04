/**
 * Absorbing a stranded terminal run — the server-side driver (CE-2)
 *
 * A run the server already terminalized (`continuity_phase = 'terminal'`,
 * `ended_at IS NULL`) had exactly one driver in the shipped design: a browser
 * re-posting `action: 'end'`. Nothing swept it — `expire_stale_game_sessions`
 * skips continuity rows, `list_pending_game_session_ends` needs an envelope
 * this run never staged, and `list_pending_game_progression_sessions` needs
 * `ended_at IS NOT NULL`. One failed fold stranded the row permanently, and
 * because `readActiveRun` kept returning it, the start guard refused every
 * future run on the account.
 *
 * PR #65 fixed the player-present half by folding the row inside the start the
 * player just asked for. This module is that fold, extracted, so the *absent*
 * player is covered too: migration 068's `list_stranded_terminal_runs` finds
 * the row and the settlement sweep drives the very same fold from cron.
 *
 * WHY THE ROUTE IS RE-ENTERED RATHER THAN REIMPLEMENTED
 * -----------------------------------------------------
 * The settlement fold that turns a terminal row into a durable pending end is
 * ~700 lines of economic decision inside `POST /api/game/session`: run-context
 * resolution, the world condition, the genome validation context, the strict
 * mastery read, `validateGameResult`, the Ascendance curve, the Energy
 * commitment multiplier, and the exact envelope shape that migration 066
 * bounds. Copying any of it into a cron would create a second source of truth
 * for what a run pays — the precise failure the Constitution's "one source of
 * truth per fact" exists to prevent, and a place where the two payouts could
 * silently diverge on the next tuning change.
 *
 * So the fold is invoked, not duplicated. The invocation is an in-process call
 * to the exported handler — no network hop, no base URL, no deployment-
 * protection interaction, and no dependence on the request reaching a second
 * lambda. `NextRequest` is only the calling convention of the function being
 * called.
 *
 * WHY THE SWEEP NEEDS ITS OWN IDENTITY
 * ------------------------------------
 * The route authenticates a *player* bearer token. The cron has none and
 * cannot mint one. So the service-role driver identifies itself with the cron
 * secret and names a single session id in a header; `resolveInternalAbsorbIdentity`
 * then derives the owner FROM THAT ROW, and only if the row really is a
 * stranded terminal run. The capability granted is therefore exactly "settle
 * this stranded terminal run, as its owner" — not "act as a player".
 *
 * That is strictly less authority than the sweep already holds: the same cron
 * secret already reaches `settle_game_session_reward_from_snapshot` and
 * `settle_game_session_progression_core`, which credit DNA. This path only
 * lets it reach an *earlier* step of the same pipeline, and every value it
 * settles is derived server-side from `continuity_terminal_facts` that the
 * replay validator wrote. Nothing in the internal request body can raise a
 * payout: it carries only `action` and `sessionId`.
 */

import { NextRequest } from 'next/server';
import type { SupabaseClient } from '@supabase/supabase-js';
import * as Sentry from '@sentry/nextjs';

/** Marks a settlement request that this server issued to itself. */
export const INTERNAL_ABSORB_HEADER = 'x-supasnake-absorb-stranded-run';

/**
 * Names the one session a service-role absorb is allowed to settle. Present
 * only on the cron-driven path; the player-driven absorb already carries the
 * player's own credentials and does not need it.
 */
export const INTERNAL_ABSORB_SESSION_HEADER = 'x-supasnake-absorb-session';

const SESSION_ROUTE_PATH = '/api/game/session';

/** The exported `POST` of the game-session route, as a calling convention. */
export type SessionSettlementHandler = (
  request: NextRequest
) => Promise<Response>;

export interface StrandedTerminalIdentity {
  playerId: string;
  userId: string;
  sessionId: string;
}

export type AbsorbStatus =
  /** The fold closed the run: `ended_at` and a settled receipt exist. */
  | 'settled'
  /** The fold durably staged the run; the pending-end drain finishes it. */
  | 'staged'
  /** The route answered, and its answer was not a settlement. */
  | 'rejected'
  /** The fold threw before answering at all. */
  | 'failed';

export interface AbsorbOutcome {
  status: AbsorbStatus;
  sessionId: string;
  httpStatus: number | null;
  errorClass: string | null;
  message: string | null;
}

/**
 * A shape check, not the access control. The access control is the row
 * predicate below — this only keeps a malformed header out of a query where
 * `game_sessions.id` is a UUID column and anything else is a type error.
 */
const SESSION_ID_PATTERN = /^[A-Za-z0-9_-]{1,64}$/;

export function isSessionIdShaped(value: unknown): value is string {
  return typeof value === 'string' && SESSION_ID_PATTERN.test(value);
}

/** True for any request this server issued to itself. Suppresses recursion. */
export function isInternalAbsorbRequest(headers: Headers): boolean {
  return headers.get(INTERNAL_ABSORB_HEADER) === '1';
}

/**
 * Classify a failure so the sweep's report names what went wrong rather than
 * `[object Object]`. Postgres codes are the most useful discriminator we get;
 * an Error's constructor name is the fallback.
 */
export function settlementErrorClass(error: unknown): string {
  if (error && typeof error === 'object') {
    const record = error as { code?: unknown; name?: unknown };
    if (typeof record.code === 'string' && record.code.length > 0) {
      return record.code;
    }
    if (typeof record.name === 'string' && record.name.length > 0) {
      return record.name;
    }
    return 'object';
  }
  return typeof error;
}

/** The real message, bounded. Never a placeholder — that is the whole point. */
export function settlementErrorMessage(error: unknown, limit = 500): string {
  if (error instanceof Error) return error.message.slice(0, limit);
  if (error && typeof error === 'object') {
    const record = error as { message?: unknown };
    if (typeof record.message === 'string') return record.message.slice(0, limit);
    try {
      return JSON.stringify(error).slice(0, limit);
    } catch {
      return 'unserializable error';
    }
  }
  return String(error).slice(0, limit);
}

/**
 * Derive the owner of a stranded terminal run from the row itself.
 *
 * Returns null unless the named session exists AND is genuinely stranded:
 * a continuity row, phase `terminal`, not yet ended, with the server-derived
 * terminal facts present. Every other session — active, settling, ended,
 * legacy — is refused, which is what keeps the internal path from being a
 * general-purpose impersonation.
 */
export async function resolveInternalAbsorbIdentity(
  supabase: SupabaseClient,
  sessionId: unknown
): Promise<StrandedTerminalIdentity | null> {
  if (!isSessionIdShaped(sessionId)) return null;

  const { data: session, error: sessionError } = await supabase
    .from('game_sessions')
    .select(
      'id, player_id, start_request_id, continuity_phase, continuity_terminal_facts, ended_at, end_reason'
    )
    .eq('id', sessionId)
    .maybeSingle();

  if (sessionError) {
    console.error('Stranded terminal identity lookup failed:', {
      sessionId,
      errorClass: settlementErrorClass(sessionError),
      error: settlementErrorMessage(sessionError),
    });
    Sentry.captureException(sessionError, {
      tags: { progression_stage: 'stranded_terminal_identity' },
      extra: { sessionId },
    });
    return null;
  }

  const row = session as Record<string, unknown> | null;
  if (
    !row ||
    typeof row.player_id !== 'string' ||
    row.start_request_id == null ||
    row.continuity_phase !== 'terminal' ||
    row.continuity_terminal_facts == null ||
    row.ended_at != null ||
    row.end_reason != null
  ) {
    return null;
  }

  const { data: player, error: playerError } = await supabase
    .from('players')
    .select('id, user_id')
    .eq('id', row.player_id)
    .maybeSingle();

  if (playerError) {
    console.error('Stranded terminal owner lookup failed:', {
      sessionId,
      errorClass: settlementErrorClass(playerError),
      error: settlementErrorMessage(playerError),
    });
    Sentry.captureException(playerError, {
      tags: { progression_stage: 'stranded_terminal_identity' },
      extra: { sessionId },
    });
    return null;
  }

  const playerRow = player as Record<string, unknown> | null;
  if (!playerRow || typeof playerRow.user_id !== 'string') return null;

  return {
    playerId: row.player_id,
    userId: playerRow.user_id,
    sessionId: row.id as string,
  };
}

/**
 * Re-enter the audited settlement branch for one stranded terminal run.
 *
 * Never throws: absorption is recovery, and its failure must not become a
 * different failure for whatever the caller was actually doing. The outcome
 * is returned so a caller that keeps counts (the sweep) can keep honest ones,
 * and every non-settlement is reported with its session id, error class and
 * the real message — the fail-loud rule from PR #72, which exists because the
 * first version of this absorb reported only 5xx and a 4xx rejection left no
 * trace at all.
 */
export async function absorbStrandedTerminalRun(
  handler: SessionSettlementHandler,
  input: {
    requestUrl: string;
    authorization: string;
    sessionId: string;
    playerId: string;
    /** Set when the caller is the cron, not the player who owns the run. */
    serviceRole?: boolean;
  }
): Promise<AbsorbOutcome> {
  const { requestUrl, authorization, sessionId, playerId } = input;
  try {
    // `new URL(...)` rather than `request.nextUrl`: NextURL is not a URL
    // instance, and passing a non-Request, non-URL input to the Request
    // constructor is a runtime hazard that would surface only in production.
    const internal = new NextRequest(new URL(SESSION_ROUTE_PATH, requestUrl), {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        authorization,
        [INTERNAL_ABSORB_HEADER]: '1',
        ...(input.serviceRole
          ? { [INTERNAL_ABSORB_SESSION_HEADER]: sessionId }
          : {}),
      },
      body: JSON.stringify({ action: 'end', sessionId }),
    });
    const response = await handler(internal);

    // A settlement (200) or a durable staging (202) are both successes: the
    // 202 means the value is committed to the pending queue, which the same
    // sweep pass drains. Anything else is reported with its body.
    if (response.status === 200 || response.status === 202) {
      return {
        status: response.status === 200 ? 'settled' : 'staged',
        sessionId,
        httpStatus: response.status,
        errorClass: null,
        message: null,
      };
    }

    const detail = await response
      .clone()
      .text()
      .then((body) => body.slice(0, 1000))
      .catch(() => '<unreadable>');
    console.error('Stranded terminal run absorption did not settle:', {
      playerId,
      sessionId,
      status: response.status,
      errorClass: `http_${response.status}`,
      body: detail,
    });
    Sentry.captureMessage('Stranded terminal run absorption did not settle', {
      level: 'error',
      tags: { progression_stage: 'stranded_terminal_absorb' },
      extra: { playerId, sessionId, status: response.status, body: detail },
    });
    return {
      status: 'rejected',
      sessionId,
      httpStatus: response.status,
      errorClass: `http_${response.status}`,
      message: detail,
    };
  } catch (error) {
    console.error('Stranded terminal run absorption failed:', {
      playerId,
      sessionId,
      errorClass: settlementErrorClass(error),
      error: settlementErrorMessage(error),
    });
    Sentry.captureException(
      error instanceof Error
        ? error
        : new Error('Stranded terminal run absorption failed'),
      {
        tags: { progression_stage: 'stranded_terminal_absorb' },
        extra: { playerId, sessionId },
      }
    );
    return {
      status: 'failed',
      sessionId,
      httpStatus: null,
      errorClass: settlementErrorClass(error),
      message: settlementErrorMessage(error),
    };
  }
}

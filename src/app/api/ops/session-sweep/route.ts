/**
 * Stale-session sweep (GT §9.6) — GET /api/ops/session-sweep
 *
 * The frequent Vercel cron that makes "in progress" mean something. Before this
 * existed nothing ever closed an abandoned run, so roughly 30% of session rows
 * were open forever and every funnel, duration and active-session number was
 * measuring a fiction.
 *
 * Auth: exact `CRON_SECRET` bearer, the same contract as
 * `/api/discord/dispatch` and `/api/analyst/cron`. There is no unauthenticated
 * path and no player-facing path — Rule 11: expiry is a server act, and the
 * client never closes a session for reward purposes.
 *
 * CE-2 — THE SWEEP IS THE PRIMARY SETTLER
 *
 * The ratified contract is that settlement completes without the player
 * returning: the server settles, the client only accelerates. This route was
 * the weaker half of that pair — a low-priority janitor beside a browser that
 * did the real work — and four things kept it that way. All four are fixed
 * here and in migration 068:
 *
 *   1. A whole state had NO server driver. A run the server terminalized but
 *      never settled (`continuity_phase = 'terminal'`, `ended_at IS NULL`) was
 *      invisible to every scan, so its value could not settle unless the
 *      player came back. The sweep now drives it through the same audited
 *      settlement branch the browser would have — see `strandedTerminalRun.ts`
 *      for why the fold is re-entered rather than reimplemented.
 *   2. HEAD-OF-LINE BLOCKING. The scan was `DISTINCT ON (player_id)`, so one
 *      unsettleable run starved every later run on that account, forever.
 *      Migration 068 removes it; this route processes per session, and each
 *      session's failure is isolated from every other's.
 *   3. NO BACKOFF. Permanently failing rows re-consumed the batch every pass.
 *      They are now spaced exponentially by `progression_recovery_attempts`
 *      and — this is an absolute — never retired. A row that has crossed the
 *      attention threshold is reported by name in this response instead.
 *   4. ONE SMALL BATCH PER PASS. The cadence is fixed by `vercel.json`, whose
 *      definitions are pinned by the release runbook, so a pass now does as
 *      much as its duration budget allows: each stage loops until it runs out
 *      of work or of time.
 *
 * `expire_stale_game_sessions` (migration 045) writes `ended_at` and
 * `end_reason = 'expired'` on `game_sessions` and nothing else — it names no
 * other table and touches none of `score`, `dna_earned`, `yield_dna` or
 * `validated`. The rows it closes carry a reason that is not `completed`, so
 * `endReasonSettles` answers `false` for them and they are refused by the
 * boards, by the Anomaly board and by the settlement route, which will not
 * re-end an already-ended session at all. An expired run settles to nothing,
 * and there is no statement anywhere on this path that could make it settle to
 * something. Separately, bounded sequential batches resume completed
 * `atomic_v1` progression from its immutable server snapshot. That recovery
 * may secure value already owed by a completed run, but never derives progress
 * from the client or browser and is idempotent by session.
 *
 * Response: `{ ok, expired, skipped, ... }` with a count for every stage.
 * `skipped` is true in the window before migration 045 is applied — expected,
 * not an error.
 */

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { isAuthorizedCron } from '@/lib/server/cronAuth';
import { expireStaleSessions } from '@/lib/server/sessionLifecycle';
import {
  adoptPendingGameSessionEnds,
  listPendingRunProgression,
  listStrandedTerminalRuns,
  resumeOrRecoverRunImpact,
  type PendingEndAdoptionSummary,
} from '@/lib/server/gameProgressionSettlement';
import {
  absorbStrandedTerminalRun,
  settlementErrorClass,
  settlementErrorMessage,
} from '@/lib/server/strandedTerminalRun';
// The settlement fold lives in the game-session route and is invoked, never
// copied: a second implementation of what a run pays is exactly the divergence
// the Constitution's one-source-of-truth rule forbids. This is an in-process
// function call — `NextRequest` is only its calling convention.
import { POST as settleGameSession } from '@/app/api/game/session/route';

export const maxDuration = 300;

/**
 * Stop starting new work here, so the invocation always returns its report
 * rather than being killed mid-batch with its counts unread. The margin is
 * generous because a single settlement runs several durable stages.
 */
const SWEEP_TIME_BUDGET_MS = 225_000;

/**
 * One scan's ceiling. The loop below, not this number, decides how much a pass
 * accomplishes; keeping each claim modest bounds how much work a crashed
 * invocation leaves claimed-but-unattempted until its backoff expires.
 */
const PROGRESSION_BATCH_LIMIT = 50;
const STRANDED_TERMINAL_BATCH_LIMIT = 25;
const PENDING_END_BATCH_LIMIT = 50;

/** Hard stop on loop iterations, so a scan that never drains cannot spin. */
const MAX_STAGE_PASSES = 25;

/**
 * A row the server has tried this many times is not given up on — nothing is
 * ever given up on — but it stops being a silent statistic and is named in the
 * response, which is the operator's cue that it needs a human.
 */
export const RECOVERY_ATTENTION_THRESHOLD = 8;

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || '',
  process.env.SUPABASE_SERVICE_ROLE_KEY || ''
);

interface SettlementFailure {
  stage: 'stranded_terminal' | 'progression';
  playerId: string;
  sessionId: string;
  errorClass: string;
  message: string;
  attempts: number;
}

interface AttentionRow {
  stage: 'stranded_terminal' | 'progression';
  playerId: string;
  sessionId: string;
  attempts: number;
}

function isOrderedProgressionDebt(error: unknown): boolean {
  return /GAME_PROGRESSION_EARLIER_(?:SESSION|CLAN|SIGNAL)_PENDING/i.test(
    settlementErrorMessage(error)
  );
}

export async function GET(request: NextRequest) {
  if (!isAuthorizedCron(request.headers)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const startedAt = Date.now();
  const budgetRemaining = () => SWEEP_TIME_BUDGET_MS - (Date.now() - startedAt);

  const result = await expireStaleSessions(supabase);

  if (result.expired === null && !result.skipped) {
    // The helper already reported it to Sentry; the cron needs a non-200 so a
    // silent, permanently failing sweep is visible in the platform log.
    return NextResponse.json({ error: 'Sweep failed' }, { status: 500 });
  }

  const failures: SettlementFailure[] = [];
  const attention: AttentionRow[] = [];

  // -----------------------------------------------------------------
  // Stage 1 — the state nothing covered: stranded terminal runs
  // -----------------------------------------------------------------
  // Runs first, so anything it stages is adopted and settled by the two
  // stages below inside this same invocation rather than ten minutes later.
  const authorization = request.headers.get('authorization') ?? '';
  // One session gets one attempt per invocation. Backoff makes the first
  // retry immediate — deliberately, so a run absorbed by stage 1 is settled
  // by stage 3 in this same pass — which would otherwise let a stage's loop
  // re-claim a row it has already failed on, spending the budget on the same
  // failure instead of on the next player's run.
  const attemptedStranded = new Set<string>();
  const attemptedProgression = new Set<string>();
  let strandedScanned = 0;
  let strandedSettled = 0;
  let strandedStaged = 0;
  let strandedRejected = 0;
  let strandedFailed = 0;

  for (let pass = 0; pass < MAX_STAGE_PASSES; pass += 1) {
    if (budgetRemaining() <= 0) break;
    const stranded = await listStrandedTerminalRuns(
      supabase,
      STRANDED_TERMINAL_BATCH_LIMIT
    );
    if (stranded === null) {
      return NextResponse.json(
        { error: 'Stranded terminal scan failed' },
        { status: 500 }
      );
    }
    const fresh = stranded.filter(
      (candidate) => !attemptedStranded.has(candidate.sessionId)
    );
    if (fresh.length === 0) break;
    strandedScanned += fresh.length;

    for (const candidate of fresh) {
      attemptedStranded.add(candidate.sessionId);
      if (candidate.recoveryAttempts >= RECOVERY_ATTENTION_THRESHOLD) {
        attention.push({
          stage: 'stranded_terminal',
          playerId: candidate.playerId,
          sessionId: candidate.sessionId,
          attempts: candidate.recoveryAttempts,
        });
      }
      // Per-session isolation: `absorbStrandedTerminalRun` never throws, so
      // one poisoned run can neither abort the batch nor deny a different
      // run — of this player or any other — its own attempt.
      const outcome = await absorbStrandedTerminalRun(settleGameSession, {
        requestUrl: request.url,
        authorization,
        sessionId: candidate.sessionId,
        playerId: candidate.playerId,
        serviceRole: true,
      });
      if (outcome.status === 'settled') strandedSettled += 1;
      else if (outcome.status === 'staged') strandedStaged += 1;
      else {
        // The absorb already logged and reported this with its body. Record
        // it here so the count is in the response the operator reads.
        if (outcome.status === 'failed') strandedFailed += 1;
        else strandedRejected += 1;
        failures.push({
          stage: 'stranded_terminal',
          playerId: candidate.playerId,
          sessionId: candidate.sessionId,
          errorClass: outcome.errorClass ?? 'unknown',
          message: outcome.message ?? 'absorption did not settle',
          attempts: candidate.recoveryAttempts,
        });
      }
      if (budgetRemaining() <= 0) break;
    }
    if (stranded.length < STRANDED_TERMINAL_BATCH_LIMIT) break;
  }

  // -----------------------------------------------------------------
  // Stage 2 — adopt durable ends
  // -----------------------------------------------------------------
  // Service-authored ends that crossed the 060→061 DDL boundary, plus
  // anything stage 1 just staged. The progression scan below can then settle
  // their atomic snapshots in this same cron invocation.
  const pendingEndAdoption: PendingEndAdoptionSummary = {
    phase: 'ready',
    scanned: 0,
    adopted: 0,
    superseded: 0,
    failed: 0,
    failures: [],
  };
  for (let pass = 0; pass < MAX_STAGE_PASSES; pass += 1) {
    if (budgetRemaining() <= 0) break;
    const batch = await adoptPendingGameSessionEnds(
      supabase,
      PENDING_END_BATCH_LIMIT
    );
    if (batch === null) {
      return NextResponse.json(
        { error: 'Pending end adoption failed' },
        { status: 500 }
      );
    }
    pendingEndAdoption.phase = batch.phase;
    pendingEndAdoption.scanned += batch.scanned;
    pendingEndAdoption.adopted += batch.adopted;
    pendingEndAdoption.superseded += batch.superseded;
    pendingEndAdoption.failed += batch.failed;
    pendingEndAdoption.failures.push(...batch.failures);
    // A bridge phase scans nothing, and a short batch means the queue is
    // drained. Either way there is no second helping to fetch.
    if (batch.scanned < PENDING_END_BATCH_LIMIT) break;
  }

  // -----------------------------------------------------------------
  // Stage 3 — resume durable progression
  // -----------------------------------------------------------------
  let progressionScanned = 0;
  let progressionSettled = 0;
  let progressionFailed = 0;
  let progressionDeferred = 0;

  for (let pass = 0; pass < MAX_STAGE_PASSES; pass += 1) {
    if (budgetRemaining() <= 0) break;
    const pending = await listPendingRunProgression(
      supabase,
      PROGRESSION_BATCH_LIMIT
    );
    if (pending === null) {
      return NextResponse.json(
        { error: 'Progression scan failed' },
        { status: 500 }
      );
    }
    const fresh = pending.filter(
      (item) => !attemptedProgression.has(item.sessionId)
    );
    if (fresh.length === 0) break;
    progressionScanned += fresh.length;

    for (const item of fresh) {
      attemptedProgression.add(item.sessionId);
      if (item.recoveryAttempts >= RECOVERY_ATTENTION_THRESHOLD) {
        attention.push({
          stage: 'progression',
          playerId: item.playerId,
          sessionId: item.sessionId,
          attempts: item.recoveryAttempts,
        });
      }
      // Per-session isolation. `resumeOrRecoverRunImpact` reports its own
      // stages, but an unexpected throw here used to abort the entire pass —
      // every later session in the batch, of every other player, silently
      // lost its turn. It cannot any more.
      let resumed: Awaited<ReturnType<typeof resumeOrRecoverRunImpact>> | null =
        null;
      let thrown: unknown = null;
      try {
        resumed = await resumeOrRecoverRunImpact(
          supabase,
          item.playerId,
          item.sessionId
        );
      } catch (error) {
        thrown = error;
      }
      const resumedError =
        thrown ?? (resumed && 'error' in resumed ? resumed.error : null);

      if (resumed?.status === 'found') progressionSettled += 1;
      else if (
        resumed?.status === 'pending' ||
        (resumed?.status === 'unavailable' &&
          isOrderedProgressionDebt(resumedError))
      ) {
        // Ordered durable debt: the earlier session of this player has not
        // settled yet. Not a fault, and no longer a starvation either — the
        // earlier session was offered its own attempt in this same batch.
        progressionDeferred += 1;
      } else {
        progressionFailed += 1;
        const error = resumedError;
        failures.push({
          stage: 'progression',
          playerId: item.playerId,
          sessionId: item.sessionId,
          errorClass: settlementErrorClass(error),
          message: settlementErrorMessage(error),
          attempts: item.recoveryAttempts,
        });
        console.error('Sweep progression settlement failed:', {
          playerId: item.playerId,
          sessionId: item.sessionId,
          protocol: item.protocol,
          status: resumed?.status ?? 'threw',
          attempts: item.recoveryAttempts,
          errorClass: settlementErrorClass(error),
          error: settlementErrorMessage(error),
        });
      }
      if (budgetRemaining() <= 0) break;
    }
    if (pending.length < PROGRESSION_BATCH_LIMIT) break;
  }

  const body = {
    ok: true,
    expired: result.expired ?? 0,
    skipped: result.skipped,
    strandedScanned,
    strandedSettled,
    strandedStaged,
    strandedRejected,
    strandedFailed,
    pendingEndPhase: pendingEndAdoption.phase,
    pendingEndsScanned: pendingEndAdoption.scanned,
    pendingEndsAdopted: pendingEndAdoption.adopted,
    pendingEndsSuperseded: pendingEndAdoption.superseded,
    pendingEndsFailed: pendingEndAdoption.failed,
    pendingEndFailures: pendingEndAdoption.failures,
    progressionScanned,
    progressionSettled,
    progressionDeferred,
    progressionFailed,
    // Every failure carries its session id, its error class and the real
    // message. A count alone sends an operator back to the logs to find out
    // what happened; that round trip is how the last incident stayed
    // invisible through a full deploy.
    settlementFailures: failures,
    // Retained under its original name and shape for anything already reading
    // the sweep's output; `settlementFailures` is the superset.
    progressionFailures: failures
      .filter((failure) => failure.stage === 'progression')
      .map(({ playerId, sessionId, errorClass, message }) => ({
        playerId,
        sessionId,
        errorClass,
        message,
      })),
    // Named, not retired. Backoff spaces these retries out; it never stops
    // them. This list is the exit from "quietly failing forever".
    recoveryAttention: attention,
    budgetExhausted: budgetRemaining() <= 0,
    elapsedMs: Date.now() - startedAt,
  };

  if (
    pendingEndAdoption.failed > 0 ||
    progressionFailed > 0 ||
    strandedFailed > 0
  ) {
    return NextResponse.json(
      { ...body, ok: false, error: 'Progression settlement failed' },
      { status: 500 }
    );
  }
  return NextResponse.json(body);
}

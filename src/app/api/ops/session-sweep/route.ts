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
 * TWO SERVER-ONLY JOBS
 *
 * `expire_stale_game_sessions` (migration
 * 045) writes `ended_at` and `end_reason = 'expired'` on `game_sessions` and
 * nothing else — it names no other table and touches none of `score`,
 * `dna_earned`, `yield_dna` or `validated`. The rows it closes carry a reason
 * that is not `completed`, so `endReasonSettles` answers `false` for them and
 * they are refused by the boards, by the Anomaly board and by the settlement
 * route, which will not re-end an already-ended session at all. An expired run
 * settles to nothing, and there is no statement anywhere on this path that
 * could make it settle to something. Separately, a bounded sequential batch
 * resumes completed `atomic_v1` progression from its immutable server snapshot.
 * That recovery may secure value already owed by a completed run, but never
 * derives progress from the client or browser and is idempotent by session.
 *
 * Response: `{ ok, expired, skipped }`. `skipped` is true in the window before
 * migration 045 is applied — expected, not an error.
 */

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { isAuthorizedCron } from '@/lib/server/cronAuth';
import { expireStaleSessions } from '@/lib/server/sessionLifecycle';
import {
  adoptPendingGameSessionEnds,
  listPendingRunProgression,
  resumeOrRecoverRunImpact,
} from '@/lib/server/gameProgressionSettlement';

// A batch can adopt and run several independent durable settlement stages for
// each candidate. Match the proven game-settlement ceiling so a legitimate
// backlog is not cut off mid-recovery by the platform.
export const maxDuration = 300;
const PROGRESSION_BATCH_LIMIT = 20;

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || '',
  process.env.SUPABASE_SERVICE_ROLE_KEY || ''
);

export async function GET(request: NextRequest) {
  if (!isAuthorizedCron(request.headers)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const result = await expireStaleSessions(supabase);

  if (result.expired === null && !result.skipped) {
    // The helper already reported it to Sentry; the cron needs a non-200 so a
    // silent, permanently failing sweep is visible in the platform log.
    return NextResponse.json({ error: 'Sweep failed' }, { status: 500 });
  }

  // First adopt any service-authored ends that crossed the 060→061 DDL
  // boundary. The progression scan below can then settle their atomic
  // snapshots in this same cron invocation.
  const pendingEndAdoption = await adoptPendingGameSessionEnds(
    supabase,
    PROGRESSION_BATCH_LIMIT
  );
  if (pendingEndAdoption === null) {
    return NextResponse.json({ error: 'Pending end adoption failed' }, { status: 500 });
  }

  const pending = await listPendingRunProgression(supabase, PROGRESSION_BATCH_LIMIT);
  if (pending === null) {
    return NextResponse.json({ error: 'Progression scan failed' }, { status: 500 });
  }
  let progressionSettled = 0;
  let progressionFailed = 0;
  let progressionDeferred = 0;
  const progressionFailures: Array<{
    playerId: string;
    sessionId: string;
    protocol: string | null;
    status: string;
  }> = [];
  for (const item of pending) {
    const resumed = await resumeOrRecoverRunImpact(
      supabase,
      item.playerId,
      item.sessionId
    );
    if (resumed.status === 'found') progressionSettled += 1;
    else if (
      resumed.status === 'pending' ||
      (resumed.status === 'unavailable' &&
      resumed.error &&
      typeof resumed.error === 'object' &&
      'message' in resumed.error &&
      /GAME_PROGRESSION_EARLIER_(?:SESSION|CLAN|SIGNAL)_PENDING/i.test(
        String((resumed.error as { message?: unknown }).message ?? '')
      ))
    ) {
      progressionDeferred += 1;
    }
    else {
      progressionFailed += 1;
      progressionFailures.push({
        playerId: item.playerId,
        sessionId: item.sessionId,
        protocol: item.protocol,
        status: resumed.status,
      });
    }
  }

  const body = {
    ok: true,
    expired: result.expired ?? 0,
    skipped: result.skipped,
    pendingEndPhase: pendingEndAdoption.phase,
    pendingEndsScanned: pendingEndAdoption.scanned,
    pendingEndsAdopted: pendingEndAdoption.adopted,
    pendingEndsSuperseded: pendingEndAdoption.superseded,
    pendingEndsFailed: pendingEndAdoption.failed,
    pendingEndFailures: pendingEndAdoption.failures,
    progressionScanned: pending.length,
    progressionSettled,
    progressionDeferred,
    progressionFailed,
    progressionFailures,
  };
  if (pendingEndAdoption.failed > 0 || progressionFailed > 0) {
    return NextResponse.json(
      { ...body, ok: false, error: 'Progression settlement failed' },
      { status: 500 }
    );
  }
  return NextResponse.json(body);
}

/**
 * Signal settlement sweep — GET /api/ops/signal-settlement (Constitution §7.2).
 *
 * §7.2: "Rewards settle automatically — no claim cascades, ever." The session
 * route settles the day's attempt at the end of the run that owns it; this
 * sweep is the safety net behind that, and the reason there is no claim
 * endpoint to build instead.
 *
 * Auth: exact `CRON_SECRET` bearer, the same contract as
 * `/api/ops/serpent-settlement`, `/api/ops/session-sweep`,
 * `/api/discord/dispatch` and `/api/analyst/cron`. There is no
 * unauthenticated path and no player-facing path — settlement is a server act,
 * and no client may trigger, influence or replay it (Rule 11).
 *
 * WHY RUNNING THIS TWICE IS SAFE
 *
 * Nothing on this path increments anything. `settleSignalObjectiveRun` is an
 * exact recompute: the objective is re-derived from the calendar, the run is
 * re-read from its session row, progress lands through `GREATEST`, completion
 * is a `COALESCE` latch, and the flat first-completion bonus is paid through a
 * compare-and-set under a row lock. A double fire, a retry, or a re-run after
 * a partial failure converges on the same stored answer and pays nothing the
 * second time — `bonusDnaPaid` is the honest test of that: positive on the
 * first sweep over an attempt, exactly 0 on every one after.
 *
 * The sweep is deliberately generous about what is "due": every attempt from
 * the last `SIGNAL_RESETTLE_WINDOW_MS`, not just today's. A missed cron, a
 * failed deploy or an outage therefore catches up instead of stranding a
 * Signal a player completed (Rule 5 and Rule 6 — the operator's absence must
 * not cost the player either).
 *
 * WHAT IT CANNOT DO
 *
 * It pays the §7.2 flat bonus and nothing else. Neither this route,
 * `autoSettleSignalAttempts`, nor `settle_signal_objective_run` writes a
 * cosmetic, an entitlement, a subscription or a charge, and the bonus amount
 * is clamped inside the RPC, so a wrong caller under-pays at worst (§12.2).
 *
 * Response: `{ ok, settled: [...], bonusDnaPaid, skipped }`. `skipped` is true
 * in the window before migration 049 is applied — expected, not an error. An
 * attempt that failed to settle returns 500 so a silently broken cron is
 * visible in the platform log; the next run retries it.
 */

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { isAuthorizedCron } from '@/lib/server/cronAuth';
import { autoSettleSignalAttempts } from '@/lib/server/signal';
import {
  listPendingRunProgression,
  resumeOrRecoverRunImpact,
} from '@/lib/server/gameProgressionSettlement';

export const maxDuration = 60;
const PROGRESSION_BATCH_LIMIT = 20;

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || '',
  process.env.SUPABASE_SERVICE_ROLE_KEY || ''
);

export async function GET(request: NextRequest) {
  if (!isAuthorizedCron(request.headers)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  // Atomic sessions must pass the ordered durable Signal preflight before the
  // legacy-compatible sweep may touch their attempt. The database enforces
  // this too; doing the recovery first lets this cron remain a useful second
  // worker without becoming an ordering bypass.
  const pending = await listPendingRunProgression(supabase, PROGRESSION_BATCH_LIMIT);
  if (pending === null) {
    return NextResponse.json({ error: 'Progression scan failed' }, { status: 500 });
  }
  let progressionSettled = 0;
  let progressionDeferred = 0;
  let progressionFailed = 0;
  for (const item of pending) {
    const recovered = await resumeOrRecoverRunImpact(
      supabase,
      item.playerId,
      item.sessionId
    );
    if (recovered.status === 'found') progressionSettled += 1;
    else if (recovered.status === 'pending') progressionDeferred += 1;
    else progressionFailed += 1;
  }

  const result = await autoSettleSignalAttempts(supabase);

  const body = {
    ok: !result.failed,
    settled: result.settled.map((attempt) => ({
      runId: attempt.runId,
      dayId: attempt.dayId,
      completed: attempt.completed,
      progress: attempt.progress,
      target: attempt.target,
      bonusDna: attempt.bonusDna,
      newMilestones: attempt.newMilestones,
      skipped: attempt.skipped,
      failed: attempt.failed,
    })),
    // 0 on every sweep after the first over the same attempts. That is the
    // idempotency property, reported rather than assumed.
    bonusDnaPaid: result.bonusDnaPaid,
    skipped: result.skipped,
    progressionScanned: pending.length,
    progressionSettled,
    progressionDeferred,
    progressionFailed,
  };

  if (result.failed || progressionFailed > 0) {
    // The engine already reported it to Sentry; the cron needs a non-200 so a
    // permanently failing settlement is visible on the platform.
    return NextResponse.json({ ...body, error: 'Settlement failed' }, { status: 500 });
  }

  return NextResponse.json(body);
}

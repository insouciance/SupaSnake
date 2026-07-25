/**
 * Stale-session sweep (GT §9.6) — GET /api/ops/session-sweep
 *
 * The daily Vercel cron that makes "in progress" mean something. Before this
 * existed nothing ever closed an abandoned run, so roughly 30% of session rows
 * were open forever and every funnel, duration and active-session number was
 * measuring a fiction.
 *
 * Auth: exact `CRON_SECRET` bearer, the same contract as
 * `/api/discord/dispatch` and `/api/analyst/cron`. There is no unauthenticated
 * path and no player-facing path — Rule 11: expiry is a server act, and the
 * client never closes a session for reward purposes.
 *
 * WHY THIS CANNOT AWARD ANYTHING
 *
 * The whole route is one RPC call. `expire_stale_game_sessions` (migration
 * 045) writes `ended_at` and `end_reason = 'expired'` on `game_sessions` and
 * nothing else — it names no other table and touches none of `score`,
 * `dna_earned`, `yield_dna` or `validated`. The rows it closes carry a reason
 * that is not `completed`, so `endReasonSettles` answers `false` for them and
 * they are refused by the boards, by the Anomaly board and by the settlement
 * route, which will not re-end an already-ended session at all. An expired run
 * settles to nothing, and there is no statement anywhere on this path that
 * could make it settle to something.
 *
 * Response: `{ ok, expired, skipped }`. `skipped` is true in the window before
 * migration 045 is applied — expected, not an error.
 */

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { isAuthorizedCron } from '@/lib/server/cronAuth';
import { expireStaleSessions } from '@/lib/server/sessionLifecycle';

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

  return NextResponse.json({
    ok: true,
    expired: result.expired ?? 0,
    skipped: result.skipped,
  });
}

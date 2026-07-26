/**
 * Push dispatch sweep — GET /api/ops/push-dispatch (WP-2.04).
 *
 * The one caller of the send path, and the only place in the product where a
 * notification can originate. It asks exactly two questions:
 *
 *   1. Did a Serpent week settle recently?  (§7.3)
 *   2. Did a new Signal day just open?      (§7.2)
 *
 * and there is no third question. The loop below iterates `PUSH_TRIGGER_IDS`,
 * which is a two-element frozen list whose length is asserted at module load
 * in `src/lib/push/triggers.ts` — so this route cannot grow a third dispatch
 * without that import throwing and this route 500ing on every request.
 *
 * Auth: exact `CRON_SECRET` bearer, the same contract as
 * `/api/ops/serpent-settlement`, `/api/ops/signal-settlement`,
 * `/api/ops/settlement-dispatch` and `/api/ops/session-sweep`. There is no
 * unauthenticated path and no player-facing path (Rule 11), which is also what
 * makes Rule 1 structural: no request a player can make reaches this code, so
 * nothing here can fire during a run.
 *
 * WHY RUNNING THIS TWICE IS SAFE
 *
 *   `dispatchPushForTrigger` claims a `push_dispatch_log` row per
 *   (trigger, occurrence, subscription) BEFORE it posts, with
 *   `ON CONFLICT DO NOTHING`. A double fire, a retry, or a hand-replay claims
 *   nothing and therefore sends nothing — `claimed: 0` on the second run is
 *   the honest report of that.
 *
 * FLAG OFF: 200 with `skipped: 'flag-off'` and nothing sent. A cron pointed at
 * a dark deployment is silent, not broken. VAPID unconfigured, which is the
 * state this work package merges in, reports `vapid-unconfigured` the same way.
 *
 * Response is operational only: counts, never a player, never an address,
 * never an endpoint.
 */

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { isAuthorizedCron } from '@/lib/server/cronAuth';
import { dispatchPushForTrigger, type DispatchResult } from '@/lib/push/dispatch';
import { PUSH_TRIGGER_IDS, type PushTriggerId } from '@/lib/push/triggers';
import { newSignalOccurrence, settledSerpentOccurrence } from '@/lib/push/occurrences';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || '',
  process.env.SUPABASE_SERVICE_ROLE_KEY || ''
);

export async function GET(request: NextRequest) {
  if (!isAuthorizedCron(request.headers)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const now = Date.now();

  /**
   * The trigger points, resolved. This record is typed by `PushTriggerId`, so
   * it must name every permitted trigger and cannot name anything else — a
   * third key does not compile, and a missing key does not compile either.
   */
  const occurrences: Record<PushTriggerId, string | null> = {
    'serpent-settlement': await settledSerpentOccurrence(supabase, now),
    'signal-new': newSignalOccurrence(now),
  };

  const dispatched: DispatchResult[] = [];
  for (const triggerId of PUSH_TRIGGER_IDS) {
    const occurrenceKey = occurrences[triggerId];
    if (!occurrenceKey) continue;
    dispatched.push(await dispatchPushForTrigger(supabase, triggerId, occurrenceKey, {}));
  }

  return NextResponse.json({
    ok: true,
    triggers: PUSH_TRIGGER_IDS,
    dispatched: dispatched.map((result) => ({
      triggerId: result.triggerId,
      occurrenceKey: result.occurrenceKey,
      skipped: result.skipped,
      eligible: result.eligible,
      claimed: result.claimed,
      sent: result.sent,
      failed: result.failed,
      gone: result.gone,
      refusals: result.refusals,
    })),
  });
}

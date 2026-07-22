/**
 * Discord event-feed dispatcher (Player Identity v1 section 8.4) - the
 * outbox consumer behind the repo's first Vercel cron (vercel.json,
 * every 5 minutes).
 *
 * GET /api/discord/dispatch
 *   Protected: `Authorization: Bearer ${CRON_SECRET}` (Vercel attaches
 *   it automatically to cron invocations when the env var is set).
 *   Everything else: 401.
 *
 *   Drains up to 10 pending outbox rows (attempts-based exponential
 *   skip, dead-letter at 5) and runs the section 8.5 30-day stale-grant
 *   sweep. Returns counts - no event payloads, no tokens.
 */

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import {
  drainDiscordOutbox,
  sweepStaleDiscordLinks,
} from '@/lib/server/discordSync';
import { isAuthorizedCron } from '@/lib/server/cronAuth';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || '',
  process.env.SUPABASE_SERVICE_ROLE_KEY || ''
);

const DISPATCH_BATCH = 10;

export async function GET(request: NextRequest) {
  try {
    if (!isAuthorizedCron(request.headers)) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const drain = await drainDiscordOutbox(supabase, DISPATCH_BATCH);
    const swept = drain.live ? await sweepStaleDiscordLinks(supabase) : 0;

    return NextResponse.json({
      live: drain.live,
      scanned: drain.scanned,
      sent: drain.sent,
      failed: drain.failed,
      dead: drain.dead,
      sweptLinks: swept,
    });
  } catch (error) {
    console.error('Discord dispatch error:', error);
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}

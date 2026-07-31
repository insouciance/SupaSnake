/**
 * The World Report — GET /api/report (Constitution §7.5).
 *
 * "When a player comes back after three or more absent days, one screen ...
 * reports what moved ... written as news, never as debt: no claims, no
 * catch-up tasks, nothing owed."
 *
 * ── CONTRACT ───────────────────────────────────────────────────────────────
 *
 * Request:  GET /api/report
 *           Authorization: Bearer <supabase access token>   (required)
 *           No query parameters. The absence, battle cycles and day are all
 *           derived from the server's clock and the player's own rows — there
 *           is no parameter through which a client could assert how long it
 *           was away or what the world did (Rule 11).
 *
 * 200 response:
 * {
 *   live: boolean,                 // false = flag off
 *   report: {
 *     awayDays: number,
 *     span: 'days' | 'week' | 'month' | 'season',
 *     weeksSubmerged: number,       // historical compatibility; current path = 0
 *     battleCyclesSettled: number,
 *     headline: string,
 *     sections: Array<{
 *       id: 'battles' | 'weeks' | 'clan' | 'records' | 'standing' | 'today',
 *       title: string,
 *       lines: Array<{ text: string, href?: string }>
 *     }>,
 *     links: string[]              // canonical artifact URLs, never endpoints
 *   } | null                       // null = nothing to report; render nothing
 * }
 *
 * 401: `{ error: 'Unauthorized' }` / `{ error: 'Invalid token' }`
 * 404: `{ error: 'Player not found' }`
 *
 * ── WHAT THIS ROUTE IS NOT ─────────────────────────────────────────────────
 *
 * There is NO POST, NO PATCH and NO sibling collect endpoint, now or ever
 * (§12.2: the World Report is "not a new claim"). This route writes nothing:
 * it does not mark the report seen, does not stamp a last-visit column and
 * does not settle anything, so calling it twice is indistinguishable from
 * calling it once and there is no state for a returning player to be behind
 * on. There is no currency, amount, balance or expiry in the payload, and no
 * threshold, rank, bar or cut line anywhere in it (Rule 8).
 *
 * It is also not a daily or weekly surface (§12.2, Rule 10). It appears on
 * return and then does not appear again until the next return; it has no beat,
 * no reset and no cadence of its own.
 *
 * Flag off: 200 with `live: false, report: null`, so a surface renders an off
 * state rather than having to special-case a 404.
 *
 * Rule 11: every Supabase `error` is checked and reported to Sentry.
 */

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import * as Sentry from '@sentry/nextjs';

import { WORLD_REPORT_V1_ENABLED } from '@/lib/report/config';
import { buildWorldReport } from '@/lib/server/worldReport';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || '',
  process.env.SUPABASE_SERVICE_ROLE_KEY || ''
);

export async function GET(request: NextRequest) {
  const authHeader = request.headers.get('authorization');
  if (!authHeader) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const token = authHeader.replace('Bearer ', '');
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser(token);

  if (authError || !user) {
    return NextResponse.json({ error: 'Invalid token' }, { status: 401 });
  }

  if (!WORLD_REPORT_V1_ENABLED) {
    // Flag down: no player lookup, no panel read, no roll-up. A returning
    // player on a flag-off deployment costs exactly one auth call.
    return NextResponse.json({ live: false, report: null });
  }

  const { data: player, error: playerError } = await supabase
    .from('players')
    .select('id')
    .eq('user_id', user.id)
    .maybeSingle();

  if (playerError) {
    console.error('World Report player lookup failed:', {
      userId: user.id,
      error: playerError,
    });
    Sentry.captureException(
      new Error(`World Report player lookup failed: ${playerError.message}`),
      { extra: { userId: user.id, code: playerError.code } }
    );
    return NextResponse.json({ live: true, report: null });
  }

  if (!player) {
    return NextResponse.json({ error: 'Player not found' }, { status: 404 });
  }

  const report = await buildWorldReport(supabase, player.id as string);
  return NextResponse.json({ live: true, report });
}

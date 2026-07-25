/**
 * The World Serpent panel — GET /api/serpent/panel (Constitution §7.3).
 *
 * The one read the hunt panel needs: this week's conditions, your Depth
 * against your best week, your clan's Depth against its best week, your recent
 * settled weeks and the Chronicle entries settlement wrote. WP-1.07 builds its
 * surfaces against this contract.
 *
 * ── CONTRACT ───────────────────────────────────────────────────────────────
 *
 * Request:  GET /api/serpent/panel
 *           Authorization: Bearer <supabase access token>   (required)
 *           No query parameters. The week is derived from the server's UTC
 *           calendar — there is no parameter through which a client could
 *           select, assert or influence a week (Rule 11).
 *
 * 200 response:
 * {
 *   live: boolean,                  // false = flag off or migration 046 unapplied
 *   week: {
 *     id: string,                   // uuid; the server-resolved week id
 *     weekStart: string,            // 'YYYY-MM-DD', the Monday (UTC)
 *     startsAt: string,             // ISO, Monday 00:00 UTC
 *     endsAt: string,               // ISO, next Monday 00:00 UTC (exclusive)
 *     seed: string,                 // 'S' + 8 hex, derived from weekStart
 *     modifiers: Array<{ id, name, effect, kind: 'E'|'P'|'EP' }>,
 *     settledAt: string | null
 *   } | null,
 *   you: {
 *     depth: number,                // this week, best-3 sum, in segments
 *     attempts: number,             // eligible attempts (unlimited by law)
 *     bestYield: number,
 *     countedYields: number[],      // the Yields that made the number, desc
 *     countedRuns: number,          // 3 — how many count
 *     bestWeekDepth: number,        // monotonic
 *     lifetimeDepth: number,        // monotonic
 *     deltaVsBestWeek: number       // depth - bestWeekDepth; may be negative
 *   },
 *   clan: {
 *     id, name, tag,
 *     memberCount: number,
 *     depth: number,                // additive SUM of member Depths
 *     bestWeekDepth: number,
 *     lifetimeDepth: number,
 *     members: Array<{ playerId, handle, depth, attempts }>,
 *     hiddenMembers: number         // withheld by the cohort filter
 *   } | null,
 *   history: Array<{ weekStart, depth, clanDepth: number | null }>,
 *   chronicle: Array<{ kind, weekStart, depth, previousDepth, at }>
 * }
 *
 * 401: `{ error: 'Unauthorized' }` / `{ error: 'Invalid token' }`
 * 404: `{ error: 'Player not found' }`
 *
 * There is no threshold, minimum, bar, cut line, rank reward or pass/fail
 * field anywhere in this payload, and none may be added (Rule 8). There is no
 * currency, no claim and no collect endpoint beside it (§12.2, §7.3: "no DNA
 * settlement bonus").
 *
 * Flag off: 200 with `live: false` and zeroed standings, so a surface can
 * render an off state rather than having to special-case a 404.
 */

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import * as Sentry from '@sentry/nextjs';
import { buildSerpentPanel, emptySerpentPanel } from '@/lib/server/serpent';

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

  const { data: player, error: playerError } = await supabase
    .from('players')
    .select('id')
    .eq('user_id', user.id)
    .maybeSingle();

  if (playerError) {
    console.error('Serpent panel player lookup failed:', {
      userId: user.id,
      error: playerError,
    });
    Sentry.captureException(
      new Error(`Serpent panel player lookup failed: ${playerError.message}`),
      { extra: { userId: user.id, code: playerError.code } }
    );
    return NextResponse.json(emptySerpentPanel());
  }

  if (!player) {
    return NextResponse.json({ error: 'Player not found' }, { status: 404 });
  }

  const panel = await buildSerpentPanel(supabase, player.id as string);
  return NextResponse.json(panel);
}

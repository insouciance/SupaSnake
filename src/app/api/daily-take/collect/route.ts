/**
 * Collecting the Daily Take — POST /api/daily-take/collect (Constitution §7.2).
 *
 * "The first run of each UTC day pays a bonus, collected with one satisfying
 * tap on that run's Results." This is the tap. It is **the only claim endpoint
 * the game has** (§12.2, §7.2: "rewards settle automatically — no claim
 * cascades, ever"); everything else in the product settles itself.
 *
 * The path is fixed by `TAKE_COLLECT_ENDPOINT` in `src/lib/game/dailyTake.ts`,
 * which WP-1.06 shipped pointing here before this route existed.
 *
 * ── CONTRACT ───────────────────────────────────────────────────────────────
 *
 * Request:  POST /api/daily-take/collect
 *           Authorization: Bearer <supabase access token>   (required)
 *           {}                                              (never read)
 *
 *           THE REQUEST BODY IS NEVER READ. There is deliberately no field
 *           here for a day, an amount, a tier, a multiplier, a streak length
 *           or a session id — a client cannot ask for a bigger Take, cannot
 *           name the day it is collecting, and cannot back-collect a day it
 *           missed, because none of those are expressible (Rule 11). The
 *           server derives all of it from its own UTC clock inside the RPC.
 *
 * 200 response:
 * {
 *   live: boolean,        // false = flag off or migration 050 unapplied
 *   collected: boolean,   // did THIS call grant the Take
 *   amount: number,       // DNA granted by THIS call; 0 on every replay
 *   streakDays: number,
 *   multiplier: number,   // the tier factor — applied to the Take alone
 *   cooled: boolean,      // this collect walked the ladder down one rung
 *   dna: number | null    // balance after, when this call granted
 * }
 *
 * 401: `{ error: 'Unauthorized' }` / `{ error: 'Invalid token' }`
 * 404: `{ error: 'Player not found' }`
 * 503: `{ error: 'The Take could not be collected — try again' }`
 *
 * A SECOND CALL IS SAFE AND GRANTS NOTHING
 *
 * `collected: false, amount: 0` with a 200, not an error. The double-collect
 * guard is entirely server-side and entirely inside migration 050's
 * transaction: the player row is locked, the chain row is locked, and the day
 * is claimed by a compare-and-set whose row count gates the only DNA-adding
 * statement in the function. Nothing about this route's behaviour depends on
 * the client having disabled a button — a script hammering this path a hundred
 * times gets one payment and ninety-nine settled-day answers.
 *
 * WHAT THIS ROUTE CANNOT DO
 *
 * It cannot pay a run: it takes no session id and never reads `game_sessions`.
 * It cannot change a Score, a Yield or a Depth — no such write exists in the
 * RPC it calls. It cannot grant a charge (§8.6/§10.4: "add a charge" is not an
 * operation the schema supports). And it cannot pay more than ×3 of 100 DNA,
 * because both numbers are constants inside the function, not parameters here.
 */

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import * as Sentry from '@sentry/nextjs';

import { collectDailyTake } from '@/lib/server/dailyTake';
import { DAILY_TAKE_V1_ENABLED } from '@/lib/dailyTake/config';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || '',
  process.env.SUPABASE_SERVICE_ROLE_KEY || ''
);

const OFF_STATE = {
  live: false,
  collected: false,
  amount: 0,
  streakDays: 0,
  multiplier: 1,
  cooled: false,
  dna: null,
};

export async function POST(request: NextRequest) {
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

  // The flag is checked BEFORE the player lookup so an off deployment does no
  // database work at all. 200 with `live: false`, never a 404: the client
  // helper maps 404/405/501 to "the mechanism is not deployed", and a flag
  // flip has to stay distinguishable from a route that was never shipped.
  if (!DAILY_TAKE_V1_ENABLED) {
    return NextResponse.json(OFF_STATE);
  }

  const { data: player, error: playerError } = await supabase
    .from('players')
    .select('id')
    .eq('user_id', user.id)
    .maybeSingle();

  if (playerError) {
    console.error('Daily Take player lookup failed:', {
      userId: user.id,
      error: playerError,
    });
    Sentry.captureException(
      new Error(`Daily Take player lookup failed: ${playerError.message}`),
      { extra: { userId: user.id, code: playerError.code } }
    );
    return NextResponse.json({ error: 'Player lookup failed' }, { status: 503 });
  }

  if (!player) {
    return NextResponse.json({ error: 'Player not found' }, { status: 404 });
  }

  const result = await collectDailyTake(supabase, player.id as string);

  if (result.status === 'failed') {
    // Already reported to Sentry by the engine. Nothing was granted and
    // nothing was written, so the day's Take is still there to collect: a
    // retry on the next run of the same day pays it (Rule 5 — an absence is
    // never destructive, including the absence of a working request).
    return NextResponse.json(
      { error: 'The Take could not be collected — try again' },
      { status: 503 }
    );
  }

  if (result.status === 'off') {
    return NextResponse.json(OFF_STATE);
  }

  const { slot } = result;
  return NextResponse.json({
    live: true,
    collected: result.status === 'collected',
    amount: result.status === 'collected' ? result.amount : 0,
    streakDays: slot.streakDays,
    multiplier: slot.multiplier,
    cooled: result.status === 'collected' ? result.cooled : false,
    dna: result.status === 'collected' ? result.dna : null,
  });
}

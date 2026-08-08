/**
 * Reading the Daily Take — GET /api/daily-take (Constitution §7.2).
 *
 * WHY THIS ROUTE EXISTS (ruling D2). The Take used to be offered in exactly one
 * place: the Results screen of the day's first run, fed by the optional
 * `dailyTake` block the settlement response carries. That coupling is what
 * ruling D2 dissolves — the Take moves to a floating element on Home — and a
 * surface on Home has no settlement payload to read it out of. This is the
 * read side of the same mechanism the settlement already uses: the identical
 * `describeDailyTakeSlot` helper, on the identical player row.
 *
 * IT CANNOT PAY. `describeDailyTakeSlot` is documented and implemented as
 * READ-ONLY — "This function has no write in it: it cannot grant, cannot
 * advance a chain and cannot mark a day collected." Collecting is still, and
 * only, `POST /api/daily-take/collect`, which is the game's one claim endpoint
 * (§12.2). This route moves the SURFACE, never the authority: nothing here
 * decides an amount, a tier or a day — the server derives all of it from its
 * own UTC clock inside the same helpers the run path uses.
 *
 * ── CONTRACT ───────────────────────────────────────────────────────────────
 *
 * Request:  GET /api/daily-take
 *           Authorization: Bearer <supabase access token>   (required)
 *
 * 200 response — the slot exactly as the settlement reports it:
 * {
 *   live: boolean,           // false = flag off, or migration 050 unapplied
 *   firstRunOfDay: boolean,  // true = today's Take is still collectable
 *   amount: number,          // DNA a collect would pay, tier applied; 0 once taken
 *   streakDays: number,
 *   multiplier: number,
 *   collected: boolean       // true once the day's Take is settled
 * }
 *
 * 401: `{ error: 'Unauthorized' }` / `{ error: 'Invalid token' }`
 * 404: `{ error: 'Player not found' }`
 * 503: `{ error: 'Player lookup failed' }`
 *
 * An absent or unreadable Take is never an error the player is told about: the
 * OFF state is a 200, matching the collect route, because §7.2 forbids a
 * destructive absence and a quiet surface is the safe direction. A player who
 * never sees the offer has not lost the day — the Take keeps.
 */

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import * as Sentry from '@sentry/nextjs';

import { describeDailyTakeSlot } from '@/lib/server/dailyTake';
import { DAILY_TAKE_V1_ENABLED } from '@/lib/dailyTake/config';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || '',
  process.env.SUPABASE_SERVICE_ROLE_KEY || ''
);

const OFF_SLOT = {
  live: false,
  firstRunOfDay: false,
  amount: 0,
  streakDays: 0,
  multiplier: 1,
  collected: false,
};

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

  // Checked before any database work, exactly as the collect route does, so an
  // off deployment costs one auth round trip and nothing else.
  if (!DAILY_TAKE_V1_ENABLED) {
    return NextResponse.json(OFF_SLOT);
  }

  const { data: player, error: playerError } = await supabase
    .from('players')
    .select('id')
    .eq('user_id', user.id)
    .maybeSingle();

  if (playerError) {
    console.error('Daily Take slot lookup failed:', {
      userId: user.id,
      error: playerError,
    });
    Sentry.captureException(
      new Error(`Daily Take slot lookup failed: ${playerError.message}`),
      { extra: { userId: user.id, code: playerError.code } }
    );
    return NextResponse.json({ error: 'Player lookup failed' }, { status: 503 });
  }

  if (!player) {
    return NextResponse.json({ error: 'Player not found' }, { status: 404 });
  }

  const slot = await describeDailyTakeSlot(supabase, player.id as string);

  // `null` means the mechanism is not live for this player — flag off, missing
  // migration, or a read that already reported itself to Sentry inside the
  // helper. The surface treats that the same way it treats a collected day:
  // it does not appear. That is the same safe direction the run path takes.
  return NextResponse.json(slot ?? OFF_SLOT);
}

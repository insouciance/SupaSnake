/**
 * Score, this month — GET /api/signal/ascension (Constitution §6.1, §12.2).
 *
 * IT LIVES UNDER `/api/signal` ON PURPOSE. §12.2: "Ascension is its monthly
 * aggregation view, not a surface". Ascension has no district of its own in
 * the route tree because it has no district of its own in the game — it is the
 * Signal's history, read a month at a time. A sibling of `/api/signal/panel`
 * and `/api/signal/objective` is exactly what it is.
 *
 * ── CONTRACT ───────────────────────────────────────────────────────────────
 *
 * Request:  GET /api/signal/ascension?month=YYYY-MM
 *           Authorization: Bearer <supabase access token>   (required)
 *
 *           `month` is the ONLY parameter, it selects a month and nothing
 *           else, and it is validated against the Signal calendar before it
 *           reaches a query (Rule 11). Omitted means the month running now.
 *           There is no parameter here through which a client could assert a
 *           score, a tier, a place or a reward — the reading is folded
 *           server-side from rows the client cannot write.
 *
 * 200 response:
 * {
 *   live: boolean,                 // false = flag off or migration 049 unapplied
 *   currentMonth: string,          // 'YYYY-MM', the month running now
 *   reading: {
 *     month, label, startsAt, endsAt, daysInMonth,
 *     concluded: boolean,
 *     scoringDaysAhead: number,
 *     signalsScored: number,
 *     counted: number[],           // the best-ten scores, descending
 *     points: number,              // SCORE, summed. Not a currency (§12.2)
 *     best: number,
 *     openPlaces: number,
 *     tier: { id, name, threshold },
 *     nextTier: { id, name, threshold } | null,
 *     toNextTier: number,
 *     days: Array<{ day, score, index, counted }>
 *   } | null                       // null only for a month key that is not a month
 * }
 *
 * 401: `{ error: 'Unauthorized' }` / `{ error: 'Invalid token' }`
 * 404: `{ error: 'Player not found' }`
 *
 * WHAT IS NOT IN THIS PAYLOAD, AND MAY NEVER BE ADDED
 *
 *   - No currency. No `dna`, no balance, no payout, no reward field of any
 *     kind. §12.2 caps currencies at one and this endpoint does not carry it.
 *   - No claim. There is no POST beside this GET, no `claimUrl`, no
 *     `claimable`, no `collect`. §7.2: rewards settle automatically, and a
 *     month is not a reward event at all.
 *   - No commercial field. No price, offer, entitlement or premium flag
 *     (Rule 7, Rule 3).
 *   - Nothing that can decrease. Every number here is monotonic within the
 *     cycle or a fact about the calendar (Rule 5, Rule 6).
 *
 * `route.test.ts` asserts all four against a real payload.
 *
 * Flag off: 200 with `live: false` and a zeroed reading, so a surface renders
 * an off state rather than handling a 404. A 404 would make the rollback path
 * an error path, and an error path is a thing a client has to handle;
 * `route.flagOff.test.ts` pins the 200 and pins that no month is queried.
 */

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import * as Sentry from '@sentry/nextjs';
import { ascensionMonthKey } from '@/shared/game/ascension';
import { buildAscensionView, emptyAscensionView } from '@/lib/server/ascension';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || '',
  process.env.SUPABASE_SERVICE_ROLE_KEY || ''
);

export async function GET(request: NextRequest) {
  const month = request.nextUrl.searchParams.get('month') || ascensionMonthKey();

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
    console.error('Ascension player lookup failed:', {
      userId: user.id,
      error: playerError,
    });
    Sentry.captureException(
      new Error(`Ascension player lookup failed: ${playerError.message}`),
      { extra: { userId: user.id, code: playerError.code } }
    );
    return NextResponse.json(emptyAscensionView(month));
  }

  if (!player) {
    return NextResponse.json({ error: 'Player not found' }, { status: 404 });
  }

  const view = await buildAscensionView(supabase, player.id as string, month);
  return NextResponse.json(view);
}

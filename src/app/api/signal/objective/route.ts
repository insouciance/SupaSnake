/**
 * Taking the day's Signal — POST /api/signal/objective (Constitution §7.2).
 *
 * "Each day the Signal names a condition and three objectives; you take one."
 * This is the taking. It is the ONLY route in the product that can produce a
 * `signal_objective_run_id`, and therefore the only route that can produce the
 * §8.6 charge exemption.
 *
 * ── CONTRACT ───────────────────────────────────────────────────────────────
 *
 * Request:  POST /api/signal/objective
 *           Authorization: Bearer <supabase access token>   (required)
 *           { "sessionId": "<uuid of an OPEN run>", "objectiveId": "signal_extract" }
 *
 *           `objectiveId` is a LOOKUP KEY, not a definition. The server
 *           derives today from its own UTC calendar and looks the id up among
 *           that day's three; an id that is not one of them is refused. There
 *           is no field here for a day, a date, a target, a condition or a
 *           seed, so a client cannot name one (Rule 11).
 *
 * 200 response:
 * {
 *   live: boolean,                  // false = flag off or migration 049 unapplied
 *   day: { id, day, startsAt, endsAt, seed, condition, objectives } | null,
 *   objective: { id, kind, target, label, description, bonusDna } | null,
 *   ownsAttempt: boolean,           // true = THIS run is the day's Signal run
 *   chargeExempt: boolean,          // mirrors ownsAttempt (§8.6); never a request
 *   progress: number,
 *   completed: boolean
 * }
 *
 * 400: `{ error: 'sessionId is required' }`
 *      `{ error: 'objectiveId is required' }`
 *      `{ error: 'Unknown Signal objective', objectives: [...] }`  ← not one of
 *                the day's three; the day's actual three are returned so the
 *                surface can correct itself rather than guess.
 * 401: `{ error: 'Unauthorized' }` / `{ error: 'Invalid token' }`
 * 404: `{ error: 'Player not found' }`
 * 503: `{ error: 'The Signal could not be taken — this run continues as an
 *        ordinary run' }` when the claim itself failed.
 *
 * WHAT THIS ROUTE IS NOT
 *
 * It is not a claim endpoint (§12.2, §7.2: "rewards settle automatically — no
 * claim cascades, ever"). It opens an attempt; it pays nothing. There is no
 * DNA write, no cosmetic, no entitlement and no currency statement anywhere in
 * this file or in `claimSignalObjectiveRun`. Rewards arrive from settlement,
 * which the player cannot invoke.
 *
 * A SECOND CALL IS SAFE AND EARNS NOTHING
 *
 * The schema holds one attempt per (day, player). A second call returns the
 * FIRST attempt unchanged with `ownsAttempt: false` — so a player cannot
 * re-choose to dodge a bad objective, and cannot farm exemptions by taking the
 * Signal on every run of the day.
 */

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import * as Sentry from '@sentry/nextjs';
import { claimSignalObjectiveRun } from '@/lib/server/signal';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || '',
  process.env.SUPABASE_SERVICE_ROLE_KEY || ''
);

const OFF_STATE = {
  live: false,
  day: null,
  objective: null,
  ownsAttempt: false,
  chargeExempt: false,
  progress: 0,
  completed: false,
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

  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 });
  }

  const sessionId = typeof body.sessionId === 'string' ? body.sessionId : '';
  const objectiveId = typeof body.objectiveId === 'string' ? body.objectiveId : '';
  if (!sessionId) {
    return NextResponse.json({ error: 'sessionId is required' }, { status: 400 });
  }
  if (!objectiveId) {
    return NextResponse.json({ error: 'objectiveId is required' }, { status: 400 });
  }

  const { data: player, error: playerError } = await supabase
    .from('players')
    .select('id')
    .eq('user_id', user.id)
    .maybeSingle();

  if (playerError) {
    console.error('Signal objective player lookup failed:', {
      userId: user.id,
      error: playerError,
    });
    Sentry.captureException(
      new Error(`Signal objective player lookup failed: ${playerError.message}`),
      { extra: { userId: user.id, code: playerError.code } }
    );
    return NextResponse.json({ error: 'Player lookup failed' }, { status: 503 });
  }

  if (!player) {
    return NextResponse.json({ error: 'Player not found' }, { status: 404 });
  }

  // The session ownership check lives inside the RPC's transaction, which
  // refuses any session that is not this player's OPEN run — so a client
  // cannot attach the day's Signal to someone else's run, or to a finished one.
  const claim = await claimSignalObjectiveRun(
    supabase,
    player.id as string,
    sessionId,
    objectiveId
  );

  if (!claim.live) {
    return NextResponse.json(OFF_STATE);
  }

  if (claim.unknownObjective) {
    return NextResponse.json(
      {
        error: 'Unknown Signal objective',
        objectives: claim.day?.objectives ?? [],
      },
      { status: 400 }
    );
  }

  if (claim.failed) {
    // Already reported to Sentry by the engine. The run is unaffected: it
    // simply is not the day's Signal run, which is an ordinary charged run.
    return NextResponse.json(
      { error: 'The Signal could not be taken — this run continues as an ordinary run' },
      { status: 503 }
    );
  }

  return NextResponse.json({
    live: true,
    day: claim.day,
    objective: claim.objective,
    ownsAttempt: claim.ownsAttempt,
    // The exemption is a SERVER fact. This field reports what the server
    // decided; it is never read back from a request.
    chargeExempt: claim.exemptRunId !== null,
    progress: claim.progress,
    completed: claim.completed,
  });
}

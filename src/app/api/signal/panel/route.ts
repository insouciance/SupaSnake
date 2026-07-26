/**
 * The World Signal panel — GET /api/signal/panel (Constitution §7.2).
 *
 * The one read the Signal surface needs: today's condition, today's three
 * objectives, which one this player took, how far it got, and the cumulative
 * marks behind it. Track B builds against the contract below.
 *
 * ── CONTRACT ───────────────────────────────────────────────────────────────
 *
 * Request:  GET /api/signal/panel
 *           Authorization: Bearer <supabase access token>   (required)
 *           No query parameters. The day is derived from the server's UTC
 *           calendar — there is no parameter through which a client could
 *           select, assert or influence a day, a seed, a condition or an
 *           objective (Rule 11).
 *
 * 200 response:
 * {
 *   live: boolean,                  // false = flag off or migration 049 unapplied
 *   day: {
 *     id: string,                   // uuid; the server-resolved day id
 *     day: string,                  // 'YYYY-MM-DD' (UTC)
 *     startsAt: string,             // ISO, 00:00 UTC
 *     endsAt: string,               // ISO, next 00:00 UTC (exclusive)
 *     seed: string,
 *     condition: { id, name, effect, strainTilt },
 *     objectives: Array<{ id, kind, target, label, description, bonusDna }>
 *   } | null,
 *   you: {
 *     chosen: boolean,              // has this player taken today's Signal?
 *     objectiveId: string | null,
 *     objective: { id, kind, target, label, description, bonusDna } | null,
 *     progress: number,             // best measurement so far
 *     target: number,               // the number they PLAYED for (Rule 6)
 *     completed: boolean,
 *     bonusPaid: boolean            // the flat first-completion bonus settled
 *   },
 *   marks: {
 *     signalsCompleted: number,     // cumulative, NON-consecutive (§7.2)
 *     reached: number[],
 *     next: number | null
 *   }
 * }
 *
 * 401: `{ error: 'Unauthorized' }` / `{ error: 'Invalid token' }`
 * 404: `{ error: 'Player not found' }`
 *
 * This route READS. It resolves the day (which is a write only in the sense
 * that the day row is created once, by the server, from the calendar) and
 * reads the player's standing. It settles nothing, grants nothing and claims
 * nothing — §7.2's "rewards settle automatically, no claim cascades, ever" is
 * kept by there being no reward statement in this file (§12.2).
 *
 * Flag off, or before migration 049: 200 with `live: false` and a zeroed
 * standing — never a 404 — so a surface can render an off state rather than
 * having to special-case an error.
 */

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import * as Sentry from '@sentry/nextjs';
import {
  emptySignalObjectiveState,
  readSignalObjectiveState,
  type SignalObjectiveState,
} from '@/lib/server/signal';
import { SIGNAL_MILESTONES } from '@/shared/game/signal';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || '',
  process.env.SUPABASE_SERVICE_ROLE_KEY || ''
);

/** The published shape, built from the engine's state and nothing else. */
export function toSignalPanel(state: SignalObjectiveState) {
  const reached = state.milestonesReached;
  const next =
    SIGNAL_MILESTONES.find((milestone) => !reached.includes(milestone)) ?? null;

  return {
    live: state.live,
    day: state.day
      ? {
          id: state.day.id,
          day: state.day.day,
          startsAt: state.day.startsAt,
          endsAt: state.day.endsAt,
          seed: state.day.seed,
          condition: state.day.condition,
          objectives: state.day.objectives,
        }
      : null,
    you: {
      chosen: state.attempt !== null,
      objectiveId: state.attempt?.objectiveId ?? null,
      objective: state.objective,
      progress: state.progress,
      target: state.target,
      completed: state.completed,
      bonusPaid: state.bonusPaid,
    },
    marks: {
      signalsCompleted: state.signalsCompleted,
      reached,
      next,
    },
  };
}

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
    console.error('Signal panel player lookup failed:', {
      userId: user.id,
      error: playerError,
    });
    Sentry.captureException(
      new Error(`Signal panel player lookup failed: ${playerError.message}`),
      { extra: { userId: user.id, code: playerError.code } }
    );
    // The panel is a read. A lookup that failed is not a reason to 500 a
    // surface that has a perfectly good off state.
    return NextResponse.json(toSignalPanel(emptySignalObjectiveState()));
  }

  if (!player) {
    return NextResponse.json({ error: 'Player not found' }, { status: 404 });
  }

  const state = await readSignalObjectiveState(supabase, player.id as string);
  return NextResponse.json(toSignalPanel(state));
}

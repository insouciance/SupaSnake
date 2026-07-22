/**
 * Weekly Anomaly board API (Design v2 Phase 4B, section 7.2)
 *
 * GET /api/anomaly - this week's anomaly (name + modifier + timer, from
 * the shared deterministic rotation) and its leaderboard (top 10 by best
 * score, plus the caller's best/rank/run count) via the get_anomaly_board
 * RPC.
 *
 * PRE-MIGRATION-021 SAFE: while the RPC does not exist, GET returns
 * { live: false } with the rotation info only - nothing errors, and the
 * UI can still show "coming soon" with the right anomaly name.
 */

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { isMissingSeasonInfra } from '@/lib/server/season';
import {
  ANOMALIES,
  anomalyForWeek,
  anomalyWeekEnd,
  anomalyWeekStart,
} from '@/shared/game/anomalies';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || '',
  process.env.SUPABASE_SERVICE_ROLE_KEY || ''
);

export async function GET(request: NextRequest) {
  try {
    const authHeader = request.headers.get('authorization');
    if (!authHeader) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const token = authHeader.replace('Bearer ', '');
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);
    if (authError || !user) {
      return NextResponse.json({ error: 'Invalid token' }, { status: 401 });
    }

    const { data: player } = await supabase
      .from('players')
      .select('id')
      .eq('user_id', user.id)
      .single();
    if (!player) {
      return NextResponse.json({ error: 'Player not found' }, { status: 404 });
    }

    // The rotation is deterministic and shared - the board header never
    // depends on the DB (the RPC's anomaly_id must agree; tests pin it)
    const now = new Date();
    const weekStart = anomalyWeekStart(now);
    const anomalyId = anomalyForWeek(now);
    const anomaly = {
      id: anomalyId,
      name: ANOMALIES[anomalyId].name,
      effect: ANOMALIES[anomalyId].effect,
      kind: ANOMALIES[anomalyId].kind,
      strainBias: ANOMALIES[anomalyId].strainBias,
      weekStart: weekStart.toISOString(),
      endsAt: anomalyWeekEnd(weekStart).toISOString(),
    };

    const { data, error } = await supabase.rpc('get_anomaly_board', {
      p_player_id: player.id,
    });

    if (error) {
      // Pre-021 window: the board is simply not live yet
      if (isMissingSeasonInfra(error)) {
        return NextResponse.json({ live: false, anomaly, top: [], my: null });
      }
      console.error('get_anomaly_board RPC error:', error);
      return NextResponse.json({ error: 'Failed to load anomaly board' }, { status: 500 });
    }

    const payload = (data ?? {}) as {
      top?: unknown[];
      my?: { best?: number; rank?: number; runs?: number } | null;
    };

    return NextResponse.json({
      live: true,
      anomaly,
      top: Array.isArray(payload.top) ? payload.top : [],
      my: payload.my ?? null,
    });
  } catch (error) {
    console.error('Anomaly GET error:', error);
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}

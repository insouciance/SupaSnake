/**
 * Season API (Design v2 Phase 4B, sections 7.2 + 8.4)
 *
 * GET  /api/season - the live season (window, week index, playoff phase,
 *      seasonal mutations), the caller's FREE track (XP/level/tiers with
 *      claim state + reroll token balance), the playoff bracket, and the
 *      champions banner history - one get_season RPC.
 * POST /api/season { action: 'claim', level } - claim a reached free
 *      milestone (claim_season_tier RPC: reroll tokens land on
 *      players.player_reroll_tokens; cosmetics/titles are owned via the
 *      claim record).
 *
 * PRE-MIGRATION-021 SAFE: while the RPCs do not exist, GET returns
 * { live: false } and POST returns 503 - nothing errors.
 */

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { isMissingSeasonInfra } from '@/lib/server/season';
import { mapSeasonRpcError } from './utils';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || '',
  process.env.SUPABASE_SERVICE_ROLE_KEY || ''
);

async function getAuthedPlayer(request: NextRequest) {
  const authHeader = request.headers.get('authorization');
  if (!authHeader) {
    return { errorResponse: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) };
  }

  const token = authHeader.replace('Bearer ', '');
  const { data: { user }, error: authError } = await supabase.auth.getUser(token);
  if (authError || !user) {
    return { errorResponse: NextResponse.json({ error: 'Invalid token' }, { status: 401 }) };
  }

  const { data: player } = await supabase
    .from('players')
    .select('id')
    .eq('user_id', user.id)
    .single();
  if (!player) {
    return { errorResponse: NextResponse.json({ error: 'Player not found' }, { status: 404 }) };
  }

  return { player };
}

export async function GET(request: NextRequest) {
  try {
    const { player, errorResponse } = await getAuthedPlayer(request);
    if (errorResponse || !player) return errorResponse!;

    const { data, error } = await supabase.rpc('get_season', {
      p_player_id: player.id,
    });

    if (error) {
      if (isMissingSeasonInfra(error)) {
        return NextResponse.json({
          live: false,
          season: null,
          track: null,
          playoffs: [],
          champions: [],
        });
      }
      console.error('get_season RPC error:', error);
      return NextResponse.json({ error: 'Failed to load season' }, { status: 500 });
    }

    const payload = (data ?? {}) as Record<string, unknown>;
    const rawSeason = payload.season && typeof payload.season === 'object'
      ? payload.season as Record<string, unknown>
      : null;
    // get_season's stable pre-Genome wire key is `mutations`. Every row in
    // that frozen catalog is a gene, so expose a correctly named alias while
    // retaining the old field for rolling-deploy clients.
    const season = rawSeason
      ? {
          ...rawSeason,
          genes: Array.isArray(rawSeason.genes)
            ? rawSeason.genes
            : Array.isArray(rawSeason.mutations)
              ? rawSeason.mutations
              : [],
        }
      : null;
    return NextResponse.json({
      live: true,
      season,
      track: payload.track ?? null,
      playoffs: Array.isArray(payload.playoffs) ? payload.playoffs : [],
      champions: Array.isArray(payload.champions) ? payload.champions : [],
    });
  } catch (error) {
    console.error('Season GET error:', error);
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const { player, errorResponse } = await getAuthedPlayer(request);
    if (errorResponse || !player) return errorResponse!;

    const body = await request.json().catch(() => ({}));
    if (body.action !== 'claim') {
      return NextResponse.json({ error: 'Invalid action' }, { status: 400 });
    }
    const level = Number(body.level);
    if (!Number.isInteger(level) || level < 1) {
      return NextResponse.json({ error: 'level must be a positive integer' }, { status: 400 });
    }

    const { data, error } = await supabase.rpc('claim_season_tier', {
      p_player_id: player.id,
      p_level: level,
    });

    if (error) {
      if (isMissingSeasonInfra(error)) {
        return NextResponse.json(
          { error: 'The season track is not live yet' },
          { status: 503 }
        );
      }
      const mapped = mapSeasonRpcError(error.message || '');
      if (mapped) {
        return NextResponse.json(
          { error: mapped.error, code: mapped.code },
          { status: mapped.status }
        );
      }
      console.error('claim_season_tier RPC error:', error);
      return NextResponse.json({ error: 'Claim failed' }, { status: 500 });
    }

    return NextResponse.json({ success: true, reward: data ?? null });
  } catch (error) {
    console.error('Season POST error:', error);
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}

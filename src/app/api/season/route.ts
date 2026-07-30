/**
 * Season API (Design v2 Phase 4B, sections 7.2 + 8.4)
 *
 * GET  /api/season - the live season (window, week index, playoff phase,
 *      seasonal mutations), the caller's legacy track (XP/level/tiers with
 *      server-settled state), the playoff bracket, and the
 *      champions banner history - one get_season RPC.
 *
 * PRE-MIGRATION-021 SAFE: while the RPC does not exist, GET returns
 * { live: false }. Daily Take is the only reward collect; this route has no
 * mutating method.
 */

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { isMissingSeasonInfra } from '@/lib/server/season';

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

  const { data: player, error: playerError } = await supabase
    .from('players')
    .select('id')
    .eq('user_id', user.id)
    .single();
  if (playerError?.code === 'PGRST116' || !player) {
    return { errorResponse: NextResponse.json({ error: 'Player not found' }, { status: 404 }) };
  }
  if (playerError) {
    console.error('Season player lookup failed:', playerError);
    return { errorResponse: NextResponse.json({ error: 'Failed to load player' }, { status: 500 }) };
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

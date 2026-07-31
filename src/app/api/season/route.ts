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

import { NextRequest } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { isMissingSeasonInfra } from '@/lib/server/season';
import { progressionJson } from '@/lib/server/noStoreResponse';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || '',
  process.env.SUPABASE_SERVICE_ROLE_KEY || ''
);

async function getAuthedPlayer(request: NextRequest) {
  const authHeader = request.headers.get('authorization');
  if (!authHeader) {
    return { errorResponse: progressionJson({ error: 'Unauthorized' }, { status: 401 }) };
  }

  const token = authHeader.replace('Bearer ', '');
  const { data: { user }, error: authError } = await supabase.auth.getUser(token);
  if (authError || !user) {
    return { errorResponse: progressionJson({ error: 'Invalid token' }, { status: 401 }) };
  }

  const { data: player, error: playerError } = await supabase
    .from('players')
    .select('id')
    .eq('user_id', user.id)
    .single();
  if (playerError && playerError.code !== 'PGRST116') {
    console.error('Season player lookup failed:', playerError);
    return { errorResponse: progressionJson({ error: 'Failed to load player' }, { status: 500 }) };
  }
  if (playerError?.code === 'PGRST116' || !player) {
    return { errorResponse: progressionJson({ error: 'Player not found' }, { status: 404 }) };
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
        return progressionJson({
          live: false,
          season: null,
          track: null,
          playoffs: [],
          champions: [],
        });
      }
      console.error('get_season RPC error:', error);
      return progressionJson({ error: 'Failed to load season' }, { status: 500 });
    }

    const payload = (data ?? {}) as Record<string, unknown>;
    const rawSeason = payload.season && typeof payload.season === 'object'
      ? payload.season as Record<string, unknown>
      : null;
    const rawTrack = payload.track && typeof payload.track === 'object'
      ? payload.track as Record<string, unknown>
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
    const track = rawTrack
      ? {
          ...rawTrack,
          tiers: Array.isArray(rawTrack.tiers)
            ? rawTrack.tiers.filter((value) => {
                if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
                const tier = value as Record<string, unknown>;
                return (
                  (tier.reward_type === 'cosmetic' || tier.reward_type === 'title') &&
                  typeof tier.reward_id === 'string' &&
                  tier.reward_id.trim().length > 0
                );
              })
            : [],
        }
      : null;
    return progressionJson({
      live: true,
      season,
      track,
      playoffs: Array.isArray(payload.playoffs) ? payload.playoffs : [],
      champions: Array.isArray(payload.champions) ? payload.champions : [],
    });
  } catch (error) {
    console.error('Season GET error:', error);
    return progressionJson({ error: 'Internal error' }, { status: 500 });
  }
}

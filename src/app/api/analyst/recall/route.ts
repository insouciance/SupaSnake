/**
 * Analyst season Recall API (Identity v1 §9.2).
 *
 * The flagship shareable artifact — one per season, gpt-5 narrated,
 * available only once the season has ended (409 season_active while a
 * season is live). GET returns the cached Recall + archetype for the
 * latest ended season; POST generates on miss (cache-first, dedup by
 * the 025 unique index, 'analyst' rate-gated). Pre-025/021 → 503.
 */

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { checkRateLimit } from '@/lib/server/rateLimit';
import {
  generateArchetype,
  generateSeasonRecall,
  getCachedInsight,
  latestEndedSeason,
} from '@/lib/analyst/insights';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || '',
  process.env.SUPABASE_SERVICE_ROLE_KEY || ''
);

async function resolvePlayer(request: NextRequest) {
  const authHeader = request.headers.get('authorization');
  if (!authHeader) {
    return {
      response: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }),
    };
  }
  const token = authHeader.replace('Bearer ', '');
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser(token);
  if (authError || !user) {
    return {
      response: NextResponse.json({ error: 'Invalid token' }, { status: 401 }),
    };
  }
  const { data: player, error: playerError } = await supabase
    .from('players')
    .select('id, user_id')
    .eq('user_id', user.id)
    .single();
  if (playerError || !player) {
    return {
      response: NextResponse.json({ error: 'Player not found' }, { status: 404 }),
    };
  }
  return { player };
}

export async function GET(request: NextRequest) {
  try {
    const auth = await resolvePlayer(request);
    if ('response' in auth) return auth.response;

    const season = await latestEndedSeason(supabase);
    if (!season) {
      return NextResponse.json({ error: 'season_active' }, { status: 409 });
    }
    const scopeRef = `s${season.seq}`;
    const recall = await getCachedInsight(supabase, 'season_recall', scopeRef, {
      playerId: auth.player.id,
    });
    if (!recall.live) {
      return NextResponse.json({ live: false }, { status: 503 });
    }
    const archetype = await getCachedInsight(supabase, 'archetype', scopeRef, {
      playerId: auth.player.id,
    });
    return NextResponse.json({
      live: true,
      season: { seq: season.seq, name: season.name },
      recall: recall.row?.content ?? null,
      archetype: archetype.row?.content ?? null,
    });
  } catch (error) {
    console.error('Analyst recall GET error:', error);
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const auth = await resolvePlayer(request);
    if ('response' in auth) return auth.response;

    const season = await latestEndedSeason(supabase);
    if (!season) {
      return NextResponse.json({ error: 'season_active' }, { status: 409 });
    }
    const scopeRef = `s${season.seq}`;

    // Cache-first: an existing Recall returns without touching the limit
    const cached = await getCachedInsight(supabase, 'season_recall', scopeRef, {
      playerId: auth.player.id,
    });
    if (!cached.live) {
      return NextResponse.json({ live: false }, { status: 503 });
    }
    if (!cached.row) {
      const rate = await checkRateLimit(supabase, auth.player.id, 'analyst');
      if (!rate.allowed) {
        return NextResponse.json(
          { error: 'Rate limited', retryAfterMs: rate.retryAfterMs },
          { status: 429 }
        );
      }
    }

    // Archetype first (the Recall narrates it), then the Recall itself —
    // both cache-first, so re-POSTs are free.
    const archetype = await generateArchetype(supabase, {
      playerId: auth.player.id,
      season,
    });
    const recall = await generateSeasonRecall(supabase, {
      playerId: auth.player.id,
      userId: auth.player.user_id ?? null,
      season,
    });
    if (!recall.live) {
      return NextResponse.json({ live: false }, { status: 503 });
    }
    return NextResponse.json({
      live: true,
      season: { seq: season.seq, name: season.name },
      recall: recall.insight?.content ?? null,
      archetype: archetype.insight?.content ?? null,
      cached: recall.cached,
      source: recall.source,
      skipped: recall.skipped,
    });
  } catch (error) {
    console.error('Analyst recall POST error:', error);
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}

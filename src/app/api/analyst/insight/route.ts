/**
 * Analyst run-insight API (Identity v1 §9.2).
 *
 * POST { sessionId }: the post-run insight card — own, ENDED session
 * only. Cache-first (the 025 dedup index means one generation per run,
 * ever); cache hits bypass the rate limit; generations are gated by the
 * 'analyst' action (30s). Pre-025 → { live: false } 503; the game-over
 * flow treats that as "no card", never an error.
 */

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { checkRateLimit } from '@/lib/server/rateLimit';
import {
  generateRunInsight,
  getCachedInsight,
} from '@/lib/analyst/insights';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || '',
  process.env.SUPABASE_SERVICE_ROLE_KEY || ''
);

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function POST(request: NextRequest) {
  try {
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
      .single();
    if (playerError || !player) {
      return NextResponse.json({ error: 'Player not found' }, { status: 404 });
    }

    const body = await request.json().catch(() => ({}));
    const sessionId = typeof body.sessionId === 'string' ? body.sessionId : '';
    if (!UUID_RE.test(sessionId)) {
      return NextResponse.json({ error: 'Invalid sessionId' }, { status: 400 });
    }

    // Cache-first: a hit costs nothing and skips the rate limit
    const cached = await getCachedInsight(supabase, 'run_insight', sessionId, {
      playerId: player.id,
    });
    if (!cached.live) {
      return NextResponse.json({ live: false }, { status: 503 });
    }
    if (cached.row) {
      return NextResponse.json({
        live: true,
        insight: cached.row.content,
        cached: true,
        source: cached.row.model ? 'llm' : 'fallback',
      });
    }

    const rate = await checkRateLimit(supabase, player.id, 'analyst');
    if (!rate.allowed) {
      return NextResponse.json(
        { error: 'Rate limited', retryAfterMs: rate.retryAfterMs },
        { status: 429 }
      );
    }

    const result = await generateRunInsight(supabase, {
      playerId: player.id,
      sessionId,
    });
    if (!result.live) {
      return NextResponse.json({ live: false }, { status: 503 });
    }
    if (result.notFound) {
      return NextResponse.json({ error: 'Session not found' }, { status: 404 });
    }
    if (result.notEnded) {
      return NextResponse.json({ error: 'Session not ended' }, { status: 409 });
    }
    if (!result.insight) {
      return NextResponse.json({ live: true, insight: null, cached: false });
    }
    return NextResponse.json({
      live: true,
      insight: result.insight.content,
      cached: result.cached,
      source: result.source === 'cache'
        ? (result.insight.model ? 'llm' : 'fallback')
        : result.source,
    });
  } catch (error) {
    console.error('Analyst insight error:', error);
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}

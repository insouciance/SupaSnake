/**
 * Premium Stats API - Lab Analytics (SupaSnake Premium perk)
 *
 * GET /api/premium/stats - aggregates over the caller's validated,
 * non-free-play game_sessions: overall totals, extraction efficiency and
 * per-dynasty performance. Server-gated: 403 premium_required for free
 * accounts (the dashboard page shows a locked preview instead).
 *
 * Read-only convenience over existing session facts - no new state.
 */

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { hasPremium } from '@/lib/server/premium';
import { aggregateSessions, type SessionRow } from './utils';

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

    if (!(await hasPremium(supabase, player.id))) {
      return NextResponse.json({ error: 'premium_required' }, { status: 403 });
    }

    // Most recent 1000 earned runs - plenty for the dashboard, bounded work
    const { data: rows, error: sessionsError } = await supabase
      .from('game_sessions')
      .select('score, dna_earned, duration_seconds, foods_collected, extracted, dynasty, started_at')
      .eq('player_id', player.id)
      .eq('validated', true)
      .not('ended_at', 'is', null)
      .or('is_free_play.is.null,is_free_play.eq.false')
      .order('started_at', { ascending: false })
      .limit(1000);

    if (sessionsError) {
      console.error('Premium stats query failed:', sessionsError);
      return NextResponse.json({ error: 'Failed to load stats' }, { status: 500 });
    }

    return NextResponse.json({
      success: true,
      sampleSize: rows?.length ?? 0,
      ...aggregateSessions((rows ?? []) as SessionRow[]),
    });
  } catch (error) {
    console.error('Premium stats GET error:', error);
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}

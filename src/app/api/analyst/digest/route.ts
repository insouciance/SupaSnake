/**
 * Analyst weekly digest API (Identity v1 §9.2).
 *
 * GET: the player's latest weekly digest. The digest scope is the most
 * recently COMPLETED week (Monday-aligned UTC — the same scope the
 * Monday cron writes), generated on miss and cached forever by the 025
 * dedup index. Generation is soft-gated by the 'analyst' rate action:
 * when gated, the latest older digest (or none) returns instead —
 * never a 429 on a read surface. Pre-025 → { live: false } 503.
 */

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { checkRateLimit } from '@/lib/server/rateLimit';
import {
  generateWeeklyDigest,
  getCachedInsight,
  getLatestInsight,
  lastCompletedWeekStart,
} from '@/lib/analyst/insights';

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

    const weekStart = lastCompletedWeekStart();
    const current = await getCachedInsight(supabase, 'weekly_digest', weekStart, {
      playerId: player.id,
    });
    if (!current.live) {
      return NextResponse.json({ live: false }, { status: 503 });
    }
    if (current.row) {
      return NextResponse.json({
        live: true,
        digest: current.row.content,
        weekStart,
        cached: true,
      });
    }

    // Generate-on-miss, softly rate-gated (denial degrades to "latest")
    let rateAllowed = false;
    try {
      const rate = await checkRateLimit(supabase, player.id, 'analyst');
      rateAllowed = rate.allowed;
    } catch {
      rateAllowed = false;
    }
    if (rateAllowed) {
      const result = await generateWeeklyDigest(supabase, {
        playerId: player.id,
        weekStart,
      });
      if (!result.live) {
        return NextResponse.json({ live: false }, { status: 503 });
      }
      if (result.insight) {
        return NextResponse.json({
          live: true,
          digest: result.insight.content,
          weekStart,
          cached: result.cached,
        });
      }
    }

    // No digest for the completed week (no runs, or rate-gated):
    // fall back to the latest older one so the card can still render.
    const latest = await getLatestInsight(supabase, 'weekly_digest', {
      playerId: player.id,
    });
    if (!latest.live) {
      return NextResponse.json({ live: false }, { status: 503 });
    }
    return NextResponse.json({
      live: true,
      digest: latest.row?.content ?? null,
      weekStart: latest.row?.scope_ref ?? weekStart,
      cached: true,
    });
  } catch (error) {
    console.error('Analyst digest error:', error);
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}

/**
 * Streaks API - Track consecutive play days
 * Server authority: Streak state in database
 *
 * WP-0.02: the streak reports a COUNT and nothing else. The tier DNA
 * multiplier and the tier energy bonus were deleted with the rest of the
 * account multiplier stack (Constitution §8.5) - a streak buys no number.
 */

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
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

    let { data: streak } = await supabase
      .from('player_streaks')
      .select('*')
      .eq('player_id', player.id)
      .single();

    if (!streak) {
      const { data: newStreak } = await supabase
        .from('player_streaks')
        .insert({ player_id: player.id })
        .select()
        .single();
      streak = newStreak;
    }

    const today = new Date().toISOString().split('T')[0];
    const streakAtRisk = streak?.last_play_date && streak.last_play_date !== today;

    return NextResponse.json({
      currentStreak: streak?.current_streak || 0,
      longestStreak: streak?.longest_streak || 0,
      graceAvailable: streak?.grace_period_available ?? true,
      streakAtRisk,
      lastPlayDate: streak?.last_play_date,
    });
  } catch (err) {
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
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

    const body = await request.json();
    const { action } = body;

    const { data: player } = await supabase
      .from('players')
      .select('id')
      .eq('user_id', user.id)
      .single();

    if (!player) {
      return NextResponse.json({ error: 'Player not found' }, { status: 404 });
    }

    let { data: streak } = await supabase
      .from('player_streaks')
      .select('*')
      .eq('player_id', player.id)
      .single();

    if (!streak) {
      const { data: newStreak } = await supabase
        .from('player_streaks')
        .insert({ player_id: player.id })
        .select()
        .single();
      streak = newStreak;
    }

    if (action === 'use-grace') {
      if (!streak?.grace_period_available) {
        return NextResponse.json({ error: 'Grace period not available' }, { status: 400 });
      }

      await supabase
        .from('player_streaks')
        .update({
          grace_period_available: false,
          grace_period_used: true,
          updated_at: new Date().toISOString(),
        })
        .eq('player_id', player.id);

      return NextResponse.json({
        success: true,
        message: 'Grace period used. Your streak is preserved!',
        currentStreak: streak.current_streak,
      });
    }

    return NextResponse.json({ error: 'Invalid action' }, { status: 400 });
  } catch (err) {
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}

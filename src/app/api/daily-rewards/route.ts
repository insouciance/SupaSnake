/**
 * Daily Rewards API - 28-day login reward cycle
 *
 * GET  /api/daily-rewards - Current day, claimability, all 28 tiers, streak
 * POST /api/daily-rewards { action: 'claim' } - Claim today's reward
 *
 * Server authority: all grants go through the claim_daily_reward RPC
 * (row-locked, idempotent per day, logs economy transactions).
 *
 * DEPRECATED as the daily faucet (Design v2 section 7.3): contracts
 * (/api/contracts) replace flat calendar DNA as the daily loop, and the
 * home modal is now the contracts board. This route stays for streak
 * display and the 28-day milestone days, which convert to cosmetic/
 * reroll-token gifts at Phase 3.
 */

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import {
  mapTierRow,
  mapClaimRow,
  mapClaimErrorStatus,
  computeCanClaimToday,
} from './utils';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

async function getAuthedPlayer(request: NextRequest) {
  const authHeader = request.headers.get('authorization');
  if (!authHeader) {
    return { errorResponse: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) };
  }

  const token = authHeader.replace('Bearer ', '');
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser(token);

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

    const { data: state } = await supabase
      .from('player_daily_state')
      .select('current_day, last_claim_date')
      .eq('player_id', player.id)
      .maybeSingle();

    const { data: tierRows, error: tiersError } = await supabase
      .from('daily_reward_tiers')
      .select('day_number, dna_amount, energy_amount, bonus_type')
      .order('day_number', { ascending: true });

    if (tiersError) {
      console.error('Failed to fetch daily reward tiers:', tiersError);
      return NextResponse.json({ error: 'Failed to fetch reward tiers' }, { status: 500 });
    }

    // WP-0.02: the streak is a count, not a factor - streak_multiplier is
    // gone from player_streaks along with the rest of the stack (§8.5).
    const { data: streakRow } = await supabase
      .from('player_streaks')
      .select('current_streak')
      .eq('player_id', player.id)
      .maybeSingle();

    const today = new Date().toISOString().split('T')[0];

    return NextResponse.json({
      currentDay: state?.current_day ?? 1,
      canClaimToday: computeCanClaimToday(state?.last_claim_date, today),
      tiers: (tierRows || []).map(mapTierRow),
      streak: {
        current: streakRow?.current_streak ?? 0,
      },
    });
  } catch (err) {
    console.error('Daily rewards GET error:', err);
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const { player, errorResponse } = await getAuthedPlayer(request);
    if (errorResponse || !player) return errorResponse!;

    const body = await request.json().catch(() => ({}));
    const { action } = body;

    if (action !== 'claim') {
      return NextResponse.json({ error: 'Invalid action' }, { status: 400 });
    }

    const { data: rows, error: claimError } = await supabase.rpc('claim_daily_reward', {
      p_player_id: player.id,
    });

    if (claimError) {
      const status = mapClaimErrorStatus(claimError.message);
      if (status >= 500) {
        console.error('claim_daily_reward error:', claimError);
      }
      return NextResponse.json(
        { error: claimError.message || 'Failed to claim daily reward' },
        { status }
      );
    }

    const row = Array.isArray(rows) ? rows[0] : rows;
    if (!row) {
      return NextResponse.json({ error: 'Claim returned no result' }, { status: 500 });
    }

    return NextResponse.json({
      success: true,
      ...mapClaimRow(row),
    });
  } catch (err) {
    console.error('Daily rewards POST error:', err);
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}

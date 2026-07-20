/**
 * Premium Status API
 *
 * GET /api/premium/status - the caller's premium entitlement + billing
 * summary (status, period end, cancel-at-period-end), today's stipend
 * claim state and this month's exclusive drop - one get_premium_status
 * RPC. Powers the shop premium section, settings and the stipend button.
 *
 * PRE-MIGRATION-028 SAFE: while the RPC does not exist this returns
 * { isPremium: false, live: false } - nothing errors.
 */

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { isMissingPremiumInfra } from '@/lib/server/premium';
import { GAME_CONFIG } from '@/shared/config/game';

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

    if (!GAME_CONFIG.features.premium) {
      return NextResponse.json({ live: false, isPremium: false });
    }

    const { data, error } = await supabase.rpc('get_premium_status', {
      p_player_id: player.id,
    });

    if (error) {
      if (isMissingPremiumInfra(error)) {
        return NextResponse.json({ live: false, isPremium: false });
      }
      console.error('get_premium_status RPC error:', error);
      return NextResponse.json({ error: 'Failed to load status' }, { status: 500 });
    }

    const payload = (data ?? {}) as Record<string, unknown>;
    return NextResponse.json({
      live: true,
      isPremium: payload.is_premium === true,
      status: payload.status ?? null,
      billingInterval: payload.billing_interval ?? null,
      currentPeriodEnd: payload.current_period_end ?? null,
      cancelAtPeriodEnd: payload.cancel_at_period_end === true,
      stipendClaimedToday: payload.stipend_claimed_today === true,
      currentDrop: payload.current_drop ?? null,
    });
  } catch (error) {
    console.error('Premium status GET error:', error);
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}

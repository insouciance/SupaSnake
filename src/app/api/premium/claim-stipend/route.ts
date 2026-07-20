/**
 * Premium Daily Stipend API
 *
 * POST /api/premium/claim-stipend - claim today's +3 energy (once per UTC
 * day while premium; idempotent by (player_id, claim_date) in the RPC).
 * The first claim of a month also delivers that month's exclusive
 * cosmetic drop - the RPC reports it as drop_granted.
 *
 * 403 premium_required / 409 already_claimed / 503 pre-migration-028.
 */

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import * as Sentry from '@sentry/nextjs';
import { isMissingPremiumInfra } from '@/lib/server/premium';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || '',
  process.env.SUPABASE_SERVICE_ROLE_KEY || ''
);

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

    const { data: player } = await supabase
      .from('players')
      .select('id')
      .eq('user_id', user.id)
      .single();
    if (!player) {
      return NextResponse.json({ error: 'Player not found' }, { status: 404 });
    }

    const { data, error } = await supabase.rpc('claim_premium_stipend', {
      p_player_id: player.id,
    });

    if (error) {
      if (isMissingPremiumInfra(error)) {
        return NextResponse.json(
          { error: 'Premium is not live yet' },
          { status: 503 }
        );
      }
      console.error('claim_premium_stipend RPC error:', error);
      Sentry.captureException(
        new Error(`claim_premium_stipend failed: ${error.message}`),
        { extra: { playerId: player.id } }
      );
      return NextResponse.json({ error: 'Claim failed' }, { status: 500 });
    }

    const result = (data ?? {}) as Record<string, unknown>;
    if (result.error === 'premium_required') {
      return NextResponse.json({ error: 'premium_required' }, { status: 403 });
    }
    if (result.error === 'already_claimed') {
      return NextResponse.json({ error: 'already_claimed' }, { status: 409 });
    }
    if (result.error) {
      console.error('claim_premium_stipend rejected:', result.error);
      return NextResponse.json({ error: 'Claim failed' }, { status: 500 });
    }

    return NextResponse.json({
      success: true,
      energy: result.energy ?? null,
      grantedEnergy: result.granted_energy ?? null,
      dropGranted: result.drop_granted ?? null,
    });
  } catch (error) {
    console.error('Premium stipend POST error:', error);
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}

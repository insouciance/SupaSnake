/**
 * Contracts API - daily pick-2-of-3 contracts (Design v2 section 7.3).
 * SupaSnake Premium picks 3 of 3 (migration 028 pick_contracts enforces
 * the real limit; picksAllowed in the response drives the UI).
 *
 * GET  /api/contracts - today's board: offers/picks/progress/claimable.
 *      Generation is lazy: the first GET of a UTC day creates the day's 3
 *      deterministic offers (offer_daily_contracts RPC) and refreshes
 *      progress server-side from that day's game_sessions.
 * POST /api/contracts { action: 'pick', contractIds: [id, id?, id?] }
 * POST /api/contracts { action: 'claim', contractId: id }
 *
 * Server authority: all state transitions go through the migration 015
 * RPCs (row-locked, idempotent claims, economy_transactions-logged grants).
 * Replaces the flat 28-day calendar as the daily faucet; /api/daily-rewards
 * remains for streak display and future milestone gifts.
 */

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import {
  mapContractRow,
  mapClaimRow,
  mapPickErrorStatus,
  mapClaimErrorStatus,
  computePicksRemaining,
  type ContractRpcRow,
} from './utils';
import { hasPremium } from '@/lib/server/premium';
import { PREMIUM_CONFIG } from '@/shared/config/premium';

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

function boardResponse(rows: ContractRpcRow[] | null | undefined, picksAllowed: number) {
  const contracts = (rows || []).map(mapContractRow);
  return {
    contracts,
    picksAllowed,
    picksRemaining: computePicksRemaining(contracts, picksAllowed),
    claimable: contracts.some((c) => c.picked && c.completed && !c.claimed),
  };
}

/** 2 picks/day free, 3 while premium (mirrors pick_contracts in 028) */
async function getPicksAllowed(playerId: string): Promise<number> {
  return (await hasPremium(supabase, playerId))
    ? PREMIUM_CONFIG.contracts.picksPerDayPremium
    : PREMIUM_CONFIG.contracts.picksPerDayFree;
}

export async function GET(request: NextRequest) {
  try {
    const { player, errorResponse } = await getAuthedPlayer(request);
    if (errorResponse || !player) return errorResponse!;

    const { data: rows, error: offerError } = await supabase.rpc('offer_daily_contracts', {
      p_player_id: player.id,
    });

    if (offerError) {
      console.error('offer_daily_contracts error:', offerError);
      return NextResponse.json({ error: 'Failed to load contracts' }, { status: 500 });
    }

    const picksAllowed = await getPicksAllowed(player.id);
    return NextResponse.json(boardResponse(rows as ContractRpcRow[], picksAllowed));
  } catch (err) {
    console.error('Contracts GET error:', err);
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const { player, errorResponse } = await getAuthedPlayer(request);
    if (errorResponse || !player) return errorResponse!;

    const body = await request.json().catch(() => ({}));
    const { action } = body;

    if (action === 'pick') {
      const contractIds = body.contractIds;
      // Shape validation only: the real per-day limit (2 free / 3 premium)
      // is enforced by the pick_contracts RPC (migration 028)
      if (
        !Array.isArray(contractIds) ||
        contractIds.length < 1 ||
        contractIds.length > PREMIUM_CONFIG.contracts.picksPerDayPremium ||
        !contractIds.every((id) => typeof id === 'string')
      ) {
        return NextResponse.json(
          { error: 'contractIds must be 1 to 3 contract ids' },
          { status: 400 }
        );
      }

      const { data: rows, error: pickError } = await supabase.rpc('pick_contracts', {
        p_player_id: player.id,
        p_contract_ids: contractIds,
      });

      if (pickError) {
        const status = mapPickErrorStatus(pickError.message);
        if (status >= 500) console.error('pick_contracts error:', pickError);
        return NextResponse.json(
          { error: pickError.message || 'Failed to pick contracts' },
          { status }
        );
      }

      const picksAllowed = await getPicksAllowed(player.id);
      return NextResponse.json({
        success: true,
        ...boardResponse(rows as ContractRpcRow[], picksAllowed),
      });
    }

    if (action === 'claim') {
      const contractId = body.contractId;
      if (typeof contractId !== 'string' || contractId.length === 0) {
        return NextResponse.json({ error: 'contractId is required' }, { status: 400 });
      }

      const { data: rows, error: claimError } = await supabase.rpc('claim_contract', {
        p_player_id: player.id,
        p_contract_id: contractId,
      });

      if (claimError) {
        const status = mapClaimErrorStatus(claimError.message);
        if (status >= 500) console.error('claim_contract error:', claimError);
        return NextResponse.json(
          { error: claimError.message || 'Failed to claim contract' },
          { status }
        );
      }

      const row = Array.isArray(rows) ? rows[0] : rows;
      if (!row) {
        return NextResponse.json({ error: 'Claim returned no result' }, { status: 500 });
      }

      return NextResponse.json({ success: true, ...mapClaimRow(row) });
    }

    return NextResponse.json({ error: 'Invalid action' }, { status: 400 });
  } catch (err) {
    console.error('Contracts POST error:', err);
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}

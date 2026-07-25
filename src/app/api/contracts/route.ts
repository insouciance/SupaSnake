/**
 * Contracts API - daily pick-2-of-3 contracts (Design v2 section 7.3).
 *
 * The pick allowance is the SAME FOR EVERYONE. Premium used to buy a third
 * pick; WP-0.09 removed it (Constitution §10.4 - progression rates are never
 * sold) from this route, from PREMIUM_CONFIG and, in migration 042, from the
 * pick_contracts RPC that enforced it. Nothing here reads the entitlement.
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
 *
 * WP-0.03 deleted /api/daily-rewards and the 28-day calendar behind it, so
 * a contract claim is the only daily grant left standing. It grants DNA and
 * season XP and nothing else: the `reward_energy` column, its RPC output
 * and the `rewardEnergy`/`energyGranted` fields of this response are gone
 * (migration 044). Contracts themselves are retired by WP-1.03 in favour of
 * the Signal; nothing new should be built on this route.
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
import { ENGAGEMENT_CONFIG } from '@/shared/config/engagement';

/**
 * Picks per UTC day, for every player alike (mirrors the flat `v_max` that
 * migration 042 restores in pick_contracts). The RPC remains the authority;
 * this constant only shapes the response and the request validation.
 */
const PICKS_PER_DAY = ENGAGEMENT_CONFIG.contracts.picksPerDay;

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

function boardResponse(rows: ContractRpcRow[] | null | undefined) {
  const contracts = (rows || []).map(mapContractRow);
  return {
    contracts,
    picksAllowed: PICKS_PER_DAY,
    picksRemaining: computePicksRemaining(contracts, PICKS_PER_DAY),
    claimable: contracts.some((c) => c.picked && c.completed && !c.claimed),
  };
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

    return NextResponse.json(boardResponse(rows as ContractRpcRow[]));
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
      // Shape validation only: the real per-day limit is enforced by the
      // pick_contracts RPC (migration 042 - flat, no entitlement branch)
      if (
        !Array.isArray(contractIds) ||
        contractIds.length < 1 ||
        contractIds.length > PICKS_PER_DAY ||
        !contractIds.every((id) => typeof id === 'string')
      ) {
        return NextResponse.json(
          { error: `contractIds must be 1 to ${PICKS_PER_DAY} contract ids` },
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

      return NextResponse.json({
        success: true,
        ...boardResponse(rows as ContractRpcRow[]),
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

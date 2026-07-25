/**
 * Lineage API.
 *
 * `select_primary` persists the owner's pre-run choice for a dual lineage —
 * the one lineage mutation that survives Constitution §8.2. The `reroll`
 * action is RETIRED: breeding is a deterministic draft, so there is nothing
 * random left to reroll, and held reroll tokens were converted to DNA by
 * migration 047. The RPC behind it now raises LINEAGE_REROLL_RETIRED.
 *
 * The RPC is service-role-only; this route authenticates and resolves the
 * caller's player id before invoking it.
 */

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import * as Sentry from '@sentry/nextjs';
import { isStrainId } from '@/shared/game/strains';
import { sanitizeLineage } from '@/shared/game/lineage';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

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

    const body = (await request.json()) as Record<string, unknown>;
    const snakeId = typeof body.snake_id === 'string' ? body.snake_id : null;
    const action = body.action;

    // Named explicitly so a stale client gets the reason rather than a 400
    // that reads like a bug.
    if (action === 'reroll') {
      return NextResponse.json(
        {
          error:
            'Lineage reroll is retired — breeding is a deterministic draft. Reroll tokens were converted to DNA.',
        },
        { status: 410 }
      );
    }

    if (!snakeId || action !== 'select_primary') {
      return NextResponse.json(
        { error: 'snake_id and a valid action are required' },
        { status: 400 }
      );
    }
    if (!isStrainId(body.primary)) {
      return NextResponse.json(
        { error: 'A valid primary strain is required' },
        { status: 400 }
      );
    }

    const { data: player, error: playerError } = await supabase
      .from('players')
      .select('id, dna')
      .eq('user_id', user.id)
      .single();
    if (playerError || !player) {
      if (playerError) {
        console.error('Player lookup failed for lineage update:', playerError);
        Sentry.captureException(
          new Error(`lineage player lookup failed: ${playerError.message}`),
          { extra: { userId: user.id } }
        );
      }
      return NextResponse.json({ error: 'Player not found' }, { status: 404 });
    }

    const { data: rawLineage, error: rpcError } = await supabase.rpc(
      'set_lineage_primary',
      {
        p_player_id: player.id,
        p_snake_id: snakeId,
        p_primary: body.primary,
      }
    );
    if (rpcError) {
      console.error('set_lineage_primary RPC error:', rpcError);
      Sentry.captureException(
        new Error(`set_lineage_primary RPC failed: ${rpcError.message}`),
        { extra: { playerId: player.id, snakeId } }
      );
      return NextResponse.json(
        { error: rpcError.message || 'Lineage update failed' },
        { status: 400 }
      );
    }

    const lineage = sanitizeLineage(rawLineage);
    if (!lineage) {
      return NextResponse.json(
        { error: 'Lineage update returned invalid data' },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      action: 'select_primary',
      lineage,
      remainingDna: player.dna,
    });
  } catch (error) {
    console.error('Lineage API error:', error);
    Sentry.captureException(error);
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}

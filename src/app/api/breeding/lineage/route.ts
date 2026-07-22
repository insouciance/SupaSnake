/**
 * Lineage crafting API.
 *
 * `reroll` spends 150 DNA through the atomic reroll_lineage RPC.
 * `select_primary` persists the owner's pre-run choice for a dual lineage.
 * Both RPCs are service-role-only; this route authenticates and resolves the
 * caller's player id before invoking them.
 */

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
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
    if (!snakeId || (action !== 'reroll' && action !== 'select_primary')) {
      return NextResponse.json(
        { error: 'snake_id and a valid action are required' },
        { status: 400 }
      );
    }
    if (action === 'select_primary' && !isStrainId(body.primary)) {
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
      return NextResponse.json({ error: 'Player not found' }, { status: 404 });
    }

    const rpcName = action === 'reroll' ? 'reroll_lineage' : 'set_lineage_primary';
    const rpcArgs =
      action === 'reroll'
        ? { p_player_id: player.id, p_snake_id: snakeId }
        : {
            p_player_id: player.id,
            p_snake_id: snakeId,
            p_primary: body.primary,
          };
    const { data: rawLineage, error: rpcError } = await supabase.rpc(
      rpcName,
      rpcArgs
    );
    if (rpcError) {
      console.error(`${rpcName} RPC error:`, rpcError);
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

    let remainingDna = player.dna;
    if (action === 'reroll') {
      const { data: updatedPlayer, error: balanceError } = await supabase
        .from('players')
        .select('dna')
        .eq('id', player.id)
        .single();
      if (balanceError) {
        console.error('Failed to refresh DNA after lineage reroll:', balanceError);
      } else if (typeof updatedPlayer?.dna === 'number') {
        remainingDna = updatedPlayer.dna;
      }
    }

    return NextResponse.json({
      success: true,
      action,
      lineage,
      remainingDna,
    });
  } catch (error) {
    console.error('Lineage API error:', error);
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}

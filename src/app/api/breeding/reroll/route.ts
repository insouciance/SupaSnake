/**
 * Trait Reroll API (Design v2 Phase 3A, section 6.3)
 * POST /api/breeding/reroll { snake_id, slot }
 *
 * Server authority: the reroll_trait RPC atomically validates ownership,
 * the slot, the recorded parent pool, and the token balance, then redraws
 * ONE inherited trait from the combined parent pool recorded at breed
 * time. Impossible redraws raise before the token is spent.
 */

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { sanitizeTraits } from '@/shared/game/traits';

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
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);

    if (authError || !user) {
      return NextResponse.json({ error: 'Invalid token' }, { status: 401 });
    }

    const body = await request.json();
    const { snake_id, slot } = body;

    if (!snake_id || typeof snake_id !== 'string') {
      return NextResponse.json({ error: 'snake_id is required' }, { status: 400 });
    }
    if (typeof slot !== 'number' || !Number.isInteger(slot) || slot < 1) {
      return NextResponse.json(
        { error: 'slot must be a positive integer (1-based trait slot)' },
        { status: 400 }
      );
    }

    const { data: player } = await supabase
      .from('players')
      .select('id')
      .eq('user_id', user.id)
      .single();

    if (!player) {
      return NextResponse.json({ error: 'Player not found' }, { status: 404 });
    }

    // Atomic server-side reroll (validates ownership, slot, pool, tokens)
    const { data: newTraits, error: rerollError } = await supabase.rpc(
      'reroll_trait',
      {
        p_player_id: player.id,
        p_snake_id: snake_id,
        p_slot: slot,
      }
    );

    if (rerollError || !newTraits) {
      console.error('reroll_trait RPC error:', rerollError);
      return NextResponse.json(
        { error: rerollError?.message || 'Reroll failed' },
        { status: 400 }
      );
    }

    // Remaining tokens for the UI counter (select('*'): the column is
    // post-migration-018, naming it explicitly would error pre-018)
    const { data: updatedPlayer } = await supabase
      .from('players')
      .select('*')
      .eq('id', player.id)
      .single();

    return NextResponse.json({
      success: true,
      traits: sanitizeTraits(newTraits),
      rerollTokens:
        typeof updatedPlayer?.player_reroll_tokens === 'number'
          ? updatedPlayer.player_reroll_tokens
          : 0,
    });
  } catch (err) {
    console.error('Trait reroll API error:', err);
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}

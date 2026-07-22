/**
 * Breeding API - Combine snakes to create new variants
 * Server authority: the breed_snakes RPC atomically validates ownership,
 * deducts DNA, rolls the offspring variant, and logs breeding_history.
 *
 * NOTE: breeding is instant today (no queue). When the breeding queue
 * ships (GAME_CONFIG.breeding.maxActive), the slot count must read
 * has_premium (src/lib/server/premium.ts): premium raises slots to
 * PREMIUM_CONFIG.breeding.maxActivePremium.
 */

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { getTraitSlots, sanitizeTraits } from '@/shared/game/traits';
import { lineageFromAffinity, sanitizeLineage } from '@/shared/game/lineage';
import { GAME_CONFIG } from '@/shared/config/game';
import { mapBreedingHistoryRow } from './utils';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

/**
 * GET /api/breeding - Recent breeding history for the authed player.
 * Joins parent/child collected_snakes -> snake_variants for display names,
 * limited to the 10 most recent events, newest first.
 */
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

    const { data: rows, error: historyError } = await supabase
      .from('breeding_history')
      .select(
        `id, dna_cost, bred_at,
         parent1:collected_snakes!breeding_history_parent1_id_fkey(id, generation, snake_variants(name, rarity)),
         parent2:collected_snakes!breeding_history_parent2_id_fkey(id, generation, snake_variants(name, rarity)),
         trait_rolls,
         child:collected_snakes!breeding_history_child_id_fkey(id, generation, snake_variants(name, rarity))`
      )
      .eq('player_id', player.id)
      .order('bred_at', { ascending: false })
      .limit(10);

    if (historyError) {
      console.error('Breeding history query error:', historyError);
      return NextResponse.json(
        { error: 'Failed to fetch breeding history' },
        { status: 500 }
      );
    }

    return NextResponse.json({
      history: (rows ?? []).map(mapBreedingHistoryRow),
    });
  } catch (err) {
    console.error('Breeding history API error:', err);
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
    const { parent1_id, parent2_id } = body;

    if (!parent1_id || !parent2_id) {
      return NextResponse.json({ error: 'Two parents required' }, { status: 400 });
    }

    if (parent1_id === parent2_id) {
      return NextResponse.json({ error: 'Cannot breed snake with itself' }, { status: 400 });
    }

    const { data: player } = await supabase
      .from('players')
      .select('id, dna')
      .eq('user_id', user.id)
      .single();

    if (!player) {
      return NextResponse.json({ error: 'Player not found' }, { status: 404 });
    }

    // Atomic server-side breeding (validates ownership, same dynasty,
    // DNA cost, generation cap; creates offspring + history entry)
    // Cross-dynasty breeding (Genome §7): dual-lineage offspring - only
    // when the config allows it (the RPC default keeps it refused, so the
    // pre-030 deploy window behaves exactly like today).
    const rpcArgs: Record<string, unknown> = {
      p_player_id: player.id,
      p_parent1_id: parent1_id,
      p_parent2_id: parent2_id,
    };
    if (GAME_CONFIG.genome.crossDynastyBreeding) {
      rpcArgs.p_allow_cross_dynasty = true;
    }
    let { data: childId, error: breedError } = await supabase.rpc(
      'breed_snakes',
      rpcArgs
    );

    // Rolling-deploy compatibility: before migration 030, PostgREST only
    // knows the three-argument RPC. Retry that signature solely when schema
    // resolution failed; its existing same-dynasty gate remains authoritative.
    if (
      GAME_CONFIG.genome.crossDynastyBreeding &&
      breedError &&
      (
        breedError.code === 'PGRST202' ||
        breedError.code === '42883' ||
        /breed_snakes.*p_allow_cross_dynasty|p_allow_cross_dynasty.*breed_snakes/i.test(
          breedError.message ?? ''
        )
      )
    ) {
      ({ data: childId, error: breedError } = await supabase.rpc(
        'breed_snakes',
        {
          p_player_id: player.id,
          p_parent1_id: parent1_id,
          p_parent2_id: parent2_id,
        }
      ));
    }

    if (breedError || !childId) {
      console.error('breed_snakes RPC error:', breedError);
      return NextResponse.json(
        { error: breedError?.message || 'Breeding failed' },
        { status: 400 }
      );
    }

    // Load the offspring with its variant + dynasty for the response
    const { data: childSnake, error: childError } = await supabase
      .from('collected_snakes')
      .select('*, snake_variants(*, dynasties(name))')
      .eq('id', childId)
      .single();

    if (childError || !childSnake) {
      console.error('Failed to fetch bred snake:', childError);
      return NextResponse.json(
        { error: 'Breeding succeeded but failed to fetch offspring' },
        { status: 500 }
      );
    }

    // Actual DNA cost is computed server-side; read it from the history
    // entry. select('*) so trait_rolls (migration 018) rides along without
    // erroring during the pre-018 deploy window.
    const { data: historyEntry } = await supabase
      .from('breeding_history')
      .select('*')
      .eq('child_id', childId)
      .single();

    // select('*') for the same reason: player_reroll_tokens is post-018
    const { data: updatedPlayer } = await supabase
      .from('players')
      .select('*')
      .eq('id', player.id)
      .single();

    // Inherited traits (Design v2 Phase 3A): rolled server-side by the
    // RPC and read back from the offspring ROW - never client-asserted
    const childTraits = sanitizeTraits(childSnake.traits);
    const variantJoin = childSnake.snake_variants as {
      id?: string;
      name?: string;
      rarity?: string;
      dynasty_id?: string;
      lineage_strain?: string | null;
      affinity_strength?: number | null;
      dynasties?: { name?: string } | null;
    } | null;
    const childLineage =
      sanitizeLineage(childSnake.lineage) ??
      lineageFromAffinity(
        variantJoin?.lineage_strain,
        variantJoin?.affinity_strength
      );

    return NextResponse.json({
      success: true,
      child: {
        id: childSnake.id,
        snake_variant_id: childSnake.snake_variant_id,
        variant: variantJoin
          ? {
              id: variantJoin.id ?? childSnake.snake_variant_id,
              name: variantJoin.name ?? null,
              rarity: variantJoin.rarity ?? null,
              dynasty_id: variantJoin.dynasty_id ?? null,
              dynasties: variantJoin.dynasties ?? null,
            }
          : null,
        generation: childSnake.generation,
        traits: childTraits,
        // Lineage (Genome §7): rolled server-side by the RPC, read back
        // from the offspring ROW (pre-030 rows simply lack the column)
        lineage: childLineage,
        trait_slots: getTraitSlots(
          variantJoin?.rarity ?? 'common',
          childSnake.generation ?? 1
        ),
      },
      cost: historyEntry?.dna_cost ?? null,
      traitRolls: historyEntry?.trait_rolls ?? null,
      remainingDna: updatedPlayer?.dna ?? player.dna,
      rerollTokens:
        typeof updatedPlayer?.player_reroll_tokens === 'number'
          ? updatedPlayer.player_reroll_tokens
          : 0,
    });
  } catch (err) {
    console.error('Breeding API error:', err);
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}

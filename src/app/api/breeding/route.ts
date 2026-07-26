/**
 * Breeding API - draft two parents into an offspring (Constitution §8.2).
 *
 * Server authority: the breed_snakes RPC atomically validates ownership,
 * deducts DNA, and writes the child. Nothing is rolled — the RPC resolves
 * the same `breeding_draft` the preview endpoint returns and persists its
 * `preview` object verbatim, so the child a player receives is the child
 * they were shown before paying.
 *
 * NOTE: breeding is instant today (no queue). When the breeding queue
 * ships (GAME_CONFIG.breeding.maxActive), the slot count must read
 * has_premium (src/lib/server/premium.ts): premium raises slots to
 * PREMIUM_CONFIG.breeding.maxActivePremium.
 */

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import * as Sentry from '@sentry/nextjs';
import { getTraitSlots, sanitizeTraits } from '@/shared/game/traits';
import { lineageFromAffinity, sanitizeLineage } from '@/shared/game/lineage';
import { ascendanceYieldBonus } from '@/shared/game/ascendance';
import { GAME_CONFIG } from '@/shared/config/game';
import { mapBreedingHistoryRow, readBreedingChoices } from './utils';

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

    // Atomic server-side breeding (validates ownership, the dynasty gate,
    // every drafted choice, and the DNA cost; creates offspring + history).
    // Generations are uncapped (§8.2 Ascendance) - there is no cap check.
    //
    // The choices are read by the SAME helper the draft endpoint uses, so a
    // client that previewed and then bred sends the RPC identical arguments
    // and receives identical output. Omitted choices resolve to the first
    // option in canonical order, which the draft publishes as `defaults`.
    const { data: childId, error: breedError } = await supabase.rpc(
      'breed_snakes',
      {
        p_player_id: player.id,
        p_parent1_id: parent1_id,
        p_parent2_id: parent2_id,
        p_allow_cross_dynasty: GAME_CONFIG.genome.crossDynastyBreeding,
        ...readBreedingChoices(body),
      }
    );

    if (breedError || !childId) {
      console.error('breed_snakes RPC error:', breedError);
      if (breedError) {
        Sentry.captureException(
          new Error(`breed_snakes RPC failed: ${breedError.message}`),
          { extra: { playerId: player.id, parent1_id, parent2_id } }
        );
      }
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
    // entry, which also carries the draft board the child was chosen from.
    const { data: historyEntry, error: historyError } = await supabase
      .from('breeding_history')
      .select('*')
      .eq('child_id', childId)
      .single();
    if (historyError) {
      console.error('Failed to read breeding history entry:', historyError);
      Sentry.captureException(
        new Error(`breeding history read failed: ${historyError.message}`),
        { extra: { playerId: player.id, childId } }
      );
    }

    const { data: updatedPlayer, error: balanceError } = await supabase
      .from('players')
      .select('dna')
      .eq('id', player.id)
      .single();
    if (balanceError) {
      console.error('Failed to refresh DNA after breeding:', balanceError);
      Sentry.captureException(
        new Error(`post-breed balance read failed: ${balanceError.message}`),
        { extra: { playerId: player.id } }
      );
    }

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
        // Ascendance (§8.2): the permanent Yield bonus this generation
        // carries. Display only - the settlement recomputes it server-side.
        ascendance_yield_bonus: ascendanceYieldBonus(childSnake.generation ?? 1),
      },
      cost: historyEntry?.dna_cost ?? null,
      // The audited draft: the board the player saw and the choices they
      // made. Column name is historical; nothing in it was rolled (§8.2).
      draft: historyEntry?.trait_rolls ?? null,
      remainingDna: updatedPlayer?.dna ?? player.dna,
    });
  } catch (err) {
    console.error('Breeding API error:', err);
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}

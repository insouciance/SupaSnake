/**
 * Breeding API - Combine snakes to create new variants
 * Server authority: DNA deducted, RNG on server
 */

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { GAME_CONFIG } from '@/shared/config/game';
import { getRandomVariantForBreeding, VARIANTS_BY_ID } from '@/shared/data/dynasties';
import type { DynastyId } from '@/shared/types/game';

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

    const { data: parents } = await supabase
      .from('collected_snakes')
      .select('*')
      .eq('player_id', player.id)
      .in('id', [parent1_id, parent2_id]);

    if (!parents || parents.length !== 2) {
      return NextResponse.json({ error: 'Invalid parent snakes' }, { status: 400 });
    }

    const parent1 = parents.find(p => p.id === parent1_id)!;
    const parent2 = parents.find(p => p.id === parent2_id)!;

    const variant1 = VARIANTS_BY_ID[parent1.variant_id];
    const variant2 = VARIANTS_BY_ID[parent2.variant_id];

    if (!variant1 || !variant2) {
      return NextResponse.json({ error: 'Invalid variant data' }, { status: 400 });
    }

    const sameDynasty = variant1.dynastyId === variant2.dynastyId;
    const cost = sameDynasty
      ? GAME_CONFIG.breeding.baseCost
      : GAME_CONFIG.breeding.crossDynastyCost;

    if (player.dna < cost) {
      return NextResponse.json({
        error: 'Not enough DNA',
        required: cost,
        current: player.dna,
      }, { status: 400 });
    }

    const childVariant = getRandomVariantForBreeding(
      variant1.dynastyId as DynastyId,
      variant2.dynastyId as DynastyId
    );

    const childGeneration = Math.max(parent1.generation, parent2.generation) + 1;

    const { data: childSnake, error: insertError } = await supabase
      .from('collected_snakes')
      .insert({
        player_id: player.id,
        variant_id: childVariant.id,
        generation: childGeneration,
        parent1_id: parent1_id,
        parent2_id: parent2_id,
      })
      .select()
      .single();

    if (insertError) {
      return NextResponse.json({ error: 'Failed to create child' }, { status: 500 });
    }

    await supabase
      .from('breeding_history')
      .insert({
        player_id: player.id,
        parent1_id,
        parent2_id,
        child_id: childSnake.id,
        dna_cost: cost,
      });

    const newDna = player.dna - cost;
    await supabase
      .from('players')
      .update({
        dna: newDna,
        breeds_completed: player.id,
      })
      .eq('id', player.id);

    return NextResponse.json({
      success: true,
      child: {
        id: childSnake.id,
        variant_id: childVariant.id,
        variant: childVariant,
        generation: childGeneration,
      },
      cost,
      remainingDna: newDna,
    });
  } catch (err) {
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}

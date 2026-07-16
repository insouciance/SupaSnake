/**
 * Breeding API - Combine snakes to create new variants
 * Server authority: the breed_snakes RPC atomically validates ownership,
 * deducts DNA, rolls the offspring variant, and logs breeding_history.
 */

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

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

    // Atomic server-side breeding (validates ownership, same dynasty,
    // DNA cost, generation cap; creates offspring + history entry)
    const { data: childId, error: breedError } = await supabase.rpc('breed_snakes', {
      p_player_id: player.id,
      p_parent1_id: parent1_id,
      p_parent2_id: parent2_id,
    });

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
      .select('*, snake_variants(id, name, rarity, dynasty_id, dynasties(name))')
      .eq('id', childId)
      .single();

    if (childError || !childSnake) {
      console.error('Failed to fetch bred snake:', childError);
      return NextResponse.json(
        { error: 'Breeding succeeded but failed to fetch offspring' },
        { status: 500 }
      );
    }

    // Actual DNA cost is computed server-side; read it from the history entry
    const { data: historyEntry } = await supabase
      .from('breeding_history')
      .select('dna_cost')
      .eq('child_id', childId)
      .single();

    const { data: updatedPlayer } = await supabase
      .from('players')
      .select('dna')
      .eq('id', player.id)
      .single();

    return NextResponse.json({
      success: true,
      child: {
        id: childSnake.id,
        snake_variant_id: childSnake.snake_variant_id,
        variant: childSnake.snake_variants,
        generation: childSnake.generation,
      },
      cost: historyEntry?.dna_cost ?? null,
      remainingDna: updatedPlayer?.dna ?? player.dna,
    });
  } catch (err) {
    console.error('Breeding API error:', err);
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}

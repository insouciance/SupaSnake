/**
 * Collection API - Player's owned snakes
 * GET /api/collection - List player's collection
 * POST /api/collection - Unlock a new variant
 *
 * All mutations are server-authoritative via RPC functions
 */

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import type { OwnedSnake } from '@/shared/types/snake-data-model';
import { mapOwnedSnakeRow, getPlayerId } from './utils';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export async function GET(request: NextRequest) {
  try {
    // Verify authentication
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

    // Get player with DNA balance
    const { data: player, error: playerError } = await supabase
      .from('players')
      .select('id, dna')
      .eq('user_id', user.id)
      .single();

    if (playerError || !player) {
      return NextResponse.json({ error: 'Player not found' }, { status: 404 });
    }

    // Fetch player's collection (join variant + dynasty names for display)
    const { data: rows, error } = await supabase
      .from('collected_snakes')
      .select('*, snake_variants(name, rarity, dynasties(name))')
      .eq('player_id', player.id)
      .order('acquired_at', { ascending: false });

    if (error) {
      console.error('Failed to fetch collection:', error);
      return NextResponse.json(
        { error: 'Failed to fetch collection' },
        { status: 500 }
      );
    }

    const snakes: OwnedSnake[] = (rows || []).map(mapOwnedSnakeRow);

    // Return snakes AND DNA balance (server authority)
    return NextResponse.json({
      snakes,
      dnaBalance: player.dna ?? 0,
    });
  } catch (err) {
    console.error('Collection API error:', err);
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    // Verify authentication
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

    // Get player ID and current DNA
    const { data: player, error: playerError } = await supabase
      .from('players')
      .select('id, dna')
      .eq('user_id', user.id)
      .single();

    if (playerError || !player) {
      return NextResponse.json({ error: 'Player not found' }, { status: 404 });
    }

    // Parse request body
    const body = await request.json();
    const { variantId } = body;

    if (!variantId) {
      return NextResponse.json(
        { error: 'variantId is required' },
        { status: 400 }
      );
    }

    // Call server-authoritative unlock function
    const { data: newSnakeId, error: unlockError } = await supabase.rpc(
      'unlock_variant',
      {
        p_player_id: player.id,
        p_variant_id: variantId,
      }
    );

    if (unlockError) {
      console.error('Unlock failed:', unlockError);
      return NextResponse.json(
        { error: unlockError.message || 'Failed to unlock variant' },
        { status: 400 }
      );
    }

    // Fetch the newly created snake
    const { data: newSnake, error: fetchError } = await supabase
      .from('collected_snakes')
      .select('*, snake_variants(name, rarity, dynasties(name))')
      .eq('id', newSnakeId)
      .single();

    if (fetchError || !newSnake) {
      console.error('Failed to fetch new snake:', fetchError);
      return NextResponse.json(
        { error: 'Unlock succeeded but failed to fetch snake' },
        { status: 500 }
      );
    }

    // Get updated DNA balance
    const { data: updatedPlayer } = await supabase
      .from('players')
      .select('dna')
      .eq('id', player.id)
      .single();

    return NextResponse.json({
      success: true,
      snake: mapOwnedSnakeRow(newSnake),
      newDnaBalance: updatedPlayer?.dna ?? player.dna,
    });
  } catch (err) {
    console.error('Collection unlock error:', err);
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}

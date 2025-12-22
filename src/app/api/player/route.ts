/**
 * Player API - Get/Create player profile
 * Server authority: All game state managed here
 */

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { STARTER_VARIANTS } from '@/shared/data/dynasties';
import { calculateServerEnergy } from '@/lib/server/energyRegen';
import { GAME_CONFIG } from '@/shared/config/game';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

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

    let { data: player, error } = await supabase
      .from('players')
      .select('*, collected_snakes(*), player_settings(*)')
      .eq('user_id', user.id)
      .single();

    if (error && error.code === 'PGRST116') {
      const { data: newPlayer, error: createError } = await supabase
        .from('players')
        .insert({
          user_id: user.id,
          dna: 0,
          energy: 5,
          max_energy: 5,
        })
        .select()
        .single();

      if (createError) {
        return NextResponse.json({ error: 'Failed to create player' }, { status: 500 });
      }

      await supabase.from('player_settings').insert({
        player_id: newPlayer.id,
        selected_dynasty: 'EMBER',
      });

      const starterSnake = STARTER_VARIANTS[0];
      await supabase.from('collected_snakes').insert({
        player_id: newPlayer.id,
        variant_id: starterSnake.id,
        generation: 1,
      });

      const { data: fullPlayer } = await supabase
        .from('players')
        .select('*, collected_snakes(*), player_settings(*)')
        .eq('id', newPlayer.id)
        .single();

      player = fullPlayer;
    } else if (error) {
      return NextResponse.json({ error: 'Database error' }, { status: 500 });
    }

    // Calculate server-side energy regeneration
    const maxEnergy = player.max_energy || GAME_CONFIG.economy.energy.maxEnergy;
    const energyResult = calculateServerEnergy(
      player.energy,
      maxEnergy,
      player.energy_regen_at
    );

    // Update database if energy was regenerated or timer needs updating
    if (energyResult.energyRegenerated > 0 ||
        (energyResult.newRegenAt?.toISOString() !== player.energy_regen_at)) {
      const updates: Record<string, unknown> = {
        energy: energyResult.currentEnergy,
        energy_regen_at: energyResult.newRegenAt,
      };

      await supabase
        .from('players')
        .update(updates)
        .eq('id', player.id);

      // Log regeneration in economy_transactions if energy was regenerated
      if (energyResult.energyRegenerated > 0) {
        await supabase.from('economy_transactions').insert({
          player_id: player.id,
          source_type: 'energy_regen',
          currency_type: 'energy',
          amount: energyResult.energyRegenerated,
          balance_after: energyResult.currentEnergy,
          metadata: { regenerated_at: new Date().toISOString() },
        });
      }

      // Update the player object with new values
      player.energy = energyResult.currentEnergy;
      player.energy_regen_at = energyResult.newRegenAt;
    }

    // Calculate collection size for passive progress
    const collectionSize = player.collected_snakes?.length || 0;

    return NextResponse.json({
      player,
      // Additional fields for Welcome Back modal
      lastLoginAt: player.last_login_at || null,
      collectionSize,
    });
  } catch (err) {
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}

export async function PATCH(request: NextRequest) {
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
    const { dna, energy, selected_dynasty } = body;

    const { data: player } = await supabase
      .from('players')
      .select('id')
      .eq('user_id', user.id)
      .single();

    if (!player) {
      return NextResponse.json({ error: 'Player not found' }, { status: 404 });
    }

    const updates: Record<string, unknown> = {};
    if (dna !== undefined) updates.dna = dna;
    if (energy !== undefined) updates.energy = energy;

    if (Object.keys(updates).length > 0) {
      await supabase
        .from('players')
        .update(updates)
        .eq('id', player.id);
    }

    if (selected_dynasty) {
      await supabase
        .from('player_settings')
        .update({ selected_dynasty })
        .eq('player_id', player.id);
    }

    return NextResponse.json({ success: true });
  } catch (err) {
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}

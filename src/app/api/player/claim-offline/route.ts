/**
 * Claim Offline Progress API
 * Server-authoritative endpoint to claim passive rewards
 *
 * Flow:
 * 1. Get player's last_login_at and collection size
 * 2. Calculate rewards server-side (source of truth)
 * 3. Update DNA balance and last_login_at
 * 4. Log transaction for audit trail
 */

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { calculateOfflineProgress } from '@/lib/progression/offlineProgress';
import { GAME_CONFIG } from '@/shared/config/game';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export async function POST(request: NextRequest) {
  try {
    // Authenticate
    const authHeader = request.headers.get('authorization');
    if (!authHeader) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const token = authHeader.replace('Bearer ', '');
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);

    if (authError || !user) {
      return NextResponse.json({ error: 'Invalid token' }, { status: 401 });
    }

    // Get player with current state
    const { data: player, error: playerError } = await supabase
      .from('players')
      .select('id, dna, energy, max_energy, last_login_at')
      .eq('user_id', user.id)
      .single();

    if (playerError || !player) {
      return NextResponse.json({ error: 'Player not found' }, { status: 404 });
    }

    // Get collection size. head:true count queries return data: null -
    // the size arrives in the count field, never in data.
    const { count: collectionCount } = await supabase
      .from('collected_snakes')
      .select('id', { count: 'exact', head: true })
      .eq('player_id', player.id);

    const collectionSize = collectionCount || 0;

    // Calculate rewards server-side (authoritative)
    const progress = calculateOfflineProgress({
      lastLoginAt: player.last_login_at || new Date().toISOString(),
      currentEnergy: player.energy,
      maxEnergy: player.max_energy || GAME_CONFIG.economy.energy.maxEnergy,
      collectionSize,
    });

    // If no rewards to claim, just update last_login_at
    if (!progress.hasRewards) {
      await supabase
        .from('players')
        .update({ last_login_at: new Date().toISOString() })
        .eq('id', player.id);

      return NextResponse.json({
        success: true,
        message: 'No rewards to claim',
        rewards: {
          passiveDnaEarned: 0,
          energyRestored: 0,
          elapsedHours: progress.elapsedHours,
        },
      });
    }

    // Apply rewards
    const newDna = player.dna + progress.passiveDnaEarned;
    const newEnergy = Math.min(
      player.energy + progress.energyRestored,
      player.max_energy || GAME_CONFIG.economy.energy.maxEnergy
    );

    // Update player with new values and last_login_at
    const { error: updateError } = await supabase
      .from('players')
      .update({
        dna: newDna,
        energy: newEnergy,
        last_login_at: new Date().toISOString(),
      })
      .eq('id', player.id);

    if (updateError) {
      return NextResponse.json({ error: 'Failed to update player' }, { status: 500 });
    }

    // Log transaction for audit trail
    if (progress.passiveDnaEarned > 0) {
      await supabase.from('economy_transactions').insert({
        player_id: player.id,
        resource_type: 'dna',
        amount: progress.passiveDnaEarned,
        balance_after: newDna,
        source_type: 'offline_claim',
        metadata: {
          elapsed_hours: progress.elapsedHours,
          collection_size: collectionSize,
          claimed_at: new Date().toISOString(),
        },
      });
    }

    return NextResponse.json({
      success: true,
      rewards: {
        passiveDnaEarned: progress.passiveDnaEarned,
        energyRestored: progress.energyRestored,
        elapsedHours: progress.elapsedHours,
      },
      newBalances: {
        dna: newDna,
        energy: newEnergy,
      },
    });
  } catch (err) {
    console.error('Claim offline error:', err);
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}

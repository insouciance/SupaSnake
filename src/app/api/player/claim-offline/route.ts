/**
 * Claim Offline Progress API
 * Server-authoritative endpoint to claim passive DNA.
 *
 * Flow:
 * 1. Get player's last_login_at and collection size
 * 2. Calculate rewards server-side (source of truth)
 * 3. Update DNA balance and last_login_at
 * 4. Log transaction for audit trail
 *
 * THIS ROUTE NO LONGER TOUCHES ENERGY (Constitution §8.6), AND IT NO LONGER
 * READS THE PREMIUM ENTITLEMENT (Constitution §10.4, WP-0.09).
 *
 * It used to restore energy from its own `last_login_at` clock, clamped to
 * `max_energy` - which destroyed purchased over-cap energy outright
 * (GROUND_TRUTH §9.1: buy the 25-energy Vault, be away an hour, come back
 * with 5) and disagreed indefinitely with the `energy_regen_at` clock in
 * /api/player (§9.2). Both defects are structurally impossible now: there is
 * no legacy energy balance for this route to clamp and no client-derived
 * clock for it to compete with. Migration 059's independent Energy ledger
 * recovers through `read_player_energy`/`commit_run_energy`; this claim route
 * never grants, accelerates, or mutates it.
 */

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import * as Sentry from '@sentry/nextjs';
import { calculateOfflineProgress } from '@/lib/progression/offlineProgress';
import { ENGAGEMENT_CONFIG } from '@/shared/config/engagement';

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
      .select('id, dna, last_login_at')
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

    // ONE offline window for everyone. Premium used to extend it to 48h;
    // WP-0.09 removed that perk (Constitution §10.4 - "offline anything" is
    // on the never-sold list), so nothing here reads the entitlement and
    // there is no branch for a subscription to take.
    const progress = calculateOfflineProgress(
      {
        lastLoginAt: player.last_login_at || new Date().toISOString(),
        collectionSize,
      },
      ENGAGEMENT_CONFIG.passiveProgress
    );

    // If no rewards to claim, just update last_login_at
    if (!progress.hasRewards) {
      const { error: loginTouchError } = await supabase
        .from('players')
        .update({ last_login_at: new Date().toISOString() })
        .eq('id', player.id);
      if (loginTouchError) {
        // Non-fatal: nothing was claimed, next visit retries the touch
        console.error('Failed to update last_login_at:', {
          playerId: player.id,
          error: loginTouchError,
        });
      }

      return NextResponse.json({
        success: true,
        message: 'No rewards to claim',
        rewards: {
          passiveDnaEarned: 0,
          elapsedHours: progress.elapsedHours,
        },
      });
    }

    // Apply rewards. DNA only - this route writes no energy of any kind
    // (see the header note: GT §9.1/§9.2).
    const newDna = player.dna + progress.passiveDnaEarned;

    const { error: updateError } = await supabase
      .from('players')
      .update({
        dna: newDna,
        last_login_at: new Date().toISOString(),
      })
      .eq('id', player.id);

    if (updateError) {
      console.error('Failed to apply offline progress:', {
        playerId: player.id,
        error: updateError,
      });
      Sentry.captureException(
        new Error(`claim-offline player update failed: ${updateError.message}`),
        { extra: { playerId: player.id } }
      );
      return NextResponse.json({ error: 'Failed to update player' }, { status: 500 });
    }

    // Log transaction for audit trail
    if (progress.passiveDnaEarned > 0) {
      const { error: claimTxError } = await supabase.from('economy_transactions').insert({
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
      if (claimTxError) {
        // Audit log only - the claim itself succeeded
        console.error('Failed to log offline_claim transaction:', {
          playerId: player.id,
          error: claimTxError,
        });
      }
    }

    return NextResponse.json({
      success: true,
      rewards: {
        passiveDnaEarned: progress.passiveDnaEarned,
        elapsedHours: progress.elapsedHours,
      },
      newBalances: {
        dna: newDna,
      },
    });
  } catch (err) {
    console.error('Claim offline error:', err);
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}

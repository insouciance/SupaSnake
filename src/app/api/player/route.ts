/**
 * Player API - Get/Create player profile
 * Server authority: All game state managed here
 */

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { calculateServerEnergy } from '@/lib/server/energyRegen';
import { GAME_CONFIG } from '@/shared/config/game';
import {
  DEFAULT_AIM_SYSTEM,
  isAimSystemId,
  isAimSystemUnlocked,
  type AimStats,
} from '@/lib/game/aimSystems';

const VALID_DYNASTIES = ['CYBER', 'PRIMAL', 'COSMIC'];

/** player_settings joins as an object (1:1 PK relation) or a one-row array
 *  depending on PostgREST relationship detection - normalize both. */
function settingsRow(playerSettings: unknown): Record<string, unknown> | null {
  if (Array.isArray(playerSettings)) {
    return (playerSettings[0] as Record<string, unknown>) ?? null;
  }
  return (playerSettings as Record<string, unknown>) ?? null;
}

/** Aim-system unlock stats from existing columns (no new tracking).
 *  maxGeneration is MAX(generation) over collected_snakes - a cheap
 *  aggregate over rows the query already fetched. */
function buildAimStats(player: {
  high_score?: number | null;
  total_games_played?: number | null;
  breeds_completed?: number | null;
  collected_snakes?: Array<{ generation?: number | null }> | null;
}): AimStats {
  const maxGeneration = (player.collected_snakes ?? []).reduce(
    (max, snake) => Math.max(max, snake.generation ?? 0),
    0
  );
  return {
    highScore: player.high_score ?? 0,
    totalGames: player.total_games_played ?? 0,
    breeds: player.breeds_completed ?? 0,
    maxGeneration,
  };
}

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

      const { error: settingsInsertError } = await supabase.from('player_settings').insert({
        player_id: newPlayer.id,
        selected_dynasty: 'CYBER',
      });
      if (settingsInsertError) {
        // Non-fatal: player exists, defaults apply until settings are saved
        console.error('Failed to create default player_settings:', {
          playerId: newPlayer.id,
          error: settingsInsertError,
        });
      }

      // No auto-seeded starter snake: the player picks one in the Lab
      // (client is told via needsStarterSelection below).
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

      const { error: regenUpdateError } = await supabase
        .from('players')
        .update(updates)
        .eq('id', player.id);
      if (regenUpdateError) {
        // Regen is recomputed from energy_regen_at on every read, so a
        // failed persist self-heals on the next request - log and continue
        console.error('Failed to persist regenerated energy:', {
          playerId: player.id,
          error: regenUpdateError,
        });
      }

      // Log regeneration in economy_transactions if energy was regenerated
      if (energyResult.energyRegenerated > 0) {
        const { error: txError } = await supabase.from('economy_transactions').insert({
          player_id: player.id,
          source_type: 'energy_regen',
          resource_type: 'energy',
          amount: energyResult.energyRegenerated,
          balance_after: energyResult.currentEnergy,
          metadata: { regenerated_at: new Date().toISOString() },
        });
        if (txError) {
          console.error('Failed to log energy regen transaction:', txError);
        }
      }

      // Update the player object with new values
      player.energy = energyResult.currentEnergy;
      player.energy_regen_at = energyResult.newRegenAt;
    }

    // Calculate collection size for passive progress
    const collectionSize = player.collected_snakes?.length || 0;

    // Aim system: stored selection + the stats that drive unlock chips.
    // Stored-but-locked picks (v1->v2 migration edges, e.g. a breeds-only
    // sequence player remapped to pathline) fall back to the default -
    // GET never hands the client a system it couldn't select itself.
    const settings = settingsRow(player.player_settings);
    const storedAim = settings?.aim_system;
    const aimStats = buildAimStats(player);
    const aimSystem =
      isAimSystemId(storedAim) && isAimSystemUnlocked(storedAim, aimStats)
        ? storedAim
        : DEFAULT_AIM_SYSTEM;

    return NextResponse.json({
      player,
      // Additional fields for Welcome Back modal
      lastLoginAt: player.last_login_at || null,
      collectionSize,
      // New players own zero snakes until they pick a starter in the Lab
      needsStarterSelection: collectionSize === 0,
      // Aim telegraph meta-progression
      aimSystem,
      aimStats,
      // Identity v1 I4 (section 9.2): weekly Analyst digest email
      // opt-in. false pre-025 (column absent from the row).
      emailDigestOptIn: settings?.email_digest_opt_in === true,
      // Trait reroll tokens (Design v2 Phase 3A) - 0 pre-migration-018
      rerollTokens:
        typeof player.player_reroll_tokens === 'number'
          ? player.player_reroll_tokens
          : 0,
    });
  } catch (err) {
    console.error('Player GET error:', err);
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
    // SECURITY: Only allow safe player preferences, NOT economy resources
    // DNA and energy must ONLY change through validated game actions:
    // - Game completion (via /api/game/session)
    // - Daily rewards (via /api/player/daily)
    // - Unlock purchases (via /api/collection with RPC cost deduction)
    // - Server-calculated regeneration
    const { selected_dynasty, aim_system, email_digest_opt_in } = body;

    const { data: player } = await supabase
      .from('players')
      .select('id, high_score, total_games_played, breeds_completed, collected_snakes(generation)')
      .eq('user_id', user.id)
      .single();

    if (!player) {
      return NextResponse.json({ error: 'Player not found' }, { status: 404 });
    }

    // Only update safe settings (no dna, no energy)
    if (selected_dynasty && !VALID_DYNASTIES.includes(selected_dynasty)) {
      return NextResponse.json({ error: 'Invalid dynasty' }, { status: 400 });
    }

    // Aim system: validate the id AND the unlock server-side - selecting a
    // locked system is rejected, so client tampering cannot equip it
    if (aim_system !== undefined) {
      if (!isAimSystemId(aim_system)) {
        return NextResponse.json({ error: 'Invalid aim system' }, { status: 400 });
      }
      if (!isAimSystemUnlocked(aim_system, buildAimStats(player))) {
        return NextResponse.json({ error: 'Aim system locked' }, { status: 403 });
      }
      const { error: aimUpdateError } = await supabase
        .from('player_settings')
        .update({ aim_system })
        .eq('player_id', player.id);

      if (aimUpdateError) {
        console.error('Failed to update aim_system:', {
          playerId: player.id,
          aim_system,
          error: aimUpdateError,
        });
        return NextResponse.json({ error: 'Failed to save settings' }, { status: 500 });
      }
    }
    // Identity v1 I4 (section 9.2): weekly digest email opt-in. Upsert
    // so players without a settings row can still opt in. Pre-025 the
    // column doesn't exist - report not-live, never a hard failure.
    if (email_digest_opt_in !== undefined) {
      if (typeof email_digest_opt_in !== 'boolean') {
        return NextResponse.json({ error: 'Invalid opt-in value' }, { status: 400 });
      }
      const { error: digestUpdateError } = await supabase
        .from('player_settings')
        .upsert(
          { player_id: player.id, email_digest_opt_in },
          { onConflict: 'player_id' }
        );
      if (digestUpdateError) {
        if (digestUpdateError.code === '42703') {
          return NextResponse.json(
            { error: 'Digest email is not live yet', live: false },
            { status: 503 }
          );
        }
        console.error('Failed to update email_digest_opt_in:', {
          playerId: player.id,
          error: digestUpdateError,
        });
        return NextResponse.json({ error: 'Failed to save settings' }, { status: 500 });
      }
    }

    if (selected_dynasty) {
      const { error: settingsUpdateError } = await supabase
        .from('player_settings')
        .update({ selected_dynasty })
        .eq('player_id', player.id);

      if (settingsUpdateError) {
        // Primary write of this request - fail loudly, never silently
        console.error('Failed to update player_settings:', {
          playerId: player.id,
          selected_dynasty,
          error: settingsUpdateError,
        });
        return NextResponse.json({ error: 'Failed to save settings' }, { status: 500 });
      }
    }

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error('Player PATCH error:', err);
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}

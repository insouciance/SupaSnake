/**
 * Player API - Get/Create player profile
 * Server authority: All game state managed here
 */

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import * as Sentry from '@sentry/nextjs';
import { readChargeStatus } from '@/lib/server/energyEnvelope';
import { isChargeMeterVisible } from '@/shared/game/energyEnvelope';
import { GAME_CONFIG } from '@/shared/config/game';
import { DEFAULT_AIM_SYSTEM, isAimSystemId } from '@/lib/game/aimSystems';
import { getGenomeRunFacts, deriveFtue } from '@/lib/server/genome';
import { getMasteryXp } from '@/lib/server/mastery';
import { levelForXp } from '@/shared/game/mastery';
import { FTUE_V2_ENABLED } from '@/lib/ftue/config';
import type { FtueBootstrapResponse } from '@/lib/ftue/types';

const VALID_DYNASTIES = ['CYBER', 'PRIMAL', 'COSMIC'];

/** player_settings joins as an object (1:1 PK relation) or a one-row array
 *  depending on PostgREST relationship detection - normalize both. */
function settingsRow(playerSettings: unknown): Record<string, unknown> | null {
  if (Array.isArray(playerSettings)) {
    return (playerSettings[0] as Record<string, unknown>) ?? null;
  }
  return (playerSettings as Record<string, unknown>) ?? null;
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

    // FTUE v2 has one authoritative entry point for create/recover/grant/
    // equip. GET also invokes it so direct links and returning broken
    // profiles self-heal without ever redirecting to the Lab.
    let bootstrapState: Omit<FtueBootstrapResponse, 'ftueV2'> | null = null;
    if (FTUE_V2_ENABLED) {
      const { data: bootstrapData, error: bootstrapError } = await supabase.rpc(
        'bootstrap_player',
        { p_user_id: user.id }
      );
      if (bootstrapError || !bootstrapData) {
        console.error('Player bootstrap failed during GET:', {
          userId: user.id,
          error: bootstrapError,
        });
        return NextResponse.json(
          { error: 'Failed to prepare player' },
          { status: 500 }
        );
      }
      bootstrapState = bootstrapData as Omit<FtueBootstrapResponse, 'ftueV2'>;
    }

    let { data: player, error } = await supabase
      .from('players')
      .select('*, collected_snakes(*), player_settings(*)')
      .eq('user_id', user.id)
      .single();

    if (error && error.code === 'PGRST116') {
      const { data: newPlayer, error: createError } = await supabase
        .from('players')
        // No energy fields: the envelope has no starting balance to seed
        // (§8.6). The deprecated columns keep their schema defaults.
        .insert({
          user_id: user.id,
          dna: 0,
        })
        .select()
        .single();

      if (createError) {
        return NextResponse.json({ error: 'Failed to create player' }, { status: 500 });
      }

      const { error: settingsInsertError } = await supabase.from('player_settings').insert({
        player_id: newPlayer.id,
        selected_dynasty: 'PRIMAL',
      });
      if (settingsInsertError) {
        // Non-fatal: player exists, defaults apply until settings are saved
        console.error('Failed to create default player_settings:', {
          playerId: newPlayer.id,
          error: settingsInsertError,
        });
      }

      // Legacy fallback only (FTUE v2 creates through bootstrap_player).
      // A disabled rollout flag preserves the old collection contract.
      const { data: fullPlayer } = await supabase
        .from('players')
        .select('*, collected_snakes(*), player_settings(*)')
        .eq('id', newPlayer.id)
        .single();

      player = fullPlayer;
    } else if (error) {
      return NextResponse.json({ error: 'Database error' }, { status: 500 });
    }

    // The daily harvest envelope (Constitution §8.6). Purely a READ: the
    // status is derived from (charges_day, charges_used) against the current
    // UTC date, so a profile fetch never writes and never advances a clock.
    //
    // This replaces the 20-minute regeneration drip that used to run here
    // and persist on every GET. That drip was one of the two competing
    // restoration authorities recorded in GROUND_TRUTH §9.2 (the other was
    // /api/player/claim-offline); both are gone. The UTC day rolling over is
    // now the only refill event in the product.
    const charge = await readChargeStatus(supabase, player.id);

    // Calculate collection size for passive progress
    const collectionSize = player.collected_snakes?.length || 0;

    // Aim system: the stored selection, validated as an id and nothing more.
    // Constitution §6.1 / §15 overturn 10: every system is a setting from run
    // 1, so there is no unlock to re-check here and no progression stat to
    // read - a fresh anonymous account is served the same four options as a
    // veteran. An unrecognised stored value (a retired v1 id in a mixed
    // deploy) falls back to the default.
    const settings = settingsRow(player.player_settings);
    const storedAim = settings?.aim_system;
    const aimSystem = isAimSystemId(storedAim) ? storedAim : DEFAULT_AIM_SYSTEM;

    // Pre-run FTUE visibility comes from the same server facts used when a
    // session starts. This lets Build Seed remain hidden until its actual
    // gameplay benefit is unlocked; failures degrade to the locked state.
    let genomeFtue = null;
    if (GAME_CONFIG.features.genome) {
      const [{ bankedRuns, ownedVariants }, ...masteryXp] = await Promise.all([
        getGenomeRunFacts(supabase, player.id),
        getMasteryXp(supabase, player.id, 'CYBER'),
        getMasteryXp(supabase, player.id, 'PRIMAL'),
        getMasteryXp(supabase, player.id, 'COSMIC'),
      ]);
      const maxMasteryLevel = masteryXp.reduce(
        (max, xp) => Math.max(max, levelForXp(xp)),
        0
      );
      genomeFtue = {
        bankedRuns,
        ...deriveFtue(bankedRuns, maxMasteryLevel, ownedVariants),
      };
    }

    return NextResponse.json({
      player,
      // The day's harvest envelope (§8.6). `visible` carries the §8.6 ramp:
      // the meter is not shown until the player has banked enough runs to
      // have met the game, so a newcomer never meets scarcity first.
      charge: {
        ...charge,
        visible: isChargeMeterVisible(player.total_games_played ?? 0),
      },
      // Additional fields for Welcome Back modal
      lastLoginAt: player.last_login_at || null,
      collectionSize,
      // Starter selection is never a blocking state under FTUE v2.
      needsStarterSelection: FTUE_V2_ENABLED ? false : collectionSize === 0,
      hasCompletedFirstRun: (player.total_games_played ?? 0) > 0,
      ...(bootstrapState ? { onboarding: bootstrapState.onboarding } : {}),
      // Aim telegraph: a control preference, not progression. No unlock
      // stats accompany it — there is nothing left to unlock.
      aimSystem,
      ...(genomeFtue ? { genomeFtue } : {}),
      // Identity v1 I4 (section 9.2): weekly Analyst digest email
      // opt-in. false pre-025 (column absent from the row).
      emailDigestOptIn: settings?.email_digest_opt_in === true,
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

    // Only the id: none of the writes below reads a progression stat, and the
    // aim system deliberately no longer does either (§6.1).
    const { data: player, error: playerError } = await supabase
      .from('players')
      .select('id')
      .eq('user_id', user.id)
      .single();

    if (playerError || !player) {
      if (playerError && playerError.code !== 'PGRST116') {
        console.error('Failed to load player for PATCH:', {
          userId: user.id,
          error: playerError,
        });
        Sentry.captureException(
          new Error(`Player PATCH lookup failed: ${playerError.message}`),
          { extra: { userId: user.id, code: playerError.code } }
        );
      }
      return NextResponse.json({ error: 'Player not found' }, { status: 404 });
    }

    // Only update safe settings (no dna, no energy)
    if (selected_dynasty && !VALID_DYNASTIES.includes(selected_dynasty)) {
      return NextResponse.json({ error: 'Invalid dynasty' }, { status: 400 });
    }

    // Aim system: validate the id, and only the id. There is no unlock to
    // check (§6.1, §15 overturn 10) - every system is selectable by every
    // player from run 1, so the only rejection left is a malformed value.
    if (aim_system !== undefined) {
      if (!isAimSystemId(aim_system)) {
        return NextResponse.json({ error: 'Invalid aim system' }, { status: 400 });
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

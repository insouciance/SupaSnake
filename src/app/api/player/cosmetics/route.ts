/**
 * Snake cosmetics — what this player may wear, and what they are wearing.
 *
 * GET /api/player/cosmetics
 *   → { live, loadout, items }
 *
 * Feeds the home chamber's cosmetics menu. The equipped set comes from the
 * `read_snake_loadout` RPC (migration 069), which is also what the run render
 * path reads — one answer, so the chamber and the board can never disagree.
 *
 * Server authority (R11): this route reads. Every write goes through
 * POST /api/player/cosmetics/equip → the `equip_cosmetic` RPC, which decides
 * ownership. Nothing here is an entitlement check and nothing here is a price.
 *
 * Degradation: before migration 069 the RPC does not exist. That returns
 * `{ live: false }` with an empty catalog and a 200, because a player with no
 * cosmetics is a legitimate state and Home must render either way (doctrine
 * principle 1 — play is always available; a supporting subsystem may be absent
 * without the player finding out).
 */

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import * as Sentry from '@sentry/nextjs';

import { isMissingIdentityInfra } from '@/lib/server/identity';
import {
  EMPTY_SNAKE_COSMETIC_CATALOG,
  parseSnakeCosmeticCatalog,
} from '@/lib/cosmetics/snakeCosmetics';

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
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser(token);
    if (authError || !user) {
      return NextResponse.json({ error: 'Invalid token' }, { status: 401 });
    }

    const { data: player, error: playerError } = await supabase
      .from('players')
      .select('id')
      .eq('user_id', user.id)
      .single();
    if (playerError || !player) {
      return NextResponse.json({ error: 'Player not found' }, { status: 404 });
    }

    const { data, error } = await supabase.rpc('read_snake_cosmetic_catalog', {
      p_player_id: player.id,
    });

    if (error) {
      if (isMissingIdentityInfra(error)) {
        // Pre-069. Not an incident: the chamber renders the bare specimen.
        return NextResponse.json(EMPTY_SNAKE_COSMETIC_CATALOG);
      }
      console.error('read_snake_cosmetic_catalog error:', {
        playerId: player.id,
        error,
      });
      Sentry.captureException(
        new Error(`Snake cosmetic catalog read failed: ${error.message}`),
        { extra: { playerId: player.id, code: error.code } }
      );
      return NextResponse.json(
        { error: 'Could not read your cosmetics' },
        { status: 500 }
      );
    }

    return NextResponse.json(parseSnakeCosmeticCatalog(data));
  } catch (err) {
    console.error('Snake cosmetics API error:', err);
    Sentry.captureException(err);
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}

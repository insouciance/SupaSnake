/**
 * Equip API (Player Identity v1 sections 5.1 + 6.5).
 *
 * POST /api/player/cosmetics/equip  { slot, position?, cosmeticId }
 *   Equips (or, with cosmeticId: null, unequips) one loadout position.
 *   Server authority: the equip_cosmetic RPC enforces ownership + slot
 *   match + the badge pick-3 cap; the client never writes
 *   player_loadout. 503 during the pre-migration-022 window.
 *
 * Since migration 069 this also serves the snake slots (face / crown /
 * food_skin), so the home cosmetics menu and the settings Identity panel
 * write through one route and one RPC rather than two.
 */

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { isMissingIdentityInfra } from '@/lib/server/identity';
import { isCosmeticSlot } from '@/shared/game/cosmeticSlots';

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

    const body = await request.json().catch(() => ({}));
    const slot = typeof body?.slot === 'string' ? body.slot : '';
    const position =
      typeof body?.position === 'number' && Number.isInteger(body.position)
        ? body.position
        : 1;
    const cosmeticId =
      typeof body?.cosmeticId === 'string' ? body.cosmeticId : null;

    // The slot vocabulary is authored once in `@/shared/game/cosmeticSlots`
    // and pinned to migration 069's CHECK constraints by
    // `cosmeticSlots.migration.test.ts`. This route never re-lists it.
    if (!isCosmeticSlot(slot)) {
      return NextResponse.json({ error: 'invalid_slot' }, { status: 400 });
    }

    const { data, error } = await supabase.rpc('equip_cosmetic', {
      p_player_id: player.id,
      p_slot: slot,
      p_position: position,
      p_cosmetic_id: cosmeticId,
    });

    if (error) {
      if (isMissingIdentityInfra(error)) {
        return NextResponse.json(
          { error: 'Cosmetics are not live yet — try again soon' },
          { status: 503 }
        );
      }
      console.error('equip_cosmetic error:', { playerId: player.id, error });
      return NextResponse.json({ error: 'Equip failed' }, { status: 500 });
    }

    const result = (data ?? {}) as {
      success?: boolean;
      equipped?: string | null;
      error?: string;
    };

    if (result.success) {
      return NextResponse.json({
        success: true,
        equipped: result.equipped ?? null,
      });
    }

    const code = result.error ?? 'invalid_slot';
    const status =
      code === 'invalid_slot' ? 400
      : code === 'player_not_found' ? 404
      : 409;
    return NextResponse.json({ error: code }, { status });
  } catch (err) {
    console.error('Equip API error:', err);
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}

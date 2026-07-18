/**
 * Own-identity API (Player Identity v1 section 4).
 *
 * GET /api/player/identity
 *   The caller's identity (player_identity_view row), cosmetic
 *   inventory, and loadout - everything the settings Identity tab and
 *   the own Player Card need in one read. { live: false } during the
 *   pre-migration-022 window (with the derived handler-NNNN identity so
 *   cards still render) - never a 500.
 */

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import {
  fallbackIdentity,
  getIdentityForPlayer,
  isMissingIdentityInfra,
} from '@/lib/server/identity';

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

    // Inventory: owned cosmetics joined to their definitions. A missing
    // table means 022 is not applied - identity degrades, request lives.
    const { data: inventoryRows, error: inventoryError } = await supabase
      .from('player_cosmetics')
      .select(
        'cosmetic_id, acquired_at, source, cosmetic_definitions(id, name, slot, rarity, dynasty, season_seq, render)'
      )
      .eq('player_id', player.id);

    if (inventoryError) {
      if (!isMissingIdentityInfra(inventoryError)) {
        console.error('Cosmetic inventory read error:', inventoryError);
      }
      return NextResponse.json({
        live: false,
        identity: fallbackIdentity(player.id),
        inventory: [],
        loadout: [],
      });
    }

    const inventory = (inventoryRows ?? [])
      .map((row) => {
        const def = row.cosmetic_definitions as unknown as {
          id: string;
          name: string;
          slot: string;
          rarity: string;
          dynasty: string | null;
          season_seq: number | null;
          render: unknown;
        } | null;
        if (!def) return null;
        return {
          id: def.id,
          name: def.name,
          slot: def.slot,
          rarity: def.rarity,
          dynasty: def.dynasty,
          seasonSeq: def.season_seq,
          render: def.render ?? null,
          acquiredAt: row.acquired_at,
          source: row.source,
        };
      })
      .filter((item): item is NonNullable<typeof item> => item !== null);

    // The default banner is owned-by-default (section 4.1): merge it in
    // for players the backfill predates (created after 022 applied).
    if (!inventory.some((item) => item.id === 'banner_hatchery_standard')) {
      const { data: defaultBanner, error: defaultBannerError } = await supabase
        .from('cosmetic_definitions')
        .select('id, name, slot, rarity, dynasty, season_seq, render')
        .eq('id', 'banner_hatchery_standard')
        .maybeSingle();
      if (defaultBannerError) {
        if (!isMissingIdentityInfra(defaultBannerError)) {
          console.error('Default banner read error:', defaultBannerError);
        }
      } else if (defaultBanner) {
        inventory.push({
          id: defaultBanner.id,
          name: defaultBanner.name,
          slot: defaultBanner.slot,
          rarity: defaultBanner.rarity,
          dynasty: defaultBanner.dynasty,
          seasonSeq: defaultBanner.season_seq,
          render: defaultBanner.render ?? null,
          acquiredAt: null as string | null,
          source: 'default',
        });
      }
    }

    const { data: loadoutRows, error: loadoutError } = await supabase
      .from('player_loadout')
      .select('slot, position, cosmetic_id')
      .eq('player_id', player.id);
    if (loadoutError && !isMissingIdentityInfra(loadoutError)) {
      console.error('Loadout read error:', loadoutError);
    }

    const identity = await getIdentityForPlayer(supabase, player.id);

    return NextResponse.json({
      live: true,
      identity,
      inventory,
      loadout: loadoutRows ?? [],
    });
  } catch (err) {
    console.error('Identity API error:', err);
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}

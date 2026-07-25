/**
 * Clan Duel API - weekly head-to-head clan competition
 *
 * GET: the authed player's clan duel for the current ISO week (UTC).
 * Settlement is LAZY: the get_clan_duel RPC settles finished weeks and
 * pairs the current week before returning (advisory lock in SQL prevents
 * double-settlement). Live scores are computed on read.
 */

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import {
  drainDiscordOutbox,
  refreshLinkedRolesForPlayer,
} from '@/lib/server/discordSync';
import { CLAN_GAUNTLET_ENABLED } from '@/lib/clan/config';
import { mapDuelPayload, type RpcDuelPayload } from './utils';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || '',
  process.env.SUPABASE_SERVICE_ROLE_KEY || ''
);

export async function GET(request: NextRequest) {
  try {
    /**
     * SUPERSEDED BY PAIRED WEEKS, AND GATED WITH THE GAUNTLET (§9.4, §12.1
     * slot 7).
     *
     * WP-1.02 folded head-to-head into the Serpent week: `GET /api/clan/hunt`
     * carries the self-referential primary, the optional rival layer and the
     * rivalry memory, on the one weekly surface §12.2 allows. This endpoint is
     * the OLD duel — its own weekly calendar, its own Elo rating, and the
     * Gauntlet's blind picks riding on top of it — so it rides the Gauntlet's
     * flag.
     *
     * The guard is not cosmetic. `get_clan_duel` settles and pairs LAZILY in
     * SQL on every read: leaving this open would keep the superseded duel
     * machinery running, writing ratings and duel rows nobody can see, behind
     * a surface that no longer exists. Nothing is deleted — `clan_duels` and
     * every row it holds are preserved by migration 048 and asserted by its
     * tripwire — it simply stops being read and stops being written.
     */
    if (!CLAN_GAUNTLET_ENABLED) {
      return NextResponse.json({ available: false, gate: 'clan_gauntlet' });
    }

    // Bearer auth (same pattern as /api/clan POST)
    const authHeader = request.headers.get('authorization');
    if (!authHeader) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const token = authHeader.replace('Bearer ', '');
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);

    if (authError || !user) {
      return NextResponse.json({ error: 'Invalid token' }, { status: 401 });
    }

    // Player must be in a clan to have a duel
    const { data: membership } = await supabase
      .from('clan_members')
      .select('clan_id')
      .eq('player_id', user.id)
      .maybeSingle();

    if (!membership) {
      return NextResponse.json({ error: 'Not in a clan' }, { status: 404 });
    }

    // Lazily settles last week + pairs this week, then returns duel state
    const { data, error } = await supabase.rpc('get_clan_duel', {
      p_clan_id: membership.clan_id,
    });

    if (error || !data) {
      console.error('get_clan_duel RPC error:', error);
      return NextResponse.json({ error: 'Failed to load duel' }, { status: 500 });
    }

    const payload = data as RpcDuelPayload;
    if (payload.error) {
      return NextResponse.json({ error: payload.error }, { status: 404 });
    }

    // Identity v1 section 8.4: settlement just ran lazily inside the
    // RPC - opportunistically drain a few feed events (non-fatal,
    // no-op pre-024) and refresh the caller's Linked Roles metadata
    // (championship settle may have just crowned them).
    try {
      await drainDiscordOutbox(supabase, 3);
      const { data: playerRow } = await supabase
        .from('players')
        .select('id')
        .eq('user_id', user.id)
        .single();
      if (playerRow) {
        await refreshLinkedRolesForPlayer(supabase, playerRow.id);
      }
    } catch (discordError) {
      console.error('Post-settlement Discord sync error:', discordError);
    }

    return NextResponse.json(mapDuelPayload(payload));
  } catch (error) {
    console.error('Clan duel GET error:', error);
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}

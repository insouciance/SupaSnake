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
import { mapDuelPayload, type RpcDuelPayload } from './utils';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || '',
  process.env.SUPABASE_SERVICE_ROLE_KEY || ''
);

export async function GET(request: NextRequest) {
  try {
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

    return NextResponse.json(mapDuelPayload(payload));
  } catch (error) {
    console.error('Clan duel GET error:', error);
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}

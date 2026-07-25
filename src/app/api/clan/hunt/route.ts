/**
 * The clan hunt panel — GET /api/clan/hunt (Constitution §9.2–9.4).
 *
 * "A clan is a witness, not an institution. It exists so that when your Depth
 * beats your best week, someone specific sees it happen and their number moved
 * because yours did." (§9.1) This route is what that sentence renders from.
 *
 * The payload's shape encodes §9.4's structure:
 *
 *   `primary`  the self-referential outcome — the clan's Depth this week
 *              against the clan's own best week. Always present when live.
 *              It cannot walkover, cannot embarrass, and works at N = 1.
 *   `rival`    the layer. NULL when no symmetric rival exists this week, which
 *              is a normal, silent, unremarkable state — not a failure and not
 *              something the player is told they missed out on.
 *   `rivalry`  the memory: W–L, streaks, closest week, all-time margin.
 *   `gates`    both false until the population criteria in §9.3 are met.
 *
 * FLAG OFF (`NEXT_PUBLIC_CLAN_V2` unset or anything but the string "true"):
 * answers 200 with `live: false` and a zeroed panel, so a consuming surface
 * renders an off state rather than handling a 404. No row is read, no pairing
 * is written, and no laurel is awarded.
 *
 * Rule 11: this route runs on the service role, the client never writes, and
 * every Supabase error inside `buildClanHuntPanel` is checked and reported.
 */

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import * as Sentry from '@sentry/nextjs';
import {
  buildClanHuntPanel,
  emptyClanHuntPanel,
  isMissingClanRework,
} from '@/lib/server/clanHunt';
import { CLAN_V2_ENABLED } from '@/lib/clan/config';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || '',
  process.env.SUPABASE_SERVICE_ROLE_KEY || ''
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

    if (!CLAN_V2_ENABLED) {
      return NextResponse.json(emptyClanHuntPanel());
    }

    // `clan_members` keys on the auth id; the Serpent's Depth rows key on
    // `players.id`. Both are needed, and migration 048 records why the two
    // id-spaces stay separate for now.
    const { data: playerRow, error: playerError } = await supabase
      .from('players')
      .select('id')
      .eq('user_id', user.id)
      .maybeSingle();
    if (playerError) {
      if (!isMissingClanRework(playerError)) {
        console.error('Clan hunt player read error:', playerError);
        Sentry.captureException(
          new Error('Clan hunt player read failed'),
          { extra: { userId: user.id, error: playerError } }
        );
      }
      return NextResponse.json(emptyClanHuntPanel());
    }
    if (!playerRow?.id) {
      return NextResponse.json(emptyClanHuntPanel());
    }

    const panel = await buildClanHuntPanel(supabase, String(playerRow.id), user.id);
    return NextResponse.json(panel);
  } catch (error) {
    console.error('Clan hunt GET error:', error);
    Sentry.captureException(
      error instanceof Error ? error : new Error('Clan hunt GET failed')
    );
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}

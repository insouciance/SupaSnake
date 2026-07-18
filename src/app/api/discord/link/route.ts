/**
 * Discord link start (Player Identity v1 section 8.3).
 *
 * GET /api/discord/link
 *   Authenticated. Returns { url } - the Discord authorize URL with
 *   scopes identify + guilds.join + role_connections.write and an
 *   HMAC-signed state carrying { userId: player.id, exp: +10min }
 *   (keyed off a DISCORD_TOKEN_ENC_KEY-derived subkey - the callback
 *   trusts ONLY this state for identity). The redirect URI is picked by
 *   request host: localhost -> DISCORD_REDIRECT_URI_LOCAL, otherwise
 *   DISCORD_REDIRECT_URI (both registered in the Discord app).
 */

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { createOAuthState } from '@/lib/server/crypto';
import { buildAuthorizeUrl, redirectUriForHost } from '@/lib/server/discord';

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

    const redirectUri = redirectUriForHost(request.nextUrl.host);
    const state = createOAuthState(player.id);
    return NextResponse.json({ url: buildAuthorizeUrl(redirectUri, state) });
  } catch (error) {
    console.error('Discord link GET error:', error);
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}

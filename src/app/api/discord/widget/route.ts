/**
 * Discord presence proxy (Player Identity v1 section 8.4).
 *
 * GET /api/discord/widget?clan=<clanId>
 *   Authenticated proxy over the linked guild's widget.json - the clan
 *   page's "someone's home" signal. Proxied so the browser never deals
 *   with Discord CORS and the guild-id/link mapping stays server-side.
 *   The upstream fetch is cached 60s in-memory (per guild). Returns a
 *   trimmed shape: online count, up to 12 member chips, invite link.
 */

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { getGuildWidget, isMissingDiscordInfra } from '@/lib/server/discord';

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

    const clanId = request.nextUrl.searchParams.get('clan');
    if (!clanId) {
      return NextResponse.json({ error: 'clan is required' }, { status: 400 });
    }

    const { data: link, error } = await supabase
      .from('discord_clan_links')
      .select('guild_id, invite_url')
      .eq('clan_id', clanId)
      .maybeSingle();

    if (error) {
      if (isMissingDiscordInfra(error)) {
        return NextResponse.json({ live: false, linked: false });
      }
      console.error('Widget clan-link read error:', error);
      return NextResponse.json({ error: 'Failed to load presence' }, { status: 500 });
    }
    if (!link) {
      return NextResponse.json({ live: true, linked: false });
    }

    const widget = await getGuildWidget(link.guild_id);
    if (!widget) {
      // Widget disabled upstream / fetch failed: linked but no presence
      return NextResponse.json({
        live: true,
        linked: true,
        presence: null,
        inviteUrl: link.invite_url ?? null,
      });
    }

    return NextResponse.json({
      live: true,
      linked: true,
      presence: {
        onlineCount: widget.presence_count,
        members: widget.members.slice(0, 12).map((m) => ({
          username: m.username,
          status: m.status,
          avatarUrl: m.avatar_url ?? null,
        })),
      },
      inviteUrl: link.invite_url ?? widget.instant_invite ?? null,
    });
  } catch (error) {
    console.error('Discord widget proxy error:', error);
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}

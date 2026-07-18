/**
 * Discord link status + unlink (Player Identity v1 sections 8.3/8.5).
 *
 * GET /api/discord/status
 *   { live, linked, discordUsername?, linkedAt?, revoked? } - NEVER
 *   token material. revoked=true is the refresh-death degradation
 *   notice ("re-link to reconnect").
 *
 * DELETE /api/discord/status
 *   Unlink: revoke the token at Discord, then DELETE the row (doc
 *   section 8.5). If the revocation call fails, the row is kept with
 *   revoked_at set (the 30-day sweep collects it) - the player is
 *   unlinked either way.
 */

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { decryptSecret } from '@/lib/server/crypto';
import { isMissingDiscordInfra, revokeDiscordToken } from '@/lib/server/discord';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || '',
  process.env.SUPABASE_SERVICE_ROLE_KEY || ''
);

async function resolvePlayerId(
  request: NextRequest
): Promise<{ playerId: string } | { response: NextResponse }> {
  const authHeader = request.headers.get('authorization');
  if (!authHeader) {
    return { response: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) };
  }
  const token = authHeader.replace('Bearer ', '');
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser(token);
  if (authError || !user) {
    return { response: NextResponse.json({ error: 'Invalid token' }, { status: 401 }) };
  }
  const { data: player, error: playerError } = await supabase
    .from('players')
    .select('id')
    .eq('user_id', user.id)
    .single();
  if (playerError || !player) {
    return { response: NextResponse.json({ error: 'Player not found' }, { status: 404 }) };
  }
  return { playerId: player.id };
}

export async function GET(request: NextRequest) {
  try {
    const resolved = await resolvePlayerId(request);
    if ('response' in resolved) return resolved.response;

    const { data, error } = await supabase
      .from('discord_links')
      .select('discord_username, linked_at, revoked_at')
      .eq('player_id', resolved.playerId)
      .maybeSingle();

    if (error) {
      if (isMissingDiscordInfra(error)) {
        return NextResponse.json({ live: false, linked: false });
      }
      console.error('Discord status read error:', error);
      return NextResponse.json({ error: 'Failed to load status' }, { status: 500 });
    }

    if (!data) {
      return NextResponse.json({ live: true, linked: false });
    }
    if (data.revoked_at) {
      // Refresh-death degradation notice (section 8.5)
      return NextResponse.json({ live: true, linked: false, revoked: true });
    }
    return NextResponse.json({
      live: true,
      linked: true,
      discordUsername: data.discord_username ?? null,
      linkedAt: data.linked_at ?? null,
    });
  } catch (error) {
    console.error('Discord status GET error:', error);
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const resolved = await resolvePlayerId(request);
    if ('response' in resolved) return resolved.response;

    const { data: link, error } = await supabase
      .from('discord_links')
      .select('access_token_enc')
      .eq('player_id', resolved.playerId)
      .maybeSingle();

    if (error) {
      if (isMissingDiscordInfra(error)) {
        return NextResponse.json({ live: false, linked: false });
      }
      console.error('Discord unlink read error:', error);
      return NextResponse.json({ error: 'Failed to unlink' }, { status: 500 });
    }
    if (!link) {
      return NextResponse.json({ success: true, linked: false });
    }

    let revokedAtDiscord = false;
    try {
      await revokeDiscordToken(decryptSecret(link.access_token_enc));
      revokedAtDiscord = true;
    } catch (revokeError) {
      console.error('Discord token revocation failed:', {
        message: revokeError instanceof Error ? revokeError.message : 'unknown',
      });
    }

    if (revokedAtDiscord) {
      // Section 8.5: unlink revokes at Discord and deletes the row
      const { error: deleteError } = await supabase
        .from('discord_links')
        .delete()
        .eq('player_id', resolved.playerId);
      if (deleteError) {
        console.error('Discord unlink delete error:', deleteError);
        return NextResponse.json({ error: 'Failed to unlink' }, { status: 500 });
      }
    } else {
      // Degrade: keep the row revoked - the 30-day sweep collects it
      const { error: revokeMarkError } = await supabase
        .from('discord_links')
        .update({ revoked_at: new Date().toISOString() })
        .eq('player_id', resolved.playerId);
      if (revokeMarkError) {
        console.error('Discord unlink revoke-mark error:', revokeMarkError);
        return NextResponse.json({ error: 'Failed to unlink' }, { status: 500 });
      }
    }

    return NextResponse.json({ success: true, linked: false });
  } catch (error) {
    console.error('Discord unlink error:', error);
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}

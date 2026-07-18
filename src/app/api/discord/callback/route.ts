/**
 * Discord OAuth callback (Player Identity v1 section 8.3).
 *
 * GET /api/discord/callback?code&state (browser redirect - identity
 * comes ONLY from the verified HMAC state, never a session):
 *   1. Verify state (forged/expired -> /settings?discord=error).
 *   2. Exchange the code (host-matched redirect URI).
 *   3. /users/@me -> one Discord account links ONE player: a different
 *      player already holding this Discord account answers 409.
 *   4. Encrypt tokens AES-256-GCM, upsert discord_links (re-link
 *      clears revoked_at).
 *   5. Auto-join the official guild (guilds.join); a 403/failure falls
 *      back to the widget's instant invite link.
 *   6. Assign the clan role when the member's clan is linked.
 *   7. Push Linked Roles metadata.
 *   8. Redirect /settings?discord=linked (steps 5-7 are non-fatal).
 *
 * Tokens NEVER appear in the redirect, the response body or logs.
 */

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { encryptSecret, verifyOAuthState } from '@/lib/server/crypto';
import {
  addGuildMember,
  addMemberRole,
  exchangeCode,
  getCurrentUser,
  getGuildWidget,
  isMissingDiscordInfra,
  redirectUriForHost,
} from '@/lib/server/discord';
import { refreshLinkedRolesForPlayer } from '@/lib/server/discordSync';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || '',
  process.env.SUPABASE_SERVICE_ROLE_KEY || ''
);

function settingsRedirect(request: NextRequest, params: Record<string, string>) {
  const url = new URL('/settings', request.nextUrl.origin);
  for (const [key, value] of Object.entries(params)) {
    url.searchParams.set(key, value);
  }
  return NextResponse.redirect(url);
}

export async function GET(request: NextRequest) {
  try {
    const search = request.nextUrl.searchParams;

    // User denied the authorization (or Discord errored)
    if (search.get('error')) {
      return settingsRedirect(request, { discord: 'error', reason: 'denied' });
    }

    const state = verifyOAuthState(search.get('state'));
    if (!state) {
      return settingsRedirect(request, { discord: 'error', reason: 'state' });
    }
    const code = search.get('code');
    if (!code) {
      return settingsRedirect(request, { discord: 'error', reason: 'code' });
    }

    // ---- Exchange + identify --------------------------------------------
    let pair;
    let discordUser;
    try {
      pair = await exchangeCode(code, redirectUriForHost(request.nextUrl.host));
      discordUser = await getCurrentUser(pair.accessToken);
    } catch (exchangeError) {
      console.error('Discord code exchange failed:', {
        // status only - never token material
        message: exchangeError instanceof Error ? exchangeError.message : 'unknown',
      });
      return settingsRedirect(request, { discord: 'error', reason: 'exchange' });
    }

    // ---- One Discord account, one player --------------------------------
    const { data: existing, error: existingError } = await supabase
      .from('discord_links')
      .select('player_id')
      .eq('discord_user_id', discordUser.id)
      .maybeSingle();
    if (existingError) {
      if (isMissingDiscordInfra(existingError)) {
        return settingsRedirect(request, { discord: 'error', reason: 'not-live' });
      }
      console.error('discord_links duplicate check error:', existingError);
      return settingsRedirect(request, { discord: 'error', reason: 'db' });
    }
    if (existing && existing.player_id !== state.userId) {
      return NextResponse.json(
        { error: 'This Discord account is already linked to another player' },
        { status: 409 }
      );
    }

    // ---- Store (encrypted) ----------------------------------------------
    const { error: upsertError } = await supabase.from('discord_links').upsert(
      {
        player_id: state.userId,
        discord_user_id: discordUser.id,
        discord_username: discordUser.global_name ?? discordUser.username,
        access_token_enc: encryptSecret(pair.accessToken),
        refresh_token_enc: encryptSecret(pair.refreshToken),
        token_expires_at: new Date(Date.now() + pair.expiresIn * 1000).toISOString(),
        scopes: pair.scope || 'identify guilds.join role_connections.write',
        linked_at: new Date().toISOString(),
        last_used_at: new Date().toISOString(),
        revoked_at: null,
      },
      { onConflict: 'player_id' }
    );
    if (upsertError) {
      if (isMissingDiscordInfra(upsertError)) {
        return settingsRedirect(request, { discord: 'error', reason: 'not-live' });
      }
      console.error('discord_links upsert error:', upsertError);
      return settingsRedirect(request, { discord: 'error', reason: 'db' });
    }

    // ---- Auto-join the official guild (non-fatal, invite fallback) ------
    const guildId = process.env.DISCORD_GUILD_ID || '';
    let joinFallbackInvite: string | null = null;
    try {
      await addGuildMember(guildId, discordUser.id, pair.accessToken);
    } catch (joinError) {
      console.error('guilds.join failed - falling back to invite:', {
        message: joinError instanceof Error ? joinError.message : 'unknown',
      });
      const widget = await getGuildWidget(guildId);
      joinFallbackInvite = widget?.instant_invite ?? null;
    }

    // ---- Clan role when the member's clan is linked (non-fatal) ---------
    try {
      const { data: player } = await supabase
        .from('players')
        .select('user_id')
        .eq('id', state.userId)
        .single();
      if (player?.user_id) {
        const { data: membership } = await supabase
          .from('clan_members')
          .select('clan_id')
          .eq('player_id', player.user_id)
          .maybeSingle();
        if (membership) {
          const { data: clanLink, error: clanLinkError } = await supabase
            .from('discord_clan_links')
            .select('guild_id, role_id')
            .eq('clan_id', membership.clan_id)
            .maybeSingle();
          if (clanLinkError && !isMissingDiscordInfra(clanLinkError)) {
            console.error('discord_clan_links read error:', clanLinkError);
          }
          if (clanLink?.role_id) {
            await addMemberRole(clanLink.guild_id, discordUser.id, clanLink.role_id);
          }
        }
      }
    } catch (roleError) {
      console.error('Clan role assignment failed (non-fatal):', {
        message: roleError instanceof Error ? roleError.message : 'unknown',
      });
    }

    // ---- Linked Roles metadata (non-fatal) ------------------------------
    await refreshLinkedRolesForPlayer(supabase, state.userId);

    return settingsRedirect(request, {
      discord: 'linked',
      ...(joinFallbackInvite ? { join: 'invite', invite: joinFallbackInvite } : {}),
    });
  } catch (error) {
    console.error('Discord callback error:', error);
    return settingsRedirect(request, { discord: 'error', reason: 'internal' });
  }
}

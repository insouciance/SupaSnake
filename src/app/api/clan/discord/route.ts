/**
 * Clan Discord space management (Player Identity v1 section 8.3 - BOTH
 * models). Officer/owner only; members get 403.
 *
 * POST /api/clan/discord { action }
 *   link_official        - provision a private channel + role in the
 *                          official guild (channel overwrites: deny
 *                          @everyone, allow the clan role), webhook +
 *                          invite, store the link. CAPACITY GUARD: past
 *                          400 official links new clans are refused
 *                          with Model B guidance (409).
 *   link_own { guildId } - clan-owned server: verify the bot is in the
 *                          guild (GET guild), provision the same
 *                          channel/role/webhook there.
 *   unlink               - delete the provisioned channel + role (best
 *                          effort) and remove the link row.
 *
 * After linking, every clan member with a live discord_link gets the
 * clan role assigned (best effort). The webhook token is stored
 * AES-256-GCM encrypted. Pre-024: 503 "not live yet".
 */

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { encryptSecret } from '@/lib/server/crypto';
import {
  DiscordApiError,
  OFFICIAL_LINK_CAP,
  addMemberRole,
  deleteChannel,
  deleteRole,
  getGuild,
  isMissingDiscordInfra,
  provisionClanSpace,
} from '@/lib/server/discord';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || '',
  process.env.SUPABASE_SERVICE_ROLE_KEY || ''
);

interface ClanRow {
  id: string;
  name: string;
  tag: string;
}

async function assignRoleToLinkedMembers(
  clanId: string,
  guildId: string,
  roleId: string
): Promise<void> {
  try {
    const { data: members } = await supabase
      .from('clan_members')
      .select('player_id')
      .eq('clan_id', clanId);
    const userIds = (members ?? []).map((m: { player_id: string }) => m.player_id);
    if (userIds.length === 0) return;

    const { data: players } = await supabase
      .from('players')
      .select('id, user_id')
      .in('user_id', userIds);
    const playerIds = (players ?? []).map((p: { id: string }) => p.id);
    if (playerIds.length === 0) return;

    const { data: links, error: linksError } = await supabase
      .from('discord_links')
      .select('player_id, discord_user_id, revoked_at')
      .in('player_id', playerIds);
    if (linksError) return;

    for (const link of links ?? []) {
      if (link.revoked_at) continue;
      try {
        await addMemberRole(guildId, link.discord_user_id, roleId);
      } catch {
        // Member may not be in the guild (Model B) - best effort
      }
    }
  } catch (err) {
    console.error('Clan role fan-out failed (non-fatal):', err);
  }
}

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

    const { data: membership } = await supabase
      .from('clan_members')
      .select('clan_id, role')
      .eq('player_id', user.id)
      .maybeSingle();
    if (!membership) {
      return NextResponse.json({ error: 'Not in a clan' }, { status: 404 });
    }
    if (membership.role !== 'owner' && membership.role !== 'officer') {
      return NextResponse.json(
        { error: 'Only the owner or officers manage the clan Discord' },
        { status: 403 }
      );
    }

    const { data: clan } = await supabase
      .from('clans')
      .select('id, name, tag')
      .eq('id', membership.clan_id)
      .single();
    if (!clan) {
      return NextResponse.json({ error: 'Clan not found' }, { status: 404 });
    }

    const body = await request.json().catch(() => ({}));
    const action = (body as { action?: string }).action;

    // ---- Existing link state (pre-024 detection happens here) -----------
    const { data: existingLink, error: linkReadError } = await supabase
      .from('discord_clan_links')
      .select('clan_id, model, guild_id, channel_id, role_id')
      .eq('clan_id', clan.id)
      .maybeSingle();
    if (linkReadError) {
      if (isMissingDiscordInfra(linkReadError)) {
        return NextResponse.json(
          { error: 'Clan Discord is not live yet' },
          { status: 503 }
        );
      }
      console.error('discord_clan_links read error:', linkReadError);
      return NextResponse.json({ error: 'Request failed' }, { status: 500 });
    }

    if (action === 'unlink') {
      if (!existingLink) {
        return NextResponse.json({ error: 'Clan is not linked' }, { status: 400 });
      }
      // Best-effort cleanup of the provisioned space (we created both)
      try {
        await deleteChannel(existingLink.channel_id);
      } catch (cleanupError) {
        console.error('Channel cleanup failed (non-fatal):', {
          message: cleanupError instanceof Error ? cleanupError.message : 'unknown',
        });
      }
      if (existingLink.role_id) {
        try {
          await deleteRole(existingLink.guild_id, existingLink.role_id);
        } catch (cleanupError) {
          console.error('Role cleanup failed (non-fatal):', {
            message: cleanupError instanceof Error ? cleanupError.message : 'unknown',
          });
        }
      }
      const { error: deleteError } = await supabase
        .from('discord_clan_links')
        .delete()
        .eq('clan_id', clan.id);
      if (deleteError) {
        console.error('discord_clan_links delete error:', deleteError);
        return NextResponse.json({ error: 'Failed to unlink' }, { status: 500 });
      }
      return NextResponse.json({ success: true, linked: false });
    }

    if (action !== 'link_official' && action !== 'link_own') {
      return NextResponse.json({ error: 'Invalid action' }, { status: 400 });
    }
    if (existingLink) {
      return NextResponse.json(
        { error: 'Clan already has a Discord space - unlink first' },
        { status: 409 }
      );
    }

    let guildId: string;
    let model: 'official' | 'own';
    if (action === 'link_official') {
      model = 'official';
      guildId = process.env.DISCORD_GUILD_ID || '';
      if (!guildId) {
        return NextResponse.json({ error: 'Official guild not configured' }, { status: 500 });
      }

      // Channel-cap guard (section 8.3): headroom below Discord's
      // 500-channel guild cap - past 400 links, Model B guidance.
      const { count, error: countError } = await supabase
        .from('discord_clan_links')
        .select('clan_id', { count: 'exact', head: true })
        .eq('model', 'official');
      if (countError) {
        console.error('Official link count error:', countError);
        return NextResponse.json({ error: 'Request failed' }, { status: 500 });
      }
      if ((count ?? 0) >= OFFICIAL_LINK_CAP) {
        return NextResponse.json(
          {
            error:
              'The official server is at clan capacity - link your own Discord server instead',
            code: 'official_full',
          },
          { status: 409 }
        );
      }
    } else {
      model = 'own';
      const requestedGuild = (body as { guildId?: unknown }).guildId;
      if (typeof requestedGuild !== 'string' || !/^\d{5,25}$/.test(requestedGuild)) {
        return NextResponse.json({ error: 'guildId is required' }, { status: 400 });
      }
      guildId = requestedGuild;
      // Verify the bot is a member of that guild
      try {
        await getGuild(guildId);
      } catch (guildError) {
        const status =
          guildError instanceof DiscordApiError ? guildError.status : 500;
        return NextResponse.json(
          {
            error:
              status === 403 || status === 404
                ? 'The SupaSnake bot is not in that server - invite it first'
                : 'Could not verify the server',
            code: 'bot_not_in_guild',
          },
          { status: 422 }
        );
      }
    }

    // ---- Provision channel + role + webhook + invite --------------------
    let space;
    try {
      space = await provisionClanSpace(guildId, clan as ClanRow);
    } catch (provisionError) {
      const status =
        provisionError instanceof DiscordApiError ? provisionError.status : 500;
      console.error('Clan space provisioning failed:', {
        clanId: clan.id,
        model,
        status,
      });
      return NextResponse.json(
        {
          error:
            status === 403
              ? 'The bot is missing permissions (needs Manage Channels, Manage Roles, Manage Webhooks)'
              : 'Failed to provision the Discord space',
          code: 'provision_failed',
        },
        { status: 502 }
      );
    }

    const { error: insertError } = await supabase.from('discord_clan_links').insert({
      clan_id: clan.id,
      model,
      guild_id: space.guildId,
      channel_id: space.channelId,
      role_id: space.roleId,
      webhook_id: space.webhookId,
      webhook_token_enc: encryptSecret(space.webhookToken),
      invite_url: space.inviteUrl,
      linked_by: user.id,
    });
    if (insertError) {
      console.error('discord_clan_links insert error:', insertError);
      // Roll the provisioned space back so a retry starts clean
      try {
        await deleteChannel(space.channelId);
        await deleteRole(space.guildId, space.roleId);
      } catch {
        /* best effort */
      }
      return NextResponse.json({ error: 'Failed to store the link' }, { status: 500 });
    }

    // Give already-linked members the role (best effort)
    await assignRoleToLinkedMembers(clan.id, space.guildId, space.roleId);

    return NextResponse.json({
      success: true,
      linked: true,
      model,
      guildId: space.guildId,
      channelId: space.channelId,
      inviteUrl: space.inviteUrl,
    });
  } catch (error) {
    console.error('Clan discord POST error:', error);
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}

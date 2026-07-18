/**
 * Clan API
 * Per SO-001: 40% DAU in clans, energy bonus
 * Per SO-002: No daily requirements
 *
 * Identity v1 I3 (section 8.1/8.2) additions:
 *   GET ?view=full (authed)   - clan + identity fields + heraldry
 *                               unlocks + roster (identity rows for
 *                               PlayerCards) + invites (officer list +
 *                               own inbox) + discord link summary
 *   POST update_identity      - update_clan_identity RPC (owner/officer
 *                               + heraldry research gate in SQL)
 *   POST set_role             - set_clan_member_role RPC (owner only,
 *                               officer/member only - never owner)
 *   POST invite { handle }    - officer invites a registered player
 *   POST respond_invite       - respond_clan_invite RPC (atomic accept
 *                               / decline)
 * All pre-migration-024 safe: missing RPCs answer 503 "not live yet".
 */

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { isValidClanName, isValidClanTag, CLAN_LIMITS } from '@/lib/clan/types';
import { isMissingDiscordInfra } from '@/lib/server/discord';
import {
  identityFromRow,
  type PlayerIdentityRow,
} from '@/lib/identity/types';

// Server-side Supabase client
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || '',
  process.env.SUPABASE_SERVICE_ROLE_KEY || ''
);

/** Map RPC error payloads to HTTP statuses for the I3 clan actions. */
const CLAN_RPC_ERRORS: Record<string, { status: number; error: string }> = {
  not_in_clan: { status: 404, error: 'Not in a clan' },
  not_authorized: { status: 403, error: 'Not authorized' },
  heraldry_locked: { status: 403, error: 'Research Heraldry I to customize your clan' },
  invalid_banner: { status: 400, error: 'Invalid banner' },
  invalid_emblem: { status: 400, error: 'Invalid emblem' },
  invalid_color: { status: 400, error: 'Invalid color' },
  invalid_role: { status: 400, error: 'Invalid role' },
  target_not_in_clan: { status: 404, error: 'That player is not in your clan' },
  cannot_change_owner: { status: 400, error: 'Ownership does not transfer here' },
  invite_not_found: { status: 404, error: 'Invite not found' },
  invite_not_pending: { status: 409, error: 'Invite already answered' },
  invite_expired: { status: 410, error: 'Invite expired' },
  already_in_clan: { status: 400, error: 'Already in a clan' },
  clan_full: { status: 400, error: 'Clan is full' },
  clan_not_found: { status: 404, error: 'Clan not found' },
};

function mapRpcResult(data: unknown): NextResponse {
  const payload = (data ?? {}) as { error?: string } & Record<string, unknown>;
  if (payload.error) {
    const mapped = CLAN_RPC_ERRORS[payload.error];
    if (mapped) {
      return NextResponse.json(
        { error: mapped.error, code: payload.error },
        { status: mapped.status }
      );
    }
    return NextResponse.json({ error: 'Request failed' }, { status: 500 });
  }
  return NextResponse.json({ success: true, result: payload });
}

/**
 * The full clan surface (Identity v1 I3): everything the clan page
 * renders in one authed read. Non-members get their invite inbox.
 */
async function fullClanView(userId: string): Promise<NextResponse> {
  const { data: membership } = await supabase
    .from('clan_members')
    .select('clan_id, role, joined_at')
    .eq('player_id', userId)
    .maybeSingle();

  // Invite inbox rides along in both states (accepting needs no clan)
  const { data: inbox, error: inboxError } = await supabase
    .from('clan_invites')
    .select('id, clan_id, status, created_at, expires_at, clans:clan_id(name, tag)')
    .eq('player_id', userId)
    .eq('status', 'pending')
    .gt('expires_at', new Date().toISOString());
  if (inboxError) {
    console.error('Invite inbox read error:', inboxError);
  }
  const myInvites = (inbox ?? []).map((invite) => ({
    id: invite.id,
    clanId: invite.clan_id,
    clanName: (invite.clans as unknown as { name?: string } | null)?.name ?? null,
    clanTag: (invite.clans as unknown as { tag?: string } | null)?.tag ?? null,
    expiresAt: invite.expires_at,
  }));

  if (!membership) {
    return NextResponse.json({ clan: null, myInvites });
  }

  const { data: clan, error: clanError } = await supabase
    .from('clans')
    .select('*')
    .eq('id', membership.clan_id)
    .single();
  if (clanError || !clan) {
    console.error('Full clan read error:', clanError);
    return NextResponse.json({ error: 'Failed to load clan' }, { status: 500 });
  }

  // Roster: memberships + identity rows (PlayerCards) keyed by auth uid
  const { data: members, error: membersError } = await supabase
    .from('clan_members')
    .select('player_id, role, weekly_contribution, total_contribution, joined_at')
    .eq('clan_id', membership.clan_id)
    .order('joined_at', { ascending: true });
  if (membersError) {
    console.error('Roster read error:', membersError);
  }
  const memberIds = (members ?? []).map((m) => m.player_id as string);

  const identities = new Map<string, ReturnType<typeof identityFromRow>>();
  if (memberIds.length > 0) {
    const { data: identityRows, error: identityError } = await supabase.rpc(
      'get_player_identities',
      { p_ids: memberIds }
    );
    if (identityError) {
      // Pre-022: roster renders without identity cards
      if (!/get_player_identities/i.test(identityError.message || '')) {
        console.error('Roster identity read error:', identityError);
      }
    } else {
      for (const row of (identityRows ?? []) as PlayerIdentityRow[]) {
        if (row.user_id) identities.set(row.user_id, identityFromRow(row));
      }
    }
  }

  const roster = (members ?? []).map((m) => ({
    userId: m.player_id,
    role: m.role,
    weeklyContribution: m.weekly_contribution ?? 0,
    totalContribution: m.total_contribution ?? 0,
    joinedAt: m.joined_at,
    identity: identities.get(m.player_id as string) ?? null,
  }));

  // Heraldry research state (020) - gates the identity editor
  let heraldry: string[] = [];
  const { data: researchRows, error: researchError } = await supabase
    .from('clan_research')
    .select('node_id')
    .eq('clan_id', membership.clan_id)
    .like('node_id', 'heraldry%');
  if (researchError) {
    // Pre-020: no research, editor fully locked
    heraldry = [];
  } else {
    heraldry = (researchRows ?? []).map((r) => r.node_id as string);
  }

  // Officer view: the clan's pending invites
  let pendingInvites: Array<{ id: string; expiresAt: string; handle: string | null }> = [];
  if (membership.role === 'owner' || membership.role === 'officer') {
    const { data: clanInvites, error: clanInvitesError } = await supabase
      .from('clan_invites')
      .select('id, player_id, expires_at')
      .eq('clan_id', membership.clan_id)
      .eq('status', 'pending')
      .gt('expires_at', new Date().toISOString());
    if (clanInvitesError) {
      console.error('Clan invites read error:', clanInvitesError);
    } else if ((clanInvites ?? []).length > 0) {
      const { data: invitedPlayers } = await supabase
        .from('players')
        .select('user_id, handle')
        .in('user_id', (clanInvites ?? []).map((i) => i.player_id));
      const handles = new Map(
        (invitedPlayers ?? []).map((p) => [p.user_id as string, p.handle as string | null])
      );
      pendingInvites = (clanInvites ?? []).map((i) => ({
        id: i.id as string,
        expiresAt: i.expires_at as string,
        handle: handles.get(i.player_id as string) ?? null,
      }));
    }
  }

  // Discord link summary (no secrets: ids + invite url only)
  let discord: {
    linked: boolean;
    model?: string;
    guildId?: string;
    channelId?: string;
    inviteUrl?: string | null;
  } = { linked: false };
  const { data: discordLink, error: discordError } = await supabase
    .from('discord_clan_links')
    .select('model, guild_id, channel_id, invite_url')
    .eq('clan_id', membership.clan_id)
    .maybeSingle();
  if (discordError) {
    if (!isMissingDiscordInfra(discordError)) {
      console.error('Clan discord link read error:', discordError);
    }
  } else if (discordLink) {
    discord = {
      linked: true,
      model: discordLink.model,
      guildId: discordLink.guild_id,
      channelId: discordLink.channel_id,
      inviteUrl: discordLink.invite_url ?? null,
    };
  }

  return NextResponse.json({
    clan,
    membership: {
      clanId: membership.clan_id,
      role: membership.role,
      joinedAt: membership.joined_at,
    },
    identity: {
      bannerId: (clan as Record<string, unknown>).banner_id ?? null,
      emblemId: (clan as Record<string, unknown>).emblem_id ?? null,
      colorPrimary: (clan as Record<string, unknown>).color_primary ?? null,
      colorSecondary: (clan as Record<string, unknown>).color_secondary ?? null,
      heraldry,
    },
    roster,
    pendingInvites,
    myInvites,
    discord,
  });
}

/**
 * GET - List clans or get player's clan
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const playerId = searchParams.get('playerId');

    // Identity v1 I3: the full authed clan surface (roster, identity,
    // invites, discord) in one read
    if (searchParams.get('view') === 'full') {
      const authHeader = request.headers.get('authorization');
      if (!authHeader) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
      }
      const token = authHeader.replace('Bearer ', '');
      const { data: { user }, error: authError } = await supabase.auth.getUser(token);
      if (authError || !user) {
        return NextResponse.json({ error: 'Invalid token' }, { status: 401 });
      }
      return fullClanView(user.id);
    }
    const limit = Math.min(parseInt(searchParams.get('limit') || '50'), 100);
    const offset = parseInt(searchParams.get('offset') || '0');

    // If playerId specified, get that player's clan
    if (playerId) {
      const { data: membership } = await supabase
        .from('clan_members')
        .select(`
          clan_id,
          role,
          joined_at,
          clans:clan_id(*)
        `)
        .eq('player_id', playerId)
        .maybeSingle();

      if (!membership) {
        return NextResponse.json({ clan: null });
      }

      return NextResponse.json({
        clan: membership.clans,
        membership: {
          clanId: membership.clan_id,
          role: membership.role,
          joinedAt: membership.joined_at,
        },
      });
    }

    // List all clans
    const { data: clans, error, count } = await supabase
      .from('clans')
      .select('*', { count: 'exact' })
      .order('member_count', { ascending: false })
      .range(offset, offset + limit - 1);

    if (error) {
      return NextResponse.json({ error: 'Failed to fetch clans' }, { status: 500 });
    }

    return NextResponse.json({
      clans: clans || [],
      total: count || 0,
    });
  } catch (error) {
    console.error('Clan GET error:', error);
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}

/**
 * POST - Create clan, join clan, or leave clan
 */
export async function POST(request: NextRequest) {
  try {
    // Verify auth
    const authHeader = request.headers.get('authorization');
    if (!authHeader) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const token = authHeader.replace('Bearer ', '');
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);

    if (authError || !user) {
      return NextResponse.json({ error: 'Invalid token' }, { status: 401 });
    }

    const body = await request.json();
    const { action, clanId, name, tag, description } = body;

    switch (action) {
      case 'create': {
        // Validate inputs
        if (!name || !tag) {
          return NextResponse.json({ error: 'Name and tag required' }, { status: 400 });
        }

        if (!isValidClanName(name)) {
          return NextResponse.json(
            { error: `Name must be ${CLAN_LIMITS.minNameLength}-${CLAN_LIMITS.maxNameLength} characters` },
            { status: 400 }
          );
        }

        const upperTag = tag.toUpperCase();
        if (!isValidClanTag(upperTag)) {
          return NextResponse.json(
            { error: `Tag must be ${CLAN_LIMITS.minTagLength}-${CLAN_LIMITS.maxTagLength} uppercase letters/numbers` },
            { status: 400 }
          );
        }

        // Check if player already in a clan
        const { data: existing } = await supabase
          .from('clan_members')
          .select('clan_id')
          .eq('player_id', user.id)
          .maybeSingle();

        if (existing) {
          return NextResponse.json({ error: 'Already in a clan' }, { status: 400 });
        }

        // Check tag uniqueness
        const { data: tagExists } = await supabase
          .from('clans')
          .select('id')
          .eq('tag', upperTag)
          .maybeSingle();

        if (tagExists) {
          return NextResponse.json({ error: 'Tag already taken' }, { status: 400 });
        }

        // Create clan
        const { data: clan, error: createError } = await supabase
          .from('clans')
          .insert({
            name,
            tag: upperTag,
            description: description || '',
            owner_id: user.id,
            member_count: 1,
            max_members: CLAN_LIMITS.maxMembers,
          })
          .select()
          .single();

        if (createError) {
          console.error('Create clan error:', createError);
          return NextResponse.json({ error: 'Failed to create clan' }, { status: 500 });
        }

        // Add creator as owner
        await supabase.from('clan_members').insert({
          clan_id: clan.id,
          player_id: user.id,
          role: 'owner',
        });

        return NextResponse.json({ clan });
      }

      case 'join': {
        if (!clanId) {
          return NextResponse.json({ error: 'Clan ID required' }, { status: 400 });
        }

        // Check if player already in a clan
        const { data: existing } = await supabase
          .from('clan_members')
          .select('clan_id')
          .eq('player_id', user.id)
          .maybeSingle();

        if (existing) {
          return NextResponse.json({ error: 'Already in a clan' }, { status: 400 });
        }

        // Check clan exists and has space
        const { data: clan } = await supabase
          .from('clans')
          .select('id, member_count, max_members')
          .eq('id', clanId)
          .single();

        if (!clan) {
          return NextResponse.json({ error: 'Clan not found' }, { status: 404 });
        }

        if (clan.member_count >= clan.max_members) {
          return NextResponse.json({ error: 'Clan is full' }, { status: 400 });
        }

        // Add as member
        await supabase.from('clan_members').insert({
          clan_id: clanId,
          player_id: user.id,
          role: 'member',
        });

        // Increment member count
        await supabase
          .from('clans')
          .update({ member_count: clan.member_count + 1 })
          .eq('id', clanId);

        return NextResponse.json({ success: true });
      }

      case 'leave': {
        // Get membership
        const { data: membership } = await supabase
          .from('clan_members')
          .select('clan_id, role')
          .eq('player_id', user.id)
          .maybeSingle();

        if (!membership) {
          return NextResponse.json({ error: 'Not in a clan' }, { status: 400 });
        }

        if (membership.role === 'owner') {
          return NextResponse.json(
            { error: 'Owners must transfer ownership before leaving' },
            { status: 400 }
          );
        }

        // Remove membership
        await supabase
          .from('clan_members')
          .delete()
          .eq('player_id', user.id);

        // Decrement member count
        await supabase.rpc('decrement_clan_members', { clan_id: membership.clan_id });

        return NextResponse.json({ success: true });
      }

      // ---- Identity v1 I3 actions (migration 024 RPCs) -----------------

      case 'update_identity': {
        const { bannerId, emblemId, colorPrimary, colorSecondary } = body as {
          bannerId?: unknown;
          emblemId?: unknown;
          colorPrimary?: unknown;
          colorSecondary?: unknown;
        };
        const asOptionalString = (value: unknown) =>
          typeof value === 'string' && value.length > 0 ? value : null;

        const { data, error } = await supabase.rpc('update_clan_identity', {
          p_user_id: user.id,
          p_banner_id: asOptionalString(bannerId),
          p_emblem_id: asOptionalString(emblemId),
          p_color_primary: asOptionalString(colorPrimary),
          p_color_secondary: asOptionalString(colorSecondary),
        });
        if (error) {
          if (isMissingDiscordInfra(error)) {
            return NextResponse.json(
              { error: 'Clan identity is not live yet' },
              { status: 503 }
            );
          }
          console.error('update_clan_identity RPC error:', error);
          return NextResponse.json({ error: 'Request failed' }, { status: 500 });
        }
        return mapRpcResult(data);
      }

      case 'set_role': {
        const { targetUserId, role } = body as { targetUserId?: unknown; role?: unknown };
        if (typeof targetUserId !== 'string' || !targetUserId) {
          return NextResponse.json({ error: 'targetUserId is required' }, { status: 400 });
        }
        if (role !== 'officer' && role !== 'member') {
          return NextResponse.json({ error: 'Invalid role' }, { status: 400 });
        }
        const { data, error } = await supabase.rpc('set_clan_member_role', {
          p_user_id: user.id,
          p_target_user_id: targetUserId,
          p_role: role,
        });
        if (error) {
          if (isMissingDiscordInfra(error)) {
            return NextResponse.json(
              { error: 'Clan roles are not live yet' },
              { status: 503 }
            );
          }
          console.error('set_clan_member_role RPC error:', error);
          return NextResponse.json({ error: 'Request failed' }, { status: 500 });
        }
        return mapRpcResult(data);
      }

      case 'invite': {
        const { handle } = body as { handle?: unknown };
        if (typeof handle !== 'string' || !/^[A-Za-z0-9_]{3,16}$/.test(handle)) {
          return NextResponse.json({ error: 'A valid handle is required' }, { status: 400 });
        }

        // Officer/owner only
        const { data: callerMembership } = await supabase
          .from('clan_members')
          .select('clan_id, role')
          .eq('player_id', user.id)
          .maybeSingle();
        if (!callerMembership) {
          return NextResponse.json({ error: 'Not in a clan' }, { status: 404 });
        }
        if (callerMembership.role !== 'owner' && callerMembership.role !== 'officer') {
          return NextResponse.json({ error: 'Only officers invite' }, { status: 403 });
        }

        // Resolve the handle to a REGISTERED player (guests have no
        // auth identity - clan membership keys off auth.users)
        const { data: target, error: targetError } = await supabase
          .from('players')
          .select('user_id, handle')
          .ilike('handle', handle)
          .limit(1)
          .maybeSingle();
        if (targetError) {
          console.error('Invite handle lookup error:', targetError);
          return NextResponse.json({ error: 'Request failed' }, { status: 500 });
        }
        if (!target || !target.user_id) {
          return NextResponse.json({ error: 'No handler by that name' }, { status: 404 });
        }
        if (target.user_id === user.id) {
          return NextResponse.json({ error: 'That is you' }, { status: 400 });
        }

        const { data: targetMembership } = await supabase
          .from('clan_members')
          .select('clan_id')
          .eq('player_id', target.user_id)
          .maybeSingle();
        if (targetMembership) {
          return NextResponse.json({ error: 'Already in a clan' }, { status: 409 });
        }

        const { error: inviteError } = await supabase.from('clan_invites').insert({
          clan_id: callerMembership.clan_id,
          player_id: target.user_id,
          invited_by: user.id,
        });
        if (inviteError) {
          if (inviteError.code === '23505') {
            return NextResponse.json({ error: 'Already invited' }, { status: 409 });
          }
          console.error('Invite insert error:', inviteError);
          return NextResponse.json({ error: 'Failed to invite' }, { status: 500 });
        }
        return NextResponse.json({ success: true, handle: target.handle });
      }

      case 'respond_invite': {
        const { inviteId, accept } = body as { inviteId?: unknown; accept?: unknown };
        if (typeof inviteId !== 'string' || !inviteId) {
          return NextResponse.json({ error: 'inviteId is required' }, { status: 400 });
        }
        if (typeof accept !== 'boolean') {
          return NextResponse.json({ error: 'accept must be boolean' }, { status: 400 });
        }
        const { data, error } = await supabase.rpc('respond_clan_invite', {
          p_user_id: user.id,
          p_invite_id: inviteId,
          p_accept: accept,
        });
        if (error) {
          if (isMissingDiscordInfra(error)) {
            return NextResponse.json(
              { error: 'Invites are not live yet' },
              { status: 503 }
            );
          }
          console.error('respond_clan_invite RPC error:', error);
          return NextResponse.json({ error: 'Request failed' }, { status: 500 });
        }
        return mapRpcResult(data);
      }

      default:
        return NextResponse.json({ error: 'Invalid action' }, { status: 400 });
    }
  } catch (error) {
    console.error('Clan POST error:', error);
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}

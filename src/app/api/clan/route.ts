/**
 * Clan API (Constitution §9.2–9.4, Rules 5, 6, 8, 11).
 *
 * GET  ?view=full        the authed clan surface — clan, heraldry, roster,
 *                        tenure, invite code, discord summary, invite inbox
 * GET  ?view=directory   clans that hunted this week or last. No totals, ever.
 * GET  ?playerId=<uid>   one player's clan (unauthed read, used by the page)
 * GET                    same as ?view=directory
 *
 * POST actions
 *   found              found a clan of one: name + preset heraldry
 *   join_by_code       the ONLY way into someone else's clan (§9.2)
 *   leave              ends a membership; tenure survives it (F-7)
 *   remove_member      plain roster management, owner only
 *   transfer_ownership hand the clan over
 *   rotate_invite_code owner rotates the way in
 *   update_identity    preset heraldry, owner only
 *   respond_invite     answers an invite issued before this rework
 *
 * WHAT IS NOT HERE, AND WHY THAT IS THE POINT (Rule 8)
 *
 *   `set_role`  — there is no officer rank to grant, so there is no endpoint
 *                 to grant it with. `set_clan_member_role` is dropped in
 *                 migration 048 and no route calls it.
 *   `invite`    — inviting by handle was the officer's recruitment lever.
 *                 §9.2 makes invite links the only recruitment surface, so a
 *                 code replaces it and every member can share one.
 *   `create` / `join` by clan id — replaced by `found` and `join_by_code`,
 *                 both of which are single-transaction RPCs that enforce the
 *                 12 cap in SQL rather than in a route somebody could race.
 *
 * There is no request field on any action below through which a member's
 * Depth, contribution, attendance or rank could travel, because there is no
 * such field left on `clan_members` to travel to.
 *
 * PRE-MIGRATION-048 SAFE: a missing RPC answers 503 "not live yet" rather
 * than 500, exactly as the Identity v1 actions already did.
 */

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import * as Sentry from '@sentry/nextjs';
import { CLAN_LIMITS, isValidClanName, isValidClanTag } from '@/lib/clan/types';
import { clanInviteUrl, isValidClanInviteCode } from '@/lib/clan/config';
import { isMissingDiscordInfra } from '@/lib/server/discord';
import { isMissingClanRework, loadClanDirectory } from '@/lib/server/clanHunt';
import {
  identityFromRow,
  type PlayerIdentityRow,
} from '@/lib/identity/types';

// Server-side Supabase client
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || '',
  process.env.SUPABASE_SERVICE_ROLE_KEY || ''
);

/** Rule 11: every Supabase error is checked AND reported. */
function reportError(scope: string, error: unknown, extra: Record<string, unknown> = {}) {
  console.error(`Clan ${scope} error:`, { ...extra, error });
  Sentry.captureException(
    error instanceof Error ? error : new Error(`Clan ${scope} error`),
    { extra: { scope, ...extra, error } }
  );
}

/** Map RPC error payloads to HTTP statuses. */
const CLAN_RPC_ERRORS: Record<string, { status: number; error: string }> = {
  not_in_clan: { status: 404, error: 'Not in a clan' },
  not_authorized: { status: 403, error: 'Not authorized' },
  invalid_name: { status: 400, error: 'That name will not do' },
  invalid_code: { status: 400, error: 'That is not an invite code' },
  invalid_banner: { status: 400, error: 'Invalid banner' },
  invalid_emblem: { status: 400, error: 'Invalid emblem' },
  invalid_color: { status: 400, error: 'Invalid color' },
  tag_unavailable: { status: 409, error: 'Could not find a free tag for that name' },
  target_not_in_clan: { status: 404, error: 'That player is not in your clan' },
  cannot_change_owner: { status: 400, error: 'Ownership does not transfer here' },
  owner_must_transfer: { status: 400, error: 'Hand the clan over before you leave' },
  use_leave: { status: 400, error: 'Use leave to leave your own clan' },
  invite_not_found: { status: 404, error: 'Invite not found' },
  invite_not_pending: { status: 409, error: 'Invite already answered' },
  invite_expired: { status: 410, error: 'Invite expired' },
  already_in_clan: { status: 400, error: 'Already in a clan' },
  clan_full: { status: 400, error: 'Clan is full' },
  clan_disbanded: { status: 410, error: 'That clan has disbanded' },
  clan_not_found: { status: 404, error: 'Clan not found' },
  heraldry_locked: { status: 403, error: 'Heraldry is not editable yet' },
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
    reportError('rpc payload', new Error(`Unmapped clan RPC error: ${payload.error}`));
    return NextResponse.json({ error: 'Request failed' }, { status: 500 });
  }
  return NextResponse.json({ success: true, result: payload });
}

/** The one place "migration 048 is not applied here" becomes a response. */
function notLiveYet(subject: string): NextResponse {
  return NextResponse.json({ error: `${subject} is not live yet` }, { status: 503 });
}

/**
 * The full clan surface: everything the clan page renders in one authed read.
 * Non-members get their invite inbox.
 *
 * The roster is ADDITIVE (§9.2). Each entry carries a handle, a role of two
 * values and a tenure date. It carries no contribution, no weekly total, no
 * rank within the clan and no field a surface could render as a cut line —
 * those columns are gone from the schema, not merely omitted here.
 */
async function fullClanView(userId: string): Promise<NextResponse> {
  const { data: membership, error: membershipError } = await supabase
    .from('clan_members')
    .select('clan_id, role, joined_at')
    .eq('player_id', userId)
    .maybeSingle();
  if (membershipError && !isMissingClanRework(membershipError)) {
    reportError('membership read', membershipError, { userId });
  }

  // Invite inbox rides along in both states (accepting needs no clan). No new
  // invites are issued by this rework; the inbox exists so an invite sent
  // before it can still be answered (Rule 5: absence is never destructive).
  const { data: inbox, error: inboxError } = await supabase
    .from('clan_invites')
    .select('id, clan_id, status, created_at, expires_at, clans:clan_id(name, tag)')
    .eq('player_id', userId)
    .eq('status', 'pending')
    .gt('expires_at', new Date().toISOString());
  if (inboxError && !isMissingClanRework(inboxError)) {
    reportError('invite inbox read', inboxError, { userId });
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
    reportError('full clan read', clanError, { clanId: membership.clan_id });
    return NextResponse.json({ error: 'Failed to load clan' }, { status: 500 });
  }

  const { data: members, error: membersError } = await supabase
    .from('clan_members')
    .select('player_id, role, joined_at')
    .eq('clan_id', membership.clan_id)
    .order('joined_at', { ascending: true });
  if (membersError && !isMissingClanRework(membersError)) {
    reportError('roster read', membersError, { clanId: membership.clan_id });
  }
  const memberIds = (members ?? []).map((m) => m.player_id as string);

  // Tenure per member (Rule 6): the earliest span start this clan has of them,
  // so a member who left and came back reads as the veteran they are.
  const tenureByUser = new Map<string, string>();
  const { data: spans, error: spansError } = await supabase
    .from('clan_membership_history')
    .select('player_id, joined_at')
    .eq('clan_id', membership.clan_id);
  if (spansError) {
    if (!isMissingClanRework(spansError)) {
      reportError('tenure read', spansError, { clanId: membership.clan_id });
    }
  } else {
    for (const row of (spans ?? []) as Array<Record<string, unknown>>) {
      const id = String(row.player_id ?? '');
      const at = String(row.joined_at ?? '');
      const current = tenureByUser.get(id);
      if (!current || at < current) tenureByUser.set(id, at);
    }
  }

  const identities = new Map<string, ReturnType<typeof identityFromRow>>();
  if (memberIds.length > 0) {
    const { data: identityRows, error: identityError } = await supabase.rpc(
      'get_player_identities',
      { p_ids: memberIds }
    );
    if (identityError) {
      // Pre-022: roster renders without identity cards
      if (!/get_player_identities/i.test(identityError.message || '')) {
        reportError('roster identity read', identityError, { clanId: membership.clan_id });
      }
    } else {
      for (const row of (identityRows ?? []) as PlayerIdentityRow[]) {
        if (row.user_id) identities.set(row.user_id, identityFromRow(row));
      }
    }
  }

  const roster = (members ?? []).map((m) => {
    const userKey = m.player_id as string;
    const joinedAt = m.joined_at as string;
    const earlier = tenureByUser.get(userKey);
    return {
      userId: userKey,
      role: m.role === 'owner' ? 'owner' : 'member',
      joinedAt,
      tenureSince: earlier && earlier < joinedAt ? earlier : joinedAt,
      identity: identities.get(userKey) ?? null,
    };
  });

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
      reportError('clan discord link read', discordError, { clanId: membership.clan_id });
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

  const clanRow = clan as Record<string, unknown>;
  const inviteCode = (clanRow.invite_code as string | null) ?? null;
  const ownRoster = roster.find((entry) => entry.userId === userId);

  return NextResponse.json({
    clan,
    membership: {
      clanId: membership.clan_id,
      role: membership.role === 'owner' ? 'owner' : 'member',
      joinedAt: membership.joined_at,
      tenureSince: ownRoster?.tenureSince ?? membership.joined_at,
    },
    identity: {
      bannerId: clanRow.banner_id ?? null,
      emblemId: clanRow.emblem_id ?? null,
      colorPrimary: clanRow.color_primary ?? null,
      colorSecondary: clanRow.color_secondary ?? null,
    },
    invite: {
      code: inviteCode,
      url: inviteCode ? clanInviteUrl(inviteCode) : null,
    },
    limits: {
      maxMembers: CLAN_LIMITS.maxMembers,
      softFullMembers: CLAN_LIMITS.softFullMembers,
    },
    roster,
    myInvites,
    discord,
  });
}

/**
 * GET - the directory, one player's clan, or the full authed surface.
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const playerId = searchParams.get('playerId');
    const view = searchParams.get('view');

    if (view === 'full') {
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

    // One player's clan.
    if (playerId) {
      const { data: membership, error: membershipError } = await supabase
        .from('clan_members')
        .select(`
          clan_id,
          role,
          joined_at,
          clans:clan_id(*)
        `)
        .eq('player_id', playerId)
        .maybeSingle();
      if (membershipError && !isMissingClanRework(membershipError)) {
        reportError('player clan read', membershipError, { playerId });
      }

      if (!membership) {
        return NextResponse.json({ clan: null });
      }

      return NextResponse.json({
        clan: membership.clans,
        membership: {
          clanId: membership.clan_id,
          role: membership.role === 'owner' ? 'owner' : 'member',
          joinedAt: membership.joined_at,
        },
      });
    }

    // The directory: alive clans only, and NO TOTAL. §9.2 forbids displaying
    // total-population counts anywhere, so the response has no field to put
    // one in and the query never asks for a count.
    const limit = Math.min(parseInt(searchParams.get('limit') || '50'), 100);
    const clans = await loadClanDirectory(supabase, limit);
    return NextResponse.json({ clans });
  } catch (error) {
    reportError('GET', error);
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}

/**
 * POST - found, join, leave, and the roster acts that are not levers.
 */
export async function POST(request: NextRequest) {
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

    const body = await request.json();
    const { action } = body as { action?: string };

    switch (action) {
      /**
       * Found a clan of one (§9.2). Name, optional tag, preset heraldry — one
       * RPC, one transaction, and the clan exists complete: it hunts, it holds
       * records, it appears in the directory once it has hunted, and it is
       * paired the week a symmetric rival exists. Nobody else has to arrive.
       */
      case 'found': {
        const { name, tag, bannerId, emblemId, colorPrimary, colorSecondary } = body as {
          name?: unknown;
          tag?: unknown;
          bannerId?: unknown;
          emblemId?: unknown;
          colorPrimary?: unknown;
          colorSecondary?: unknown;
        };

        if (typeof name !== 'string' || !isValidClanName(name.trim())) {
          return NextResponse.json(
            {
              error: `Name must be ${CLAN_LIMITS.minNameLength}-${CLAN_LIMITS.maxNameLength} characters, letters and digits`,
              code: 'invalid_name',
            },
            { status: 400 }
          );
        }
        if (typeof tag === 'string' && tag.length > 0 && !isValidClanTag(tag.toUpperCase())) {
          return NextResponse.json(
            {
              error: `Tag must be ${CLAN_LIMITS.minTagLength}-${CLAN_LIMITS.maxTagLength} uppercase letters/numbers`,
              code: 'invalid_tag',
            },
            { status: 400 }
          );
        }

        const asOptionalString = (value: unknown) =>
          typeof value === 'string' && value.length > 0 ? value : null;

        const { data, error } = await supabase.rpc('found_clan', {
          p_user_id: user.id,
          p_name: name.trim(),
          p_tag: typeof tag === 'string' && tag.length > 0 ? tag.toUpperCase() : null,
          p_banner_id: asOptionalString(bannerId),
          p_emblem_id: asOptionalString(emblemId),
          p_color_primary: asOptionalString(colorPrimary),
          p_color_secondary: asOptionalString(colorSecondary),
        });
        if (error) {
          if (isMissingClanRework(error)) return notLiveYet('Founding a clan');
          reportError('found_clan RPC', error, { userId: user.id });
          return NextResponse.json({ error: 'Request failed' }, { status: 500 });
        }

        const payload = (data ?? {}) as Record<string, unknown>;
        if (payload.error) return mapRpcResult(data);
        const code = (payload.invite_code as string | null) ?? null;
        return NextResponse.json({
          success: true,
          clan: {
            id: payload.clan_id,
            name: payload.name,
            tag: payload.tag,
            memberCount: payload.member_count,
            maxMembers: payload.max_members,
          },
          invite: { code, url: code ? clanInviteUrl(code) : null },
        });
      }

      /**
       * Join by invite code — the only way into someone else's clan (§9.2:
       * "invite links are the only recruitment surface"). The 12 cap is
       * enforced inside the RPC under `FOR UPDATE`, so twelve people pasting
       * the same link at once cannot produce a thirteenth member.
       */
      case 'join_by_code': {
        const { code } = body as { code?: unknown };
        const normalised = typeof code === 'string' ? code.trim().toUpperCase() : '';
        if (!isValidClanInviteCode(normalised)) {
          return NextResponse.json(
            { error: 'That is not an invite code', code: 'invalid_code' },
            { status: 400 }
          );
        }

        const { data, error } = await supabase.rpc('join_clan_by_code', {
          p_user_id: user.id,
          p_code: normalised,
        });
        if (error) {
          if (isMissingClanRework(error)) return notLiveYet('Joining by code');
          reportError('join_clan_by_code RPC', error, { userId: user.id });
          return NextResponse.json({ error: 'Request failed' }, { status: 500 });
        }
        return mapRpcResult(data);
      }

      /**
       * Leave. F-7's fix: `leave_clan` archives the membership span into
       * `clan_membership_history` and only then ends the membership, in one
       * transaction. Tenure — which Rule 6 names as permanent — survives, and
       * rejoining later restores it rather than restarting it.
       */
      case 'leave': {
        const { data, error } = await supabase.rpc('leave_clan', { p_user_id: user.id });
        if (error) {
          if (isMissingClanRework(error)) return notLiveYet('Leaving a clan');
          reportError('leave_clan RPC', error, { userId: user.id });
          return NextResponse.json({ error: 'Request failed' }, { status: 500 });
        }
        return mapRpcResult(data);
      }

      /**
       * Remove a member — plain roster management (§9.2), owner only.
       *
       * The request carries a target and nothing else: no reason, no threshold,
       * no metric. There is no number about the target anywhere in this
       * handler, the RPC, or the row it deletes, which is what makes it roster
       * management rather than the officer lever Rule 8 forbids. Their tenure
       * is archived first, exactly as if they had left.
       */
      case 'remove_member': {
        const { targetUserId } = body as { targetUserId?: unknown };
        if (typeof targetUserId !== 'string' || !targetUserId) {
          return NextResponse.json({ error: 'targetUserId is required' }, { status: 400 });
        }
        const { data, error } = await supabase.rpc('remove_clan_member', {
          p_user_id: user.id,
          p_target_user_id: targetUserId,
        });
        if (error) {
          if (isMissingClanRework(error)) return notLiveYet('Roster management');
          reportError('remove_clan_member RPC', error, { userId: user.id });
          return NextResponse.json({ error: 'Request failed' }, { status: 500 });
        }
        return mapRpcResult(data);
      }

      case 'transfer_ownership': {
        const { targetUserId } = body as { targetUserId?: unknown };
        if (typeof targetUserId !== 'string' || !targetUserId) {
          return NextResponse.json({ error: 'targetUserId is required' }, { status: 400 });
        }
        const { data, error } = await supabase.rpc('transfer_clan_ownership', {
          p_user_id: user.id,
          p_target_user_id: targetUserId,
        });
        if (error) {
          if (isMissingClanRework(error)) return notLiveYet('Transferring a clan');
          reportError('transfer_clan_ownership RPC', error, { userId: user.id });
          return NextResponse.json({ error: 'Request failed' }, { status: 500 });
        }
        return mapRpcResult(data);
      }

      case 'rotate_invite_code': {
        const { data, error } = await supabase.rpc('rotate_clan_invite_code', {
          p_user_id: user.id,
        });
        if (error) {
          if (isMissingClanRework(error)) return notLiveYet('Invite codes');
          reportError('rotate_clan_invite_code RPC', error, { userId: user.id });
          return NextResponse.json({ error: 'Request failed' }, { status: 500 });
        }
        const payload = (data ?? {}) as Record<string, unknown>;
        if (payload.error) return mapRpcResult(data);
        const code = (payload.invite_code as string | null) ?? null;
        return NextResponse.json({
          success: true,
          invite: { code, url: code ? clanInviteUrl(code) : null },
        });
      }

      /**
       * Preset heraldry, owner only.
       *
       * `set_clan_heraldry` (048) replaces `update_clan_identity` (024), which
       * gated every edit behind the `heraldry_1` research node. That node lives
       * inside the Gauntlet, and the Gauntlet is behind a population gate that
       * will not open for a long time (§9.3) — so under 024 a clan's identity
       * would have been permanently locked. Identity is not a reward for
       * reaching a population threshold.
       */
      case 'update_identity': {
        const { bannerId, emblemId, colorPrimary, colorSecondary } = body as {
          bannerId?: unknown;
          emblemId?: unknown;
          colorPrimary?: unknown;
          colorSecondary?: unknown;
        };
        const asOptionalString = (value: unknown) =>
          typeof value === 'string' && value.length > 0 ? value : null;

        const { data, error } = await supabase.rpc('set_clan_heraldry', {
          p_user_id: user.id,
          p_banner_id: asOptionalString(bannerId),
          p_emblem_id: asOptionalString(emblemId),
          p_color_primary: asOptionalString(colorPrimary),
          p_color_secondary: asOptionalString(colorSecondary),
        });
        if (error) {
          if (isMissingClanRework(error) || isMissingDiscordInfra(error)) {
            return notLiveYet('Clan identity');
          }
          reportError('set_clan_heraldry RPC', error, { userId: user.id });
          return NextResponse.json({ error: 'Request failed' }, { status: 500 });
        }
        return mapRpcResult(data);
      }

      /**
       * Answer an invite issued before this rework. No path in this route
       * creates one any more — recruitment is the invite code — but Rule 5
       * says a pending one is not destroyed by the change.
       */
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
          if (isMissingClanRework(error) || isMissingDiscordInfra(error)) {
            return notLiveYet('Invites');
          }
          reportError('respond_clan_invite RPC', error, { userId: user.id });
          return NextResponse.json({ error: 'Request failed' }, { status: 500 });
        }
        return mapRpcResult(data);
      }

      default:
        return NextResponse.json({ error: 'Invalid action' }, { status: 400 });
    }
  } catch (error) {
    reportError('POST', error);
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}

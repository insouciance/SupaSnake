/**
 * Competitive clan API (Product Constitution v1.7 §9).
 *
 * GET ?view=directory&q=&policy=&hasSpace=  searchable factual directory
 * GET ?view=full                              roster/governance/Glory state
 * GET ?view=config                            quoted founding/Glory terms
 * GET ?playerId=                              authenticated own-membership bridge
 *
 * POST actions: found, apply, join_by_code, invite, approve_application,
 * reject_application, respond_invite, leave, remove_member, set_role,
 * transfer_ownership, update_settings, rotate_invite_code, update_identity,
 * assign_glory.
 *
 * All mutations are service-role RPCs. The route never accepts a DNA amount,
 * contribution, rank, effective cycle, or reward from the client.
 */

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import * as Sentry from '@sentry/nextjs';
import {
  CLAN_LIMITS,
  CLAN_PERMISSIONS,
  CLAN_ROLE_LABELS,
  asClanRole,
  isClanJoinPolicy,
  isValidClanName,
  isValidClanTag,
  type ClanRole,
} from '@/lib/clan/types';
import {
  CLAN_DIRECTORY_LIMITS,
  CLAN_ECONOMY_CONFIG,
  clanInviteUrl,
  isValidClanInviteCode,
} from '@/lib/clan/config';
import { isMissingDiscordInfra } from '@/lib/server/discord';
import { isMissingClanRework, loadClanDirectory } from '@/lib/server/clanHunt';
import { energyBattleCycleAt } from '@/shared/game/clanEnergyBattle';
import { identityFromRow, type PlayerIdentityRow } from '@/lib/identity/types';
import {
  isValidClanBannerId,
  isValidClanColor,
  isValidClanEmblemId,
} from '@/lib/clan/heraldry';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || '',
  process.env.SUPABASE_SERVICE_ROLE_KEY || ''
);

/** Public/member-safe clan fields. Authority artifacts such as invite_code
 * are deliberately absent and are projected separately for recruiters. */
const CLAN_SAFE_FIELD_NAMES = [
  'id', 'name', 'tag', 'member_count', 'max_members',
  'join_policy', 'banner_id', 'emblem_id', 'color_primary',
  'color_secondary', 'best_week_depth', 'lifetime_depth', 'created_at',
  'updated_at', 'disbanded_at',
] as const;
const CLAN_SAFE_COLUMNS = CLAN_SAFE_FIELD_NAMES.join(',');

function safeClanProjection(value: unknown): Record<string, unknown> | null {
  const candidate = Array.isArray(value) ? value[0] : value;
  if (!candidate || typeof candidate !== 'object') return null;
  const row = candidate as Record<string, unknown>;
  const safe: Record<string, unknown> = {};
  for (const field of CLAN_SAFE_FIELD_NAMES) {
    if (Object.prototype.hasOwnProperty.call(row, field)) safe[field] = row[field];
  }
  return safe;
}

interface ErrorLike {
  code?: string;
  message?: string;
}

function reportError(scope: string, error: unknown, extra: Record<string, unknown> = {}) {
  console.error(`Clan ${scope} error:`, { ...extra, error });
  Sentry.captureException(
    error instanceof Error ? error : new Error(`Clan ${scope} error`),
    { extra: { scope, ...extra, error } }
  );
}

const CLAN_RPC_ERRORS: Record<string, { status: number; error: string }> = {
  not_in_clan: { status: 404, error: 'Not in a clan' },
  not_authorized: { status: 403, error: 'Not authorized' },
  invalid_name: { status: 400, error: 'That name will not do' },
  invalid_tag: { status: 400, error: 'That tag will not do' },
  invalid_code: { status: 400, error: 'That is not an invite code' },
  invalid_handle: { status: 400, error: 'That is not a valid handle' },
  invalid_banner: { status: 400, error: 'Invalid banner' },
  invalid_emblem: { status: 400, error: 'Invalid emblem' },
  invalid_color: { status: 400, error: 'Invalid color' },
  invalid_policy: { status: 400, error: 'Invalid clan policy' },
  invalid_role: { status: 400, error: 'Invalid clan role' },
  invalid_glory_seat: { status: 400, error: 'Invalid Glory seat' },
  invalid_glory_terms: { status: 500, error: 'Glory configuration is invalid' },
  invalid_founding_cost: { status: 500, error: 'Clan founding configuration is invalid' },
  invalid_invite_lifetime: { status: 500, error: 'Clan invitation configuration is invalid' },
  tag_unavailable: { status: 409, error: 'Could not find a free tag for that name' },
  target_not_in_clan: { status: 404, error: 'That player is not in your clan' },
  target_already_in_clan: { status: 409, error: 'That player is already in a clan' },
  applicant_already_in_clan: { status: 409, error: 'That applicant already joined a clan' },
  cannot_change_owner: { status: 400, error: 'Transfer leadership instead' },
  protected_role: { status: 403, error: 'That role is protected from this action' },
  owner_must_transfer: { status: 400, error: 'Hand the clan over before you leave' },
  use_leave: { status: 400, error: 'Use leave to leave your own clan' },
  invite_not_found: { status: 404, error: 'Invite not found' },
  invite_not_pending: { status: 409, error: 'Invite already answered' },
  invite_expired: { status: 410, error: 'Invite expired' },
  invite_required: { status: 403, error: 'This clan is invite-only' },
  handle_not_found: { status: 404, error: 'No player has that exact handle' },
  cannot_invite_self: { status: 400, error: 'You cannot invite yourself' },
  application_not_found: { status: 404, error: 'Application not found' },
  already_in_clan: { status: 409, error: 'Already in a clan' },
  clan_full: { status: 409, error: 'Clan is full' },
  clan_disbanded: { status: 410, error: 'That clan has disbanded' },
  clan_not_found: { status: 404, error: 'Clan not found' },
  player_not_found: { status: 404, error: 'Player not found' },
  insufficient_dna: { status: 409, error: 'Not enough DNA to found this clan' },
  heraldry_locked: { status: 403, error: 'Heraldry is not editable yet' },
  glory_source_battle_not_found: { status: 409, error: 'No eligible source battle exists' },
  glory_source_not_final: { status: 409, error: 'Glory opens after the battle result is final' },
  glory_boundary_not_open: { status: 409, error: 'Glory opens during the battle intermission' },
  glory_boundary_passed: { status: 409, error: 'That Glory boundary has passed' },
  glory_not_eligible: { status: 409, error: 'That member is not yet Glory-eligible' },
  glory_tenure_required: { status: 409, error: 'That member has not met the Glory tenure term' },
  glory_self_award_disabled: { status: 403, error: 'Leader self-awards are disabled' },
  glory_holder_already_assigned: { status: 409, error: 'That member already holds a Glory seat' },
  glory_seat_taken: { status: 409, error: 'That Glory seat is already assigned' },
};

function competitiveConfig() {
  return {
    foundingDnaCost: CLAN_ECONOMY_CONFIG.foundingDnaCost,
    policies: ['open', 'application', 'invite_only'] as const,
    roleLabels: CLAN_ROLE_LABELS,
    permissions: CLAN_PERMISSIONS,
    glory: {
      maxSeats: CLAN_ECONOMY_CONFIG.glory.maxSeats,
      rewardDna: CLAN_ECONOMY_CONFIG.glory.rewardDna,
      minimumTenureSeconds: CLAN_ECONOMY_CONFIG.glory.minimumTenureSeconds,
      minimumContributionDepth: CLAN_ECONOMY_CONFIG.glory.minimumContributionDepth,
      allowOwnerSelfAward: CLAN_ECONOMY_CONFIG.glory.allowOwnerSelfAward,
      allowPendingReassignment: CLAN_ECONOMY_CONFIG.glory.allowPendingReassignment,
    },
  };
}

function mapRpcResult(data: unknown): NextResponse {
  const payload = (data ?? {}) as { error?: string } & Record<string, unknown>;
  if (payload.error) {
    const mapped = CLAN_RPC_ERRORS[payload.error];
    if (mapped) {
      return NextResponse.json(
        { error: mapped.error, code: payload.error, details: payload },
        { status: mapped.status }
      );
    }
    reportError('RPC payload', new Error(`Unmapped clan RPC error: ${payload.error}`), {
      payload,
    });
    return NextResponse.json({ error: 'Request failed' }, { status: 500 });
  }
  return NextResponse.json({ success: true, result: payload });
}

function notLiveYet(subject: string): NextResponse {
  return NextResponse.json({ error: `${subject} is not live yet` }, { status: 503 });
}

async function callClanRpc(
  name: string,
  args: Record<string, unknown>,
  subject: string,
  userId: string
): Promise<NextResponse> {
  const { data, error } = await supabase.rpc(name, args);
  if (error) {
    if (isMissingClanRework(error)) return notLiveYet(subject);
    reportError(`${name} RPC`, error, { userId });
    return NextResponse.json({ error: 'Request failed' }, { status: 500 });
  }
  return mapRpcResult(data);
}

async function authenticatedUser(request: NextRequest): Promise<
  | { userId: string; error: null }
  | { userId: null; error: NextResponse }
> {
  const authHeader = request.headers.get('authorization');
  if (!authHeader) {
    return { userId: null, error: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) };
  }
  const token = authHeader.replace('Bearer ', '');
  const { data: { user }, error } = await supabase.auth.getUser(token);
  if (error) reportError('authentication', error);
  if (error || !user) {
    return { userId: null, error: NextResponse.json({ error: 'Invalid token' }, { status: 401 }) };
  }
  return { userId: user.id, error: null };
}

async function fullClanView(userId: string): Promise<NextResponse> {
  const { data: membership, error: membershipError } = await supabase
    .from('clan_members')
    .select('clan_id, role, joined_at')
    .eq('player_id', userId)
    .maybeSingle();
  if (membershipError && !isMissingClanRework(membershipError)) {
    reportError('membership read', membershipError, { userId });
    return NextResponse.json({ error: 'Failed to load membership' }, { status: 503 });
  }

  const { data: inbox, error: inboxError } = await supabase
    .from('clan_invites')
    .select('id, clan_id, invited_by, status, created_at, expires_at, clans:clan_id(name, tag)')
    .eq('player_id', userId)
    .eq('status', 'pending')
    .gt('expires_at', new Date().toISOString());
  if (inboxError && !isMissingClanRework(inboxError)) {
    reportError('invite inbox read', inboxError, { userId });
    return NextResponse.json({ error: 'Failed to load invitations' }, { status: 503 });
  }
  const myInvites = (inbox ?? []).map((invite) => ({
    id: invite.id,
    clanId: invite.clan_id,
    invitedByUserId: invite.invited_by,
    clanName: (invite.clans as unknown as { name?: string } | null)?.name ?? null,
    clanTag: (invite.clans as unknown as { tag?: string } | null)?.tag ?? null,
    expiresAt: invite.expires_at,
  }));

  const { data: ownApplications, error: ownApplicationsError } = await supabase
    .from('clan_applications')
    .select('id, clan_id, status, created_at, clans:clan_id(name, tag)')
    .eq('applicant_id', userId)
    .eq('status', 'pending')
    .order('created_at', { ascending: false });
  if (ownApplicationsError && !isMissingClanRework(ownApplicationsError)) {
    reportError('own application read', ownApplicationsError, { userId });
    return NextResponse.json({ error: 'Failed to load applications' }, { status: 503 });
  }
  const myApplications = (ownApplications ?? []).map((application) => ({
    id: application.id,
    clanId: application.clan_id,
    status: application.status,
    createdAt: application.created_at,
    clanName: (application.clans as unknown as { name?: string } | null)?.name ?? null,
    clanTag: (application.clans as unknown as { tag?: string } | null)?.tag ?? null,
  }));

  if (!membership) {
    return NextResponse.json({
      clan: null,
      myInvites,
      myApplications,
      competitiveConfig: competitiveConfig(),
    });
  }

  const role = asClanRole(membership.role);
  const { data: clan, error: clanError } = await supabase
    .from('clans')
    .select(CLAN_SAFE_COLUMNS)
    .eq('id', membership.clan_id)
    .single();
  if (clanError || !clan) {
    reportError('full clan read', clanError, { clanId: membership.clan_id });
    return NextResponse.json({ error: 'Failed to load clan' }, { status: 503 });
  }

  const { data: members, error: membersError } = await supabase
    .from('clan_members')
    .select('player_id, role, joined_at')
    .eq('clan_id', membership.clan_id)
    .order('joined_at', { ascending: true });
  if (membersError) {
    reportError('roster read', membersError, { clanId: membership.clan_id });
    return NextResponse.json({ error: 'Failed to load roster' }, { status: 503 });
  }

  const { data: spans, error: spansError } = await supabase
    .from('clan_membership_history')
    .select('player_id, joined_at')
    .eq('clan_id', membership.clan_id);
  if (spansError && !isMissingClanRework(spansError)) {
    reportError('tenure read', spansError, { clanId: membership.clan_id });
    return NextResponse.json({ error: 'Failed to load tenure' }, { status: 503 });
  }
  const tenureByUser = new Map<string, string>();
  for (const row of (spans ?? []) as Array<Record<string, unknown>>) {
    const id = String(row.player_id ?? '');
    const at = String(row.joined_at ?? '');
    const current = tenureByUser.get(id);
    if (id && at && (!current || at < current)) tenureByUser.set(id, at);
  }

  let applications: Array<Record<string, unknown>> = [];
  if (role === 'owner' || role === 'co_leader') {
    const { data, error } = await supabase
      .from('clan_applications')
      .select('id, applicant_id, status, created_at')
      .eq('clan_id', membership.clan_id)
      .eq('status', 'pending')
      .order('created_at', { ascending: true });
    if (error) {
      reportError('pending applications read', error, { clanId: membership.clan_id });
      return NextResponse.json({ error: 'Failed to load applications' }, { status: 503 });
    }
    applications = (data ?? []) as Array<Record<string, unknown>>;
  }

  const cycle = energyBattleCycleAt();
  const { data: contributionRows, error: contributionError } = await supabase.rpc(
    'get_clan_competitive_roster',
    { p_clan_id: membership.clan_id, p_cycle_index: cycle.index }
  );
  if (contributionError && !isMissingClanRework(contributionError)) {
    reportError('competitive roster read', contributionError, {
      clanId: membership.clan_id,
      cycleIndex: cycle.index,
    });
    return NextResponse.json({ error: 'Failed to load contribution ranks' }, { status: 503 });
  }
  const contributionByUser = new Map<string, Record<string, unknown>>(
    ((contributionRows ?? []) as Array<Record<string, unknown>>).map((row) => [
      String(row.user_id ?? ''),
      row,
    ])
  );

  const { data: gloryRows, error: gloryError } = await supabase
    .from('clan_glory_assignments')
    .select('id, seat, holder_user_id, assigned_by_user_id, source_cycle_index, effective_cycle_index, effective_at, evidence_depth, evidence_rank, evidence_contribution_count, reward_dna, assigned_at')
    .eq('clan_id', membership.clan_id)
    .is('superseded_at', null)
    .gte('effective_cycle_index', cycle.index - 1)
    .order('effective_cycle_index', { ascending: false })
    .order('seat', { ascending: true });
  if (gloryError && !isMissingClanRework(gloryError)) {
    reportError('Glory assignment read', gloryError, { clanId: membership.clan_id });
    return NextResponse.json({ error: 'Failed to load Glory seats' }, { status: 503 });
  }
  const gloryAssignmentIds = (gloryRows ?? []).map((row) => row.id as string);
  let rewardedAssignments = new Set<string>();
  if (gloryAssignmentIds.length > 0) {
    const { data: rewardRows, error: rewardError } = await supabase
      .from('clan_glory_reward_ledger')
      .select('assignment_id')
      .in('assignment_id', gloryAssignmentIds);
    if (rewardError && !isMissingClanRework(rewardError)) {
      reportError('Glory reward read', rewardError, { clanId: membership.clan_id });
      return NextResponse.json({ error: 'Failed to load Glory rewards' }, { status: 503 });
    }
    rewardedAssignments = new Set((rewardRows ?? []).map((row) => String(row.assignment_id)));
  }

  const identityIds = new Set<string>((members ?? []).map((member) => String(member.player_id)));
  for (const application of applications) identityIds.add(String(application.applicant_id));
  for (const glory of gloryRows ?? []) identityIds.add(String(glory.holder_user_id));
  const identities = new Map<string, ReturnType<typeof identityFromRow>>();
  if (identityIds.size > 0) {
    const { data: identityRows, error: identityError } = await supabase.rpc(
      'get_player_identities',
      { p_ids: Array.from(identityIds) }
    );
    if (identityError) {
      if (!/get_player_identities/i.test(identityError.message || '')) {
        reportError('roster identity read', identityError, { clanId: membership.clan_id });
        return NextResponse.json({ error: 'Failed to load player identities' }, { status: 503 });
      }
    } else {
      for (const row of (identityRows ?? []) as PlayerIdentityRow[]) {
        if (row.user_id) identities.set(row.user_id, identityFromRow(row));
      }
    }
  }

  const roster = (members ?? []).map((member) => {
    const userKey = String(member.player_id);
    const joinedAt = String(member.joined_at);
    const earlier = tenureByUser.get(userKey);
    const memberRole = asClanRole(member.role);
    const contribution = contributionByUser.get(userKey);
    const eligibleResults = Number(contribution?.eligible_results ?? 0);
    const hasEligibleContribution = eligibleResults > 0;
    return {
      userId: userKey,
      role: memberRole,
      roleLabel: CLAN_ROLE_LABELS[memberRole],
      permissions: CLAN_PERMISSIONS[memberRole],
      joinedAt,
      tenureSince: earlier && earlier < joinedAt ? earlier : joinedAt,
      identity: identities.get(userKey) ?? null,
      contribution: {
        cycleIndex: cycle.index,
        hasEligibleContribution,
        bestFiveDepth: hasEligibleContribution
          ? Number(contribution?.best_five_depth)
          : null,
        rank: hasEligibleContribution
          ? Number(contribution?.contribution_rank)
          : null,
        eligibleResults,
        bestGeneration: hasEligibleContribution
          ? Number(contribution?.best_generation)
          : null,
        lastContributedAt: hasEligibleContribution
          ? (contribution?.last_contributed_at as string | null) ?? null
          : null,
      },
    };
  });

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
  if (discordError && !isMissingDiscordInfra(discordError)) {
    reportError('Discord link read', discordError, { clanId: membership.clan_id });
    return NextResponse.json({ error: 'Failed to load clan link' }, { status: 503 });
  }
  if (discordLink) {
    discord = {
      linked: true,
      model: discordLink.model,
      guildId: discordLink.guild_id,
      channelId: discordLink.channel_id,
      inviteUrl: discordLink.invite_url ?? null,
    };
  }

  const clanRow = clan as unknown as Record<string, unknown>;
  const safeClan = safeClanProjection(clan);
  const canInvite = CLAN_PERMISSIONS[role].invite;
  let inviteCode: string | null = null;
  if (canInvite) {
    const { data: inviteClan, error: inviteCodeError } = await supabase
      .from('clans')
      .select('invite_code')
      .eq('id', membership.clan_id)
      .single();
    if (inviteCodeError) {
      reportError('invite code read', inviteCodeError, { clanId: membership.clan_id, userId });
      return NextResponse.json({ error: 'Failed to load clan invitation' }, { status: 503 });
    }
    inviteCode = (inviteClan?.invite_code as string | null) ?? null;
  }
  const ownRoster = roster.find((entry) => entry.userId === userId);
  return NextResponse.json({
    clan: safeClan,
    membership: {
      clanId: membership.clan_id,
      role,
      roleLabel: CLAN_ROLE_LABELS[role],
      permissions: CLAN_PERMISSIONS[role],
      joinedAt: membership.joined_at,
      tenureSince: ownRoster?.tenureSince ?? membership.joined_at,
    },
    settings: { joinPolicy: clanRow.join_policy },
    identity: {
      bannerId: clanRow.banner_id ?? null,
      emblemId: clanRow.emblem_id ?? null,
      colorPrimary: clanRow.color_primary ?? null,
      colorSecondary: clanRow.color_secondary ?? null,
    },
    invite: { code: inviteCode, url: inviteCode ? clanInviteUrl(inviteCode) : null },
    limits: {
      maxMembers: CLAN_LIMITS.maxMembers,
      softFullMembers: CLAN_LIMITS.softFullMembers,
      availableSpots: Math.max(0, CLAN_LIMITS.maxMembers - roster.length),
    },
    cycle,
    roster,
    applications: applications.map((application) => ({
      id: application.id,
      applicantUserId: application.applicant_id,
      status: application.status,
      createdAt: application.created_at,
      identity: identities.get(String(application.applicant_id)) ?? null,
    })),
    glory: {
      terms: competitiveConfig().glory,
      seats: (gloryRows ?? []).map((assignment) => ({
        id: assignment.id,
        seat: assignment.seat,
        holderUserId: assignment.holder_user_id,
        holderIdentity: identities.get(String(assignment.holder_user_id)) ?? null,
        assignedByUserId: assignment.assigned_by_user_id,
        sourceCycleIndex: assignment.source_cycle_index,
        effectiveCycleIndex: assignment.effective_cycle_index,
        effectiveAt: assignment.effective_at,
        evidenceDepth: Number(assignment.evidence_depth),
        evidenceRank: Number(assignment.evidence_rank),
        evidenceContributionCount: Number(assignment.evidence_contribution_count),
        rewardDna: Number(assignment.reward_dna),
        assignedAt: assignment.assigned_at,
        state:
          Number(assignment.effective_cycle_index) > cycle.index
            ? 'pending'
            : Number(assignment.effective_cycle_index) === cycle.index
              ? 'active'
              : 'completed',
        rewarded: rewardedAssignments.has(String(assignment.id)),
      })),
    },
    myInvites,
    myApplications,
    discord,
    competitiveConfig: competitiveConfig(),
  });
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const playerId = searchParams.get('playerId');
    const view = searchParams.get('view');

    if (view === 'config') {
      return NextResponse.json({ competitiveConfig: competitiveConfig() });
    }
    if (view === 'full') {
      const auth = await authenticatedUser(request);
      if (auth.error) return auth.error;
      return fullClanView(auth.userId);
    }

    if (playerId) {
      const auth = await authenticatedUser(request);
      if (auth.error) return auth.error;
      if (auth.userId !== playerId) {
        return NextResponse.json({ error: 'Not authorized' }, { status: 403 });
      }
      const { data: membership, error } = await supabase
        .from('clan_members')
        .select(`clan_id, role, joined_at, clans:clan_id(${CLAN_SAFE_COLUMNS})`)
        .eq('player_id', auth.userId)
        .maybeSingle();
      if (error && !isMissingClanRework(error)) {
        reportError('player clan read', error, { playerId: auth.userId });
        return NextResponse.json({ error: 'Failed to load membership' }, { status: 503 });
      }
      if (!membership) return NextResponse.json({ clan: null });
      const membershipRow = membership as unknown as {
        clan_id: string;
        role: unknown;
        joined_at: string;
        clans: unknown;
      };
      const role = asClanRole(membershipRow.role);
      return NextResponse.json({
        clan: safeClanProjection(membershipRow.clans),
        membership: {
          clanId: membershipRow.clan_id,
          role,
          roleLabel: CLAN_ROLE_LABELS[role],
          joinedAt: membershipRow.joined_at,
        },
      });
    }

    const search = (searchParams.get('q') ?? searchParams.get('search') ?? '').trim();
    if (search.length > CLAN_DIRECTORY_LIMITS.maxSearchLength) {
      return NextResponse.json({ error: 'Search is too long' }, { status: 400 });
    }
    const policyValue = searchParams.get('policy');
    if (policyValue !== null && !isClanJoinPolicy(policyValue)) {
      return NextResponse.json({ error: 'Invalid clan policy' }, { status: 400 });
    }
    const hasSpaceValue = searchParams.get('hasSpace');
    if (hasSpaceValue !== null && hasSpaceValue !== 'true' && hasSpaceValue !== 'false') {
      return NextResponse.json({ error: 'hasSpace must be true or false' }, { status: 400 });
    }
    const parsedLimit = Number.parseInt(searchParams.get('limit') ?? '', 10);
    const parsedOffset = Number.parseInt(searchParams.get('offset') ?? '', 10);
    const clans = await loadClanDirectory(supabase, {
      search: search || null,
      policy: policyValue,
      hasSpace: hasSpaceValue === null ? null : hasSpaceValue === 'true',
      limit: Number.isFinite(parsedLimit) ? parsedLimit : undefined,
      offset: Number.isFinite(parsedOffset) ? parsedOffset : undefined,
    });
    return NextResponse.json({ clans });
  } catch (error) {
    reportError('GET', error);
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}

function requiredString(value: unknown): string | null {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : null;
}

export async function POST(request: NextRequest) {
  try {
    const auth = await authenticatedUser(request);
    if (auth.error) return auth.error;
    const userId = auth.userId;
    const body = (await request.json()) as Record<string, unknown>;
    const action = body.action;

    switch (action) {
      case 'found': {
        const name = requiredString(body.name);
        const tag = typeof body.tag === 'string' ? body.tag.trim().toUpperCase() : '';
        if (!name || !isValidClanName(name)) {
          return NextResponse.json(
            { error: `Name must be ${CLAN_LIMITS.minNameLength}-${CLAN_LIMITS.maxNameLength} characters`, code: 'invalid_name' },
            { status: 400 }
          );
        }
        if (tag && !isValidClanTag(tag)) {
          return NextResponse.json(
            { error: `Tag must be ${CLAN_LIMITS.minTagLength}-${CLAN_LIMITS.maxTagLength} uppercase letters/numbers`, code: 'invalid_tag' },
            { status: 400 }
          );
        }
        const optional = (value: unknown) => requiredString(value);
        const bannerId = optional(body.bannerId);
        const emblemId = optional(body.emblemId);
        const colorPrimary = optional(body.colorPrimary)?.toLowerCase() ?? null;
        const colorSecondary = optional(body.colorSecondary)?.toLowerCase() ?? null;
        if (bannerId !== null && !isValidClanBannerId(bannerId)) {
          return NextResponse.json({ error: 'Invalid banner', code: 'invalid_banner' }, { status: 400 });
        }
        if (emblemId !== null && !isValidClanEmblemId(emblemId)) {
          return NextResponse.json({ error: 'Invalid emblem', code: 'invalid_emblem' }, { status: 400 });
        }
        if ((colorPrimary !== null && !isValidClanColor(colorPrimary))
          || (colorSecondary !== null && !isValidClanColor(colorSecondary))) {
          return NextResponse.json({ error: 'Invalid color', code: 'invalid_color' }, { status: 400 });
        }
        const { data, error } = await supabase.rpc('found_clan', {
          p_user_id: userId,
          p_name: name,
          p_tag: tag || null,
          p_banner_id: bannerId,
          p_emblem_id: emblemId,
          p_color_primary: colorPrimary,
          p_color_secondary: colorSecondary,
          p_founding_cost: CLAN_ECONOMY_CONFIG.foundingDnaCost,
        });
        if (error) {
          if (isMissingClanRework(error)) return notLiveYet('Founding a clan');
          reportError('found_clan RPC', error, { userId });
          return NextResponse.json({ error: 'Request failed' }, { status: 500 });
        }
        const payload = (data ?? {}) as Record<string, unknown>;
        if (payload.error) return mapRpcResult(payload);
        const code = (payload.invite_code as string | null) ?? null;
        return NextResponse.json({
          success: true,
          clan: {
            id: payload.clan_id,
            name: payload.name,
            tag: payload.tag,
            memberCount: payload.member_count,
            maxMembers: payload.max_members,
            joinPolicy: payload.join_policy,
          },
          economy: {
            foundingDnaCost: payload.founding_dna_cost,
            dnaBalance: payload.dna_balance,
          },
          invite: { code, url: code ? clanInviteUrl(code) : null },
        });
      }

      case 'apply':
      case 'request_membership': {
        const clanId = requiredString(body.clanId);
        if (!clanId) return NextResponse.json({ error: 'clanId is required' }, { status: 400 });
        return callClanRpc(
          'request_clan_membership',
          { p_user_id: userId, p_clan_id: clanId },
          'Clan applications',
          userId
        );
      }

      case 'join_by_code': {
        const code = typeof body.code === 'string' ? body.code.trim().toUpperCase() : '';
        if (!isValidClanInviteCode(code)) {
          return NextResponse.json({ error: 'That is not an invite code', code: 'invalid_code' }, { status: 400 });
        }
        return callClanRpc(
          'join_clan_by_code',
          { p_user_id: userId, p_code: code },
          'Joining by code',
          userId
        );
      }

      case 'invite': {
        const handle = requiredString(body.handle);
        if (!handle || !/^[A-Za-z0-9_]{3,16}$/.test(handle)) {
          return NextResponse.json({ error: 'A valid exact handle is required', code: 'invalid_handle' }, { status: 400 });
        }
        return callClanRpc(
          'create_clan_invite_by_handle',
          {
            p_actor_user_id: userId,
            p_handle: handle,
            p_expires_in_seconds: CLAN_ECONOMY_CONFIG.invitationLifetimeSeconds,
          },
          'Direct invitations',
          userId
        );
      }

      case 'approve_application':
      case 'reject_application': {
        const applicationId = requiredString(body.applicationId);
        if (!applicationId) {
          return NextResponse.json({ error: 'applicationId is required' }, { status: 400 });
        }
        return callClanRpc(
          'review_clan_application',
          {
            p_actor_user_id: userId,
            p_application_id: applicationId,
            p_approve: action === 'approve_application',
          },
          'Clan applications',
          userId
        );
      }

      case 'respond_invite': {
        const inviteId = requiredString(body.inviteId);
        if (!inviteId) return NextResponse.json({ error: 'inviteId is required' }, { status: 400 });
        if (typeof body.accept !== 'boolean') {
          return NextResponse.json({ error: 'accept must be boolean' }, { status: 400 });
        }
        return callClanRpc(
          'respond_clan_invite',
          { p_user_id: userId, p_invite_id: inviteId, p_accept: body.accept },
          'Invitations',
          userId
        );
      }

      case 'leave':
        return callClanRpc('leave_clan', { p_user_id: userId }, 'Leaving a clan', userId);

      case 'remove_member': {
        const targetUserId = requiredString(body.targetUserId);
        if (!targetUserId) return NextResponse.json({ error: 'targetUserId is required' }, { status: 400 });
        return callClanRpc(
          'remove_clan_member',
          { p_user_id: userId, p_target_user_id: targetUserId },
          'Roster management',
          userId
        );
      }

      case 'set_role': {
        const targetUserId = requiredString(body.targetUserId);
        const role = body.role;
        if (!targetUserId) return NextResponse.json({ error: 'targetUserId is required' }, { status: 400 });
        if (role !== 'co_leader' && role !== 'member') {
          return NextResponse.json({ error: 'role must be co_leader or member', code: 'invalid_role' }, { status: 400 });
        }
        return callClanRpc(
          'set_clan_member_role',
          { p_actor_user_id: userId, p_target_user_id: targetUserId, p_role: role },
          'Clan roles',
          userId
        );
      }

      case 'transfer_ownership': {
        const targetUserId = requiredString(body.targetUserId);
        if (!targetUserId) return NextResponse.json({ error: 'targetUserId is required' }, { status: 400 });
        return callClanRpc(
          'transfer_clan_ownership',
          { p_user_id: userId, p_target_user_id: targetUserId },
          'Transferring a clan',
          userId
        );
      }

      case 'update_settings': {
        if (!isClanJoinPolicy(body.joinPolicy)) {
          return NextResponse.json({ error: 'Invalid clan policy', code: 'invalid_policy' }, { status: 400 });
        }
        return callClanRpc(
          'update_clan_settings',
          { p_actor_user_id: userId, p_join_policy: body.joinPolicy },
          'Clan settings',
          userId
        );
      }

      case 'rotate_invite_code': {
        const { data, error } = await supabase.rpc('rotate_clan_invite_code', { p_user_id: userId });
        if (error) {
          if (isMissingClanRework(error)) return notLiveYet('Invite codes');
          reportError('rotate_clan_invite_code RPC', error, { userId });
          return NextResponse.json({ error: 'Request failed' }, { status: 500 });
        }
        const payload = (data ?? {}) as Record<string, unknown>;
        if (payload.error) return mapRpcResult(payload);
        const code = (payload.invite_code as string | null) ?? null;
        return NextResponse.json({ success: true, invite: { code, url: code ? clanInviteUrl(code) : null } });
      }

      case 'update_identity': {
        const optional = (value: unknown) => requiredString(value);
        const bannerId = optional(body.bannerId);
        const emblemId = optional(body.emblemId);
        const colorPrimary = optional(body.colorPrimary)?.toLowerCase() ?? null;
        const colorSecondary = optional(body.colorSecondary)?.toLowerCase() ?? null;
        if (bannerId !== null && !isValidClanBannerId(bannerId)) {
          return NextResponse.json({ error: 'Invalid banner', code: 'invalid_banner' }, { status: 400 });
        }
        if (emblemId !== null && !isValidClanEmblemId(emblemId)) {
          return NextResponse.json({ error: 'Invalid emblem', code: 'invalid_emblem' }, { status: 400 });
        }
        if ((colorPrimary !== null && !isValidClanColor(colorPrimary))
          || (colorSecondary !== null && !isValidClanColor(colorSecondary))) {
          return NextResponse.json({ error: 'Invalid color', code: 'invalid_color' }, { status: 400 });
        }
        return callClanRpc(
          'set_clan_heraldry',
          {
            p_user_id: userId,
            p_banner_id: bannerId,
            p_emblem_id: emblemId,
            p_color_primary: colorPrimary,
            p_color_secondary: colorSecondary,
          },
          'Clan identity',
          userId
        );
      }

      case 'assign_glory': {
        const targetUserId = requiredString(body.targetUserId);
        const seat = Number(body.seat);
        if (!targetUserId) return NextResponse.json({ error: 'targetUserId is required' }, { status: 400 });
        if (!Number.isInteger(seat) || seat < 1 || seat > CLAN_ECONOMY_CONFIG.glory.maxSeats) {
          return NextResponse.json({ error: 'seat must be 1 or 2', code: 'invalid_glory_seat' }, { status: 400 });
        }
        const cycle = energyBattleCycleAt();
        return callClanRpc(
          'assign_clan_glory',
          {
            p_actor_user_id: userId,
            p_target_user_id: targetUserId,
            p_source_cycle_index: cycle.index,
            p_seat: seat,
            p_reward_dna: CLAN_ECONOMY_CONFIG.glory.rewardDna,
            p_minimum_tenure_seconds: CLAN_ECONOMY_CONFIG.glory.minimumTenureSeconds,
            p_minimum_contribution_depth: CLAN_ECONOMY_CONFIG.glory.minimumContributionDepth,
            p_allow_self_award: CLAN_ECONOMY_CONFIG.glory.allowOwnerSelfAward,
            p_allow_reassignment: CLAN_ECONOMY_CONFIG.glory.allowPendingReassignment,
          },
          'Glory assignment',
          userId
        );
      }

      default:
        return NextResponse.json({ error: 'Invalid action' }, { status: 400 });
    }
  } catch (error) {
    reportError('POST', error);
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}

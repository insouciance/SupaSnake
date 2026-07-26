/**
 * The clan hunt — server authority for the reworked clan (Constitution
 * §9.2–9.4, Rules 5, 6, 8, 11).
 *
 * Four jobs:
 *
 *   `buildClanHuntPanel`     everything the hunt surface renders: the clan,
 *                            the roster, the self-referential primary, and —
 *                            only when one exists — the rival layer.
 *   `ensureClanWeekPairings` pair the current week, idempotently.
 *   `settleDueClanWeeks`     resolve paired weeks after Serpent settlement.
 *   `loadClanDirectory`      the alive-only directory (§9.2).
 *
 * WHAT THIS MODULE DOES NOT DO
 *
 * It does not recompute clan Depth. WP-1.01 already built that: clan Depth is
 * the plain additive SUM of member Depths, folded over the FULL roster so the
 * cohort filter cannot make the sum lie (`hiddenMembers`). This module composes
 * with `buildSerpentPanel` rather than re-deriving it, which is also why the
 * hunt panel and the Serpent panel can never disagree about a number.
 *
 * RULE 8, STRUCTURALLY
 *
 * Nothing here reads a role to decide what a member may do, returns a per-member
 * threshold, sorts a roster by anything a surface could draw a cut line under
 * without inventing the line itself, or writes any currency. `SerpentPanelMember`
 * carries a handle, a Depth and an attempt count; the display is additive
 * ("Sans_Souci fed 2,315 segments"), which is §9.2's own example.
 *
 * PRE-MIGRATION-048 SAFE
 *
 * Until 048 applies, none of the tables or RPCs exist. `isMissingClanRework`
 * recognises that and every entry point degrades to "the clan rework is not
 * live" — closed, never half-open: no pairing is written, no laurel is
 * awarded, and the panel answers with `live: false`.
 */

import * as Sentry from '@sentry/nextjs';
import type { SupabaseClient } from '@supabase/supabase-js';
import {
  buildSerpentPanel,
  ensureCurrentSerpentWeek,
  loadSettleableSerpentWeeks,
  type SerpentPanelClan,
  type SerpentWeekRow,
} from '@/lib/server/serpent';
import {
  clanActivityBand,
  clanSizeBand,
  pairClanWeek,
  rivalryKey,
  CLAN_ACTIVITY_WINDOW_WEEKS,
  type ClanPairingCandidate,
} from '@/lib/clan/pairing';
import {
  CLAN_GAUNTLET_ENABLED,
  CLAN_PLAYOFFS_ENABLED,
  CLAN_V2_ENABLED,
  DIRECTORY_ALIVE_WEEKS,
} from '@/lib/clan/config';
import { CLAN_LIMITS } from '@/lib/clan/types';

interface SupabaseErrorLike {
  code?: string;
  message?: string;
}

/**
 * Is this failure just "migration 048 has not been applied here yet"?
 *
 * Same code set WP-1.01 uses (42703 unknown column, 42P01 unknown table,
 * 42883/PGRST202/PGRST204 unknown function or stale schema cache), plus the
 * names this work package introduces for drivers that report without a code.
 */
export function isMissingClanRework(
  error: SupabaseErrorLike | null | undefined
): boolean {
  if (!error) return false;
  if (
    error.code === '42P01' ||
    error.code === '42703' ||
    error.code === '42883' ||
    error.code === 'PGRST202' ||
    error.code === 'PGRST204'
  ) {
    return true;
  }
  return /clan_week_pairings|clan_rivalries|clan_laurels|clan_membership_history|invite_code|disbanded_at|found_clan|join_clan_by_code|leave_clan|remove_clan_member|transfer_clan_ownership|rotate_clan_invite_code|set_clan_heraldry|apply_clan_week_pairings|settle_clan_week_pairings|clan_tenure_since/i.test(
    error.message || ''
  );
}

function report(scope: string, error: unknown, extra: Record<string, unknown>) {
  console.error(`Clan ${scope} failed:`, { ...extra, error });
  Sentry.captureException(
    error instanceof Error ? error : new Error(`Clan ${scope} failed`),
    { extra: { scope, ...extra, error } }
  );
}

// ---------------------------------------------------------------------------
// Membership — the one bridge every clan path needs
// ---------------------------------------------------------------------------

export interface ClanMembership {
  clanId: string;
  role: 'owner' | 'member';
  joinedAt: string;
  /** Earliest membership start across every span, ever (Rule 6: tenure). */
  tenureSince: string;
}

/**
 * The caller's current membership, with tenure.
 *
 * `clan_members.player_id` holds an `auth.users` id (see the COMMENT migration
 * 048 puts on the column and the judgement recorded there), so this takes an
 * auth id and every caller passes one.
 */
export async function loadMembership(
  supabase: SupabaseClient,
  userId: string
): Promise<ClanMembership | null> {
  const { data, error } = await supabase
    .from('clan_members')
    .select('clan_id, role, joined_at')
    .eq('player_id', userId)
    .maybeSingle();

  if (error) {
    if (!isMissingClanRework(error)) report('membership read', error, { userId });
    return null;
  }
  if (!data) return null;

  const clanId = String(data.clan_id ?? '');
  const joinedAt = String(data.joined_at ?? '');
  let tenureSince = joinedAt;

  // Tenure spans an arbitrary number of leave/rejoin cycles (F-7's fix).
  const { data: history, error: historyError } = await supabase
    .from('clan_membership_history')
    .select('joined_at')
    .eq('clan_id', clanId)
    .eq('player_id', userId)
    .order('joined_at', { ascending: true })
    .limit(1);
  if (historyError) {
    if (!isMissingClanRework(historyError)) {
      report('tenure read', historyError, { userId, clanId });
    }
  } else {
    const earliest = (history ?? [])[0] as { joined_at?: string } | undefined;
    if (earliest?.joined_at && earliest.joined_at < tenureSince) {
      tenureSince = earliest.joined_at;
    }
  }

  return {
    clanId,
    role: data.role === 'owner' ? 'owner' : 'member',
    joinedAt,
    tenureSince,
  };
}

// ---------------------------------------------------------------------------
// The directory — short and alive, never long and dead (§9.2)
// ---------------------------------------------------------------------------

export interface ClanDirectoryEntry {
  id: string;
  name: string;
  tag: string | null;
  bannerId: string | null;
  emblemId: string | null;
  colorPrimary: string | null;
  memberCount: number;
  maxMembers: number;
  /** The clan's best week, so the entry says something true about it. */
  bestWeekDepth: number;
  /** Did it hunt this week or last? Only alive clans are listed at all. */
  lastHuntedWeek: string | null;
}

/**
 * Clans that hunted this week or last, and nothing else.
 *
 * §9.2: "There is no browse-empty-directory dead end: the directory shows only
 * clans that hunted this week or last, so it is short and alive rather than
 * long and dead. Total-population counts are never displayed anywhere."
 *
 * The second sentence is why this function returns an ARRAY and no total, and
 * why no caller can ask it for one: there is no `count` in the query and no
 * field on the response to put one in. A directory that says "3 of 412 clans"
 * has told a new player the thing §9.2 forbids telling them.
 *
 * A newly founded clan of one that has not hunted yet is deliberately absent —
 * it appears the moment its first week settles. Founding does not need the
 * directory (the founder is already in their clan), and joining needs an
 * invite code, so nothing is lost and the list stays honest.
 */
export async function loadClanDirectory(
  supabase: SupabaseClient,
  limit = 50
): Promise<ClanDirectoryEntry[]> {
  const { data: weeks, error: weekError } = await supabase
    .from('serpent_weeks')
    .select('id, week_start')
    .order('week_start', { ascending: false })
    .limit(DIRECTORY_ALIVE_WEEKS);
  if (weekError) {
    if (!isMissingClanRework(weekError)) report('directory week scan', weekError, {});
    return [];
  }

  const weekRows = (weeks ?? []) as Array<Record<string, unknown>>;
  const weekIds = weekRows.map((row) => String(row.id ?? ''));
  const weekStartById = new Map(
    weekRows.map((row) => [String(row.id ?? ''), String(row.week_start ?? '').slice(0, 10)])
  );
  if (weekIds.length === 0) return [];

  const { data: hunted, error: huntedError } = await supabase
    .from('serpent_week_clans')
    .select('clan_id, week_id, depth')
    .in('week_id', weekIds);
  if (huntedError) {
    if (!isMissingClanRework(huntedError)) report('directory hunt scan', huntedError, {});
    return [];
  }

  const lastHuntedByClan = new Map<string, string>();
  for (const row of (hunted ?? []) as Array<Record<string, unknown>>) {
    if (Number(row.depth ?? 0) <= 0) continue;
    const clanId = String(row.clan_id ?? '');
    const weekStart = weekStartById.get(String(row.week_id ?? '')) ?? '';
    const current = lastHuntedByClan.get(clanId);
    if (!current || weekStart > current) lastHuntedByClan.set(clanId, weekStart);
  }

  const clanIds = Array.from(lastHuntedByClan.keys());
  if (clanIds.length === 0) return [];

  const { data: clans, error: clanError } = await supabase
    .from('clans')
    .select(
      'id, name, tag, banner_id, emblem_id, color_primary, member_count, max_members, best_week_depth, disbanded_at'
    )
    .in('id', clanIds)
    .is('disbanded_at', null)
    .limit(limit);
  if (clanError) {
    if (!isMissingClanRework(clanError)) report('directory clan read', clanError, {});
    return [];
  }

  return ((clans ?? []) as Array<Record<string, unknown>>)
    .map((row) => ({
      id: String(row.id ?? ''),
      name: String(row.name ?? ''),
      tag: (row.tag as string | null) ?? null,
      bannerId: (row.banner_id as string | null) ?? null,
      emblemId: (row.emblem_id as string | null) ?? null,
      colorPrimary: (row.color_primary as string | null) ?? null,
      memberCount: Number(row.member_count ?? 0),
      maxMembers: Number(row.max_members ?? CLAN_LIMITS.maxMembers),
      bestWeekDepth: Number(row.best_week_depth ?? 0),
      lastHuntedWeek: lastHuntedByClan.get(String(row.id ?? '')) ?? null,
    }))
    .sort(
      (a, b) =>
        (b.lastHuntedWeek ?? '').localeCompare(a.lastHuntedWeek ?? '') ||
        b.bestWeekDepth - a.bestWeekDepth ||
        a.name.localeCompare(b.name)
    );
}

// ---------------------------------------------------------------------------
// Pairing — the layer (§9.4)
// ---------------------------------------------------------------------------

/**
 * Build the week's pairing candidates: every alive clan, with its size and its
 * trailing-four-week activity, plus the standing rival it would prefer.
 *
 * A clan is a candidate only if it has hunted at least once in the trailing
 * window. That is not a qualification bar — an unpaired clan loses nothing and
 * is told nothing — it is walkover protection: pairing a clan that has not
 * played in a month against one that has is the "walkover, which is worse than
 * no competition" §9.4 opens by rejecting.
 */
export async function loadPairingCandidates(
  supabase: SupabaseClient,
  currentWeekId: string
): Promise<ClanPairingCandidate[]> {
  const { data: weeks, error: weekError } = await supabase
    .from('serpent_weeks')
    .select('id, week_start')
    .neq('id', currentWeekId)
    .order('week_start', { ascending: false })
    .limit(CLAN_ACTIVITY_WINDOW_WEEKS);
  if (weekError) {
    if (!isMissingClanRework(weekError)) report('pairing week scan', weekError, {});
    return [];
  }

  const weekIds = ((weeks ?? []) as Array<Record<string, unknown>>).map((row) =>
    String(row.id ?? '')
  );
  if (weekIds.length === 0) return [];

  const { data: activity, error: activityError } = await supabase
    .from('serpent_week_clans')
    .select('clan_id, week_id, depth')
    .in('week_id', weekIds);
  if (activityError) {
    if (!isMissingClanRework(activityError)) {
      report('pairing activity scan', activityError, {});
    }
    return [];
  }

  const weeksActive = new Map<string, Set<string>>();
  for (const row of (activity ?? []) as Array<Record<string, unknown>>) {
    if (Number(row.depth ?? 0) <= 0) continue;
    const clanId = String(row.clan_id ?? '');
    const set = weeksActive.get(clanId) ?? new Set<string>();
    set.add(String(row.week_id ?? ''));
    weeksActive.set(clanId, set);
  }

  const clanIds = Array.from(weeksActive.keys());
  if (clanIds.length === 0) return [];

  const { data: clans, error: clanError } = await supabase
    .from('clans')
    .select('id, member_count, disbanded_at')
    .in('id', clanIds)
    .is('disbanded_at', null);
  if (clanError) {
    if (!isMissingClanRework(clanError)) report('pairing clan read', clanError, {});
    return [];
  }

  const alive = ((clans ?? []) as Array<Record<string, unknown>>).map((row) => ({
    clanId: String(row.id ?? ''),
    memberCount: Number(row.member_count ?? 1),
  }));
  const aliveIds = new Set(alive.map((entry) => entry.clanId));

  // Standing rivals: prefer the derby, unless either side declined at a
  // season boundary (§9.4 — silently, no forfeit recorded).
  const standingRival = new Map<string, string>();
  const { data: rivalries, error: rivalryError } = await supabase
    .from('clan_rivalries')
    .select('clan_low_id, clan_high_id, last_paired_at, declined_at')
    .is('declined_at', null);
  if (rivalryError) {
    if (!isMissingClanRework(rivalryError)) report('rivalry read', rivalryError, {});
  } else {
    const ordered = ((rivalries ?? []) as Array<Record<string, unknown>>)
      .slice()
      .sort((a, b) =>
        String(b.last_paired_at ?? '').localeCompare(String(a.last_paired_at ?? ''))
      );
    for (const row of ordered) {
      const low = String(row.clan_low_id ?? '');
      const high = String(row.clan_high_id ?? '');
      if (!aliveIds.has(low) || !aliveIds.has(high)) continue;
      if (standingRival.has(low) || standingRival.has(high)) continue;
      standingRival.set(low, high);
      standingRival.set(high, low);
    }
  }

  return alive.map((entry) => ({
    clanId: entry.clanId,
    memberCount: entry.memberCount,
    weeksActive: weeksActive.get(entry.clanId)?.size ?? 0,
    standingRivalId: standingRival.get(entry.clanId) ?? null,
  }));
}

/**
 * Pair the current week, idempotently.
 *
 * `apply_clan_week_pairings` is `ON CONFLICT DO NOTHING`, so the first pairing
 * of a week is the pairing of that week — a second call, a retry or a concurrent
 * request cannot move anyone's rival out from under them mid-week.
 */
export async function ensureClanWeekPairings(
  supabase: SupabaseClient,
  weekId: string
): Promise<{ paired: number; skipped: boolean }> {
  const candidates = await loadPairingCandidates(supabase, weekId);
  if (candidates.length < 2) return { paired: 0, skipped: false };

  const { pairs } = pairClanWeek(candidates);
  if (pairs.length === 0) return { paired: 0, skipped: false };

  const { data, error } = await supabase.rpc('apply_clan_week_pairings', {
    p_week_id: weekId,
    p_pairs: pairs.map((pair) => ({
      clan_a_id: pair.clanAId,
      clan_b_id: pair.clanBId,
      size_band: pair.sizeBand,
      activity_band: pair.activityBand,
      standing_rival: pair.standingRival,
    })),
  });

  if (error) {
    if (isMissingClanRework(error)) return { paired: 0, skipped: true };
    report('pairing apply', error, { weekId, pairs: pairs.length });
    return { paired: 0, skipped: false };
  }

  const summary = (data ?? {}) as Record<string, unknown>;
  return { paired: Number(summary.paired ?? 0), skipped: false };
}

export interface ClanWeekSettlementResult {
  weekId: string;
  weekStart: string;
  settled: number;
  laurels: number;
  chronicleEntries: number;
  failed: boolean;
}

/**
 * Settle every submerged week's pairings.
 *
 * Runs after `settleDueSerpentWeeks` on the same cron, over the same set of
 * settleable weeks, because the Depth it compares is the Depth that settlement
 * just wrote. Idempotent for the same reason WP-1.01's settlement is: nothing
 * increments, everything recomputes.
 */
export async function settleDueClanWeeks(
  supabase: SupabaseClient,
  now: Date | number = Date.now()
): Promise<{ settled: ClanWeekSettlementResult[]; skipped: boolean; failed: boolean }> {
  const { weeks, skipped } = await loadSettleableSerpentWeeks(supabase, now);
  if (skipped) return { settled: [], skipped: true, failed: false };

  const settled: ClanWeekSettlementResult[] = [];
  let failed = false;

  for (const week of weeks) {
    const result = await settleClanWeek(supabase, week);
    if (result) {
      settled.push(result);
      if (result.failed) failed = true;
    }
  }

  return { settled, skipped: false, failed };
}

async function settleClanWeek(
  supabase: SupabaseClient,
  week: SerpentWeekRow
): Promise<ClanWeekSettlementResult | null> {
  const { data, error } = await supabase.rpc('settle_clan_week_pairings', {
    p_week_id: week.id,
  });

  if (error) {
    if (isMissingClanRework(error)) return null;
    report('pairing settlement', error, { weekId: week.id });
    return {
      weekId: week.id,
      weekStart: week.weekStart,
      settled: 0,
      laurels: 0,
      chronicleEntries: 0,
      failed: true,
    };
  }

  const summary = (data ?? {}) as Record<string, unknown>;
  return {
    weekId: week.id,
    weekStart: week.weekStart,
    settled: Number(summary.settled ?? 0),
    laurels: Number(summary.laurels ?? 0),
    chronicleEntries: Number(summary.chronicle_entries ?? 0),
    failed: false,
  };
}

// ---------------------------------------------------------------------------
// The panel
// ---------------------------------------------------------------------------

export interface ClanHuntRival {
  clanId: string;
  name: string;
  tag: string | null;
  sizeBand: number;
  activityBand: number;
  standingRival: boolean;
  yourDepth: number;
  theirDepth: number;
  settled: boolean;
  /** From the caller's point of view. Null while the week is still running. */
  outcome: 'won' | 'lost' | 'draw' | null;
}

export interface ClanHuntRivalry {
  rivalClanId: string;
  name: string;
  tag: string | null;
  meetings: number;
  wins: number;
  losses: number;
  draws: number;
  /** True when the caller's clan is the one currently on a run. */
  streakIsYours: boolean;
  streakLength: number;
  closestMargin: number;
  largestMargin: number;
  firstPairedAt: string | null;
  lastPairedAt: string | null;
}

export interface ClanHuntPanel {
  live: boolean;
  clan:
    | {
        id: string;
        name: string;
        tag: string | null;
        bannerId: string | null;
        emblemId: string | null;
        colorPrimary: string | null;
        colorSecondary: string | null;
        memberCount: number;
        maxMembers: number;
        softFullMembers: number;
        inviteCode: string | null;
        disbandedAt: string | null;
      }
    | null;
  you: { role: 'owner' | 'member'; joinedAt: string; tenureSince: string } | null;
  week: { id: string; weekStart: string; startsAt: string; endsAt: string } | null;
  /**
   * §9.4's self-referential primary: the clan against its own best week. It is
   * present whenever the panel is live, with or without a rival, at every N.
   */
  primary: {
    depth: number;
    bestWeekDepth: number;
    lifetimeDepth: number;
    deltaVsBestWeek: number;
    isBestWeekSoFar: boolean;
  };
  /** Additive display (§9.2). No cut line, no minimum, no bar. */
  members: Array<{ playerId: string; handle: string | null; depth: number; attempts: number }>;
  /** Withheld by the cohort filter (§13), so the sum above stays honest. */
  hiddenMembers: number;
  rival: ClanHuntRival | null;
  rivalry: ClanHuntRivalry | null;
  laurels: number;
  /** §12.1 slot 7 — both false until the developer flips them (§9.3). */
  gates: { gauntlet: boolean; playoffs: boolean };
}

export function emptyClanHuntPanel(): ClanHuntPanel {
  return {
    live: false,
    clan: null,
    you: null,
    week: null,
    primary: {
      depth: 0,
      bestWeekDepth: 0,
      lifetimeDepth: 0,
      deltaVsBestWeek: 0,
      isBestWeekSoFar: false,
    },
    members: [],
    hiddenMembers: 0,
    rival: null,
    rivalry: null,
    laurels: 0,
    gates: { gauntlet: CLAN_GAUNTLET_ENABLED, playoffs: CLAN_PLAYOFFS_ENABLED },
  };
}

/**
 * Everything the hunt surface renders.
 *
 * `playerId` is a `players.id`; `userId` is the auth id `clan_members` keys on.
 * Both are required because the two id-spaces are genuinely different and
 * migration 048 records why they stay that way.
 *
 * THE ORDER OF THIS FUNCTION IS THE DESIGN. The primary block is filled before
 * the rival block is even looked up, and the rival block is allowed to stay
 * null. A clan of one on a week with no symmetric rival gets a complete,
 * meaningful panel — its Depth, its roster of one, its best week and the delta
 * against it — which is §9.3's "the game is complete and honest — a measurement
 * game, never an empty room".
 */
export async function buildClanHuntPanel(
  supabase: SupabaseClient,
  playerId: string,
  userId: string,
  now: Date | number = Date.now(),
  options: { enabled?: boolean } = {}
): Promise<ClanHuntPanel> {
  const panel = emptyClanHuntPanel();
  if (!(options.enabled ?? CLAN_V2_ENABLED)) return panel;

  const membership = await loadMembership(supabase, userId);
  if (!membership) return panel;

  const week = await ensureCurrentSerpentWeek(supabase, now);
  const serpent = await buildSerpentPanel(supabase, playerId, now);

  panel.live = true;
  panel.you = {
    role: membership.role,
    joinedAt: membership.joinedAt,
    tenureSince: membership.tenureSince,
  };

  const { data: clanRow, error: clanError } = await supabase
    .from('clans')
    .select(
      'id, name, tag, banner_id, emblem_id, color_primary, color_secondary, member_count, max_members, invite_code, disbanded_at'
    )
    .eq('id', membership.clanId)
    .maybeSingle();
  if (clanError) {
    if (!isMissingClanRework(clanError)) {
      report('hunt clan read', clanError, { clanId: membership.clanId });
    }
    return panel;
  }
  if (!clanRow) return panel;

  panel.clan = {
    id: String(clanRow.id ?? ''),
    name: String(clanRow.name ?? ''),
    tag: (clanRow.tag as string | null) ?? null,
    bannerId: (clanRow.banner_id as string | null) ?? null,
    emblemId: (clanRow.emblem_id as string | null) ?? null,
    colorPrimary: (clanRow.color_primary as string | null) ?? null,
    colorSecondary: (clanRow.color_secondary as string | null) ?? null,
    memberCount: Number(clanRow.member_count ?? 1),
    maxMembers: Number(clanRow.max_members ?? CLAN_LIMITS.maxMembers),
    softFullMembers: CLAN_LIMITS.softFullMembers,
    // Every member may share the way in (§9.2: invite links are THE
    // recruitment surface). Only the owner may rotate it.
    inviteCode: (clanRow.invite_code as string | null) ?? null,
    disbandedAt: (clanRow.disbanded_at as string | null) ?? null,
  };

  // ---- the primary, straight off WP-1.01's additive clan Depth ------------
  const clanBlock: SerpentPanelClan | null = serpent.clan;
  const depth = clanBlock?.depth ?? 0;
  const bestWeekDepth = clanBlock?.bestWeekDepth ?? 0;
  panel.primary = {
    depth,
    bestWeekDepth,
    lifetimeDepth: clanBlock?.lifetimeDepth ?? 0,
    deltaVsBestWeek: depth - bestWeekDepth,
    isBestWeekSoFar: depth > bestWeekDepth,
  };
  panel.members = clanBlock?.members ?? [];
  panel.hiddenMembers = clanBlock?.hiddenMembers ?? 0;

  if (week) {
    panel.week = {
      id: week.id,
      weekStart: week.weekStart,
      startsAt: week.startsAt,
      endsAt: week.endsAt,
    };
    // Pairing is lazy and idempotent: the first member of any clan to open the
    // panel this week pairs the world, and everyone after them reads it.
    await ensureClanWeekPairings(supabase, week.id);
    panel.rival = await loadRival(supabase, membership.clanId, week.id, depth);
  }

  panel.rivalry = await loadRivalryMemory(
    supabase,
    membership.clanId,
    panel.rival?.clanId ?? null
  );
  panel.laurels = await countLaurels(supabase, membership.clanId);

  return panel;
}

async function loadRival(
  supabase: SupabaseClient,
  clanId: string,
  weekId: string,
  liveDepth: number
): Promise<ClanHuntRival | null> {
  const { data, error } = await supabase
    .from('clan_week_pairings')
    .select(
      'clan_a_id, clan_b_id, size_band, activity_band, standing_rival, depth_a, depth_b, outcome, settled_at'
    )
    .eq('week_id', weekId)
    .or(`clan_a_id.eq.${clanId},clan_b_id.eq.${clanId}`)
    .maybeSingle();

  if (error) {
    if (!isMissingClanRework(error)) report('rival read', error, { clanId, weekId });
    return null;
  }
  if (!data) return null;

  const youAreA = String(data.clan_a_id ?? '') === clanId;
  const rivalClanId = youAreA ? String(data.clan_b_id ?? '') : String(data.clan_a_id ?? '');
  if (!rivalClanId) return null;

  const { data: rivalRow, error: rivalError } = await supabase
    .from('clans')
    .select('id, name, tag')
    .eq('id', rivalClanId)
    .maybeSingle();
  if (rivalError) {
    if (!isMissingClanRework(rivalError)) report('rival clan read', rivalError, { rivalClanId });
    return null;
  }

  const settled = Boolean(data.settled_at);
  const settledYours = Number((youAreA ? data.depth_a : data.depth_b) ?? 0);
  const settledTheirs = Number((youAreA ? data.depth_b : data.depth_a) ?? 0);
  const rawOutcome = (data.outcome as string | null) ?? null;

  let outcome: ClanHuntRival['outcome'] = null;
  if (settled && rawOutcome) {
    if (rawOutcome === 'draw') outcome = 'draw';
    else if ((rawOutcome === 'a') === youAreA) outcome = 'won';
    else outcome = 'lost';
  }

  return {
    clanId: rivalClanId,
    name: String(rivalRow?.name ?? ''),
    tag: (rivalRow?.tag as string | null) ?? null,
    sizeBand: Number(data.size_band ?? clanSizeBand(1)),
    activityBand: Number(data.activity_band ?? clanActivityBand(0)),
    standingRival: Boolean(data.standing_rival),
    // Mid-week the caller's own number is the live fold; the rival's settled
    // number is 0 until Sunday, which is honest — nobody's week is over yet.
    yourDepth: settled ? settledYours : liveDepth,
    theirDepth: settledTheirs,
    settled,
    outcome,
  };
}

async function loadRivalryMemory(
  supabase: SupabaseClient,
  clanId: string,
  rivalClanId: string | null
): Promise<ClanHuntRivalry | null> {
  const query = supabase
    .from('clan_rivalries')
    .select(
      'clan_low_id, clan_high_id, meetings, wins_low, wins_high, draws, streak_clan_id, streak_length, closest_margin, largest_margin, first_paired_at, last_paired_at'
    );

  // With a rival this week, show that rivalry. Without one, show the standing
  // one — §9.4's memory outlives any single week, and a clan whose derby is
  // paused should still see the record it built.
  const { data, error } = rivalClanId
    ? await query
        .eq('clan_low_id', rivalryKey(clanId, rivalClanId)[0])
        .eq('clan_high_id', rivalryKey(clanId, rivalClanId)[1])
        .maybeSingle()
    : await query
        .or(`clan_low_id.eq.${clanId},clan_high_id.eq.${clanId}`)
        .order('last_paired_at', { ascending: false })
        .limit(1)
        .maybeSingle();

  if (error) {
    if (!isMissingClanRework(error)) report('rivalry memory read', error, { clanId });
    return null;
  }
  if (!data) return null;

  const low = String(data.clan_low_id ?? '');
  const high = String(data.clan_high_id ?? '');
  const youAreLow = low === clanId;
  const otherId = youAreLow ? high : low;

  const { data: otherRow, error: otherError } = await supabase
    .from('clans')
    .select('id, name, tag')
    .eq('id', otherId)
    .maybeSingle();
  if (otherError && !isMissingClanRework(otherError)) {
    report('rivalry clan read', otherError, { otherId });
  }

  return {
    rivalClanId: otherId,
    name: String(otherRow?.name ?? ''),
    tag: (otherRow?.tag as string | null) ?? null,
    meetings: Number(data.meetings ?? 0),
    wins: Number((youAreLow ? data.wins_low : data.wins_high) ?? 0),
    losses: Number((youAreLow ? data.wins_high : data.wins_low) ?? 0),
    draws: Number(data.draws ?? 0),
    streakIsYours: String(data.streak_clan_id ?? '') === clanId,
    streakLength: Number(data.streak_length ?? 0),
    closestMargin: Number(data.closest_margin ?? 0),
    largestMargin: Number(data.largest_margin ?? 0),
    firstPairedAt: (data.first_paired_at as string | null) ?? null,
    lastPairedAt: (data.last_paired_at as string | null) ?? null,
  };
}

async function countLaurels(supabase: SupabaseClient, clanId: string): Promise<number> {
  const { count, error } = await supabase
    .from('clan_laurels')
    .select('clan_id', { count: 'exact', head: true })
    .eq('clan_id', clanId);
  if (error) {
    if (!isMissingClanRework(error)) report('laurel count', error, { clanId });
    return 0;
  }
  return Number(count ?? 0);
}

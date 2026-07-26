/**
 * The World Serpent — server authority (Constitution §7.3, §6.2, Rule 11).
 *
 * Four jobs, and nothing else:
 *
 *   `ensureCurrentSerpentWeek`  derive this week from the UTC calendar and
 *                               make it a row. The server-resolved id that
 *                               WP-0.01's charge exemption has been waiting
 *                               for.
 *   `loadSerpentWeekRuns`       read the week's attempts under the eligibility
 *                               predicates — gate one of two.
 *   `settleDueSerpentWeeks`     the Sunday-midnight settlement. Idempotent.
 *   `buildSerpentPanel`         everything the panel (WP-1.07) renders.
 *
 * THE TWO GATES (WP-0.05's shape, and why it is worth the duplication)
 *
 * `loadSerpentWeekRuns` filters in the query AND `isDepthEligibleRun` re-applies
 * every predicate in the pure fold. A dropped `.eq`, a renamed column or a
 * driver quirk therefore cannot leak an unsettled, unvalidated or foreign-week
 * run into a public number — the fold refuses it a second time, in code that
 * has no database in it to be wrong about.
 *
 * DEPTH READS `yield_dna`, NEVER `dna_earned`
 *
 * §8.6: "all Serpent attempts consume no Energy; Depth always counts
 * full-strength Yield regardless of charge state." `yield_dna` is the
 * full-strength number WP-0.01 records separately at settlement; `dna_earned`
 * is what the run actually paid after the lean factor. Depth reads the former,
 * so a player who spent their six charges before the hunt hunts at full depth.
 * `serpent.test.ts` pins that this module never selects `dna_earned`.
 *
 * PRE-MIGRATION-046 SAFE
 *
 * Until 046 applies, none of the tables, columns or RPCs exist.
 * `isMissingSerpentInfra` recognises that and every entry point degrades to
 * "the Serpent is not live" — which is exactly what it is. The degradation
 * direction is deliberately the CLOSED one: with no week row there is no
 * server-resolved id, so no run can obtain a charge exemption by asking.
 *
 * Rule 11: every Supabase `error` is checked and reported to Sentry.
 */

import * as Sentry from '@sentry/nextjs';
import type { SupabaseClient } from '@supabase/supabase-js';
import {
  describeSerpentWeek,
  describeSerpentModifier,
  foldPlayerDepth,
  isAnomalyId,
  isDepthEligibleRun,
  serpentWeekHasEnded,
  settleSerpentWeek,
  SERPENT_COUNTED_RUNS,
  type SerpentClanDepth,
  type SerpentModifier,
  type SerpentPlayerDepth,
  type SerpentRunRow,
} from '@/shared/game/serpent';
import { SERPENT_V1_ENABLED } from '@/lib/serpent/config';
import { isPublicCohort } from '@/lib/cohort/cohort';

interface SupabaseErrorLike {
  code?: string;
  message?: string;
}

/**
 * Is this failure just "migration 046 has not been applied here yet"?
 *
 * 42703 unknown column, 42P01 unknown table, 42883/PGRST202/PGRST204 unknown
 * function or unknown column in the PostgREST schema cache. The name test
 * catches drivers that report the same thing without a code.
 */
export function isMissingSerpentInfra(
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
  return /serpent_week|serpent_weeks|serpent_chronicle|ensure_serpent_week|apply_serpent_week_settlement|lifetime_depth|best_week_depth/i.test(
    error.message || ''
  );
}

function report(scope: string, error: unknown, extra: Record<string, unknown>) {
  console.error(`Serpent ${scope} failed:`, { ...extra, error });
  Sentry.captureException(
    error instanceof Error ? error : new Error(`Serpent ${scope} failed`),
    { extra: { scope, ...extra, error } }
  );
}

// ---------------------------------------------------------------------------
// The week
// ---------------------------------------------------------------------------

/** A Serpent week once the database has given it an id. */
export interface SerpentWeekRow {
  id: string;
  weekStart: string;
  startsAt: string;
  endsAt: string;
  seed: string;
  modifiers: SerpentModifier[];
  settledAt: string | null;
}

function toWeekRow(row: Record<string, unknown> | null): SerpentWeekRow | null {
  if (!row || typeof row.id !== 'string') return null;
  const rawModifiers = Array.isArray(row.modifiers) ? row.modifiers : [];
  return {
    id: row.id,
    weekStart: String(row.week_start ?? '').slice(0, 10),
    startsAt: String(row.starts_at ?? ''),
    endsAt: String(row.ends_at ?? ''),
    seed: String(row.seed ?? ''),
    modifiers: rawModifiers
      .filter(isAnomalyId)
      .map((id) => describeSerpentModifier(id)),
    settledAt: (row.settled_at as string | null) ?? null,
  };
}

/**
 * Resolve — and if necessary create — the Serpent week containing `now`.
 *
 * Every field is derived by `describeSerpentWeek` from the UTC calendar. The
 * request never contributes a byte: there is no parameter on this function
 * through which a client value could travel (Rule 11). The RPC refuses to
 * change a week that already exists, so two concurrent Monday-morning run
 * starts cannot produce two seeds.
 *
 * Returns null when the Serpent is not live — flag off, migration not applied,
 * or the RPC failed. Null is the CLOSED direction: no id means no charge
 * exemption and no run flagging.
 */
export async function ensureCurrentSerpentWeek(
  supabase: SupabaseClient,
  now: Date | number = Date.now(),
  options: { enabled?: boolean } = {}
): Promise<SerpentWeekRow | null> {
  if (!(options.enabled ?? SERPENT_V1_ENABLED)) return null;

  const week = describeSerpentWeek(now);
  const { data, error } = await supabase.rpc('ensure_serpent_week', {
    p_week_start: week.weekStart,
    p_starts_at: week.startsAt,
    p_ends_at: week.endsAt,
    p_seed: week.seed,
    p_modifiers: week.modifiers,
  });

  if (error) {
    if (!isMissingSerpentInfra(error)) {
      report('week resolution', error, { weekStart: week.weekStart });
    }
    return null;
  }

  const row = Array.isArray(data) ? data[0] : data;
  return toWeekRow((row ?? null) as Record<string, unknown> | null);
}

/**
 * One week, by the id a session row already carries.
 *
 * The read half of `ensureCurrentSerpentWeek`: it resolves nothing, creates
 * nothing and takes no clock — the caller has a `serpent_week_id` the server
 * stamped at start, and this returns the week that id names. Settlement uses
 * it to recover the condition-set a finished run was played under, which the
 * calendar alone could no longer answer once a week has passed.
 *
 * Null when the id names nothing, when migration 046 is not applied, or when
 * the read failed. Null is the CLOSED direction here too: no week means no
 * condition, which is the condition-free recompute the game had before.
 */
export async function loadSerpentWeekById(
  supabase: SupabaseClient,
  weekId: string
): Promise<SerpentWeekRow | null> {
  const { data, error } = await supabase
    .from('serpent_weeks')
    .select('id, week_start, starts_at, ends_at, seed, modifiers, settled_at')
    .eq('id', weekId)
    .maybeSingle();

  if (error) {
    if (!isMissingSerpentInfra(error)) report('week lookup', error, { weekId });
    return null;
  }

  return toWeekRow((data ?? null) as Record<string, unknown> | null);
}

/**
 * How long after a week submerges it stays settleable.
 *
 * A run that settled but whose reward write failed is replayed by the offline
 * outbox for up to seven days (`STALE_PENDING_SETTLEMENT_MINUTES`, WP-0.06).
 * That replay writes a real `yield_dna` onto a real Serpent attempt, and Rule 6
 * says the Depth it earned is the player's. So a week keeps being re-settled
 * for eight days after it ends, one day past the outbox's own horizon.
 *
 * Re-settling is free precisely because settlement is a recompute clamped with
 * GREATEST: a late arrival can raise a Depth and can never lower one, and a
 * week with no late arrivals recomputes to exactly what is already stored.
 */
export const SERPENT_RESETTLE_WINDOW_MS = 8 * 24 * 60 * 60 * 1000;

/**
 * Every week that has submerged and is still settleable — unsettled, or
 * settled recently enough that a late run could still belong to it.
 */
export async function loadSettleableSerpentWeeks(
  supabase: SupabaseClient,
  now: Date | number = Date.now()
): Promise<{ weeks: SerpentWeekRow[]; skipped: boolean }> {
  const nowMs = new Date(now).getTime();
  const resettleCutoff = new Date(nowMs - SERPENT_RESETTLE_WINDOW_MS).toISOString();

  const { data, error } = await supabase
    .from('serpent_weeks')
    .select('id, week_start, starts_at, ends_at, seed, modifiers, settled_at')
    .or(`settled_at.is.null,ends_at.gte.${resettleCutoff}`)
    .lte('ends_at', new Date(nowMs).toISOString())
    .order('week_start', { ascending: true });

  if (error) {
    if (isMissingSerpentInfra(error)) return { weeks: [], skipped: true };
    report('settleable week scan', error, {});
    return { weeks: [], skipped: false };
  }

  const weeks = ((data ?? []) as Array<Record<string, unknown>>)
    .map(toWeekRow)
    .filter((week): week is SerpentWeekRow => week !== null)
    // Gate two: re-apply the "has submerged" predicate in code, so a bad
    // `lte` bound can never settle a week that is still being hunted.
    .filter((week) => serpentWeekHasEnded(week, now));

  return { weeks, skipped: false };
}

// ---------------------------------------------------------------------------
// The runs — gate one of two
// ---------------------------------------------------------------------------

/**
 * The week's attempts, filtered in the query.
 *
 * `select` names `yield_dna` and never `dna_earned`: Depth is charge-blind by
 * law, and the safest way to keep it that way is for the lean number never to
 * be read into this module at all.
 */
export async function loadSerpentWeekRuns(
  supabase: SupabaseClient,
  weekId: string
): Promise<{ runs: SerpentRunRow[]; skipped: boolean; failed: boolean }> {
  const { data, error } = await supabase
    .from('game_sessions')
    .select(
      'id, player_id, serpent_week_id, yield_dna, ended_at, end_reason, validated, is_free_play'
    )
    .eq('serpent_week_id', weekId)
    .not('ended_at', 'is', null)
    .gt('yield_dna', 0);

  if (error) {
    if (isMissingSerpentInfra(error)) return { runs: [], skipped: true, failed: false };
    report('week run scan', error, { weekId });
    return { runs: [], skipped: false, failed: true };
  }

  const runs: SerpentRunRow[] = ((data ?? []) as Array<Record<string, unknown>>).map(
    (row) => ({
      sessionId: String(row.id ?? ''),
      playerId: String(row.player_id ?? ''),
      serpentWeekId: (row.serpent_week_id as string | null) ?? null,
      yieldDna:
        typeof row.yield_dna === 'number'
          ? row.yield_dna
          : row.yield_dna === null || row.yield_dna === undefined
            ? null
            : Number(row.yield_dna),
      endedAt: (row.ended_at as string | null) ?? null,
      endReason: (row.end_reason as string | null) ?? null,
      validated: (row.validated as boolean | null) ?? null,
      isFreePlay: (row.is_free_play as boolean | null) ?? null,
    })
  );

  // Gate two: the pure predicate re-applied to whatever came back.
  return {
    runs: runs.filter((run) => isDepthEligibleRun(run, weekId)),
    skipped: false,
    failed: false,
  };
}

// ---------------------------------------------------------------------------
// Clan membership
// ---------------------------------------------------------------------------

/**
 * Map `players.id` -> `clans.id`, via the auth user id `clan_members` keys on.
 *
 * Read once, at settlement, and then frozen onto the settled row: a member who
 * leaves afterwards never retroactively removes Depth the clan already reached
 * (Rule 6). Nothing here reads a role — there is no officer lever anywhere in
 * this work package, and the roster is never graded (Rule 8).
 */
export async function loadClanByPlayer(
  supabase: SupabaseClient,
  playerIds: readonly string[]
): Promise<Map<string, string | null>> {
  const result = new Map<string, string | null>();
  if (playerIds.length === 0) return result;

  const { data: playerRows, error: playerError } = await supabase
    .from('players')
    .select('id, user_id')
    .in('id', playerIds as string[]);

  if (playerError) {
    if (!isMissingSerpentInfra(playerError)) {
      report('clan membership player lookup', playerError, {
        players: playerIds.length,
      });
    }
    return result;
  }

  const userIdByPlayer = new Map<string, string>();
  for (const row of (playerRows ?? []) as Array<Record<string, unknown>>) {
    const id = row.id as string | undefined;
    const userId = row.user_id as string | null | undefined;
    if (!id) continue;
    result.set(id, null);
    if (userId) userIdByPlayer.set(id, userId);
  }

  const userIds = Array.from(userIdByPlayer.values());
  if (userIds.length === 0) return result;

  const { data: memberRows, error: memberError } = await supabase
    .from('clan_members')
    .select('player_id, clan_id')
    .in('player_id', userIds);

  if (memberError) {
    if (!isMissingSerpentInfra(memberError)) {
      report('clan membership lookup', memberError, { users: userIds.length });
    }
    return result;
  }

  const clanByUser = new Map<string, string>();
  for (const row of (memberRows ?? []) as Array<Record<string, unknown>>) {
    const userId = row.player_id as string | undefined;
    const clanId = row.clan_id as string | undefined;
    if (userId && clanId) clanByUser.set(userId, clanId);
  }

  for (const [playerId, userId] of Array.from(userIdByPlayer.entries())) {
    result.set(playerId, clanByUser.get(userId) ?? null);
  }
  return result;
}

// ---------------------------------------------------------------------------
// Settlement
// ---------------------------------------------------------------------------

export interface SerpentSettlementResult {
  weekId: string;
  weekStart: string;
  players: number;
  clans: number;
  chronicleEntries: number;
  /** True when the week could not be settled and must be retried. */
  failed: boolean;
}

/**
 * Settle one week: an EXACT SERVER RECOMPUTE (Rule 11).
 *
 * Nothing is carried forward from a previous attempt. The week's Depth is
 * recomputed from the session rows every time, so a re-run after a partial
 * failure converges on the same answer rather than compounding one.
 *
 * The write is one RPC, one transaction, and every number it stores is either
 * a recompute or `GREATEST(existing, recompute)`. Running this twice produces
 * the same Depth — the acceptance criterion, guaranteed by the absence of a
 * single `+=` on either side of the boundary.
 */
export async function settleSerpentWeekRow(
  supabase: SupabaseClient,
  week: SerpentWeekRow
): Promise<SerpentSettlementResult> {
  const base = {
    weekId: week.id,
    weekStart: week.weekStart,
    players: 0,
    clans: 0,
    chronicleEntries: 0,
    failed: false,
  };

  const { runs, skipped, failed } = await loadSerpentWeekRuns(supabase, week.id);
  if (skipped) return base;
  if (failed) return { ...base, failed: true };

  const playerIds = Array.from(new Set(runs.map((run) => run.playerId)));
  const clanByPlayer = await loadClanByPlayer(supabase, playerIds);
  const settlement = settleSerpentWeek(week.id, runs, clanByPlayer, playerIds);

  const payload = settlement.players.map((player) => ({
    player_id: player.playerId,
    clan_id: player.clanId,
    depth: player.depth,
    attempts: player.attempts,
    best_yield: player.bestYield,
    counted_yields: player.countedYields,
  }));

  const { data, error } = await supabase.rpc('apply_serpent_week_settlement', {
    p_week_id: week.id,
    p_players: payload,
  });

  if (error) {
    if (isMissingSerpentInfra(error)) return base;
    report('settlement apply', error, { weekId: week.id, players: payload.length });
    return { ...base, failed: true };
  }

  const summary = (data ?? {}) as Record<string, unknown>;
  return {
    ...base,
    players: Number(summary.players ?? settlement.players.length),
    clans: Number(summary.clans ?? settlement.clans.length),
    chronicleEntries: Number(summary.chronicle_entries ?? 0),
  };
}

export interface SerpentCronResult {
  settled: SerpentSettlementResult[];
  /** True when migration 046 is not applied — expected, not an error. */
  skipped: boolean;
  /** True when at least one week failed and must be retried next run. */
  failed: boolean;
}

/**
 * The Sunday-midnight settlement, as the cron runs it.
 *
 * Settles EVERY submerged week that is still settleable, not just the most
 * recent one — and keeps re-settling a week for `SERPENT_RESETTLE_WINDOW_MS`
 * so a run replayed late by the offline outbox still reaches the Depth it
 * earned (Rule 6). A missed cron, a failed deploy or an outage therefore
 * converges on the next run instead of stranding a week forever: Rule 5's
 * promise that absence costs nothing applies to the operator's absence too.
 */
export async function settleDueSerpentWeeks(
  supabase: SupabaseClient,
  now: Date | number = Date.now()
): Promise<SerpentCronResult> {
  const { weeks, skipped } = await loadSettleableSerpentWeeks(supabase, now);
  if (skipped) return { settled: [], skipped: true, failed: false };

  const settled: SerpentSettlementResult[] = [];
  let failed = false;
  for (const week of weeks) {
    const result = await settleSerpentWeekRow(supabase, week);
    settled.push(result);
    if (result.failed) failed = true;
  }

  return { settled, skipped: false, failed };
}

// ---------------------------------------------------------------------------
// The panel
// ---------------------------------------------------------------------------

export interface SerpentPanelMember {
  playerId: string;
  handle: string | null;
  depth: number;
  attempts: number;
}

export interface SerpentPanelClan {
  id: string;
  name: string;
  tag: string | null;
  memberCount: number;
  depth: number;
  bestWeekDepth: number;
  lifetimeDepth: number;
  members: SerpentPanelMember[];
  /** Members withheld by the cohort filter (§13). Keeps the sum honest. */
  hiddenMembers: number;
}

export interface SerpentPanelHistoryEntry {
  weekStart: string;
  depth: number;
  clanDepth: number | null;
}

export interface SerpentPanelChronicleEntry {
  kind: string;
  weekStart: string;
  depth: number;
  previousDepth: number;
  at: string;
}

export interface SerpentPanel {
  live: boolean;
  week: {
    id: string;
    weekStart: string;
    startsAt: string;
    endsAt: string;
    seed: string;
    modifiers: SerpentModifier[];
    settledAt: string | null;
  } | null;
  you: {
    depth: number;
    attempts: number;
    bestYield: number;
    countedYields: number[];
    countedRuns: number;
    bestWeekDepth: number;
    lifetimeDepth: number;
    /** This week minus your best week. The §7.3 headline comparison. */
    deltaVsBestWeek: number;
  };
  clan: SerpentPanelClan | null;
  history: SerpentPanelHistoryEntry[];
  chronicle: SerpentPanelChronicleEntry[];
}

/** The shape a flag-off, pre-migration or Serpent-less player sees. */
export function emptySerpentPanel(): SerpentPanel {
  return {
    live: false,
    week: null,
    you: {
      depth: 0,
      attempts: 0,
      bestYield: 0,
      countedYields: [],
      countedRuns: SERPENT_COUNTED_RUNS,
      bestWeekDepth: 0,
      lifetimeDepth: 0,
      deltaVsBestWeek: 0,
    },
    clan: null,
    history: [],
    chronicle: [],
  };
}

const HISTORY_WEEKS = 12;
const CHRONICLE_ENTRIES = 10;

/**
 * Everything the hunt panel renders (§7.3: "you vs your best week, then the
 * clan vs its best week").
 *
 * The CURRENT week is folded live from the session rows, so the panel is
 * meaningful mid-week and not only after Sunday. It uses the same pure fold
 * settlement uses, which is why the mid-week number and the settled number
 * cannot disagree.
 *
 * There is no cut line, no minimum and no bar in this payload, and no field a
 * surface could render as one. `contributingMembers` is a count, not a
 * requirement; `hiddenMembers` exists so a cohort-filtered roster still sums
 * to the clan's real Depth instead of quietly under-reporting it.
 */
export async function buildSerpentPanel(
  supabase: SupabaseClient,
  playerId: string,
  now: Date | number = Date.now(),
  options: { enabled?: boolean } = {}
): Promise<SerpentPanel> {
  const week = await ensureCurrentSerpentWeek(supabase, now, options);
  if (!week) return emptySerpentPanel();

  const panel = emptySerpentPanel();
  panel.live = true;
  panel.week = {
    id: week.id,
    weekStart: week.weekStart,
    startsAt: week.startsAt,
    endsAt: week.endsAt,
    seed: week.seed,
    modifiers: week.modifiers,
    settledAt: week.settledAt,
  };

  const clanByPlayer = await loadClanByPlayer(supabase, [playerId]);
  const clanId = clanByPlayer.get(playerId) ?? null;

  // ---- this week, folded live from the session rows ----------------------
  const { runs } = await loadSerpentWeekRuns(supabase, week.id);
  const you = foldPlayerDepth(playerId, runs, week.id, clanId);

  // ---- carried standings -------------------------------------------------
  const { data: playerRow, error: playerError } = await supabase
    .from('players')
    .select('lifetime_depth, best_week_depth')
    .eq('id', playerId)
    .maybeSingle();
  if (playerError && !isMissingSerpentInfra(playerError)) {
    report('panel standings read', playerError, { playerId });
  }

  const bestWeekDepth = Number(playerRow?.best_week_depth ?? 0);
  panel.you = {
    depth: you.depth,
    attempts: you.attempts,
    bestYield: you.bestYield,
    countedYields: you.countedYields,
    countedRuns: SERPENT_COUNTED_RUNS,
    bestWeekDepth,
    lifetimeDepth: Number(playerRow?.lifetime_depth ?? 0),
    deltaVsBestWeek: you.depth - bestWeekDepth,
  };

  if (clanId) {
    panel.clan = await buildClanBlock(supabase, clanId, week.id, runs);
  }

  panel.history = await loadHistory(supabase, playerId, clanId, week.id);
  panel.chronicle = await loadChronicle(supabase, playerId, clanId);

  return panel;
}

async function buildClanBlock(
  supabase: SupabaseClient,
  clanId: string,
  weekId: string,
  runs: readonly SerpentRunRow[]
): Promise<SerpentPanelClan | null> {
  const { data: clanRow, error: clanError } = await supabase
    .from('clans')
    .select('id, name, tag, lifetime_depth, best_week_depth')
    .eq('id', clanId)
    .maybeSingle();
  if (clanError) {
    if (!isMissingSerpentInfra(clanError)) report('panel clan read', clanError, { clanId });
    return null;
  }
  if (!clanRow) return null;

  const { data: memberRows, error: memberError } = await supabase
    .from('clan_members')
    .select('player_id')
    .eq('clan_id', clanId);
  if (memberError) {
    if (!isMissingSerpentInfra(memberError)) {
      report('panel clan roster read', memberError, { clanId });
    }
  }

  const userIds = ((memberRows ?? []) as Array<Record<string, unknown>>)
    .map((row) => row.player_id as string | undefined)
    .filter((id): id is string => Boolean(id));

  let roster: Array<{ playerId: string; handle: string | null; cohort: unknown }> = [];
  if (userIds.length > 0) {
    const { data: playerRows, error: rosterError } = await supabase
      .from('players')
      .select('id, user_id, handle, cohort')
      .in('user_id', userIds);
    if (rosterError) {
      if (!isMissingSerpentInfra(rosterError)) {
        report('panel clan players read', rosterError, { clanId });
      }
    } else {
      roster = ((playerRows ?? []) as Array<Record<string, unknown>>).map((row) => ({
        playerId: String(row.id ?? ''),
        handle: (row.handle as string | null) ?? null,
        cohort: row.cohort,
      }));
    }
  }

  // Clan Depth: the plain SUM of member Depths (Rule 8). Computed over the
  // FULL roster, including cohort-hidden accounts, so the number is the true
  // one; the roster below is what a surface may render.
  const folded = roster.map((member) =>
    foldPlayerDepth(member.playerId, runs, weekId, clanId)
  );
  const depth = folded.reduce((sum, entry) => sum + entry.depth, 0);

  const visible: SerpentPanelMember[] = [];
  let hiddenMembers = 0;
  for (let i = 0; i < roster.length; i += 1) {
    if (!isPublicCohort(roster[i].cohort)) {
      hiddenMembers += 1;
      continue;
    }
    visible.push({
      playerId: roster[i].playerId,
      handle: roster[i].handle,
      depth: folded[i].depth,
      attempts: folded[i].attempts,
    });
  }
  visible.sort((a, b) => b.depth - a.depth || a.playerId.localeCompare(b.playerId));

  return {
    id: String(clanRow.id),
    name: String(clanRow.name ?? ''),
    tag: (clanRow.tag as string | null) ?? null,
    memberCount: roster.length,
    depth,
    bestWeekDepth: Number(clanRow.best_week_depth ?? 0),
    lifetimeDepth: Number(clanRow.lifetime_depth ?? 0),
    members: visible,
    hiddenMembers,
  };
}

async function loadHistory(
  supabase: SupabaseClient,
  playerId: string,
  clanId: string | null,
  currentWeekId: string
): Promise<SerpentPanelHistoryEntry[]> {
  const { data, error } = await supabase
    .from('serpent_week_players')
    .select('week_id, depth, serpent_weeks(week_start)')
    .eq('player_id', playerId)
    .neq('week_id', currentWeekId)
    .order('week_id', { ascending: false })
    .limit(HISTORY_WEEKS);

  if (error) {
    if (!isMissingSerpentInfra(error)) report('panel history read', error, { playerId });
    return [];
  }

  const rows = (data ?? []) as Array<Record<string, unknown>>;
  const weekIds = rows.map((row) => String(row.week_id ?? ''));

  const clanDepthByWeek = new Map<string, number>();
  if (clanId && weekIds.length > 0) {
    const { data: clanRows, error: clanError } = await supabase
      .from('serpent_week_clans')
      .select('week_id, depth')
      .eq('clan_id', clanId)
      .in('week_id', weekIds);
    if (clanError) {
      if (!isMissingSerpentInfra(clanError)) {
        report('panel clan history read', clanError, { clanId });
      }
    } else {
      for (const row of (clanRows ?? []) as Array<Record<string, unknown>>) {
        clanDepthByWeek.set(String(row.week_id ?? ''), Number(row.depth ?? 0));
      }
    }
  }

  return rows
    .map((row) => {
      const joined = row.serpent_weeks as { week_start?: string } | null;
      const weekId = String(row.week_id ?? '');
      return {
        weekStart: String(joined?.week_start ?? '').slice(0, 10),
        depth: Number(row.depth ?? 0),
        clanDepth: clanDepthByWeek.has(weekId)
          ? (clanDepthByWeek.get(weekId) as number)
          : null,
      };
    })
    .sort((a, b) => b.weekStart.localeCompare(a.weekStart));
}

async function loadChronicle(
  supabase: SupabaseClient,
  playerId: string,
  clanId: string | null
): Promise<SerpentPanelChronicleEntry[]> {
  const filters = [`player_id.eq.${playerId}`];
  if (clanId) filters.push(`clan_id.eq.${clanId}`);

  const { data, error } = await supabase
    .from('serpent_chronicle_entries')
    .select('kind, depth, previous_depth, created_at, serpent_weeks(week_start)')
    .or(filters.join(','))
    .order('created_at', { ascending: false })
    .limit(CHRONICLE_ENTRIES);

  if (error) {
    if (!isMissingSerpentInfra(error)) report('panel chronicle read', error, { playerId });
    return [];
  }

  return ((data ?? []) as Array<Record<string, unknown>>).map((row) => {
    const joined = row.serpent_weeks as { week_start?: string } | null;
    return {
      kind: String(row.kind ?? ''),
      weekStart: String(joined?.week_start ?? '').slice(0, 10),
      depth: Number(row.depth ?? 0),
      previousDepth: Number(row.previous_depth ?? 0),
      at: String(row.created_at ?? ''),
    };
  });
}

export type { SerpentPlayerDepth, SerpentClanDepth };

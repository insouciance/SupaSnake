/**
 * The Analyst — cache-first orchestration (Identity v1 §9.2–9.3).
 *
 * One generation per (kind, scope, owner), ever: the 025 unique dedup
 * index arbitrates races (insert-conflict → return the winner's row).
 * All functions are pre-025-safe: a missing ai_insights table reads as
 * "Analyst not live yet" ({ live: false }) and never fails a request.
 * Server-side only (service-role client) — RLS on ai_insights allows
 * SELECT to owners; every write happens here.
 */

import { createHash } from 'crypto';
import type { SupabaseClient } from '@supabase/supabase-js';
import { levelForXp } from '@/shared/game/mastery';
import type { RunEventEnvelope } from '@/shared/game/runEvents';
import type { MutationPick } from '@/shared/game/mutations';
import {
  AnalystFacts,
  ArtifactContent,
  ArtifactKind,
  ARCHETYPES,
  buildArchetypeFacts,
  buildDigestFacts,
  buildRecallFacts,
  buildRunFacts,
  buildScoutFacts,
  detectArchetype,
  ScoutFactsInput,
  SeasonRunRow,
} from './facts';
import { narrate, NarrationClient } from './narrate';

// ---------------------------------------------------------------------------
// Pre-025 detection (house isMissingXInfra pattern)
// ---------------------------------------------------------------------------

interface SupabaseErrorLike {
  code?: string;
  message?: string;
}

export function isMissingAnalystInfra(
  error: SupabaseErrorLike | null | undefined
): boolean {
  if (!error) return false;
  if (
    error.code === '42P01' ||
    error.code === '42703' ||
    error.code === '42883' ||
    error.code === 'PGRST202' ||
    error.code === 'PGRST205'
  ) {
    return true;
  }
  return /ai_insights|ai_usage_daily|record_ai_usage|prune_run_events|email_digest_opt_in/i.test(
    error.message || ''
  );
}

// ---------------------------------------------------------------------------
// Cache primitives
// ---------------------------------------------------------------------------

export interface StoredInsight {
  id: string;
  kind: ArtifactKind;
  scope_ref: string;
  content: ArtifactContent & {
    facts?: AnalystFacts;
    archetype?: string;
  };
  model: string | null;
  created_at: string;
}

export interface InsightOwner {
  playerId?: string;
  clanId?: string;
}

const INSIGHT_COLUMNS = 'id, kind, scope_ref, content, model, created_at';

export interface CacheLookup {
  live: boolean;
  row: StoredInsight | null;
}

export async function getCachedInsight(
  supabase: SupabaseClient,
  kind: ArtifactKind,
  scopeRef: string,
  owner: InsightOwner
): Promise<CacheLookup> {
  let query = supabase
    .from('ai_insights')
    .select(INSIGHT_COLUMNS)
    .eq('kind', kind)
    .eq('scope_ref', scopeRef);
  query = owner.playerId
    ? query.eq('player_id', owner.playerId)
    : query.eq('clan_id', owner.clanId ?? '');
  const { data, error } = await query.maybeSingle();
  if (error) {
    if (isMissingAnalystInfra(error)) return { live: false, row: null };
    console.error('Analyst cache read failed:', error.message);
    return { live: true, row: null };
  }
  return { live: true, row: (data as StoredInsight | null) ?? null };
}

/** Most recent artifact of a kind for an owner (digest/recall surfaces). */
export async function getLatestInsight(
  supabase: SupabaseClient,
  kind: ArtifactKind,
  owner: InsightOwner
): Promise<CacheLookup> {
  let query = supabase
    .from('ai_insights')
    .select(INSIGHT_COLUMNS)
    .eq('kind', kind)
    .order('created_at', { ascending: false })
    .limit(1);
  query = owner.playerId
    ? query.eq('player_id', owner.playerId)
    : query.eq('clan_id', owner.clanId ?? '');
  const { data, error } = await query.maybeSingle();
  if (error) {
    if (isMissingAnalystInfra(error)) return { live: false, row: null };
    console.error('Analyst latest read failed:', error.message);
    return { live: true, row: null };
  }
  return { live: true, row: (data as StoredInsight | null) ?? null };
}

export function inputHash(facts: AnalystFacts): string {
  return createHash('sha256').update(JSON.stringify(facts)).digest('hex');
}

/**
 * Insert-or-return-existing on the 025 dedup index: a 23505 collision
 * means another request won the race — read and return its row.
 */
export async function saveInsight(
  supabase: SupabaseClient,
  params: {
    kind: ArtifactKind;
    scopeRef: string;
    owner: InsightOwner;
    content: StoredInsight['content'];
    model: string | null;
    tokensIn: number;
    tokensOut: number;
    facts: AnalystFacts;
  }
): Promise<StoredInsight | null> {
  const { data, error } = await supabase
    .from('ai_insights')
    .insert({
      player_id: params.owner.playerId ?? null,
      clan_id: params.owner.clanId ?? null,
      kind: params.kind,
      scope_ref: params.scopeRef,
      input_hash: inputHash(params.facts),
      model: params.model,
      content: params.content,
      tokens_in: params.tokensIn,
      tokens_out: params.tokensOut,
    })
    .select(INSIGHT_COLUMNS)
    .single();
  if (!error) return data as StoredInsight;

  if (error.code === '23505') {
    const existing = await getCachedInsight(
      supabase,
      params.kind,
      params.scopeRef,
      params.owner
    );
    return existing.row;
  }
  if (!isMissingAnalystInfra(error)) {
    console.error('Analyst cache write failed:', error.message);
  }
  return null;
}

// ---------------------------------------------------------------------------
// Time helpers
// ---------------------------------------------------------------------------

/** Monday (UTC) of the week containing `d`, as YYYY-MM-DD. */
export function weekStartUtc(d: Date = new Date()): string {
  const diff = (d.getUTCDay() + 6) % 7;
  const monday = new Date(
    Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() - diff)
  );
  return monday.toISOString().slice(0, 10);
}

/** Monday of the most recently COMPLETED week (digest scope). */
export function lastCompletedWeekStart(d: Date = new Date()): string {
  const thisMonday = new Date(weekStartUtc(d) + 'T00:00:00Z');
  thisMonday.setUTCDate(thisMonday.getUTCDate() - 7);
  return thisMonday.toISOString().slice(0, 10);
}

function addDays(day: string, days: number): string {
  const d = new Date(day + 'T00:00:00Z');
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

export interface SeasonWindow {
  id: string;
  seq: number;
  name: string | null;
  startsOn: string;
  endsOn: string;
}

/** Latest season whose window has fully ended; null while one is live. */
export async function latestEndedSeason(
  supabase: SupabaseClient,
  now: Date = new Date()
): Promise<SeasonWindow | null> {
  const today = now.toISOString().slice(0, 10);
  const { data, error } = await supabase
    .from('seasons')
    .select('id, seq, name, starts_on, ends_on')
    .lte('ends_on', today)
    .order('ends_on', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) {
    if (!isMissingAnalystInfra(error)) {
      console.error('Analyst season read failed:', error.message);
    }
    return null;
  }
  if (!data) return null;
  return {
    id: data.id,
    seq: data.seq,
    name: data.name ?? null,
    startsOn: data.starts_on,
    endsOn: data.ends_on,
  };
}

// ---------------------------------------------------------------------------
// Generation results
// ---------------------------------------------------------------------------

export interface InsightResult {
  live: boolean;
  insight: StoredInsight | null;
  cached: boolean;
  source: 'llm' | 'fallback' | 'cache' | null;
  /** Populated when generation was skipped (e.g. no runs that week). */
  skipped?: string;
}

const NOT_LIVE: InsightResult = {
  live: false,
  insight: null,
  cached: false,
  source: null,
};

// ---------------------------------------------------------------------------
// Run insight (§9.2 — game-over, on demand)
// ---------------------------------------------------------------------------

export async function generateRunInsight(
  supabase: SupabaseClient,
  params: { playerId: string; sessionId: string; client?: NarrationClient }
): Promise<InsightResult & { notFound?: boolean; notEnded?: boolean }> {
  const cached = await getCachedInsight(supabase, 'run_insight', params.sessionId, {
    playerId: params.playerId,
  });
  if (!cached.live) return NOT_LIVE;
  if (cached.row) {
    return { live: true, insight: cached.row, cached: true, source: 'cache' };
  }

  const { data: session, error: sessionError } = await supabase
    .from('game_sessions')
    .select(
      'id, player_id, dynasty, score, dna_earned, duration_seconds, foods_collected, extracted, died, death_cause, is_free_play, anomaly_id, ended_at, run_events, mutations'
    )
    .eq('id', params.sessionId)
    .eq('player_id', params.playerId)
    .maybeSingle();
  if (sessionError) {
    console.error('Analyst session read failed:', sessionError.message);
    return { ...NOT_LIVE, live: true, notFound: true };
  }
  if (!session) return { ...NOT_LIVE, live: true, notFound: true };
  if (!session.ended_at) return { ...NOT_LIVE, live: true, notEnded: true };

  const { data: economyTx, error: economyError } = await supabase
    .from('economy_transactions')
    .select('metadata')
    .eq('player_id', params.playerId)
    .eq('source_type', 'game_reward')
    .eq('source_id', params.sessionId)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (economyError) {
    console.error('Analyst economy read failed:', economyError.message);
  }

  const since = new Date(Date.now() - 30 * 24 * 3600 * 1000).toISOString();
  const { data: recent, error: recentError } = await supabase
    .from('game_sessions')
    .select('foods_collected, duration_seconds, extracted, dna_earned, dynasty')
    .eq('player_id', params.playerId)
    .not('ended_at', 'is', null)
    .gte('ended_at', since)
    .neq('id', params.sessionId)
    .order('ended_at', { ascending: false })
    .limit(200);
  if (recentError) {
    console.error('Analyst recent-sessions read failed:', recentError.message);
  }

  const picks: MutationPick[] = Array.isArray(session.mutations?.picks)
    ? (session.mutations.picks as MutationPick[])
    : [];

  const facts = buildRunFacts({
    session: {
      id: session.id,
      dynasty: session.dynasty ?? 'COSMIC',
      score: session.score ?? 0,
      dnaEarned: session.dna_earned ?? 0,
      durationSeconds: session.duration_seconds ?? 0,
      foodsCollected: session.foods_collected ?? 0,
      extracted: Boolean(session.extracted),
      died: Boolean(session.died),
      deathCause: session.death_cause ?? null,
      isFreePlay: Boolean(session.is_free_play),
      anomalyId: session.anomaly_id ?? null,
    },
    runEvents: (session.run_events as RunEventEnvelope | null) ?? null,
    economy: economyTx?.metadata ?? null,
    mutationPicks: picks,
    recentSessions: (recent ?? []).map((r) => ({
      foodsCollected: r.foods_collected ?? 0,
      durationSeconds: r.duration_seconds ?? 0,
      extracted: Boolean(r.extracted),
      dnaEarned: r.dna_earned ?? 0,
      dynasty: r.dynasty ?? '',
    })),
  });

  const narration = await narrate(facts, {
    supabase,
    client: params.client,
  });
  const saved = await saveInsight(supabase, {
    kind: 'run_insight',
    scopeRef: params.sessionId,
    owner: { playerId: params.playerId },
    content: { ...narration.content, facts },
    model: narration.model,
    tokensIn: narration.tokensIn,
    tokensOut: narration.tokensOut,
    facts,
  });
  if (!saved) return NOT_LIVE;
  return { live: true, insight: saved, cached: false, source: narration.source };
}

// ---------------------------------------------------------------------------
// Weekly digest (§9.2 — Monday cron + generate-on-miss)
// ---------------------------------------------------------------------------

export async function generateWeeklyDigest(
  supabase: SupabaseClient,
  params: {
    playerId: string;
    weekStart: string;
    minEarningRuns?: number;
    client?: NarrationClient;
  }
): Promise<InsightResult> {
  const cached = await getCachedInsight(supabase, 'weekly_digest', params.weekStart, {
    playerId: params.playerId,
  });
  if (!cached.live) return NOT_LIVE;
  if (cached.row) {
    return { live: true, insight: cached.row, cached: true, source: 'cache' };
  }

  const weekEnd = addDays(params.weekStart, 7);
  const { data: sessions, error: sessionsError } = await supabase
    .from('game_sessions')
    .select(
      'dynasty, dna_earned, score, extracted, died, foods_collected, duration_seconds, death_cause, ended_at'
    )
    .eq('player_id', params.playerId)
    .not('ended_at', 'is', null)
    .gte('ended_at', params.weekStart)
    .lt('ended_at', weekEnd)
    .limit(500);
  if (sessionsError) {
    console.error('Analyst digest sessions read failed:', sessionsError.message);
    return { ...NOT_LIVE, live: true, skipped: 'sessions_unavailable' };
  }
  const earning = (sessions ?? []).filter((s) => (s.dna_earned ?? 0) > 0);
  if (earning.length < (params.minEarningRuns ?? 1)) {
    return { ...NOT_LIVE, live: true, skipped: 'no_runs' };
  }

  // Contracts completed that week (non-fatal — pre-015 or query issues
  // simply drop the section)
  let contracts: { completed: number; claimed: number } | null = null;
  const { data: contractRows, error: contractsError } = await supabase
    .from('player_contracts')
    .select('completed_at, claimed_at')
    .eq('player_id', params.playerId)
    .eq('picked', true)
    .gte('contract_date', params.weekStart)
    .lt('contract_date', weekEnd);
  if (contractsError) {
    console.error('Analyst digest contracts read failed:', contractsError.message);
  } else if (contractRows) {
    contracts = {
      completed: contractRows.filter((c) => c.completed_at !== null).length,
      claimed: contractRows.filter((c) => c.claimed_at !== null).length,
    };
  }

  let streak: { current: number } | null = null;
  const { data: streakRow, error: streakError } = await supabase
    .from('player_streaks')
    .select('current_streak')
    .eq('player_id', params.playerId)
    .maybeSingle();
  if (streakError) {
    console.error('Analyst digest streak read failed:', streakError.message);
  } else if (streakRow) {
    streak = { current: streakRow.current_streak ?? 0 };
  }

  // Records that advanced during the week (best-effort; pre-023 → none)
  const recordsAdvanced: Array<{ name: string; tier: number }> = [];
  const { data: recordRows, error: recordsError } = await supabase
    .from('player_records')
    .select('record_id, tier, updated_at')
    .eq('player_id', params.playerId)
    .gte('updated_at', params.weekStart)
    .lt('updated_at', weekEnd)
    .gt('tier', 0);
  if (recordsError) {
    if (!isMissingAnalystInfra(recordsError)) {
      console.error('Analyst digest records read failed:', recordsError.message);
    }
  } else if (recordRows && recordRows.length > 0) {
    const { data: defs, error: defsError } = await supabase
      .from('record_definitions')
      .select('id, name')
      .in(
        'id',
        recordRows.map((r) => r.record_id)
      );
    if (defsError) {
      console.error('Analyst digest record defs read failed:', defsError.message);
    }
    const names = new Map((defs ?? []).map((d) => [d.id, d.name]));
    for (const row of recordRows.slice(0, 3)) {
      recordsAdvanced.push({
        name: names.get(row.record_id) ?? row.record_id,
        tier: row.tier,
      });
    }
  }

  const facts = buildDigestFacts({
    weekStart: params.weekStart,
    sessions: (sessions ?? []).map((s) => ({
      dynasty: s.dynasty ?? '',
      dnaEarned: s.dna_earned ?? 0,
      score: s.score ?? 0,
      extracted: Boolean(s.extracted),
      died: Boolean(s.died),
      foodsCollected: s.foods_collected ?? 0,
      durationSeconds: s.duration_seconds ?? 0,
      deathCause: s.death_cause ?? null,
      endedAt: s.ended_at,
    })),
    contracts,
    streak,
    recordsAdvanced,
  });

  const narration = await narrate(facts, { supabase, client: params.client });
  const saved = await saveInsight(supabase, {
    kind: 'weekly_digest',
    scopeRef: params.weekStart,
    owner: { playerId: params.playerId },
    content: { ...narration.content, facts },
    model: narration.model,
    tokensIn: narration.tokensIn,
    tokensOut: narration.tokensOut,
    facts,
  });
  if (!saved) return NOT_LIVE;
  return { live: true, insight: saved, cached: false, source: narration.source };
}

// ---------------------------------------------------------------------------
// Season aggregates shared by archetype + recall
// ---------------------------------------------------------------------------

async function seasonRuns(
  supabase: SupabaseClient,
  playerId: string,
  season: SeasonWindow,
  withEvents: boolean
): Promise<SeasonRunRow[] | null> {
  const baseColumns =
    'dynasty, dna_earned, score, extracted, died, foods_collected, duration_seconds, ended_at';
  const columns = withEvents
    ? `${baseColumns}, run_events, mutations`
    : baseColumns;
  const { data, error } = await supabase
    .from('game_sessions')
    .select(columns)
    .eq('player_id', playerId)
    .not('ended_at', 'is', null)
    .not('is_free_play', 'is', true)
    .gte('ended_at', season.startsOn)
    .lt('ended_at', season.endsOn)
    .order('ended_at', { ascending: true })
    .limit(2000);
  if (error) {
    console.error('Analyst season runs read failed:', error.message);
    return null;
  }
  type SessionRow = {
    dynasty: string | null;
    dna_earned: number | null;
    score: number | null;
    extracted: boolean | null;
    died: boolean | null;
    foods_collected: number | null;
    duration_seconds: number | null;
    ended_at: string;
    run_events?: RunEventEnvelope | null;
    mutations?: { picks?: MutationPick[] } | null;
  };
  return ((data ?? []) as unknown as SessionRow[]).map((s) => ({
    dynasty: s.dynasty ?? '',
    dnaEarned: s.dna_earned ?? 0,
    score: s.score ?? 0,
    extracted: Boolean(s.extracted),
    died: Boolean(s.died),
    foodsCollected: s.foods_collected ?? 0,
    durationSeconds: s.duration_seconds ?? 0,
    endedAt: s.ended_at,
    runEvents: s.run_events ?? null,
    mutationsHeld: Array.isArray(s.mutations?.picks)
      ? s.mutations!.picks!.length
      : null,
  }));
}

async function masteryLevels(
  supabase: SupabaseClient,
  playerId: string
): Promise<Record<string, number>> {
  const { data, error } = await supabase
    .from('player_mastery')
    .select('dynasty, xp')
    .eq('player_id', playerId);
  if (error) {
    console.error('Analyst mastery read failed:', error.message);
    return {};
  }
  const levels: Record<string, number> = {};
  for (const row of data ?? []) {
    levels[row.dynasty] = levelForXp(row.xp ?? 0);
  }
  return levels;
}

function seasonWeeksElapsed(season: SeasonWindow, now: Date): number {
  const start = Date.parse(season.startsOn + 'T00:00:00Z');
  const end = Math.min(
    Date.parse(season.endsOn + 'T00:00:00Z'),
    now.getTime()
  );
  const weeks = Math.ceil((end - start) / (7 * 24 * 3600 * 1000));
  return Math.max(1, Math.min(7, weeks));
}

// ---------------------------------------------------------------------------
// Seasonal archetype (§9.6 — cron; badge grant is pure TS + one insert)
// ---------------------------------------------------------------------------

export async function generateArchetype(
  supabase: SupabaseClient,
  params: {
    playerId: string;
    season: SeasonWindow;
    client?: NarrationClient;
    now?: Date;
  }
): Promise<InsightResult & { archetype?: string }> {
  const scopeRef = `s${params.season.seq}`;
  const cached = await getCachedInsight(supabase, 'archetype', scopeRef, {
    playerId: params.playerId,
  });
  if (!cached.live) return NOT_LIVE;
  if (cached.row) {
    return {
      live: true,
      insight: cached.row,
      cached: true,
      source: 'cache',
      archetype: cached.row.content.archetype,
    };
  }

  const runs = await seasonRuns(supabase, params.playerId, params.season, true);
  if (runs === null) return { ...NOT_LIVE, live: true, skipped: 'sessions_unavailable' };

  let contracts: { picked: number; completed: number } | null = null;
  const { data: contractRows, error: contractsError } = await supabase
    .from('player_contracts')
    .select('completed_at')
    .eq('player_id', params.playerId)
    .eq('picked', true)
    .gte('contract_date', params.season.startsOn)
    .lt('contract_date', params.season.endsOn);
  if (contractsError) {
    console.error('Analyst archetype contracts read failed:', contractsError.message);
  } else if (contractRows) {
    contracts = {
      picked: contractRows.length,
      completed: contractRows.filter((c) => c.completed_at !== null).length,
    };
  }

  const facts = buildArchetypeFacts({
    seasonSeq: params.season.seq,
    runs,
    masteryLevels: await masteryLevels(supabase, params.playerId),
    contracts,
    seasonWeeks: seasonWeeksElapsed(params.season, params.now ?? new Date()),
  });
  const detection = detectArchetype(facts);

  // Badge grant (pure TS decision → one idempotent inventory insert).
  // The Hatchling is unranked — no badge (§9.6).
  if (detection.archetype !== 'hatchling') {
    const { error: grantError } = await supabase
      .from('player_cosmetics')
      .upsert(
        {
          player_id: params.playerId,
          cosmetic_id: ARCHETYPES[detection.archetype].badgeId,
          source: 'archetype',
        },
        { onConflict: 'player_id,cosmetic_id', ignoreDuplicates: true }
      );
    if (grantError) {
      console.error('Archetype badge grant failed:', grantError.message);
    }
  }

  const narration = await narrate(facts, { supabase, client: params.client });
  const saved = await saveInsight(supabase, {
    kind: 'archetype',
    scopeRef,
    owner: { playerId: params.playerId },
    content: {
      ...narration.content,
      archetype: detection.archetype,
      facts,
    },
    model: narration.model,
    tokensIn: narration.tokensIn,
    tokensOut: narration.tokensOut,
    facts,
  });
  if (!saved) return NOT_LIVE;
  return {
    live: true,
    insight: saved,
    cached: false,
    source: narration.source,
    archetype: detection.archetype,
  };
}

// ---------------------------------------------------------------------------
// Season Recall (§9.2 — the flagship shareable; gpt-5)
// ---------------------------------------------------------------------------

export async function generateSeasonRecall(
  supabase: SupabaseClient,
  params: {
    playerId: string;
    userId: string | null;
    season: SeasonWindow;
    client?: NarrationClient;
  }
): Promise<InsightResult> {
  const scopeRef = `s${params.season.seq}`;
  const cached = await getCachedInsight(supabase, 'season_recall', scopeRef, {
    playerId: params.playerId,
  });
  if (!cached.live) return NOT_LIVE;
  if (cached.row) {
    return { live: true, insight: cached.row, cached: true, source: 'cache' };
  }

  const runs = await seasonRuns(supabase, params.playerId, params.season, false);
  if (runs === null) return { ...NOT_LIVE, live: true, skipped: 'sessions_unavailable' };
  if (runs.length === 0) return { ...NOT_LIVE, live: true, skipped: 'no_runs' };

  const { count: variantsAcquired, error: variantsError } = await supabase
    .from('collected_snakes')
    .select('id', { count: 'exact', head: true })
    .eq('player_id', params.playerId)
    .gte('acquired_at', params.season.startsOn)
    .lt('acquired_at', params.season.endsOn);
  if (variantsError) {
    console.error('Analyst recall variants read failed:', variantsError.message);
  }

  const badgesEarned: string[] = [];
  const { data: cosmetics, error: cosmeticsError } = await supabase
    .from('player_cosmetics')
    .select('cosmetic_id, acquired_at, cosmetic_definitions(name)')
    .eq('player_id', params.playerId)
    .gte('acquired_at', params.season.startsOn)
    .lt('acquired_at', params.season.endsOn)
    .limit(12);
  if (cosmeticsError) {
    console.error('Analyst recall cosmetics read failed:', cosmeticsError.message);
  } else {
    for (const row of cosmetics ?? []) {
      const def = row.cosmetic_definitions as { name?: string } | { name?: string }[] | null;
      const name = Array.isArray(def) ? def[0]?.name : def?.name;
      if (name) badgesEarned.push(name);
    }
  }

  // Clan chapter: clan_members.player_id is the AUTH uid
  let clan: {
    name: string;
    tag: string;
    duelWins: number;
    duelLosses: number;
    champion: boolean;
  } | null = null;
  if (params.userId) {
    const { data: membership, error: membershipError } = await supabase
      .from('clan_members')
      .select('clan_id')
      .eq('player_id', params.userId)
      .maybeSingle();
    if (membershipError) {
      console.error('Analyst recall membership read failed:', membershipError.message);
    } else if (membership?.clan_id) {
      const { data: clanRow, error: clanError } = await supabase
        .from('clans')
        .select('id, name, tag, duel_wins, duel_losses')
        .eq('id', membership.clan_id)
        .maybeSingle();
      if (clanError) {
        console.error('Analyst recall clan read failed:', clanError.message);
      } else if (clanRow) {
        let champion = false;
        const { data: champ, error: champError } = await supabase
          .from('season_champions')
          .select('clan_id')
          .eq('season_id', params.season.id)
          .maybeSingle();
        if (champError) {
          console.error('Analyst recall champion read failed:', champError.message);
        } else {
          champion = champ?.clan_id === clanRow.id;
        }
        clan = {
          name: clanRow.name,
          tag: clanRow.tag,
          duelWins: clanRow.duel_wins ?? 0,
          duelLosses: clanRow.duel_losses ?? 0,
          champion,
        };
      }
    }
  }

  const archetypeRow = await getCachedInsight(supabase, 'archetype', scopeRef, {
    playerId: params.playerId,
  });
  const archetypeSlug =
    (archetypeRow.row?.content.archetype as
      | keyof typeof ARCHETYPES
      | undefined) ?? null;

  const facts = buildRecallFacts({
    seasonSeq: params.season.seq,
    seasonName: params.season.name,
    runs: runs.map((r) => ({
      dynasty: r.dynasty,
      dnaEarned: r.dnaEarned,
      score: r.score,
      extracted: r.extracted,
      endedAt: r.endedAt,
    })),
    variantsAcquired: variantsAcquired ?? 0,
    masteryLevels: await masteryLevels(supabase, params.playerId),
    badgesEarned,
    clan,
    archetype: archetypeSlug,
  });

  const narration = await narrate(facts, { supabase, client: params.client });
  const saved = await saveInsight(supabase, {
    kind: 'season_recall',
    scopeRef,
    owner: { playerId: params.playerId },
    content: { ...narration.content, facts },
    model: narration.model,
    tokensIn: narration.tokensIn,
    tokensOut: narration.tokensOut,
    facts,
  });
  if (!saved) return NOT_LIVE;
  return { live: true, insight: saved, cached: false, source: narration.source };
}

// ---------------------------------------------------------------------------
// Gauntlet scouting narration (§9.2 — clan-scoped, once per duel week)
// ---------------------------------------------------------------------------

export async function generateScoutNarration(
  supabase: SupabaseClient,
  params: {
    clanId: string;
    weekStart: string;
    duelId: string;
    input: ScoutFactsInput;
    client?: NarrationClient;
  }
): Promise<InsightResult> {
  const scopeRef = `${params.weekStart}:${params.duelId}`;
  const cached = await getCachedInsight(supabase, 'scout_narration', scopeRef, {
    clanId: params.clanId,
  });
  if (!cached.live) return NOT_LIVE;
  if (cached.row) {
    return { live: true, insight: cached.row, cached: true, source: 'cache' };
  }

  const facts = buildScoutFacts(params.input);
  const narration = await narrate(facts, { supabase, client: params.client });
  const saved = await saveInsight(supabase, {
    kind: 'scout_narration',
    scopeRef,
    owner: { clanId: params.clanId },
    content: { ...narration.content, facts },
    model: narration.model,
    tokensIn: narration.tokensIn,
    tokensOut: narration.tokensOut,
    facts,
  });
  if (!saved) return NOT_LIVE;
  return { live: true, insight: saved, cached: false, source: narration.source };
}

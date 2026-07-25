/**
 * Leaderboard API - GET /api/leaderboard
 *
 * Constitution §6.1 / GT §9.3. Every board (global, weekly, daily) is now the
 * same fold over `game_sessions` with the same eligibility:
 *
 *   ended · validated · not Free Play · not an Anomaly run ·
 *   settled (end_reason) · a public cohort ·
 *   compatible content version · inside the board's window
 *
 * and one best run per player. Rule 11: eligibility is a query predicate, not
 * a client concern - an in-progress or flagged run is structurally incapable
 * of appearing. Rule 6: this is entirely read-side; nothing is written.
 *
 * WP-0.06 added the two middle conditions and REPLACED NOTHING. `validated`
 * is still the flag gate. `end_reason` answers a different question - a run
 * the sweep expired, or the player abandoned, or the client forfeited, never
 * settled, so it is not a result. `cohort` answers a third - the dev, QA and
 * fixture accounts of GT §13 are not the audience, so a stranger is not shown
 * them. Excluding an account is read-side: it keeps every run, reward and
 * record it owns (Rule 6), and `total` below simply stops counting it.
 *
 * Rule 2: the ranked value is `game_sessions.score`, the server recompute of
 * the run's food events under its dynasty ruleset. No genome, generation,
 * collection, account or purchase state is read on this path at all.
 *
 * The global board no longer reads `players.high_score`. That column is
 * written with `Math.max(current, adjustedScore)` and no `validated` gate
 * (`api/game/session/route.ts`), so a flagged run set a permanent record.
 * Reading the sessions table instead applies the same eligibility everywhere
 * without touching (Rule 6) or rewriting the players row.
 *
 * ## Request
 *   type    global | weekly | daily            (default global)
 *   view    board | you                        (default board)
 *   dynasty CYBER | PRIMAL | COSMIC            (optional, all boards)
 *   limit   1..100                             (default 50, view=board only)
 *   offset  >= 0                               (default 0, view=board only)
 *   Authorization: Bearer <supabase access token>  (optional)
 *
 * Credentials are optional: the board is public. When present they resolve
 * `viewer` - the requesting player's `players.id`, rank and score.
 *
 * ## Response
 *   see `LeaderboardResponse` in src/lib/leaderboard/types.ts
 */

import { NextRequest, NextResponse } from 'next/server';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import * as Sentry from '@sentry/nextjs';
import type {
  LeaderboardEntry,
  LeaderboardResponse,
  LeaderboardType,
  LeaderboardView,
} from '@/lib/leaderboard/types';
import {
  boardWindowStart,
  LEADERBOARD_CONTENT_VERSION,
  type EligibilityWindow,
  type RankableSessionRow,
} from '@/lib/leaderboard/eligibility';
import {
  buildBoard,
  viewerPosition,
  youCenteredSlice,
  type RankedRun,
} from '@/lib/leaderboard/board';
import { getIdentitiesForPlayers } from '@/lib/server/identity';
import type { PlayerIdentity } from '@/lib/identity/types';
import { SETTLED_END_REASON } from '@/lib/session/lifecycle';
import {
  excludedCohortPlayerIds,
  isMissingLifecycleInfra,
} from '@/lib/server/sessionLifecycle';

/**
 * Hard ceiling on the eligible-run scan. At the current population every
 * board fits in a single page; the cap exists so a runaway table can never
 * turn a board request into an unbounded read. When it bites, the response
 * says so (`truncated: true`) instead of quietly serving wrong ranks.
 */
const BOARD_SCAN_LIMIT = 5000;
const BOARD_SCAN_PAGE = 1000;

/**
 * How many flagged accounts fit in the query's exclusion list before it is
 * dropped in favour of the pure gate alone.
 *
 * The dev/QA/fixture cohort is a fixed handful by construction — it does not
 * grow with the audience — so this is a guard against a mistake (a mass
 * flagging), not a design limit. Past it the predicate would make the request
 * URL absurd; `buildBoard` still applies the exact same exclusion to every row
 * it ranks, so the board stays correct either way, just less cheap.
 */
const COHORT_EXCLUSION_PUSHDOWN_MAX = 300;

const SESSION_COLUMNS =
  'id, player_id, score, dynasty, started_at, ended_at, validated, is_free_play, anomaly_id, end_reason';

/**
 * The same list without `end_reason`, for the window between a deploy and
 * migration 045. Selecting a column that does not exist fails the whole read,
 * so the scan retries with this and the pure gate degrades to "every ended run
 * settled" - which is exactly what was true before 045 existed.
 */
const SESSION_COLUMNS_PRE_045 =
  'id, player_id, score, dynasty, started_at, ended_at, validated, is_free_play, anomaly_id';

// Server-side Supabase client
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || '',
  process.env.SUPABASE_SERVICE_ROLE_KEY || ''
);

function reportSupabaseError(scope: string, error: unknown, extra: Record<string, unknown> = {}) {
  console.error(`Leaderboard ${scope} error:`, error, extra);
  Sentry.captureException(
    error instanceof Error ? error : new Error(`Leaderboard ${scope} failed`),
    { extra: { scope, ...extra, error } }
  );
}

/**
 * Resolve the requesting player's `players.id` from a bearer token.
 *
 * This is the GT §9.3 identity join, done once and server-side: auth user id
 * -> `players.user_id` -> `players.id`. The client never has to (and never
 * gets to) guess that those are different UUIDs.
 *
 * Missing or invalid credentials are not an error - the board is public and
 * simply renders without a viewer. A failed *lookup* is reported.
 */
async function resolveViewerPlayerId(
  client: SupabaseClient,
  authHeader: string | null
): Promise<string | null> {
  if (!authHeader) return null;
  const token = authHeader.replace(/^Bearer\s+/i, '').trim();
  if (!token) return null;

  const { data: authData, error: authError } = await client.auth.getUser(token);
  if (authError || !authData?.user) return null;

  const { data, error } = await client
    .from('players')
    .select('id')
    .eq('user_id', authData.user.id)
    .maybeSingle();

  if (error) {
    reportSupabaseError('viewer lookup', error, { userId: authData.user.id });
    return null;
  }
  return (data?.id as string | undefined) ?? null;
}

/**
 * Every eligible run in the window, newest content version only.
 *
 * The eligibility predicates live in the query (Rule 11). `buildBoard` then
 * re-applies them to whatever came back, so a regression in this filter list
 * still cannot put a flagged or in-progress run on a board.
 */
async function scanEligibleRuns(
  client: SupabaseClient,
  windowStart: string,
  dynasty: string | null,
  excludedPlayerIds: ReadonlySet<string>
): Promise<{ rows: RankableSessionRow[]; truncated: boolean } | { error: unknown }> {
  const rows: RankableSessionRow[] = [];
  let truncated = false;
  // Set once the schema turns out to predate migration 045; from then on the
  // scan asks for the legacy column list instead of failing every page.
  let selectColumns = SESSION_COLUMNS;
  let pushDownSettled = true;

  const allExcluded = Array.from(excludedPlayerIds);
  const excluded =
    allExcluded.length > COHORT_EXCLUSION_PUSHDOWN_MAX ? [] : allExcluded;

  for (let offset = 0; offset < BOARD_SCAN_LIMIT; offset += BOARD_SCAN_PAGE) {
    const pageSize = Math.min(BOARD_SCAN_PAGE, BOARD_SCAN_LIMIT - offset);

    const build = () => {
      let query = client
        .from('game_sessions')
        .select(selectColumns)
        // Eligibility (Constitution §6.1, GT §9.3)
        .not('ended_at', 'is', null) // the run ended
        .eq('validated', true) // server validation passed
        .eq('is_free_play', false) // practice never ranks (Design v2 §7.4)
        .is('anomaly_id', null) // anomaly runs have their own board (§7.2)
        .gte('started_at', windowStart); // window + content version

      // WP-0.06: only a run that ended by settling is a result. NULL is a
      // pre-045 row, which had exactly one end path and always settled.
      if (pushDownSettled) {
        query = query.or(
          `end_reason.is.null,end_reason.eq.${SETTLED_END_REASON}`
        );
      }
      // WP-0.06: dev/QA/fixture accounts (GT §13). The flagged set is the
      // small minority by construction, so it pushes down as one predicate.
      if (excluded.length > 0) {
        query = query.not('player_id', 'in', `(${excluded.join(',')})`);
      }

      return query
        // Total order so paging is stable across requests
        .order('score', { ascending: false })
        .order('ended_at', { ascending: true })
        .order('id', { ascending: true })
        .range(offset, offset + pageSize - 1);
    };

    let query = dynasty ? build().eq('dynasty', dynasty) : build();
    let { data, error } = await query;

    // Pre-045 window: retry once without the column and its predicate. The
    // pure gate below still applies every rule it can see.
    if (error && selectColumns === SESSION_COLUMNS && isMissingLifecycleInfra(error)) {
      selectColumns = SESSION_COLUMNS_PRE_045;
      pushDownSettled = false;
      query = dynasty ? build().eq('dynasty', dynasty) : build();
      ({ data, error } = await query);
    }

    if (error) return { error };

    const page = (data ?? []) as unknown as RankableSessionRow[];
    rows.push(...page);

    if (page.length < pageSize) return { rows, truncated };
    if (offset + pageSize >= BOARD_SCAN_LIMIT) truncated = true;
  }

  return { rows, truncated };
}

/**
 * Identity v1 (PLAYER_IDENTITY_V1.md section 4): rendered rows read from
 * player_identity_view; `playerName` stays populated for compatibility.
 * Pre-022 the identity map is empty and rows keep the legacy fallback.
 */
function applyIdentities(
  entries: LeaderboardEntry[],
  identities: Map<string, PlayerIdentity>
): LeaderboardEntry[] {
  return entries.map((entry) => {
    const identity = identities.get(entry.playerId);
    if (!identity) return entry;
    return {
      ...entry,
      playerName: identity.displayHandle,
      identity: {
        handle: identity.displayHandle,
        isGenerated: identity.isGenerated,
        title: identity.title,
        clanTag: identity.clanTag,
        founder: identity.isFounder,
        premium: identity.isPremium,
        badges: identity.badges,
        avatarDynasty: identity.avatar?.dynasty ?? null,
        avatarVariantId: identity.avatar?.variantId ?? null,
        avatarVariantName: identity.avatar?.variantName ?? null,
        avatarRarity: identity.avatar?.rarity ?? null,
        mastery: identity.mastery,
        legacyScore: identity.legacyScore,
      },
    };
  });
}

/**
 * Legacy display names for the rendered rows only. Pre-022 accounts have no
 * identity row, so `players.username` remains the fallback source.
 */
async function fetchUsernames(
  client: SupabaseClient,
  playerIds: string[]
): Promise<Map<string, string>> {
  const names = new Map<string, string>();
  const unique = Array.from(new Set(playerIds));
  if (unique.length === 0) return names;

  const { data, error } = await client
    .from('players')
    .select('id, username')
    .in('id', unique);

  if (error) {
    // Names are cosmetic; the board still ranks correctly without them.
    reportSupabaseError('username lookup', error, { count: unique.length });
    return names;
  }
  for (const row of (data ?? []) as Array<{ id: string; username: string | null }>) {
    if (row.username) names.set(row.id, row.username);
  }
  return names;
}

function toEntries(runs: RankedRun[], names: Map<string, string>): LeaderboardEntry[] {
  return runs.map((run) => ({
    rank: run.rank,
    playerId: run.playerId,
    playerName: names.get(run.playerId) || `Player ${run.playerId.slice(0, 6)}`,
    score: run.score,
    dynasty: run.dynasty,
    achievedAt: run.achievedAt,
  }));
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);

    const type = (searchParams.get('type') || 'global') as LeaderboardType;
    const view = (searchParams.get('view') || 'board') as LeaderboardView;
    const dynasty = searchParams.get('dynasty');
    const rawLimit = parseInt(searchParams.get('limit') || '50', 10);
    const rawOffset = parseInt(searchParams.get('offset') || '0', 10);
    const limit = Math.min(Math.max(Number.isNaN(rawLimit) ? 50 : rawLimit, 1), 100);
    const offset = Math.max(Number.isNaN(rawOffset) ? 0 : rawOffset, 0);

    if (!['global', 'weekly', 'daily'].includes(type)) {
      return NextResponse.json({ error: 'Invalid type' }, { status: 400 });
    }
    if (!['board', 'you'].includes(view)) {
      return NextResponse.json({ error: 'Invalid view' }, { status: 400 });
    }
    if (dynasty && !['CYBER', 'PRIMAL', 'COSMIC'].includes(dynasty)) {
      return NextResponse.json({ error: 'Invalid dynasty' }, { status: 400 });
    }

    // WP-0.06 / GT §13: the accounts a stranger is not shown. Read once, used
    // twice - pushed into the query, then re-applied by the pure gate.
    const { ids: excludedPlayerIds } = await excludedCohortPlayerIds(supabase);

    const window: EligibilityWindow = {
      windowStart: boardWindowStart(type),
      excludedPlayerIds,
    };

    const viewerPlayerId = await resolveViewerPlayerId(
      supabase,
      request.headers.get('authorization')
    );

    const scan = await scanEligibleRuns(
      supabase,
      window.windowStart,
      dynasty,
      excludedPlayerIds
    );
    if ('error' in scan) {
      reportSupabaseError('session scan', scan.error, { type, dynasty });
      return NextResponse.json({ error: 'Failed to fetch leaderboard' }, { status: 500 });
    }

    const board = buildBoard(scan.rows, window);
    const viewer = viewerPosition(board, viewerPlayerId);
    const slice = youCenteredSlice(board, viewerPlayerId);

    const rendered: RankedRun[] =
      view === 'you' ? slice.entries : board.slice(offset, offset + limit);

    // One name lookup covers everything the response renders
    const renderedIds = Array.from(
      new Set([...rendered, ...slice.top, ...slice.window].map((run) => run.playerId))
    );
    const names = await fetchUsernames(supabase, renderedIds);
    const identities = await getIdentitiesForPlayers(supabase, renderedIds);

    const decorate = (runs: RankedRun[]) =>
      applyIdentities(toEntries(runs, names), identities);

    const response: LeaderboardResponse = {
      type,
      view,
      dynasty: dynasty || 'all',
      contentVersion: LEADERBOARD_CONTENT_VERSION,
      entries: decorate(rendered),
      top: decorate(slice.top),
      window: decorate(slice.window),
      viewer,
      total: board.length,
      truncated: scan.truncated,
    };

    return NextResponse.json(response);
  } catch (error) {
    reportSupabaseError('request', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

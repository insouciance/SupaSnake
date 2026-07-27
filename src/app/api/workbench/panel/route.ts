/**
 * GET /api/workbench/panel — the facts a build plan is computed from (WP-2.08).
 *
 * The Workbench's two advantages over any community calculator are that it
 * reads the player's REAL inventory and that it knows the real week. Both of
 * those are server facts, so this is the one read the surface needs: the
 * player's snakes with their lineage and traits, the account dials the FTUE
 * ramp and the gene pool are derived from, the run lengths the three
 * projection bases are drawn from, and the two live contexts to plan against.
 *
 * ── CONTRACT ───────────────────────────────────────────────────────────────
 *
 * Request:  GET /api/workbench/panel
 *           Authorization: Bearer <supabase access token>   (required)
 *           No query parameters. Every context is derived from the server's
 *           UTC calendar; there is no parameter through which a client could
 *           select or assert a week (Rule 11).
 *
 * 200 response:
 * {
 *   live: boolean,
 *   snakes: Array<{ id, name, dynasty, generation, traits, lineage,
 *                   masteryLevel, equipped }>,
 *   account: { bankedRuns, ownedVariants, seasonalGeneIds, gauntletBan,
 *              runFoods },
 *   contexts: Array<{ id, name, summary, anomaly, clauses }>
 * }
 *
 * 401 / 404 exactly as every sibling read route.
 *
 * ── WHAT THIS ROUTE DOES NOT DO ────────────────────────────────────────────
 *
 * It computes nothing and it mutates nothing. There is no INSERT, UPDATE or
 * RPC-with-side-effects anywhere below, so no amount of traffic to a planning
 * screen can move a balance (Rule 11). The projections, tiers and offer shares
 * are all computed in the browser by `@/shared/game/workbench`, from these
 * facts — which is what makes them checkable against the engine by the parity
 * suite rather than against a second server implementation.
 *
 * `runFoods` is the ONLY history returned, and only from completed earned
 * runs: the median and best projection bases must come from run lengths the
 * player has actually reached, because a calculator that projected against a
 * number they have never hit would be selling a fantasy.
 */

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import * as Sentry from '@sentry/nextjs';
import { getGenomeRunFacts, lineageFromRows } from '@/lib/server/genome';
import { getGauntletBan } from '@/lib/server/gauntlet';
import { getMasteryXpStrict } from '@/lib/server/mastery';
import { getSeasonalGeneIds } from '@/lib/server/season';
import { ensureCurrentSerpentWeek } from '@/lib/server/serpent';
import { serpentWeekCondition, signalDayCondition } from '@/lib/server/worldCondition';
import { levelForXp } from '@/shared/game/mastery';
import { normalizeDynastyName, type DynastyName } from '@/shared/game/rulesets';
import { sanitizeTraits } from '@/shared/game/traits';
import { signalDayKey } from '@/shared/game/signal';
import {
  NEUTRAL_CONDITION,
  worldConditionName,
  worldConditionSummary,
  type WorldCondition,
} from '@/shared/game/worldCondition';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

/** How many recent runs the median and best bases are drawn from. */
const RUN_HISTORY_LIMIT = 30;

/** Rule 11: every Supabase error is checked AND reported. */
function reportError(scope: string, error: unknown, extra: Record<string, unknown> = {}) {
  console.error(`Workbench panel ${scope} error:`, { ...extra, error });
  Sentry.captureException(
    error instanceof Error ? error : new Error(`Workbench panel ${scope} error`),
    { extra: { scope, ...extra, error } }
  );
}

function contextEntry(id: string, label: string, condition: WorldCondition) {
  return {
    id,
    label,
    name: worldConditionName(condition),
    summary: worldConditionSummary(condition),
    anomaly: condition.anomaly,
    clauses: condition.clauses.map((clause) => clause.id),
  };
}

export async function GET(request: NextRequest) {
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

    const { data: player, error: playerError } = await supabase
      .from('players')
      .select('id')
      .eq('user_id', user.id)
      .single();
    if (playerError || !player) {
      if (playerError) reportError('player read', playerError, { userId: user.id });
      return NextResponse.json({ error: 'Player not found' }, { status: 404 });
    }

    // --- the inventory ------------------------------------------------------
    const { data: snakeRows, error: snakeError } = await supabase
      .from('collected_snakes')
      .select('*, snake_variants(*, dynasties(name))')
      .eq('player_id', player.id)
      .order('acquired_at', { ascending: false });
    if (snakeError) {
      reportError('collection read', snakeError, { playerId: player.id });
      return NextResponse.json(
        { error: 'Could not read your collection — try again' },
        { status: 503 }
      );
    }

    // --- the account dials --------------------------------------------------
    const runFacts = await getGenomeRunFacts(supabase, player.id);
    if (!runFacts.ok) {
      reportError('genome run facts', runFacts.error, {
        playerId: player.id,
        reason: runFacts.reason,
      });
      return NextResponse.json(
        { error: 'Could not read your run history — try again' },
        { status: 503 }
      );
    }

    // The three projection bases.
    //
    // WHERE RUN LENGTH ACTUALLY LIVES, which is not where you would guess:
    // `game_sessions` has never carried a foods column. The server-validated
    // food count is written into the `game_reward` economy transaction's
    // metadata at settlement, so that audit row is the only record of how long
    // a run was — and it is a server-written number, which is the property
    // that matters. The consequence is stated rather than hidden: the sample
    // covers runs that paid DNA, so a zero-payout run is absent from it. That
    // is why every projection carries its sample size on screen.
    const { data: runRows, error: runError } = await supabase
      .from('economy_transactions')
      .select('metadata, created_at')
      .eq('player_id', player.id)
      .eq('source_type', 'game_reward')
      .order('created_at', { ascending: false })
      .limit(RUN_HISTORY_LIMIT);
    if (runError) {
      reportError('run history read', runError, { playerId: player.id });
      return NextResponse.json(
        { error: 'Could not read your run history — try again' },
        { status: 503 }
      );
    }
    const runFoods = (runRows ?? [])
      .map((row) => {
        const metadata = (row as { metadata?: unknown }).metadata;
        const foods =
          metadata && typeof metadata === 'object'
            ? (metadata as { food_count?: unknown }).food_count
            : null;
        return Number(foods ?? 0);
      })
      .filter((value) => Number.isFinite(value) && value > 0)
      .map((value) => Math.floor(value));

    const seasonalGeneIds = await getSeasonalGeneIds(supabase);

    // --- per-snake mastery, read once per dynasty --------------------------
    const snakes: Array<{
      id: string;
      name: string;
      dynasty: DynastyName;
      generation: number;
      traits: string[];
      lineage: ReturnType<typeof lineageFromRows>;
      masteryLevel: number;
      equipped: boolean;
    }> = [];
    const masteryByDynasty = new Map<DynastyName, number>();
    const banByDynasty = new Map<DynastyName, string | null>();

    for (const row of snakeRows ?? []) {
      const snake = row as Record<string, unknown>;
      const variant = (snake.snake_variants ?? null) as
        | { id?: string; name?: string; dynasties?: { name?: string } | null }
        | null;
      const dynastyLabel = variant?.dynasties?.name;
      // A row whose variant join is missing cannot be planned for — it has no
      // dynasty, so it has no gene pool. Dropped rather than guessed at.
      if (!dynastyLabel) continue;
      const dynasty = normalizeDynastyName(dynastyLabel);

      if (!masteryByDynasty.has(dynasty)) {
        const read = await getMasteryXpStrict(supabase, player.id, dynasty);
        if (!read.ok) {
          reportError('mastery read', read.error, { playerId: player.id, dynasty });
          return NextResponse.json(
            { error: 'Could not read your mastery — try again' },
            { status: 503 }
          );
        }
        masteryByDynasty.set(dynasty, levelForXp(read.xp));
      }
      if (!banByDynasty.has(dynasty)) {
        banByDynasty.set(dynasty, await getGauntletBan(supabase, player.id, dynasty));
      }

      const generation = Number(snake.generation ?? 1);
      snakes.push({
        id: String(snake.id ?? ''),
        name: String(variant?.name ?? 'Snake'),
        dynasty,
        generation: Number.isFinite(generation) && generation > 0 ? Math.floor(generation) : 1,
        traits: sanitizeTraits(snake.traits),
        lineage: lineageFromRows(snake, (variant ?? null) as Record<string, unknown> | null),
        masteryLevel: masteryByDynasty.get(dynasty) ?? 0,
        equipped: snake.is_equipped === true,
      });
    }

    // The ban the plan is read under. A player is in at most one Gauntlet at a
    // time; when their snakes span dynasties the equipped one's ban is the
    // honest default, and the surface names which snake it came from.
    const equipped = snakes.find((snake) => snake.equipped) ?? snakes[0] ?? null;
    const gauntletBan = equipped ? (banByDynasty.get(equipped.dynasty) ?? null) : null;

    // --- the contexts to plan against --------------------------------------
    const week = await ensureCurrentSerpentWeek(supabase);
    const contexts = [
      contextEntry('week', 'This week’s Serpent', serpentWeekCondition(week)),
      contextEntry('signal', 'Today’s Signal', signalDayCondition(signalDayKey(new Date()))),
      contextEntry('neutral', 'No condition', NEUTRAL_CONDITION),
    ];

    return NextResponse.json({
      live: true,
      snakes,
      account: {
        bankedRuns: runFacts.bankedRuns,
        ownedVariants: runFacts.ownedVariants,
        seasonalGeneIds,
        gauntletBan,
        runFoods,
      },
      contexts,
    });
  } catch (error) {
    reportError('unhandled', error);
    return NextResponse.json({ error: 'Failed to open the Workbench' }, { status: 500 });
  }
}

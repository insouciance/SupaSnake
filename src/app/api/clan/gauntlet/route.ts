/**
 * Clan Gauntlet API (Design v2 section 8)
 *
 * GET: research tree + current-week gauntlet state (scouting, blind picks,
 *      effective rules) for the authed player's clan. Blind-pick privacy is
 *      enforced in SQL (get_gauntlet only reveals opponent picks once both
 *      locked or the Wed 00:00 deadline passed).
 * POST actions (all server-authoritative SECURITY DEFINER RPCs):
 *      tithe        { amount }            - cap 500 DNA/member/week
 *      set_target   { nodeId }            - officers select the researched node
 *      submit_picks { dynasty, dynasty2?, modifier?, ban? } - blind, final
 *      substitute   { out, in }           - logistics_2 injury rule
 *
 * PRE-MIGRATION-020 SAFE: while the RPCs don't exist, GET returns
 * { live: false } and POST returns 503 - nothing errors, nothing breaks
 * the live duel surfaces.
 *
 * POPULATION-GATED (WP-1.02): every method answers `{ available: false }` at
 * 200 while `NEXT_PUBLIC_CLAN_GAUNTLET` is off. See `gateClosed` below for why
 * that is a 200 and not a 404, a 403 or a 503.
 */

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import * as Sentry from '@sentry/nextjs';
import { CLAN_GAUNTLET_ENABLED } from '@/lib/clan/config';
import { isMissingGauntletInfra } from '@/lib/server/gauntlet';
import {
  generateScoutNarration,
  getCachedInsight,
} from '@/lib/analyst/insights';
import {
  mapGauntletPayload,
  mapGauntletRpcError,
  type RpcGauntletPayload,
} from './utils';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || '',
  process.env.SUPABASE_SERVICE_ROLE_KEY || ''
);

/**
 * The population gate (Constitution §9.3, §12.1 slot 7).
 *
 * The Gauntlet is BUILT and HIDDEN, not deleted: "All four subsystems are
 * already built — hiding them costs a flag, and their state is preserved for
 * the day the gates open." Until `NEXT_PUBLIC_CLAN_GAUNTLET` is the exact
 * string "true", this route answers `{ available: false }` and touches no row.
 *
 * Answering rather than 404-ing matters for one specific reason: the closed
 * answer must not reach `get_gauntlet` or `get_clan_duel`, whose LAZY IN-SQL
 * SETTLEMENT is the only writer on these paths. A hidden layer that kept
 * settling would keep grading clans behind the curtain, which is exactly what
 * Rule 8 forbids happening at all.
 *
 * WHY 200 AND NOT 404, 403 OR 503 — for POST as much as for GET
 *
 * A closed gate is a deliberate configuration, not a fault. 503 says "this
 * broke, retry"; 403 says "you personally are not allowed"; 404 says "you
 * mistyped". All three would page an on-call engineer for a decision the
 * developer made on purpose, and all three describe the caller's situation
 * wrongly. 200 `{ available: false }` describes it exactly: the layer exists,
 * it is not open, here is the gate it is behind.
 *
 * The body carries NO `success` key, which is what keeps the POST honest: a
 * caller that checks `success` sees the write did not happen, and a caller
 * that only checks the status code cannot mistake the answer for a completed
 * mutation, because there is no result to read either. `live: false` rides
 * along so `GauntletPanel` — which renders nothing unless `live` — degrades to
 * its off state through the path it already has.
 *
 * The criteria for opening it are public and live in `CLAN_POPULATION_GATES`:
 * ≥25 clans with ≥3 weekly-active members, sustained four weeks.
 */
function gateClosed(): NextResponse {
  return NextResponse.json({ available: false, live: false, gate: 'clan_gauntlet' });
}

/**
 * Rule 11: every Supabase error is checked AND reported. A read that failed is
 * not the same answer as a read that came back empty — answering "Not in a
 * clan" when the connection dropped is a lie the player cannot distinguish
 * from the truth, and one Sentry never hears about.
 */
function reportError(scope: string, error: unknown, extra: Record<string, unknown> = {}) {
  console.error(`Clan gauntlet ${scope} error:`, { ...extra, error });
  Sentry.captureException(
    error instanceof Error ? error : new Error(`Clan gauntlet ${scope} error`),
    { extra: { scope, ...extra, error } }
  );
}

async function authAndMembership(request: NextRequest) {
  const authHeader = request.headers.get('authorization');
  if (!authHeader) {
    return { error: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) };
  }

  const token = authHeader.replace('Bearer ', '');
  const { data: { user }, error: authError } = await supabase.auth.getUser(token);

  if (authError || !user) {
    return { error: NextResponse.json({ error: 'Invalid token' }, { status: 401 }) };
  }

  const { data: membership, error: membershipError } = await supabase
    .from('clan_members')
    .select('clan_id')
    .eq('player_id', user.id)
    .maybeSingle();

  if (membershipError) {
    reportError('membership read', membershipError, { userId: user.id });
    return {
      error: NextResponse.json({ error: 'Failed to load gauntlet' }, { status: 500 }),
    };
  }

  if (!membership) {
    return { error: NextResponse.json({ error: 'Not in a clan' }, { status: 404 }) };
  }

  return { user, clanId: membership.clan_id as string };
}

export async function GET(request: NextRequest) {
  try {
    if (!CLAN_GAUNTLET_ENABLED) return gateClosed();
    const auth = await authAndMembership(request);
    if ('error' in auth) return auth.error;

    const { data, error } = await supabase.rpc('get_gauntlet', {
      p_clan_id: auth.clanId,
      p_user_id: auth.user.id,
    });

    if (error) {
      // Pre-020 window: the gauntlet is simply not live yet
      if (isMissingGauntletInfra(error)) {
        return NextResponse.json({ live: false, research: null, gauntlet: null });
      }
      reportError('get_gauntlet RPC', error, { clanId: auth.clanId });
      return NextResponse.json({ error: 'Failed to load gauntlet' }, { status: 500 });
    }

    const payload = mapGauntletPayload(data as RpcGauntletPayload);
    await attachScoutNarration(payload, auth.clanId);
    return NextResponse.json(payload);
  } catch (error) {
    reportError('GET', error);
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}

/**
 * Identity v1 I4 (section 9.2): decorate the scouting block with the
 * cached Analyst brief for this duel week, and — during the Mon–Wed
 * scouting window — kick off a non-blocking, once-per-duel-per-week
 * generation (the 025 dedup index + daily token budget inside the
 * Analyst are the cost guards). NEVER fails the gauntlet request:
 * pre-025 simply leaves narration null.
 */
async function attachScoutNarration(
  payload: ReturnType<typeof mapGauntletPayload>,
  clanId: string
): Promise<void> {
  try {
    const gauntlet = payload.gauntlet;
    if (!gauntlet || !gauntlet.scouting || !gauntlet.opponent) return;
    const weekStart = String(gauntlet.weekStart).slice(0, 10);
    const scopeRef = `${weekStart}:${gauntlet.duelId}`;

    const cached = await getCachedInsight(supabase, 'scout_narration', scopeRef, {
      clanId,
    });
    if (!cached.live) return;
    if (cached.row) {
      gauntlet.scouting.narration = cached.row.content.body;
      return;
    }

    // Scouting briefs are a Mon–Wed artifact (section 9.2); generation
    // is enqueue-style fire-and-forget so this request never waits.
    if (gauntlet.phase === 'picks_open' || gauntlet.phase === 'locked') {
      const input = {
        weekStart,
        opponent: gauntlet.opponent,
        scouting: {
          roster: gauntlet.scouting.roster.map((m) => ({
            name: m.name,
            mastery: m.mastery,
          })),
          lastPicks: gauntlet.scouting.lastPicks,
          detail: gauntlet.scouting.detail,
        },
      };
      void generateScoutNarration(supabase, {
        clanId,
        weekStart,
        duelId: gauntlet.duelId,
        input,
      }).catch((error) => {
        console.error('Scout narration generation failed:', error);
      });
    }
  } catch (error) {
    // Decoration is strictly additive — never break the gauntlet read
    console.error('Scout narration decoration failed:', error);
  }
}

export async function POST(request: NextRequest) {
  try {
    if (!CLAN_GAUNTLET_ENABLED) return gateClosed();
    const auth = await authAndMembership(request);
    if ('error' in auth) return auth.error;

    const body = await request.json();
    const { action } = body as { action?: string };

    let rpcName: string;
    let rpcArgs: Record<string, unknown>;

    if (action === 'tithe') {
      const amount = Number(body.amount);
      if (!Number.isFinite(amount) || !Number.isInteger(amount) || amount <= 0) {
        return NextResponse.json({ error: 'Invalid tithe amount' }, { status: 400 });
      }
      rpcName = 'contribute_tithe';
      rpcArgs = { p_user_id: auth.user.id, p_amount: amount };
    } else if (action === 'set_target') {
      if (typeof body.nodeId !== 'string' || !body.nodeId) {
        return NextResponse.json({ error: 'nodeId is required' }, { status: 400 });
      }
      rpcName = 'set_research_target';
      rpcArgs = { p_user_id: auth.user.id, p_node_id: body.nodeId };
    } else if (action === 'submit_picks') {
      if (typeof body.dynasty !== 'string' || !body.dynasty) {
        return NextResponse.json({ error: 'dynasty is required' }, { status: 400 });
      }
      rpcName = 'submit_gauntlet_picks';
      rpcArgs = {
        p_user_id: auth.user.id,
        p_dynasty: body.dynasty,
        p_modifier: typeof body.modifier === 'string' ? body.modifier : null,
        p_ban: typeof body.ban === 'string' ? body.ban : null,
        p_dynasty_2: typeof body.dynasty2 === 'string' ? body.dynasty2 : null,
      };
    } else if (action === 'substitute') {
      if (typeof body.out !== 'string' || typeof body.in !== 'string') {
        return NextResponse.json({ error: 'out and in are required' }, { status: 400 });
      }
      rpcName = 'substitute_gauntlet_roster';
      rpcArgs = { p_user_id: auth.user.id, p_out: body.out, p_in: body.in };
    } else {
      return NextResponse.json({ error: 'Invalid action' }, { status: 400 });
    }

    const { data, error } = await supabase.rpc(rpcName, rpcArgs);

    if (error) {
      if (isMissingGauntletInfra(error)) {
        return NextResponse.json(
          { error: 'The Clan Gauntlet is not live yet' },
          { status: 503 }
        );
      }
      const mapped = mapGauntletRpcError(error.message || '');
      if (mapped) {
        return NextResponse.json(
          { error: mapped.error, code: mapped.code },
          { status: mapped.status }
        );
      }
      reportError(`${rpcName} RPC`, error, { userId: auth.user.id, action });
      return NextResponse.json({ error: 'Request failed' }, { status: 500 });
    }

    return NextResponse.json({ success: true, result: data ?? null });
  } catch (error) {
    reportError('POST', error);
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}

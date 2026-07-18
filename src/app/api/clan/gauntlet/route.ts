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
 */

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
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

  const { data: membership } = await supabase
    .from('clan_members')
    .select('clan_id')
    .eq('player_id', user.id)
    .maybeSingle();

  if (!membership) {
    return { error: NextResponse.json({ error: 'Not in a clan' }, { status: 404 }) };
  }

  return { user, clanId: membership.clan_id as string };
}

export async function GET(request: NextRequest) {
  try {
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
      console.error('get_gauntlet RPC error:', error);
      return NextResponse.json({ error: 'Failed to load gauntlet' }, { status: 500 });
    }

    const payload = mapGauntletPayload(data as RpcGauntletPayload);
    await attachScoutNarration(payload, auth.clanId);
    return NextResponse.json(payload);
  } catch (error) {
    console.error('Clan gauntlet GET error:', error);
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
      console.error(`${rpcName} RPC error:`, error);
      return NextResponse.json({ error: 'Request failed' }, { status: 500 });
    }

    return NextResponse.json({ success: true, result: data ?? null });
  } catch (error) {
    console.error('Clan gauntlet POST error:', error);
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}

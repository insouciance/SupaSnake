/**
 * GET /api/codex — the Genome catalog, plus this player's discovery state.
 *
 * WP-2.07a turned the Codex from a reward into a reference. The rules of
 * the game — what a gene does, what it costs, what a splice becomes — are
 * now returned to every authenticated player from their first run. What
 * stays progressive is DISCOVERY: which of them *you* have found, when, and
 * whether you were first in the world.
 *
 * Mechanical routes are never withheld. The exact rollout flag selects one
 * complete catalog contract: legacy v1 while off, or v2 while on. Genome v2
 * ships every recipe, rule, and cost as public strategy information; the
 * preserved v1 contract continues masking undiscovered parent recipes while
 * discovery records history, prestige, and rewards in both versions. When v2
 * is live, recorded v1 entries move into a separate read-only archive rather
 * than disappearing or entering the active Research pool.
 *
 * `unlocked` / `bankedRuns` / `unlockAt` survive as LABEL inputs for the
 * discovery layer. They are no longer a catalog gate: a player at 0 banked
 * runs receives the whole catalog and is simply told where discovery
 * recording begins.
 */

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import * as Sentry from '@sentry/nextjs';
import { isMissingCodexInfra } from '@/lib/server/codex';
import { genomeV2Enabled } from '@/lib/features/genomeV2';
import { GAME_CONFIG } from '@/shared/config/game';
import { GENOME_V2_CONFIG } from '@/shared/game/genomeV2';
import {
  buildCodexPayload,
  sanitizeCodexRows,
  sanitizeWorldFirstRows,
} from './utils';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

/** Rule 11: every Supabase error is checked AND reported. */
function reportError(
  scope: string,
  error: unknown,
  extra: Record<string, unknown> = {}
) {
  console.error(`Codex ${scope} error:`, { ...extra, error });
  Sentry.captureException(
    error instanceof Error ? error : new Error(`Codex ${scope} error`),
    { extra: { scope, ...extra, error } }
  );
}

export async function GET(request: NextRequest) {
  try {
    const rulesVersion = genomeV2Enabled() ? 2 : 1;
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

    const { data: codexRows, error: codexError } = await supabase
      .from('player_codex')
      .select('discovery_type, entry_id, rules_version, first_discovered_at')
      .eq('player_id', player.id);
    if (codexError) {
      if (!isMissingCodexInfra(codexError)) {
        reportError('read', codexError, { playerId: player.id });
      }
      return NextResponse.json({ live: false });
    }

    // A LABEL for the discovery layer, not a gate on the catalog. Free Play
    // is excluded because a practice run banks nothing.
    const { count: bankedRuns, error: bankedRunsError } = await supabase
      .from('game_sessions')
      .select('*', { count: 'exact', head: true })
      .eq('player_id', player.id)
      .eq('extracted', true)
      .eq('validated', true)
      .eq('is_free_play', false)
      .not('ended_at', 'is', null);
    if (bankedRunsError) {
      reportError('banked-run read', bankedRunsError, { playerId: player.id });
      return NextResponse.json(
        { error: 'Failed to read Codex unlock' },
        { status: 500 }
      );
    }
    // The rollout flag selects a complete catalog contract. It never mixes
    // v2 records into the shipped v1 archive when the mechanic is off.
    const unlockAt = rulesVersion === 2
      ? GENOME_V2_CONFIG.ftue.strainTagsAtBankedRuns
      : GAME_CONFIG.genome.ftue.splicesAt;

    const { data: firstRows, error: firstError } = await supabase
      .from('codex_first_discoveries')
      .select('discovery_type, entry_id, rules_version, discovered_at');
    if (firstError && !isMissingCodexInfra(firstError)) {
      reportError('world-first read', firstError, { playerId: player.id });
    }

    // FINDING B-1: this query omitted `is_free_play = false` while the
    // banked-run count above included it. Free Play grants the ENTIRE gene
    // pool — including mastery and signature genes the player has not
    // earned — so every practice run inflated the "N picks · M banked" line
    // on cards for genes the player was never actually offered.
    const { data: sessionRows, error: sessionError } = await supabase
      .from('game_sessions')
      .select('extracted, genome')
      .eq('player_id', player.id)
      .eq('validated', true)
      .eq('is_free_play', false)
      .not('ended_at', 'is', null)
      .not('genome', 'is', null)
      .order('ended_at', { ascending: false })
      .limit(200);
    if (sessionError && !isMissingCodexInfra(sessionError)) {
      reportError('session stats read', sessionError, { playerId: player.id });
    }

    const { data: weaverRow, error: weaverError } = await supabase
      .from('player_cosmetics')
      .select('cosmetic_id')
      .eq('player_id', player.id)
      .eq('cosmetic_id', 'genome_weaver')
      .maybeSingle();
    if (weaverError && !isMissingCodexInfra(weaverError)) {
      reportError('cosmetic read', weaverError, { playerId: player.id });
    }

    return NextResponse.json({
      live: true,
      unlocked: (bankedRuns ?? 0) >= unlockAt,
      bankedRuns: bankedRuns ?? 0,
      unlockAt,
      ...buildCodexPayload(
        sanitizeCodexRows(codexRows),
        sanitizeWorldFirstRows(firstRows),
        sessionError ? [] : sessionRows ?? [],
        Boolean(weaverRow),
        rulesVersion
      ),
    });
  } catch (error) {
    reportError('API', error);
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}

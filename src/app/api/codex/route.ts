/** GET /api/codex - private discovery state + privacy-safe public firsts. */

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { isMissingCodexInfra } from '@/lib/server/codex';
import { GAME_CONFIG } from '@/shared/config/game';
import {
  buildCodexPayload,
  sanitizeCodexRows,
  sanitizeWorldFirstRows,
} from './utils';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

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
      return NextResponse.json({ error: 'Player not found' }, { status: 404 });
    }

    const { data: codexRows, error: codexError } = await supabase
      .from('player_codex')
      .select('discovery_type, entry_id, first_discovered_at')
      .eq('player_id', player.id);
    if (codexError) {
      if (!isMissingCodexInfra(codexError)) {
        console.error('Codex read error:', codexError);
      }
      return NextResponse.json({ live: false });
    }

    // FTUE is a server gate, not just hidden navigation. A direct URL must
    // not reveal the Genome catalog before the 15-bank Codex unlock.
    const { count: bankedRuns, error: bankedRunsError } = await supabase
      .from('game_sessions')
      .select('*', { count: 'exact', head: true })
      .eq('player_id', player.id)
      .eq('extracted', true)
      .eq('validated', true)
      .eq('is_free_play', false)
      .not('ended_at', 'is', null);
    if (bankedRunsError) {
      console.error('Codex FTUE read error:', bankedRunsError);
      return NextResponse.json({ error: 'Failed to read Codex unlock' }, { status: 500 });
    }
    const unlockAt = GAME_CONFIG.genome.ftue.splicesAt;
    if ((bankedRuns ?? 0) < unlockAt) {
      return NextResponse.json({
        live: true,
        unlocked: false,
        bankedRuns: bankedRuns ?? 0,
        unlockAt,
      });
    }

    const { data: firstRows, error: firstError } = await supabase
      .from('codex_first_discoveries')
      .select('discovery_type, entry_id, discovered_at');
    if (firstError && !isMissingCodexInfra(firstError)) {
      console.error('Codex world-first read error:', firstError);
    }

    const { data: sessionRows, error: sessionError } = await supabase
      .from('game_sessions')
      .select('extracted, genome')
      .eq('player_id', player.id)
      .eq('validated', true)
      .not('ended_at', 'is', null)
      .not('genome', 'is', null)
      .order('ended_at', { ascending: false })
      .limit(200);
    if (sessionError && !isMissingCodexInfra(sessionError)) {
      console.error('Codex session stats read error:', sessionError);
    }

    const { data: weaverRow, error: weaverError } = await supabase
      .from('player_cosmetics')
      .select('cosmetic_id')
      .eq('player_id', player.id)
      .eq('cosmetic_id', 'genome_weaver')
      .maybeSingle();
    if (weaverError && !isMissingCodexInfra(weaverError)) {
      console.error('Codex cosmetic read error:', weaverError);
    }

    return NextResponse.json({
      live: true,
      unlocked: true,
      ...buildCodexPayload(
        sanitizeCodexRows(codexRows),
        sanitizeWorldFirstRows(firstRows),
        sessionError ? [] : sessionRows ?? [],
        Boolean(weaverRow)
      ),
    });
  } catch (error) {
    console.error('Codex API error:', error);
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}

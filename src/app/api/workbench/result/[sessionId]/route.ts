/**
 * Authenticated, read-only handoff from Results to Genome Research.
 *
 * The URL carries only the server-owned session UUID. Genome state is loaded
 * from the settled row after ownership and validation checks; it is never
 * serialized into navigation history or browser storage.
 */

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import * as Sentry from '@sentry/nextjs';
import { genomeV2Enabled } from '@/lib/features/genomeV2';
import { parseGenomeV2RunRecord } from '@/components/game/genome/genomeV2ResultsAdapter';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL ?? '',
  process.env.SUPABASE_SERVICE_ROLE_KEY ?? ''
);

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function json(body: unknown, init?: { status?: number }) {
  const response = NextResponse.json(body, init);
  response.headers.set('Cache-Control', 'private, no-store, max-age=0');
  return response;
}

function report(scope: string, error: unknown, extra: Record<string, unknown> = {}) {
  console.error(`Genome Research ${scope} failed:`, { ...extra, error });
  Sentry.captureException(
    error instanceof Error ? error : new Error(`Genome Research ${scope} failed`),
    { extra: { scope, ...extra, error } }
  );
}

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ sessionId: string }> }
) {
  if (!genomeV2Enabled()) return json({ error: 'Not found' }, { status: 404 });

  const authHeader = request.headers.get('authorization');
  if (!authHeader?.startsWith('Bearer ')) {
    return json({ error: 'Unauthorized' }, { status: 401 });
  }
  const { sessionId } = await context.params;
  if (!UUID_RE.test(sessionId)) {
    return json({ error: 'A valid session is required' }, { status: 400 });
  }

  const token = authHeader.slice('Bearer '.length);
  const { data: auth, error: authError } = await supabase.auth.getUser(token);
  if (authError || !auth.user) {
    return json({ error: 'Invalid token' }, { status: 401 });
  }

  const { data: player, error: playerError } = await supabase
    .from('players')
    .select('id')
    .eq('user_id', auth.user.id)
    .maybeSingle();
  if (playerError) {
    report('player read', playerError, { userId: auth.user.id });
    return json({ error: 'Could not read player' }, { status: 503 });
  }
  if (!player) return json({ error: 'Player not found' }, { status: 404 });

  const { data: run, error: runError } = await supabase
    .from('game_sessions')
    .select('id, player_id, ended_at, validated, genome')
    .eq('id', sessionId)
    .eq('player_id', player.id)
    .maybeSingle();
  if (runError) {
    report('session read', runError, { playerId: player.id, sessionId });
    return json({ error: 'Could not read run' }, { status: 503 });
  }
  if (!run) return json({ error: 'Run not found' }, { status: 404 });
  if (typeof run.ended_at !== 'string' || run.validated !== true) {
    return json({ error: 'Run is not settled' }, { status: 409 });
  }

  const genome = parseGenomeV2RunRecord(run.genome);
  if (!genome) {
    return json({ error: 'This run has no completed Genome v2 record' }, { status: 422 });
  }

  return json({ sessionId: run.id, genome });
}

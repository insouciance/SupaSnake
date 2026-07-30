import { NextRequest } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import * as Sentry from '@sentry/nextjs';
import { readCareerPulse } from '@/lib/server/careerPulse';
import { isMissingRunImpactInfra } from '@/lib/server/runImpact';
import { progressionJson } from '@/lib/server/noStoreResponse';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

async function playerFor(request: NextRequest) {
  const authHeader = request.headers.get('authorization');
  if (!authHeader) return { response: progressionJson({ error: 'Unauthorized' }, { status: 401 }) };
  const token = authHeader.replace('Bearer ', '');
  const { data: auth, error: authError } = await supabase.auth.getUser(token);
  if (authError || !auth.user) {
    return { response: progressionJson({ error: 'Invalid token' }, { status: 401 }) };
  }
  const { data: player, error } = await supabase
    .from('players')
    .select('id')
    .eq('user_id', auth.user.id)
    .maybeSingle();
  if (error) {
    console.error('Career Pulse player lookup failed:', error);
    Sentry.captureException(new Error(`career pulse player lookup failed: ${error.message}`));
    return { response: progressionJson({ error: 'Could not read player' }, { status: 503 }) };
  }
  if (!player) return { response: progressionJson({ error: 'Player not found' }, { status: 404 }) };
  return { playerId: player.id as string, userId: auth.user.id };
}

export async function GET(request: NextRequest) {
  const auth = await playerFor(request);
  if ('response' in auth) return auth.response;
  const result = await readCareerPulse(supabase, auth.playerId, auth.userId);
  if (!result.ok) {
    console.error('Career Pulse read failed:', {
      playerId: auth.playerId,
      scope: result.scope,
      error: result.error,
    });
    Sentry.captureException(result.error, {
      extra: { playerId: auth.playerId, scope: result.scope },
    });
    return progressionJson({ error: 'Could not read Career Pulse' }, { status: 503 });
  }
  return progressionJson({ careerPulse: result.pulse });
}

export async function PATCH(request: NextRequest) {
  const auth = await playerFor(request);
  if ('response' in auth) return auth.response;
  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
  if (!body || (!('candidateId' in body))) {
    return progressionJson({ error: 'candidateId is required' }, { status: 400 });
  }
  const candidateId = body.candidateId;
  if (candidateId !== null && typeof candidateId !== 'string') {
    return progressionJson({ error: 'candidateId must be a string or null' }, { status: 400 });
  }

  if (candidateId === null) {
    const { error } = await supabase
      .from('player_pinned_pursuits')
      .delete()
      .eq('player_id', auth.playerId);
    if (error && !isMissingRunImpactInfra(error)) {
      console.error('Pinned pursuit clear failed:', { playerId: auth.playerId, error });
      return progressionJson({ error: 'Could not clear pursuit' }, { status: 503 });
    }
    return progressionJson({ pinnedPursuit: null });
  }

  const current = await readCareerPulse(supabase, auth.playerId, auth.userId);
  if (!current.ok) {
    return progressionJson({ error: 'Could not validate pursuit' }, { status: 503 });
  }
  const candidate = current.pulse.pursuitCandidates.find(
    (entry) => entry.id === candidateId
  );
  if (!candidate) {
    return progressionJson({ error: 'Pursuit candidate is no longer available' }, { status: 409 });
  }
  const { data, error } = await supabase
    .from('player_pinned_pursuits')
    .upsert(
      {
        player_id: auth.playerId,
        candidate_id: candidate.id,
        pillar: candidate.pillar,
        kind: candidate.kind,
        target_id: candidate.targetId,
        headline: candidate.headline,
        destination: candidate.destination,
        pinned_at: new Date().toISOString(),
      },
      { onConflict: 'player_id' }
    )
    .select('pinned_at')
    .single();
  if (error) {
    console.error('Pinned pursuit write failed:', { playerId: auth.playerId, error });
    return progressionJson({ error: 'Could not pin pursuit' }, { status: 503 });
  }
  return progressionJson({
    pinnedPursuit: { ...candidate, pinnedAt: String(data.pinned_at) },
  });
}

import { NextRequest } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import * as Sentry from '@sentry/nextjs';
import { loadRunImpactEnvelope } from '@/lib/server/runImpact';
import { progressionJson } from '@/lib/server/noStoreResponse';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export async function GET(request: NextRequest) {
  const authHeader = request.headers.get('authorization');
  if (!authHeader) return progressionJson({ error: 'Unauthorized' }, { status: 401 });
  const token = authHeader.replace('Bearer ', '');
  const { data: auth, error: authError } = await supabase.auth.getUser(token);
  if (authError || !auth.user) {
    return progressionJson({ error: 'Invalid token' }, { status: 401 });
  }

  const sessionId = request.nextUrl.searchParams.get('sessionId');
  if (!sessionId || !UUID_RE.test(sessionId)) {
    return progressionJson({ error: 'A valid sessionId is required' }, { status: 400 });
  }

  const { data: player, error: playerError } = await supabase
    .from('players')
    .select('id')
    .eq('user_id', auth.user.id)
    .maybeSingle();
  if (playerError) {
    console.error('Impact receipt player lookup failed:', playerError);
    Sentry.captureException(new Error(`impact player lookup failed: ${playerError.message}`));
    return progressionJson({ error: 'Could not read player' }, { status: 503 });
  }
  if (!player) return progressionJson({ error: 'Player not found' }, { status: 404 });

  const impact = await loadRunImpactEnvelope(supabase, player.id, sessionId);
  if (!impact) {
    return progressionJson({ error: 'Impact receipt not found' }, { status: 404 });
  }
  return progressionJson({ impact });
}

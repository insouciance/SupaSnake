import { NextRequest } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import * as Sentry from '@sentry/nextjs';
import { readLineageDossiers } from '@/lib/server/lineageCareer';
import { progressionJson } from '@/lib/server/noStoreResponse';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export async function GET(request: NextRequest) {
  const authHeader = request.headers.get('authorization');
  if (!authHeader) return progressionJson({ error: 'Unauthorized' }, { status: 401 });
  const token = authHeader.replace('Bearer ', '');
  const { data: auth, error: authError } = await supabase.auth.getUser(token);
  if (authError || !auth.user) {
    return progressionJson({ error: 'Invalid token' }, { status: 401 });
  }
  const { data: player, error: playerError } = await supabase
    .from('players')
    .select('id')
    .eq('user_id', auth.user.id)
    .maybeSingle();
  if (playerError) {
    console.error('Lineage career player lookup failed:', playerError);
    Sentry.captureException(new Error(`lineage career player lookup failed: ${playerError.message}`));
    return progressionJson({ error: 'Could not read player' }, { status: 503 });
  }
  if (!player) return progressionJson({ error: 'Player not found' }, { status: 404 });

  const result = await readLineageDossiers(supabase, player.id);
  if (!result.ok) {
    Sentry.captureException(result.error, { extra: { playerId: player.id } });
    return progressionJson({ error: 'Could not read lineage history' }, { status: 503 });
  }
  return progressionJson({ live: result.available, dossiers: result.dossiers });
}

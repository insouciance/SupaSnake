import { NextRequest } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import * as Sentry from '@sentry/nextjs';
import type {
  AttentionKind,
  AttentionStatus,
  ProgressionAttentionItem,
  ProgressionDestination,
} from '@/shared/progression/runImpact';
import { isMissingRunImpactInfra } from '@/lib/server/runImpact';
import { progressionJson } from '@/lib/server/noStoreResponse';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const TRANSITIONS = new Set(['seen', 'resolved', 'dismissed']);

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
    console.error('Attention player lookup failed:', error);
    Sentry.captureException(new Error(`attention player lookup failed: ${error.message}`));
    return { response: progressionJson({ error: 'Could not read player' }, { status: 503 }) };
  }
  if (!player) {
    return { response: progressionJson({ error: 'Player not found' }, { status: 404 }) };
  }
  return { playerId: player.id as string };
}

function itemFromRow(row: Record<string, unknown>): ProgressionAttentionItem {
  const item: ProgressionAttentionItem = {
    id: String(row.id),
    kind: row.attention_kind as AttentionKind,
    status: row.status as AttentionStatus,
    destination: row.destination as ProgressionDestination,
    headline: String(row.headline),
    source: { type: String(row.source_type), id: String(row.source_id) },
    createdAt: String(row.created_at),
  };
  if (typeof row.detail === 'string') item.detail = row.detail;
  if (typeof row.moment_id === 'string') item.momentId = row.moment_id;
  if (typeof row.seen_at === 'string') item.seenAt = row.seen_at;
  if (typeof row.resolved_at === 'string') item.resolvedAt = row.resolved_at;
  return item;
}

export async function GET(request: NextRequest) {
  const auth = await playerFor(request);
  if ('response' in auth) return auth.response;

  const includeClosed = request.nextUrl.searchParams.get('includeClosed') === 'true';
  let query = supabase
    .from('player_attention_items')
    .select('id, moment_id, source_type, source_id, attention_kind, status, destination, headline, detail, created_at, seen_at, resolved_at')
    .eq('player_id', auth.playerId)
    .order('created_at', { ascending: false });
  if (!includeClosed) query = query.in('status', ['unseen', 'seen']);
  const { data, error } = await query.limit(100);
  if (error) {
    if (isMissingRunImpactInfra(error)) return progressionJson({ items: [] });
    console.error('Attention list failed:', { playerId: auth.playerId, error });
    Sentry.captureException(new Error(`attention list failed: ${error.message}`));
    return progressionJson({ error: 'Could not read attention' }, { status: 503 });
  }
  const items = ((data ?? []) as Record<string, unknown>[])
    .filter(
      (row) =>
        includeClosed ||
        row.status === 'unseen' ||
        (row.attention_kind === 'action' && row.status === 'seen')
    )
    .map(itemFromRow);
  return progressionJson({ items });
}

export async function PATCH(request: NextRequest) {
  const auth = await playerFor(request);
  if ('response' in auth) return auth.response;
  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
  const id = typeof body?.id === 'string' ? body.id : '';
  const transition = typeof body?.transition === 'string' ? body.transition : '';
  if (!UUID_RE.test(id) || !TRANSITIONS.has(transition)) {
    return progressionJson({ error: 'A valid id and transition are required' }, { status: 400 });
  }
  const { data, error } = await supabase.rpc('transition_player_attention', {
    p_player_id: auth.playerId,
    p_item_id: id,
    p_transition: transition,
  });
  if (error) {
    if (/ATTENTION_NOT_FOUND/i.test(error.message ?? '')) {
      return progressionJson({ error: 'Attention item not found' }, { status: 404 });
    }
    if (/INVALID_ATTENTION_TRANSITION/i.test(error.message ?? '')) {
      return progressionJson({ error: 'Invalid attention transition' }, { status: 409 });
    }
    if (isMissingRunImpactInfra(error)) {
      return progressionJson({ error: 'Attention is not available' }, { status: 503 });
    }
    console.error('Attention transition failed:', { playerId: auth.playerId, id, error });
    Sentry.captureException(new Error(`attention transition failed: ${error.message}`));
    return progressionJson({ error: 'Could not update attention' }, { status: 503 });
  }
  return progressionJson({ item: data as ProgressionAttentionItem });
}

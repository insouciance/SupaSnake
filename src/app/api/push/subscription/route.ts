/**
 * Push subscription consent — POST/PATCH/DELETE /api/push/subscription.
 *
 * The only way a push subscription enters or leaves the database. Every method
 * requires an authenticated player: an anonymous visitor cannot subscribe, and
 * one player cannot alter another's device, because every write is scoped by
 * `player_id` as well as by endpoint (see `src/lib/push/subscriptions.ts`).
 *
 *   POST   — store or re-affirm a subscription. Requires an explicit,
 *            non-empty list of consented triggers; there is no default.
 *   PATCH  — change which of the two triggers this device wants. An empty
 *            list is valid and means "neither", without revoking the browser
 *            permission.
 *   DELETE — opt out entirely. Idempotent.
 *
 * FLAG OFF: every method answers 404, so no subscription can be stored on a
 * deployment where the feature is dark, and nothing accumulates that would
 * start sending the moment somebody armed the flag.
 *
 * MIGRATION NOT APPLIED: the store returns null and POST answers 503. Failing
 * closed is the correct direction — a subscription that was not stored simply
 * never receives anything.
 *
 * Route files may export only HTTP method handlers; every helper this needs
 * lives in `src/lib/push/`.
 */

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import * as Sentry from '@sentry/nextjs';
import { PWA_V1_ENABLED } from '@/lib/pwa/config';
import {
  isMissingPushInfra,
  revokeSubscription,
  setSubscriptionTriggers,
  storeSubscription,
  SubscriptionRejected,
  validateSubscription,
} from '@/lib/push/subscriptions';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || '',
  process.env.SUPABASE_SERVICE_ROLE_KEY || ''
);

async function resolvePlayerId(request: NextRequest): Promise<string | null> {
  const authHeader = request.headers.get('authorization');
  if (!authHeader) return null;

  const token = authHeader.replace('Bearer ', '');
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser(token);
  if (authError || !user) return null;

  const { data, error } = await supabase
    .from('players')
    .select('id')
    .eq('user_id', user.id)
    .single();

  if (error) {
    // PGRST116 is "no rows" — a signed-in user without a player row yet. That
    // is not an error worth reporting, it is a visitor who has not played.
    if (error.code !== 'PGRST116' && !isMissingPushInfra(error)) {
      console.error('Push subscription player lookup failed:', { userId: user.id, error });
      Sentry.captureException(new Error('Push subscription player lookup failed'), {
        extra: { userId: user.id, error },
      });
    }
    return null;
  }
  return typeof data?.id === 'string' ? data.id : null;
}

export async function POST(request: NextRequest) {
  if (!PWA_V1_ENABLED) return new NextResponse(null, { status: 404 });

  const playerId = await resolvePlayerId(request);
  if (!playerId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid body' }, { status: 400 });
  }

  const payload = (body ?? {}) as Record<string, unknown>;
  const keys = (payload.keys ?? {}) as Record<string, unknown>;

  let validated;
  try {
    validated = validateSubscription({
      endpoint: String(payload.endpoint ?? ''),
      p256dh: String(keys.p256dh ?? ''),
      auth: String(keys.auth ?? ''),
      triggers: Array.isArray(payload.triggers) ? payload.triggers.map(String) : [],
    });
  } catch (error) {
    if (error instanceof SubscriptionRejected) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    throw error;
  }

  const stored = await storeSubscription(supabase, playerId, validated);
  if (!stored) {
    return NextResponse.json({ error: 'Subscription storage unavailable' }, { status: 503 });
  }

  return NextResponse.json({ ok: true, triggers: stored.triggers });
}

export async function PATCH(request: NextRequest) {
  if (!PWA_V1_ENABLED) return new NextResponse(null, { status: 404 });

  const playerId = await resolvePlayerId(request);
  if (!playerId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid body' }, { status: 400 });
  }

  const payload = (body ?? {}) as Record<string, unknown>;
  const endpoint = String(payload.endpoint ?? '');
  if (!endpoint.startsWith('https://')) {
    return NextResponse.json({ error: 'endpoint is required' }, { status: 400 });
  }

  const triggers = Array.isArray(payload.triggers) ? payload.triggers.map(String) : [];
  const ok = await setSubscriptionTriggers(supabase, playerId, endpoint, triggers);
  if (!ok) return NextResponse.json({ error: 'Update unavailable' }, { status: 503 });

  return NextResponse.json({ ok: true });
}

export async function DELETE(request: NextRequest) {
  if (!PWA_V1_ENABLED) return new NextResponse(null, { status: 404 });

  const playerId = await resolvePlayerId(request);
  if (!playerId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const endpoint = request.nextUrl.searchParams.get('endpoint') ?? '';
  if (!endpoint.startsWith('https://')) {
    return NextResponse.json({ error: 'endpoint is required' }, { status: 400 });
  }

  const ok = await revokeSubscription(supabase, playerId, endpoint);
  if (!ok) return NextResponse.json({ error: 'Opt-out unavailable' }, { status: 503 });

  return NextResponse.json({ ok: true });
}

/**
 * POST /api/growth/dispatch/unsubscribe — leave the Dispatch.
 *
 * Always succeeds from the visitor's point of view. Leaving a list must
 * never depend on the state the list thinks you are in, and must never ask
 * a question first.
 */

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import * as Sentry from '@sentry/nextjs';
import { GROWTH_SURFACES_V1_ENABLED } from '@/lib/features/growth';
import { hashToken, isWellFormedToken } from '@/lib/growth/dispatchWaitlist';
import { WAITLIST_TABLE, isMissingDispatchInfra } from '@/lib/server/dispatch';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || '',
  process.env.SUPABASE_SERVICE_ROLE_KEY || ''
);

export async function POST(request: NextRequest) {
  if (!GROWTH_SURFACES_V1_ENABLED) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  try {
    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ outcome: 'invalid' }, { status: 400 });
    }

    const token = (body as Record<string, unknown> | null)?.token;
    if (!isWellFormedToken(token)) {
      return NextResponse.json({ outcome: 'invalid' }, { status: 400 });
    }

    const { error } = await supabase
      .from(WAITLIST_TABLE)
      .update({
        status: 'unsubscribed',
        unsubscribed_at: new Date().toISOString(),
        confirmed_at: null,
        confirmation_token_hash: null,
        confirmation_expires_at: null,
      })
      .eq('unsubscribe_token_hash', hashToken(token))
      .neq('status', 'unsubscribed');

    if (error) {
      if (isMissingDispatchInfra(error)) {
        return NextResponse.json({ outcome: 'unsubscribed' });
      }
      console.error('Dispatch unsubscribe failed:', error);
      Sentry.captureException(
        new Error(`Dispatch unsubscribe failed: ${error.message}`)
      );
      return NextResponse.json({ outcome: 'error' }, { status: 500 });
    }

    // An unknown or already-unsubscribed token gets the same answer: gone.
    return NextResponse.json({ outcome: 'unsubscribed' });
  } catch (error) {
    console.error('Dispatch unsubscribe failed:', error);
    Sentry.captureException(error);
    return NextResponse.json({ outcome: 'error' }, { status: 500 });
  }
}

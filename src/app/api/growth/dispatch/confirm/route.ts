/**
 * POST /api/growth/dispatch/confirm — the second half of double opt-in.
 *
 * POST, not GET, on purpose: mail scanners and link prefetchers follow GET
 * links, and a confirmation a machine can click is not a confirmation. The
 * emailed link opens `/dispatch/confirm`, which asks the human to press a
 * button that lands here.
 */

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import * as Sentry from '@sentry/nextjs';
import { GROWTH_SURFACES_V1_ENABLED } from '@/lib/features/growth';
import {
  decideConfirm,
  hashToken,
  isWellFormedToken,
} from '@/lib/growth/dispatchWaitlist';
import {
  WAITLIST_COLUMNS,
  WAITLIST_TABLE,
  isMissingDispatchInfra,
  waitlistRowFrom,
} from '@/lib/server/dispatch';

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

    const tokenHash = hashToken(token);
    const { data: row, error: readError } = await supabase
      .from(WAITLIST_TABLE)
      .select(WAITLIST_COLUMNS)
      .eq('confirmation_token_hash', tokenHash)
      .maybeSingle();

    if (readError) {
      if (isMissingDispatchInfra(readError)) {
        return NextResponse.json({ outcome: 'invalid' }, { status: 503 });
      }
      console.error('Dispatch confirm read failed:', readError);
      Sentry.captureException(
        new Error(`Dispatch confirm read failed: ${readError.message}`)
      );
      return NextResponse.json({ outcome: 'error' }, { status: 500 });
    }

    const waitlistRow = waitlistRowFrom(row);
    const outcome = decideConfirm(waitlistRow, new Date());

    if (outcome !== 'confirmed') {
      // 'invalid' and 'expired' are indistinguishable to an attacker holding
      // a guessed token, and 'already-confirmed' is only reachable with a
      // real one, so no membership is disclosed here.
      return NextResponse.json({ outcome }, { status: outcome === 'invalid' ? 400 : 200 });
    }

    // The write is guarded on the pending status as well as the token, so two
    // simultaneous confirmations cannot both claim the transition.
    const { data: updated, error: updateError } = await supabase
      .from(WAITLIST_TABLE)
      .update({
        status: 'confirmed',
        confirmed_at: new Date().toISOString(),
        confirmation_token_hash: null,
        confirmation_expires_at: null,
      })
      .eq('confirmation_token_hash', tokenHash)
      .eq('status', 'pending')
      .select('id');

    if (updateError) {
      console.error('Dispatch confirm write failed:', updateError);
      Sentry.captureException(
        new Error(`Dispatch confirm write failed: ${updateError.message}`)
      );
      return NextResponse.json({ outcome: 'error' }, { status: 500 });
    }

    if (!updated || updated.length === 0) {
      // Someone else won the race; the address is on the list either way.
      return NextResponse.json({ outcome: 'already-confirmed' });
    }

    return NextResponse.json({ outcome: 'confirmed' });
  } catch (error) {
    console.error('Dispatch confirm failed:', error);
    Sentry.captureException(error);
    return NextResponse.json({ outcome: 'error' }, { status: 500 });
  }
}

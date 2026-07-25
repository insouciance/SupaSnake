/**
 * POST /api/growth/dispatch — join the Dispatch waitlist (§11.6).
 *
 * Double opt-in: this endpoint only ever creates a *pending* row and mails a
 * confirmation link. Nothing here can produce a mailable address.
 *
 * The response is deliberately identical for every outcome — new address,
 * pending address, already-confirmed address, throttled address. Anything
 * else turns the endpoint into a membership oracle for arbitrary email
 * addresses.
 */

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import * as Sentry from '@sentry/nextjs';
import { GROWTH_SURFACES_V1_ENABLED } from '@/lib/features/growth';
import {
  confirmationExpiry,
  createToken,
  decideSubscribe,
  hashToken,
  normalizeEmail,
} from '@/lib/growth/dispatchWaitlist';
import { sendDispatchConfirmationEmail } from '@/lib/growth/dispatchEmail';
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

/** The one thing this endpoint ever says out loud. */
const ACCEPTED = {
  status: 'pending',
  message: 'Check your inbox for a confirmation link.',
} as const;

function clampChannel(value: unknown, max: number): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  return trimmed.slice(0, max);
}

export async function POST(request: NextRequest) {
  if (!GROWTH_SURFACES_V1_ENABLED) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  try {
    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ error: 'Invalid request' }, { status: 400 });
    }

    const payload = (body ?? {}) as Record<string, unknown>;
    const email = normalizeEmail(payload.email);
    if (!email) {
      return NextResponse.json(
        { error: 'Enter a valid email address.' },
        { status: 400 }
      );
    }

    const channel = clampChannel(payload.channel, 96);
    const landingPath = clampChannel(payload.landingPath, 128);

    const { data: existingRow, error: readError } = await supabase
      .from(WAITLIST_TABLE)
      .select(WAITLIST_COLUMNS)
      .eq('email', email)
      .maybeSingle();

    if (readError) {
      if (isMissingDispatchInfra(readError)) {
        return NextResponse.json(
          { error: 'The Dispatch is not live yet.' },
          { status: 503 }
        );
      }
      console.error('Dispatch waitlist read failed:', readError);
      Sentry.captureException(
        new Error(`Dispatch waitlist read failed: ${readError.message}`)
      );
      return NextResponse.json({ error: 'Could not sign you up.' }, { status: 500 });
    }

    const existing = waitlistRowFrom(existingRow);
    const now = new Date();
    const action = decideSubscribe(existing, now);

    if (action === 'already-confirmed' || action === 'throttled') {
      return NextResponse.json(ACCEPTED, { status: 202 });
    }

    const confirmationToken = createToken();
    // The unsubscribe token is rotated on every re-issue. Only its digest is
    // stored, so the previous raw token is unrecoverable — and an address
    // that has not confirmed has never received anything but a confirmation
    // mail, whose superseded link is meant to go stale.
    const unsubscribeToken = createToken();
    const record = {
      email,
      status: 'pending' as const,
      confirmation_token_hash: hashToken(confirmationToken),
      confirmation_sent_at: now.toISOString(),
      confirmation_expires_at: confirmationExpiry(now),
      unsubscribe_token_hash: hashToken(unsubscribeToken),
      confirmed_at: null,
      unsubscribed_at: null,
      channel,
      landing_path: landingPath,
    };

    if (existing === null) {
      const { error: insertError } = await supabase
        .from(WAITLIST_TABLE)
        .insert(record);
      if (insertError) {
        if (isMissingDispatchInfra(insertError)) {
          return NextResponse.json(
            { error: 'The Dispatch is not live yet.' },
            { status: 503 }
          );
        }
        // A concurrent request already created the row; the caller is told
        // the same thing either way and the other request sent the mail.
        if (insertError.code === '23505') {
          return NextResponse.json(ACCEPTED, { status: 202 });
        }
        console.error('Dispatch waitlist insert failed:', insertError);
        Sentry.captureException(
          new Error(`Dispatch waitlist insert failed: ${insertError.message}`)
        );
        return NextResponse.json({ error: 'Could not sign you up.' }, { status: 500 });
      }
    } else {
      // Re-issue: a pending row gets a fresh token; an unsubscribed row goes
      // back to pending, because leaving the list revokes consent and only a
      // new confirmation can restore it. The `neq` guard means a row that
      // was confirmed by a concurrent request is never pushed backwards.
      const { error: updateError } = await supabase
        .from(WAITLIST_TABLE)
        .update(record)
        .eq('id', existing.id)
        .neq('status', 'confirmed');
      if (updateError) {
        console.error('Dispatch waitlist reissue failed:', updateError);
        Sentry.captureException(
          new Error(`Dispatch waitlist reissue failed: ${updateError.message}`)
        );
        return NextResponse.json({ error: 'Could not sign you up.' }, { status: 500 });
      }
    }

    // Non-fatal by contract: a failed send leaves a pending row the visitor
    // can retry after the cooldown. It never turns into a confirmed address.
    await sendDispatchConfirmationEmail({
      to: email,
      confirmationToken,
      unsubscribeToken,
    });

    return NextResponse.json(ACCEPTED, { status: 202 });
  } catch (error) {
    console.error('Dispatch waitlist POST failed:', error);
    Sentry.captureException(error);
    return NextResponse.json({ error: 'Could not sign you up.' }, { status: 500 });
  }
}

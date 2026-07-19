/**
 * Contact form endpoint.
 *
 * Accepts messages from signed-in and signed-out visitors alike (GDPR and
 * DSA request channels must not require an account). Spam mitigation:
 * honeypot field, payload limits, and a short per-IP in-memory throttle.
 * Messages land in contact_messages (service role only, deny-all RLS).
 */

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import * as Sentry from '@sentry/nextjs';

const CATEGORIES = [
  'general',
  'support',
  'privacy',
  'content_report',
  'billing',
  'accessibility',
  'legal',
] as const;
type Category = (typeof CATEGORIES)[number];

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const THROTTLE_MS = 30_000;

// Best-effort per-instance throttle. Serverless instances don't share this,
// so it only blunts bursts; the honeypot and length checks do the rest.
const lastSubmission = new Map<string, number>();

function getSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { category, name, email, message, website } = body ?? {};

    // Honeypot: real users never fill the invisible "website" field.
    if (typeof website === 'string' && website.length > 0) {
      // Pretend success so bots don't adapt.
      return NextResponse.json({ ok: true });
    }

    if (!CATEGORIES.includes(category as Category)) {
      return NextResponse.json({ error: 'Invalid category' }, { status: 400 });
    }
    if (typeof email !== 'string' || !EMAIL_RE.test(email) || email.length > 320) {
      return NextResponse.json(
        { error: 'A valid e-mail address is required so we can reply' },
        { status: 400 }
      );
    }
    if (
      typeof message !== 'string' ||
      message.trim().length < 10 ||
      message.length > 5000
    ) {
      return NextResponse.json(
        { error: 'Message must be between 10 and 5000 characters' },
        { status: 400 }
      );
    }
    if (name !== undefined && (typeof name !== 'string' || name.length > 120)) {
      return NextResponse.json({ error: 'Invalid name' }, { status: 400 });
    }

    const ipKey =
      request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? 'unknown';
    const last = lastSubmission.get(ipKey);
    const now = Date.now();
    if (last !== undefined && now - last < THROTTLE_MS) {
      return NextResponse.json(
        { error: 'Please wait a moment before sending another message' },
        { status: 429 }
      );
    }
    lastSubmission.set(ipKey, now);
    // The throttle map is transient spam protection, not a data store: prune
    // aged entries so no IP-derived data accumulates beyond the window.
    lastSubmission.forEach((ts, key) => {
      if (now - ts > THROTTLE_MS) lastSubmission.delete(key);
    });

    const supabase = getSupabase();

    // Attach the account if the sender is signed in (optional).
    let userId: string | null = null;
    const authHeader = request.headers.get('authorization');
    if (authHeader) {
      const token = authHeader.replace('Bearer ', '');
      const {
        data: { user },
      } = await supabase.auth.getUser(token);
      userId = user?.id ?? null;
    }

    const { error } = await supabase.from('contact_messages').insert({
      category,
      name: typeof name === 'string' && name.trim() ? name.trim() : null,
      email: email.trim(),
      message: message.trim(),
      user_id: userId,
    });

    if (error) {
      Sentry.captureException(error);
      console.error('Contact form insert failed:', error.message);
      return NextResponse.json(
        { error: 'Could not submit your message. Please try again or e-mail us directly.' },
        { status: 500 }
      );
    }

    return NextResponse.json({ ok: true });
  } catch (err) {
    Sentry.captureException(err);
    console.error('Contact form error:', err);
    return NextResponse.json({ error: 'Invalid request' }, { status: 400 });
  }
}

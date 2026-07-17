/**
 * Anonymous-to-registered account upgrade.
 *
 * Attaches email + password to the CURRENT anonymous user via the admin API
 * (same user id, so all progress stays attached). Server-side because:
 * - the client updateUser flow anti-enumerates: adding an email that is
 *   already registered reports success without attaching anything, so the
 *   UI cannot tell the player what actually happened
 * - admin confirmation makes account creation instant and independent of
 *   mailer configuration/rate limits
 */

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || '',
  process.env.SUPABASE_SERVICE_ROLE_KEY || ''
);

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export async function POST(request: NextRequest) {
  try {
    const authHeader = request.headers.get('authorization');
    if (!authHeader) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const token = authHeader.replace('Bearer ', '');
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);
    if (authError || !user) {
      return NextResponse.json({ error: 'Invalid token' }, { status: 401 });
    }

    const isAnonymous =
      user.is_anonymous === true || user.app_metadata?.provider === 'anonymous';
    if (!isAnonymous) {
      return NextResponse.json(
        { error: 'account_already_registered' },
        { status: 400 }
      );
    }

    const body = await request.json();
    const email = typeof body.email === 'string' ? body.email.trim() : '';
    const password = typeof body.password === 'string' ? body.password : '';

    if (!EMAIL_RE.test(email)) {
      return NextResponse.json({ error: 'invalid_email' }, { status: 400 });
    }
    if (password.length < 8) {
      return NextResponse.json({ error: 'weak_password' }, { status: 400 });
    }

    // Call the GoTrue admin endpoint directly: supabase-js wraps the 5xx
    // duplicate-email response as an opaque AuthRetryableFetchError with an
    // empty message, hiding the Postgres 23505 body we need to distinguish
    // "email already registered" from real failures.
    const adminResponse = await fetch(
      `${process.env.NEXT_PUBLIC_SUPABASE_URL}/auth/v1/admin/users/${user.id}`,
      {
        method: 'PUT',
        headers: {
          apikey: process.env.SUPABASE_SERVICE_ROLE_KEY || '',
          Authorization: `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY || ''}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ email, password, email_confirm: true }),
      }
    );

    if (!adminResponse.ok) {
      const adminBody = await adminResponse.json().catch(() => ({}));
      const msg = String(adminBody.message ?? adminBody.msg ?? '').toLowerCase();
      const code = String(adminBody.code ?? adminBody.error_code ?? '');
      if (
        code === '23505' ||
        code === 'email_exists' ||
        msg.includes('already') ||
        msg.includes('duplicate key')
      ) {
        return NextResponse.json({ error: 'email_exists' }, { status: 409 });
      }
      console.error('Account upgrade failed:', {
        userId: user.id,
        status: adminResponse.status,
        body: adminBody,
      });
      return NextResponse.json({ error: 'upgrade_failed' }, { status: 500 });
    }

    return NextResponse.json({ success: true, emailConfirmed: true });
  } catch (err) {
    console.error('Account upgrade error:', err);
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}

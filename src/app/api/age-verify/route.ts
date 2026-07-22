/**
 * Age Verification API - Server-side age check
 * For cases where client-side verification isn't sufficient
 */

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import crypto from 'crypto';
import { MINIMUM_AGE } from '@/shared/config/legal';
import { AgeVerifySchema } from '@/lib/validation/schemas';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

const MIN_AGE = MINIMUM_AGE;

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const parsed = AgeVerifySchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Invalid birth year or month' },
        { status: 400 }
      );
    }

    const { birthYear: year, birthMonth: month } = parsed.data;
    const currentYear = new Date().getFullYear();

    if (isNaN(year) || year < 1900 || year > currentYear) {
      return NextResponse.json(
        { error: 'Invalid birth year' },
        { status: 400 }
      );
    }

    if (isNaN(month) || month < 1 || month > 12) {
      return NextResponse.json(
        { error: 'Invalid birth month' },
        { status: 400 }
      );
    }

    // Calculate age
    const today = new Date();
    const currentMonth = today.getMonth() + 1;
    let age = currentYear - year;
    if (currentMonth < month) {
      age--;
    }

    const isVerified = age >= MIN_AGE;

    // Return an opaque one-time token while storing only its digest. Birth
    // input is deliberately excluded from both values: year/month have too
    // little entropy to become anonymous merely by hashing them.
    const verificationToken = crypto.randomBytes(32).toString('base64url');
    const verificationHash = crypto
      .createHash('sha256')
      .update(verificationToken)
      .digest('hex');

    const now = new Date();
    const expiresAt = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);

    // Migration 008's exact schema uses session_id + age_verified. Fail
    // closed if the compliance record cannot be persisted.
    const { error: insertError } = await supabase
      .from('age_verifications')
      .insert({
        session_id: verificationHash,
        verification_hash: verificationHash,
        age_verified: isVerified,
        verified_at: now.toISOString(),
        expires_at: expiresAt.toISOString(),
      });

    if (insertError) {
      console.error('Age verification audit write failed:', insertError);
      return NextResponse.json(
        { error: 'Verification temporarily unavailable' },
        { status: 503, headers: { 'Cache-Control': 'no-store' } }
      );
    }

    if (!isVerified) {
      return NextResponse.json(
        {
          verified: false,
          message: `You must be at least ${MIN_AGE} years old to use this service`,
        },
        { status: 403, headers: { 'Cache-Control': 'no-store' } }
      );
    }

    return NextResponse.json(
      {
        verified: true,
        token: verificationToken,
        expiresAt: expiresAt.toISOString(),
      },
      { headers: { 'Cache-Control': 'no-store' } }
    );
  } catch (err) {
    console.error('Age verification error:', err);
    return NextResponse.json(
      { error: 'Verification failed' },
      { status: 500 }
    );
  }
}

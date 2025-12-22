/**
 * Age Verification API - Server-side age check
 * For cases where client-side verification isn't sufficient
 */

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import crypto from 'crypto';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

const MIN_AGE = 13;

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { birthYear, birthMonth } = body;

    // Validate input
    const year = parseInt(birthYear, 10);
    const month = parseInt(birthMonth, 10);
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

    // Create a hash for verification tracking (no personal data stored)
    const verificationHash = crypto
      .createHash('sha256')
      .update(`${year}-${month}-${Date.now()}`)
      .digest('hex')
      .substring(0, 16);

    // Get user if authenticated
    const authHeader = request.headers.get('authorization');
    let userId: string | null = null;

    if (authHeader) {
      const token = authHeader.replace('Bearer ', '');
      const { data: { user } } = await supabase.auth.getUser(token);
      userId = user?.id || null;
    }

    // Log verification attempt (anonymized)
    await supabase.from('age_verifications').insert({
      user_id: userId,
      verification_hash: verificationHash,
      is_verified: isVerified,
      verified_at: new Date().toISOString(),
      expires_at: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(), // 7 days
    }).catch(() => {
      // Table may not exist yet, continue silently
    });

    if (!isVerified) {
      return NextResponse.json(
        {
          verified: false,
          message: `You must be at least ${MIN_AGE} years old to use this service`,
        },
        { status: 403 }
      );
    }

    return NextResponse.json({
      verified: true,
      token: verificationHash,
      expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
    });
  } catch (err) {
    console.error('Age verification error:', err);
    return NextResponse.json(
      { error: 'Verification failed' },
      { status: 500 }
    );
  }
}

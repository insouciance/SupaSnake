/**
 * OAuth Callback Route - Handle OAuth redirects from Google/Apple
 */

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get('code');
  const error = searchParams.get('error');
  const errorDescription = searchParams.get('error_description');

  if (error) {
    const errorUrl = new URL('/login', origin);
    errorUrl.searchParams.set('error', errorDescription || error);
    return NextResponse.redirect(errorUrl);
  }

  if (code) {
    const { error: exchangeError } = await supabase.auth.exchangeCodeForSession(code);

    if (exchangeError) {
      const errorUrl = new URL('/login', origin);
      errorUrl.searchParams.set('error', exchangeError.message);
      return NextResponse.redirect(errorUrl);
    }

    const returnTo = searchParams.get('returnTo') || '/game';
    return NextResponse.redirect(new URL(returnTo, origin));
  }

  return NextResponse.redirect(new URL('/login', origin));
}

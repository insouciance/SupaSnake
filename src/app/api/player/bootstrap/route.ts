/**
 * FTUE v2 player bootstrap.
 *
 * The database RPC owns the transaction and all repair decisions. This route
 * only authenticates the caller and binds the operation to that user id.
 */

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { FTUE_V2_ENABLED } from '@/lib/ftue/config';
import type { FtueBootstrapResponse } from '@/lib/ftue/types';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

const NO_STORE_HEADERS = { 'Cache-Control': 'no-store' } as const;

export async function POST(request: NextRequest) {
  if (!FTUE_V2_ENABLED) {
    return NextResponse.json(
      { error: 'FTUE v2 is disabled' },
      { status: 404, headers: NO_STORE_HEADERS }
    );
  }

  try {
    const authHeader = request.headers.get('authorization');
    if (!authHeader?.startsWith('Bearer ')) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401, headers: NO_STORE_HEADERS }
      );
    }

    const token = authHeader.slice('Bearer '.length);
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser(token);

    if (authError || !user) {
      return NextResponse.json(
        { error: 'Invalid token' },
        { status: 401, headers: NO_STORE_HEADERS }
      );
    }

    const { data, error } = await supabase.rpc('bootstrap_player', {
      p_user_id: user.id,
    });

    if (error || !data) {
      console.error('FTUE bootstrap failed:', {
        userId: user.id,
        error,
      });
      const catalogUnavailable = /PRIMAL starter.+missing/i.test(
        error?.message ?? ''
      );
      return NextResponse.json(
        {
          error: catalogUnavailable
            ? 'Starter catalog is temporarily unavailable'
            : 'Could not prepare your player',
        },
        {
          status: catalogUnavailable ? 503 : 500,
          headers: NO_STORE_HEADERS,
        }
      );
    }

    const response: FtueBootstrapResponse = {
      ...(data as Omit<FtueBootstrapResponse, 'ftueV2'>),
      ftueV2: true,
    };

    return NextResponse.json(response, { headers: NO_STORE_HEADERS });
  } catch (error) {
    console.error('FTUE bootstrap route error:', error);
    return NextResponse.json(
      { error: 'Could not prepare your player' },
      { status: 500, headers: NO_STORE_HEADERS }
    );
  }
}

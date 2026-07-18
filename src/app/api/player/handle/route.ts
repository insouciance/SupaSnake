/**
 * Handle API (Player Identity v1 section 3).
 *
 * GET  /api/player/handle?check=<candidate>
 *   Live availability: format -> denylist (leet-normalized, mirroring
 *   claim_handle) -> case-insensitive taken check. { live: false }
 *   during the pre-migration-022 window - never a 500.
 *
 * POST /api/player/handle  { handle }
 *   The claim ceremony: rate-limited, then claim_handle decides
 *   (format/denylist/cooldown/race - the unique lower(handle) index is
 *   the race arbiter). Server authority: the client never writes
 *   players.handle.
 */

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { checkRateLimit } from '@/lib/server/rateLimit';
import { HANDLE_REGEX, normalizeHandle } from '@/lib/identity/handle';
import { isMissingIdentityInfra } from '@/lib/server/identity';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

async function getPlayer(request: NextRequest) {
  const authHeader = request.headers.get('authorization');
  if (!authHeader) return null;
  const token = authHeader.replace('Bearer ', '');
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser(token);
  if (error || !user) return null;

  const { data: player, error: playerError } = await supabase
    .from('players')
    .select('id')
    .eq('user_id', user.id)
    .single();
  if (playerError || !player) return null;
  return player as { id: string };
}

export async function GET(request: NextRequest) {
  try {
    const player = await getPlayer(request);
    if (!player) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const candidate = new URL(request.url).searchParams.get('check') ?? '';

    const rateCheck = await checkRateLimit(supabase, player.id, 'handle_check');
    if (!rateCheck.allowed) {
      return NextResponse.json(
        { error: 'Rate limited', retryAfterMs: rateCheck.retryAfterMs },
        { status: 429 }
      );
    }

    if (!HANDLE_REGEX.test(candidate)) {
      return NextResponse.json({
        live: true,
        available: false,
        reason: 'invalid_format',
      });
    }

    // Denylist (section 3.5): both kinds against the normalized candidate
    const { data: reserved, error: reservedError } = await supabase
      .from('reserved_handles')
      .select('pattern, match_mode');

    if (reservedError) {
      if (isMissingIdentityInfra(reservedError)) {
        return NextResponse.json({ live: false });
      }
      console.error('Reserved-handle read error:', reservedError);
      return NextResponse.json({ live: false });
    }

    const normalized = normalizeHandle(candidate);
    const denied = (reserved ?? []).some((row) =>
      row.match_mode === 'exact'
        ? normalized === row.pattern
        : normalized.includes(row.pattern)
    );
    if (denied) {
      return NextResponse.json({
        live: true,
        available: false,
        reason: 'reserved',
      });
    }

    // Case-insensitive taken check (escape _ - a LIKE wildcard)
    const { data: taken, error: takenError } = await supabase
      .from('players')
      .select('id')
      .ilike('handle', candidate.replace(/_/g, '\\_'))
      .limit(1);

    if (takenError) {
      if (isMissingIdentityInfra(takenError)) {
        return NextResponse.json({ live: false });
      }
      console.error('Handle availability read error:', takenError);
      return NextResponse.json({ live: false });
    }

    if ((taken ?? []).length > 0) {
      return NextResponse.json({
        live: true,
        available: false,
        reason: 'taken',
      });
    }

    return NextResponse.json({ live: true, available: true });
  } catch (err) {
    console.error('Handle check API error:', err);
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const player = await getPlayer(request);
    if (!player) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json().catch(() => ({}));
    const handle = typeof body?.handle === 'string' ? body.handle : '';

    const rateCheck = await checkRateLimit(supabase, player.id, 'handle_claim');
    if (!rateCheck.allowed) {
      return NextResponse.json(
        { error: 'Rate limited', retryAfterMs: rateCheck.retryAfterMs },
        { status: 429 }
      );
    }

    const { data, error } = await supabase.rpc('claim_handle', {
      p_player_id: player.id,
      p_handle: handle,
    });

    if (error) {
      if (isMissingIdentityInfra(error)) {
        return NextResponse.json(
          { error: 'Handles are not live yet — try again soon' },
          { status: 503 }
        );
      }
      console.error('claim_handle error:', { playerId: player.id, error });
      return NextResponse.json({ error: 'Claim failed' }, { status: 500 });
    }

    const result = (data ?? {}) as {
      success?: boolean;
      handle?: string;
      error?: string;
      next_change_at?: string;
    };

    if (result.success) {
      return NextResponse.json({ success: true, handle: result.handle });
    }

    const code = result.error ?? 'invalid_format';
    const status = code === 'invalid_format' ? 400
      : code === 'player_not_found' ? 404
      : 409;
    return NextResponse.json(
      {
        error: code,
        ...(result.next_change_at ? { nextChangeAt: result.next_change_at } : {}),
      },
      { status }
    );
  } catch (err) {
    console.error('Handle claim API error:', err);
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}

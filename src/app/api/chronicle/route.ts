/**
 * Own Chronicle API (Player Identity v1 section 7).
 *
 * GET /api/chronicle
 *   The caller's full career payload (records cabinet, PB timeline,
 *   collection log, season chapters, clan history) with a LAZY records
 *   refresh behind the records_refresh rate limit (60s) - viewing your
 *   own Chronicle recomputes at most once a minute (section 6.3).
 *
 * POST /api/chronicle { action: 'refresh' }
 *   The explicit "refresh records" button - same rate limit; 429 with
 *   retryAfterMs when inside the window.
 *
 * Pre-023 both degrade: records sections read null, requests never 500.
 */

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { checkRateLimit } from '@/lib/server/rateLimit';
import { refreshPlayerRecords } from '@/lib/server/records';
import { refreshLinkedRolesForPlayer } from '@/lib/server/discordSync';
import { buildChronicle, type ChroniclePlayerRow } from '@/lib/server/chronicle';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

async function resolvePlayer(
  request: NextRequest
): Promise<{ player: ChroniclePlayerRow } | { response: NextResponse }> {
  const authHeader = request.headers.get('authorization');
  if (!authHeader) {
    return {
      response: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }),
    };
  }
  const token = authHeader.replace('Bearer ', '');
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser(token);
  if (authError || !user) {
    return {
      response: NextResponse.json({ error: 'Invalid token' }, { status: 401 }),
    };
  }

  const { data: player, error: playerError } = await supabase
    .from('players')
    .select('id, user_id, created_at')
    .eq('user_id', user.id)
    .single();
  if (playerError || !player) {
    return {
      response: NextResponse.json({ error: 'Player not found' }, { status: 404 }),
    };
  }
  return { player: player as ChroniclePlayerRow };
}

export async function GET(request: NextRequest) {
  try {
    const resolved = await resolvePlayer(request);
    if ('response' in resolved) return resolved.response;
    const { player } = resolved;

    // Lazy refresh (section 6.3): at most once per rate window; a
    // denied window or a pre-023 miss is not an error - the payload
    // simply serves the last recompute.
    let refreshed = false;
    try {
      const rate = await checkRateLimit(supabase, player.id, 'records_refresh');
      if (rate.allowed) {
        refreshed = (await refreshPlayerRecords(supabase, player.id)) !== null;
        if (refreshed) {
          // Identity v1 section 8.4: Linked Roles metadata follows the
          // records recompute (non-fatal, no-op without a live link)
          await refreshLinkedRolesForPlayer(supabase, player.id);
        }
      }
    } catch (rateError) {
      console.error('Chronicle lazy refresh error:', rateError);
    }

    const payload = await buildChronicle(supabase, player, {
      publicView: false,
    });

    return NextResponse.json({ own: true, refreshed, ...payload });
  } catch (err) {
    console.error('Chronicle API error:', err);
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => ({}));
    if (body?.action !== 'refresh') {
      return NextResponse.json({ error: 'Invalid action' }, { status: 400 });
    }

    const resolved = await resolvePlayer(request);
    if ('response' in resolved) return resolved.response;
    const { player } = resolved;

    const rate = await checkRateLimit(supabase, player.id, 'records_refresh');
    if (!rate.allowed) {
      return NextResponse.json(
        { error: 'Rate limited', retryAfterMs: rate.retryAfterMs },
        { status: 429 }
      );
    }

    const result = await refreshPlayerRecords(supabase, player.id);
    if (!result) {
      // Pre-023 (or a transient failure): report not-live, never 500.
      return NextResponse.json({ success: false, live: false });
    }

    // Identity v1 section 8.4: metadata follows the recompute (non-fatal)
    await refreshLinkedRolesForPlayer(supabase, player.id);

    return NextResponse.json({
      success: true,
      live: true,
      legacyScore: result.legacyScore,
      records: result.records,
    });
  } catch (err) {
    console.error('Chronicle refresh API error:', err);
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}

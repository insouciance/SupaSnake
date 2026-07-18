/**
 * Public profile API (Player Identity v1 section 7): the read-only
 * Chronicle behind /p/[handle].
 *
 * GET /api/profile/[handle]
 *   No auth. Resolves the handle case-insensitively (claimed handles
 *   only - handler-NNNN derived names are never addressable, section
 *   3.2), serves the public-safe Chronicle payload (player_identity_view
 *   + Chronicle aggregates - nothing private), 404 for unknown or
 *   invalid handles, CDN-cached via s-maxage=60.
 *
 * Empty-state rule (section 7.2): a player with <5 earning runs serves
 * header + collection log only (limited: true).
 */

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { HANDLE_REGEX } from '@/lib/identity/handle';
import { buildChronicle, type ChroniclePlayerRow } from '@/lib/server/chronicle';
import { isMissingIdentityInfra } from '@/lib/server/identity';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

const CACHE_CONTROL = 'public, s-maxage=60, stale-while-revalidate=300';

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ handle: string }> }
) {
  try {
    const { handle } = await context.params;

    // Real handles only (section 3.1): the format CHECK is the type
    // level - anything else (including handler-NNNN derived names, which
    // contain '-') is a 404, not a lookup.
    if (!handle || !HANDLE_REGEX.test(handle)) {
      return NextResponse.json({ error: 'Profile not found' }, { status: 404 });
    }

    // Case-insensitive match on the claimed handle. ilike treats _ as a
    // single-char wildcard - escape it (handles allow no other
    // metacharacters by format).
    const { data: player, error: playerError } = await supabase
      .from('players')
      .select('id, user_id, created_at, handle')
      .ilike('handle', handle.replace(/_/g, '\\_'))
      .maybeSingle();

    if (playerError) {
      if (isMissingIdentityInfra(playerError)) {
        // Pre-022: no handle column - no profile can exist yet.
        return NextResponse.json({ error: 'Profile not found' }, { status: 404 });
      }
      console.error('Public profile lookup error:', playerError);
      return NextResponse.json({ error: 'Server error' }, { status: 500 });
    }
    if (!player) {
      return NextResponse.json({ error: 'Profile not found' }, { status: 404 });
    }

    const payload = await buildChronicle(
      supabase,
      player as ChroniclePlayerRow,
      { publicView: true }
    );

    return NextResponse.json(payload, {
      headers: { 'Cache-Control': CACHE_CONTROL },
    });
  } catch (err) {
    console.error('Public profile API error:', err);
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}

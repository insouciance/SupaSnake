/**
 * Breeding draft preview API (Constitution §8.2, R11).
 *
 * POST /api/breeding/draft
 *   { parent1_id, parent2_id, variant_id?, traits?, lineage_kind? }
 *   -> { success: true, draft: BreedingDraft }
 *
 * The draft is computed by the `breeding_draft` RPC — the SAME function
 * `breed_snakes` calls to decide what to write. There is no client-side
 * outcome and no second server path, so the preview a player is shown is
 * definitionally the child they receive. Nothing here rolls: given the same
 * parents and the same choices the RPC returns the same JSON every time.
 *
 * Read-only: the RPC is STABLE and writes nothing, so previewing costs a
 * player nothing and can be called on every keystroke of the draft board.
 */

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import * as Sentry from '@sentry/nextjs';
import { GAME_CONFIG } from '@/shared/config/game';
import { readBreedingChoices } from '../utils';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export async function POST(request: NextRequest) {
  try {
    const authHeader = request.headers.get('authorization');
    if (!authHeader) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const token = authHeader.replace('Bearer ', '');
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser(token);
    if (authError || !user) {
      return NextResponse.json({ error: 'Invalid token' }, { status: 401 });
    }

    const body = (await request.json()) as Record<string, unknown>;
    const parent1Id = typeof body.parent1_id === 'string' ? body.parent1_id : null;
    const parent2Id = typeof body.parent2_id === 'string' ? body.parent2_id : null;
    if (!parent1Id || !parent2Id) {
      return NextResponse.json({ error: 'Two parents required' }, { status: 400 });
    }
    if (parent1Id === parent2Id) {
      return NextResponse.json(
        { error: 'Cannot breed snake with itself' },
        { status: 400 }
      );
    }

    const { data: player, error: playerError } = await supabase
      .from('players')
      .select('id, dna')
      .eq('user_id', user.id)
      .single();
    if (playerError || !player) {
      if (playerError) {
        console.error('Player lookup failed for breeding draft:', playerError);
        Sentry.captureException(
          new Error(`breeding draft player lookup failed: ${playerError.message}`),
          { extra: { userId: user.id } }
        );
      }
      return NextResponse.json({ error: 'Player not found' }, { status: 404 });
    }

    const { data: draft, error: draftError } = await supabase.rpc(
      'breeding_draft',
      {
        p_player_id: player.id,
        p_parent1_id: parent1Id,
        p_parent2_id: parent2Id,
        p_allow_cross_dynasty: GAME_CONFIG.genome.crossDynastyBreeding,
        ...readBreedingChoices(body),
      }
    );

    if (draftError || !draft) {
      console.error('breeding_draft RPC error:', draftError);
      if (draftError) {
        Sentry.captureException(
          new Error(`breeding_draft RPC failed: ${draftError.message}`),
          { extra: { playerId: player.id, parent1Id, parent2Id } }
        );
      }
      return NextResponse.json(
        { error: draftError?.message || 'Draft unavailable' },
        { status: 400 }
      );
    }

    return NextResponse.json({ success: true, draft, dna: player.dna });
  } catch (err) {
    console.error('Breeding draft API error:', err);
    Sentry.captureException(err);
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}

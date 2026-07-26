/**
 * Equip API - Set a snake as the player's equipped snake
 * POST /api/collection/equip - Equip a snake for gameplay
 *
 * Server-authoritative: updates is_equipped flags in database
 *
 * ── Why this route retries 23505 ───────────────────────────────────────────
 *
 * `equip_snake` (migration 037) released the old snake and claimed the new
 * one in ONE `UPDATE ... SET is_equipped = (id = p_snake_id)`. Row order
 * inside an UPDATE is not guaranteed, so the statement can transiently hold
 * two rows with `is_equipped = true` — which the partial unique index
 * `idx_collected_one_equipped_per_player` rejects with 23505. That surfaced
 * to the player as an intermittent "Could not equip this snake."
 *
 * Migration 053 fixes the function with two ordered statements. Migrations in
 * this repo ship written-but-not-applied, so this route also retries ONCE on
 * 23505: the retry runs under the same per-player advisory lock the function
 * takes, sees a settled equipment state, and cannot race the same way twice.
 * The retry turns the hard failure into an invisible one before 053 lands,
 * and costs one wasted RPC after it.
 *
 * ── Error taxonomy ────────────────────────────────────────────────────────
 *
 *   ownership / P0001        404, no Sentry   the player asked for a snake
 *                                             that is not theirs
 *   23505                    retry once, then 409 + Sentry warning
 *   any other RPC error      500 + Sentry exception
 *   re-read failure          200. The equip COMMITTED. Answering 500 makes
 *                            the client roll back a change the database
 *                            already made, leaving the UI permanently wrong.
 */

import { NextRequest, NextResponse } from 'next/server';
import { createClient, type PostgrestError } from '@supabase/supabase-js';
import * as Sentry from '@sentry/nextjs';
import { z } from 'zod';
import type { OwnedSnake } from '@/shared/types/snake-data-model';
import { mapOwnedSnakeRow, getPlayerId } from '../utils';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

/** Postgres unique_violation — the one-equipped-snake partial index. */
const UNIQUE_VIOLATION = '23505';

/** plpgsql `RAISE EXCEPTION` — `equip_snake`'s "Snake not owned by player". */
const RAISE_EXCEPTION = 'P0001';

/** PostgREST "no rows returned by .single()" — an absence, not a fault. */
const NO_ROWS = 'PGRST116';

/**
 * Equip request schema
 * Validates snakeId is a valid UUID
 */
const EquipRequestSchema = z.object({
  snakeId: z.string().uuid('snakeId must be a valid UUID'),
});

export type EquipRequestInput = z.infer<typeof EquipRequestSchema>;

function reportError(
  scope: string,
  error: unknown,
  extra: Record<string, unknown> = {}
): void {
  console.error(`Equip ${scope} error:`, error, extra);
  Sentry.captureException(
    error instanceof Error ? error : new Error(`Equip ${scope} failed`),
    { extra: { scope, ...extra, error } }
  );
}

export async function POST(request: NextRequest) {
  try {
    // Verify authentication
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

    // Get player ID
    const playerId = await getPlayerId(user.id);
    if (!playerId) {
      return NextResponse.json({ error: 'Player not found' }, { status: 404 });
    }

    // Parse and validate request body
    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json(
        { error: 'Invalid JSON body' },
        { status: 400 }
      );
    }

    const parseResult = EquipRequestSchema.safeParse(body);
    if (!parseResult.success) {
      return NextResponse.json(
        {
          error: 'Validation failed',
          details: parseResult.error.issues.map((issue) => ({
            field: issue.path.join('.'),
            message: issue.message,
          })),
        },
        { status: 400 }
      );
    }

    const { snakeId } = parseResult.data;

    // Verify the snake belongs to the requesting user
    const { data: targetSnake, error: fetchError } = await supabase
      .from('collected_snakes')
      .select('id')
      .eq('id', snakeId)
      .eq('player_id', playerId)
      .single();

    if (fetchError || !targetSnake) {
      // "No rows" is the ordinary not-yours answer and is not an incident.
      // A coded failure that is NOT "no rows" is the database misbehaving,
      // and it gets reported even though the player still sees a 404.
      if (fetchError && fetchError.code && fetchError.code !== NO_ROWS) {
        reportError('ownership lookup', fetchError, { playerId, snakeId });
      }
      return NextResponse.json(
        { error: 'Snake not found in your collection' },
        { status: 404 }
      );
    }

    // One locked database operation normalizes equipment and synchronizes
    // player_settings.active_snake_id + selected_dynasty.
    let rpcError: PostgrestError | null = null;
    for (let attempt = 0; attempt < 2; attempt += 1) {
      const { error } = await supabase.rpc('equip_snake', {
        p_player_id: playerId,
        p_snake_id: snakeId,
      });
      rpcError = error;
      if (!error || error.code !== UNIQUE_VIOLATION) break;
    }

    if (rpcError) {
      if (rpcError.code === RAISE_EXCEPTION) {
        return NextResponse.json(
          { error: 'Snake not found in your collection' },
          { status: 404 }
        );
      }

      if (rpcError.code === UNIQUE_VIOLATION) {
        console.error('Equip lost the one-equipped race twice:', rpcError);
        Sentry.captureMessage(
          'equip_snake hit the one-equipped-per-player index twice',
          {
            level: 'warning',
            extra: { playerId, snakeId, code: rpcError.code },
          }
        );
        return NextResponse.json(
          { error: 'Another equip is in flight. Try again.' },
          { status: 409 }
        );
      }

      reportError('RPC', rpcError, { playerId, snakeId, code: rpcError.code });
      return NextResponse.json(
        { error: 'Failed to equip snake' },
        { status: 500 }
      );
    }

    // Wide join: the narrow `snake_variants(name, dynasties(name))` form
    // dropped rarity and the innate affinity, which degrades traitSlots to
    // the common-rarity default and nulls lineage on the row the client
    // then adopts.
    const { data: equippedRow, error: fetchEquippedError } = await supabase
      .from('collected_snakes')
      .select('*, snake_variants(*, dynasties(name))')
      .eq('id', snakeId)
      .eq('player_id', playerId)
      .single();

    if (fetchEquippedError || !equippedRow) {
      // The equip is committed. A 500 here would make the client roll its
      // optimistic update back over a change the database really made.
      console.error('Failed to read equipped snake:', fetchEquippedError);
      Sentry.captureMessage('Equip committed but the re-read failed', {
        level: 'warning',
        extra: { playerId, snakeId, error: fetchEquippedError },
      });
      return NextResponse.json({ success: true });
    }

    const equippedSnake: OwnedSnake = mapOwnedSnakeRow(equippedRow);

    return NextResponse.json({
      success: true,
      equippedSnake,
    });
  } catch (err) {
    reportError('handler', err);
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}

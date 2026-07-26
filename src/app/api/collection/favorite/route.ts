/**
 * Favorite API - pin a snake inside its variant's roster
 * POST /api/collection/favorite
 *
 * The Lab's heart control existed since the collection shipped and never
 * persisted anything: it toggled a `useState` that died with the sheet. It is
 * load-bearing now — `src/lib/collection/roster.ts` ranks favorited snakes
 * second, so the heart chooses which snake represents a variant on its card.
 *
 * `is_favorited` has existed on `collected_snakes` since migration 006, so
 * there is no migration here. It is a display preference, not economy or
 * progress, so it is a scoped column write rather than an RPC — but the write
 * is still service-role and still filtered by `player_id`, so one player can
 * never touch another's row.
 */

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import * as Sentry from '@sentry/nextjs';
import { z } from 'zod';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

/** PostgREST "no rows returned by .single()" — an absence, not a fault. */
const NO_ROWS = 'PGRST116';

const FavoriteRequestSchema = z.object({
  snakeId: z.string().uuid('snakeId must be a valid UUID'),
  favorited: z.boolean(),
});

export type FavoriteRequestInput = z.infer<typeof FavoriteRequestSchema>;

function reportError(
  scope: string,
  error: unknown,
  extra: Record<string, unknown> = {}
): void {
  console.error(`Favorite ${scope} error:`, error, extra);
  Sentry.captureException(
    error instanceof Error ? error : new Error(`Favorite ${scope} failed`),
    { extra: { scope, ...extra, error } }
  );
}

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

    const { data: player, error: playerError } = await supabase
      .from('players')
      .select('id')
      .eq('user_id', user.id)
      .single();

    if (playerError || !player) {
      if (playerError && playerError.code && playerError.code !== NO_ROWS) {
        reportError('player lookup', playerError, { userId: user.id });
      }
      return NextResponse.json({ error: 'Player not found' }, { status: 404 });
    }

    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
    }

    const parseResult = FavoriteRequestSchema.safeParse(body);
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

    const { snakeId, favorited } = parseResult.data;

    // The player_id filter is the ownership check: a row that is not theirs
    // matches nothing and the `.select().single()` returns no rows.
    const { data: updated, error: updateError } = await supabase
      .from('collected_snakes')
      .update({ is_favorited: favorited })
      .eq('id', snakeId)
      .eq('player_id', player.id)
      .select('id, is_favorited')
      .single();

    if (updateError || !updated) {
      if (updateError && updateError.code && updateError.code !== NO_ROWS) {
        reportError('update', updateError, { playerId: player.id, snakeId });
        return NextResponse.json(
          { error: 'Failed to update favorite' },
          { status: 500 }
        );
      }
      return NextResponse.json(
        { error: 'Snake not found in your collection' },
        { status: 404 }
      );
    }

    return NextResponse.json({
      success: true,
      snakeId: updated.id,
      favorited: updated.is_favorited === true,
    });
  } catch (err) {
    reportError('handler', err);
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}

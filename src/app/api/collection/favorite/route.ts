/**
 * Favorite API — choose one collection representative per dynasty
 * POST /api/collection/favorite
 *
 * The request names only an owned collected-snake row and the desired state.
 * `set_dynasty_favorite` derives ownership and dynasty in Postgres, serializes
 * same-player/same-dynasty writers, clears every replaced historical favorite,
 * and returns the exact mutation receipt. The route deliberately has no direct
 * UPDATE fallback: without that RPC, cross-tab writes would not be atomic.
 *
 * Favoriting selects this snake as the dynasty's sole favorite. Unfavoriting
 * clears only this snake. This is persistent identity state, so every response
 * is private/no-store and every successful value comes from the database.
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
/** plpgsql ownership refusal from set_dynasty_favorite. */
const EXPECTED_RULE_ERROR = 'P0001';
/** Deploy-before-migration / stale PostgREST schema-cache failures. */
const MISSING_RPC_CODES = new Set(['42883', 'PGRST202']);
const NO_STORE = 'private, no-store';

const FavoriteRequestSchema = z.object({
  snakeId: z.string().uuid('snakeId must be a valid UUID'),
  favorited: z.boolean(),
});

const FavoriteRpcResultSchema = z.object({
  snake_id: z.string().uuid(),
  favorited: z.boolean(),
  favorite_snake_id: z.string().uuid().nullable(),
  replaced_snake_ids: z.array(z.string().uuid()),
});

export type FavoriteRequestInput = z.infer<typeof FavoriteRequestSchema>;

function favoriteJson<T>(body: T, init: ResponseInit = {}) {
  const headers = new Headers(init.headers);
  headers.set('Cache-Control', NO_STORE);
  return NextResponse.json(body, { ...init, headers });
}

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
      return favoriteJson({ error: 'Unauthorized' }, { status: 401 });
    }

    const token = authHeader.replace('Bearer ', '');
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser(token);

    if (authError || !user) {
      return favoriteJson({ error: 'Invalid token' }, { status: 401 });
    }

    const { data: player, error: playerError } = await supabase
      .from('players')
      .select('id')
      .eq('user_id', user.id)
      .single();

    if (playerError) {
      if (playerError.code === NO_ROWS) {
        return favoriteJson({ error: 'Player not found' }, { status: 404 });
      }
      reportError('player lookup', playerError, { userId: user.id });
      return favoriteJson({ error: 'Failed to read player' }, { status: 500 });
    }
    if (!player) {
      return favoriteJson({ error: 'Player not found' }, { status: 404 });
    }

    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return favoriteJson({ error: 'Invalid JSON body' }, { status: 400 });
    }

    const parseResult = FavoriteRequestSchema.safeParse(body);
    if (!parseResult.success) {
      return favoriteJson(
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
    const { data, error } = await supabase.rpc('set_dynasty_favorite', {
      p_player_id: player.id,
      p_snake_id: snakeId,
      p_favorited: favorited,
    });

    if (error) {
      if (MISSING_RPC_CODES.has(error.code ?? '')) {
        return favoriteJson(
          { error: 'Favorites are temporarily unavailable', retryable: true },
          { status: 503 }
        );
      }

      if (error.code === EXPECTED_RULE_ERROR) {
        return favoriteJson(
          { error: 'Snake not found in your collection' },
          { status: 404 }
        );
      }

      reportError('RPC', error, {
        playerId: player.id,
        snakeId,
        favorited,
        code: error.code,
      });
      return favoriteJson(
        { error: 'Failed to update favorite' },
        { status: 500 }
      );
    }

    const result = FavoriteRpcResultSchema.safeParse(data);
    const receipt = result.success ? result.data : null;
    const receiptIsConsistent = Boolean(
      receipt &&
        receipt.snake_id === snakeId &&
        receipt.favorited === favorited &&
        receipt.favorite_snake_id === (favorited ? snakeId : null) &&
        !receipt.replaced_snake_ids.includes(snakeId) &&
        new Set(receipt.replaced_snake_ids).size ===
          receipt.replaced_snake_ids.length
    );
    if (!result.success || !receiptIsConsistent || !receipt) {
      reportError('response validation', result.success ? data : result.error, {
        playerId: player.id,
        snakeId,
        favorited,
        data,
      });
      return favoriteJson(
        { error: 'Favorite update returned incomplete data' },
        { status: 500 }
      );
    }

    return favoriteJson({
      success: true,
      snakeId: receipt.snake_id,
      favorited: receipt.favorited,
      favoriteSnakeId: receipt.favorite_snake_id,
      replacedSnakeIds: receipt.replaced_snake_ids,
    });
  } catch (err) {
    reportError('handler', err);
    return favoriteJson({ error: 'Server error' }, { status: 500 });
  }
}

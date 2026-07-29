/**
 * Generation downgrade API
 * POST /api/collection/downgrade
 *
 * The client names only an owned snake. The database resolves its immutable
 * breeding receipt, refunds that exact DNA cost, preserves the pedigree
 * snapshot, removes the active child and repairs equipment in one transaction.
 */

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import * as Sentry from '@sentry/nextjs';
import { z } from 'zod';
import { getPlayerId } from '../utils';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

const DowngradeRequestSchema = z.object({
  snakeId: z.string().uuid('snakeId must be a valid UUID'),
});

const DowngradeResultSchema = z.object({
  refunded_dna: z.number().int().positive(),
  new_dna_balance: z.number().int().nonnegative(),
  removed_snake_id: z.string().uuid(),
  replacement_snake_id: z.string().uuid().nullable(),
  from_generation: z.number().int().min(2),
  to_generation: z.number().int().min(1),
});

const EXPECTED_RULE_ERROR = 'P0001';
const MISSING_RPC_CODES = new Set(['42883', 'PGRST202']);

function reportError(
  scope: string,
  error: unknown,
  extra: Record<string, unknown> = {}
): void {
  console.error(`Generation downgrade ${scope} error:`, error, extra);
  Sentry.captureException(
    error instanceof Error ? error : new Error(`Generation downgrade ${scope} failed`),
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

    const playerId = await getPlayerId(user.id);
    if (!playerId) {
      return NextResponse.json({ error: 'Player not found' }, { status: 404 });
    }

    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
    }

    const parsed = DowngradeRequestSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        {
          error: 'Validation failed',
          details: parsed.error.issues.map((issue) => ({
            field: issue.path.join('.'),
            message: issue.message,
          })),
        },
        { status: 400 }
      );
    }

    const { data, error } = await supabase.rpc('downgrade_snake_generation', {
      p_player_id: playerId,
      p_snake_id: parsed.data.snakeId,
    });

    if (error) {
      if (MISSING_RPC_CODES.has(error.code ?? '')) {
        return NextResponse.json(
          { error: 'Generation refunds are temporarily unavailable', retryable: true },
          { status: 503 }
        );
      }

      if (error.code === EXPECTED_RULE_ERROR) {
        const message = error.message || 'This snake cannot be downgraded';
        const status = /not found in your active collection/i.test(message) ? 404 : 409;
        return NextResponse.json({ error: message }, { status });
      }

      reportError('RPC', error, {
        playerId,
        snakeId: parsed.data.snakeId,
        code: error.code,
      });
      return NextResponse.json(
        { error: 'Could not refund this generation' },
        { status: 500 }
      );
    }

    const result = DowngradeResultSchema.safeParse(data);
    if (!result.success) {
      reportError('response validation', result.error, {
        playerId,
        snakeId: parsed.data.snakeId,
        data,
      });
      return NextResponse.json(
        { error: 'Generation refund returned incomplete data' },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      refundedDna: result.data.refunded_dna,
      newDnaBalance: result.data.new_dna_balance,
      removedSnakeId: result.data.removed_snake_id,
      replacementSnakeId: result.data.replacement_snake_id,
      fromGeneration: result.data.from_generation,
      toGeneration: result.data.to_generation,
    });
  } catch (error) {
    reportError('handler', error);
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}

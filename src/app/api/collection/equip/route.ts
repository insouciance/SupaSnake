/**
 * Equip API - Set a snake as the player's equipped snake
 * POST /api/collection/equip - Equip a snake for gameplay
 *
 * Server-authoritative: updates is_equipped flags in database
 */

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { z } from 'zod';
import type { OwnedSnake } from '@/shared/types/snake-data-model';
import { mapOwnedSnakeRow, getPlayerId } from '../utils';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

/**
 * Equip request schema
 * Validates snakeId is a valid UUID
 */
const EquipRequestSchema = z.object({
  snakeId: z.string().uuid('snakeId must be a valid UUID'),
});

export type EquipRequestInput = z.infer<typeof EquipRequestSchema>;

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
      .select('*')
      .eq('id', snakeId)
      .eq('player_id', playerId)
      .single();

    if (fetchError || !targetSnake) {
      return NextResponse.json(
        { error: 'Snake not found in your collection' },
        { status: 404 }
      );
    }

    // One locked database operation normalizes equipment and synchronizes
    // player_settings.active_snake_id + selected_dynasty.
    const { error: equipError } = await supabase.rpc('equip_snake', {
      p_player_id: playerId,
      p_snake_id: snakeId,
    });

    if (equipError) {
      console.error('Failed to equip snake:', equipError);
      return NextResponse.json(
        { error: 'Failed to equip snake' },
        { status: 500 }
      );
    }

    const { data: equippedRow, error: fetchEquippedError } = await supabase
      .from('collected_snakes')
      .select('*, snake_variants(name, dynasties(name))')
      .eq('id', snakeId)
      .eq('player_id', playerId)
      .single();

    if (fetchEquippedError || !equippedRow) {
      console.error('Failed to read equipped snake:', fetchEquippedError);
      return NextResponse.json(
        { error: 'Equipment updated but could not be reloaded' },
        { status: 500 }
      );
    }

    const equippedSnake: OwnedSnake = mapOwnedSnakeRow(equippedRow);

    return NextResponse.json({
      success: true,
      equippedSnake,
    });
  } catch (err) {
    console.error('Equip API error:', err);
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}

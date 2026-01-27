/**
 * Collection API utilities
 */

import { createClient } from '@supabase/supabase-js';
import type { OwnedSnake } from '@/shared/types/snake-data-model';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

/**
 * Convert database row to OwnedSnake type (snake_case to camelCase)
 */
export function mapOwnedSnakeRow(row: Record<string, unknown>): OwnedSnake {
  return {
    id: row.id as string,
    playerId: row.player_id as string,
    variantId: row.variant_id as string,
    snakeVariantId: row.snake_variant_id as string,
    generation: row.generation as number,
    parent1Id: row.parent1_id as string | null,
    parent2Id: row.parent2_id as string | null,
    acquiredAt: row.acquired_at as string,
    acquiredMethod: row.acquired_method as OwnedSnake['acquiredMethod'],
    isEquipped: row.is_equipped as boolean,
    isFavorited: row.is_favorited as boolean,
  };
}

/**
 * Get player ID from user ID
 */
export async function getPlayerId(userId: string): Promise<string | null> {
  const { data, error } = await supabase
    .from('players')
    .select('id')
    .eq('user_id', userId)
    .single();

  if (error || !data) {
    return null;
  }

  return data.id;
}

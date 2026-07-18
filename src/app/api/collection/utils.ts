/**
 * Collection API utilities
 */

import { createClient } from '@supabase/supabase-js';
import type { OwnedSnake, Rarity } from '@/shared/types/snake-data-model';
import { getTraitSlots, sanitizeTraits } from '@/shared/game/traits';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

/**
 * Convert database row to OwnedSnake type (snake_case to camelCase).
 * The legacy variant_id TEXT column is gone; variant/dynasty names come
 * from the snake_variants(dynasties) join when the query includes it.
 *
 * Traits (Design v2 Phase 3A): the row's traits TEXT[] is sanitized
 * (unknown ids dropped, capped at the slot maximum) and traitSlots is
 * derived from the joined rarity + generation - the same rule as the
 * get_trait_slots SQL function. Pre-migration-018 rows simply lack the
 * column and map to a traitless snake.
 */
export function mapOwnedSnakeRow(row: Record<string, unknown>): OwnedSnake {
  const variantJoin = row.snake_variants as
    | { name?: string; rarity?: Rarity; dynasties?: { name?: string } | null }
    | null
    | undefined;

  const generation = row.generation as number;
  const rarity = variantJoin?.rarity ?? null;

  return {
    id: row.id as string,
    playerId: row.player_id as string,
    variantId: (variantJoin?.name ?? '') as string,
    snakeVariantId: row.snake_variant_id as string,
    generation,
    parent1Id: row.parent1_id as string | null,
    parent2Id: row.parent2_id as string | null,
    acquiredAt: row.acquired_at as string,
    acquiredMethod: row.acquired_method as OwnedSnake['acquiredMethod'],
    isEquipped: row.is_equipped as boolean,
    isFavorited: row.is_favorited as boolean,
    traits: sanitizeTraits(row.traits),
    traitSlots: getTraitSlots(rarity ?? 'common', generation ?? 1),
    variantName: variantJoin?.name ?? null,
    dynastyName: variantJoin?.dynasties?.name ?? null,
    variantRarity: rarity,
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

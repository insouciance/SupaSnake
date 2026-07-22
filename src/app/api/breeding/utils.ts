/**
 * Breeding API utilities
 * Row mapping for GET /api/breeding (recent breeding history).
*/

import { sanitizeLineage, type Lineage } from '@/shared/game/lineage';

// =============================================================================
// TYPES
// =============================================================================

/** Snake summary embedded in a breeding history entry (parent or child). */
export interface BreedingHistorySnake {
  id: string;
  generation: number;
  variantName: string | null;
  rarity: string | null;
}

/** One breeding event, newest first in GET /api/breeding responses. */
export interface BreedingHistoryEntry {
  id: string;
  dnaCost: number;
  bredAt: string;
  parent1: BreedingHistorySnake | null;
  parent2: BreedingHistorySnake | null;
  child: BreedingHistorySnake | null;
  /** The audited lineage rolled at birth (not a later reroll). */
  lineage: Lineage | null;
}

export interface BreedingHistoryResponse {
  history: BreedingHistoryEntry[];
}

// =============================================================================
// MAPPERS
// =============================================================================

interface SnakeJoinRow {
  id?: string;
  generation?: number;
  snake_variants?: { name?: string; rarity?: string } | null;
}

/**
 * Supabase embeds joined rows as an object for to-one relations, but the
 * generated types sometimes surface arrays; normalize both shapes.
 */
function firstRow<T>(value: T | T[] | null | undefined): T | null {
  if (Array.isArray(value)) return value[0] ?? null;
  return value ?? null;
}

function mapSnakeJoin(
  value: SnakeJoinRow | SnakeJoinRow[] | null | undefined
): BreedingHistorySnake | null {
  const row = firstRow(value);
  if (!row || !row.id) return null;

  const variant = firstRow(row.snake_variants);
  return {
    id: row.id,
    generation: row.generation ?? 1,
    variantName: variant?.name ?? null,
    rarity: variant?.rarity ?? null,
  };
}

/**
 * Convert a breeding_history row (with collected_snakes -> snake_variants
 * joins aliased as parent1/parent2/child) into the camelCase API shape.
 */
export function mapBreedingHistoryRow(row: Record<string, unknown>): BreedingHistoryEntry {
  const traitRolls = row.trait_rolls as
    | { lineage?: { child?: unknown } | null }
    | null
    | undefined;
  return {
    id: row.id as string,
    dnaCost: (row.dna_cost as number) ?? 0,
    bredAt: row.bred_at as string,
    parent1: mapSnakeJoin(row.parent1 as SnakeJoinRow | SnakeJoinRow[] | null),
    parent2: mapSnakeJoin(row.parent2 as SnakeJoinRow | SnakeJoinRow[] | null),
    child: mapSnakeJoin(row.child as SnakeJoinRow | SnakeJoinRow[] | null),
    lineage: sanitizeLineage(traitRolls?.lineage?.child),
  };
}

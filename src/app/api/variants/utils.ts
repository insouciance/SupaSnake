/**
 * Variants API utilities
 */

import type { SnakeVariant, SnakeStats } from '@/shared/types/snake-data-model';
import { lineageFromAffinity } from '@/shared/game/lineage';

/**
 * Convert database row to SnakeVariant type (snake_case to camelCase)
 */
export function mapVariantRow(row: Record<string, unknown>): SnakeVariant {
  const affinity = lineageFromAffinity(
    row.lineage_strain,
    row.affinity_strength
  );
  return {
    id: row.id as string,
    dynastyId: row.dynasty_id as string,
    name: row.name as string,
    rarity: row.rarity as SnakeVariant['rarity'],
    loreText: row.lore_text as string | null,
    artUrl: row.art_url as string | null,
    baseStats: row.base_stats as SnakeStats,
    unlockCostDna: row.unlock_cost_dna as number,
    isStarter: row.is_starter as boolean,
    sortOrder: row.sort_order as number,
    isActive: row.is_active as boolean,
    createdAt: row.created_at as string,
    updatedAt: row.updated_at as string,
    lineageStrain: affinity?.strains[0] ?? null,
    affinityStrength: affinity?.strength ?? 0,
  };
}

/**
 * Dynasties API utilities
 */

import type { Dynasty } from '@/shared/types/snake-data-model';

/**
 * Convert database row to Dynasty type (snake_case to camelCase)
 */
export function mapDynastyRow(row: Record<string, unknown>): Dynasty {
  return {
    id: row.id as string,
    name: row.name as string,
    displayName: row.display_name as string,
    description: row.description as string,
    colorPrimary: row.color_primary as string,
    colorSecondary: row.color_secondary as string,
    statBonusType: row.stat_bonus_type as Dynasty['statBonusType'],
    statBonusValue: row.stat_bonus_value as number,
    sortOrder: row.sort_order as number,
    isActive: row.is_active as boolean,
    createdAt: row.created_at as string,
    updatedAt: row.updated_at as string,
  };
}

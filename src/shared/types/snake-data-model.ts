/**
 * Snake Data Model Types - Sprint 1
 * Server-authoritative types matching the Supabase schema
 *
 * These types replace the client-side dynasty/variant data with
 * server-managed data from the database.
 */

// =============================================================================
// CORE TYPES
// =============================================================================

/**
 * Dynasty - Theme group for snake variants
 * Stored in `dynasties` table
 */
export interface Dynasty {
  id: string; // UUID
  name: string; // "CYBER", "PRIMAL", "COSMIC"
  displayName: string; // "Cyber Dynasty"
  description: string; // Lore text
  colorPrimary: string; // Hex color (e.g., "#00FFFF")
  colorSecondary: string; // Accent color
  statBonusType: StatBonusType; // Which stat gets bonus
  statBonusValue: number; // 0.05 = 5%
  sortOrder: number; // Display order
  isActive: boolean;
  createdAt: string; // ISO timestamp
  updatedAt: string;
}

export type StatBonusType = 'speed' | 'dna_generation' | 'size';

export type DynastyName = 'CYBER' | 'PRIMAL' | 'COSMIC';

/**
 * Snake Variant - Catalog entry for a collectible snake type
 * Stored in `snake_variants` table
 */
export interface SnakeVariant {
  id: string; // UUID
  dynastyId: string; // FK to dynasties
  name: string; // "CYBER SPARK", "PRIMAL SEED"
  rarity: Rarity;
  loreText: string | null;
  artUrl: string | null; // Supabase Storage URL
  baseStats: SnakeStats;
  unlockCostDna: number; // 0 for starters
  isStarter: boolean; // Can be chosen in tutorial
  sortOrder: number; // Order within dynasty
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
  /** Innate Genome affinity supplied by migration 030; absent pre-migration. */
  lineageStrain?: import('@/shared/game/strains').StrainId | null;
  affinityStrength?: import('@/shared/game/lineage').LineageStrength;
}

export type Rarity = 'common' | 'uncommon' | 'rare' | 'epic' | 'legendary';

/**
 * Snake Stats - Gameplay affecting attributes
 */
export interface SnakeStats {
  speed: number; // Movement speed multiplier (base: 10)
  size: number; // Snake body scaling (base: 5)
  hp: number; // Hit points / collision tolerance (base: 100)
}

/**
 * Owned Snake - Player's collection entry
 * Stored in `collected_snakes` table (with new columns)
 */
export interface OwnedSnake {
  id: string; // UUID
  playerId: string; // FK to players
  variantId: string; // Variant name (derived from snake_variants join)
  snakeVariantId: string | null; // UUID FK to snake_variants
  generation: number; // Gen 1, 2, 3...
  parent1Id: string | null; // Breeding parent
  parent2Id: string | null;
  acquiredAt: string; // ISO timestamp
  acquiredMethod: AcquiredMethod;
  isEquipped: boolean;
  isFavorited: boolean;

  // Traits drafted at breeding time (Constitution §8.2) - slot order is draft order
  traits?: string[]; // TraitId[] sanitized by the API mapper
  // Trait slot count derived from variant rarity + generation (section 6.1)
  traitSlots?: number;

  // Lineage (Buildcraft: The Genome §7) - the snake's effective strain
  // affinity (own JSONB, else the variant's innate affinity); null when
  // neither exists (pre-030 rows)
  lineage?: import('@/shared/game/lineage').Lineage | null;

  // Joined display data (populated when the query joins snake_variants)
  variantName?: string | null; // e.g. "CYBER SPARK"
  dynastyName?: string | null; // e.g. "CYBER"
  variantRarity?: Rarity | null; // from the snake_variants join (trait slots)

  // Joined data (populated by queries)
  variant?: SnakeVariant;
  dynasty?: Dynasty;
}

export type AcquiredMethod = 'tutorial' | 'unlock' | 'bred';

// =============================================================================
// COMPUTED TYPES
// =============================================================================

/**
 * Owned snake with computed effective stats
 */
export interface OwnedSnakeWithStats extends OwnedSnake {
  effectiveStats: SnakeStats;
  variant: SnakeVariant;
  dynasty: Dynasty;
}

// =============================================================================
// HELPER FUNCTIONS
// =============================================================================

/**
 * Compute effective stats - Design v2: base stats pass through unchanged.
 *
 * Generation is prestige-only ("Gen N" display) and dynasty identity
 * lives in the ruleset module, so neither scales stats anymore. The
 * signature is kept (mirroring the compute_effective_stats DB function,
 * flattened in migration 013) so existing callers stay source-compatible;
 * the extra parameters are intentionally unused.
 */
export function computeEffectiveStats(
  baseStats: SnakeStats,
  _generation: number,
  _dynasty: Dynasty
): SnakeStats {
  return {
    speed: Math.round(baseStats.speed * 100) / 100,
    size: Math.round(baseStats.size * 100) / 100,
    hp: Math.round(baseStats.hp * 100) / 100,
  };
}

/**
 * Check if a variant can be unlocked with current DNA balance
 */
export function canUnlockVariant(
  variant: SnakeVariant,
  currentDna: number
): { canUnlock: boolean; dnaNeeded: number } {
  const dnaNeeded = Math.max(0, variant.unlockCostDna - currentDna);
  return {
    canUnlock: currentDna >= variant.unlockCostDna,
    dnaNeeded,
  };
}

/**
 * Get the DNA cost display string
 */
export function getUnlockCostDisplay(variant: SnakeVariant): string {
  if (variant.isStarter) return 'Starter';
  if (variant.unlockCostDna === 0) return 'Free';
  return `${variant.unlockCostDna} DNA`;
}

// =============================================================================
// API RESPONSE TYPES
// =============================================================================

export interface DynastiesResponse {
  dynasties: Dynasty[];
}

export interface VariantsResponse {
  variants: SnakeVariant[];
}

export interface CollectionResponse {
  snakes: OwnedSnake[];
}

export interface UnlockRequest {
  variantId: string;
  /** Lab convenience: performs unlock + equip in one server transaction. */
  equip?: boolean;
}

export interface UnlockResponse {
  success: boolean;
  snake?: OwnedSnake;
  error?: string;
  newDnaBalance?: number;
  equipped?: boolean;
}

export interface EquipRequest {
  snakeId: string;
}

export interface EquipResponse {
  success: boolean;
  error?: string;
  /**
   * The freshly equipped row, re-read with its variant and dynasty join.
   * The route has always returned it; declaring it is what lets the client
   * apply the server's truth instead of keeping its optimistic guess.
   * Absent when the equip committed but the re-read failed — the equip still
   * succeeded, so `success` stays true and the client refreshes later.
   */
  equippedSnake?: OwnedSnake;
}

export interface FavoriteRequest {
  snakeId: string;
  favorited: boolean;
}

export interface FavoriteResponse {
  success: boolean;
  error?: string;
  snakeId?: string;
  favorited?: boolean;
}

// =============================================================================
// CONSTANTS
// =============================================================================

/**
 * Default base stats for all MVP variants
 */
export const DEFAULT_BASE_STATS: SnakeStats = {
  speed: 10,
  size: 5,
  hp: 100,
};

/**
 * Generation scaling factor - Design v2: generations are prestige-only;
 * this constant is retained for historical data displays but no longer
 * feeds any stat math.
 */
export const GENERATION_SCALING_FACTOR = 0.05;

/**
 * Dynasty bonus value - Design v2: deprecated, no longer consumed for
 * math (dynasty identity is a ruleset, not a stat bonus).
 */
export const DEFAULT_DYNASTY_BONUS = 0.05;

/**
 * MVP variant count
 */
export const MVP_VARIANT_COUNT = 5;

/**
 * MVP dynasty names
 */
export const MVP_DYNASTIES: DynastyName[] = ['CYBER', 'PRIMAL', 'COSMIC'];

/**
 * Dynasty color themes for UI
 */
export const DYNASTY_THEMES: Record<
  DynastyName,
  { primary: string; secondary: string; gradient: string }
> = {
  CYBER: {
    primary: '#00FFFF',
    secondary: '#FF00FF',
    gradient: 'linear-gradient(135deg, #00FFFF 0%, #FF00FF 100%)',
  },
  PRIMAL: {
    primary: '#2d5016',
    secondary: '#8b4513',
    gradient: 'linear-gradient(135deg, #2d5016 0%, #8b4513 100%)',
  },
  COSMIC: {
    primary: '#4a0e4e',
    secondary: '#ffd700',
    gradient: 'linear-gradient(135deg, #4a0e4e 0%, #ffd700 100%)',
  },
};

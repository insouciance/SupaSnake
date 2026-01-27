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
  variantId: string; // TEXT (legacy) - variant name
  snakeVariantId: string | null; // UUID FK to snake_variants (new)
  generation: number; // Gen 1, 2, 3...
  parent1Id: string | null; // Breeding parent
  parent2Id: string | null;
  acquiredAt: string; // ISO timestamp
  acquiredMethod: AcquiredMethod;
  isEquipped: boolean;
  isFavorited: boolean;

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
 * Compute effective stats with generation scaling and dynasty bonus
 *
 * Formula:
 *   effective = base × genMultiplier × dynastyBonus
 *   genMultiplier = 1 + (generation - 1) × 0.05
 *   dynastyBonus = 1 + bonusValue (only for matching stat type)
 *
 * Examples:
 *   Gen 1 CYBER (speed bonus): speed = 10 × 1.00 × 1.05 = 10.5
 *   Gen 5 CYBER: speed = 10 × 1.20 × 1.05 = 12.6
 *   Gen 1 PRIMAL (dna bonus): stats unchanged, dna_generation affects rewards
 */
export function computeEffectiveStats(
  baseStats: SnakeStats,
  generation: number,
  dynasty: Dynasty
): SnakeStats {
  // Generation scaling: +5% per generation above 1
  const genMultiplier = 1 + (generation - 1) * 0.05;

  const stats: SnakeStats = {
    speed: baseStats.speed * genMultiplier,
    size: baseStats.size * genMultiplier,
    hp: baseStats.hp * genMultiplier,
  };

  // Apply dynasty bonus to the appropriate stat
  if (dynasty.statBonusType === 'speed') {
    stats.speed *= 1 + dynasty.statBonusValue;
  } else if (dynasty.statBonusType === 'size') {
    stats.size *= 1 + dynasty.statBonusValue;
  }
  // Note: dna_generation bonus affects rewards in gameplay, not stats

  // Round to 2 decimal places
  stats.speed = Math.round(stats.speed * 100) / 100;
  stats.size = Math.round(stats.size * 100) / 100;
  stats.hp = Math.round(stats.hp * 100) / 100;

  return stats;
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
}

export interface UnlockResponse {
  success: boolean;
  snake?: OwnedSnake;
  error?: string;
  newDnaBalance?: number;
}

export interface EquipRequest {
  snakeId: string;
}

export interface EquipResponse {
  success: boolean;
  error?: string;
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
 * Generation scaling factor (5% per generation)
 */
export const GENERATION_SCALING_FACTOR = 0.05;

/**
 * Dynasty bonus value (5%)
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

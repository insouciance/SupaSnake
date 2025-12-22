/**
 * Core Game Types for SupaSnake MVP
 * Server authority - all game state managed server-side
 */

export type Rarity = 'common' | 'uncommon' | 'rare' | 'epic' | 'legendary';

export type DynastyId = 'EMBER' | 'CRYSTAL' | 'VOID';

/**
 * Snake Variant - Individual collectible snake
 * Named with n/N format (e.g., "1/10", "2/10")
 */
export interface SnakeVariant {
  id: string;                    // Unique ID: "EMBER_1", "CRYSTAL_5"
  dynastyId: DynastyId;          // Which dynasty this belongs to
  variantNumber: number;         // 1-10 within dynasty
  totalInDynasty: number;        // Always 10 for MVP
  displayName: string;           // "EMBER 1/10", "CRYSTAL 5/10"
  rarity: Rarity;                // Based on variant number
  description: string;           // Placeholder description
  stats: SnakeStats;             // Gameplay bonuses
  colorPrimary: string;          // Hex color for UI
  colorSecondary: string;        // Accent color
}

/**
 * Stats that affect gameplay
 * MVP: Simple multipliers
 */
export interface SnakeStats {
  dnaBonus: number;              // % bonus DNA collection (0.0 - 1.0)
  speedBonus: number;            // % speed increase (0.0 - 0.5)
  sizeBonus: number;             // Extra starting length (0 - 3)
}

/**
 * Dynasty - Collection of 10 variants
 */
export interface Dynasty {
  id: DynastyId;
  name: string;                  // "EMBER", "CRYSTAL", "VOID"
  description: string;           // Brief flavor text
  theme: string;                 // "Fire", "Ice", "Shadow"
  colorPrimary: string;          // Dynasty brand color
  variants: SnakeVariant[];      // All 10 variants
  unlocked: boolean;             // Has player seen this dynasty?
}

/**
 * Player's collected snake (instance)
 */
export interface CollectedSnake {
  instanceId: string;            // Unique instance: "uuid-v4"
  variantId: string;             // Reference to SnakeVariant
  acquiredAt: string;            // ISO timestamp
  generation: number;            // Breeding generation (1 = starter)
  parentIds?: string[];          // If bred, parent instanceIds
}

/**
 * Player game state (server-managed)
 */
export interface PlayerState {
  userId: string;
  resources: {
    dna: number;                 // Primary currency
    energy: number;              // Current energy
    maxEnergy: number;           // Energy cap
    energyRegenAt: string;       // ISO timestamp of next energy
  };
  collection: CollectedSnake[];  // All owned snakes
  activeSnakeId: string | null;  // Currently equipped snake
  stats: {
    totalGamesPlayed: number;
    totalDnaEarned: number;
    highScore: number;
    breedsCompleted: number;
  };
  createdAt: string;
  updatedAt: string;
}

/**
 * Game session result
 */
export interface GameResult {
  score: number;
  dnaEarned: number;
  duration: number;              // Seconds
  died: boolean;
  snakeUsed: string;             // variantId
}

/**
 * Breeding request/result
 */
export interface BreedingRequest {
  parent1Id: string;             // instanceId
  parent2Id: string;             // instanceId
}

export interface BreedingResult {
  success: boolean;
  newSnake?: CollectedSnake;
  error?: string;
}

/**
 * Energy system
 */
export interface EnergyState {
  current: number;
  max: number;
  regenAt: string | null;        // When next energy point arrives
  secondsUntilNext: number;      // Countdown helper
}

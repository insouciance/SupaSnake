/**
 * Game Configuration - Single Source of Truth
 * AAA 2026 Standard: Centralized balance values
 */

/**
 * Recursively freeze an object so runtime mutation throws (strict mode).
 * Config values must never be mutated at runtime.
 */
function deepFreeze<T extends object>(obj: T): T {
  for (const value of Object.values(obj)) {
    if (value !== null && typeof value === 'object' && !Object.isFrozen(value)) {
      deepFreeze(value);
    }
  }
  return Object.freeze(obj);
}

export const GAME_CONFIG = deepFreeze({
  /**
   * Grid & Board
   */
  board: {
    gridSize: 20,                    // 20x20 grid
    cellSize: 1,                     // 3D unit size per cell
    boardWidth: 20,                  // Calculated: gridSize * cellSize
    boardHeight: 20,
  },

  /**
   * Snake Physics
   */
  snake: {
    initialLength: 3,                // Starting segments
    initialSpeed: 200,               // Milliseconds per move
    minSpeed: 50,                    // Speed cap (fastest)
    interpolationDuration: 150,      // Smooth movement duration (ms)
  },

  /**
   * Economy - DNA & Resources
   */
  economy: {
    dna: {
      foodValue: 10,                 // DNA per food collected
      scoreMultiplier: 0.1,          // Bonus DNA from score
      completionBonus: 50,           // Bonus for winning
      firstWinBonus: 100,            // First win of day
    },
    energy: {
      maxEnergy: 5,                  // Energy cap
      costPerGame: 1,                // Energy consumed per game
      regenRateMinutes: 20,          // Minutes per energy point
      regenRateMs: 20 * 60 * 1000,   // Milliseconds
    },
  },

  /**
   * Breeding System
   */
  breeding: {
    baseCost: 50,                    // DNA cost (same dynasty)
    crossDynastyCost: 100,           // DNA cost (different dynasties)
    cooldownMinutes: 0,              // No cooldown for MVP
    maxActive: 3,                    // Future: concurrent breeds
  },

  /**
   * Game Session
   */
  session: {
    victoryScore: 100,               // Score to "win"
    maxDuration: 600,                // 10 minutes max (seconds)
    saveInterval: 5000,              // Autosave every 5s (ms)
  },

  /**
   * Visual Effects
   */
  effects: {
    particlesOnCollect: true,
    particleCount: 20,
    cameraShake: true,
    targetFPS: 60,
  },

  /**
   * Feature Flags
   */
  features: {
    breeding: true,
    evolution: false,                // v0.5+
    multiplayer: false,              // v1.0+
    leaderboards: true,              // Social launch
    clans: true,                     // Social launch
    premium: true,                   // SupaSnake Premium subscription (028)
    genome: false,                   // Buildcraft: The Genome (flips in G8)
  },

  /**
   * Buildcraft: The Genome (BUILDCRAFT_GENOME_DESIGN.md)
   * Tuning that is neither strain- nor gene-scoped (those live in
   * src/shared/game/strains.ts / genes.ts). The engine only runs genome
   * behavior when the SERVER start response carries the genome capability
   * (runSeed + heirloom) - never on the client flag alone.
   */
  genome: {
    /** Cross-dynasty breeding produces dual-lineage offspring (§7). */
    crossDynastyBreeding: false,     // flips once migration 030 is verified
    /** FTUE ramp (§12): banked-run counts gating each layer. */
    ftue: {
      strainTagsAt: 4,
      expressionsAt: 8,
      infuseAt: 10,
      spawnPointsAt: 12,
      splicesAt: 15,
      apexesAt: 20,
    },
  },
} as const);

/**
 * Type exports
 */
export type GameConfig = typeof GAME_CONFIG;

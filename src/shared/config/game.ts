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
    /**
     * `scoreMultiplier: 0.1` and `firstWinBonus: 100` used to sit in this
     * block. Neither was ever read (GROUND_TRUTH §10) - the settlement
     * fold takes none of them - and `firstWinBonus` in particular
     * described a first-run-of-day bonus the product does not have. The
     * Daily Take (Constitution §7.2, WP-1.04) is that idea done properly,
     * and it will carry its own numbers. WP-0.03 deleted both.
     */
    dna: {
      foodValue: 10,                 // DNA per food collected
      completionBonus: 50,           // Bonus for winning
    },
    /**
     * Energy — the daily harvest envelope (Constitution §8.6).
     *
     * Energy never gates playing. Every run always starts, always Scores,
     * always ranks, always counts. Energy paces the HARVEST only: a charged
     * run harvests full DNA; an uncharged run plays identically and harvests
     * the lean factor - lean, never zero.
     *
     * The day grants a fixed number of charges, reset to full at 00:00 UTC.
     * There is no drip, no carry-over, no accumulation, and no grant path:
     * charges are DERIVED from (charges_day, charges_used), so no purchase,
     * perk, reward or stipend can add one (§10.4 never-sold list).
     */
    energy: {
      /** [H] Charges granted per UTC day. Reset, never accrual. */
      chargesPerDay: 6,
      /** [H] Harvest factor applied to an uncharged run's DNA. */
      leanHarvestFactor: 0.25,
      /**
       * [H] Banked runs before the charge meter is shown at all - a new
       * player never meets scarcity before they have met the game.
       */
      meterVisibleAtBankedRuns: 4,
    },
  },

  /**
   * Breeding System
   *
   * The DNA price of a breed is NOT here and must never come back here.
   * The live cost is `200 + avg(generation) x 100`, computed inside the
   * breeding RPC (migration 018) where the server is the authority. The
   * `baseCost: 50` / `crossDynastyCost: 100` pair that used to sit in
   * this block was read by nothing and understated the real price by 4x
   * (GROUND_TRUTH §10); WP-0.03 deleted it. Ascendance (WP-1.05) changes
   * that curve again - in the RPC.
   */
  breeding: {
    cooldownMinutes: 0,              // No cooldown for MVP
    maxActive: 3,                    // Future: concurrent breeds
  },

  /**
   * Game Session
   */
  // WP-2.05 deleted `maxDuration: 600`. A flat ten-minute wall marked every
  // long, careful run invalid — the tactical-hold play the extraction
  // mechanic exists to reward — and it bounded nothing that the validator's
  // comparison against the session's own `server_started_at` does not bound
  // better. Owner ruling, 2026-07-26: a long run is a good run. Do not
  // reintroduce a duration ceiling here; the bound belongs in the validator,
  // against observed server time.
  session: {
    victoryScore: 100,               // Score to "win"
    saveInterval: 5000,              // Autosave every 5s (ms)
    /**
     * Tactical holds — the bound that replaced the deleted `maxDuration`.
     *
     * A hold is a real tactical resource: it buys thinking time, so an
     * unlimited supply turns a precision game into a turn-based one. Three
     * to open, and the run earns more as the body gets genuinely hard to
     * steer. Choice holds (gene / portal / surge) are NEVER charged — those
     * are the run's own decisions, protected by Inviolable Rule 1.
     *
     * Purely physical and purely client-side: a hold carries no economy, so
     * there is nothing here for the server to enforce. Duration is bounded
     * server-side (WP-2.05).
     */
    holds: {
      /** Holds every run opens with. */
      base: 3,
      /** Body lengths that each grant one more hold, once, when reached. */
      bonusAtLengths: [25, 40] as readonly number[],
    },
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
    genome: true,                    // Buildcraft: The Genome (server capability-gated)
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
    crossDynastyBreeding: true,      // migration 030 RPC remains server authority
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

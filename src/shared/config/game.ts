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
   *
   * `initialSpeed` is the TOP of the speed band, not any dynasty's tempo. Every
   * fixed-tempo dynasty now owns its tick in `rulesets.ts` - COSMIC always did
   * (`COSMIC_SPEED_MS = 160`), and PRIMAL got `PRIMAL_SPEED_MS = 175` in
   * WP-3.08. The one live reader left is CYBER's speed curve, which starts at
   * this value and divides down toward `CYBER_TICK_FLOOR_MS`.
   *
   * That is exactly why PRIMAL was given its own constant: while PRIMAL read
   * this field, retuning PRIMAL's tempo here would have silently retuned
   * CYBER's whole curve with it. Change this number only when CYBER's opening
   * tempo is what you mean to change.
   */
  snake: {
    initialLength: 3,                // Starting segments
    initialSpeed: 200,               // Milliseconds per move - CYBER's curve start
    minSpeed: 50,                    // Speed cap (fastest); CYBER floors above it
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
     * Energy Commitment — stored run charge (Constitution §8.6, owner
     * amendment 29 July 2026).
     *
     * Energy recovers on server time and may be committed 1..capacity to one
     * ordinary run. The complete commitment is consumed at START and is
     * immutable thereafter. It multiplies only that run's credited harvest;
     * Score, Yield, fixed rewards, unlocks and clan score remain independent.
     * A run with no Energy can still be played at the lean harvest factor.
     *
     * Energy remains on the never-sold list. Recovery is the only source.
     */
    energy: {
      /** [H] Maximum stored Energy and maximum single-run commitment. */
      capacity: 6,
      /** [H] Server-time recovery cadence. Partial progress persists. */
      recoveryIntervalSeconds: 60 * 60,
      /**
       * [H] Harvest multiplier in basis points, indexed by commitment - 1.
       * Basis points keep server/client rounding exact and configurable.
       */
      commitmentMultipliersBps: [10_000, 22_000, 36_000, 52_000, 72_000, 100_000],
      /** [H] Harvest factor applied to an uncharged run's DNA. */
      leanHarvestFactor: 0.25,
      /**
       * [H] Banked runs before the charge meter is shown at all - a new
       * player never meets scarcity before they have met the game.
       */
      meterVisibleAtBankedRuns: 4,
    },
    /**
     * Clan Energy Battles — one social consequence layered over ordinary
     * Energy-funded runs. These dials deliberately live beside Energy so the
     * economy and competitive windows cannot drift into separate systems.
     */
    clanBattle: {
      /** Monday 27 July 2026 00:00 UTC starts cycle zero. */
      epochUtc: '2026-07-27T00:00:00.000Z',
      /** [H] Active scoring window: three days. */
      activeDurationSeconds: 3 * 24 * 60 * 60,
      /** [H] Result/intermission window: one day. */
      intermissionDurationSeconds: 24 * 60 * 60,
      /** [H] Only each member's strongest five valid runs count. */
      contributingRunsPerMember: 5,
      /** A run begun before the deadline may settle within this bound. */
      completionGraceSeconds: 3 * 60 * 60,
      /** [H] Competitive eligibility only; personal long runs remain valid. */
      maxEligibleRunDurationSeconds: 3 * 60 * 60,
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

/**
 * Dynasty Rulesets - Design v2 Phase 1 keystone
 *
 * Shared by the client engine (SnakeGameLogic) AND the server validator
 * (gameValidator) so the server can recompute a run's payout exactly from
 * the raw food count. This is what makes server-authoritative scoring
 * possible: the client never has to be trusted about DNA totals.
 *
 * Determinism rules (enforced by tests):
 * - Integer math at every observation point: foodDnaValue returns integers,
 *   computeRunTotals is a pure fold over n = 1..foodCount.
 * - No RNG anywhere in scoring. Extraction spawn cadence randomness only
 *   affects WHEN the exit portal appears, never the payout.
 * - The only float->int boundary is the single Math.floor in applyOutcome.
 */

import { GAME_CONFIG } from '@/shared/config/game';

export type DynastyName = 'PRIMAL' | 'CYBER' | 'COSMIC';

/** Exit-portal spawn cadence + lifetime (identical across dynasties for Phase 1). */
export interface ExtractionConfig {
  /** Foods eaten before the first exit portal spawns. */
  firstExitAtFood: number;
  /** After a despawn, the next portal spawns intervalBase +/- intervalJitter foods later. */
  intervalBase: number;
  intervalJitter: number;
  /** Ticks the portal stays on the board before despawning. */
  despawnTicks: number;
}

export interface DynastyRuleset {
  id: DynastyName;
  /** ms per tick as a pure function of foods eaten (0-based). PRIMAL: constant. */
  speedForFood(foodEaten: number): number;
  /** DNA value of the n-th food (1-based). Integer. */
  foodDnaValue(n: number): number;
  /** Score multiplier in effect when eating the n-th food (1-based). */
  scoreMultiplier(n: number): number;
  extraction: ExtractionConfig;
  validation: {
    /** Per-dynasty food-rate sanity bound (foods per second of run duration). */
    maxFoodPerSecond: number;
  };
}

/** Extraction banking outcomes: leave through the portal or die trying. */
export const BANK = {
  /** Banked payout multiplier when the run ends through the exit portal. */
  extractMultiplier: 1.25,
  /** Salvage payout multiplier when the run ends in death. */
  deathMultiplier: 0.6,
} as const;

/** PRIMAL base DNA per food - single source of truth in GAME_CONFIG. */
export const FOOD_BASE_DNA = GAME_CONFIG.economy.dna.foodValue; // 10

/** Base display-score points per food (multiplied by scoreMultiplier). */
export const FOOD_BASE_SCORE = 10;

/** Shared Phase 1 extraction cadence: first portal at 15 foods, then every 12 +/- 4. */
const EXTRACTION_DEFAULTS: ExtractionConfig = {
  firstExitAtFood: 15,
  intervalBase: 12,
  intervalJitter: 4,
  despawnTicks: 90,
};

/** CYBER speed tier for the n-th food (1-based): floor(n/5), capped at 4. */
function cyberTier(n: number): number {
  return Math.min(4, Math.floor(n / 5));
}

/** CYBER score/DNA multiplier: 1 + 0.5 * tier, so x1 -> x3 by food 20. */
function cyberMultiplier(n: number): number {
  return 1 + 0.5 * cyberTier(n);
}

/**
 * PRIMAL - Steady Growth: fixed speed, compounding food value.
 * Every food is worth round(10 * (1 + 0.02 * (n - 1))) DNA - the n-th food
 * is always worth at least as much as the one before it.
 */
const PRIMAL: DynastyRuleset = {
  id: 'PRIMAL',
  speedForFood: () => GAME_CONFIG.snake.initialSpeed,
  foodDnaValue: (n) => Math.round(FOOD_BASE_DNA * (1 + 0.02 * (n - 1))),
  scoreMultiplier: () => 1,
  extraction: EXTRACTION_DEFAULTS,
  validation: { maxFoodPerSecond: 1.0 },
};

/**
 * CYBER - Overclock: speed ramps with every food (the migration of the old
 * log curve, driven by food count instead of score) while a speed-tier
 * multiplier scales both score and DNA: tier = floor(n/5) capped at 4,
 * multiplier = 1 + 0.5 * tier (x1 -> x3 from food 20 onward).
 */
const CYBER: DynastyRuleset = {
  id: 'CYBER',
  speedForFood: (foodEaten) =>
    Math.max(
      GAME_CONFIG.snake.minSpeed,
      Math.floor(GAME_CONFIG.snake.initialSpeed / (1 + 0.03 * foodEaten))
    ),
  foodDnaValue: (n) => Math.round(FOOD_BASE_DNA * cyberMultiplier(n)),
  scoreMultiplier: (n) => cyberMultiplier(n),
  extraction: EXTRACTION_DEFAULTS,
  validation: { maxFoodPerSecond: 2.5 },
};

/**
 * COSMIC - Flux (Phase 2 placeholder): PRIMAL-like fixed speed with flat
 * legacy food value. Phase 2 replaces this with wrap phases + constellation
 * combo chains; the DynastyRuleset interface accommodates those as extra
 * fields without touching PRIMAL/CYBER.
 */
const COSMIC: DynastyRuleset = {
  id: 'COSMIC',
  speedForFood: () => GAME_CONFIG.snake.initialSpeed,
  foodDnaValue: () => FOOD_BASE_DNA,
  scoreMultiplier: () => 1,
  extraction: EXTRACTION_DEFAULTS,
  validation: { maxFoodPerSecond: 1.0 },
};

export const RULESETS: Record<DynastyName, DynastyRuleset> = {
  PRIMAL,
  CYBER,
  COSMIC,
};

export function getRuleset(dynasty: DynastyName): DynastyRuleset {
  return RULESETS[dynasty];
}

/**
 * Normalize an arbitrary dynasty string (session row TEXT, API payloads)
 * to a DynastyName. Unknown values fall back to COSMIC (the flat
 * placeholder ruleset - the conservative payout).
 */
export function normalizeDynastyName(value: unknown): DynastyName {
  const name = typeof value === 'string' ? value.toUpperCase() : '';
  if (name === 'PRIMAL' || name === 'CYBER' || name === 'COSMIC') {
    return name;
  }
  return 'COSMIC';
}

/**
 * One-line ruleset identity text - the UI's replacement for the retired
 * "+5% stat" copy (starter cards, variant details, pre-game overlay).
 */
export const rulesetExplainer: Record<DynastyName, string> = {
  PRIMAL: 'Steady speed — every food worth more than the last',
  CYBER: 'Speed rises — survive the overclock for up to ×3',
  COSMIC: 'Flux dynasty — steady runs today, wrap phases and constellations soon',
};

/**
 * Deterministic run totals - THE scoring authority for client and server.
 * A pure integer fold over n = 1..foodCount.
 */
export function computeRunTotals(
  dynasty: DynastyName,
  foodCount: number
): { rawDna: number; score: number } {
  const ruleset = RULESETS[dynasty];
  const count = Number.isFinite(foodCount) ? Math.max(0, Math.floor(foodCount)) : 0;

  let rawDna = 0;
  let score = 0;
  for (let n = 1; n <= count; n++) {
    rawDna += ruleset.foodDnaValue(n);
    score += Math.round(FOOD_BASE_SCORE * ruleset.scoreMultiplier(n));
  }
  return { rawDna, score };
}

/**
 * Apply the run outcome to the raw DNA total: banked (+25%) when the run
 * ended through the exit portal, salvage (60%) on death. The single
 * float->int boundary of the whole scoring pipeline.
 */
export function applyOutcome(rawDna: number, extracted: boolean): number {
  const raw = Number.isFinite(rawDna) ? Math.max(0, rawDna) : 0;
  return Math.floor(raw * (extracted ? BANK.extractMultiplier : BANK.deathMultiplier));
}

/**
 * Roll the food-interval to the next exit portal after a despawn:
 * intervalBase +/- intervalJitter, uniform, inclusive. rng is injectable
 * for deterministic tests; affects spawn timing only, never payout.
 */
export function rollExitInterval(
  extraction: ExtractionConfig,
  rng: () => number = Math.random
): number {
  const span = 2 * extraction.intervalJitter + 1;
  return extraction.intervalBase - extraction.intervalJitter + Math.floor(rng() * span);
}

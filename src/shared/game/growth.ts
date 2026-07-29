/**
 * Growth profiles shared by the live engine and the settlement length fold.
 *
 * `baseline`, `tuned`, and `aggressive` are retained because historical run
 * stamps and the optional difficulty ladder still name them. New Ground runs
 * are stamped `dynasty`: CYBER and COSMIC grow +1 throughout, while PRIMAL
 * uses the owner-approved degressive pressure curve.
 *
 * Growth and Genome-offer cadence are intentionally independent. Cadence
 * lives in `geneCadence.ts`; changing how quickly a body fills the board must
 * never silently change how often the player gets to build it.
 */

import type { DynastyName } from '@/shared/game/rulesets';

export type GrowthProfileId = 'baseline' | 'dynasty' | 'tuned' | 'aggressive';

export interface GrowthProfile {
  readonly id: GrowthProfileId;
  /** Retained for ladder/history diagnostics; the Growth Lab selector is retired. */
  readonly label: string;
  readonly blurb: string;
  readonly initialLength: number;
  readonly simultaneousFoods: number;
  /** Base segments gained on the n-th food (1-indexed). */
  baseGrowth(
    n: number,
    dynasty?: DynastyName,
    lengthBeforeFood?: number
  ): number;
}

export interface PrimalGrowthStage {
  /** The stage applies while modelled length is strictly below this value. */
  readonly untilLength: number;
  readonly growth: number;
}

/**
 * PRIMAL reaches pressure quickly, then sheds acceleration as its own body
 * becomes the opponent. The thresholds are 18.75%, 24%, and 30% of a 20x20
 * board. They are length-indexed rather than food-indexed so Overgrowth,
 * Bulk Up, INFUSE, and pressure growth advance the downshift instead of
 * compounding a high rate for a fixed number of foods.
 */
export const PRIMAL_GROWTH_STAGES: readonly PrimalGrowthStage[] = [
  { untilLength: 75, growth: 4 },
  { untilLength: 96, growth: 3 },
  { untilLength: 120, growth: 2 },
  { untilLength: Number.POSITIVE_INFINITY, growth: 1 },
] as const;

export function primalGrowthAtLength(lengthBeforeFood: number): number {
  const length = Number.isFinite(lengthBeforeFood)
    ? Math.max(0, Math.floor(lengthBeforeFood))
    : 3;
  return (
    PRIMAL_GROWTH_STAGES.find((stage) => length < stage.untilLength)?.growth ?? 1
  );
}

/** Base-only fallback for diagnostics that do not have a live length. */
function primalLengthBeforeFood(n: number): number {
  let length = 3;
  for (let food = 1; food < n; food += 1) {
    length += primalGrowthAtLength(length);
  }
  return length;
}

function dynastyGrowth(
  n: number,
  dynasty: DynastyName = 'PRIMAL',
  lengthBeforeFood?: number
): number {
  if (dynasty !== 'PRIMAL') return 1;
  const length =
    lengthBeforeFood === undefined
      ? primalLengthBeforeFood(n)
      : lengthBeforeFood;
  return primalGrowthAtLength(length);
}

/** Legacy Growth Lab / ladder curve. */
function stepped(
  early: number,
  earlyUntil: number,
  plateau: number,
  plateauUntil: number,
  accelEvery: number,
  cap: number
): (n: number) => number {
  return (n: number) => {
    if (n < earlyUntil) return early;
    if (n < plateauUntil) return plateau;
    return Math.min(cap, plateau + Math.floor((n - plateauUntil) / accelEvery));
  };
}

export const GROWTH_PROFILES: Readonly<Record<GrowthProfileId, GrowthProfile>> = {
  /** Historical control: missing/legacy stamps must continue to settle at +1. */
  baseline: {
    id: 'baseline',
    label: 'Classic',
    blurb: 'Legacy control: one food, one segment.',
    initialLength: 3,
    simultaneousFoods: 1,
    baseGrowth: () => 1,
  },

  /** The normal Ground rules for all newly started runs. */
  dynasty: {
    id: 'dynasty',
    label: 'Dynasty',
    blurb: 'Each dynasty carries its own pressure rhythm.',
    initialLength: 3,
    simultaneousFoods: 1,
    baseGrowth: dynastyGrowth,
  },

  /** Legacy instrument retained as the first optional ladder pressure floor. */
  tuned: {
    id: 'tuned',
    label: 'Tuned',
    blurb: 'Grow fast, settle, then the board closes on you.',
    initialLength: 3,
    simultaneousFoods: 1,
    baseGrowth: stepped(6, 12, 2, 32, 6, 8),
  },

  /** Legacy instrument retained as the top optional ladder pressure floor. */
  aggressive: {
    id: 'aggressive',
    label: 'Aggressive',
    blurb: 'Short and vicious. The board fills before you are ready.',
    initialLength: 3,
    simultaneousFoods: 1,
    baseGrowth: stepped(8, 10, 2, 28, 5, 10),
  },
} as const;

/** Missing stamps are historical and must preserve the old +1 fold. */
export const DEFAULT_GROWTH_PROFILE: GrowthProfileId = 'baseline';

/** Every newly started run is explicitly stamped with this profile. */
export const ACTIVE_GROWTH_PROFILE: GrowthProfileId = 'dynasty';

export function resolveGrowthProfile(id: unknown): GrowthProfile {
  if (typeof id === 'string' && id in GROWTH_PROFILES) {
    return GROWTH_PROFILES[id as GrowthProfileId];
  }
  return GROWTH_PROFILES[DEFAULT_GROWTH_PROFILE];
}

export function isGrowthProfileId(value: unknown): value is GrowthProfileId {
  return typeof value === 'string' && value in GROWTH_PROFILES;
}

/**
 * THE ONE FUNCTION for base body growth. Both `SnakeGameLogic` and
 * `computeLengthTrace` call it with the pre-food modelled length.
 */
export function baseGrowthForFood(
  profile: GrowthProfile,
  n: number,
  dynasty: DynastyName = 'PRIMAL',
  lengthBeforeFood?: number
): number {
  const food = Number.isFinite(n) && n >= 1 ? Math.floor(n) : 1;
  return Math.max(
    0,
    Math.floor(profile.baseGrowth(food, dynasty, lengthBeforeFood))
  );
}

/**
 * Ascendance — Gen4+ lineage progression (Constitution §8.2, §6.2).
 *
 * Generations are UNCAPPED. Gen1–3 keep their shipped unlocks (second trait
 * slot, lineage strength). From Gen4 every generation permanently raises that
 * snake's **Yield** — the run's full-strength economic total, which is also
 * what Depth reads (§6.2). Score never reads any of this (Rule 2).
 *
 * The curve, stated exactly:
 *
 *   bonus(g) = 0 for g <= 3
 *   bonus(g) = CEILING * (1 - DECAY^(g - 3))   for g >= 4
 *
 *   CEILING = 0.30           the asymptote: +30% Yield, approached, never reached
 *   DECAY   = 1 - 0.02/0.30 = 14/15 ≈ 0.933333
 *
 * DECAY is derived from the two numbers the Constitution states rather than
 * tuned independently, which makes the first increment exactly +2%
 * (bonus(4) = 0.30 * (1 - 14/15) = 0.02) and the sum of all increments
 * exactly +30%. The sequence is strictly increasing, bounded above by 0.30,
 * and reaches +29.96% at Gen 100 — so a veteran's snake stays ~1.3x a
 * newcomer's, never 10x (§8.2: "a clanmate fresh to the hunt is never dead
 * weight").
 *
 * Existing Gen>3 snakes enter the curve AT their current generation: the
 * bonus is a pure function of the generation column, computed at settlement.
 * Nothing is reset and nothing is recomputed backwards (Rule 6).
 *
 * Rule 3: no euro reaches this number. The only input is a snake's
 * generation, which is only ever raised by spending DNA on breeding, and DNA
 * is never sold (§10.4).
 *
 * SQL lockstep: supabase/migrations/047_deterministic_lineage_draft.sql
 * (`ascendance_yield_bonus`, `ascendance_yield_multiplier`, `breeding_cost`).
 */

/** The first generation that earns an Ascendance bonus. */
export const ASCENDANCE_START_GENERATION = 4;

/** The asymptote of the Yield bonus. Never reached, never exceeded. */
export const ASCENDANCE_YIELD_CEILING = 0.3;

/** The first increment, at Gen 4. */
export const ASCENDANCE_FIRST_INCREMENT = 0.02;

/** Geometric decay of each successive increment: 1 - 0.02/0.30 = 14/15. */
export const ASCENDANCE_DECAY =
  1 - ASCENDANCE_FIRST_INCREMENT / ASCENDANCE_YIELD_CEILING;

/** Bonuses are quoted to four decimals (0.01% resolution) on both sides. */
const BONUS_PRECISION = 10_000;

function roundBonus(value: number): number {
  return Math.round(value * BONUS_PRECISION) / BONUS_PRECISION;
}

function normalizeGeneration(generation: unknown): number {
  if (typeof generation !== 'number' || !Number.isFinite(generation)) return 1;
  return Math.max(1, Math.floor(generation));
}

/**
 * The Ascendance Yield bonus for a snake at `generation`, as a fraction
 * (0.02 = +2%). 0 for Gen1–3; strictly increasing and < 0.30 thereafter.
 */
export function ascendanceYieldBonus(generation: number): number {
  const gen = normalizeGeneration(generation);
  const steps = gen - (ASCENDANCE_START_GENERATION - 1);
  if (steps <= 0) return 0;
  const raw =
    ASCENDANCE_YIELD_CEILING * (1 - Math.pow(ASCENDANCE_DECAY, steps));
  return Math.min(ASCENDANCE_YIELD_CEILING, roundBonus(raw));
}

/** The multiplier a run's full-strength Yield is scaled by. Always >= 1. */
export function ascendanceYieldMultiplier(generation: number): number {
  return 1 + ascendanceYieldBonus(generation);
}

/**
 * Apply Ascendance to a run's Yield. Yield stays an integer number of DNA;
 * the multiplier is never below 1, so this can only raise it (Rule 6).
 */
export function applyAscendanceYield(
  yieldDna: number,
  generation: number
): number {
  if (!Number.isFinite(yieldDna) || yieldDna <= 0) {
    return Number.isFinite(yieldDna) ? Math.max(0, Math.floor(yieldDna)) : 0;
  }
  return Math.floor(yieldDna * ascendanceYieldMultiplier(generation));
}

// =============================================================================
// BREEDING COST — the shipped curve, steepened through Ascendance (§8.2)
// =============================================================================

/** Base DNA cost of any breeding (shipped curve, unchanged). */
export const BREEDING_BASE_COST = 200;

/** DNA added per averaged parent generation (shipped curve, unchanged). */
export const BREEDING_COST_PER_GEN = 100;

/**
 * Cost multiplier per generation past Gen3. The Constitution asks the lane to
 * "span months, not day one" [H]; 1.25 compounds against a Yield bonus that
 * decays, so each Ascendance step buys visibly less for visibly more.
 */
export const ASCENDANCE_COST_STEEPENING = 1.25;

/**
 * Steepening is clamped at 200 steps (Gen 203) so the NUMERIC exponentiation
 * in the SQL mirror cannot overflow. The ceiling below bites long before.
 */
const MAX_STEEPENING_STEPS = 200;

/** Hard ceiling on a single breed, an overflow guard rather than a design dial. */
export const BREEDING_COST_CEILING = 1_000_000_000;

/** Offspring generation: one above the highest parent generation. Uncapped. */
export function offspringGeneration(gen1: number, gen2: number): number {
  return Math.max(normalizeGeneration(gen1), normalizeGeneration(gen2)) + 1;
}

/**
 * DNA cost to breed two parents.
 *
 *   base  = 200 + floor((gen1 + gen2) / 2) * 100      (the shipped curve)
 *   cost  = base * 1.25^max(0, childGeneration - 3)
 *
 * A child of Gen1–3 costs exactly what it costs today: the steepening
 * exponent is 0 there, so no existing plan gets more expensive (Rule 6).
 */
export function breedingCost(gen1: number, gen2: number): number {
  const g1 = normalizeGeneration(gen1);
  const g2 = normalizeGeneration(gen2);
  const base =
    BREEDING_BASE_COST + Math.floor((g1 + g2) / 2) * BREEDING_COST_PER_GEN;
  const steps = Math.min(
    Math.max(0, offspringGeneration(g1, g2) - (ASCENDANCE_START_GENERATION - 1)),
    MAX_STEEPENING_STEPS
  );
  const cost = base * Math.pow(ASCENDANCE_COST_STEEPENING, steps);
  return Math.min(BREEDING_COST_CEILING, Math.ceil(cost));
}

/** True once a snake has entered Ascendance (Gen4+). */
export function isAscended(generation: number): boolean {
  return normalizeGeneration(generation) >= ASCENDANCE_START_GENERATION;
}

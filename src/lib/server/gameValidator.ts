/**
 * Game Result Validator - server-authoritative payout recompute (Design v2)
 *
 * The client claims only the raw facts of a run (food count + how it
 * ended); the server recomputes score and DNA exactly via the shared
 * ruleset module and PAYS THE RECOMPUTED VALUE regardless of the claim.
 * Claims that mismatch beyond a rounding epsilon can only flag the session
 * (validated: false) - they can never inflate the payout.
 *
 * A legacy validator (bounds-only, flat 10 DNA/food) is kept for the
 * deploy window where old clients still send score-based payloads without
 * food_count.
 */

import { GAME_CONFIG } from '@/shared/config/game';
import {
  applyOutcome,
  computeRunTotals,
  getRuleset,
  type DynastyName,
} from '@/shared/game/rulesets';

export interface GameResultInput {
  /** Raw foods eaten - the minimal claimed fact the payout derives from. */
  food_count: number;
  /** True when the run ended through the exit portal (banked +25%). */
  extracted: boolean;
  /** Claimed display score (recomputed server-side). */
  score: number;
  /** Claimed raw DNA before outcome multiplier (recomputed server-side). */
  dna_earned: number;
  duration_seconds: number;
  died: boolean;
  victory: boolean;
}

export interface ValidationResult {
  valid: boolean;
  /** Authoritative payout: applyOutcome(computeRunTotals(...)) [+ victory bonus]. */
  adjustedDna: number;
  /** Authoritative display score (recomputed). */
  adjustedScore: number;
  /** Validated food count (claimed, clamped to the rate bound). */
  foodCount: number;
  /** Effective outcome used for payout (extracted claims that conflict with died are voided). */
  extracted: boolean;
  errors: string[];
}

/** Claims within +/- this many DNA/score of the recompute are treated as rounding noise. */
export const CLAIM_EPSILON = 1;

export function validateGameResult(
  input: GameResultInput,
  serverStartedAt: Date,
  dynasty: DynastyName
): ValidationResult {
  const errors: string[] = [];
  const ruleset = getRuleset(dynasty);
  const now = Date.now();
  const serverElapsed = Math.floor((now - serverStartedAt.getTime()) / 1000);

  // 1. Duration bounds (unchanged from v1)
  if (input.duration_seconds > serverElapsed + 10) {
    errors.push('INVALID_DURATION: Client duration exceeds server elapsed time');
  }
  if (input.duration_seconds > GAME_CONFIG.session.maxDuration) {
    errors.push('INVALID_DURATION: Duration exceeds maximum');
  }

  // 2. Outcome consistency: an extracted run cannot also be a death.
  //    Conflicting claims void the bank bonus (pay the salvage rate).
  let extracted = input.extracted === true;
  if (extracted && input.died === true) {
    errors.push('INVALID_OUTCOME: extracted and died are mutually exclusive');
    extracted = false;
  }

  // 3. Food count sanity: non-negative integer...
  let foodCount = Number.isFinite(input.food_count)
    ? Math.floor(input.food_count)
    : 0;
  if (foodCount < 0 || foodCount !== input.food_count) {
    errors.push(`INVALID_FOOD_COUNT: ${input.food_count} is not a non-negative integer`);
    foodCount = Math.max(0, foodCount);
  }

  // ...bounded by the per-dynasty food rate (replaces score <= duration/2)
  const maxFood = Math.ceil(
    Math.max(0, input.duration_seconds) * ruleset.validation.maxFoodPerSecond
  );
  if (foodCount > maxFood) {
    errors.push(
      `INVALID_FOOD_RATE: ${foodCount} foods exceeds max ${maxFood} for ${input.duration_seconds}s (${dynasty})`
    );
    foodCount = maxFood;
  }

  // 4. Exact recompute - the payout authority
  const { rawDna, score: expectedScore } = computeRunTotals(dynasty, foodCount);
  let expectedPayout = applyOutcome(rawDna, extracted);
  if (input.victory) {
    expectedPayout += GAME_CONFIG.economy.dna.completionBonus;
  }

  // 5. Claim mismatches only flag - the payout stays the recomputed value
  if (Math.abs(input.dna_earned - rawDna) > CLAIM_EPSILON) {
    errors.push(
      `DNA_MISMATCH: claimed ${input.dna_earned}, recomputed ${rawDna} (${dynasty}, ${foodCount} foods)`
    );
  }
  if (Math.abs(input.score - expectedScore) > CLAIM_EPSILON) {
    errors.push(
      `SCORE_MISMATCH: claimed ${input.score}, recomputed ${expectedScore} (${dynasty}, ${foodCount} foods)`
    );
  }

  return {
    valid: errors.length === 0,
    adjustedDna: expectedPayout,
    adjustedScore: expectedScore,
    foodCount,
    extracted,
    errors,
  };
}

// ============================================================================
// Legacy validator (deploy-window fallback for payloads without food_count)
// ============================================================================

export interface LegacyGameResultInput {
  score: number;
  dna_earned: number;
  duration_seconds: number;
  died: boolean;
  victory: boolean;
}

/**
 * Pre-Design-v2 bounds-only validation: score IS the food count, DNA is
 * flat 10/food + 10% score bonus, no outcome multiplier. Used only while
 * old clients (payloads without food_count) are still live.
 */
export function validateLegacyGameResult(
  input: LegacyGameResultInput,
  serverStartedAt: Date
): ValidationResult {
  const errors: string[] = [];
  const now = Date.now();
  const serverElapsed = Math.floor((now - serverStartedAt.getTime()) / 1000);

  if (input.duration_seconds > serverElapsed + 10) {
    errors.push('INVALID_DURATION: Client duration exceeds server elapsed time');
  }

  if (input.duration_seconds > GAME_CONFIG.session.maxDuration) {
    errors.push('INVALID_DURATION: Duration exceeds maximum');
  }

  const maxReasonableScore = Math.ceil(input.duration_seconds / 2);
  if (input.score > maxReasonableScore) {
    errors.push(
      `INVALID_SCORE: Score ${input.score} exceeds max ${maxReasonableScore} for ${input.duration_seconds}s`
    );
  }

  const { dna } = GAME_CONFIG.economy;
  const validScore = Math.min(input.score, maxReasonableScore);
  let expectedDna = validScore * dna.foodValue;
  expectedDna += Math.floor(validScore * dna.scoreMultiplier);

  if (input.victory) {
    expectedDna += dna.completionBonus;
  }

  if (input.dna_earned > expectedDna * 1.1) {
    errors.push(`INVALID_DNA: Claimed ${input.dna_earned}, max ${expectedDna}`);
  }

  const adjustedDna = Math.min(input.dna_earned, expectedDna);

  return {
    valid: errors.length === 0,
    adjustedDna,
    adjustedScore: validScore,
    // Legacy score == food count; old runs are always death-ended
    foodCount: Math.max(0, validScore),
    extracted: false,
    errors,
  };
}

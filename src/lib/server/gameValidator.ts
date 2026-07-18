/**
 * Game Result Validator - server-authoritative payout recompute (Design v2)
 *
 * The client claims only the raw facts of a run (food count + how it
 * ended + mutation picks); the server recomputes score and DNA exactly via
 * the shared ruleset module and PAYS THE RECOMPUTED VALUE regardless of the
 * claim. Claims that mismatch beyond a rounding epsilon can only flag the
 * session (validated: false) - they can never inflate the payout.
 *
 * Phase 2 (GAME_DESIGN_V2.md sections 3.3 + 5.3):
 * - Mutations: legality (known ids, no dupes, <= 4 held), count bound
 *   (picks <= floor(foodCount / 15); the k-th pick's atFood >= 15k and
 *   <= foodCount), then EXACT recompute of every [E] effect from its
 *   atFood onward for PRIMAL/CYBER (and the COSMIC base).
 * - Phoenix: a claimed trigger is only honored when phoenix is held and
 *   the food index is plausible; honoring it strictly lowers the payout,
 *   so there is no inflation vector in either direction.
 * - COSMIC bounded trust: combo chains depend on tick timing the server
 *   cannot reconstruct, so the claimed combo bonus is accepted only up to
 *   floor(base x 1.4) (the x2.4 per-food cap) and a sane max chain;
 *   anything beyond clamps and flags rather than recomputing.
 *
 * Phase 3A (section 6): traits. The traits parameter comes from the SNAKE
 * ROW referenced by the session (collected_snakes.traits via
 * snake_used_id) - NEVER from the client payload, which has no trait
 * field. [E] trait effects join the exact recompute; the Ascetic trait's
 * physical side (mutation food never spawns) makes any mutation claim on
 * an Ascetic snake impossible, so such claims are dropped and flagged;
 * the Patient trait doubles the mutation cadence, tightening the
 * per-pick food bound from 15k to 30k.
 */

import { GAME_CONFIG } from '@/shared/config/game';
import {
  COSMIC_TRUST_MAX_BONUS_RATIO,
  applyOutcomeWithMutations,
  computeRunTotals,
  getRuleset,
  type DynastyName,
} from '@/shared/game/rulesets';
import {
  MUTATION_SPAWN,
  isMutationId,
  type MutationId,
  type MutationPick,
} from '@/shared/game/mutations';
import { type TraitId } from '@/shared/game/traits';

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
  /** Claimed mutation picks: [{ id, atFood }] in pick order (sanitized here). */
  mutations?: unknown;
  /** Claimed Phoenix trigger food index (payout-reducing when honored). */
  phoenix_triggered_at_food?: unknown;
  /** COSMIC combo summary: { combo_dna_bonus, combo_score_bonus, max_chain }. */
  cosmic?: unknown;
}

/** Accepted COSMIC combo claim (post-clamp). */
export interface CosmicClaim {
  comboDnaBonus: number;
  comboScoreBonus: number;
  maxChain: number;
}

export interface ValidationResult {
  valid: boolean;
  /** Authoritative payout: outcome(recomputed raw) [+ victory bonus]. */
  adjustedDna: number;
  /**
   * Recomputed RAW DNA (incl. accepted COSMIC combo bonus), BEFORE the
   * outcome multiplier / victory bonus / account stack - the section 7.1
   * mastery XP base: extracted runs grant floor(rawDna x 1.25).
   */
  rawDna: number;
  /** Authoritative display score (recomputed; + clamped combo on COSMIC). */
  adjustedScore: number;
  /** Validated food count (claimed, clamped to the rate bound). */
  foodCount: number;
  /** Effective outcome used for payout (extracted claims that conflict with died are voided). */
  extracted: boolean;
  /** Sanitized mutation picks the payout was computed from. */
  mutations: MutationPick[];
  /** Honored Phoenix trigger food index, null when absent/implausible. */
  phoenixTriggeredAtFood: number | null;
  /** Accepted (clamped) COSMIC combo claim, null off-COSMIC or when absent. */
  cosmic: CosmicClaim | null;
  errors: string[];
}

/** Claims within +/- this many DNA/score of the recompute are treated as rounding noise. */
export const CLAIM_EPSILON = 1;

/** Minimum food gap the spawn cadence allows before the k-th mutation pick. */
const MIN_FOODS_PER_PICK = 15;

/** Patient trait: cadence doubled, so the k-th pick needs 30k foods. */
const MIN_FOODS_PER_PICK_PATIENT = 30;

/**
 * Sanitize the claimed mutation picks against legality + cadence bounds.
 * Illegal entries are dropped and flagged; bound violations keep the legal
 * prefix (the payout is then computed from what remains - conservative
 * because whatever the cheat intended, the server only ever pays its own
 * recompute of the accepted picks).
 */
function sanitizeMutations(
  raw: unknown,
  foodCount: number,
  errors: string[],
  minFoodsPerPick: number = MIN_FOODS_PER_PICK,
  unlockedPool: MutationId[] | null = null
): MutationPick[] {
  if (raw === undefined || raw === null) return [];
  if (!Array.isArray(raw)) {
    errors.push('INVALID_MUTATIONS: not an array');
    return [];
  }

  const picks: MutationPick[] = [];
  const seen = new Set<string>();
  for (const entry of raw) {
    const id = (entry as { id?: unknown } | null)?.id;
    const atFood = (entry as { atFood?: unknown } | null)?.atFood;
    if (!isMutationId(id)) {
      errors.push(`INVALID_MUTATIONS: unknown mutation id ${JSON.stringify(id)}`);
      continue;
    }
    // Pool gating (section 7.1): a pick outside the player's ACTUAL
    // unlocked pool (recomputed server-side from player_mastery - never
    // the client's claim) is dropped and flagged. The payout is then the
    // recompute of the accepted picks only.
    if (unlockedPool !== null && !unlockedPool.includes(id)) {
      errors.push(`MUTATION_LOCKED: ${id} is not in the player's unlocked pool`);
      continue;
    }
    if (seen.has(id)) {
      errors.push(`INVALID_MUTATIONS: duplicate mutation ${id}`);
      continue;
    }
    if (
      typeof atFood !== 'number' ||
      !Number.isInteger(atFood) ||
      atFood < 0
    ) {
      errors.push(`INVALID_MUTATIONS: ${id} atFood ${JSON.stringify(atFood)} is not a non-negative integer`);
      continue;
    }
    seen.add(id);
    picks.push({ id, atFood });
  }

  if (picks.length > MUTATION_SPAWN.maxHeld) {
    errors.push(
      `MUTATION_BOUND: ${picks.length} picks exceeds the stacking cap ${MUTATION_SPAWN.maxHeld}`
    );
    picks.length = MUTATION_SPAWN.maxHeld;
  }

  // Cadence count bound: the k-th mutation food cannot exist before food
  // minFoodsPerPick x k (15k normally, 30k under the Patient trait)
  const maxPicks = Math.floor(foodCount / minFoodsPerPick);
  if (picks.length > maxPicks) {
    errors.push(
      `MUTATION_BOUND: ${picks.length} picks exceeds floor(${foodCount}/${minFoodsPerPick}) = ${maxPicks}`
    );
    picks.length = Math.max(0, maxPicks);
  }

  // Per-pick window: atFood >= minFoodsPerPick x pick-index (1-based) and
  // <= foodCount. A violation invalidates that pick and everything after
  // it (later picks depend on the same cadence).
  for (let i = 0; i < picks.length; i++) {
    const minAt = minFoodsPerPick * (i + 1);
    if (picks[i].atFood < minAt || picks[i].atFood > foodCount) {
      errors.push(
        `MUTATION_BOUND: pick ${i + 1} (${picks[i].id}) atFood ${picks[i].atFood} outside [${minAt}, ${foodCount}]`
      );
      picks.length = i;
      break;
    }
  }

  return picks;
}

/** Coerce a claimed non-negative integer field; null when invalid. */
function nonNegativeInt(value: unknown): number | null {
  return typeof value === 'number' && Number.isInteger(value) && value >= 0
    ? value
    : null;
}

/**
 * Sanitize + clamp the COSMIC combo claim (bounded trust). Returns the
 * accepted claim; pushes errors (=> validated:false) when anything had to
 * be clamped or zeroed.
 */
function sanitizeCosmicClaim(
  raw: unknown,
  foodCount: number,
  baseDna: number,
  baseScore: number,
  errors: string[]
): CosmicClaim {
  const claim = (raw ?? {}) as Record<string, unknown>;
  let dnaBonus = nonNegativeInt(claim.combo_dna_bonus) ?? 0;
  let scoreBonus = nonNegativeInt(claim.combo_score_bonus) ?? 0;
  let maxChain = nonNegativeInt(claim.max_chain) ?? 0;
  if (
    raw !== undefined &&
    raw !== null &&
    (typeof raw !== 'object' ||
      nonNegativeInt(claim.combo_dna_bonus) === null ||
      nonNegativeInt(claim.combo_score_bonus) === null ||
      nonNegativeInt(claim.max_chain) === null)
  ) {
    errors.push('COSMIC_COMBO: malformed combo summary');
  }

  // Chain length can never exceed foods eaten
  if (maxChain > foodCount) {
    errors.push(`COSMIC_COMBO: max chain ${maxChain} exceeds ${foodCount} foods`);
    maxChain = foodCount;
  }

  // A combo bonus requires at least a chain of 2
  if ((dnaBonus > 0 || scoreBonus > 0) && maxChain < 2) {
    errors.push('COSMIC_COMBO: combo bonus claimed without a chain');
    dnaBonus = 0;
    scoreBonus = 0;
  }

  // Per-dynasty ceiling: every food's combo is capped x2.4, so the bonus
  // over the no-combo recompute is capped at base x 1.4
  const maxDnaBonus = Math.floor(baseDna * COSMIC_TRUST_MAX_BONUS_RATIO);
  const maxScoreBonus = Math.floor(baseScore * COSMIC_TRUST_MAX_BONUS_RATIO);
  if (dnaBonus > maxDnaBonus) {
    errors.push(
      `COSMIC_COMBO: DNA bonus ${dnaBonus} exceeds ceiling ${maxDnaBonus} - clamped`
    );
    dnaBonus = maxDnaBonus;
  }
  if (scoreBonus > maxScoreBonus) {
    errors.push(
      `COSMIC_COMBO: score bonus ${scoreBonus} exceeds ceiling ${maxScoreBonus} - clamped`
    );
    scoreBonus = maxScoreBonus;
  }

  return { comboDnaBonus: dnaBonus, comboScoreBonus: scoreBonus, maxChain };
}

export function validateGameResult(
  input: GameResultInput,
  serverStartedAt: Date,
  dynasty: DynastyName,
  traits: TraitId[] = [],
  /**
   * The player's unlocked mutation pool, recomputed SERVER-SIDE from
   * player_mastery (section 7.1) - null disables pool gating (legacy
   * callers / tests). Free Play passes the full pool (section 7.4).
   */
  unlockedPool: MutationId[] | null = null
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

  // 4. Mutation legality + cadence bounds (section 5.3). The Patient
  //    trait halves the spawn rate, so the per-pick bound tightens to 30k.
  let mutations = sanitizeMutations(
    input.mutations,
    foodCount,
    errors,
    traits.includes('patient') ? MIN_FOODS_PER_PICK_PATIENT : MIN_FOODS_PER_PICK,
    unlockedPool
  );

  // 4b. Ascetic trait: mutation food never spawns, so ANY mutation claim
  //     on an Ascetic snake is impossible - drop them all and flag.
  if (traits.includes('ascetic') && mutations.length > 0) {
    errors.push(
      `TRAIT_CONFLICT: ${mutations.length} mutation pick(s) claimed on an Ascetic snake (mutation food never spawns)`
    );
    mutations = [];
  }

  // 5. Phoenix trigger: only honored when phoenix is held and the index is
  //    plausible. Honoring a trigger strictly lowers the payout, so an
  //    implausible claim is ignored (never inflates), just flagged.
  let phoenixTriggeredAtFood: number | null = null;
  const rawPhoenix = input.phoenix_triggered_at_food;
  if (rawPhoenix !== undefined && rawPhoenix !== null) {
    const phoenixPick = mutations.find((m) => m.id === 'phoenix');
    const at = nonNegativeInt(rawPhoenix);
    if (!phoenixPick) {
      errors.push('PHOENIX_INVALID: trigger claimed without phoenix held');
    } else if (at === null || at < phoenixPick.atFood || at > foodCount) {
      errors.push(
        `PHOENIX_INVALID: trigger ${JSON.stringify(rawPhoenix)} outside [${phoenixPick.atFood}, ${foodCount}]`
      );
    } else {
      phoenixTriggeredAtFood = at;
    }
  }

  // 6. Exact recompute of the mutation- and trait-aware base - the payout
  //    authority (traits come from the snake row, never the claim)
  const { rawDna: baseDna, score: baseScore } = computeRunTotals(
    dynasty,
    foodCount,
    mutations,
    phoenixTriggeredAtFood,
    traits
  );

  // 7. COSMIC bounded trust: accept the combo claim only up to the caps
  let rawDna = baseDna;
  let expectedScore = baseScore;
  let cosmic: CosmicClaim | null = null;
  if (dynasty === 'COSMIC') {
    if (input.cosmic !== undefined && input.cosmic !== null) {
      cosmic = sanitizeCosmicClaim(input.cosmic, foodCount, baseDna, baseScore, errors);
      rawDna += cosmic.comboDnaBonus;
      expectedScore += cosmic.comboScoreBonus;
    }
  } else if (input.cosmic !== undefined && input.cosmic !== null) {
    errors.push(`COSMIC_COMBO: combo summary on a ${dynasty} session - ignored`);
  }

  // 8. Outcome multiplier (mutation- and trait-aware) + victory bonus
  let expectedPayout = applyOutcomeWithMutations(
    rawDna,
    extracted,
    mutations,
    phoenixTriggeredAtFood !== null,
    traits
  );
  if (input.victory) {
    expectedPayout += GAME_CONFIG.economy.dna.completionBonus;
  }

  // 9. Claim mismatches only flag - the payout stays the recomputed value
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
    rawDna,
    adjustedScore: expectedScore,
    foodCount,
    extracted,
    mutations,
    phoenixTriggeredAtFood,
    cosmic,
    errors,
  };
}

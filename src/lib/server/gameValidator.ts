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
  applyGenomeOutcome,
  applyOutcomeWithMutations,
  computeGenomeRunTotals,
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
import { type AnomalyId } from '@/shared/game/anomalies';
import {
  GENE_ECONOMICS,
  GENOME_SPAWN,
  geneStrains,
  isGeneId,
  type GeneId,
  type GenePick,
} from '@/shared/game/genes';
import {
  STRAIN_PHYSICS,
  type StrainId,
  type StrainPoints,
} from '@/shared/game/strains';
import {
  clampGenomeClaims,
  sanitizeInfuses,
  sanitizeLossEvents,
  sanitizeRevive,
  sanitizeSurges,
  strainActivations,
  type GenomeClaims,
  type GenomeRevive,
  type GenomeRunInput,
  type StrainSurge,
} from '@/shared/game/genome';
import {
  fusePicks,
  fusedSlotCount,
  isSpliceId,
  type SpliceId,
} from '@/shared/game/splices';

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
  /**
   * Genome claim block (Buildcraft: The Genome): { infuses, surges,
   * revive, claims, lossEvents, offerTrace } - sanitized here. Only
   * honored when the session carries a run_seed (server capability).
   */
  genome?: unknown;
}

/** Server context for genome validation - all fields server-derived. */
export interface GenomeValidationContext {
  /** Starting strain points (traits + lineage, from the snake row). */
  heirloom: StrainPoints;
  /** The player's unlocked GENE pool (server-composed), null = ungated. */
  genePool: GeneId[] | null;
  /** Server fact: the previous earned run ended in death (Grave Robber). */
  prevRunDied: boolean;
  /** COSMIC M10: Constellation Crown may raise the combo trust ratio. */
  crownAllowed: boolean;
  /** FTUE tier ceiling (economy-binding; mirrors the engine's cap). */
  tierCap: 1 | 2 | 3;
  /** Server-derived Gauntlet strain ban; Expressions/Apexes are disabled. */
  suppressedStrains?: readonly StrainId[];
  /** Server-derived FTUE gate. Defaults true for existing callers/tests. */
  splicesUnlocked?: boolean;
}

/** The validator-accepted genome record (game_sessions.genome JSONB). */
export interface AcceptedGenome {
  v: 1;
  picks: GenePick[];
  splices: { id: SpliceId; atFood: number }[];
  surges: StrainSurge[];
  infuses: { atFood: number }[];
  revive: GenomeRevive | null;
  claims: GenomeClaims;
  strainCounts: StrainPoints;
  expressions: Partial<Record<string, number>>;
  apexes: Partial<Record<string, number>>;
  /** The global raw clamp bound while individual caps passed (cheat signal). */
  globalClampHit: boolean;
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
  /**
   * Mastery XP base: the DETERMINISTIC recompute only - bounded-trust
   * claims never feed mastery (BUILDCRAFT_GENOME_DESIGN.md §9). Equals
   * rawDna on legacy runs (which have no genome claims).
   */
  masteryRawDna: number;
  /** Accepted genome record (game_sessions.genome), null on legacy runs. */
  genome: AcceptedGenome | null;
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
  errors: string[],
  trustRatio: number = COSMIC_TRUST_MAX_BONUS_RATIO
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
  // over the no-combo recompute is capped at base x 1.4 (x1.8 when the
  // Constellation Crown is held at COSMIC M10 - cap x2.8).
  const maxDnaBonus = Math.floor(baseDna * trustRatio);
  const maxScoreBonus = Math.floor(baseScore * trustRatio);
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
  unlockedPool: MutationId[] | null = null,
  /**
   * The session's weekly anomaly (Design v2 Phase 4B, section 7.2) -
   * read from the SESSION ROW (server-stamped at start), never from the
   * claim. Its [E] effects (Gold Rush food x1.5, Twin Exits bank x1.15)
   * join the exact recompute; [P] anomalies change nothing here.
   */
  anomaly: AnomalyId | null = null,
  /**
   * Genome context (Buildcraft: The Genome) - non-null only when the
   * session carries a run_seed (server capability). Switches steps 4-8
   * into the genome pipeline: gene-pool legality, infuse bounds, fused
   * splice derivation, exact genome recompute, bounded-trust clamps.
   */
  genomeCtx: GenomeValidationContext | null = null
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

  // GENOME BRANCH (Buildcraft: The Genome): sessions stamped with a
  // run_seed validate steps 4-8 under the genome pipeline.
  if (genomeCtx !== null) {
    return validateGenomeBranch(
      input,
      dynasty,
      traits,
      anomaly,
      genomeCtx,
      extracted,
      foodCount,
      maxFood,
      errors
    );
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
    traits,
    anomaly
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
    traits,
    anomaly
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
    masteryRawDna: rawDna,
    genome: null,
    errors,
  };
}

// =============================================================================
// GENOME VALIDATION (Buildcraft: The Genome - BUILDCRAFT_GENOME_DESIGN.md)
// =============================================================================

/**
 * VOLT Arc Lightning auto-collects up to 2 extra foods per eat, raising
 * the honest eat rate. The food-rate bound WIDENS (a still-hard cap) by
 * this factor only when the accepted picks make the expression reachable.
 */
export const VOLT_RATE_ALLOWANCE_FACTOR = 1.5;

/** Minimum food index of any gene pick (first gene food / first portal). */
const MIN_FIRST_GENE_FOOD = 15;

function occupiedGeneSlots(
  picks: GenePick[],
  splicesUnlocked: boolean
): number {
  return splicesUnlocked
    ? fusedSlotCount(fusePicks(picks))
    : picks.length;
}

/** Conservative portal count bound: first at 15, then every >= 8 foods. */
function maxPortalsSpawnable(foodCount: number): number {
  if (foodCount < MIN_FIRST_GENE_FOOD) return 0;
  return 1 + Math.floor((foodCount - MIN_FIRST_GENE_FOOD) / 8);
}

/**
 * Sanitize claimed gene picks (genome mode): pool, six occupied slots,
 * order, and bounds. Raw splice parents remain picks, so a legal history can
 * contain more than six picks while still occupying at most six slots.
 */
function sanitizeGenes(
  raw: unknown,
  foodCount: number,
  infuseCount: number,
  errors: string[],
  minFoodsPerPick: number,
  genePool: GeneId[] | null,
  splicesUnlocked: boolean
): GenePick[] {
  if (raw === undefined || raw === null) return [];
  if (!Array.isArray(raw)) {
    errors.push('INVALID_GENES: not an array');
    return [];
  }
  const picks: GenePick[] = [];
  const seen = new Set<string>();
  let lastAt = -1;
  for (const entry of raw) {
    const id = (entry as { id?: unknown } | null)?.id;
    const atFood = (entry as { atFood?: unknown } | null)?.atFood;
    if (isSpliceId(id)) {
      // Splices are DERIVED, never claimed - a direct claim is a red flag.
      errors.push(`SPLICE_CLAIMED_DIRECTLY: ${id}`);
      continue;
    }
    if (!isGeneId(id)) {
      errors.push(`INVALID_GENES: unknown gene id ${JSON.stringify(id)}`);
      continue;
    }
    if (genePool !== null && !genePool.includes(id)) {
      errors.push(`GENE_LOCKED: ${id} is not in the player's unlocked pool`);
      continue;
    }
    if (seen.has(id)) {
      errors.push(`INVALID_GENES: duplicate gene ${id}`);
      continue;
    }
    if (
      typeof atFood !== 'number' ||
      !Number.isInteger(atFood) ||
      atFood < MIN_FIRST_GENE_FOOD ||
      atFood > foodCount ||
      atFood < lastAt
    ) {
      errors.push(
        `GENE_BOUND: ${id} atFood ${JSON.stringify(atFood)} outside [max(${MIN_FIRST_GENE_FOOD}, ${lastAt}), ${foodCount}]`
      );
      continue;
    }
    const pick = { id, atFood };
    const candidate = [...picks, pick];
    const occupied = occupiedGeneSlots(candidate, splicesUnlocked);
    if (occupied > GENOME_SPAWN.maxHeld) {
      errors.push(
        `GENE_BOUND: ${id} would occupy ${occupied} slots, above the held cap ${GENOME_SPAWN.maxHeld}`
      );
      continue;
    }
    seen.add(id);
    lastAt = atFood;
    picks.push(pick);
  }
  // Offer-source bound: cadence offers (every >= minFoodsPerPick foods)
  // plus one offer per accepted infuse.
  const maxPicks = Math.floor(foodCount / minFoodsPerPick) + infuseCount;
  if (picks.length > maxPicks) {
    errors.push(
      `GENE_BOUND: ${picks.length} picks exceeds floor(${foodCount}/${minFoodsPerPick}) + ${infuseCount} infuses = ${maxPicks}`
    );
    picks.length = Math.max(0, maxPicks);
  }
  return picks;
}

/**
 * Validate + honor the claimed revive against what the accepted build can
 * actually fire (one revive per run): phoenix needs a LOOSE phoenix pick,
 * styx/molted need their fusion, second_sun needs the UMBRA apex. An
 * implausible claim is ignored + flagged (never honored).
 */
function sanitizeGenomeRevive(
  raw: unknown,
  foodCount: number,
  picks: GenePick[],
  heirloom: StrainPoints,
  surges: StrainSurge[],
  tierCap: 1 | 2 | 3,
  suppressedStrains: readonly StrainId[],
  splicesUnlocked: boolean,
  errors: string[]
): GenomeRevive | null {
  const revive = sanitizeRevive(raw, foodCount);
  if (!revive) {
    if (raw !== undefined && raw !== null) {
      errors.push('REVIVE_INVALID: malformed revive claim');
    }
    return null;
  }
  const view = splicesUnlocked
    ? fusePicks(picks)
    : { loose: [...picks], splices: [] };
  const spliceIds = new Set(view.splices.map((s) => s.spliceId));
  const phoenixLoose = view.loose.find((p) => p.id === 'phoenix');
  const activations = strainActivations(
    picks,
    heirloom,
    surges,
    tierCap,
    suppressedStrains
  );
  switch (revive.kind) {
    case 'phoenix':
      if (!phoenixLoose || revive.atFood < phoenixLoose.atFood) {
        errors.push('REVIVE_INVALID: phoenix revive without a loose phoenix');
        return null;
      }
      return revive;
    case 'styx':
      if (!spliceIds.has('splice_styx_contract')) {
        errors.push('REVIVE_INVALID: styx revive without the Styx Contract');
        return null;
      }
      return revive;
    case 'molted':
      if (!spliceIds.has('splice_molted_rebirth')) {
        errors.push('REVIVE_INVALID: molted revive without Molted Rebirth');
        return null;
      }
      return revive;
    case 'second_sun': {
      const apexAt = activations.UMBRA.apexAt;
      if (apexAt === null || revive.atFood < apexAt) {
        errors.push('REVIVE_INVALID: second_sun revive without the UMBRA apex');
        return null;
      }
      return revive;
    }
  }
}

function validateGenomeBranch(
  input: GameResultInput,
  dynasty: DynastyName,
  traits: TraitId[],
  anomaly: AnomalyId | null,
  ctx: GenomeValidationContext,
  extracted: boolean,
  foodCount: number,
  baseMaxFood: number,
  errors: string[]
): ValidationResult {
  const claim = (input.genome ?? {}) as Record<string, unknown>;
  const minFoodsPerPick = traits.includes('patient')
    ? MIN_FOODS_PER_PICK_PATIENT
    : MIN_FOODS_PER_PICK;

  // g4. Infuses first (they widen the pick-count bound): strictly
  // increasing, <= 3, bounded by spawnable portals; an extraction uses
  // one portal of its own.
  let infuses = sanitizeInfuses(claim.infuses, foodCount);
  const portalBudget = Math.max(
    0,
    maxPortalsSpawnable(foodCount) - (extracted ? 1 : 0)
  );
  if (infuses.length > portalBudget) {
    errors.push(
      `INFUSE_BOUND: ${infuses.length} infuses exceeds the ${portalBudget}-portal budget for ${foodCount} foods`
    );
    infuses = infuses.slice(0, portalBudget);
  }
  for (const infuse of infuses) {
    if (infuse.atFood < MIN_FIRST_GENE_FOOD) {
      errors.push(`INFUSE_BOUND: infuse at food ${infuse.atFood} before the first portal`);
      infuses = infuses.filter((i) => i.atFood >= MIN_FIRST_GENE_FOOD);
      break;
    }
  }

  // g5. Gene picks (pool + cap + cadence-with-infuse-allowance).
  let picks = sanitizeGenes(
    input.mutations,
    foodCount,
    infuses.length,
    errors,
    minFoodsPerPick,
    ctx.genePool,
    ctx.splicesUnlocked !== false
  );
  if (traits.includes('ascetic') && picks.length > 0) {
    errors.push(
      `TRAIT_CONFLICT: ${picks.length} gene pick(s) claimed on an Ascetic snake (gene food never spawns)`
    );
    picks = [];
  }

  // g6. Surges: only granted by infusing AT the gene cap - every surge
  // must ride an accepted infuse's food index.
  const infuseFoods = new Set(infuses.map((i) => i.atFood));
  const usedSurgeInfuses = new Set<number>();
  const splicesUnlocked = ctx.splicesUnlocked !== false;
  let surges = sanitizeSurges(claim.surges).filter((s) => {
    if (!infuseFoods.has(s.atFood)) {
      errors.push(`SURGE_INVALID: surge at food ${s.atFood} without an infuse`);
      return false;
    }
    if (usedSurgeInfuses.has(s.atFood)) {
      errors.push(`SURGE_INVALID: multiple surges claimed for infuse at food ${s.atFood}`);
      return false;
    }
    const heldAtInfuse = picks.filter((pick) => pick.atFood <= s.atFood);
    if (
      occupiedGeneSlots(heldAtInfuse, splicesUnlocked) !==
      GENOME_SPAWN.maxHeld
    ) {
      errors.push(
        `SURGE_INVALID: surge at food ${s.atFood} without ${GENOME_SPAWN.maxHeld} occupied gene slots`
      );
      return false;
    }
    const heldStrains = new Set(
      heldAtInfuse.flatMap((pick) => geneStrains(pick.id))
    );
    if (!heldStrains.has(s.strain)) {
      errors.push(
        `SURGE_INVALID: ${s.strain} is not represented by a held gene at food ${s.atFood}`
      );
      return false;
    }
    usedSurgeInfuses.add(s.atFood);
    return true;
  });
  if (surges.length > infuses.length) surges = surges.slice(0, infuses.length);

  // Each infuse yields exactly one build-power source: a gene offer OR a
  // surge. Cadence offers provide the remaining raw picks. Keep accepted
  // gene picks and drop surplus surge claims when the same infuse would
  // otherwise be spent twice.
  const cadenceOfferBudget = Math.floor(foodCount / minFoodsPerPick);
  const infuseGeneOffersNeeded = Math.max(
    0,
    picks.length - cadenceOfferBudget
  );
  const surgeSourceBudget = Math.max(
    0,
    infuses.length - infuseGeneOffersNeeded
  );
  if (surges.length > surgeSourceBudget) {
    errors.push(
      `SURGE_INVALID: ${surges.length} surges plus ${infuseGeneOffersNeeded} infuse-sourced gene picks exceed ${infuses.length} infuses`
    );
    surges = surges.slice(0, surgeSourceBudget);
  }

  // g7. Revive plausibility (one per run; kind must be fireable).
  const revive = sanitizeGenomeRevive(
    claim.revive,
    foodCount,
    picks,
    ctx.heirloom,
    surges,
    ctx.tierCap,
    ctx.suppressedStrains ?? [],
    ctx.splicesUnlocked !== false,
    errors
  );

  const lossEvents = sanitizeLossEvents(claim.lossEvents);

  const genomeInput: GenomeRunInput = {
    picks,
    heirloom: ctx.heirloom,
    surges,
    infuses,
    revive,
    prevRunDied: ctx.prevRunDied,
    lossEvents,
    tierCap: ctx.tierCap,
    suppressedStrains: ctx.suppressedStrains ?? [],
    splicesEnabled: ctx.splicesUnlocked !== false,
  };

  // g8. VOLT rate allowance: arcs raise the honest eat rate - widen the
  // (still hard) bound only when the accepted picks reach the expression.
  const totalsProbe = computeGenomeRunTotals(
    dynasty,
    foodCount,
    genomeInput,
    traits,
    anomaly
  );
  const voltReachable = totalsProbe.activations.VOLT.expressionAt !== null;
  const claimedFood = Number.isFinite(input.food_count)
    ? Math.max(0, Math.floor(input.food_count))
    : 0;
  if (voltReachable && claimedFood > foodCount) {
    const widenedMax = Math.ceil(baseMaxFood * VOLT_RATE_ALLOWANCE_FACTOR);
    const restored = Math.min(claimedFood, widenedMax);
    if (restored > foodCount) {
      foodCount = restored;
    }
  }

  // g9. Exact deterministic recompute (the payout authority) + claim caps.
  const totals =
    foodCount === totalsProbe.capsBasis.foodCount
      ? totalsProbe
      : computeGenomeRunTotals(dynasty, foodCount, genomeInput, traits, anomaly);
  const rawClaims = (claim.claims ?? {}) as GenomeClaims;
  const { accepted, bonusDna, globalClampHit } = clampGenomeClaims(
    rawClaims,
    totals.caps
  );
  if (globalClampHit) {
    errors.push(
      'GENOME_GLOBAL_CLAMP: claims bound by the aggregate claims cap while individual caps passed'
    );
  }
  let rawDna = totals.rawDna + bonusDna;
  let expectedScore = totals.score;

  // g10. COSMIC combo bounded trust on top (Crown raises the ratio at M10).
  let cosmic: CosmicClaim | null = null;
  if (dynasty === 'COSMIC') {
    if (input.cosmic !== undefined && input.cosmic !== null) {
      const crownHeld = ctx.crownAllowed && totals.caps.crownHeld;
      cosmic = sanitizeCosmicClaim(
        input.cosmic,
        foodCount,
        totals.rawDna,
        totals.score,
        errors,
        crownHeld
          ? GENE_ECONOMICS.crownTrustMaxBonusRatio
          : COSMIC_TRUST_MAX_BONUS_RATIO
      );
      rawDna += cosmic.comboDnaBonus;
      expectedScore += cosmic.comboScoreBonus;
    }
  } else if (input.cosmic !== undefined && input.cosmic !== null) {
    errors.push(`COSMIC_COMBO: combo summary on a ${dynasty} session - ignored`);
  }

  // g11. Genome outcome (clamped bank <= 1.75 / salvage <= 0.90) + victory.
  let expectedPayout = applyGenomeOutcome(
    rawDna,
    extracted,
    genomeInput,
    traits,
    anomaly
  );
  if (input.victory) {
    expectedPayout += GAME_CONFIG.economy.dna.completionBonus;
  }

  // g12. Claim mismatches flag only - the payout stays the recompute.
  // (The engine's display adds live claims, so compare against raw+claims.)
  if (Math.abs(input.dna_earned - rawDna) > CLAIM_EPSILON) {
    errors.push(
      `DNA_MISMATCH: claimed ${input.dna_earned}, recomputed ${rawDna} (genome, ${dynasty}, ${foodCount} foods)`
    );
  }
  if (Math.abs(input.score - expectedScore) > CLAIM_EPSILON) {
    errors.push(
      `SCORE_MISMATCH: claimed ${input.score}, recomputed ${expectedScore} (genome, ${dynasty}, ${foodCount} foods)`
    );
  }

  const expressions: Partial<Record<string, number>> = {};
  const apexes: Partial<Record<string, number>> = {};
  const strainCounts: StrainPoints = {};
  for (const strain of Object.keys(totals.activations) as (keyof typeof totals.activations)[]) {
    const a = totals.activations[strain];
    if (a.points > 0) strainCounts[strain] = a.points;
    if (a.expressionAt !== null) expressions[strain] = a.expressionAt;
    if (a.apexAt !== null) apexes[strain] = a.apexAt;
  }

  const acceptedGenome: AcceptedGenome = {
    v: 1,
    picks,
    splices: (ctx.splicesUnlocked === false
      ? []
      : fusePicks(picks).splices
    ).map((s) => ({
      id: s.spliceId,
      atFood: s.atFood,
    })),
    surges,
    infuses,
    revive,
    claims: accepted,
    strainCounts,
    expressions,
    apexes,
    globalClampHit,
  };

  return {
    valid: errors.length === 0,
    adjustedDna: expectedPayout,
    rawDna,
    adjustedScore: expectedScore,
    foodCount,
    extracted,
    // Wire-compat: legacy consumers (mutations blob, run-event cross
    // checks) see the legacy-id subset of the picks.
    mutations: picks.filter((p): p is MutationPick => isMutationId(p.id)),
    phoenixTriggeredAtFood:
      revive && revive.kind === 'phoenix' ? revive.atFood : null,
    cosmic,
    // Mastery XP base: deterministic only - claims never feed mastery.
    masteryRawDna: totals.rawDna,
    genome: acceptedGenome,
    errors,
  };
}

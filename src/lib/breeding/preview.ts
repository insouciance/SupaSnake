/**
 * Breeding Preview Helpers
 *
 * Pure client-side mirrors of the breed_snakes RPC math so the UI can show
 * cost and offspring generation before the server call. The server remains
 * authoritative: the RPC recomputes and validates everything atomically
 * (ownership, the configured dynasty gate, DNA cost, generation cap).
 *
 * RPC formulas (supabase/migrations/030_genome_lineage.sql):
 *   cost = 200 + floor((gen1 + gen2) / 2) * 100
 *   offspring generation = max(gen1, gen2) + 1, capped at 50
 *   offspring variant = 50/50 roll between the two parent variants
 */

/** Maximum offspring generation allowed by the breed_snakes RPC. */
export const MAX_GENERATION = 50;

/** Base DNA cost of any breeding. */
export const BREEDING_BASE_COST = 200;

/** DNA added per averaged parent generation (integer division). */
export const BREEDING_COST_PER_GEN = 100;

/**
 * DNA cost to breed two parents.
 * cost = 200 + floor((gen1 + gen2) / 2) * 100
 */
export function calculateBreedingCost(gen1: number, gen2: number): number {
  return BREEDING_BASE_COST + Math.floor((gen1 + gen2) / 2) * BREEDING_COST_PER_GEN;
}

/**
 * Offspring generation: one above the highest parent generation.
 * The RPC rejects breeding when this would exceed MAX_GENERATION (50).
 */
export function calculateOffspringGeneration(gen1: number, gen2: number): number {
  return Math.max(gen1, gen2) + 1;
}

/** True when the offspring would exceed the generation cap (50). */
export function isGenerationCapReached(gen1: number, gen2: number): boolean {
  return calculateOffspringGeneration(gen1, gen2) > MAX_GENERATION;
}

// =============================================================================
// PAIR VALIDATION (client-side preview of RPC rules)
// =============================================================================

export interface BreedingParentInfo {
  id: string;
  generation: number;
  dynastyId: string | null;
}

export type BreedingBlockReason =
  | 'missing_parent'
  | 'same_snake'
  | 'different_dynasty'
  | 'generation_cap'
  | 'insufficient_dna';

export interface BreedingValidation {
  valid: boolean;
  reason: BreedingBlockReason | null;
  /** Cost is known as soon as both parents are chosen, even if invalid. */
  cost: number | null;
  /** Offspring generation preview (null until both parents chosen). */
  offspringGeneration: number | null;
}

/**
 * Validate a prospective breeding pair against the RPC rules.
 * Returns the first blocking reason in priority order, plus cost/generation
 * previews once both parents are selected.
 */
export function validateBreedingPair(
  parent1: BreedingParentInfo | null,
  parent2: BreedingParentInfo | null,
  dnaBalance: number,
  allowCrossDynasty = false
): BreedingValidation {
  if (!parent1 || !parent2) {
    return { valid: false, reason: 'missing_parent', cost: null, offspringGeneration: null };
  }

  const cost = calculateBreedingCost(parent1.generation, parent2.generation);
  const offspringGeneration = calculateOffspringGeneration(
    parent1.generation,
    parent2.generation
  );

  if (parent1.id === parent2.id) {
    return { valid: false, reason: 'same_snake', cost, offspringGeneration };
  }

  if (
    !parent1.dynastyId ||
    !parent2.dynastyId ||
    (!allowCrossDynasty && parent1.dynastyId !== parent2.dynastyId)
  ) {
    return { valid: false, reason: 'different_dynasty', cost, offspringGeneration };
  }

  if (isGenerationCapReached(parent1.generation, parent2.generation)) {
    return { valid: false, reason: 'generation_cap', cost, offspringGeneration };
  }

  if (dnaBalance < cost) {
    return { valid: false, reason: 'insufficient_dna', cost, offspringGeneration };
  }

  return { valid: true, reason: null, cost, offspringGeneration };
}

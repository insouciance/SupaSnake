/**
 * Breeding Preview Helpers
 *
 * Pure client-side mirrors of the breed_snakes RPC math so the UI can show
 * cost and offspring generation before the server call. The server remains
 * authoritative: the RPC recomputes and validates everything atomically
 * (ownership, the configured dynasty gate, DNA cost).
 *
 * RPC formulas (supabase/migrations/047_deterministic_lineage_draft.sql):
 *   cost = (200 + floor((gen1 + gen2) / 2) * 100) * 1.25^max(0, childGen - 3)
 *   offspring generation = max(gen1, gen2) + 1 — UNCAPPED (§8.2 Ascendance)
 *   offspring variant = the parent line the player DRAFTS (no roll)
 */

import {
  BREEDING_BASE_COST,
  BREEDING_COST_PER_GEN,
  breedingCost,
  offspringGeneration as ascendanceOffspringGeneration,
} from '@/shared/game/ascendance';

export { BREEDING_BASE_COST, BREEDING_COST_PER_GEN };

/**
 * DNA cost to breed two parents. Delegates to the single definition of the
 * curve in `@/shared/game/ascendance` so the steepening past Gen3 cannot
 * drift between the preview and the settlement.
 */
export function calculateBreedingCost(gen1: number, gen2: number): number {
  return breedingCost(gen1, gen2);
}

/**
 * Offspring generation: one above the highest parent generation.
 * There is no cap — Gen4+ is Ascendance (Constitution §8.2, v1.2 ruling
 * reversing the Gen3 cap). The old MAX_GENERATION=50 refusal is deleted.
 */
export function calculateOffspringGeneration(gen1: number, gen2: number): number {
  return ascendanceOffspringGeneration(gen1, gen2);
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

  if (dnaBalance < cost) {
    return { valid: false, reason: 'insufficient_dna', cost, offspringGeneration };
  }

  return { valid: true, reason: null, cost, offspringGeneration };
}

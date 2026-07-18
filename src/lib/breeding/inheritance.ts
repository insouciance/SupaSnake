/**
 * Trait Inheritance Helpers (Design v2 Phase 3A, section 6.3)
 *
 * Pure client-side mirrors of the breed_snakes / reroll_trait RPC trait
 * rules (supabase/migrations/018_traits.sql) so the UI can preview
 * inheritance odds and validate reroll availability before the server
 * call. The server remains authoritative: the RPCs roll with their own
 * randomness and record every roll in breeding_history.trait_rolls.
 *
 * RPC rules mirrored here:
 * - slots = get_trait_slots(rarity, generation): common/uncommon 1,
 *   rare+ 2, Gen 3+ always 2 (hard cap 2)
 * - offspring rolls ONE random trait from EACH parent's pool: slot 1 from
 *   parent A, slot 2 (if unlocked) from parent B; duplicates collapse,
 *   the slot cap truncates, an empty-pool parent contributes nothing
 * - reroll redraws one slot from the COMBINED parent pool minus every
 *   trait the snake already has; impossible redraws never consume a token
 */

import {
  getTraitSlots,
  sanitizeTraits,
  type TraitId,
} from '@/shared/game/traits';

export { getTraitSlots };

/**
 * Roll the offspring's inherited traits - the exact rule the breed_snakes
 * RPC applies, with injectable rng for deterministic tests. Pool order is
 * slot order: parent A's roll takes slot 1, parent B's takes slot 2.
 */
export function rollInheritedTraits(
  parent1Pool: TraitId[],
  parent2Pool: TraitId[],
  slots: number,
  rng: () => number = Math.random
): TraitId[] {
  const pick = (pool: TraitId[]): TraitId | null =>
    pool.length === 0 ? null : pool[Math.floor(rng() * pool.length)];

  const traits: TraitId[] = [];
  const roll1 = pick(parent1Pool);
  if (roll1 !== null) traits.push(roll1);
  const roll2 = pick(parent2Pool);
  if (roll2 !== null && !traits.includes(roll2)) traits.push(roll2);
  return traits.slice(0, Math.max(0, slots));
}

/** One parent's contribution to the offspring preview. */
export interface ParentInheritanceOdds {
  /** The parent's trait pool (sanitized). */
  pool: TraitId[];
  /** Chance each pool entry is the one inherited from this parent (1/n). */
  oddsPerTrait: number | null;
}

/** Inheritance preview for the breeding screen. */
export interface InheritancePreview {
  /** Offspring trait slots (needs the offspring's possible rarities). */
  slots: number;
  parent1: ParentInheritanceOdds;
  parent2: ParentInheritanceOdds;
}

/**
 * Preview the inheritance odds for a prospective pairing. The offspring's
 * variant is a 50/50 roll between the parents, so its rarity - and with
 * it the slot count - can differ per outcome; callers pass the rarity of
 * each possible variant and this uses the MINIMUM guaranteed slot count
 * for the "slot 2 if unlocked" hint (generation is deterministic).
 */
export function previewInheritance(
  parent1Traits: unknown,
  parent2Traits: unknown,
  possibleRarities: string[],
  offspringGeneration: number
): InheritancePreview {
  const pool1 = sanitizeTraits(parent1Traits);
  const pool2 = sanitizeTraits(parent2Traits);
  const slots = possibleRarities.length
    ? Math.min(
        ...possibleRarities.map((r) => getTraitSlots(r, offspringGeneration))
      )
    : getTraitSlots('common', offspringGeneration);

  return {
    slots,
    parent1: {
      pool: pool1,
      oddsPerTrait: pool1.length > 0 ? 1 / pool1.length : null,
    },
    parent2: {
      pool: pool2,
      oddsPerTrait: pool2.length > 0 ? 1 / pool2.length : null,
    },
  };
}

/**
 * Reroll candidates for one slot - the exact exclusion rule reroll_trait
 * applies: the combined parent pool minus every trait the snake already
 * holds, deduped. Empty result = the RPC would refuse (and not consume a
 * token), so the UI can disable the button.
 */
export function rerollCandidates(
  combinedParentPool: TraitId[],
  currentTraits: TraitId[]
): TraitId[] {
  const candidates: TraitId[] = [];
  for (const trait of combinedParentPool) {
    if (!currentTraits.includes(trait) && !candidates.includes(trait)) {
      candidates.push(trait);
    }
  }
  return candidates;
}

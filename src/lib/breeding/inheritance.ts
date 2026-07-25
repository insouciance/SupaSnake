/**
 * The trait draft (Constitution §8.2).
 *
 * Pure client-side mirror of the `breeding_draft` / `breed_snakes` trait rules
 * (supabase/migrations/047_deterministic_lineage_draft.sql) so the UI can show
 * the draft board before the server call. Nothing here rolls: the offspring's
 * traits are exactly the ones the player drafts, and the server recomputes the
 * same pool and refuses anything outside it.
 *
 * Rules mirrored here:
 * - slots = get_trait_slots(rarity, generation): common/uncommon 1, rare+ 2,
 *   Gen3+ always 2 (hard cap 2). The variant line the player picks decides
 *   the rarity, so slots are quoted per variant option.
 * - the draft pool is the UNION of both parents' active traits, in canonical
 *   order: parent 1's traits in stored order, then parent 2's that parent 1
 *   does not already contribute.
 * - the player drafts up to `slots` distinct traits from that pool. Taking
 *   one is not taking another - the forced choice is the sacrifice.
 * - naming no draft takes the first `slots` of the pool, deterministically.
 */

import {
  getTraitSlots,
  sanitizeTraits,
  type TraitId,
} from '@/shared/game/traits';

export { getTraitSlots };

/** Which parent offers a trait. `both` = the two parents share it. */
export type TraitDraftSource = 'parent1' | 'parent2' | 'both';

export interface TraitDraftEntry {
  traitId: TraitId;
  source: TraitDraftSource;
}

/**
 * The draftable pool for a pairing, in canonical order. Deterministic: the
 * same two parents always produce the same board in the same order.
 */
export function traitDraftPool(
  parent1Traits: unknown,
  parent2Traits: unknown
): TraitDraftEntry[] {
  const pool1 = sanitizeTraits(parent1Traits);
  const pool2 = sanitizeTraits(parent2Traits);
  const entries: TraitDraftEntry[] = [];

  for (const traitId of pool1) {
    if (entries.some((entry) => entry.traitId === traitId)) continue;
    entries.push({
      traitId,
      source: pool2.includes(traitId) ? 'both' : 'parent1',
    });
  }
  for (const traitId of pool2) {
    if (entries.some((entry) => entry.traitId === traitId)) continue;
    entries.push({ traitId, source: 'parent2' });
  }
  return entries;
}

/** The draft applied when the request names none: the first `slots` entries. */
export function defaultTraitDraft(
  pool: TraitDraftEntry[],
  slots: number
): TraitId[] {
  return pool.slice(0, Math.max(0, slots)).map((entry) => entry.traitId);
}

/**
 * Is this draft legal? Distinct traits, all from the pool, at most `slots`.
 * The exact rule `breed_snakes` enforces before it charges anything.
 */
export function isValidTraitDraft(
  draft: TraitId[],
  pool: TraitDraftEntry[],
  slots: number
): boolean {
  if (draft.length > Math.max(0, slots)) return false;
  if (new Set(draft).size !== draft.length) return false;
  return draft.every((traitId) =>
    pool.some((entry) => entry.traitId === traitId)
  );
}

/** One selectable variant line and everything that follows from it. */
export interface VariantDraftOption {
  variantId: string;
  rarity: string;
  /** Trait slots the child gets on this line. */
  slots: number;
}

/**
 * The two variant lines a pairing offers, in canonical order (parent 1's
 * line first). Identical parent variants collapse to one option - there is
 * no choice to make and no roll to hide.
 */
export function variantDraftOptions(
  parent1: { variantId: string; rarity: string },
  parent2: { variantId: string; rarity: string },
  offspringGeneration: number
): VariantDraftOption[] {
  const options: VariantDraftOption[] = [
    {
      variantId: parent1.variantId,
      rarity: parent1.rarity,
      slots: getTraitSlots(parent1.rarity, offspringGeneration),
    },
  ];
  if (parent2.variantId !== parent1.variantId) {
    options.push({
      variantId: parent2.variantId,
      rarity: parent2.rarity,
      slots: getTraitSlots(parent2.rarity, offspringGeneration),
    });
  }
  return options;
}

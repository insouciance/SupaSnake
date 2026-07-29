/**
 * Traits - Design v2 Phase 3A (GAME_DESIGN_V2.md section 6)
 *
 * The Launch Eight trait definitions plus every piece of trait math shared
 * between the client engine, the API layer, and the server validator.
 *
 * Traits are permanent, snake-bound SIDEGRADES: they tilt HOW a snake
 * earns, never how much on net. They reuse the mutation taxonomy that
 * keeps exact server validation possible:
 * - [E]conomic effects are pure functions of the food index and are
 *   recomputed exactly by the server via computeRunTotals.
 * - [P]hysical effects change survival/spawn rules inside the engine only
 *   and never touch the payout formula.
 *
 * Trust model (section 6.2): equipped traits are validated against the
 * equipped snake's SERVER-SIDE record (collected_snakes.traits, read via
 * the session row's snake_used_id). The client payload never carries
 * traits - the server reads them from the snake row, so a tampered client
 * cannot equip trait economics it does not own.
 */

/** The Launch Eight trait ids, in the section 6.2 table order. */
export type TraitId =
  | 'scavenger'
  | 'gambler'
  | 'ascetic'
  | 'iron_scales'
  | 'magnetism'
  | 'sprinter'
  | 'patient'
  | 'hoarder';

/** Effect kind: E = economic (server-recomputed), P = physical, EP = both. */
export type TraitKind = 'E' | 'P' | 'EP';

export interface TraitDef {
  id: TraitId;
  name: string;
  kind: TraitKind;
  /** One-line effect - readable at a glance on a trait chip tooltip. */
  effect: string;
  /** One-line tradeoff - every trait is a sidegrade with a cost. */
  cost: string;
}

export const TRAITS: Record<TraitId, TraitDef> = {
  scavenger: {
    id: 'scavenger',
    name: 'Scavenger',
    kind: 'E',
    effect: 'First 15 foods +30% DNA',
    cost: 'Foods after 50: −10%',
  },
  gambler: {
    id: 'gambler',
    name: 'Gambler',
    kind: 'E',
    effect: 'Banked ×1.25 → ×1.35',
    cost: 'Salvage ×0.60 → ×0.45',
  },
  ascetic: {
    id: 'ascetic',
    name: 'Ascetic',
    kind: 'EP',
    effect: 'All food ×1.4 base value',
    cost: 'Mutation foods never spawn — no builds, pure snake',
  },
  iron_scales: {
    id: 'iron_scales',
    name: 'Iron Scales',
    kind: 'EP',
    effect: 'Survive one board collision per run (edge or locked cell)',
    cost: 'Food −10% DNA',
  },
  magnetism: {
    id: 'magnetism',
    name: 'Magnetism',
    kind: 'P',
    effect: 'Food within 1 cell pulled toward head',
    cost: 'Exit portal interval +2 foods',
  },
  sprinter: {
    id: 'sprinter',
    name: 'Sprinter',
    kind: 'E',
    effect: 'First 10 foods ×1.2',
    cost: 'Foods after 50: ×0.9',
  },
  patient: {
    id: 'patient',
    name: 'Patient',
    kind: 'EP',
    effect: 'Banked bonus +10% (stacks with Gambler to ×1.45)',
    cost: 'Mutation food spawn rate −50%',
  },
  hoarder: {
    id: 'hoarder',
    name: 'Hoarder',
    kind: 'E',
    effect: 'Death salvage 70% (vs 60%)',
    cost: 'Bank bonus +15% (vs +25%)',
  },
};

/** The launch trait pool, in table order. */
export const TRAIT_POOL: TraitId[] = [
  'scavenger',
  'gambler',
  'ascetic',
  'iron_scales',
  'magnetism',
  'sprinter',
  'patient',
  'hoarder',
];

export function isTraitId(value: unknown): value is TraitId {
  return typeof value === 'string' && value in TRAITS;
}

// =============================================================================
// SLOTS (section 6.1)
// =============================================================================

/** Hard slot cap - rarity is slot potential + cosmetics, never stats. */
export const MAX_TRAIT_SLOTS = 2;

/** At this prestige generation a lineage gains its 2nd slot regardless of rarity. */
export const GEN3_SLOT_UNLOCK = 3;

const TWO_SLOT_RARITIES = new Set(['rare', 'epic', 'legendary']);

/**
 * Trait slots for a snake: common/uncommon variants have 1, rare and above
 * have 2, and any lineage at prestige Gen 3+ has 2 regardless of rarity.
 * Hard-capped at MAX_TRAIT_SLOTS. Mirrors the get_trait_slots SQL function
 * (migration 018) - the two must stay in lockstep.
 */
export function getTraitSlots(rarity: string, generation: number): number {
  const base = TWO_SLOT_RARITIES.has(String(rarity).toLowerCase()) ? 2 : 1;
  const withPrestige = generation >= GEN3_SLOT_UNLOCK ? 2 : base;
  return Math.min(MAX_TRAIT_SLOTS, withPrestige);
}

/**
 * Sanitize an untrusted trait list (DB row TEXT[], API payloads): unknown
 * ids are dropped, duplicates are dropped, and the result is capped at
 * MAX_TRAIT_SLOTS. Order is preserved (slot order is the draft order).
 */
export function sanitizeTraits(raw: unknown): TraitId[] {
  if (!Array.isArray(raw)) return [];
  const traits: TraitId[] = [];
  for (const entry of raw) {
    if (isTraitId(entry) && !traits.includes(entry)) {
      traits.push(entry);
    }
    if (traits.length >= MAX_TRAIT_SLOTS) break;
  }
  return traits;
}

// =============================================================================
// ECONOMIC TUNING (section 6.2) - deterministic, food-index-pure
// =============================================================================

/** Economic tuning constants, exported for tests + UI copy. */
export const TRAIT_ECONOMICS = {
  /** Scavenger: first 15 foods x1.3; foods after 50 x0.9. */
  scavengerEarlyFoods: 15,
  scavengerEarlyBonus: 1.3,
  scavengerLateAfterFood: 50,
  scavengerLatePenalty: 0.9,
  /** Sprinter: first 10 foods x1.2; foods after 50 x0.9. */
  sprinterEarlyFoods: 10,
  sprinterEarlyBonus: 1.2,
  sprinterLateAfterFood: 50,
  sprinterLatePenalty: 0.9,
  /** Ascetic: all food x1.4 (the P cost lives in the engine: no mutation food). */
  asceticFoodBonus: 1.4,
  /** Iron Scales: food x0.9 for the whole run (the P benefit lives in the engine). */
  ironScalesFoodPenalty: 0.9,
  /** Gambler: bank 1.25 -> 1.35, salvage 0.60 -> 0.45 (additive deltas). */
  gamblerBankDelta: 0.1,
  gamblerDeathDelta: -0.15,
  /** Patient: bank +0.10 (stacks with Gambler to x1.45 per section 6.2). */
  patientBankDelta: 0.1,
  /** Hoarder: salvage 0.60 -> 0.70, bank 1.25 -> 1.15 (low variance both ways). */
  hoarderBankDelta: -0.1,
  hoarderDeathDelta: 0.1,
} as const;

/** Physical tuning constants (engine-side), exported for tests. */
export const TRAIT_PHYSICS = {
  /** Magnetism: pull radius (Chebyshev) - Magnet Pulse's little sibling. */
  magnetismRadius: 1,
  /** Magnetism cost: exit portal interval +2 foods. */
  magnetismPortalIntervalPenalty: 2,
  /** Patient cost: mutation spawn rate -50% = interval x2. */
  patientMutationIntervalMultiplier: 2,
} as const;

/**
 * The per-food [E] value modifier for the n-th food (1-based) given the
 * snake's traits - the trait counterpart of foodValueModifier. Pure in
 * (traits, n), so the server recompute is exact. Trait effects are
 * present from food 1 (traits are snake-bound, not picked up mid-run) and
 * multiply with each other and with mutation modifiers.
 */
export function traitFoodValueModifier(traits: TraitId[], n: number): number {
  let mod = 1;
  for (const trait of traits) {
    switch (trait) {
      case 'scavenger':
        if (n <= TRAIT_ECONOMICS.scavengerEarlyFoods) {
          mod *= TRAIT_ECONOMICS.scavengerEarlyBonus;
        } else if (n > TRAIT_ECONOMICS.scavengerLateAfterFood) {
          mod *= TRAIT_ECONOMICS.scavengerLatePenalty;
        }
        break;
      case 'sprinter':
        if (n <= TRAIT_ECONOMICS.sprinterEarlyFoods) {
          mod *= TRAIT_ECONOMICS.sprinterEarlyBonus;
        } else if (n > TRAIT_ECONOMICS.sprinterLateAfterFood) {
          mod *= TRAIT_ECONOMICS.sprinterLatePenalty;
        }
        break;
      case 'ascetic':
        mod *= TRAIT_ECONOMICS.asceticFoodBonus;
        break;
      case 'iron_scales':
        mod *= TRAIT_ECONOMICS.ironScalesFoodPenalty;
        break;
      // gambler, patient, hoarder: outcome-multiplier effects only
      // magnetism: physical only
    }
  }
  return mod;
}

// =============================================================================
// HEIRLOOM GENES (Buildcraft: The Genome, BUILDCRAFT_GENOME_DESIGN.md §8)
// =============================================================================

/**
 * Strain tags for the Launch Eight - under the Genome, equipped traits
 * are "Heirloom genes": each grants 1 starting strain point in its tag
 * (capped with lineage at 2 per strain; the cap and the starting-point
 * derivation live in lineage.ts). Effects and validation are UNCHANGED -
 * the tag is additive metadata.
 *
 * Strain ids are string literals (not the StrainId import) to keep this
 * module import-free toward strains.ts consumers; lineage.ts narrows them.
 */
export const TRAIT_STRAINS: Record<
  TraitId,
  'AURUM' | 'VOLT' | 'FERAL' | 'FLUX' | 'UMBRA'
> = {
  scavenger: 'AURUM',
  ascetic: 'AURUM',
  sprinter: 'VOLT',
  magnetism: 'FLUX',
  gambler: 'UMBRA',
  iron_scales: 'UMBRA',
  patient: 'UMBRA',
  hoarder: 'UMBRA',
} as const;

/**
 * Additive outcome-multiplier deltas from traits, applied on top of the
 * (mutation-aware) bank/salvage multipliers. Additive stacking is what
 * makes the section 6.2 numbers come out: Gambler+Patient bank
 * 1.25 + 0.10 + 0.10 = 1.45; Gambler alone 1.35/0.45; Hoarder alone
 * 1.15/0.70. Deltas are unconditional (traits cannot be voided by
 * Phoenix - they are snake identity, not run pickups).
 */
export function traitOutcomeDeltas(traits: TraitId[]): {
  bank: number;
  death: number;
} {
  let bank = 0;
  let death = 0;
  for (const trait of traits) {
    switch (trait) {
      case 'gambler':
        bank += TRAIT_ECONOMICS.gamblerBankDelta;
        death += TRAIT_ECONOMICS.gamblerDeathDelta;
        break;
      case 'patient':
        bank += TRAIT_ECONOMICS.patientBankDelta;
        break;
      case 'hoarder':
        bank += TRAIT_ECONOMICS.hoarderBankDelta;
        death += TRAIT_ECONOMICS.hoarderDeathDelta;
        break;
      default:
        break;
    }
  }
  return { bank, death };
}

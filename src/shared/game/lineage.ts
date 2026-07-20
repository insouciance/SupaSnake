/**
 * Lineage - Buildcraft: The Genome (BUILDCRAFT_GENOME_DESIGN.md §7)
 *
 * Variants carry a strain affinity; collected snakes inherit and mix it
 * through breeding. The equipped snake's lineage plus its Heirloom genes
 * (traits) grant STARTING STRAIN POINTS - the bridge that finally makes
 * the collection meta shape run gameplay.
 *
 * Trust model: lineage is read from the SERVER-SIDE snake/variant rows
 * (like traits); the client payload never carries it. The TS mirror here
 * must stay in lockstep with the breed_snakes SQL (migration 030).
 */

import {
  STRAIN_THRESHOLDS,
  capSpawnPoints,
  isStrainId,
  type StrainId,
  type StrainPoints,
} from '@/shared/game/strains';
import type { TraitId } from '@/shared/game/traits';
import { TRAIT_STRAINS } from '@/shared/game/traits';
import type { LineageBias } from '@/shared/game/offerGravity';

/** Dynasty signature strains - the default lineage of unbred variants. */
export const DYNASTY_STRAINS: Record<'PRIMAL' | 'CYBER' | 'COSMIC', StrainId> = {
  PRIMAL: 'FERAL',
  CYBER: 'VOLT',
  COSMIC: 'FLUX',
};

/** Lineage strength: 0 = offer bias only, 1 = +1 point, 2 = +1 point + guarantee. */
export type LineageStrength = 0 | 1 | 2;

export interface Lineage {
  /** 1 strain normally; 2 for cross-dynasty dual-lineage snakes. */
  strains: StrainId[];
  strength: LineageStrength;
  /** Dual lineage only: which strain receives the strength point(s). */
  primary?: StrainId;
}

/** Rarity caps on lineage strength (§7). */
export const LINEAGE_RARITY_CAP: Record<string, LineageStrength> = {
  common: 0,
  uncommon: 0,
  rare: 1,
  epic: 2,
  legendary: 2,
};

export function lineageStrengthCap(rarity: string): LineageStrength {
  return LINEAGE_RARITY_CAP[String(rarity).toLowerCase()] ?? 0;
}

/** Gen3+ prestige adds +1 strength, still capped at 2 (§7). */
export const LINEAGE_GEN_BONUS_AT = 3;

export function clampLineageStrength(
  value: number,
  rarity: string,
  generation: number
): LineageStrength {
  // strength = min(2, min(raw, rarityCap) + Gen3 prestige)
  const prestige = generation >= LINEAGE_GEN_BONUS_AT ? 1 : 0;
  const base = Math.min(Math.max(0, Math.floor(value)), lineageStrengthCap(rarity));
  return Math.min(2, base + prestige) as LineageStrength;
}

/** Parse an untrusted lineage shape (DB JSONB, API payloads). */
export function sanitizeLineage(raw: unknown): Lineage | null {
  if (typeof raw !== 'object' || raw === null) return null;
  const { strains, strength, primary } = raw as {
    strains?: unknown;
    strength?: unknown;
    primary?: unknown;
  };
  if (!Array.isArray(strains)) return null;
  const clean = strains.filter(isStrainId).slice(0, 2);
  if (clean.length === 0) return null;
  const s =
    typeof strength === 'number' && Number.isInteger(strength)
      ? (Math.max(0, Math.min(2, strength)) as LineageStrength)
      : 0;
  const lineage: Lineage = { strains: clean, strength: s };
  if (isStrainId(primary) && clean.includes(primary)) {
    lineage.primary = primary;
  }
  return lineage;
}

/**
 * Starting strain points for a run: the lineage point (strength >= 1;
 * dual lineages point their chosen primary strain) plus one point per
 * equipped Heirloom gene's strain - capped at 2 per strain (§8 gate 2).
 */
export function startingStrainPoints(
  lineage: Lineage | null,
  traits: TraitId[]
): StrainPoints {
  const points: StrainPoints = {};
  if (lineage && lineage.strength >= 1) {
    const target =
      lineage.strains.length > 1
        ? lineage.primary ?? lineage.strains[0]
        : lineage.strains[0];
    points[target] = (points[target] ?? 0) + 1;
  }
  for (const trait of traits) {
    const strain = TRAIT_STRAINS[trait];
    if (strain) {
      points[strain] = (points[strain] ?? 0) + 1;
    }
  }
  return capSpawnPoints(points);
}

/** The offer bias every lineage grants (strength 0 included). */
export function lineageOfferBias(lineage: Lineage | null): LineageBias | null {
  if (!lineage || lineage.strains.length === 0) return null;
  return {
    strains: lineage.strains,
    guaranteeFirstOffer: lineage.strength >= 2,
  };
}

// =============================================================================
// BREEDING INHERITANCE (TS mirror of migration 030 - keep in lockstep)
// =============================================================================

export interface LineageParent {
  lineage: Lineage | null;
  dynasty: string;
}

export interface LineageOutcome {
  lineage: Lineage;
  /** Probability of this outcome (for the breeding preview UI). */
  chance: number;
}

/**
 * Enumerate the possible offspring lineages for the breeding preview -
 * the TS mirror of the breed_snakes lineage roll (§7):
 * - Same dynasty, same strain (Purebred): strength max(parents) + 1.
 * - Same dynasty, different strains: one parent's strain (50/50),
 *   strength max(parents).
 * - Cross-dynasty: dual lineage (both strains) at bias strength.
 * Rarity caps + Gen3 prestige apply at roll time (clampLineageStrength) -
 * the preview shows uncapped intent, the reveal shows the capped roll.
 */
export function combineLineages(
  parent1: LineageParent,
  parent2: LineageParent
): LineageOutcome[] {
  const s1 = parent1.lineage?.strains[0] ?? null;
  const s2 = parent2.lineage?.strains[0] ?? null;
  const str1 = parent1.lineage?.strength ?? 0;
  const str2 = parent2.lineage?.strength ?? 0;
  const maxStrength = Math.max(str1, str2);
  const crossDynasty = parent1.dynasty !== parent2.dynasty;

  if (s1 === null && s2 === null) return [];
  if (crossDynasty && s1 !== null && s2 !== null && s1 !== s2) {
    return [
      {
        lineage: { strains: [s1, s2], strength: Math.min(2, maxStrength) as LineageStrength },
        chance: 1,
      },
    ];
  }
  if (s1 !== null && s2 !== null && s1 === s2) {
    return [
      {
        lineage: {
          strains: [s1],
          strength: Math.min(2, maxStrength + 1) as LineageStrength,
        },
        chance: 1,
      },
    ];
  }
  const outcomes: LineageOutcome[] = [];
  if (s1 !== null) {
    outcomes.push({
      lineage: { strains: [s1], strength: Math.min(2, maxStrength) as LineageStrength },
      chance: s2 === null ? 1 : 0.5,
    });
  }
  if (s2 !== null && s2 !== s1) {
    outcomes.push({
      lineage: { strains: [s2], strength: Math.min(2, maxStrength) as LineageStrength },
      chance: s1 === null ? 1 : 0.5,
    });
  }
  return outcomes;
}

/** DNA cost of rerolling a snake's lineage strain (§7 - new sink). */
export const LINEAGE_REROLL_COST = 150;

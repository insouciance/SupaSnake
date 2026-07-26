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

export type LineageStrains = [StrainId] | [StrainId, StrainId];

export interface Lineage {
  /** 1 strain normally; 2 for cross-dynasty dual-lineage snakes. */
  strains: LineageStrains;
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
  const clean = Array.from(new Set(strains.filter(isStrainId))).slice(0, 2);
  if (clean.length === 0) return null;
  const s =
    typeof strength === 'number' && Number.isInteger(strength)
      ? (Math.max(0, Math.min(2, strength)) as LineageStrength)
      : 0;
  const lineage: Lineage = {
    strains: clean as LineageStrains,
    strength: s,
  };
  if (clean.length === 2 && isStrainId(primary) && clean.includes(primary)) {
    lineage.primary = primary;
  }
  return lineage;
}

/** Build a sanitized lineage from a variant's innate affinity columns. */
export function lineageFromAffinity(
  strain: unknown,
  strength: unknown
): Lineage | null {
  if (!isStrainId(strain)) return null;
  return sanitizeLineage({
    strains: [strain],
    strength:
      typeof strength === 'number' && Number.isInteger(strength) ? strength : 0,
  });
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
        ? lineage.primary
        : lineage.strains[0];
    // A rare+ dual-lineage snake grants no lineage point until its owner
    // explicitly chooses the primary strain before a run (§7).
    if (target) {
      points[target] = (points[target] ?? 0) + 1;
    }
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
  if (!lineage) return null;
  return {
    strains: lineage.strains,
    guaranteeFirstOffer: lineage.strength >= 2,
    guaranteeStrains:
      lineage.strains.length === 2 && lineage.primary
        ? [lineage.primary]
        : lineage.strains.length === 1
          ? lineage.strains
          : [],
  };
}

// =============================================================================
// THE LINEAGE DRAFT (TS mirror of migration 047 - keep in lockstep)
// =============================================================================
//
// Constitution §8.2: breeding is a DETERMINISTIC DRAFT. The player chooses
// the child's lineage strain from the parents' strains; nothing is rolled.
// Every option below is enumerated before payment and the chosen one is what
// the child is born with - the preview IS the outcome.

export interface LineageParent {
  lineage: Lineage | null;
  dynasty: string;
}

/**
 * Which parent's line an option descends from. `purebred` is the two parents
 * agreeing; `dual` is the cross-dynasty double line (both strains kept).
 */
export type LineageDraftKind = 'purebred' | 'dual' | 'parent1' | 'parent2';

export interface LineageDraftOption {
  /** Stable key the client sends back with the breed request. */
  kind: LineageDraftKind;
  strains: LineageStrains;
  /** Final strength, already clamped by the child's rarity and generation. */
  strength: LineageStrength;
}

/** The strain a parent passes into the draft. */
export function inheritableLineageStrain(lineage: Lineage | null): StrainId | null {
  if (!lineage) return null;
  return lineage.strains.length === 2
    ? lineage.primary ?? lineage.strains[0]
    : lineage.strains[0];
}

/**
 * Enumerate the child's selectable lineages, in canonical order - the TS
 * mirror of `lineage_draft_options` in migration 047.
 *
 * - Both parents on the same strain: one option, the purebred line, at
 *   strength max(parents) + 1. There is nothing to choose and nothing to
 *   roll (the shipped Purebred rule, unchanged).
 * - Different strains, same dynasty: one option per parent line, at
 *   strength max(parents). Taking one is not taking the other - that
 *   forced choice IS the sacrifice §8.2 asks for.
 * - Different strains, cross-dynasty: the dual line first (both strains,
 *   the shipped behaviour and the default), then each parent's pure line.
 * - One parent lineless: that parent contributes nothing; the other's line
 *   is the only option.
 *
 * Strength is clamped here by the CHILD's rarity and generation, so the
 * strength shown in the preview is the strength written to the row.
 */
export function lineageDraftOptions(
  parent1: LineageParent,
  parent2: LineageParent,
  offspringRarity: string,
  offspringGeneration: number
): LineageDraftOption[] {
  const s1 = inheritableLineageStrain(parent1.lineage);
  const s2 = inheritableLineageStrain(parent2.lineage);
  const maxStrength = Math.max(
    parent1.lineage?.strength ?? 0,
    parent2.lineage?.strength ?? 0
  );
  const crossDynasty = parent1.dynasty !== parent2.dynasty;
  const clamp = (raw: number): LineageStrength =>
    clampLineageStrength(raw, offspringRarity, offspringGeneration);

  if (s1 === null && s2 === null) return [];

  if (s1 !== null && s1 === s2) {
    return [{ kind: 'purebred', strains: [s1], strength: clamp(maxStrength + 1) }];
  }

  const options: LineageDraftOption[] = [];
  if (crossDynasty && s1 !== null && s2 !== null) {
    options.push({ kind: 'dual', strains: [s1, s2], strength: clamp(maxStrength) });
  }
  if (s1 !== null) {
    options.push({ kind: 'parent1', strains: [s1], strength: clamp(maxStrength) });
  }
  if (s2 !== null) {
    options.push({ kind: 'parent2', strains: [s2], strength: clamp(maxStrength) });
  }
  return options;
}

/** The option applied when the request names none. Always the first. */
export function defaultLineageDraft(
  options: LineageDraftOption[]
): LineageDraftOption | null {
  return options[0] ?? null;
}

/**
 * DNA a retired trait-reroll token converts to (§8.2: "their old price").
 * Migration 047 performs the conversion once; nothing mints tokens after it.
 */
export const REROLL_TOKEN_DNA_VALUE = 150;

/**
 * Breeding API utilities
 * Row mapping for GET /api/breeding (recent breeding history) and the
 * shared draft-choice reader used by both breeding endpoints.
*/

import { sanitizeLineage, type Lineage } from '@/shared/game/lineage';
import { sanitizeTraits } from '@/shared/game/traits';

// =============================================================================
// DRAFT CHOICES (Constitution §8.2)
// =============================================================================

/** The lineage lines a client may name. Unnamed = the canonical first. */
export const LINEAGE_DRAFT_KINDS = [
  'purebred',
  'dual',
  'parent1',
  'parent2',
] as const;

/** One trait offered on the draft board. */
export interface BreedingDraftTrait {
  trait_id: string;
  source: 'parent1' | 'parent2' | 'both';
}

/** One selectable lineage line. */
export interface BreedingDraftLineage {
  kind: (typeof LINEAGE_DRAFT_KINDS)[number];
  strains: string[];
  strength: number;
}

/** One selectable variant line, with everything that follows from it. */
export interface BreedingDraftVariant {
  variant_id: string;
  name: string | null;
  rarity: string;
  dynasty_id: string | null;
  trait_slots: number;
  lineage_options: BreedingDraftLineage[];
}

/**
 * The resolved child: exactly what `breed_snakes` writes. Preview equals
 * outcome because this object IS the outcome.
 */
export interface BreedingDraftPreview {
  variant_id: string;
  rarity: string;
  generation: number;
  trait_slots: number;
  traits: string[];
  lineage: { strains: string[]; strength: number } | null;
  lineage_kind: string | null;
  dna_cost: number;
}

/** The `breeding_draft` RPC payload. */
export interface BreedingDraft {
  parent1_id: string;
  parent2_id: string;
  cross_dynasty: boolean;
  generation: number;
  dna_cost: number;
  ascendance: {
    generation: number;
    yield_bonus: number;
    yield_multiplier: number;
  };
  trait_pool: BreedingDraftTrait[];
  variant_options: BreedingDraftVariant[];
  defaults: {
    variant_id: string | null;
    traits: string[];
    lineage_kind: string | null;
  };
  preview: BreedingDraftPreview;
}

/** The choice arguments both `breeding_draft` and `breed_snakes` accept. */
export interface BreedingChoiceArgs {
  p_variant_choice: string | null;
  p_trait_draft: string[] | null;
  p_lineage_kind: string | null;
}

/**
 * Normalize the optional choice fields of a breed/draft request.
 *
 * Shared deliberately: preview-equals-outcome only holds if the preview call
 * and the commit call hand the RPC identical arguments, so there is exactly
 * one function that turns a request body into those arguments.
 */
export function readBreedingChoices(
  body: Record<string, unknown>
): BreedingChoiceArgs {
  const kindRaw = typeof body.lineage_kind === 'string' ? body.lineage_kind : null;
  return {
    p_variant_choice:
      typeof body.variant_id === 'string' ? body.variant_id : null,
    p_trait_draft: Array.isArray(body.traits)
      ? sanitizeTraits(body.traits)
      : null,
    p_lineage_kind:
      kindRaw !== null &&
      (LINEAGE_DRAFT_KINDS as readonly string[]).includes(kindRaw)
        ? kindRaw
        : null,
  };
}

// =============================================================================
// TYPES
// =============================================================================

/** Snake summary embedded in a breeding history entry (parent or child). */
export interface BreedingHistorySnake {
  id: string;
  generation: number;
  variantName: string | null;
  rarity: string | null;
}

/** One breeding event, newest first in GET /api/breeding responses. */
export interface BreedingHistoryEntry {
  id: string;
  dnaCost: number;
  bredAt: string;
  parent1: BreedingHistorySnake | null;
  parent2: BreedingHistorySnake | null;
  child: BreedingHistorySnake | null;
  /** The lineage the player drafted at birth (§8.2). */
  lineage: Lineage | null;
}

export interface BreedingHistoryResponse {
  history: BreedingHistoryEntry[];
}

// =============================================================================
// MAPPERS
// =============================================================================

interface SnakeJoinRow {
  id?: string;
  generation?: number;
  snake_variants?: { name?: string; rarity?: string } | null;
}

/**
 * Supabase embeds joined rows as an object for to-one relations, but the
 * generated types sometimes surface arrays; normalize both shapes.
 */
function firstRow<T>(value: T | T[] | null | undefined): T | null {
  if (Array.isArray(value)) return value[0] ?? null;
  return value ?? null;
}

function mapSnakeJoin(
  value: SnakeJoinRow | SnakeJoinRow[] | null | undefined
): BreedingHistorySnake | null {
  const row = firstRow(value);
  if (!row || !row.id) return null;

  const variant = firstRow(row.snake_variants);
  return {
    id: row.id,
    generation: row.generation ?? 1,
    variantName: variant?.name ?? null,
    rarity: variant?.rarity ?? null,
  };
}

/**
 * Convert a breeding_history row (with collected_snakes -> snake_variants
 * joins aliased as parent1/parent2/child) into the camelCase API shape.
 */
export function mapBreedingHistoryRow(row: Record<string, unknown>): BreedingHistoryEntry {
  const traitRolls = row.trait_rolls as
    | { lineage?: { child?: unknown } | null }
    | null
    | undefined;
  return {
    id: row.id as string,
    dnaCost: (row.dna_cost as number) ?? 0,
    bredAt: row.bred_at as string,
    parent1: mapSnakeJoin(row.parent1 as SnakeJoinRow | SnakeJoinRow[] | null),
    parent2: mapSnakeJoin(row.parent2 as SnakeJoinRow | SnakeJoinRow[] | null),
    child: mapSnakeJoin(row.child as SnakeJoinRow | SnakeJoinRow[] | null),
    lineage: sanitizeLineage(traitRolls?.lineage?.child),
  };
}

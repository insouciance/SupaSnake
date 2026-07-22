/**
 * Server-side genome context (Buildcraft: The Genome).
 *
 * Everything the session route derives for a genome run - the gene offer
 * pool, the FTUE ramp, lineage + heirloom starting strain points, and
 * the previous-run fact for Grave Robber. All server-derived: the client
 * never asserts any of it. Every read here is pre-migration-safe (a
 * missing column/row degrades to the legacy behavior).
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import { GAME_CONFIG } from '@/shared/config/game';
import {
  GENE_POOL,
  SIGNATURE_GENES,
  type GeneId,
} from '@/shared/game/genes';
import {
  MUTATION_POOL,
} from '@/shared/game/mutations';
import {
  applyGauntletBan,
  type GauntletBanLike,
} from '@/shared/game/gauntlet';
import {
  fullMutationPool,
  unlockedMutationPool,
} from '@/shared/game/mastery';
import type { DynastyName } from '@/shared/game/rulesets';
import type { TraitId } from '@/shared/game/traits';
import type { StrainPoints, StrainTier } from '@/shared/game/strains';
import {
  lineageFromAffinity,
  lineageOfferBias,
  sanitizeLineage,
  startingStrainPoints,
  type Lineage,
} from '@/shared/game/lineage';
import type { LineageBias } from '@/shared/game/offerGravity';

/** FTUE unlock state derived from the player's banked-run count (§12). */
export interface GenomeFtue {
  strainTagsUnlocked: boolean;
  expressionsUnlocked: boolean;
  infuseUnlocked: boolean;
  spawnPointsUnlocked: boolean;
  splicesUnlocked: boolean;
  apexesUnlocked: boolean;
}

export function deriveFtue(
  bankedRuns: number,
  masteryLevel: number,
  ownedVariants: number = 2
): GenomeFtue {
  const ftue = GAME_CONFIG.genome.ftue;
  return {
    strainTagsUnlocked: bankedRuns >= ftue.strainTagsAt,
    expressionsUnlocked: bankedRuns >= ftue.expressionsAt,
    infuseUnlocked: bankedRuns >= ftue.infuseAt,
    spawnPointsUnlocked:
      bankedRuns >= ftue.spawnPointsAt && ownedVariants >= 2,
    splicesUnlocked: bankedRuns >= ftue.splicesAt,
    // "20 banked runs (or any M3)" - design §12
    apexesUnlocked: bankedRuns >= ftue.apexesAt || masteryLevel >= 3,
  };
}

/** The economy-binding tier ceiling for a FTUE state. */
export function ftueTierCap(ftue: GenomeFtue): Extract<StrainTier, 1 | 2 | 3> {
  if (!ftue.expressionsUnlocked) return 1;
  if (!ftue.apexesUnlocked) return 2;
  return 3;
}

/**
 * The genome gene pool: the base 19 + this dynasty's mastery gene
 * unlocks (M3/M6/M9, retagged mutations), the M10 signature gene, and
 * any seasonal genes - minus the Gauntlet ban. Free Play gets everything
 * (practice is a showroom, §7.4).
 */
export function composeGenePool(
  dynasty: DynastyName,
  masteryLevel: number,
  seasonalIds: GeneId[],
  gauntletBan: GauntletBanLike | null,
  isFreePlay: boolean
): GeneId[] {
  const masteryUnlocks = (
    isFreePlay
      ? fullMutationPool(dynasty)
      : unlockedMutationPool(dynasty, masteryLevel)
  ).filter((id) => !MUTATION_POOL.includes(id));
  const pool: GeneId[] = [
    ...GENE_POOL,
    ...masteryUnlocks,
    ...seasonalIds.filter((id) => !GENE_POOL.includes(id)),
  ];
  if (isFreePlay || masteryLevel >= 10) {
    pool.push(SIGNATURE_GENES[dynasty]);
  }
  const deduped = Array.from(new Set(pool));
  return applyGauntletBan(deduped, gauntletBan);
}

/**
 * The equipped snake's lineage: the collected row's own lineage JSONB
 * (post-030, breeding-crafted) with the variant's innate affinity as the
 * fallback. Pre-030 both reads miss => null (legacy behavior).
 */
export function lineageFromRows(
  snakeRow: Record<string, unknown>,
  variantRow: Record<string, unknown> | null
): Lineage | null {
  const own = sanitizeLineage(snakeRow.lineage);
  if (own) return own;
  return lineageFromAffinity(
    variantRow?.lineage_strain,
    variantRow?.affinity_strength
  );
}

/** Starting strain points + offer bias, honoring the FTUE spawn gate. */
export function deriveHeirloom(
  lineage: Lineage | null,
  traits: TraitId[],
  ftue: GenomeFtue
): { heirloom: StrainPoints; lineageBias: LineageBias | null } {
  if (!ftue.spawnPointsUnlocked) {
    return { heirloom: {}, lineageBias: null };
  }
  return {
    heirloom: startingStrainPoints(lineage, traits),
    lineageBias: lineageOfferBias(lineage),
  };
}

/**
 * Banked-run count (FTUE), distinct owned variants (Build Seed gate), and
 * previous earned-run outcome (Grave Robber). Every read is best-effort.
 */
export async function getGenomeRunFacts(
  supabase: SupabaseClient,
  playerId: string
): Promise<{ bankedRuns: number; prevRunDied: boolean; ownedVariants: number }> {
  let bankedRuns = 0;
  let prevRunDied = false;
  let ownedVariants = 0;
  try {
    const { count } = await supabase
      .from('game_sessions')
      .select('*', { count: 'exact', head: true })
      .eq('player_id', playerId)
      .eq('extracted', true)
      .eq('validated', true)
      .eq('is_free_play', false)
      .not('ended_at', 'is', null);
    bankedRuns = count ?? 0;
  } catch {
    bankedRuns = 0;
  }
  try {
    const { data } = await supabase
      .from('collected_snakes')
      .select('snake_variant_id')
      .eq('player_id', playerId);
    ownedVariants = new Set(
      (data ?? [])
        .map((row) => row.snake_variant_id)
        .filter((id): id is string => typeof id === 'string' && id.length > 0)
    ).size;
  } catch {
    ownedVariants = 0;
  }
  try {
    const { data } = await supabase
      .from('game_sessions')
      .select('extracted, ended_at')
      .eq('player_id', playerId)
      .eq('validated', true)
      .eq('is_free_play', false)
      .not('ended_at', 'is', null)
      .order('ended_at', { ascending: false })
      .limit(1);
    const last = Array.isArray(data) ? data[0] : null;
    prevRunDied = last ? last.extracted !== true : false;
  } catch {
    prevRunDied = false;
  }
  return { bankedRuns, prevRunDied, ownedVariants };
}

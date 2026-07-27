/**
 * The gene pool and the FTUE ramp — the pure half of the run's genome context.
 *
 * WHY THIS MODULE EXISTS
 *
 * These five declarations were written in `src/lib/server/genome.ts` because
 * the session route was their only caller. They are pure functions of their
 * arguments — no Supabase client, no request, no clock — and every dependency
 * they have already lives under `@/shared`. The Workbench needs exactly them:
 * a pre-run calculator has to compose the same pool the run will draw from and
 * apply the same FTUE ceiling the run will be paid under, and reaching into
 * `lib/server` from a shared module (or worse, restating the composition) is
 * how a calculator starts describing a game the engine is not playing.
 *
 * `lib/server/genome.ts` re-exports all five, so no existing call site moved.
 * What stayed behind is the genuinely server-side half: `getGenomeRunFacts`,
 * which reads the database, and `lineageFromRows`, which reads database rows.
 */

import { GAME_CONFIG } from '@/shared/config/game';
import {
  GENE_POOL,
  SIGNATURE_GENES,
  type GeneId,
} from '@/shared/game/genes';
import { MUTATION_POOL } from '@/shared/game/mutations';
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
  lineageOfferBias,
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

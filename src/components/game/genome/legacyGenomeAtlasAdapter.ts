import { GENES, isGeneId, type GeneId } from '@/shared/game/genes';
import { SPLICES, SPLICE_IDS, spliceStrains, type SpliceId } from '@/shared/game/splices';
import {
  STRAINS,
  STRAIN_IDS,
  STRAIN_THRESHOLDS,
  STRAIN_TIER_NAMES,
} from '@/shared/game/strains';
import { describe, strainTierId } from '@/shared/game/lexicon';
import type { GenomeStrategyAtlasModel } from './GenomeStrategyAtlas';

interface RecipeKnowledge {
  id: string;
  parents: readonly string[] | null;
}

function categoryForGene(id: GeneId): string {
  const economics = GENES[id].economics;
  if (economics === 'path') return 'Execution & route';
  if (economics === 'pure') return 'Yield & outcome';
  return 'Genome control';
}

/** Compatibility atlas for v1 history; new runs pass a v2 model from core. */
export function buildLegacyGenomeAtlasModel(
  recipeKnowledge: readonly RecipeKnowledge[] = []
): GenomeStrategyAtlasModel {
  const known = new Map(recipeKnowledge.map((entry) => [entry.id, entry.parents]));
  return {
    rulesVersion: 1,
    rosterLabel: 'Genome v1 archive',
    genes: (Object.keys(GENES) as GeneId[]).map((id) => ({
      id,
      name: GENES[id].name,
      category: categoryForGene(id),
      effect: GENES[id].effect,
      cost: GENES[id].cost,
      strains: GENES[id].strains,
    })),
    strains: STRAIN_IDS.map((strain) => {
      const names = STRAIN_TIER_NAMES[strain];
      return {
        id: strain,
        name: STRAINS[strain].name,
        color: STRAINS[strain].color,
        identity: STRAINS[strain].identity,
        tiers: [
          { points: STRAIN_THRESHOLDS.minor, key: 'minor' as const, name: names.minor, lexiconTier: 1 as const },
          { points: STRAIN_THRESHOLDS.expression, key: 'expression' as const, name: names.expression, lexiconTier: 2 as const },
          { points: STRAIN_THRESHOLDS.apex, key: 'apex' as const, name: names.apex, lexiconTier: 3 as const },
        ].map((tier) => {
          const entry = describe('strainTier', strainTierId(strain, tier.lexiconTier));
          return {
            points: tier.points,
            name: tier.name,
            rule: entry?.effect ?? STRAINS[strain].identity,
            cost: entry?.cost ?? '',
          };
        }),
      };
    }),
    splices: SPLICE_IDS.map((id: SpliceId) => {
      const splice = SPLICES[id];
      const rawParents = known.get(id) ?? null;
      const parents: readonly [GeneId, GeneId] | null =
        rawParents?.length === 2 && isGeneId(rawParents[0]) && isGeneId(rawParents[1])
          ? [rawParents[0], rawParents[1]]
          : null;
      return {
        id,
        name: splice.name,
        rule: splice.effect,
        cost: splice.cost,
        strains: spliceStrains(id),
        recipeKnown: parents !== null,
        parentIds: parents,
        recipeLabel: parents
          ? `Recipe: ${GENES[parents[0]].name} + ${GENES[parents[1]].name}`
          : 'Recipe hidden until discovered',
      };
    }),
  };
}

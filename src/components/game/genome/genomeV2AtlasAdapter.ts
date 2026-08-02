import {
  GENOME_V2_GENES,
  genomeV2ActivePool,
  type GenomeV2ActiveGeneId,
} from '@/shared/game/genes';
import {
  GENOME_V2_SPLICE_IDS,
  GENOME_V2_SPLICES,
  GENOME_V2_STRAIN_LADDERS,
  type GenomeV2SpliceId,
} from '@/shared/game/genomeV2';
import { STRAINS, STRAIN_IDS } from '@/shared/game/strains';
import type { GenomeStrategyAtlasModel } from './GenomeStrategyAtlas';
import { genomeV2CategoryLabel } from './genomeV2PresentationAdapter';

function allCurrentGenes(): GenomeV2ActiveGeneId[] {
  return Array.from(new Set([
    ...genomeV2ActivePool('PRIMAL'),
    ...genomeV2ActivePool('CYBER'),
    ...genomeV2ActivePool('COSMIC'),
  ]));
}

/**
 * Current public strategy atlas. Every mechanical route is visible; durable
 * discovery changes history and prestige metadata, never tactical access.
 */
export function buildGenomeV2AtlasModel(
  discoveredRecipes: ReadonlySet<GenomeV2SpliceId> = new Set()
): GenomeStrategyAtlasModel {
  return {
    rulesVersion: 2,
    rosterLabel: 'Current Genome',
    genes: allCurrentGenes().map((id) => {
      const gene = GENOME_V2_GENES[id];
      return {
        id,
        name: gene.name,
        category: genomeV2CategoryLabel(gene.category),
        effect: gene.effect,
        cost: gene.cost,
        strains: gene.strains,
        dynastyFacts: gene.dynasties.length > 0
          ? [`${gene.name} appears only in ${gene.dynasties.join(' / ')} runs.`]
          : undefined,
      };
    }),
    strains: STRAIN_IDS.map((id) => ({
      id,
      name: STRAINS[id].name,
      color: STRAINS[id].color,
      identity: STRAINS[id].identity,
      tiers: GENOME_V2_STRAIN_LADDERS[id].map((tier) => ({
        points: tier.points,
        name: tier.name,
        rule: tier.rule,
        cost: '',
      })),
    })),
    splices: GENOME_V2_SPLICE_IDS.map((id) => {
      const splice = GENOME_V2_SPLICES[id];
      const recipeKnown = discoveredRecipes.has(id);
      return {
        id,
        name: splice.name,
        rule: splice.rule,
        cost: splice.strategicCost,
        strains: Array.from(new Set(splice.parents.flatMap((parent) => GENOME_V2_GENES[parent].strains))),
        recipeKnown,
        parentIds: splice.parents,
        recipeLabel: `Recipe: ${splice.parents.map((parent) => GENOME_V2_GENES[parent].name).join(' + ')}`,
      };
    }),
  };
}

export function discoveredGenomeV2Recipes(raw: unknown): Set<GenomeV2SpliceId> {
  const result = new Set<GenomeV2SpliceId>();
  if (!Array.isArray(raw)) return result;
  for (const entry of raw) {
    if (!entry || typeof entry !== 'object' || Array.isArray(entry)) continue;
    const value = entry as Record<string, unknown>;
    if (
      value.discovered === true &&
      typeof value.id === 'string' &&
      (GENOME_V2_SPLICE_IDS as readonly string[]).includes(value.id)
    ) {
      result.add(value.id as GenomeV2SpliceId);
    }
  }
  return result;
}

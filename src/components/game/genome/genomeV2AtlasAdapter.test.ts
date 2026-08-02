import { GENOME_V2_SPLICE_IDS } from '@/shared/game/genomeV2';
import {
  buildGenomeV2AtlasModel,
  discoveredGenomeV2Recipes,
} from './genomeV2AtlasAdapter';

describe('Genome v2 Atlas adapter', () => {
  it('shows the complete roster, every 3/4/5 ladder, and every tactical recipe', () => {
    const model = buildGenomeV2AtlasModel();
    expect(model.rulesVersion).toBe(2);
    expect(model.genes).toHaveLength(16);
    expect(model.genes.map((gene) => gene.id)).toEqual(expect.arrayContaining([
      'heartwood',
      'zenith_protocol',
      'constellation_crown',
    ]));
    expect(model.strains).toHaveLength(5);
    for (const strain of model.strains) {
      expect(strain.tiers.map((tier) => tier.points)).toEqual([3, 4, 5]);
    }
    expect(model.splices).toHaveLength(GENOME_V2_SPLICE_IDS.length);
    expect(model.splices.every((splice) => splice.parentIds.length === 2)).toBe(true);
    expect(model.splices[0].rule.length).toBeGreaterThan(10);
  });

  it('reveals only server-reported durable discoveries', () => {
    const discovered = discoveredGenomeV2Recipes([
      { id: 'splice_dragon_hoard', discovered: true },
      { id: 'splice_worldcoil', discovered: false },
      { id: 'not-a-v2-splice', discovered: true },
    ]);
    const model = buildGenomeV2AtlasModel(discovered);
    expect(model.splices.find((splice) => splice.id === 'splice_dragon_hoard')).toMatchObject({
      recipeKnown: true,
      parentIds: ['gold_trail', 'compound_interest'],
    });
    expect(model.splices.find((splice) => splice.id === 'splice_worldcoil')).toMatchObject({
      recipeKnown: false,
      parentIds: ['coilkeeper', 'overgrowth'],
    });
  });
});

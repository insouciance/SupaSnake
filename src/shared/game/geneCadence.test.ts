import { describe, expect, it } from '@jest/globals';
import {
  GENE_OFFER_CADENCE,
  GENOME_V2_GENE_OFFER_CADENCE,
  rollGeneOfferInterval,
  rollGenomeV2GeneOfferInterval,
} from './geneCadence';
import { GENOME_SPAWN } from './genes';
import { MUTATION_SPAWN, rollMutationInterval } from './mutations';

describe('universal Genome-offer cadence', () => {
  it('rolls uniformly across the inclusive 4-8-food window', () => {
    const seen = new Set<number>();
    for (let index = 0; index < 1000; index += 1) {
      seen.add(rollGeneOfferInterval(() => index / 1000));
    }
    expect(Math.min(...seen)).toBe(GENE_OFFER_CADENCE.minFoodsPerPick);
    expect(Math.max(...seen)).toBe(8);
    expect([...seen].sort((a, b) => a - b)).toEqual([4, 5, 6, 7, 8]);
    expect(GENE_OFFER_CADENCE.intervalBase).toBe(6);
  });

  it('is the single source used by mutation-era and Genome-era wrappers', () => {
    expect(MUTATION_SPAWN.intervalBase).toBe(GENE_OFFER_CADENCE.intervalBase);
    expect(MUTATION_SPAWN.intervalJitter).toBe(GENE_OFFER_CADENCE.intervalJitter);
    expect(GENOME_SPAWN.intervalBase).toBe(GENE_OFFER_CADENCE.intervalBase);
    expect(GENOME_SPAWN.minFoodsPerPick).toBe(
      GENE_OFFER_CADENCE.minFoodsPerPick
    );
    for (let index = 0; index < 1000; index += 1) {
      const rng = () => index / 1000;
      expect(rollMutationInterval(rng)).toBe(rollGeneOfferInterval(rng));
    }
  });

  it('provides about seven build opportunities by food 42', () => {
    expect(Math.floor(42 / GENE_OFFER_CADENCE.intervalBase)).toBe(7);
  });

  it('keeps v1 byte semantics while v2 opens at four then rolls 4–6, mean five', () => {
    expect([
      rollGeneOfferInterval(() => 0),
      rollGeneOfferInterval(() => 0.5),
      rollGeneOfferInterval(() => 0.999999),
    ]).toEqual([4, 6, 8]);
    expect(rollGenomeV2GeneOfferInterval(0, () => 0.999)).toBe(4);
    expect(rollGenomeV2GeneOfferInterval(1, () => 0.999)).toBe(4);
    const later = [0, 0.34, 0.67].map((value) =>
      rollGenomeV2GeneOfferInterval(2, () => value)
    );
    expect(later).toEqual([4, 5, 6]);
    expect(later.reduce((sum, value) => sum + value, 0) / later.length).toBe(
      GENOME_V2_GENE_OFFER_CADENCE.intervalBase
    );
    expect(GENE_OFFER_CADENCE).toEqual({
      intervalBase: 6,
      intervalJitter: 2,
      minFoodsPerPick: 4,
    });
  });
});

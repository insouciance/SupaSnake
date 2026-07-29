import { describe, expect, it } from '@jest/globals';
import {
  GENE_OFFER_CADENCE,
  rollGeneOfferInterval,
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
});

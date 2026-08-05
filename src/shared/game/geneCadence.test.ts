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
  it('rolls uniformly across the inclusive 6-10-food window', () => {
    const seen = new Set<number>();
    const counts = new Map<number, number>();
    for (let index = 0; index < 1000; index += 1) {
      const rolled = rollGeneOfferInterval(() => index / 1000);
      seen.add(rolled);
      counts.set(rolled, (counts.get(rolled) ?? 0) + 1);
    }
    expect(Math.min(...seen)).toBe(6);
    expect(Math.max(...seen)).toBe(10);
    expect([...seen].sort((a, b) => a - b)).toEqual([6, 7, 8, 9, 10]);
    expect(GENE_OFFER_CADENCE.intervalBase).toBe(8);
    // Uniform across the five outcomes: a sweep of 1000 evenly spaced draws
    // lands 200 in each bucket, and the mean is the authored base.
    expect([...counts.values()]).toEqual([200, 200, 200, 200, 200]);
    const mean =
      [...counts.entries()].reduce(
        (sum, [value, hits]) => sum + value * hits,
        0
      ) / 1000;
    expect(mean).toBe(GENE_OFFER_CADENCE.intervalBase);
  });

  it('keeps the validator floor at the minimum any live cadence can produce', () => {
    // The floor is NOT the universal roll's lower bound. The auto-offer
    // rollback path opens after four foods, and a floor of six would reject
    // its first legal pick.
    expect(GENE_OFFER_CADENCE.minFoodsPerPick).toBe(4);
    expect(GENE_OFFER_CADENCE.minFoodsPerPick).toBeLessThanOrEqual(
      GENE_OFFER_CADENCE.intervalBase - GENE_OFFER_CADENCE.intervalJitter
    );
    expect(GENE_OFFER_CADENCE.minFoodsPerPick).toBe(
      GENOME_V2_GENE_OFFER_CADENCE.openingInterval
    );
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

  it('provides about five build opportunities by food 42', () => {
    // 6 +/- 2 gave seven. The ruling trades two of them for room to play the
    // pick out before the next relic lands.
    expect(Math.floor(42 / GENE_OFFER_CADENCE.intervalBase)).toBe(5);
  });

  it('leaves the auto-offer compatibility cadence byte-identical', () => {
    expect([
      rollGeneOfferInterval(() => 0),
      rollGeneOfferInterval(() => 0.5),
      rollGeneOfferInterval(() => 0.999999),
    ]).toEqual([6, 8, 10]);
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
      intervalBase: 8,
      intervalJitter: 2,
      minFoodsPerPick: 4,
    });
  });
});

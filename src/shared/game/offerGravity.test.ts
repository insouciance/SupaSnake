/**
 * Offer gravity - deterministic seeded offers. The server re-derives any
 * offer k from (runSeed, k, context); these tests pin that property plus
 * the gravity/wildcard/pity/lineage behaviors.
 */

import { GENE_POOL, geneStrains, type GeneId } from '@/shared/game/genes';
import {
  OFFER_GRAVITY,
  fnv1a,
  mulberry32,
  offerStream,
  rollGeneOffer,
  topStrain,
  type OfferContext,
} from '@/shared/game/offerGravity';

const ctx = (partial: Partial<OfferContext>): OfferContext => ({
  runSeed: 'test-seed',
  offerIndex: 0,
  picks: [],
  pool: [...GENE_POOL],
  points: {},
  ...partial,
});

describe('deterministic stream', () => {
  it('same (seed, k) => identical sequence; different k => independent', () => {
    const a1 = offerStream('seed', 3);
    const a2 = offerStream('seed', 3);
    const b = offerStream('seed', 4);
    const seqA1 = [a1(), a1(), a1()];
    const seqA2 = [a2(), a2(), a2()];
    const seqB = [b(), b(), b()];
    expect(seqA1).toEqual(seqA2);
    expect(seqA1).not.toEqual(seqB);
  });

  it('fnv1a and mulberry32 are stable across calls', () => {
    expect(fnv1a('supasnake')).toBe(fnv1a('supasnake'));
    const rng = mulberry32(42);
    const value = rng();
    expect(value).toBeGreaterThanOrEqual(0);
    expect(value).toBeLessThan(1);
  });
});

describe('rollGeneOffer', () => {
  it('is deterministic in its full context', () => {
    const context = ctx({ points: { AURUM: 2 }, picks: [{ id: 'gold_trail', atFood: 5 }] });
    expect(rollGeneOffer(context)).toEqual(rollGeneOffer(ctx({ ...context })));
  });

  it('never offers held genes or duplicates, and both slots differ', () => {
    for (let k = 0; k < 50; k++) {
      const offer = rollGeneOffer(
        ctx({
          offerIndex: k,
          picks: [
            { id: 'gold_trail', atFood: 5 },
            { id: 'tithe', atFood: 15 },
          ],
        })
      );
      expect(offer).not.toBeNull();
      const [a, b] = offer!;
      expect(a).not.toBe(b);
      expect(['gold_trail', 'tithe']).not.toContain(a);
      expect(['gold_trail', 'tithe']).not.toContain(b);
    }
  });

  it('returns null when fewer than 2 candidates remain', () => {
    expect(
      rollGeneOffer(
        ctx({ pool: ['gold_trail', 'tithe'], picks: [{ id: 'tithe', atFood: 3 }] })
      )
    ).toBeNull();
  });

  it('gravity: committed strains appear measurably more often', () => {
    let aurumWithGravity = 0;
    let aurumBaseline = 0;
    for (let k = 0; k < 300; k++) {
      const withGravity = rollGeneOffer(ctx({ offerIndex: k, points: { AURUM: 3 } }));
      const baseline = rollGeneOffer(ctx({ offerIndex: k, runSeed: 'other' }));
      if (withGravity?.some((id) => geneStrains(id).includes('AURUM'))) {
        aurumWithGravity++;
      }
      if (baseline?.some((id) => geneStrains(id).includes('AURUM'))) {
        aurumBaseline++;
      }
    }
    expect(aurumWithGravity).toBeGreaterThan(aurumBaseline * 1.2);
  });

  it('pity: two offers without the top strain force it into slot 1', () => {
    const noAurum: GeneId[][] = [
      ['wall_rush', 'shed'],
      ['splitter', 'phoenix'],
    ];
    const offer = rollGeneOffer(
      ctx({
        offerIndex: 7,
        points: { AURUM: 3 },
        recentOffers: noAurum,
      })
    );
    expect(geneStrains(offer![0])).toContain('AURUM');
  });

  it('lineage guarantee: offer 0 slot 1 carries the lineage strain', () => {
    for (let seed = 0; seed < 20; seed++) {
      const offer = rollGeneOffer(
        ctx({
          runSeed: `seed-${seed}`,
          lineage: { strains: ['FERAL'], guaranteeFirstOffer: true },
        })
      );
      expect(geneStrains(offer![0])).toContain('FERAL');
    }
  });

  it('uses the selected primary for a dual-lineage first-offer guarantee', () => {
    for (let seed = 0; seed < 20; seed++) {
      const offer = rollGeneOffer(
        ctx({
          runSeed: `dual-seed-${seed}`,
          lineage: {
            strains: ['FERAL', 'VOLT'],
            guaranteeFirstOffer: true,
            guaranteeStrains: ['VOLT'],
          },
        })
      );
      expect(geneStrains(offer![0])).toContain('VOLT');
    }
  });

  it('does not invent a guarantee for an unselected dual lineage', () => {
    expect(() =>
      rollGeneOffer(
        ctx({
          lineage: {
            strains: ['FERAL', 'VOLT'],
            guaranteeFirstOffer: true,
            guaranteeStrains: [],
          },
        })
      )
    ).not.toThrow();
  });

  it('wildcard: off-build genes appear in slot 2 even under heavy gravity', () => {
    let offBuild = 0;
    for (let k = 0; k < 200; k++) {
      const offer = rollGeneOffer(
        ctx({ offerIndex: k, points: { AURUM: 4, VOLT: 2 } })
      );
      const slot2 = offer![1];
      if (geneStrains(slot2).every((s) => s !== 'AURUM' && s !== 'VOLT')) {
        offBuild++;
      }
    }
    // wildcardChance 25% over ~200 offers - loose bound, not flaky.
    expect(offBuild).toBeGreaterThan(20);
  });

  it('topStrain picks the highest-point strain', () => {
    expect(topStrain({ AURUM: 1, FLUX: 3 })).toBe('FLUX');
    expect(topStrain({})).toBeNull();
  });

  it('exposes its tuning constants', () => {
    expect(OFFER_GRAVITY.wildcardChance).toBe(0.25);
    expect(OFFER_GRAVITY.pityOfferWindow).toBe(2);
  });
});

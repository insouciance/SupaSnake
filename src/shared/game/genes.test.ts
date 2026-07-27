/**
 * Genes - catalog integrity + legacy byte-identity + new-gene [E] math.
 * The load-bearing invariant: for legacy-only picks, the genome path pays
 * EXACTLY what the mutation path pays (old sessions validate unchanged).
 */

import {
  foodValueFlatBonus,
  foodValueModifier,
  MUTATIONS,
  type MutationId,
  type MutationPick,
} from '@/shared/game/mutations';
import {
  GENES,
  GENE_ECONOMICS,
  GENE_POOL,
  MUTATION_STRAINS,
  geneFoodValueFlatBonus,
  geneFoodValueModifier,
  geneStrains,
  isGeneId,
  isNewGeneId,
  sanitizeGenePicks,
  type GeneId,
  type GenePick,
} from '@/shared/game/genes';
import { isStrainId } from '@/shared/game/strains';

describe('gene catalog integrity', () => {
  const ids = Object.keys(GENES) as GeneId[];

  it('contains all 22 legacy mutations plus the 12 genome-era genes', () => {
    expect(ids.length).toBe(34);
    for (const legacy of Object.keys(MUTATIONS) as MutationId[]) {
      expect(isGeneId(legacy)).toBe(true);
    }
  });

  it('tags every gene with 1-2 valid strains', () => {
    for (const id of ids) {
      const strains = geneStrains(id);
      expect(strains.length).toBeGreaterThanOrEqual(1);
      expect(strains.length).toBeLessThanOrEqual(2);
      for (const strain of strains) {
        expect(isStrainId(strain)).toBe(true);
      }
    }
  });

  it('sets an economics class on every gene', () => {
    for (const id of ids) {
      expect(['pure', 'path', 'none']).toContain(GENES[id].economics);
    }
  });

  it('keeps legacy names/kinds identical to the mutation catalog', () => {
    for (const id of Object.keys(MUTATIONS) as MutationId[]) {
      expect(GENES[id].name).toBe(MUTATIONS[id].name);
      expect(GENES[id].kind).toBe(MUTATIONS[id].kind);
      expect(GENES[id].strains).toEqual(MUTATION_STRAINS[id]);
    }
  });

  it('base pool = the launch pool + 9 new base genes (no mastery/seasonal/signature)', () => {
    // 18, not 19: Rule 15 retired `shed` from MUTATION_POOL, and GENE_POOL
    // spreads it. The definition survives for legacy settlement.
    expect(GENE_POOL.length).toBe(18);
    expect(GENE_POOL).not.toContain('shed');
    expect(GENE_POOL).not.toContain('deep_roots');
    expect(GENE_POOL).not.toContain('solstice_engine');
    expect(GENE_POOL).not.toContain('heartwood');
    expect(GENE_POOL).toContain('loan_shark');
    expect(isNewGeneId('loan_shark')).toBe(true);
    expect(isNewGeneId('gold_trail')).toBe(false);
  });
});

describe('legacy byte-identity', () => {
  const legacyPicks: MutationPick[] = [
    { id: 'gold_trail', atFood: 5 },
    { id: 'overgrowth', atFood: 12 },
    { id: 'glacial_reserve', atFood: 20 },
    { id: 'deep_roots', atFood: 8 },
  ];

  it('geneFoodValueModifier === foodValueModifier for legacy-only picks', () => {
    for (let n = 1; n <= 120; n++) {
      for (const phoenixAt of [null, 30]) {
        expect(geneFoodValueModifier(legacyPicks, n, phoenixAt)).toBe(
          foodValueModifier(legacyPicks, n, phoenixAt)
        );
      }
    }
  });

  it('geneFoodValueFlatBonus === foodValueFlatBonus for legacy-only picks', () => {
    for (let n = 1; n <= 120; n++) {
      expect(geneFoodValueFlatBonus(legacyPicks, n)).toBe(
        foodValueFlatBonus(legacyPicks, n)
      );
    }
  });
});

describe('new gene [E] math', () => {
  it('Loan Shark: x2 for 10 foods, x0.8 for the next 20, then neutral', () => {
    const picks: GenePick[] = [{ id: 'loan_shark', atFood: 10 }];
    expect(geneFoodValueModifier(picks, 11)).toBe(2);
    expect(geneFoodValueModifier(picks, 20)).toBe(2);
    expect(geneFoodValueModifier(picks, 21)).toBe(0.8);
    expect(geneFoodValueModifier(picks, 40)).toBe(0.8);
    expect(geneFoodValueModifier(picks, 41)).toBe(1);
  });

  it('Loan Shark: benefit voids post-Phoenix, payback persists', () => {
    const picks: GenePick[] = [{ id: 'loan_shark', atFood: 10 }];
    expect(geneFoodValueModifier(picks, 15, 12)).toBe(1); // x2 voided
    expect(geneFoodValueModifier(picks, 25, 12)).toBe(0.8); // cost persists
  });

  it('Tithe: +20 every 10th, -1 every food; +20 voided post-Phoenix', () => {
    const picks: GenePick[] = [{ id: 'tithe', atFood: 0 }];
    expect(geneFoodValueFlatBonus(picks, 10)).toBe(19);
    expect(geneFoodValueFlatBonus(picks, 11)).toBe(-1);
    expect(geneFoodValueFlatBonus(picks, 20, 15)).toBe(-1); // benefit voided
  });

  it('Last Gasp: +15% at length >= 30, -5% below, length-blind = penalty', () => {
    const picks: GenePick[] = [{ id: 'last_gasp', atFood: 0 }];
    const longBody = { lengthAt: () => 35 };
    const shortBody = { lengthAt: () => 12 };
    expect(geneFoodValueModifier(picks, 5, null, longBody)).toBe(
      GENE_ECONOMICS.lastGaspBonus
    );
    expect(geneFoodValueModifier(picks, 5, null, shortBody)).toBe(
      GENE_ECONOMICS.lastGaspPenalty
    );
    expect(geneFoodValueModifier(picks, 5)).toBe(GENE_ECONOMICS.lastGaspPenalty);
  });

  it('Grave Robber: +10% only when the previous run died', () => {
    const picks: GenePick[] = [{ id: 'grave_robber', atFood: 0 }];
    expect(geneFoodValueModifier(picks, 5, null, { prevRunDied: true })).toBe(
      GENE_ECONOMICS.graveRobberBonus
    );
    expect(geneFoodValueModifier(picks, 5, null, { prevRunDied: false })).toBe(1);
    expect(geneFoodValueModifier(picks, 5)).toBe(1);
  });

  it('Zenith Protocol: +4 flat at food >= 20, x0.95 below (cost persists)', () => {
    const picks: GenePick[] = [{ id: 'zenith_protocol', atFood: 0 }];
    expect(geneFoodValueModifier(picks, 10)).toBe(GENE_ECONOMICS.zenithPenalty);
    expect(geneFoodValueFlatBonus(picks, 25)).toBe(GENE_ECONOMICS.zenithFlatBonus);
    expect(geneFoodValueFlatBonus(picks, 25, 22)).toBe(0); // voided
    expect(geneFoodValueModifier(picks, 10, 5)).toBe(GENE_ECONOMICS.zenithPenalty);
  });

  it('Bulk Up: +2 flat per 10 segments of current length', () => {
    const picks: GenePick[] = [{ id: 'bulk_up', atFood: 0 }];
    expect(geneFoodValueFlatBonus(picks, 5, null, { lengthAt: () => 34 })).toBe(6);
    expect(geneFoodValueFlatBonus(picks, 5, null, { lengthAt: () => 9 })).toBe(0);
  });
});

describe('sanitizeGenePicks', () => {
  it('drops unknown ids, duplicates, bad atFood, and caps at maxHeld', () => {
    const raw = [
      { id: 'gold_trail', atFood: 5 },
      { id: 'gold_trail', atFood: 9 },
      { id: 'nope', atFood: 3 },
      { id: 'tithe', atFood: -1 },
      { id: 'tithe', atFood: 1.5 },
      { id: 'loan_shark', atFood: 12 },
      { id: 'bulk_up', atFood: 13 },
      { id: 'serpentine', atFood: 14 },
      { id: 'slipstream', atFood: 15 },
      { id: 'static_charge', atFood: 16 },
      { id: 'pocket_rift', atFood: 17 },
    ];
    const picks = sanitizeGenePicks(raw);
    expect(picks.length).toBe(6);
    expect(picks[0]).toEqual({ id: 'gold_trail', atFood: 5 });
    expect(picks.map((p) => p.id)).not.toContain('tithe');
    expect(sanitizeGenePicks('junk')).toEqual([]);
  });
});

/**
 * Lineage - starting strain points (the collection -> run bridge),
 * strength caps, breeding preview enumeration.
 */

import {
  DYNASTY_STRAINS,
  LINEAGE_REROLL_COST,
  clampLineageStrength,
  combineLineages,
  lineageOfferBias,
  lineageStrengthCap,
  sanitizeLineage,
  startingStrainPoints,
} from '@/shared/game/lineage';

describe('strength caps', () => {
  it('rarity caps: common/uncommon 0, rare 1, epic+ 2', () => {
    expect(lineageStrengthCap('common')).toBe(0);
    expect(lineageStrengthCap('uncommon')).toBe(0);
    expect(lineageStrengthCap('rare')).toBe(1);
    expect(lineageStrengthCap('epic')).toBe(2);
    expect(lineageStrengthCap('LEGENDARY')).toBe(2);
    expect(lineageStrengthCap('mystery')).toBe(0);
  });

  it('Gen3+ prestige adds +1, still capped at 2', () => {
    expect(clampLineageStrength(2, 'common', 1)).toBe(0);
    expect(clampLineageStrength(2, 'common', 3)).toBe(1);
    expect(clampLineageStrength(1, 'rare', 3)).toBe(2);
    expect(clampLineageStrength(2, 'legendary', 5)).toBe(2);
  });
});

describe('startingStrainPoints', () => {
  it('lineage strength >= 1 grants its strain point; heirlooms add theirs', () => {
    const points = startingStrainPoints(
      { strains: ['FERAL'], strength: 1 },
      ['gambler', 'scavenger']
    );
    expect(points).toEqual({ FERAL: 1, UMBRA: 1, AURUM: 1 });
  });

  it('caps combined spawn points at 2 per strain (§8 gate 2)', () => {
    // UMBRA lineage + Gambler + Patient would be 3 -> capped at 2.
    const points = startingStrainPoints(
      { strains: ['UMBRA'], strength: 2 },
      ['gambler', 'patient']
    );
    expect(points.UMBRA).toBe(2);
  });

  it('strength 0 lineage grants no point; dual lineage points its primary', () => {
    expect(startingStrainPoints({ strains: ['VOLT'], strength: 0 }, [])).toEqual({});
    expect(
      startingStrainPoints(
        { strains: ['VOLT', 'FERAL'], strength: 1, primary: 'FERAL' },
        []
      )
    ).toEqual({ FERAL: 1 });
    expect(
      startingStrainPoints(
        { strains: ['VOLT', 'FERAL'], strength: 1 },
        []
      )
    ).toEqual({});
  });

  it('offer bias exists at every strength; guarantee only at 2', () => {
    expect(lineageOfferBias({ strains: ['VOLT'], strength: 0 })).toEqual({
      strains: ['VOLT'],
      guaranteeFirstOffer: false,
      guaranteeStrains: ['VOLT'],
    });
    expect(
      lineageOfferBias({ strains: ['VOLT'], strength: 2 })!.guaranteeFirstOffer
    ).toBe(true);
    expect(lineageOfferBias(null)).toBeNull();
    expect(
      lineageOfferBias({
        strains: ['VOLT', 'FERAL'],
        strength: 2,
        primary: 'FERAL',
      })
    ).toEqual({
      strains: ['VOLT', 'FERAL'],
      guaranteeFirstOffer: true,
      guaranteeStrains: ['FERAL'],
    });
    expect(
      lineageOfferBias({ strains: ['VOLT', 'FERAL'], strength: 2 })
        ?.guaranteeStrains
    ).toEqual([]);
  });
});

describe('combineLineages (breeding preview mirror)', () => {
  it('purebred: same strain -> strength max + 1', () => {
    const outcomes = combineLineages(
      { lineage: { strains: ['FERAL'], strength: 1 }, dynasty: 'PRIMAL' },
      { lineage: { strains: ['FERAL'], strength: 0 }, dynasty: 'PRIMAL' }
    );
    expect(outcomes).toEqual([
      { lineage: { strains: ['FERAL'], strength: 2 }, chance: 1 },
    ]);
  });

  it('same dynasty, different strains -> 50/50 at max strength', () => {
    const outcomes = combineLineages(
      { lineage: { strains: ['FERAL'], strength: 1 }, dynasty: 'PRIMAL' },
      { lineage: { strains: ['AURUM'], strength: 2 }, dynasty: 'PRIMAL' }
    );
    expect(outcomes.length).toBe(2);
    expect(outcomes[0].chance).toBe(0.5);
    expect(outcomes.map((o) => o.lineage.strains[0]).sort()).toEqual([
      'AURUM',
      'FERAL',
    ]);
    expect(outcomes.every((o) => o.lineage.strength === 2)).toBe(true);
  });

  it('cross-dynasty -> dual lineage', () => {
    const outcomes = combineLineages(
      { lineage: { strains: ['VOLT'], strength: 1 }, dynasty: 'CYBER' },
      { lineage: { strains: ['FERAL'], strength: 0 }, dynasty: 'PRIMAL' }
    );
    expect(outcomes).toEqual([
      { lineage: { strains: ['VOLT', 'FERAL'], strength: 1 }, chance: 1 },
    ]);
  });
});

describe('sanitizeLineage', () => {
  it('parses valid shapes, clamps strength, drops junk', () => {
    expect(
      sanitizeLineage({ strains: ['VOLT', 'FERAL'], strength: 7, primary: 'FERAL' })
    ).toEqual({ strains: ['VOLT', 'FERAL'], strength: 2, primary: 'FERAL' });
    expect(sanitizeLineage({ strains: ['NOPE'] })).toBeNull();
    expect(sanitizeLineage(null)).toBeNull();
    expect(sanitizeLineage({ strains: ['VOLT'], primary: 'FERAL' })).toEqual({
      strains: ['VOLT'],
      strength: 0,
    });
    expect(
      sanitizeLineage({
        strains: ['VOLT', 'VOLT', 'FERAL'],
        strength: 1,
        primary: 'VOLT',
      })
    ).toEqual({
      strains: ['VOLT', 'FERAL'],
      strength: 1,
      primary: 'VOLT',
    });
    expect(
      sanitizeLineage({ strains: ['VOLT', 'VOLT'], strength: 1, primary: 'VOLT' })
    ).toEqual({ strains: ['VOLT'], strength: 1 });
  });
});

describe('constants', () => {
  it('dynasty signature strains + reroll sink', () => {
    expect(DYNASTY_STRAINS.PRIMAL).toBe('FERAL');
    expect(DYNASTY_STRAINS.CYBER).toBe('VOLT');
    expect(DYNASTY_STRAINS.COSMIC).toBe('FLUX');
    expect(LINEAGE_REROLL_COST).toBe(150);
  });
});

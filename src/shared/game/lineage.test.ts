/**
 * Lineage - starting strain points (the collection -> run bridge),
 * strength caps, breeding preview enumeration.
 */

import {
  DYNASTY_STRAINS,
  REROLL_TOKEN_DNA_VALUE,
  clampLineageStrength,
  defaultLineageDraft,
  lineageDraftOptions,
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

// WP-1.05: `combineLineages` (which returned weighted `chance` outcomes) is
// DELETED along with the coin flip it described. These tests assert its
// replacement: a deterministic, fully enumerated set of CHOICES whose
// strength is already clamped, so the preview equals the outcome.
describe('lineageDraftOptions (the deterministic draft)', () => {
  it('purebred: the parents agree -> one option at strength max + 1', () => {
    expect(
      lineageDraftOptions(
        { lineage: { strains: ['FERAL'], strength: 1 }, dynasty: 'PRIMAL' },
        { lineage: { strains: ['FERAL'], strength: 0 }, dynasty: 'PRIMAL' },
        'epic',
        2
      )
    ).toEqual([{ kind: 'purebred', strains: ['FERAL'], strength: 2 }]);
  });

  it('same dynasty, different strains -> one option per parent line', () => {
    const options = lineageDraftOptions(
      { lineage: { strains: ['FERAL'], strength: 1 }, dynasty: 'PRIMAL' },
      { lineage: { strains: ['AURUM'], strength: 2 }, dynasty: 'PRIMAL' },
      'epic',
      2
    );
    expect(options).toEqual([
      { kind: 'parent1', strains: ['FERAL'], strength: 2 },
      { kind: 'parent2', strains: ['AURUM'], strength: 2 },
    ]);
  });

  it('cross-dynasty -> the dual line first, then each pure line', () => {
    const options = lineageDraftOptions(
      { lineage: { strains: ['VOLT'], strength: 1 }, dynasty: 'CYBER' },
      { lineage: { strains: ['FERAL'], strength: 0 }, dynasty: 'PRIMAL' },
      'epic',
      2
    );
    expect(options.map((o) => o.kind)).toEqual(['dual', 'parent1', 'parent2']);
    expect(options[0].strains).toEqual(['VOLT', 'FERAL']);
  });

  it('clamps strength by the CHILD rarity and generation, not by intent', () => {
    // common caps strength at 0; Gen3 prestige adds 1 back.
    expect(
      lineageDraftOptions(
        { lineage: { strains: ['FERAL'], strength: 2 }, dynasty: 'PRIMAL' },
        { lineage: { strains: ['FERAL'], strength: 2 }, dynasty: 'PRIMAL' },
        'common',
        2
      )[0].strength
    ).toBe(0);
    expect(
      lineageDraftOptions(
        { lineage: { strains: ['FERAL'], strength: 2 }, dynasty: 'PRIMAL' },
        { lineage: { strains: ['FERAL'], strength: 2 }, dynasty: 'PRIMAL' },
        'common',
        3
      )[0].strength
    ).toBe(1);
  });

  it('a lineless parent contributes nothing; two of them offer no options', () => {
    expect(
      lineageDraftOptions(
        { lineage: null, dynasty: 'PRIMAL' },
        { lineage: { strains: ['AURUM'], strength: 1 }, dynasty: 'PRIMAL' },
        'rare',
        2
      )
    ).toEqual([{ kind: 'parent2', strains: ['AURUM'], strength: 1 }]);
    expect(
      lineageDraftOptions(
        { lineage: null, dynasty: 'PRIMAL' },
        { lineage: null, dynasty: 'PRIMAL' },
        'rare',
        2
      )
    ).toEqual([]);
  });

  it('is deterministic across repeated calls', () => {
    const call = () =>
      lineageDraftOptions(
        { lineage: { strains: ['VOLT'], strength: 1 }, dynasty: 'CYBER' },
        { lineage: { strains: ['FERAL'], strength: 2 }, dynasty: 'PRIMAL' },
        'legendary',
        4
      );
    const first = call();
    for (let i = 0; i < 25; i += 1) expect(call()).toEqual(first);
  });

  it('the default is always the first option', () => {
    const options = lineageDraftOptions(
      { lineage: { strains: ['VOLT'], strength: 1 }, dynasty: 'CYBER' },
      { lineage: { strains: ['FERAL'], strength: 0 }, dynasty: 'PRIMAL' },
      'epic',
      2
    );
    expect(defaultLineageDraft(options)).toBe(options[0]);
    expect(defaultLineageDraft([])).toBeNull();
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
  it('dynasty signature strains', () => {
    expect(DYNASTY_STRAINS.PRIMAL).toBe('FERAL');
    expect(DYNASTY_STRAINS.CYBER).toBe('VOLT');
    expect(DYNASTY_STRAINS.COSMIC).toBe('FLUX');
  });

  it('a retired reroll token converts at its old price of 150 DNA', () => {
    // LINEAGE_REROLL_COST is deleted with the reroll it priced; the same
    // number survives as the conversion rate migration 047 applies (§8.2).
    expect(REROLL_TOKEN_DNA_VALUE).toBe(150);
  });
});

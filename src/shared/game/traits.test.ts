/**
 * Tests for the Launch Eight traits (Design v2 Phase 3A, section 6):
 * definitions, slot rule, sanitization, per-food [E] math, and the
 * additive outcome deltas (incl. the specced Gambler+Patient x1.45).
 */

import { describe, it, expect } from '@jest/globals';
import {
  GEN3_SLOT_UNLOCK,
  MAX_TRAIT_SLOTS,
  TRAITS,
  TRAIT_ECONOMICS,
  TRAIT_PHYSICS,
  TRAIT_POOL,
  getTraitSlots,
  isTraitId,
  sanitizeTraits,
  traitFoodValueModifier,
  traitOutcomeDeltas,
  type TraitId,
} from './traits';

describe('Trait definitions (section 6.2)', () => {
  it('defines exactly the Launch Eight, in table order', () => {
    expect(TRAIT_POOL).toEqual([
      'scavenger',
      'gambler',
      'ascetic',
      'iron_scales',
      'magnetism',
      'sprinter',
      'patient',
      'hoarder',
    ]);
    expect(Object.keys(TRAITS)).toHaveLength(8);
  });

  it('every trait has a name, an effect, and a tradeoff', () => {
    for (const id of TRAIT_POOL) {
      const def = TRAITS[id];
      expect(def.id).toBe(id);
      expect(def.name.length).toBeGreaterThan(0);
      expect(def.effect.length).toBeGreaterThan(0);
      expect(def.cost.length).toBeGreaterThan(0);
    }
  });

  it('isTraitId accepts pool ids and rejects everything else', () => {
    for (const id of TRAIT_POOL) expect(isTraitId(id)).toBe(true);
    expect(isTraitId('gold_trail')).toBe(false); // mutation, not a trait
    expect(isTraitId('SCAVENGER')).toBe(false);
    expect(isTraitId(42)).toBe(false);
    expect(isTraitId(null)).toBe(false);
  });
});

describe('getTraitSlots (section 6.1)', () => {
  it('gives commons and uncommons 1 slot, rare and above 2', () => {
    expect(getTraitSlots('common', 1)).toBe(1);
    expect(getTraitSlots('uncommon', 1)).toBe(1);
    expect(getTraitSlots('rare', 1)).toBe(2);
    expect(getTraitSlots('epic', 1)).toBe(2);
    expect(getTraitSlots('legendary', 1)).toBe(2);
  });

  it('unlocks the 2nd slot at Gen 3 regardless of rarity', () => {
    expect(getTraitSlots('common', GEN3_SLOT_UNLOCK - 1)).toBe(1);
    expect(getTraitSlots('common', GEN3_SLOT_UNLOCK)).toBe(2);
    expect(getTraitSlots('common', 50)).toBe(2);
  });

  it('hard-caps at 2 (a Gen 3 legendary is still 2)', () => {
    expect(getTraitSlots('legendary', 50)).toBe(MAX_TRAIT_SLOTS);
  });

  it('is case-insensitive and defensive about unknown rarities', () => {
    expect(getTraitSlots('RARE', 1)).toBe(2);
    expect(getTraitSlots('mythic', 1)).toBe(1);
  });
});

describe('sanitizeTraits', () => {
  it('passes through a valid slot-ordered list', () => {
    expect(sanitizeTraits(['sprinter', 'hoarder'])).toEqual([
      'sprinter',
      'hoarder',
    ]);
  });

  it('drops unknown ids, duplicates, and non-arrays', () => {
    expect(sanitizeTraits(['sprinter', 'nope', 'sprinter', 'patient'])).toEqual(
      ['sprinter', 'patient']
    );
    expect(sanitizeTraits('sprinter')).toEqual([]);
    expect(sanitizeTraits(null)).toEqual([]);
    expect(sanitizeTraits(undefined)).toEqual([]);
  });

  it('caps at the slot maximum', () => {
    expect(
      sanitizeTraits(['sprinter', 'patient', 'hoarder', 'gambler'])
    ).toEqual(['sprinter', 'patient']);
  });
});

describe('traitFoodValueModifier (section 6.2 [E] effects)', () => {
  it('no traits = x1 for every food', () => {
    for (const n of [1, 10, 50, 100]) {
      expect(traitFoodValueModifier([], n)).toBe(1);
    }
  });

  it('Scavenger: first 15 foods x1.3, foods 16-50 neutral, 51+ x0.9', () => {
    expect(traitFoodValueModifier(['scavenger'], 1)).toBe(1.3);
    expect(traitFoodValueModifier(['scavenger'], 15)).toBe(1.3);
    expect(traitFoodValueModifier(['scavenger'], 16)).toBe(1);
    expect(traitFoodValueModifier(['scavenger'], 50)).toBe(1);
    expect(traitFoodValueModifier(['scavenger'], 51)).toBe(0.9);
    expect(traitFoodValueModifier(['scavenger'], 200)).toBe(0.9);
  });

  it('Sprinter: first 10 foods x1.2, foods 11-50 neutral, 51+ x0.9', () => {
    expect(traitFoodValueModifier(['sprinter'], 1)).toBe(1.2);
    expect(traitFoodValueModifier(['sprinter'], 10)).toBe(1.2);
    expect(traitFoodValueModifier(['sprinter'], 11)).toBe(1);
    expect(traitFoodValueModifier(['sprinter'], 50)).toBe(1);
    expect(traitFoodValueModifier(['sprinter'], 51)).toBe(0.9);
  });

  it('Ascetic: x1.4 on every food', () => {
    for (const n of [1, 25, 100]) {
      expect(traitFoodValueModifier(['ascetic'], n)).toBe(1.4);
    }
  });

  it('Iron Scales: x0.9 on every food (the survival save is engine-side)', () => {
    for (const n of [1, 25, 100]) {
      expect(traitFoodValueModifier(['iron_scales'], n)).toBe(0.9);
    }
  });

  it('outcome-only and physical traits never touch food value', () => {
    for (const trait of ['gambler', 'patient', 'hoarder', 'magnetism'] as TraitId[]) {
      for (const n of [1, 30, 60]) {
        expect(traitFoodValueModifier([trait], n)).toBe(1);
      }
    }
  });

  it('two traits multiply (Scavenger + Sprinter early window)', () => {
    expect(traitFoodValueModifier(['scavenger', 'sprinter'], 5)).toBeCloseTo(
      1.3 * 1.2,
      10
    );
    // Both late penalties stack multiplicatively after food 50
    expect(traitFoodValueModifier(['scavenger', 'sprinter'], 51)).toBeCloseTo(
      0.9 * 0.9,
      10
    );
  });
});

describe('traitOutcomeDeltas (section 6.2 outcome effects)', () => {
  it('Gambler: bank 1.25 -> 1.35, salvage 0.60 -> 0.45', () => {
    const { bank, death } = traitOutcomeDeltas(['gambler']);
    expect(1.25 + bank).toBeCloseTo(1.35, 10);
    expect(0.6 + death).toBeCloseTo(0.45, 10);
  });

  it('Patient: bank 1.25 -> 1.35, salvage untouched', () => {
    const { bank, death } = traitOutcomeDeltas(['patient']);
    expect(1.25 + bank).toBeCloseTo(1.35, 10);
    expect(death).toBe(0);
  });

  it('Hoarder: salvage 0.60 -> 0.70, bank 1.25 -> 1.15', () => {
    const { bank, death } = traitOutcomeDeltas(['hoarder']);
    expect(1.25 + bank).toBeCloseTo(1.15, 10);
    expect(0.6 + death).toBeCloseTo(0.7, 10);
  });

  it('Gambler + Patient stacks to x1.45 banked (the specced number)', () => {
    const { bank } = traitOutcomeDeltas(['gambler', 'patient']);
    expect(1.25 + bank).toBeCloseTo(1.45, 10);
  });

  it('Gambler + Hoarder cancels on bank, nets 0.55 salvage', () => {
    const { bank, death } = traitOutcomeDeltas(['gambler', 'hoarder']);
    expect(1.25 + bank).toBeCloseTo(1.25, 10);
    expect(0.6 + death).toBeCloseTo(0.55, 10);
  });

  it('food-value and physical traits contribute nothing', () => {
    expect(
      traitOutcomeDeltas(['scavenger', 'sprinter', 'ascetic', 'iron_scales', 'magnetism'])
    ).toEqual({ bank: 0, death: 0 });
  });
});

describe('tuning constants', () => {
  it('physical constants match the section 6.2 table', () => {
    expect(TRAIT_PHYSICS.magnetismRadius).toBe(1);
    expect(TRAIT_PHYSICS.magnetismPortalIntervalPenalty).toBe(2);
    expect(TRAIT_PHYSICS.patientMutationIntervalMultiplier).toBe(2);
    expect(TRAIT_PHYSICS.ironScalesBounceCells).toBe(1);
  });

  it('economic constants match the section 6.2 table', () => {
    expect(TRAIT_ECONOMICS.scavengerEarlyFoods).toBe(15);
    expect(TRAIT_ECONOMICS.scavengerEarlyBonus).toBe(1.3);
    expect(TRAIT_ECONOMICS.sprinterEarlyFoods).toBe(10);
    expect(TRAIT_ECONOMICS.sprinterEarlyBonus).toBe(1.2);
    expect(TRAIT_ECONOMICS.asceticFoodBonus).toBe(1.4);
    expect(TRAIT_ECONOMICS.ironScalesFoodPenalty).toBe(0.9);
  });
});

/**
 * Breeding Preview Helpers Tests
 * Mirrors the breed_snakes RPC formulas:
 *   cost = 200 + floor((gen1 + gen2) / 2) * 100
 *   offspring generation = max(gen1, gen2) + 1, capped at 50
 */

import {
  calculateBreedingCost,
  calculateOffspringGeneration,
  isGenerationCapReached,
  validateBreedingPair,
  MAX_GENERATION,
  type BreedingParentInfo,
} from './preview';

describe('calculateBreedingCost', () => {
  it('costs 300 for two Gen 1 parents', () => {
    expect(calculateBreedingCost(1, 1)).toBe(300);
  });

  it('costs 400 for two Gen 2 parents', () => {
    expect(calculateBreedingCost(2, 2)).toBe(400);
  });

  it('costs 600 for Gen 3 + Gen 5 parents', () => {
    expect(calculateBreedingCost(3, 5)).toBe(600);
  });

  it('uses integer division on the generation average', () => {
    // floor((1 + 2) / 2) = 1 -> 300
    expect(calculateBreedingCost(1, 2)).toBe(300);
    // floor((2 + 5) / 2) = 3 -> 500
    expect(calculateBreedingCost(2, 5)).toBe(500);
  });

  it('is symmetric in parent order', () => {
    expect(calculateBreedingCost(3, 5)).toBe(calculateBreedingCost(5, 3));
  });
});

describe('calculateOffspringGeneration', () => {
  it('is one above the highest parent generation', () => {
    expect(calculateOffspringGeneration(1, 1)).toBe(2);
    expect(calculateOffspringGeneration(2, 5)).toBe(6);
    expect(calculateOffspringGeneration(7, 3)).toBe(8);
  });
});

describe('isGenerationCapReached', () => {
  it('caps at generation 50', () => {
    expect(MAX_GENERATION).toBe(50);
    // 49 + 1 = 50 is still allowed
    expect(isGenerationCapReached(49, 1)).toBe(false);
    // 50 + 1 = 51 exceeds the cap
    expect(isGenerationCapReached(50, 49)).toBe(true);
    expect(isGenerationCapReached(50, 50)).toBe(true);
  });
});

describe('validateBreedingPair', () => {
  const parent = (
    id: string,
    generation = 1,
    dynastyId: string | null = 'dyn-cyber'
  ): BreedingParentInfo => ({ id, generation, dynastyId });

  it('reports missing_parent until both parents are chosen', () => {
    expect(validateBreedingPair(null, null, 1000)).toEqual({
      valid: false,
      reason: 'missing_parent',
      cost: null,
      offspringGeneration: null,
    });
    expect(validateBreedingPair(parent('a'), null, 1000).reason).toBe('missing_parent');
  });

  it('rejects breeding a snake with itself', () => {
    const result = validateBreedingPair(parent('a'), parent('a'), 1000);
    expect(result.valid).toBe(false);
    expect(result.reason).toBe('same_snake');
  });

  it('rejects cross-dynasty parents', () => {
    const result = validateBreedingPair(
      parent('a', 1, 'dyn-cyber'),
      parent('b', 1, 'dyn-primal'),
      1000
    );
    expect(result.valid).toBe(false);
    expect(result.reason).toBe('different_dynasty');
  });

  it('rejects parents with unknown dynasty', () => {
    const result = validateBreedingPair(
      parent('a', 1, null),
      parent('b', 1, 'dyn-cyber'),
      1000
    );
    expect(result.reason).toBe('different_dynasty');
  });

  it('rejects when the generation cap would be exceeded', () => {
    const result = validateBreedingPair(parent('a', 50), parent('b', 12), 100000);
    expect(result.valid).toBe(false);
    expect(result.reason).toBe('generation_cap');
  });

  it('rejects when DNA balance is below cost', () => {
    const result = validateBreedingPair(parent('a'), parent('b'), 299);
    expect(result.valid).toBe(false);
    expect(result.reason).toBe('insufficient_dna');
    expect(result.cost).toBe(300);
  });

  it('accepts a valid, affordable same-dynasty pair', () => {
    const result = validateBreedingPair(parent('a', 2), parent('b', 5), 500);
    expect(result).toEqual({
      valid: true,
      reason: null,
      cost: 500,
      offspringGeneration: 6,
    });
  });
});

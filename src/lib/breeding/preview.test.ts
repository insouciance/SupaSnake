/**
 * Breeding Preview Helpers Tests
 * Mirrors the breed_snakes RPC formulas (migration 047):
 *   cost = (200 + floor((gen1 + gen2) / 2) * 100) * 1.25^max(0, childGen - 3)
 *   offspring generation = max(gen1, gen2) + 1 — UNCAPPED (§8.2 Ascendance)
 *
 * WP-1.05 rewrote the generation-cap tests: MAX_GENERATION and
 * isGenerationCapReached are DELETED, because Gen4+ is Ascendance and the
 * Gen3/Gen50 walls are gone. The cost expectations below now carry the
 * steepening factor for any child past Gen3.
 */

import {
  calculateBreedingCost,
  calculateOffspringGeneration,
  validateBreedingPair,
  type BreedingParentInfo,
} from './preview';

describe('calculateBreedingCost', () => {
  it('costs 300 for two Gen 1 parents', () => {
    expect(calculateBreedingCost(1, 1)).toBe(300);
  });

  it('costs 400 for two Gen 2 parents', () => {
    expect(calculateBreedingCost(2, 2)).toBe(400);
  });

  it('leaves every Gen1-3 child at exactly its shipped price', () => {
    // The steepening exponent is 0 below Gen4, so nobody's existing plan
    // got more expensive (Rule 6).
    expect(calculateBreedingCost(1, 1)).toBe(300); // child Gen2
    expect(calculateBreedingCost(1, 2)).toBe(300); // child Gen3
    expect(calculateBreedingCost(2, 2)).toBe(400); // child Gen3
  });

  it('steepens by 1.25 per generation past Gen3', () => {
    // Gen3 x Gen5 -> child Gen6, base 600, 1.25^3 = 1.953125
    expect(calculateBreedingCost(3, 5)).toBe(Math.ceil(600 * 1.25 ** 3));
    // Gen3 x Gen3 -> child Gen4, base 500, one step
    expect(calculateBreedingCost(3, 3)).toBe(Math.ceil(500 * 1.25));
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

describe('generations are uncapped (§8.2 Ascendance)', () => {
  it('keeps counting past the deleted Gen50 wall', () => {
    expect(calculateOffspringGeneration(50, 50)).toBe(51);
    expect(calculateOffspringGeneration(120, 3)).toBe(121);
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

  it('accepts cross-dynasty parents only when the Genome gate is enabled', () => {
    const result = validateBreedingPair(
      parent('a', 1, 'dyn-cyber'),
      parent('b', 1, 'dyn-primal'),
      1000,
      true
    );
    expect(result).toEqual({
      valid: true,
      reason: null,
      cost: 300,
      offspringGeneration: 2,
    });
  });

  it('rejects parents with unknown dynasty', () => {
    const result = validateBreedingPair(
      parent('a', 1, null),
      parent('b', 1, 'dyn-cyber'),
      1000
    );
    expect(result.reason).toBe('different_dynasty');
  });

  it('does not refuse a high generation - Ascendance is uncapped', () => {
    const result = validateBreedingPair(
      parent('a', 50),
      parent('b', 12),
      Number.MAX_SAFE_INTEGER
    );
    expect(result.valid).toBe(true);
    expect(result.reason).toBeNull();
    expect(result.offspringGeneration).toBe(51);
  });

  it('rejects when DNA balance is below cost', () => {
    const result = validateBreedingPair(parent('a'), parent('b'), 299);
    expect(result.valid).toBe(false);
    expect(result.reason).toBe('insufficient_dna');
    expect(result.cost).toBe(300);
  });

  it('accepts a valid, affordable same-dynasty pair', () => {
    // Child Gen6: base 500, steepened by 1.25^3.
    const expected = Math.ceil(500 * 1.25 ** 3);
    const result = validateBreedingPair(parent('a', 2), parent('b', 5), expected);
    expect(result).toEqual({
      valid: true,
      reason: null,
      cost: expected,
      offspringGeneration: 6,
    });
  });
});

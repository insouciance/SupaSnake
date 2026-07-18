/**
 * Validator tests for traits (Design v2 Phase 3A, section 6):
 * - traits enter the recompute ONLY via the snake-row parameter; nothing
 *   in the client payload can inject them
 * - Ascetic drops (and flags) impossible mutation claims
 * - Patient tightens the mutation cadence bound to 30k
 * - outcome multipliers (Gambler / Patient / Hoarder) shape the payout
 */

import { describe, it, expect } from '@jest/globals';
import { validateGameResult, type GameResultInput } from './gameValidator';
import { computeRunTotals, applyOutcomeWithMutations } from '@/shared/game/rulesets';
import type { TraitId } from '@/shared/game/traits';

function baseInput(overrides: Partial<GameResultInput> = {}): GameResultInput {
  const foodCount = (overrides.food_count as number | undefined) ?? 60;
  const { rawDna, score } = computeRunTotals('PRIMAL', foodCount);
  return {
    food_count: foodCount,
    extracted: true,
    score,
    dna_earned: rawDna,
    duration_seconds: 120,
    died: false,
    victory: false,
    ...overrides,
  };
}

const startedAt = () => new Date(Date.now() - 120_000);

describe('traits come from the snake row, never the payload', () => {
  it('a payload "traits" field is ignored (no injection vector)', () => {
    const input = baseInput() as GameResultInput & { traits: TraitId[] };
    input.traits = ['ascetic']; // hostile client asserting a x1.4 snake
    const result = validateGameResult(input, startedAt(), 'PRIMAL');
    const { rawDna } = computeRunTotals('PRIMAL', 60);
    // Paid exactly the traitless recompute - the field did nothing
    expect(result.adjustedDna).toBe(
      applyOutcomeWithMutations(rawDna, true, [], false, [])
    );
    expect(result.valid).toBe(true);
  });

  it('snake-row traits change the payout deterministically', () => {
    const traits: TraitId[] = ['ascetic'];
    const { rawDna } = computeRunTotals('PRIMAL', 60, [], null, traits);
    const input = baseInput({ dna_earned: rawDna });
    const result = validateGameResult(input, startedAt(), 'PRIMAL', traits);
    expect(result.adjustedDna).toBe(
      applyOutcomeWithMutations(rawDna, true, [], false, traits)
    );
    expect(result.valid).toBe(true);
  });

  it('honest traited claims validate clean on every dynasty', () => {
    const traits: TraitId[] = ['scavenger', 'iron_scales'];
    for (const dynasty of ['PRIMAL', 'CYBER', 'COSMIC'] as const) {
      const { rawDna, score } = computeRunTotals(dynasty, 45, [], null, traits);
      const result = validateGameResult(
        baseInput({ food_count: 45, dna_earned: rawDna, score }),
        startedAt(),
        dynasty,
        traits
      );
      expect(result.valid).toBe(true);
      expect(result.adjustedDna).toBe(
        applyOutcomeWithMutations(rawDna, true, [], false, traits)
      );
    }
  });

  it('a claim computed WITHOUT the trait mismatch-flags but still pays the recompute', () => {
    const traits: TraitId[] = ['ascetic'];
    const input = baseInput(); // claims the traitless total
    const result = validateGameResult(input, startedAt(), 'PRIMAL', traits);
    const { rawDna } = computeRunTotals('PRIMAL', 60, [], null, traits);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.startsWith('DNA_MISMATCH'))).toBe(true);
    expect(result.adjustedDna).toBe(
      applyOutcomeWithMutations(rawDna, true, [], false, traits)
    );
  });
});

describe('Ascetic x mutations (mutation food never spawns)', () => {
  it('drops all mutation picks and flags TRAIT_CONFLICT', () => {
    const traits: TraitId[] = ['ascetic'];
    const { rawDna } = computeRunTotals('PRIMAL', 60, [], null, traits);
    const result = validateGameResult(
      baseInput({
        dna_earned: rawDna,
        mutations: [{ id: 'overgrowth', atFood: 20 }],
      }),
      startedAt(),
      'PRIMAL',
      traits
    );
    expect(result.mutations).toEqual([]);
    expect(result.errors.some((e) => e.startsWith('TRAIT_CONFLICT'))).toBe(true);
    // Payout = Ascetic recompute with ZERO mutations - the claim cannot
    // smuggle mutation economics onto a build-less snake
    expect(result.adjustedDna).toBe(
      applyOutcomeWithMutations(rawDna, true, [], false, traits)
    );
  });

  it('an Ascetic run without mutation claims is clean', () => {
    const traits: TraitId[] = ['ascetic'];
    const { rawDna } = computeRunTotals('PRIMAL', 60, [], null, traits);
    const result = validateGameResult(
      baseInput({ dna_earned: rawDna }),
      startedAt(),
      'PRIMAL',
      traits
    );
    expect(result.valid).toBe(true);
  });
});

describe('Patient x mutation cadence (interval doubled -> bound 30k)', () => {
  it('accepts a pick that respects the doubled cadence', () => {
    const traits: TraitId[] = ['patient'];
    const mutations = [{ id: 'overgrowth', atFood: 30 }];
    const { rawDna } = computeRunTotals(
      'PRIMAL',
      60,
      [{ id: 'overgrowth', atFood: 30 }],
      null,
      traits
    );
    const result = validateGameResult(
      baseInput({ dna_earned: rawDna, mutations }),
      startedAt(),
      'PRIMAL',
      traits
    );
    expect(result.valid).toBe(true);
    expect(result.mutations).toHaveLength(1);
  });

  it('rejects a pick at food 20 that a normal snake could have', () => {
    const traits: TraitId[] = ['patient'];
    const result = validateGameResult(
      baseInput({ mutations: [{ id: 'overgrowth', atFood: 20 }] }),
      startedAt(),
      'PRIMAL',
      traits
    );
    expect(result.mutations).toEqual([]);
    expect(result.errors.some((e) => e.startsWith('MUTATION_BOUND'))).toBe(true);
  });

  it('caps the pick COUNT at floor(foods/30)', () => {
    const traits: TraitId[] = ['patient'];
    const result = validateGameResult(
      baseInput({
        food_count: 65,
        mutations: [
          { id: 'overgrowth', atFood: 30 },
          { id: 'gold_trail', atFood: 60 },
          { id: 'splitter', atFood: 62 },
        ],
      }),
      startedAt(),
      'PRIMAL',
      traits
    );
    // floor(65/30) = 2 picks max under Patient
    expect(result.mutations.length).toBeLessThanOrEqual(2);
    expect(result.errors.some((e) => e.startsWith('MUTATION_BOUND'))).toBe(true);
  });
});

describe('trait outcome multipliers in the payout', () => {
  it.each([
    ['gambler', true, 1.35],
    ['gambler', false, 0.45],
    ['patient', true, 1.35],
    ['hoarder', true, 1.15],
    ['hoarder', false, 0.7],
  ] as [TraitId, boolean, number][])(
    '%s extracted=%s pays floor(raw x %d)',
    (trait, extracted, multiplier) => {
      const { rawDna, score } = computeRunTotals('PRIMAL', 40);
      const result = validateGameResult(
        baseInput({
          food_count: 40,
          dna_earned: rawDna,
          score,
          extracted,
          died: !extracted,
        }),
        startedAt(),
        'PRIMAL',
        [trait]
      );
      expect(result.adjustedDna).toBe(Math.floor(rawDna * multiplier));
    }
  );

  it('Gambler + Patient banked run pays floor(raw x 1.45)', () => {
    const { rawDna, score } = computeRunTotals('PRIMAL', 40);
    const result = validateGameResult(
      baseInput({ food_count: 40, dna_earned: rawDna, score }),
      startedAt(),
      'PRIMAL',
      ['gambler', 'patient']
    );
    expect(result.adjustedDna).toBe(Math.floor(rawDna * 1.45));
  });
});

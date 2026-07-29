/** Validator parity for the universal 4-8-food Genome cadence. */

import { describe, expect, it } from '@jest/globals';
import {
  validateGameResult,
  type GameResultInput,
  type GenomeValidationContext,
} from './gameValidator';
import { computeRunTotals } from '@/shared/game/rulesets';
import { GENE_POOL } from '@/shared/game/genes';
import { GENE_OFFER_CADENCE } from '@/shared/game/geneCadence';
import type { GrowthProfileId } from '@/shared/game/growth';

const started = () => new Date(Date.now() - 300_000);

const input = (foods: readonly number[] = [4, 8, 12, 16]): GameResultInput => ({
  food_count: 60,
  extracted: true,
  score: computeRunTotals('PRIMAL', 60).score,
  dna_earned: computeRunTotals('PRIMAL', 60).rawDna,
  duration_seconds: 300,
  died: false,
  victory: false,
  mutations: [
    { id: 'gold_trail', atFood: foods[0] },
    { id: 'compound_interest', atFood: foods[1] },
    { id: 'tithe', atFood: foods[2] },
    { id: 'loan_shark', atFood: foods[3] },
  ],
});

const ctx = (
  over: Partial<GenomeValidationContext> = {}
): GenomeValidationContext => ({
  heirloom: {},
  genePool: [...GENE_POOL],
  prevRunDied: false,
  tierCap: 3,
  ...over,
});

const geneBoundErrors = (errors: string[]) =>
  errors.filter(
    (error) =>
      error.startsWith('GENE_BOUND') || error.startsWith('MUTATION_BOUND')
  );

describe('the validator shares the engine cadence floor', () => {
  it.each([
    'baseline',
    'dynasty',
    'tuned',
    'aggressive',
  ] as GrowthProfileId[])('%s accepts legal four-food spacing', (growthProfileId) => {
    const result = validateGameResult(
      input(),
      started(),
      'PRIMAL',
      [],
      null,
      null,
      ctx({ growthProfileId })
    );
    expect(geneBoundErrors(result.errors)).toEqual([]);
    expect(result.genome?.picks).toHaveLength(4);
  });

  it('still rejects an offer claimed before the four-food floor', () => {
    const result = validateGameResult(
      input([3, 8, 12, 16]),
      started(),
      'PRIMAL',
      [],
      null,
      null,
      ctx({ growthProfileId: 'dynasty' })
    );
    expect(geneBoundErrors(result.errors).length).toBeGreaterThan(0);
    expect(result.genome?.picks).toHaveLength(3);
    expect(result.genome?.picks[0]?.atFood).toBe(8);
  });

  it('doubles the same bound for Patient', () => {
    const tooFast = validateGameResult(
      input(),
      started(),
      'PRIMAL',
      ['patient'],
      null,
      null,
      ctx({ growthProfileId: 'dynasty' })
    );
    expect(geneBoundErrors(tooFast.errors).length).toBeGreaterThan(0);

    const legal = validateGameResult(
      input([8, 16, 24, 32]),
      started(),
      'PRIMAL',
      ['patient'],
      null,
      null,
      ctx({ growthProfileId: 'dynasty' })
    );
    expect(geneBoundErrors(legal.errors)).toEqual([]);
    expect(legal.genome?.picks).toHaveLength(4);
  });

  it('uses the same floor on unstamped and legacy mutation paths', () => {
    expect(GENE_OFFER_CADENCE.minFoodsPerPick).toBe(4);
    const legacy: GameResultInput = {
      ...input(),
      mutations: [
        { id: 'gold_trail', atFood: 4 },
        { id: 'overgrowth', atFood: 8 },
        { id: 'wall_rush', atFood: 12 },
        { id: 'compound_interest', atFood: 16 },
      ],
    };
    const result = validateGameResult(
      legacy,
      started(),
      'PRIMAL',
      [],
      null,
      null,
      null
    );
    expect(geneBoundErrors(result.errors)).toEqual([]);
    expect(result.mutations).toHaveLength(4);
  });
});

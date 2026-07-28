/**
 * The cadence bound follows the stamped growth profile (WP-3.05).
 *
 * WHY THIS IS A SETTLEMENT-SAFETY TEST, NOT A TUNING TEST.
 *
 * The engine offers genes every `offerIntervalBase +/- jitter` foods and the
 * validator rejects picks that arrive faster than `minFoodsPerPick`. Those are
 * two halves of ONE cadence. While the validator's half was a hardcoded 15, a
 * run stamped `tuned` was offered a gene every 10 +/- 2 foods by the server's
 * own engine and then flagged by the server's own validator for accepting it.
 *
 * That is the WP-2.05 defect class exactly: the player is punished for the
 * server's disagreement with itself. So the assertion below is not "tuned
 * allows more picks" - it is "a run validates under the cadence it was told to
 * play", with the baseline case proving the bound still bites.
 */

import { describe, it, expect } from '@jest/globals';
import {
  validateGameResult,
  type GameResultInput,
  type GenomeValidationContext,
} from './gameValidator';
import { computeRunTotals } from '@/shared/game/rulesets';
import { GENE_POOL } from '@/shared/game/genes';
import { GROWTH_PROFILES } from '@/shared/game/growth';

const started = () => new Date(Date.now() - 300_000);

const input = (): GameResultInput => ({
  food_count: 60,
  extracted: true,
  score: computeRunTotals('PRIMAL', 60).score,
  dna_earned: computeRunTotals('PRIMAL', 60).rawDna,
  duration_seconds: 300,
  died: false,
  victory: false,
  // Four picks on the TUNED cadence: the first at food 10, then every 10.
  // Under baseline's 15-food bound the first pick alone is impossible.
  mutations: [
    { id: 'gold_trail', atFood: 10 },
    { id: 'compound_interest', atFood: 20 },
    { id: 'tithe', atFood: 30 },
    { id: 'loan_shark', atFood: 40 },
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
  errors.filter((e) => e.startsWith('GENE_BOUND') || e.startsWith('MUTATION_BOUND'));

describe('the offer cadence bound reads the run\'s stamped profile', () => {
  it('a tuned run keeps picks taken at the tuned cadence', () => {
    const result = validateGameResult(
      input(),
      started(),
      'PRIMAL',
      [],
      null,
      null,
      ctx({ growthProfileId: 'tuned' })
    );
    expect(geneBoundErrors(result.errors)).toEqual([]);
    expect(result.genome?.picks).toHaveLength(4);
  });

  it('the SAME picks are bounded on baseline - the check still bites', () => {
    // Guards against "fixing" the flag by removing the bound. A 10-food
    // cadence is genuinely impossible on the shipped curve.
    const result = validateGameResult(
      input(),
      started(),
      'PRIMAL',
      [],
      null,
      null,
      ctx({ growthProfileId: 'baseline' })
    );
    expect(result.genome!.picks.length).toBeLessThan(4);
  });

  it('an unstamped run is bounded as baseline', () => {
    const result = validateGameResult(
      input(),
      started(),
      'PRIMAL',
      [],
      null,
      null,
      ctx()
    );
    expect(result.genome!.picks.length).toBeLessThan(4);
  });

  it('a run with NO genome context still reads the stamp', () => {
    // The hole this closes: the legacy path took the profile exclusively off
    // `genomeCtx`, so a non-genome session stamped `tuned` validated against
    // baseline - on the cadence bound AND on the food-rate bound.
    // The legacy path sanitizes against MUTATION_POOL, so this case uses four
    // legacy mutations rather than the genes above. The cadence is the same.
    const legacy = (): GameResultInput => ({
      ...input(),
      mutations: [
        { id: 'gold_trail', atFood: 10 },
        { id: 'overgrowth', atFood: 20 },
        { id: 'wall_rush', atFood: 30 },
        { id: 'compound_interest', atFood: 40 },
      ],
    });
    const withStamp = validateGameResult(
      legacy(),
      started(),
      'PRIMAL',
      [],
      null,
      null,
      null,
      'tuned'
    );
    const without = validateGameResult(
      legacy(),
      started(),
      'PRIMAL',
      [],
      null,
      null,
      null
    );
    expect(withStamp.mutations).toHaveLength(4);
    expect(without.mutations.length).toBeLessThan(4);
  });

  it('genomeCtx wins over the loose stamp, because the fold uses it', () => {
    // Two sources for one fact is a smell; this pins which one is authority.
    // The exact recompute folds with genomeCtx's copy, so a bound derived
    // from the other one could disagree with the payout it is bounding.
    const result = validateGameResult(
      input(),
      started(),
      'PRIMAL',
      [],
      null,
      null,
      ctx({ growthProfileId: 'baseline' }),
      'tuned'
    );
    expect(result.genome!.picks.length).toBeLessThan(4);
  });
});

describe('the validator fallback matches the shipped curve', () => {
  it('an unstamped run is bounded at exactly baseline.minFoodsPerPick', () => {
    // The validator keeps a literal 15 as its no-stamp fallback. If someone
    // retunes baseline and not the constant, every unstamped run silently
    // validates on a cadence the engine never played.
    expect(GROWTH_PROFILES.baseline.minFoodsPerPick).toBe(15);
  });
});

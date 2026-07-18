/**
 * Mastery mutation economics (Design v2 section 7.1) - the nine dynasty
 * mutations follow the exact same [E]/[P] discipline as the Launch Ten:
 * benefits void after a Phoenix trigger, costs persist, and every [E]
 * effect is a pure function of (food index, mutation set) so the server
 * recompute stays exact.
 */

import { describe, expect, it } from '@jest/globals';
import {
  MUTATION_ECONOMICS,
  foodValueFlatBonus,
  foodValueModifier,
  type MutationPick,
} from '@/shared/game/mutations';
import {
  applyOutcomeWithMutations,
  computeRunTotals,
  outcomeMultipliers,
} from '@/shared/game/rulesets';

const pick = (id: MutationPick['id'], atFood = 0): MutationPick => ({
  id,
  atFood,
});

describe('Deep Roots (PRIMAL M3) - flat DNA bonus', () => {
  it('grants +1 DNA per 25 foods survived since pickup', () => {
    const picks = [pick('deep_roots', 0)];
    expect(foodValueFlatBonus(picks, 1)).toBe(0);
    expect(foodValueFlatBonus(picks, 24)).toBe(0);
    expect(foodValueFlatBonus(picks, 25)).toBe(1);
    expect(foodValueFlatBonus(picks, 49)).toBe(1);
    expect(foodValueFlatBonus(picks, 50)).toBe(2);
    expect(foodValueFlatBonus(picks, 75)).toBe(3);
  });

  it('counts from the pickup food, not from food 1', () => {
    const picks = [pick('deep_roots', 10)];
    expect(foodValueFlatBonus(picks, 10)).toBe(0); // pickup food itself
    expect(foodValueFlatBonus(picks, 34)).toBe(0);
    expect(foodValueFlatBonus(picks, 35)).toBe(1);
  });

  it('is a benefit: voided after a Phoenix trigger', () => {
    const picks = [pick('deep_roots', 0), pick('phoenix', 0)];
    expect(foodValueFlatBonus(picks, 50, 40)).toBe(0);
    expect(foodValueFlatBonus(picks, 25, 40)).toBe(1); // pre-trigger foods keep it
  });

  it('non-flat mutations contribute nothing', () => {
    expect(foodValueFlatBonus([pick('gold_trail', 0)], 50)).toBe(0);
    expect(foodValueFlatBonus([], 50)).toBe(0);
  });

  it('computeRunTotals folds the flat bonus into the raw DNA', () => {
    const base = computeRunTotals('PRIMAL', 30);
    const withRoots = computeRunTotals('PRIMAL', 30, [pick('deep_roots', 0)]);
    // Foods 25..30 each carry +1 => +6 total; no multiplier effect
    expect(withRoots.rawDna).toBe(base.rawDna + 6);
    expect(withRoots.score).toBe(base.score);
  });
});

describe('Ancient Grove (PRIMAL M6) - late bloom', () => {
  it('x1.25 after food 40, x0.9 up to and including 40', () => {
    const picks = [pick('ancient_grove', 0)];
    expect(foodValueModifier(picks, 1)).toBeCloseTo(0.9);
    expect(foodValueModifier(picks, 40)).toBeCloseTo(0.9);
    expect(foodValueModifier(picks, 41)).toBeCloseTo(1.25);
  });

  it('Phoenix voids the late bonus but the early cost persists', () => {
    const picks = [pick('ancient_grove', 0), pick('phoenix', 0)];
    expect(foodValueModifier(picks, 45, 42)).toBeCloseTo(1); // bonus voided
    expect(foodValueModifier(picks, 30, 42)).toBeCloseTo(0.9); // cost kept
  });
});

describe('Redline Dividend (CYBER M3) - max-tier payout', () => {
  it('x1.3 at the max overclock tier (n >= 20), x0.9 below', () => {
    const picks = [pick('redline_dividend', 0)];
    expect(foodValueModifier(picks, 19)).toBeCloseTo(0.9);
    expect(foodValueModifier(picks, 20)).toBeCloseTo(1.3);
    expect(foodValueModifier(picks, 100)).toBeCloseTo(1.3);
  });

  it('only affects foods after pickup', () => {
    const picks = [pick('redline_dividend', 30)];
    expect(foodValueModifier(picks, 30)).toBeCloseTo(1);
    expect(foodValueModifier(picks, 31)).toBeCloseTo(1.3);
  });

  it('Phoenix voids the bonus, keeps the sub-tier cost', () => {
    const picks = [pick('redline_dividend', 0), pick('phoenix', 0)];
    expect(foodValueModifier(picks, 25, 22)).toBeCloseTo(1);
    expect(foodValueModifier(picks, 10, 22)).toBeCloseTo(0.9);
  });
});

describe('Afterburner (CYBER M6) - every 10th food x2', () => {
  it('doubles every 10th food after pickup', () => {
    const picks = [pick('afterburner', 5)];
    expect(foodValueModifier(picks, 14)).toBeCloseTo(1);
    expect(foodValueModifier(picks, 15)).toBeCloseTo(2); // 5 + 10
    expect(foodValueModifier(picks, 25)).toBeCloseTo(2); // 5 + 20
    expect(foodValueModifier(picks, 26)).toBeCloseTo(1);
  });

  it('is a pure benefit: voided entirely post-Phoenix', () => {
    const picks = [pick('afterburner', 0), pick('phoenix', 0)];
    expect(foodValueModifier(picks, 30, 20)).toBeCloseTo(1);
    expect(foodValueModifier(picks, 20, 20)).toBeCloseTo(2); // trigger food keeps it
  });
});

describe('Tectonic Patience / Gravity Well - economic costs persist', () => {
  it('both cost food x0.9 from pickup', () => {
    expect(foodValueModifier([pick('tectonic_patience', 0)], 10)).toBeCloseTo(0.9);
    expect(foodValueModifier([pick('gravity_well', 0)], 10)).toBeCloseTo(0.9);
  });

  it('costs persist after a Phoenix trigger', () => {
    expect(
      foodValueModifier([pick('tectonic_patience', 0), pick('phoenix', 0)], 30, 20)
    ).toBeCloseTo(0.9);
    expect(
      foodValueModifier([pick('gravity_well', 0), pick('phoenix', 0)], 30, 20)
    ).toBeCloseTo(0.9);
  });
});

describe('Overclock Harvest (CYBER M9) - outcome multipliers', () => {
  it('bank 1.25 -> 1.40, salvage 0.60 -> 0.45', () => {
    const { bank, death } = outcomeMultipliers([pick('overclock_harvest')]);
    expect(bank).toBe(1.4);
    expect(death).toBe(0.45);
  });

  it('Phoenix voids the bank bonus, the salvage cost persists', () => {
    const { bank, death } = outcomeMultipliers(
      [pick('overclock_harvest'), pick('phoenix')],
      true
    );
    expect(bank).toBe(1.25);
    expect(death).toBe(0.45);
  });

  it('stacks additively on Mirror Wager (bank 1.65, salvage 0.15)', () => {
    const { bank, death } = outcomeMultipliers([
      pick('overclock_harvest'),
      pick('mirror_wager'),
    ]);
    expect(bank).toBe(1.65);
    expect(death).toBe(0.15);
  });

  it('stacks additively with trait deltas (Gambler: bank 1.50)', () => {
    const { bank, death } = outcomeMultipliers(
      [pick('overclock_harvest')],
      false,
      ['gambler']
    );
    expect(bank).toBe(1.5);
    expect(death).toBe(0.3);
  });

  it('applyOutcomeWithMutations pays the specced amounts exactly', () => {
    expect(
      applyOutcomeWithMutations(100, true, [pick('overclock_harvest')])
    ).toBe(140);
    expect(
      applyOutcomeWithMutations(100, false, [pick('overclock_harvest')])
    ).toBe(45);
  });
});

describe('economics constants sanity (single source of truth)', () => {
  it('doc-anchored tuning values', () => {
    expect(MUTATION_ECONOMICS.deepRootsFoodsPerBonus).toBe(25);
    expect(MUTATION_ECONOMICS.ancientGroveLateAfterFood).toBe(40);
    expect(MUTATION_ECONOMICS.redlineDividendMaxTierFood).toBe(20);
    expect(MUTATION_ECONOMICS.afterburnerEveryNth).toBe(10);
    expect(MUTATION_ECONOMICS.overclockHarvestBankDelta).toBe(0.15);
  });
});

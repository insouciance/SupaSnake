/**
 * Trait math through the scoring authority (Design v2 Phase 3A):
 * computeRunTotals with traits, trait x mutation stacking, and the
 * trait-aware outcome multipliers - the exact recompute the server pays.
 */

import { describe, it, expect } from '@jest/globals';
import {
  BANK,
  RULESETS,
  applyOutcome,
  applyOutcomeWithMutations,
  computeRunTotals,
  getRuleset,
  outcomeMultipliers,
  type DynastyName,
} from './rulesets';
import { foodValueModifier, type MutationPick } from './mutations';
import { traitFoodValueModifier, type TraitId } from './traits';

/** Reference fold: one round per food, trait x mutation modifiers combined. */
function referenceRawDna(
  dynasty: DynastyName,
  foodCount: number,
  traits: TraitId[],
  mutations: MutationPick[] = []
): number {
  const ruleset = getRuleset(dynasty);
  let raw = 0;
  for (let n = 1; n <= foodCount; n++) {
    const mod =
      (mutations.length > 0 ? foodValueModifier(mutations, n, null) : 1) *
      traitFoodValueModifier(traits, n);
    raw += Math.round(ruleset.foodDnaValue(n) * mod);
  }
  return raw;
}

describe('computeRunTotals with traits', () => {
  const dynasties: DynastyName[] = ['PRIMAL', 'CYBER', 'COSMIC'];

  it('no traits argument behaves exactly like Phase 2', () => {
    for (const dynasty of dynasties) {
      expect(computeRunTotals(dynasty, 40)).toEqual(
        computeRunTotals(dynasty, 40, [], null, [])
      );
    }
  });

  it.each(['scavenger', 'sprinter', 'ascetic', 'iron_scales'] as TraitId[])(
    '%s matches the per-food reference fold on every dynasty',
    (trait) => {
      for (const dynasty of dynasties) {
        for (const count of [0, 1, 10, 15, 16, 50, 51, 80]) {
          const { rawDna } = computeRunTotals(dynasty, count, [], null, [trait]);
          expect(rawDna).toBe(referenceRawDna(dynasty, count, [trait]));
        }
      }
    }
  );

  it('Ascetic pays x1.4 exactly on every COSMIC food', () => {
    // One round per food, applied to COSMIC's compounding base rather than
    // to a flat 10 (WP-3.13 re-based the Yield curve). Asserted against the
    // base fold rather than a hardcoded total, so it keeps testing the TRAIT
    // rather than the curve underneath it - which is what it was for.
    const base = computeRunTotals('COSMIC', 20);
    const { rawDna } = computeRunTotals('COSMIC', 20, [], null, ['ascetic']);
    let expected = 0;
    for (let n = 1; n <= 20; n++) {
      expected += Math.round(RULESETS.COSMIC.foodDnaValue(n) * 1.4);
    }
    expect(rawDna).toBe(expected);
    expect(rawDna).toBeGreaterThan(base.rawDna);
  });

  it('outcome-only traits leave the raw totals untouched', () => {
    for (const dynasty of dynasties) {
      const base = computeRunTotals(dynasty, 60);
      for (const trait of ['gambler', 'patient', 'hoarder', 'magnetism'] as TraitId[]) {
        expect(computeRunTotals(dynasty, 60, [], null, [trait])).toEqual(base);
      }
    }
  });

  it('traits never touch score (economy only, like mutations)', () => {
    for (const dynasty of dynasties) {
      const base = computeRunTotals(dynasty, 45);
      const traited = computeRunTotals(dynasty, 45, [], null, [
        'ascetic',
        'scavenger',
      ]);
      expect(traited.score).toBe(base.score);
    }
  });

  it('trait and mutation modifiers combine inside a single per-food round', () => {
    const mutations: MutationPick[] = [{ id: 'overgrowth', atFood: 15 }];
    for (const dynasty of dynasties) {
      const { rawDna } = computeRunTotals(
        dynasty,
        60,
        mutations,
        null,
        ['sprinter', 'iron_scales']
      );
      expect(rawDna).toBe(
        referenceRawDna(dynasty, 60, ['sprinter', 'iron_scales'], mutations)
      );
    }
  });

  it('Gold Trail golden foods multiply with the Scavenger early bonus', () => {
    // PRIMAL, gold_trail picked at food 15 -> food 20 is golden (x3).
    const mutations: MutationPick[] = [{ id: 'gold_trail', atFood: 15 }];
    const { rawDna } = computeRunTotals('PRIMAL', 20, mutations, null, ['scavenger']);
    const noTrait = computeRunTotals('PRIMAL', 20, mutations, null, []).rawDna;
    // Foods 1-15 gained the x1.3; food 20 (golden x3) is outside the early
    // window so it matches - overall strictly greater
    expect(rawDna).toBeGreaterThan(noTrait);
    expect(rawDna).toBe(referenceRawDna('PRIMAL', 20, ['scavenger'], mutations));
  });
});

describe('outcomeMultipliers with traits', () => {
  it('Gambler: 1.35 bank / 0.45 salvage', () => {
    expect(outcomeMultipliers([], false, ['gambler'])).toEqual({
      bank: expect.closeTo(1.35, 10),
      death: expect.closeTo(0.45, 10),
    });
  });

  it('Patient: 1.35 bank / salvage unchanged', () => {
    expect(outcomeMultipliers([], false, ['patient'])).toEqual({
      bank: expect.closeTo(1.35, 10),
      death: expect.closeTo(BANK.deathMultiplier, 10),
    });
  });

  it('Hoarder: 1.15 bank / 0.70 salvage', () => {
    expect(outcomeMultipliers([], false, ['hoarder'])).toEqual({
      bank: expect.closeTo(1.15, 10),
      death: expect.closeTo(0.7, 10),
    });
  });

  it('Gambler + Patient reaches the specced x1.45 bank', () => {
    const { bank } = outcomeMultipliers([], false, ['gambler', 'patient']);
    expect(bank).toBeCloseTo(1.45, 10);
  });

  it('trait deltas stack additively on top of Mirror Wager', () => {
    const wager: MutationPick[] = [{ id: 'mirror_wager', atFood: 15 }];
    const { bank, death } = outcomeMultipliers(wager, false, ['gambler']);
    expect(bank).toBeCloseTo(1.5 + 0.1, 10); // 1.50 wager + gambler delta
    expect(death).toBeCloseTo(0.3 - 0.15, 10); // 0.30 wager + gambler delta
  });

  it('a Phoenix trigger voids mutation benefits but never trait deltas', () => {
    const picks: MutationPick[] = [
      { id: 'mirror_wager', atFood: 15 },
      { id: 'phoenix', atFood: 30 },
    ];
    const { bank } = outcomeMultipliers(picks, true, ['gambler']);
    // Wager's x1.50 reverts to x1.25; the Gambler delta survives
    expect(bank).toBeCloseTo(1.25 + 0.1, 10);
  });

  it('multipliers are floored at 0 under pathological stacks', () => {
    const wager: MutationPick[] = [{ id: 'mirror_wager', atFood: 15 }];
    const { death } = outcomeMultipliers(wager, false, ['gambler']);
    expect(death).toBeGreaterThanOrEqual(0);
  });
});

describe('applyOutcomeWithMutations with traits', () => {
  it('Hoarder death salvage: floor(raw x 0.70)', () => {
    expect(applyOutcomeWithMutations(1000, false, [], false, ['hoarder'])).toBe(700);
    expect(applyOutcomeWithMutations(1000, true, [], false, ['hoarder'])).toBe(1150);
  });

  it('Gambler extraction: floor(raw x 1.35), death floor(raw x 0.45)', () => {
    expect(applyOutcomeWithMutations(1000, true, [], false, ['gambler'])).toBe(1350);
    expect(applyOutcomeWithMutations(1000, false, [], false, ['gambler'])).toBe(450);
  });

  it('Patient banked run: floor(raw x 1.35)', () => {
    expect(applyOutcomeWithMutations(999, true, [], false, ['patient'])).toBe(
      Math.floor(999 * 1.35)
    );
  });

  it('traitless call remains exactly applyOutcome', () => {
    for (const raw of [0, 1, 777, 12345]) {
      expect(applyOutcomeWithMutations(raw, true, [], false, [])).toBe(
        applyOutcome(raw, true)
      );
      expect(applyOutcomeWithMutations(raw, false, [], false, [])).toBe(
        applyOutcome(raw, false)
      );
    }
  });
});

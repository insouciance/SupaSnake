/**
 * Anomaly [E] effects in the shared scoring authority (Design v2 section
 * 7.2): Gold Rush food x1.5 and Twin Exits bank x1.15 recompute exactly;
 * score is never anomaly-shaped; [P] anomalies leave the math untouched.
 */

import { describe, expect, it } from '@jest/globals';
import {
  applyOutcomeWithMutations,
  computeRunTotals,
  outcomeMultipliers,
} from '@/shared/game/rulesets';
import type { MutationPick } from '@/shared/game/mutations';

describe('computeRunTotals under anomalies', () => {
  it('Gold Rush: every food pays x1.5 with the same single per-food round', () => {
    const plain = computeRunTotals('PRIMAL', 30);
    const rush = computeRunTotals('PRIMAL', 30, [], null, [], 'gold_rush');
    let expected = 0;
    for (let n = 1; n <= 30; n++) {
      expected += Math.round(Math.round(10 * (1 + 0.02 * (n - 1))) * 1.5);
    }
    expect(rush.rawDna).toBe(expected);
    expect(rush.rawDna).toBeGreaterThan(plain.rawDna);
    // Score is NEVER anomaly-shaped - identical ranking math for the board
    expect(rush.score).toBe(plain.score);
  });

  it('Gold Rush multiplies WITH mutation and trait modifiers, one round per food', () => {
    const picks: MutationPick[] = [{ id: 'overgrowth', atFood: 10 }];
    const { rawDna } = computeRunTotals(
      'CYBER', 25, picks, null, ['sprinter'], 'gold_rush'
    );
    let expected = 0;
    for (let n = 1; n <= 25; n++) {
      const base = Math.round(10 * (1 + 0.5 * Math.min(4, Math.floor(n / 5))));
      let mod = 1.5; // gold rush, every food
      if (n > 10) mod *= 1.2; // overgrowth (after pickup)
      if (n <= 10) mod *= 1.2; // sprinter (first 10 foods)
      expected += Math.round(base * mod);
    }
    expect(rawDna).toBe(expected);
  });

  it('[P] anomalies (Meteor Shower, Blackout, Twin Exits) never touch food DNA', () => {
    const plain = computeRunTotals('COSMIC', 40);
    for (const anomaly of ['meteor_shower', 'blackout', 'twin_exits'] as const) {
      expect(computeRunTotals('COSMIC', 40, [], null, [], anomaly)).toEqual(plain);
    }
  });
});

describe('outcome multipliers under anomalies', () => {
  it('Twin Exits: bank x1.15 only; salvage stays x0.60', () => {
    const { bank, death } = outcomeMultipliers([], false, [], 'twin_exits');
    expect(bank).toBe(1.15);
    expect(death).toBe(0.6);
    expect(applyOutcomeWithMutations(1000, true, [], false, [], 'twin_exits'))
      .toBe(1150);
    expect(applyOutcomeWithMutations(1000, false, [], false, [], 'twin_exits'))
      .toBe(600);
  });

  it('other anomalies leave the outcome at the base x1.25 / x0.60', () => {
    for (const anomaly of ['meteor_shower', 'gold_rush', 'blackout'] as const) {
      const { bank, death } = outcomeMultipliers([], false, [], anomaly);
      expect(bank).toBe(1.25);
      expect(death).toBe(0.6);
    }
  });

  it('Twin Exits replaces the BASE bank: additive trait deltas stack on 1.15', () => {
    // Gambler: +0.10 bank, -0.15 salvage -> 1.25 / 0.45 under Twin Exits
    const { bank, death } = outcomeMultipliers([], false, ['gambler'], 'twin_exits');
    expect(bank).toBe(1.25);
    expect(death).toBe(0.45);
  });

  it('Mirror Wager still SETS the bank to x1.50 (identical on and off the board)', () => {
    const wager: MutationPick[] = [{ id: 'mirror_wager', atFood: 20 }];
    const { bank, death } = outcomeMultipliers(wager, false, [], 'twin_exits');
    expect(bank).toBe(1.5);
    expect(death).toBe(0.3);
  });

  it('no-anomaly calls are byte-identical to the pre-4B behavior', () => {
    expect(outcomeMultipliers([], false, [])).toEqual(
      outcomeMultipliers([], false, [], null)
    );
    expect(applyOutcomeWithMutations(777, true)).toBe(
      applyOutcomeWithMutations(777, true, [], false, [], null)
    );
  });
});

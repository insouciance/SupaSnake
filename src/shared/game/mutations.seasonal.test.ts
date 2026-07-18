/**
 * Season 1 "Solstice" seasonal mutations (Design v2 section 7.2) -
 * economics under the section 5 grammar: pure functions of
 * (food index, pick point), benefits void post-Phoenix, costs persist.
 */

import { describe, expect, it } from '@jest/globals';
import {
  MUTATIONS,
  MUTATION_ECONOMICS,
  MUTATION_PHYSICS,
  foodValueModifier,
  rollMutationOffer,
  type MutationPick,
} from '@/shared/game/mutations';
import { SEASON_1_MUTATIONS } from '@/shared/game/season';
import { computeRunTotals } from '@/shared/game/rulesets';

describe('Solstice Engine: every 4th food after pickup x2', () => {
  const picks: MutationPick[] = [{ id: 'solstice_engine', atFood: 20 }];

  it('doubles exactly every 4th food after pickup', () => {
    expect(foodValueModifier(picks, 24)).toBe(2);
    expect(foodValueModifier(picks, 28)).toBe(2);
    expect(foodValueModifier(picks, 23)).toBe(1);
    expect(foodValueModifier(picks, 25)).toBe(1);
    expect(foodValueModifier(picks, 20)).toBe(1); // pickup food itself
    expect(foodValueModifier(picks, 12)).toBe(1); // before pickup
  });

  it('the x2 is a benefit: voided from a Phoenix trigger onward', () => {
    expect(foodValueModifier(picks, 24, 22)).toBe(1);
    expect(foodValueModifier(picks, 24, 30)).toBe(2); // trigger later
  });

  it('cost is the portal-interval tax (+2 foods, engine-side)', () => {
    expect(MUTATION_PHYSICS.solsticeEnginePortalIntervalPenalty).toBe(2);
    expect(MUTATIONS.solstice_engine.kind).toBe('EP');
  });
});

describe('Glacial Reserve: +1%/food since pickup, capped +30%', () => {
  const picks: MutationPick[] = [{ id: 'glacial_reserve', atFood: 10 }];

  it('grows linearly with foods survived since pickup', () => {
    expect(foodValueModifier(picks, 11)).toBeCloseTo(1.01, 10);
    expect(foodValueModifier(picks, 20)).toBeCloseTo(1.1, 10);
    expect(foodValueModifier(picks, 40)).toBeCloseTo(1.3, 10);
  });

  it('caps at +30% (food 40+ after a pickup at 10)', () => {
    expect(foodValueModifier(picks, 41)).toBeCloseTo(1.3, 10);
    expect(foodValueModifier(picks, 200)).toBeCloseTo(1.3, 10);
    expect(MUTATION_ECONOMICS.glacialReserveCap).toBe(0.3);
  });

  it('is a pure benefit: fully voided post-Phoenix (cost is portal ticks)', () => {
    expect(foodValueModifier(picks, 30, 25)).toBe(1);
    expect(MUTATION_PHYSICS.glacialReservePortalTicksPenalty).toBe(20);
  });
});

describe('Midnight Oil: first 15 foods after pickup +35%, then -5%', () => {
  const picks: MutationPick[] = [{ id: 'midnight_oil', atFood: 20 }];

  it('front-loads the window and taxes the tail', () => {
    expect(foodValueModifier(picks, 21)).toBeCloseTo(1.35, 10);
    expect(foodValueModifier(picks, 35)).toBeCloseTo(1.35, 10); // last window food
    expect(foodValueModifier(picks, 36)).toBeCloseTo(0.95, 10);
    expect(foodValueModifier(picks, 100)).toBeCloseTo(0.95, 10);
  });

  it('Phoenix voids the +35% benefit; the -5% cost persists', () => {
    expect(foodValueModifier(picks, 30, 25)).toBe(1); // window food, benefit gone
    expect(foodValueModifier(picks, 40, 25)).toBeCloseTo(0.95, 10); // cost stays
  });
});

describe('seasonal mutations in the recompute + offer pipeline', () => {
  it('computeRunTotals recomputes a seasonal build exactly (server authority)', () => {
    const picks: MutationPick[] = [
      { id: 'solstice_engine', atFood: 15 },
      { id: 'midnight_oil', atFood: 30 },
    ];
    const { rawDna } = computeRunTotals('PRIMAL', 50, picks);
    // Manual fold with the same per-food single round
    let expected = 0;
    for (let n = 1; n <= 50; n++) {
      const base = Math.round(10 * (1 + 0.02 * (n - 1)));
      expected += Math.round(base * foodValueModifier(picks, n));
    }
    expect(rawDna).toBe(expected);
  });

  it('offers draw seasonal ids once the server pool includes them', () => {
    const pool = [...SEASON_1_MUTATIONS];
    const offer = rollMutationOffer([], () => 0, [...pool, 'phoenix']);
    expect(offer).not.toBeNull();
    expect(pool).toContain(offer![0]);
  });
});

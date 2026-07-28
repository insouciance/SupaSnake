/**
 * The offer cadence (WP-3.05) — and why it is one number, not two.
 *
 * THE BUG THIS FILE EXISTS TO PREVENT A REPEAT OF. `offerIntervalBase` and
 * `minFoodsPerPick` shipped in WP-3.02 and were read by NOTHING. The engine
 * rolled every gene offer from `MUTATION_SPAWN.intervalBase` (20 +/- 5) and
 * the validator bounded picks with its own hardcoded `MIN_FOODS_PER_PICK`, so
 * choosing Tuned bought a growth curve and silently kept Classic's buildcraft.
 * A ~48-food Tuned run produced about two gene offers where the profile asked
 * for five, and no test failed, because the fields were only ever compared to
 * themselves.
 *
 * The field carried a comment asserting the coupling as though it were
 * enforced. It was not. So the tests below assert the WIRING, not the values:
 * that the engine's floor and the validator's ceiling are the same number, and
 * that the shipped curve did not move.
 */

import { describe, it, expect } from '@jest/globals';
import {
  GROWTH_PROFILES,
  offerIntervalJitter,
  rollOfferInterval,
  type GrowthProfileId,
} from './growth';
import { MUTATION_SPAWN, rollMutationInterval } from './mutations';

const ALL: GrowthProfileId[] = ['baseline', 'tuned', 'aggressive'];

/** Sweep rng across [0,1) finely enough to hit every branch of the roll. */
function everyRoll(profile: (typeof GROWTH_PROFILES)[GrowthProfileId]): number[] {
  const seen: number[] = [];
  for (let i = 0; i < 1000; i++) {
    seen.push(rollOfferInterval(profile, () => i / 1000));
  }
  return seen;
}

describe('offer cadence: the engine floor IS the validator bound', () => {
  it.each(ALL)('%s never rolls below its own minFoodsPerPick', (id) => {
    const profile = GROWTH_PROFILES[id];
    const rolls = everyRoll(profile);
    expect(Math.min(...rolls)).toBe(profile.minFoodsPerPick);
  });

  it.each(ALL)('%s rolls symmetrically around offerIntervalBase', (id) => {
    const profile = GROWTH_PROFILES[id];
    const rolls = everyRoll(profile);
    const jitter = offerIntervalJitter(profile);
    expect(Math.max(...rolls)).toBe(profile.offerIntervalBase + jitter);
    // The mean sits on the base - a lopsided roll would drift the real
    // cadence away from the number the selector advertises.
    expect(Math.min(...rolls) + Math.max(...rolls)).toBe(
      2 * profile.offerIntervalBase
    );
  });

  it('jitter is derived, never authored', () => {
    // If jitter were its own field, an edit to either neighbour would let the
    // engine roll an interval the validator rejects - and the player who was
    // HANDED that offer by the engine is the one who gets flagged for it.
    for (const id of ALL) {
      const profile = GROWTH_PROFILES[id];
      expect(offerIntervalJitter(profile)).toBe(
        profile.offerIntervalBase - profile.minFoodsPerPick
      );
    }
  });

  it('a degenerate profile cannot produce a negative jitter', () => {
    const degenerate = { ...GROWTH_PROFILES.baseline, minFoodsPerPick: 99 };
    expect(offerIntervalJitter(degenerate)).toBe(0);
    expect(rollOfferInterval(degenerate, () => 0.999)).toBe(
      degenerate.offerIntervalBase
    );
  });
});

describe('baseline did not move', () => {
  it('matches the rollMutationInterval it replaces, roll for roll', () => {
    // The control must stay byte-identical: every run in production today is
    // baseline, and a cadence shift would change live payouts for a change
    // that is supposed to be inert with the lab off.
    for (let i = 0; i < 1000; i++) {
      const rng = () => i / 1000;
      expect(rollOfferInterval(GROWTH_PROFILES.baseline, rng)).toBe(
        rollMutationInterval(rng)
      );
    }
  });

  it('is the same 20 +/- 5 the global constant declares', () => {
    expect(GROWTH_PROFILES.baseline.offerIntervalBase).toBe(
      MUTATION_SPAWN.intervalBase
    );
    expect(offerIntervalJitter(GROWTH_PROFILES.baseline)).toBe(
      MUTATION_SPAWN.intervalJitter
    );
  });
});

describe('the profiles differ in cadence, which is the point', () => {
  it('a faster curve offers genes more often', () => {
    // The owner played Tuned expecting roughly five offers in a ~48-food run
    // and got two. Ordering is the assertion that would have caught it.
    const mean = (id: GrowthProfileId) => GROWTH_PROFILES[id].offerIntervalBase;
    expect(mean('aggressive')).toBeLessThan(mean('tuned'));
    expect(mean('tuned')).toBeLessThan(mean('baseline'));
  });

  it('offers per run rise with the curve', () => {
    const offersIn = (id: GrowthProfileId, foods: number) =>
      Math.floor(foods / GROWTH_PROFILES[id].offerIntervalBase);
    expect(offersIn('baseline', 48)).toBe(2);
    expect(offersIn('tuned', 48)).toBeGreaterThanOrEqual(4);
  });
});

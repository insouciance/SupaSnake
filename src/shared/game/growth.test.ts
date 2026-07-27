/**
 * Growth profiles (WP-3.02) — the D1 instrument.
 *
 * The parity between the engine and the server length model is asserted in
 * `foldParity.test.ts`, which is where a divergence would actually bite. This
 * file covers the profiles themselves: the control is really a control, the
 * resolver cannot throw, and each shape reaches its intended terminus.
 */

import { describe, it, expect } from '@jest/globals';
import {
  GROWTH_PROFILES,
  baseGrowthForFood,
  resolveGrowthProfile,
  isGrowthProfileId,
  DEFAULT_GROWTH_PROFILE,
  type GrowthProfileId,
} from './growth';
import { STRAIN_PHYSICS } from './strains';

const ALL: GrowthProfileId[] = ['baseline', 'tuned', 'aggressive'];

/** Occupancy of a 400-cell board after n foods, with three infuses taken. */
function occupancyAfter(id: GrowthProfileId, foods: number): number {
  const profile = GROWTH_PROFILES[id];
  let len = profile.initialLength;
  for (let n = 1; n <= foods; n++) len += baseGrowthForFood(profile, n);
  // Rule 15: an infuse GROWS. Three is the per-run cap, and a real run takes
  // them - leaving them out would flatter every projection.
  len += 3 * STRAIN_PHYSICS.infuseGrowth;
  return len / 400;
}

function foodsToOccupancy(id: GrowthProfileId, target: number): number {
  for (let n = 1; n <= 2000; n++) {
    if (occupancyAfter(id, n) >= target) return n;
  }
  return -1;
}

describe('growth profiles', () => {
  it('baseline is the control: +1 per food, one food, shipped cadence', () => {
    const p = GROWTH_PROFILES.baseline;
    for (const n of [1, 5, 20, 50, 200, 500]) {
      expect(baseGrowthForFood(p, n)).toBe(1);
    }
    expect(p.simultaneousFoods).toBe(1);
    expect(p.initialLength).toBe(3);
    // The shipped dials, so a baseline run is the game as it was.
    expect(p.offerIntervalBase).toBe(20);
    expect(p.minFoodsPerPick).toBe(15);
  });

  it('every profile grows monotonically and never shrinks (Rule 15)', () => {
    for (const id of ALL) {
      const p = GROWTH_PROFILES[id];
      for (let n = 1; n <= 200; n++) {
        expect(baseGrowthForFood(p, n)).toBeGreaterThanOrEqual(0);
      }
    }
  });

  it('the tuned shape is fast, then a plateau, then acceleration', () => {
    const p = GROWTH_PROFILES.tuned;
    expect(baseGrowthForFood(p, 1)).toBe(6);
    expect(baseGrowthForFood(p, 11)).toBe(6);
    expect(baseGrowthForFood(p, 12)).toBe(2); // plateau begins
    expect(baseGrowthForFood(p, 31)).toBe(2);
    expect(baseGrowthForFood(p, 32)).toBe(2); // acceleration begins
    expect(baseGrowthForFood(p, 38)).toBe(3);
    expect(baseGrowthForFood(p, 200)).toBe(8); // capped
  });

  it('the plateau is where most of the run happens', () => {
    // The design claim: the plateau dominates total run time, which is why
    // raising it from +1 to +2 moved the projection from 8.8 to 5.8 minutes.
    const p = GROWTH_PROFILES.tuned;
    const plateauFoods = Array.from({ length: 20 }, (_, i) => i + 12);
    expect(plateauFoods.every((n) => baseGrowthForFood(p, n) === 2)).toBe(true);
  });

  it('pressure arrives around a minute, not around minute eight', () => {
    // 20% occupancy is where the owner's play says a board starts mattering.
    // Baseline needs ~4x the foods the tuned shapes do to get there.
    const baseline = foodsToOccupancy('baseline', 0.2);
    const tuned = foodsToOccupancy('tuned', 0.2);
    const aggressive = foodsToOccupancy('aggressive', 0.2);
    expect(tuned).toBeLessThan(baseline / 2);
    expect(aggressive).toBeLessThanOrEqual(tuned);
    expect(tuned).toBeLessThan(20);
  });

  it('the tuned shapes terminate; baseline effectively does not', () => {
    // "Terminus" = 92% occupancy, where a board is unplayable.
    const tuned = foodsToOccupancy('tuned', 0.92);
    const aggressive = foodsToOccupancy('aggressive', 0.92);
    expect(tuned).toBeGreaterThan(30);
    expect(tuned).toBeLessThan(80);
    expect(aggressive).toBeLessThan(tuned);
    // Baseline needs hundreds of foods - which is exactly the defect: nobody
    // has ever played that long, so the curve never engaged.
    expect(foodsToOccupancy('baseline', 0.92)).toBeGreaterThan(250);
  });

  it('multi-food is on for the tuned shapes and off for the control', () => {
    expect(GROWTH_PROFILES.baseline.simultaneousFoods).toBe(1);
    expect(GROWTH_PROFILES.tuned.simultaneousFoods).toBeGreaterThan(1);
    expect(GROWTH_PROFILES.aggressive.simultaneousFoods).toBeGreaterThan(1);
  });

  it('offer cadence is re-based so the draft still exists in a short run', () => {
    // At the shipped interval of 20, a ~48-food run sees two offers and the
    // build system stops being a system.
    for (const id of ['tuned', 'aggressive'] as GrowthProfileId[]) {
      const p = GROWTH_PROFILES[id];
      const terminus = foodsToOccupancy(id, 0.92);
      expect(Math.floor(terminus / p.offerIntervalBase)).toBeGreaterThanOrEqual(4);
      // The validator bound must not be stricter than the cadence, or honest
      // runs flag. This is the same defect class as maxFoodPerSecond.
      expect(p.minFoodsPerPick).toBeLessThanOrEqual(p.offerIntervalBase);
    }
  });

  it('resolution is total and defaults to the shipped behaviour', () => {
    expect(resolveGrowthProfile('tuned').id).toBe('tuned');
    for (const bad of [undefined, null, '', 'nope', 42, {}, [], NaN]) {
      expect(resolveGrowthProfile(bad).id).toBe(DEFAULT_GROWTH_PROFILE);
    }
    expect(isGrowthProfileId('baseline')).toBe(true);
    expect(isGrowthProfileId('legendary')).toBe(false);
  });

  it('baseGrowthForFood is defensive about the food index', () => {
    const p = GROWTH_PROFILES.tuned;
    expect(baseGrowthForFood(p, 0)).toBe(baseGrowthForFood(p, 1));
    expect(baseGrowthForFood(p, -5)).toBe(baseGrowthForFood(p, 1));
    expect(Number.isFinite(baseGrowthForFood(p, NaN))).toBe(true);
  });
});

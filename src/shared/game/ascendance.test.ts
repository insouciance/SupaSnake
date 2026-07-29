/**
 * Ascendance curve tests (Constitution §8.2, §6.2, WP-1.05).
 *
 * The Constitution states two numbers — increments "start near +2%" and
 * shrink "toward an asymptote of roughly +30% total". These tests pin both,
 * pin the shape between them, and pin the two Rule-6 properties: nobody is
 * reset (an existing Gen>3 snake enters at its own generation) and nothing
 * is retroactively penalised (Gen1–3 costs are unchanged).
 */

import { describe, it, expect } from '@jest/globals';
import {
  ASCENDANCE_COST_STEEPENING,
  ASCENDANCE_DECAY,
  ASCENDANCE_FIRST_INCREMENT,
  ASCENDANCE_START_GENERATION,
  ASCENDANCE_YIELD_CEILING,
  applyAscendanceYield,
  ascendanceYieldBreakdown,
  ascendanceYieldBonus,
  ascendanceYieldMultiplier,
  breedingCost,
  formatAscendanceYieldMultiplier,
  formatYieldMultiplier,
  isAscended,
  offspringGeneration,
} from './ascendance';

describe('the curve', () => {
  it('pays nothing before Gen4 — Gen1-3 keep their own unlocks', () => {
    expect(ascendanceYieldBonus(1)).toBe(0);
    expect(ascendanceYieldBonus(2)).toBe(0);
    expect(ascendanceYieldBonus(3)).toBe(0);
    expect(isAscended(3)).toBe(false);
    expect(isAscended(4)).toBe(true);
  });

  it('starts at exactly +2% at Gen4', () => {
    expect(ascendanceYieldBonus(ASCENDANCE_START_GENERATION)).toBe(
      ASCENDANCE_FIRST_INCREMENT
    );
    expect(ascendanceYieldBonus(4)).toBe(0.02);
  });

  it('derives its decay from the two stated numbers (14/15)', () => {
    expect(ASCENDANCE_DECAY).toBeCloseTo(14 / 15, 12);
    expect(ASCENDANCE_YIELD_CEILING * (1 - ASCENDANCE_DECAY)).toBeCloseTo(
      ASCENDANCE_FIRST_INCREMENT,
      12
    );
  });

  it('matches the closed form at Gen 1, 3, 4, 10 and 100', () => {
    const closed = (g: number) =>
      g < 4 ? 0 : Math.round(0.3 * (1 - (14 / 15) ** (g - 3)) * 1e4) / 1e4;
    for (const g of [1, 3, 4, 10, 100]) {
      expect(ascendanceYieldBonus(g)).toBe(closed(g));
    }
    // The stated waypoints, spelled out so a retune is visible in the diff.
    expect(ascendanceYieldBonus(10)).toBeCloseTo(0.1149, 4);
    expect(ascendanceYieldBonus(100)).toBeCloseTo(0.2996, 4);
  });

  it('increments shrink every generation', () => {
    let previous = Infinity;
    for (let g = 4; g <= 60; g += 1) {
      const step = ascendanceYieldBonus(g) - ascendanceYieldBonus(g - 1);
      expect(step).toBeGreaterThan(0);
      expect(step).toBeLessThanOrEqual(previous + 1e-12);
      previous = step;
    }
  });

  it('AT THE ASYMPTOTE: approaches +30% and never exceeds it', () => {
    // Monotonic, bounded, and converging on the ceiling from below.
    for (let g = 4; g <= 2_000; g += 1) {
      expect(ascendanceYieldBonus(g)).toBeLessThanOrEqual(
        ASCENDANCE_YIELD_CEILING
      );
    }
    expect(ascendanceYieldBonus(500)).toBe(ASCENDANCE_YIELD_CEILING);
    expect(ascendanceYieldBonus(10_000)).toBe(ASCENDANCE_YIELD_CEILING);
    expect(ascendanceYieldBonus(Number.MAX_SAFE_INTEGER)).toBe(
      ASCENDANCE_YIELD_CEILING
    );
    // A veteran is ~1.3x a newcomer, never 10x (§8.2).
    expect(ascendanceYieldMultiplier(10_000)).toBe(1.3);
    expect(ascendanceYieldMultiplier(1)).toBe(1);
  });

  it('is strictly increasing, so no generation is ever a downgrade (Rule 6)', () => {
    for (let g = 2; g <= 400; g += 1) {
      expect(ascendanceYieldBonus(g)).toBeGreaterThanOrEqual(
        ascendanceYieldBonus(g - 1)
      );
    }
  });
});

describe('existing snakes enter the curve at their own generation', () => {
  it('reads only the generation column — no start date, no migration flag', () => {
    // A snake that was Gen 7 before WP-1.05 gets Gen 7's bonus immediately,
    // identical to a snake bred to Gen 7 afterwards. Nothing is reset and
    // nothing is grandfathered (Rule 6).
    for (const g of [4, 5, 7, 12, 41]) {
      expect(ascendanceYieldBonus(g)).toBe(ascendanceYieldBonus(g));
      expect(ascendanceYieldBonus(g)).toBeGreaterThan(0);
    }
    expect(ascendanceYieldBonus(7)).toBeCloseTo(0.3 * (1 - (14 / 15) ** 4), 4);
    // Above the deleted Gen50 wall the curve simply continues.
    expect(ascendanceYieldBonus(51)).toBeGreaterThan(ascendanceYieldBonus(50));
  });

  it('never lowers a Yield it is applied to', () => {
    expect(applyAscendanceYield(1_000, 1)).toBe(1_000);
    expect(applyAscendanceYield(1_000, 3)).toBe(1_000);
    expect(applyAscendanceYield(1_000, 4)).toBe(1_020);
    expect(applyAscendanceYield(1_000, 10_000)).toBe(1_300);
    for (let g = 1; g <= 200; g += 1) {
      expect(applyAscendanceYield(777, g)).toBeGreaterThanOrEqual(777);
    }
  });

  it('handles degenerate input without inventing DNA', () => {
    expect(applyAscendanceYield(0, 50)).toBe(0);
    expect(applyAscendanceYield(-5, 50)).toBe(0);
    expect(applyAscendanceYield(Number.NaN, 50)).toBe(0);
    expect(applyAscendanceYield(100, Number.NaN)).toBe(100);
  });

  it('returns an exact player-facing breakdown that sums to settlement', () => {
    expect(ascendanceYieldBreakdown(1_000, 11)).toEqual({
      generation: 11,
      baseYield: 1_000,
      multiplier: 1.1273,
      bonusYield: 127,
      totalYield: 1_127,
    });
    expect(ascendanceYieldBreakdown(777, 3)).toEqual({
      generation: 3,
      baseYield: 777,
      multiplier: 1,
      bonusYield: 0,
      totalYield: 777,
    });
  });

  it('formats neutral and ascended multipliers without hiding precision', () => {
    expect(formatYieldMultiplier(1)).toBe('1.00');
    expect(formatYieldMultiplier(1.02)).toBe('1.02');
    expect(formatYieldMultiplier(1.1289)).toBe('1.1289');
    expect(formatAscendanceYieldMultiplier(3)).toBe('1.00');
    expect(formatAscendanceYieldMultiplier(11)).toBe('1.1273');
  });
});

describe('the cost curve', () => {
  it('leaves every Gen1-3 child at exactly its shipped price', () => {
    expect(breedingCost(1, 1)).toBe(300); // child Gen2
    expect(breedingCost(1, 2)).toBe(300); // child Gen3
    expect(breedingCost(2, 2)).toBe(400); // child Gen3
  });

  it('steepens by 1.25 per generation past Gen3', () => {
    expect(ASCENDANCE_COST_STEEPENING).toBe(1.25);
    expect(breedingCost(3, 3)).toBe(Math.ceil(500 * 1.25)); // child Gen4
    expect(breedingCost(4, 4)).toBe(Math.ceil(600 * 1.25 ** 2)); // child Gen5
    expect(breedingCost(9, 9)).toBe(Math.ceil(1100 * 1.25 ** 7)); // child Gen10
  });

  it('outruns the Yield bonus, which is the point (§8.2)', () => {
    // Cost multiplies; the bonus decays. Each Ascendance step buys visibly
    // less for visibly more, so the lane spans months rather than day one.
    const costStep = breedingCost(10, 10) / breedingCost(9, 9);
    const bonusStep =
      (1 + ascendanceYieldBonus(11)) / (1 + ascendanceYieldBonus(10));
    expect(costStep).toBeGreaterThan(bonusStep);
  });

  it('is symmetric, monotonic and bounded against overflow', () => {
    expect(breedingCost(3, 5)).toBe(breedingCost(5, 3));
    for (let g = 2; g <= 60; g += 1) {
      expect(breedingCost(g, g)).toBeGreaterThanOrEqual(breedingCost(g - 1, g - 1));
    }
    expect(breedingCost(5_000, 5_000)).toBeLessThanOrEqual(1_000_000_000);
    expect(Number.isSafeInteger(breedingCost(5_000, 5_000))).toBe(true);
  });
});

describe('offspringGeneration', () => {
  it('is one above the highest parent, with no cap', () => {
    expect(offspringGeneration(1, 1)).toBe(2);
    expect(offspringGeneration(2, 5)).toBe(6);
    expect(offspringGeneration(50, 50)).toBe(51);
    expect(offspringGeneration(999, 3)).toBe(1_000);
  });
});

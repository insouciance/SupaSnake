import { describe, expect, it } from '@jest/globals';
import {
  ASCENDANCE_COST_STEEPENING,
  ASCENDANCE_EVOLUTION_INTERVAL,
  ASCENDANCE_MULTIPLIER_BPS,
  ASCENDANCE_START_GENERATION,
  ASCENDANCE_V1_DECAY,
  ASCENDANCE_V1_FIRST_INCREMENT,
  ASCENDANCE_V1_YIELD_CEILING,
  ASCENDANCE_V2_GENERATION_FACTOR,
  CURRENT_ASCENDANCE_CURVE_VERSION,
  applyAscendanceYield,
  applyAscendanceYieldV1,
  ascendanceEvolutionMilestone,
  ascendanceEvolutionProgress,
  ascendanceYieldBonus,
  ascendanceYieldBonusV1,
  ascendanceYieldBreakdown,
  ascendanceYieldBreakdownV1,
  ascendanceYieldMultiplier,
  ascendanceYieldMultiplierBps,
  ascendanceYieldMultiplierBpsV2,
  ascendanceYieldMultiplierV1,
  breedingCost,
  formatAscendanceYieldMultiplier,
  formatYieldMultiplier,
  isAscended,
  offspringGeneration,
} from './ascendance';

describe('Ascendance curve versioning', () => {
  it('makes v2 current while preserving an explicit v1 path', () => {
    expect(CURRENT_ASCENDANCE_CURVE_VERSION).toBe(2);
    expect(ascendanceYieldMultiplier(50)).toBe(2.5363);
    expect(ascendanceYieldMultiplier(50, 1)).toBe(
      ascendanceYieldMultiplierV1(50)
    );
  });

  it('preserves the exact v1 fixtures used by already-started runs', () => {
    expect(ASCENDANCE_V1_DECAY).toBeCloseTo(14 / 15, 12);
    expect(ASCENDANCE_V1_FIRST_INCREMENT).toBe(0.02);
    expect(ASCENDANCE_V1_YIELD_CEILING).toBe(0.3);

    expect(ascendanceYieldBonusV1(1)).toBe(0);
    expect(ascendanceYieldBonusV1(3)).toBe(0);
    expect(ascendanceYieldBonusV1(4)).toBe(0.02);
    expect(ascendanceYieldBonusV1(10)).toBe(0.1149);
    expect(ascendanceYieldBonusV1(11)).toBe(0.1273);
    expect(ascendanceYieldBonusV1(100)).toBe(0.2996);
    expect(ascendanceYieldBonusV1(10_000)).toBe(0.3);

    expect(
      ascendanceYieldBreakdown(1_000, 11, { curveVersion: 1 })
    ).toEqual({
      generation: 11,
      curveVersion: 1,
      baseYield: 1_000,
      multiplierBps: 11_273,
      multiplier: 1.1273,
      bonusYield: 127,
      totalYield: 1_127,
    });
    expect(ascendanceYieldBreakdownV1(1_000, 11).totalYield).toBe(1_127);
    expect(applyAscendanceYieldV1(1_000, 10_000)).toBe(1_300);
  });
});

describe('Ascendance v2 compounding curve', () => {
  it('is neutral through Gen3 and begins with +2% at Gen4', () => {
    expect(ASCENDANCE_START_GENERATION).toBe(4);
    expect(ASCENDANCE_V2_GENERATION_FACTOR).toBe(1.02);
    expect(ascendanceYieldBonus(1)).toBe(0);
    expect(ascendanceYieldBonus(2)).toBe(0);
    expect(ascendanceYieldBonus(3)).toBe(0);
    expect(ascendanceYieldBonus(4)).toBeCloseTo(0.02, 12);
    expect(isAscended(3)).toBe(false);
    expect(isAscended(4)).toBe(true);
  });

  it('pins representative early, middle, and late values', () => {
    const waypoints: Array<[number, number]> = [
      [1, 10_000],
      [3, 10_000],
      [4, 10_200],
      [5, 10_404],
      [10, 11_487],
      [20, 14_002],
      [30, 17_069],
      [50, 25_363],
      [100, 68_268],
    ];

    for (const [generation, multiplierBps] of waypoints) {
      expect(ascendanceYieldMultiplierBpsV2(generation)).toBe(multiplierBps);
      expect(ascendanceYieldMultiplierBps(generation)).toBe(multiplierBps);
      expect(ascendanceYieldMultiplier(generation)).toBe(
        multiplierBps / ASCENDANCE_MULTIPLIER_BPS
      );
    }
  });

  it('keeps the same relative 2% gain instead of shrinking each upgrade', () => {
    for (let generation = 4; generation < 300; generation += 1) {
      const current = ascendanceYieldMultiplierBpsV2(generation);
      const next = ascendanceYieldMultiplierBpsV2(generation + 1);
      // Direct closed-form quantization may differ by one BPS from quantizing
      // the already-quantized prior generation.
      expect(Math.abs(next - Math.round(current * 1.02))).toBeLessThanOrEqual(1);
      expect(next).toBeGreaterThan(current);
    }
  });

  it('remains finite, integer, and bounded for adversarial generations', () => {
    for (const generation of [1_000, 10_000, Number.MAX_SAFE_INTEGER]) {
      const multiplierBps = ascendanceYieldMultiplierBpsV2(generation);
      expect(Number.isSafeInteger(multiplierBps)).toBe(true);
      expect(multiplierBps).toBeGreaterThanOrEqual(
        ASCENDANCE_MULTIPLIER_BPS
      );
      expect(multiplierBps).toBeLessThanOrEqual(Number.MAX_SAFE_INTEGER);
    }

    const settled = ascendanceYieldBreakdown(
      Number.MAX_SAFE_INTEGER,
      Number.MAX_SAFE_INTEGER
    );
    expect(settled.totalYield).toBe(Number.MAX_SAFE_INTEGER);
    expect(Number.isSafeInteger(settled.bonusYield)).toBe(true);
  });

  it('normalizes degenerate inputs without inventing or removing earned Yield', () => {
    expect(applyAscendanceYield(0, 50)).toBe(0);
    expect(applyAscendanceYield(-5, 50)).toBe(0);
    expect(applyAscendanceYield(Number.NaN, 50)).toBe(0);
    expect(applyAscendanceYield(100, Number.NaN)).toBe(100);
    expect(applyAscendanceYield(100, 3)).toBe(100);
    expect(applyAscendanceYield(100, 4)).toBe(102);
  });
});

describe('frozen authoritative settlement', () => {
  it('floors once using integer fixed-point arithmetic', () => {
    expect(ascendanceYieldBreakdown(777, 11)).toEqual({
      generation: 11,
      curveVersion: 2,
      baseYield: 777,
      multiplierBps: 11_717,
      multiplier: 1.1717,
      bonusYield: 133,
      totalYield: 910,
    });
  });

  it('uses a frozen multiplier exactly, independently of current generation math', () => {
    const frozen = ascendanceYieldBreakdown(1_000, 50, {
      curveVersion: 1,
      frozenMultiplierBps: 12_345,
    });
    expect(frozen).toEqual({
      generation: 50,
      curveVersion: 1,
      baseYield: 1_000,
      multiplierBps: 12_345,
      multiplier: 1.2345,
      bonusYield: 234,
      totalYield: 1_234,
    });
    expect(
      applyAscendanceYield(1_000, 50, {
        curveVersion: 1,
        frozenMultiplierBps: 12_345,
      })
    ).toBe(1_234);
  });

  it('records the selected curve even when the frozen multiplier wins', () => {
    const v1 = ascendanceYieldBreakdown(2_000, 4, {
      curveVersion: 1,
      frozenMultiplierBps: 10_000,
    });
    const v2 = ascendanceYieldBreakdown(2_000, 4, {
      curveVersion: 2,
      frozenMultiplierBps: 10_000,
    });
    expect(v1.curveVersion).toBe(1);
    expect(v2.curveVersion).toBe(2);
    expect(v1.totalYield).toBe(v2.totalYield);
  });

  it('cannot alter Score because the API accepts and returns Yield only', () => {
    const scoreBefore = 98_765;
    const yieldAfter = applyAscendanceYield(1_000, 50);
    const scoreAfter = scoreBefore;
    expect(yieldAfter).toBeGreaterThan(1_000);
    expect(scoreAfter).toBe(scoreBefore);
    expect(ascendanceYieldBreakdown(1_000, 50)).not.toHaveProperty('score');
  });

  it('formats neutral and compounded multipliers without hiding precision', () => {
    expect(formatYieldMultiplier(1)).toBe('1.00');
    expect(formatYieldMultiplier(1.02)).toBe('1.02');
    expect(formatYieldMultiplier(1.1487)).toBe('1.1487');
    expect(formatAscendanceYieldMultiplier(3)).toBe('1.00');
    expect(formatAscendanceYieldMultiplier(10)).toBe('1.1487');
    expect(formatAscendanceYieldMultiplier(11, 1)).toBe('1.1273');
  });
});

describe('evolution milestone metadata', () => {
  it('marks exactly every fifth generation', () => {
    expect(ASCENDANCE_EVOLUTION_INTERVAL).toBe(5);
    expect(ascendanceEvolutionMilestone(4)).toBeNull();
    expect(ascendanceEvolutionMilestone(6)).toBeNull();
    expect(ascendanceEvolutionMilestone(5)).toEqual({
      generation: 5,
      ordinal: 1,
      curveVersion: 2,
      multiplierBps: 10_404,
      multiplier: 1.0404,
    });
    expect(ascendanceEvolutionMilestone(20)?.ordinal).toBe(4);
  });

  it('exposes current, next, and progress without presentation copy', () => {
    expect(ascendanceEvolutionProgress(3)).toEqual({
      interval: 5,
      current: null,
      next: {
        generation: 5,
        ordinal: 1,
        curveVersion: 2,
        multiplierBps: 10_404,
        multiplier: 1.0404,
      },
      generationsUntilNext: 2,
    });

    const progress = ascendanceEvolutionProgress(12, 1);
    expect(progress.current?.generation).toBe(10);
    expect(progress.current?.curveVersion).toBe(1);
    expect(progress.next?.generation).toBe(15);
    expect(progress.generationsUntilNext).toBe(3);
  });

  it('does not overflow milestone metadata at the numeric safety boundary', () => {
    const progress = ascendanceEvolutionProgress(Number.MAX_SAFE_INTEGER);
    expect(progress.current?.generation).toBe(9_007_199_254_740_990);
    expect(progress.next).toBeNull();
    expect(progress.generationsUntilNext).toBe(0);
  });
});

describe('the unchanged breeding cost curve', () => {
  it('leaves every Gen1-3 child at its shipped price', () => {
    expect(breedingCost(1, 1)).toBe(300);
    expect(breedingCost(1, 2)).toBe(300);
    expect(breedingCost(2, 2)).toBe(400);
  });

  it('still steepens by 1.25 per generation past Gen3', () => {
    expect(ASCENDANCE_COST_STEEPENING).toBe(1.25);
    expect(breedingCost(3, 3)).toBe(Math.ceil(500 * 1.25));
    expect(breedingCost(4, 4)).toBe(Math.ceil(600 * 1.25 ** 2));
    expect(breedingCost(9, 9)).toBe(Math.ceil(1_100 * 1.25 ** 7));
  });

  it('outpaces the 2% Yield gain and remains symmetric, monotonic, and safe', () => {
    const costStep = breedingCost(10, 10) / breedingCost(9, 9);
    const yieldStep =
      ascendanceYieldMultiplier(11) / ascendanceYieldMultiplier(10);
    expect(costStep).toBeGreaterThan(yieldStep);
    expect(breedingCost(3, 5)).toBe(breedingCost(5, 3));
    for (let generation = 2; generation <= 60; generation += 1) {
      expect(breedingCost(generation, generation)).toBeGreaterThanOrEqual(
        breedingCost(generation - 1, generation - 1)
      );
    }
    expect(breedingCost(5_000, 5_000)).toBeLessThanOrEqual(1_000_000_000);
    expect(Number.isSafeInteger(breedingCost(5_000, 5_000))).toBe(true);
  });
});

describe('offspringGeneration', () => {
  it('is one above the highest parent, with only a numeric safety guard', () => {
    expect(offspringGeneration(1, 1)).toBe(2);
    expect(offspringGeneration(2, 5)).toBe(6);
    expect(offspringGeneration(50, 50)).toBe(51);
    expect(offspringGeneration(999, 3)).toBe(1_000);
    expect(offspringGeneration(Number.MAX_SAFE_INTEGER, 1)).toBe(
      Number.MAX_SAFE_INTEGER
    );
  });
});

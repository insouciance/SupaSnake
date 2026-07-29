import { describe, expect, it } from '@jest/globals';
import {
  ACTIVE_GROWTH_PROFILE,
  DEFAULT_GROWTH_PROFILE,
  GROWTH_PROFILES,
  PRIMAL_GROWTH_STAGES,
  baseGrowthForFood,
  isGrowthProfileId,
  primalGrowthAtLength,
  resolveGrowthProfile,
  type GrowthProfileId,
} from './growth';

const ALL = Object.keys(GROWTH_PROFILES) as GrowthProfileId[];

describe('the ruled dynasty growth profile', () => {
  it.each(['CYBER', 'COSMIC'] as const)('%s stays +1 at every length', (dynasty) => {
    const profile = GROWTH_PROFILES.dynasty;
    for (const length of [3, 40, 74, 75, 95, 96, 119, 120, 300]) {
      expect(baseGrowthForFood(profile, 50, dynasty, length)).toBe(1);
    }
  });

  it('PRIMAL downshifts +4 -> +3 -> +2 -> +1 at modelled-length thresholds', () => {
    expect(PRIMAL_GROWTH_STAGES).toEqual([
      { untilLength: 75, growth: 4 },
      { untilLength: 96, growth: 3 },
      { untilLength: 120, growth: 2 },
      { untilLength: Number.POSITIVE_INFINITY, growth: 1 },
    ]);
    expect(primalGrowthAtLength(3)).toBe(4);
    expect(primalGrowthAtLength(74)).toBe(4);
    expect(primalGrowthAtLength(75)).toBe(3);
    expect(primalGrowthAtLength(95)).toBe(3);
    expect(primalGrowthAtLength(96)).toBe(2);
    expect(primalGrowthAtLength(119)).toBe(2);
    expect(primalGrowthAtLength(120)).toBe(1);
    expect(primalGrowthAtLength(399)).toBe(1);
  });

  it('uses logical length, so extra growth advances rather than delays a downshift', () => {
    const profile = GROWTH_PROFILES.dynasty;
    expect(baseGrowthForFood(profile, 10, 'PRIMAL', 74)).toBe(4);
    expect(baseGrowthForFood(profile, 10, 'PRIMAL', 75)).toBe(3);
    expect(baseGrowthForFood(profile, 10, 'PRIMAL', 120)).toBe(1);
  });

  it('has a deterministic base-only fallback for diagnostics without live length', () => {
    const profile = GROWTH_PROFILES.dynasty;
    const rates = Array.from({ length: 80 }, (_, index) =>
      baseGrowthForFood(profile, index + 1, 'PRIMAL')
    );
    expect(rates[0]).toBe(4);
    expect(rates).toContain(3);
    expect(rates).toContain(2);
    expect(rates.at(-1)).toBe(1);
  });
});

describe('growth compatibility', () => {
  it('keeps missing historical stamps on the +1 baseline', () => {
    expect(DEFAULT_GROWTH_PROFILE).toBe('baseline');
    expect(resolveGrowthProfile(undefined).id).toBe('baseline');
    for (const n of [1, 20, 100, 500]) {
      expect(baseGrowthForFood(GROWTH_PROFILES.baseline, n)).toBe(1);
    }
  });

  it('explicitly stamps new sessions with the dynasty profile', () => {
    expect(ACTIVE_GROWTH_PROFILE).toBe('dynasty');
    expect(ACTIVE_GROWTH_PROFILE).not.toBe(DEFAULT_GROWTH_PROFILE);
  });

  it('retains the legacy ladder curves unchanged', () => {
    const tuned = GROWTH_PROFILES.tuned;
    expect(baseGrowthForFood(tuned, 1)).toBe(6);
    expect(baseGrowthForFood(tuned, 11)).toBe(6);
    expect(baseGrowthForFood(tuned, 12)).toBe(2);
    expect(baseGrowthForFood(tuned, 38)).toBe(3);
    expect(baseGrowthForFood(tuned, 200)).toBe(8);

    const aggressive = GROWTH_PROFILES.aggressive;
    expect(baseGrowthForFood(aggressive, 1)).toBe(8);
    expect(baseGrowthForFood(aggressive, 200)).toBe(10);
  });

  it('every profile keeps one food on the board and never shrinks', () => {
    for (const id of ALL) {
      const profile = GROWTH_PROFILES[id];
      expect(profile.simultaneousFoods).toBe(1);
      for (let n = 1; n <= 200; n += 1) {
        expect(baseGrowthForFood(profile, n)).toBeGreaterThanOrEqual(1);
      }
    }
  });

  it('resolves only known profile ids and never throws on malformed stamps', () => {
    for (const id of ALL) {
      expect(isGrowthProfileId(id)).toBe(true);
      expect(resolveGrowthProfile(id).id).toBe(id);
    }
    for (const bad of [undefined, null, '', 'legendary', 42, {}, [], NaN]) {
      expect(isGrowthProfileId(bad)).toBe(false);
      expect(resolveGrowthProfile(bad).id).toBe(DEFAULT_GROWTH_PROFILE);
    }
  });

  it('is defensive about invalid food indices and lengths', () => {
    const profile = GROWTH_PROFILES.dynasty;
    expect(baseGrowthForFood(profile, 0, 'PRIMAL')).toBe(
      baseGrowthForFood(profile, 1, 'PRIMAL')
    );
    expect(baseGrowthForFood(profile, Number.NaN, 'PRIMAL')).toBe(4);
    expect(primalGrowthAtLength(Number.NaN)).toBe(4);
  });
});

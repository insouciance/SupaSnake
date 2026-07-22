/**
 * Per-dynasty Mastery (Design v2 section 7.1) - level curve, XP rule, and
 * pool computation. The curve boundaries here ARE the doc's table; the
 * level_for_xp SQL function (migration 019) must stay in lockstep.
 */

import { describe, expect, it } from '@jest/globals';
import {
  MASTERY_MAX_LEVEL,
  MASTERY_MUTATIONS,
  MASTERY_MUTATION_LEVELS,
  MASTERY_THRESHOLDS,
  MASTERY_TOTAL_XP,
  MASTERY_UNLOCK_TRACK,
  MASTERY_XP_TO_NEXT,
  fullMutationPool,
  levelForXp,
  masteryProgress,
  masteryUnlockLabel,
  masteryXpForRun,
  unlockedMutationPool,
} from '@/shared/game/mastery';
import { MUTATIONS, MUTATION_POOL } from '@/shared/game/mutations';
import type { DynastyName } from '@/shared/game/rulesets';

const DYNASTIES: DynastyName[] = ['PRIMAL', 'CYBER', 'COSMIC'];

describe('mastery level curve (doc section 7.1 table)', () => {
  it('XP-to-next matches the doc: 1k/2k/4k/7k/11k/16k/22k/29k/37k/46k', () => {
    expect(MASTERY_XP_TO_NEXT).toEqual([
      1000, 2000, 4000, 7000, 11000, 16000, 22000, 29000, 37000, 46000,
    ]);
  });

  it('cumulative total is the doc anchor 175,000', () => {
    expect(MASTERY_TOTAL_XP).toBe(175000);
    expect(MASTERY_THRESHOLDS).toEqual([
      0, 1000, 3000, 7000, 14000, 25000, 41000, 63000, 92000, 129000, 175000,
    ]);
  });

  it('levelForXp hits every threshold boundary exactly', () => {
    for (let level = 1; level <= MASTERY_MAX_LEVEL; level++) {
      const threshold = MASTERY_THRESHOLDS[level];
      expect(levelForXp(threshold - 1)).toBe(level - 1);
      expect(levelForXp(threshold)).toBe(level);
    }
  });

  it('clamps: zero, negative, NaN => 0; beyond 175k stays M10', () => {
    expect(levelForXp(0)).toBe(0);
    expect(levelForXp(-500)).toBe(0);
    expect(levelForXp(Number.NaN)).toBe(0);
    expect(levelForXp(10_000_000)).toBe(10);
  });

  it('masteryProgress reports into-level and to-next correctly', () => {
    expect(masteryProgress(0)).toEqual({ level: 0, intoLevel: 0, toNext: 1000 });
    expect(masteryProgress(1500)).toEqual({
      level: 1,
      intoLevel: 500,
      toNext: 1500,
    });
    expect(masteryProgress(7000)).toEqual({
      level: 3,
      intoLevel: 0,
      toNext: 7000,
    });
    // Track complete: no next level
    expect(masteryProgress(175000)).toEqual({
      level: 10,
      intoLevel: 0,
      toNext: null,
    });
  });
});

describe('masteryXpForRun (banked XP, pre-account-multiplier)', () => {
  it('extracted runs grant floor(raw x 1.25)', () => {
    expect(masteryXpForRun(100, true)).toBe(125);
    expect(masteryXpForRun(10, true)).toBe(12); // 12.5 floors
    expect(masteryXpForRun(0, true)).toBe(0);
  });

  it('deaths grant nothing regardless of raw DNA', () => {
    expect(masteryXpForRun(100, false)).toBe(0);
    expect(masteryXpForRun(99999, false)).toBe(0);
  });

  it('garbage raw values grant nothing', () => {
    expect(masteryXpForRun(-50, true)).toBe(0);
    expect(masteryXpForRun(Number.NaN, true)).toBe(0);
  });
});

describe('unlockedMutationPool (base ten + M3/M6/M9 per dynasty)', () => {
  it('level 0-2: exactly the base pool, no mastery mutations', () => {
    for (const dynasty of DYNASTIES) {
      expect(unlockedMutationPool(dynasty, 0)).toEqual(MUTATION_POOL);
      expect(unlockedMutationPool(dynasty, 2)).toEqual(MUTATION_POOL);
    }
  });

  it('the base pool itself never contains a mastery mutation', () => {
    for (const dynasty of DYNASTIES) {
      for (const level of MASTERY_MUTATION_LEVELS) {
        expect(MUTATION_POOL).not.toContain(MASTERY_MUTATIONS[dynasty][level]);
      }
    }
  });

  it('each mutation rung adds exactly its dynasty mutation', () => {
    for (const dynasty of DYNASTIES) {
      const m3 = MASTERY_MUTATIONS[dynasty][3];
      const m6 = MASTERY_MUTATIONS[dynasty][6];
      const m9 = MASTERY_MUTATIONS[dynasty][9];

      const at3 = unlockedMutationPool(dynasty, 3);
      expect(at3).toContain(m3);
      expect(at3).not.toContain(m6);
      expect(at3).not.toContain(m9);
      expect(at3).toHaveLength(MUTATION_POOL.length + 1);

      const at8 = unlockedMutationPool(dynasty, 8);
      expect(at8).toContain(m3);
      expect(at8).toContain(m6);
      expect(at8).not.toContain(m9);

      const at9 = unlockedMutationPool(dynasty, 9);
      expect(at9).toEqual([...MUTATION_POOL, m3, m6, m9]);
      expect(unlockedMutationPool(dynasty, 10)).toEqual(at9);
    }
  });

  it('fullMutationPool = the M10 pool (Free Play showroom, section 7.4)', () => {
    for (const dynasty of DYNASTIES) {
      expect(fullMutationPool(dynasty)).toEqual(
        unlockedMutationPool(dynasty, MASTERY_MAX_LEVEL)
      );
      expect(fullMutationPool(dynasty)).toHaveLength(13);
    }
  });

  it('every mastery mutation has a full definition', () => {
    for (const dynasty of DYNASTIES) {
      for (const level of MASTERY_MUTATION_LEVELS) {
        const def = MUTATIONS[MASTERY_MUTATIONS[dynasty][level]];
        expect(def.name.length).toBeGreaterThan(0);
        expect(def.effect.length).toBeGreaterThan(0);
        expect(def.cost.length).toBeGreaterThan(0);
        expect(['E', 'P', 'EP']).toContain(def.kind);
      }
    }
  });
});

describe('unlock track (doc table M1-M10)', () => {
  it('has 10 rungs with mutations at exactly M3/M6/M9', () => {
    expect(MASTERY_UNLOCK_TRACK).toHaveLength(10);
    for (const rung of MASTERY_UNLOCK_TRACK) {
      const isMutationLevel = (MASTERY_MUTATION_LEVELS as readonly number[])
        .includes(rung.level);
      expect(rung.kind).toBe(isMutationLevel ? 'mutation' : 'cosmetic');
    }
  });

  it('mutation rungs are labeled with the actual mutation name', () => {
    expect(masteryUnlockLabel('PRIMAL', 3)).toBe('Deep Roots');
    expect(masteryUnlockLabel('CYBER', 9)).toBe('Overclock Harvest');
    expect(masteryUnlockLabel('COSMIC', 6)).toBe('Gravity Well');
    expect(masteryUnlockLabel('PRIMAL', 1)).toBe('Dynasty Emblem I');
    expect(masteryUnlockLabel('PRIMAL', 10)).toBe(
      'Heartwood + Sovereign Emblem + Title'
    );
  });
});

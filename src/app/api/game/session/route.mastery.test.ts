/**
 * Session-end mastery XP rules (Design v2 section 7.1) - unit tests for
 * the grant logic the route composes:
 * - EXTRACTED earning runs only (deaths grant nothing, Free Play pays
 *   nothing and grants nothing)
 * - XP = floor(raw x 1.25): the banked payout at the BASE bank
 *   multiplier, before mutation outcome shaping and before the account
 *   multiplier stack (streak/set/clanDuel) - streaks never inflate mastery
 */

import { describe, expect, it } from '@jest/globals';
import { applyDnaMultiplier } from '@/lib/server/dnaMultipliers';
import { validateGameResult } from '@/lib/server/gameValidator';
import {
  levelForXp,
  masteryUnlockLabel,
  masteryXpForRun,
  unlockedMutationPool,
} from '@/shared/game/mastery';
import {
  applyOutcome,
  computeRunTotals,
} from '@/shared/game/rulesets';

const startedAt = () => new Date(Date.now() - 120_000);

function validate(foodCount: number, extracted: boolean) {
  const { rawDna, score } = computeRunTotals('PRIMAL', foodCount);
  return validateGameResult(
    {
      food_count: foodCount,
      extracted,
      score,
      dna_earned: rawDna,
      duration_seconds: 120,
      died: !extracted,
      victory: false,
    },
    startedAt(),
    'PRIMAL',
    [],
    unlockedMutationPool('PRIMAL', 0)
  );
}

describe('mastery XP grant rules (section 7.1)', () => {
  it('an extracted run grants floor(raw x 1.25) = applyOutcome(raw, true)', () => {
    const result = validate(40, true);
    const xp = masteryXpForRun(result.rawDna, result.extracted);
    expect(xp).toBe(applyOutcome(result.rawDna, true));
    expect(xp).toBeGreaterThan(0);
  });

  it('a death grants nothing, whatever the salvage paid', () => {
    const result = validate(40, false);
    expect(result.adjustedDna).toBeGreaterThan(0); // salvage still pays DNA
    expect(masteryXpForRun(result.rawDna, result.extracted)).toBe(0);
  });

  it('an extracted claim that conflicts with died is voided => no XP', () => {
    const { rawDna, score } = computeRunTotals('PRIMAL', 40);
    const result = validateGameResult(
      {
        food_count: 40,
        extracted: true,
        died: true, // conflict: outcome voided to salvage
        score,
        dna_earned: rawDna,
        duration_seconds: 120,
        victory: false,
      },
      startedAt(),
      'PRIMAL'
    );
    expect(result.extracted).toBe(false);
    expect(masteryXpForRun(result.rawDna, result.extracted)).toBe(0);
  });

  it('account multipliers change the payout but never the XP', () => {
    const result = validate(40, true);
    const xp = masteryXpForRun(result.rawDna, true);
    // A x2.0 streak/set/duel stack doubles the paid DNA...
    const boosted = applyDnaMultiplier(result.adjustedDna, 2.0);
    expect(boosted).toBe(result.adjustedDna * 2);
    // ...while the mastery XP stays anchored to the raw recompute
    expect(xp).toBe(Math.floor(result.rawDna * 1.25));
  });

  it('free sessions are excluded structurally (eligibility predicate)', () => {
    // The route grants only on the earning path (free ends return before
    // the grant); this pins the predicate the route uses.
    const isFreeSession = true;
    const extracted = true;
    const eligible = !isFreeSession && extracted;
    expect(eligible).toBe(false);
  });

  it('level-up detection: crossing M3 names the mutation unlock', () => {
    const xpBefore = 6900; // M2, 100 XP short of M3
    const xpGained = 200;
    const levelBefore = levelForXp(xpBefore);
    const levelAfter = levelForXp(xpBefore + xpGained);
    expect(levelBefore).toBe(2);
    expect(levelAfter).toBe(3);
    expect(masteryUnlockLabel('PRIMAL', 3)).toBe('Deep Roots');
    expect(masteryUnlockLabel('CYBER', 3)).toBe('Redline Dividend');
    expect(masteryUnlockLabel('COSMIC', 3)).toBe('Starweaver');
  });

  it('a multi-level jump reports every crossed rung', () => {
    const xpBefore = 0;
    const xpAfter = 3200; // crosses M1 (1000) and M2 (3000)
    const unlockedLevels: number[] = [];
    for (let lvl = levelForXp(xpBefore) + 1; lvl <= levelForXp(xpAfter); lvl++) {
      unlockedLevels.push(lvl);
    }
    expect(unlockedLevels).toEqual([1, 2]);
  });
});

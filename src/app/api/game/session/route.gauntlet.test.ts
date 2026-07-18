/**
 * Session pool-ban integration (Design v2 section 8.2 item 3) - unit tests
 * for the composition the session route performs:
 * - START: the offer pool sent to the engine is the mastery pool MINUS the
 *   opponent's ban; Free Play is NEVER banned; pre-020 (null ban) is a
 *   byte-for-byte no-op.
 * - END: the validator sees the SAME banned pool, so a banned pick is
 *   dropped + flagged and the payout is recomputed without it.
 */

import { describe, expect, it } from '@jest/globals';
import { applyGauntletBan } from '@/shared/game/gauntlet';
import {
  fullMutationPool,
  unlockedMutationPool,
} from '@/shared/game/mastery';
import { validateGameResult } from '@/lib/server/gameValidator';
import { computeRunTotals } from '@/shared/game/rulesets';

describe('session start: offer pool minus the opponent ban', () => {
  it('an active ban removes exactly that mutation from the earning pool', () => {
    const pool = applyGauntletBan(unlockedMutationPool('CYBER', 0), 'phoenix');
    expect(pool).not.toContain('phoenix');
    expect(pool).toHaveLength(unlockedMutationPool('CYBER', 0).length - 1);
  });

  it('mastery unlocks and the ban compose (banned mastery mutation)', () => {
    const pool = applyGauntletBan(unlockedMutationPool('CYBER', 3), 'redline_dividend');
    expect(unlockedMutationPool('CYBER', 3)).toContain('redline_dividend');
    expect(pool).not.toContain('redline_dividend');
  });

  it('PRE-020 / no duel / outside the window: null ban leaves the pool untouched', () => {
    expect(applyGauntletBan(unlockedMutationPool('PRIMAL', 6), null))
      .toEqual(unlockedMutationPool('PRIMAL', 6));
  });

  it('Free Play is never banned - the full practice pool stays complete', () => {
    // The route passes ban=null for free sessions by construction; the
    // practice pool must keep every mutation (section 7.4: showroom).
    const pool = applyGauntletBan(fullMutationPool('COSMIC'), null);
    expect(pool).toEqual(fullMutationPool('COSMIC'));
    expect(pool).toContain('starweaver');
    expect(pool).toContain('phoenix');
  });
});

describe('session end: validator mirrors the banned pool', () => {
  const startedAt = () => new Date(Date.now() - 120_000);

  function endRun(pool: ReturnType<typeof unlockedMutationPool>) {
    const { rawDna, score } = computeRunTotals('CYBER', 40);
    return validateGameResult(
      {
        food_count: 40,
        extracted: true,
        score,
        dna_earned: rawDna,
        duration_seconds: 120,
        died: false,
        victory: false,
        mutations: [{ id: 'phoenix', atFood: 20 }],
      },
      startedAt(),
      'CYBER',
      [],
      pool
    );
  }

  it('a banned pick is dropped and flagged MUTATION_LOCKED', () => {
    const banned = applyGauntletBan(unlockedMutationPool('CYBER', 0), 'phoenix');
    const result = endRun(banned);
    expect(result.mutations).toEqual([]);
    expect(result.errors.some((e) => e.includes('MUTATION_LOCKED: phoenix'))).toBe(true);
  });

  it('the same pick passes when no ban is active (pre-020 behavior)', () => {
    const result = endRun(applyGauntletBan(unlockedMutationPool('CYBER', 0), null));
    expect(result.mutations.map((m) => m.id)).toEqual(['phoenix']);
    expect(result.errors.some((e) => e.includes('MUTATION_LOCKED'))).toBe(false);
  });

  it('non-banned picks are unaffected by an active ban', () => {
    const banned = applyGauntletBan(unlockedMutationPool('CYBER', 0), 'shed');
    const result = endRun(banned);
    expect(result.mutations.map((m) => m.id)).toEqual(['phoenix']);
  });
});

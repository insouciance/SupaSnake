/**
 * Validator tests for mastery pool gating (Design v2 section 7.1):
 * picks are checked against the player's ACTUAL unlocked pool (recomputed
 * server-side from player_mastery) - out-of-pool picks are dropped and
 * flagged, and the payout is the recompute of the accepted picks only.
 * A client can therefore never smuggle un-earned mutation economics in.
 */

import { describe, expect, it } from '@jest/globals';
import { validateGameResult, type GameResultInput } from './gameValidator';
import {
  fullMutationPool,
  unlockedMutationPool,
} from '@/shared/game/mastery';
import { MUTATION_POOL } from '@/shared/game/mutations';
import {
  applyOutcomeWithMutations,
  computeRunTotals,
} from '@/shared/game/rulesets';

function input(overrides: Partial<GameResultInput> = {}): GameResultInput {
  const foodCount = overrides.food_count ?? 50;
  const dynasty = 'PRIMAL';
  const { rawDna, score } = computeRunTotals(dynasty, foodCount);
  return {
    food_count: foodCount,
    extracted: true,
    score,
    dna_earned: rawDna,
    duration_seconds: 120,
    died: false,
    victory: false,
    ...overrides,
  };
}

const startedAt = () => new Date(Date.now() - 120_000);

describe('pool gating (MUTATION_LOCKED)', () => {
  it('drops a mastery pick the player has not unlocked and flags the run', () => {
    const claim = input({
      mutations: [{ id: 'ancient_grove', atFood: 20 }],
    });
    const result = validateGameResult(
      claim,
      startedAt(),
      'PRIMAL',
      [],
      MUTATION_POOL // level 0 pool - no mastery unlocks
    );
    expect(result.mutations).toEqual([]);
    expect(result.valid).toBe(false);
    expect(
      result.errors.some((e) => e.startsWith('MUTATION_LOCKED: ancient_grove'))
    ).toBe(true);
    // The payout is the recompute WITHOUT the locked pick
    const { rawDna } = computeRunTotals('PRIMAL', 50);
    expect(result.rawDna).toBe(rawDna);
    expect(result.adjustedDna).toBe(applyOutcomeWithMutations(rawDna, true));
  });

  it('accepts the same pick when the pool includes it (M6 unlocked)', () => {
    const picks = [{ id: 'ancient_grove' as const, atFood: 20 }];
    const { rawDna, score } = computeRunTotals('PRIMAL', 50, picks);
    const claim = input({ mutations: picks, dna_earned: rawDna, score });
    const result = validateGameResult(
      claim,
      startedAt(),
      'PRIMAL',
      [],
      unlockedMutationPool('PRIMAL', 6)
    );
    expect(result.valid).toBe(true);
    expect(result.mutations).toEqual(picks);
    expect(result.rawDna).toBe(rawDna);
  });

  it('a locked pick is dropped even among legal picks (payout from the rest)', () => {
    const legal = { id: 'overgrowth' as const, atFood: 15 };
    const locked = { id: 'redline_dividend' as const, atFood: 30 };
    const result = validateGameResult(
      input({ mutations: [legal, locked] }),
      startedAt(),
      'CYBER',
      [],
      MUTATION_POOL
    );
    expect(result.mutations).toEqual([legal]);
    expect(
      result.errors.some((e) => e.startsWith('MUTATION_LOCKED: redline_dividend'))
    ).toBe(true);
    const { rawDna } = computeRunTotals('CYBER', 50, [legal]);
    expect(result.rawDna).toBe(rawDna);
  });

  it('null pool disables gating (legacy callers)', () => {
    const picks = [{ id: 'starweaver' as const, atFood: 20 }];
    const result = validateGameResult(
      input({ mutations: picks }),
      startedAt(),
      'PRIMAL',
      []
      // no pool argument
    );
    expect(result.mutations).toEqual(picks);
    expect(
      result.errors.some((e) => e.startsWith('MUTATION_LOCKED'))
    ).toBe(false);
  });

  it('the full pool (Free Play, section 7.4) accepts any mastery pick', () => {
    const picks = [{ id: 'tectonic_patience' as const, atFood: 20 }];
    const { rawDna, score } = computeRunTotals('PRIMAL', 50, picks);
    const result = validateGameResult(
      input({ mutations: picks, dna_earned: rawDna, score }),
      startedAt(),
      'PRIMAL',
      [],
      fullMutationPool('PRIMAL')
    );
    expect(result.valid).toBe(true);
    expect(result.mutations).toEqual(picks);
  });

  it('a foreign dynasty mastery mutation is locked out of an earned pool', () => {
    // COSMIC's starweaver is never in PRIMAL's pool, even at M10
    const result = validateGameResult(
      input({ mutations: [{ id: 'starweaver', atFood: 20 }] }),
      startedAt(),
      'PRIMAL',
      [],
      unlockedMutationPool('PRIMAL', 10)
    );
    expect(result.mutations).toEqual([]);
    expect(
      result.errors.some((e) => e.startsWith('MUTATION_LOCKED: starweaver'))
    ).toBe(true);
  });
});

describe('rawDna exposure (the mastery XP base)', () => {
  it('rawDna is the pre-outcome recompute; adjustedDna applies the outcome', () => {
    const result = validateGameResult(input(), startedAt(), 'PRIMAL', []);
    const { rawDna } = computeRunTotals('PRIMAL', 50);
    expect(result.rawDna).toBe(rawDna);
    expect(result.adjustedDna).toBe(Math.floor(rawDna * 1.25));
  });

  it('rawDna excludes Mirror Wager outcome shaping (bank x1.5 never inflates XP)', () => {
    const picks = [{ id: 'mirror_wager' as const, atFood: 20 }];
    const { rawDna, score } = computeRunTotals('PRIMAL', 50, picks);
    const result = validateGameResult(
      input({ mutations: picks, dna_earned: rawDna, score }),
      startedAt(),
      'PRIMAL',
      []
    );
    expect(result.rawDna).toBe(rawDna);
    expect(result.adjustedDna).toBe(Math.floor(rawDna * 1.5)); // payout
    // XP base stays raw: floor(raw x 1.25) < the wagered payout
    expect(Math.floor(result.rawDna * 1.25)).toBeLessThan(result.adjustedDna);
  });

  it('rawDna includes the ACCEPTED (clamped) COSMIC combo bonus', () => {
    const foodCount = 50;
    const base = computeRunTotals('COSMIC', foodCount);
    const result = validateGameResult(
      input({
        food_count: foodCount,
        dna_earned: base.rawDna,
        score: base.score,
        cosmic: { combo_dna_bonus: 100, combo_score_bonus: 100, max_chain: 6 },
      }),
      startedAt(),
      'COSMIC',
      []
    );
    expect(result.rawDna).toBe(base.rawDna + 100);
  });

  it('rawDna excludes the victory bonus', () => {
    const result = validateGameResult(
      input({ victory: true }),
      startedAt(),
      'PRIMAL',
      []
    );
    const { rawDna } = computeRunTotals('PRIMAL', 50);
    expect(result.rawDna).toBe(rawDna);
    expect(result.adjustedDna).toBeGreaterThan(Math.floor(rawDna * 1.25));
  });
});

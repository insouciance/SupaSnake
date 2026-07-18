/**
 * Tests for the Design v2 game validator: exact server recompute via the
 * shared ruleset module, per-dynasty bounds, outcome consistency, and the
 * "claims can flag but never inflate" guarantee.
 */

import {
  validateGameResult,
  CLAIM_EPSILON,
  type GameResultInput,
} from './gameValidator';
import {
  applyOutcome,
  computeRunTotals,
  type DynastyName,
} from '@/shared/game/rulesets';

/** Build an honest input: claims exactly match the recompute. */
function honestInput(
  dynasty: DynastyName,
  foodCount: number,
  extracted: boolean,
  duration = 120,
  overrides: Partial<GameResultInput> = {}
): GameResultInput {
  const { rawDna, score } = computeRunTotals(dynasty, foodCount);
  return {
    food_count: foodCount,
    extracted,
    score,
    dna_earned: rawDna,
    duration_seconds: duration,
    died: !extracted,
    victory: false,
    ...overrides,
  };
}

/** serverStartedAt long enough ago that duration bounds never interfere. */
function startedAgo(seconds: number): Date {
  return new Date(Date.now() - seconds * 1000);
}

describe('validateGameResult (Design v2 recompute)', () => {
  describe('exact recompute pays the authoritative amount', () => {
    it.each<[DynastyName, number]>([
      ['PRIMAL', 30],
      ['PRIMAL', 60],
      ['CYBER', 30],
      ['CYBER', 60],
      ['COSMIC', 30],
    ])('banked %s run at %i foods pays applyOutcome(raw, true)', (dynasty, foods) => {
      const input = honestInput(dynasty, foods, true, 180);
      const result = validateGameResult(input, startedAgo(185), dynasty);
      const { rawDna, score } = computeRunTotals(dynasty, foods);

      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
      expect(result.adjustedDna).toBe(applyOutcome(rawDna, true));
      expect(result.adjustedScore).toBe(score);
      expect(result.foodCount).toBe(foods);
      expect(result.extracted).toBe(true);
    });

    it.each<[DynastyName, number]>([
      ['PRIMAL', 30],
      ['CYBER', 30],
      ['COSMIC', 45],
    ])('death %s run at %i foods pays the 60%% salvage', (dynasty, foods) => {
      const input = honestInput(dynasty, foods, false, 180);
      const result = validateGameResult(input, startedAgo(185), dynasty);
      const { rawDna } = computeRunTotals(dynasty, foods);

      expect(result.valid).toBe(true);
      expect(result.adjustedDna).toBe(applyOutcome(rawDna, false));
      expect(result.extracted).toBe(false);
    });

    it('banked beats died for the same run', () => {
      const banked = validateGameResult(
        honestInput('PRIMAL', 30, true, 180),
        startedAgo(185),
        'PRIMAL'
      );
      const died = validateGameResult(
        honestInput('PRIMAL', 30, false, 180),
        startedAgo(185),
        'PRIMAL'
      );
      expect(banked.adjustedDna).toBeGreaterThan(died.adjustedDna);
      // PRIMAL 30 foods: raw 387 -> banked 483, salvage 232
      expect(banked.adjustedDna).toBe(483);
      expect(died.adjustedDna).toBe(232);
    });

    it('pays per the session dynasty, not the claim size', () => {
      const primal = validateGameResult(
        honestInput('PRIMAL', 30, false, 180),
        startedAgo(185),
        'PRIMAL'
      );
      const cyber = validateGameResult(
        honestInput('CYBER', 30, false, 180),
        startedAgo(185),
        'CYBER'
      );
      // CYBER's tier multiplier out-earns PRIMAL at the same food count
      expect(cyber.adjustedDna).toBeGreaterThan(primal.adjustedDna);
    });

    it('handles a zero-food run', () => {
      const result = validateGameResult(
        honestInput('PRIMAL', 0, false, 10),
        startedAgo(12),
        'PRIMAL'
      );
      expect(result.valid).toBe(true);
      expect(result.adjustedDna).toBe(0);
      expect(result.adjustedScore).toBe(0);
    });

    it('adds the victory bonus on top of the outcome payout', () => {
      const input = honestInput('PRIMAL', 30, true, 180, {
        victory: true,
        died: false,
      });
      const result = validateGameResult(input, startedAgo(185), 'PRIMAL');
      const { rawDna } = computeRunTotals('PRIMAL', 30);
      expect(result.adjustedDna).toBe(applyOutcome(rawDna, true) + 50);
    });
  });

  describe('cheat attempts: claims flag but never inflate', () => {
    it('pays the recomputed value when the DNA claim is inflated', () => {
      const input = honestInput('PRIMAL', 30, false, 180, {
        dna_earned: 999999,
      });
      const result = validateGameResult(input, startedAgo(185), 'PRIMAL');
      const { rawDna } = computeRunTotals('PRIMAL', 30);

      expect(result.valid).toBe(false);
      expect(result.errors).toContainEqual(expect.stringContaining('DNA_MISMATCH'));
      // Payout unchanged: exactly the salvage of the recomputed raw total
      expect(result.adjustedDna).toBe(applyOutcome(rawDna, false));
    });

    it('pays the recomputed value when the DNA claim is deflated (still flags)', () => {
      const input = honestInput('CYBER', 20, true, 120, { dna_earned: 1 });
      const result = validateGameResult(input, startedAgo(125), 'CYBER');
      const { rawDna } = computeRunTotals('CYBER', 20);

      expect(result.valid).toBe(false);
      expect(result.adjustedDna).toBe(applyOutcome(rawDna, true));
    });

    it('flags an inflated score claim but stores the recomputed score', () => {
      const input = honestInput('PRIMAL', 30, false, 180, { score: 99999 });
      const result = validateGameResult(input, startedAgo(185), 'PRIMAL');

      expect(result.valid).toBe(false);
      expect(result.errors).toContainEqual(expect.stringContaining('SCORE_MISMATCH'));
      expect(result.adjustedScore).toBe(computeRunTotals('PRIMAL', 30).score);
    });

    it('tolerates claims within the rounding epsilon', () => {
      const { rawDna, score } = computeRunTotals('PRIMAL', 30);
      const input = honestInput('PRIMAL', 30, false, 180, {
        dna_earned: rawDna + CLAIM_EPSILON,
        score: score - CLAIM_EPSILON,
      });
      const result = validateGameResult(input, startedAgo(185), 'PRIMAL');
      expect(result.valid).toBe(true);
    });

    it('claiming a CYBER-sized total on a PRIMAL session flags and pays PRIMAL', () => {
      const cyberTotals = computeRunTotals('CYBER', 30);
      const input = honestInput('PRIMAL', 30, false, 180, {
        dna_earned: cyberTotals.rawDna,
        score: cyberTotals.score,
      });
      const result = validateGameResult(input, startedAgo(185), 'PRIMAL');

      expect(result.valid).toBe(false);
      expect(result.adjustedDna).toBe(
        applyOutcome(computeRunTotals('PRIMAL', 30).rawDna, false)
      );
    });
  });

  describe('outcome consistency', () => {
    it('rejects extracted+died and voids the bank bonus', () => {
      const input = honestInput('PRIMAL', 30, true, 180, { died: true });
      const result = validateGameResult(input, startedAgo(185), 'PRIMAL');
      const { rawDna } = computeRunTotals('PRIMAL', 30);

      expect(result.valid).toBe(false);
      expect(result.errors).toContainEqual(expect.stringContaining('INVALID_OUTCOME'));
      expect(result.extracted).toBe(false);
      // Conflicting claims pay the salvage rate, never the bank rate
      expect(result.adjustedDna).toBe(applyOutcome(rawDna, false));
    });

    it('flags non-integer and negative food counts', () => {
      const fractional = validateGameResult(
        honestInput('PRIMAL', 10, false, 60, { food_count: 10.5 }),
        startedAgo(65),
        'PRIMAL'
      );
      expect(fractional.valid).toBe(false);
      expect(fractional.errors).toContainEqual(
        expect.stringContaining('INVALID_FOOD_COUNT')
      );

      const negative = validateGameResult(
        honestInput('PRIMAL', 10, false, 60, { food_count: -3 }),
        startedAgo(65),
        'PRIMAL'
      );
      expect(negative.valid).toBe(false);
      expect(negative.foodCount).toBe(0);
      expect(negative.adjustedDna).toBe(0);
    });
  });

  describe('per-dynasty food-rate bound', () => {
    it('clamps a PRIMAL food count above 1.0 foods/sec and recomputes from the clamp', () => {
      // 100 foods in 60s is impossible on a fixed 200ms tick
      const input = honestInput('PRIMAL', 100, false, 60);
      const result = validateGameResult(input, startedAgo(65), 'PRIMAL');

      expect(result.valid).toBe(false);
      expect(result.errors).toContainEqual(expect.stringContaining('INVALID_FOOD_RATE'));
      expect(result.foodCount).toBe(60); // ceil(60 * 1.0)
      expect(result.adjustedDna).toBe(
        applyOutcome(computeRunTotals('PRIMAL', 60).rawDna, false)
      );
    });

    it('allows the same rate on CYBER (2.5 foods/sec ceiling)', () => {
      const input = honestInput('CYBER', 100, false, 60);
      const result = validateGameResult(input, startedAgo(65), 'CYBER');

      expect(result.errors).not.toContainEqual(
        expect.stringContaining('INVALID_FOOD_RATE')
      );
      expect(result.foodCount).toBe(100);
    });

    it('accepts a realistic pace on every dynasty', () => {
      // ~1 food per 2.5s is a strong but human pace
      for (const dynasty of ['PRIMAL', 'CYBER', 'COSMIC'] as DynastyName[]) {
        const result = validateGameResult(
          honestInput(dynasty, 48, false, 120),
          startedAgo(125),
          dynasty
        );
        expect(result.valid).toBe(true);
      }
    });
  });

  describe('duration bounds (unchanged from v1)', () => {
    it('rejects duration exceeding server elapsed time', () => {
      const input = honestInput('PRIMAL', 10, false, 60);
      const result = validateGameResult(input, startedAgo(30), 'PRIMAL');

      expect(result.valid).toBe(false);
      expect(result.errors).toContainEqual(expect.stringContaining('INVALID_DURATION'));
    });

    it('allows the 10 second network-latency buffer', () => {
      const input = honestInput('PRIMAL', 10, false, 60);
      const result = validateGameResult(input, startedAgo(55), 'PRIMAL');
      expect(result.valid).toBe(true);
    });

    it('rejects duration exceeding the max game duration', () => {
      const input = honestInput('PRIMAL', 10, false, 650);
      const result = validateGameResult(input, startedAgo(700), 'PRIMAL');

      expect(result.valid).toBe(false);
      expect(result.errors).toContainEqual(expect.stringContaining('INVALID_DURATION'));
    });
  });
});

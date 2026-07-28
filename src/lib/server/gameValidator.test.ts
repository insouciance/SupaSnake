/**
 * Tests for the Design v2 game validator: exact server recompute via the
 * shared ruleset module, per-dynasty bounds, outcome consistency, and the
 * "claims can flag but never inflate" guarantee.
 */

/**
 * WP-2.05 NOTE, and it applies to every flipped assertion in this file.
 *
 * `valid` used to mean "no finding at all". It now means "the server could
 * BOUND this run's physics" - which is the only thing eligibility can
 * honestly be about, because the payout was always the server's own
 * recompute regardless. So a claim mismatch, a clamp, a dropped illegal
 * pick or a repaired bound leaves `valid === true`: the finding is recorded
 * in `errors` (byte-identical to before) and in `advisoryErrors`, and the
 * run keeps its progression, its board place and its record.
 *
 * Exactly two codes still set it false: INVALID_DURATION and
 * SPLICE_CLAIMED_DIRECTLY. Every assertion below that now expects `true`
 * also asserts the SPECIFIC code, so a flip cannot hide a finding going
 * missing.
 */

import {
  validateGameResult,
  CLAIM_EPSILON,
  type GameResultInput,
} from './gameValidator';
import {
  applyOutcome,
  applyOutcomeWithMutations,
  computeRunTotals,
  type DynastyName,
} from '@/shared/game/rulesets';
import type { MutationPick } from '@/shared/game/mutations';

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

      // ADVISORY: the claim lost the argument, the run did not.
      expect(result.valid).toBe(true);
      expect(result.errors).toContainEqual(expect.stringContaining('DNA_MISMATCH'));
      expect(result.advisoryErrors).toContainEqual(
        expect.stringContaining('DNA_MISMATCH')
      );
      expect(result.fatalErrors).toEqual([]);
      // Payout unchanged: exactly the salvage of the recomputed raw total
      expect(result.adjustedDna).toBe(applyOutcome(rawDna, false));
    });

    it('pays the recomputed value when the DNA claim is deflated (still flags)', () => {
      const input = honestInput('CYBER', 20, true, 120, { dna_earned: 1 });
      const result = validateGameResult(input, startedAgo(125), 'CYBER');
      const { rawDna } = computeRunTotals('CYBER', 20);

      expect(result.valid).toBe(true);
      expect(result.advisoryErrors).toContainEqual(
        expect.stringContaining('DNA_MISMATCH')
      );
      expect(result.adjustedDna).toBe(applyOutcome(rawDna, true));
    });

    it('flags an inflated score claim but stores the recomputed score', () => {
      const input = honestInput('PRIMAL', 30, false, 180, { score: 99999 });
      const result = validateGameResult(input, startedAgo(185), 'PRIMAL');

      expect(result.valid).toBe(true);
      expect(result.errors).toContainEqual(expect.stringContaining('SCORE_MISMATCH'));
      expect(result.advisoryErrors).toContainEqual(
        expect.stringContaining('SCORE_MISMATCH')
      );
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

      expect(result.valid).toBe(true);
      expect(result.advisoryErrors).toContainEqual(
        expect.stringContaining('DNA_MISMATCH')
      );
      expect(result.advisoryErrors).toContainEqual(
        expect.stringContaining('SCORE_MISMATCH')
      );
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

      // ADVISORY: the conflict is REPAIRED (the bank bonus is voided and
      // the salvage rate paid), so the server still bounded the run.
      expect(result.valid).toBe(true);
      expect(result.advisoryErrors).toContainEqual(
        expect.stringContaining('INVALID_OUTCOME')
      );
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
      expect(fractional.valid).toBe(true);
      expect(fractional.advisoryErrors).toContainEqual(
        expect.stringContaining('INVALID_FOOD_COUNT')
      );

      const negative = validateGameResult(
        honestInput('PRIMAL', 10, false, 60, { food_count: -3 }),
        startedAgo(65),
        'PRIMAL'
      );
      expect(negative.valid).toBe(true);
      expect(negative.advisoryErrors).toContainEqual(
        expect.stringContaining('INVALID_FOOD_COUNT')
      );
      expect(negative.foodCount).toBe(0);
      expect(negative.adjustedDna).toBe(0);
    });
  });

  describe('per-dynasty food-rate bound', () => {
    it('clamps a PRIMAL food count above 1.0 foods/sec and recomputes from the clamp', () => {
      // 100 foods in 60s is impossible on PRIMAL's fixed 175ms tick
      const input = honestInput('PRIMAL', 100, false, 60);
      const result = validateGameResult(input, startedAgo(65), 'PRIMAL');

      // ADVISORY: the count is clamped to the duration-derived bound, and
      // the DURATION bound is the fatal one - so the run's physics are still
      // bounded after this repair.
      expect(result.valid).toBe(true);
      expect(result.advisoryErrors).toContainEqual(
        expect.stringContaining('INVALID_FOOD_RATE')
      );
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

  describe('mutation claims (Design v2 Phase 2)', () => {
    /** Honest mutation input: claims match the mutation-aware recompute. */
    function honestMutationInput(
      dynasty: DynastyName,
      foodCount: number,
      extracted: boolean,
      mutations: MutationPick[],
      duration = 120,
      overrides: Partial<GameResultInput> = {}
    ): GameResultInput {
      const { rawDna, score } = computeRunTotals(dynasty, foodCount, mutations);
      return {
        food_count: foodCount,
        extracted,
        score,
        dna_earned: rawDna,
        duration_seconds: duration,
        died: !extracted,
        victory: false,
        mutations,
        ...overrides,
      };
    }

    it('recomputes E-mutation payouts exactly (PRIMAL, Gold Trail + Overgrowth)', () => {
      const picks: MutationPick[] = [
        { id: 'gold_trail', atFood: 16 },
        { id: 'overgrowth', atFood: 33 },
      ];
      const input = honestMutationInput('PRIMAL', 50, true, picks);
      const result = validateGameResult(input, startedAgo(125), 'PRIMAL');
      const { rawDna } = computeRunTotals('PRIMAL', 50, picks);

      expect(result.valid).toBe(true);
      expect(result.mutations).toEqual(picks);
      expect(result.adjustedDna).toBe(applyOutcomeWithMutations(rawDna, true, picks));
    });

    it('applies Mirror Wager to the outcome multiplier (bank x1.50, salvage x0.30)', () => {
      const picks: MutationPick[] = [{ id: 'mirror_wager', atFood: 20 }];
      const { rawDna } = computeRunTotals('PRIMAL', 30, picks);

      const banked = validateGameResult(
        honestMutationInput('PRIMAL', 30, true, picks),
        startedAgo(125),
        'PRIMAL'
      );
      expect(banked.adjustedDna).toBe(Math.floor(rawDna * 1.5));

      const died = validateGameResult(
        honestMutationInput('PRIMAL', 30, false, picks),
        startedAgo(125),
        'PRIMAL'
      );
      expect(died.adjustedDna).toBe(Math.floor(rawDna * 0.3));
    });

    it('applies Compound Interest per held mutation (4 held -> x1.65 base)', () => {
      const picks: MutationPick[] = [
        { id: 'compound_interest', atFood: 15 },
        { id: 'magnet_pulse', atFood: 30 },
        { id: 'wall_rush', atFood: 45 },
        { id: 'shed', atFood: 60 },
      ];
      const input = honestMutationInput('PRIMAL', 70, true, picks, 180);
      const result = validateGameResult(input, startedAgo(185), 'PRIMAL');
      const { rawDna } = computeRunTotals('PRIMAL', 70, picks);
      expect(result.valid).toBe(true);
      expect(result.adjustedDna).toBe(Math.floor(rawDna * 1.65));
    });

    it('drops unknown ids and duplicates, flags, and pays the legal subset', () => {
      const legal: MutationPick[] = [{ id: 'overgrowth', atFood: 18 }];
      const input = honestMutationInput('PRIMAL', 40, false, legal, 120, {
        mutations: [
          { id: 'overgrowth', atFood: 18 },
          { id: 'mega_snake', atFood: 20 },
          { id: 'overgrowth', atFood: 25 },
          { id: 'wall_rush', atFood: 'soon' },
        ],
      });
      const result = validateGameResult(input, startedAgo(125), 'PRIMAL');

      expect(result.valid).toBe(true);
      expect(result.advisoryErrors).toContainEqual(
        expect.stringContaining('INVALID_MUTATIONS')
      );
      expect(result.errors).toContainEqual(expect.stringContaining('unknown mutation id'));
      expect(result.errors).toContainEqual(expect.stringContaining('duplicate mutation'));
      expect(result.mutations).toEqual(legal);
      expect(result.adjustedDna).toBe(
        applyOutcomeWithMutations(computeRunTotals('PRIMAL', 40, legal).rawDna, false, legal)
      );
    });

    it('bounds pick count by floor(foodCount / 15)', () => {
      const picks: MutationPick[] = [
        { id: 'overgrowth', atFood: 15 },
        { id: 'wall_rush', atFood: 20 },
      ];
      // 25 foods allow only floor(25/15) = 1 pick
      const input = honestMutationInput('PRIMAL', 25, false, picks);
      const result = validateGameResult(input, startedAgo(125), 'PRIMAL');

      expect(result.valid).toBe(true);
      expect(result.advisoryErrors).toContainEqual(
        expect.stringContaining('MUTATION_BOUND')
      );
      expect(result.mutations).toEqual([picks[0]]);
    });

    it('bounds each atFood to [15 x pick-index, foodCount]', () => {
      const early = validateGameResult(
        honestMutationInput('PRIMAL', 40, false, [{ id: 'overgrowth', atFood: 9 }]),
        startedAgo(125),
        'PRIMAL'
      );
      expect(early.valid).toBe(true);
      expect(early.advisoryErrors).toContainEqual(
        expect.stringContaining('MUTATION_BOUND')
      );
      expect(early.mutations).toEqual([]);

      const late = validateGameResult(
        honestMutationInput('PRIMAL', 40, false, [{ id: 'overgrowth', atFood: 55 }]),
        startedAgo(125),
        'PRIMAL'
      );
      expect(late.valid).toBe(true);
      expect(late.advisoryErrors).toContainEqual(
        expect.stringContaining('MUTATION_BOUND')
      );
      expect(late.mutations).toEqual([]);
      // Payout falls back to the mutation-free recompute
      expect(late.adjustedDna).toBe(
        applyOutcome(computeRunTotals('PRIMAL', 40).rawDna, false)
      );
    });

    it('a second pick before food 30 is rejected, keeping the legal prefix', () => {
      const picks: MutationPick[] = [
        { id: 'overgrowth', atFood: 16 },
        { id: 'wall_rush', atFood: 22 }, // < 15 x 2
      ];
      const input = honestMutationInput('PRIMAL', 45, false, picks);
      const result = validateGameResult(input, startedAgo(125), 'PRIMAL');
      expect(result.valid).toBe(true);
      expect(result.advisoryErrors).toContainEqual(
        expect.stringContaining('MUTATION_BOUND')
      );
      expect(result.mutations).toEqual([picks[0]]);
    });

    it('honors a plausible Phoenix trigger (payout only ever drops)', () => {
      const picks: MutationPick[] = [
        { id: 'overgrowth', atFood: 15 },
        { id: 'phoenix', atFood: 30 },
      ];
      const triggered = computeRunTotals('PRIMAL', 50, picks, 35);
      const input = honestMutationInput('PRIMAL', 50, true, picks, 120, {
        dna_earned: triggered.rawDna,
        score: triggered.score,
        phoenix_triggered_at_food: 35,
      });
      const result = validateGameResult(input, startedAgo(125), 'PRIMAL');

      expect(result.valid).toBe(true);
      expect(result.phoenixTriggeredAtFood).toBe(35);
      expect(result.adjustedDna).toBe(
        applyOutcomeWithMutations(triggered.rawDna, true, picks, true)
      );

      const untriggeredResult = validateGameResult(
        honestMutationInput('PRIMAL', 50, true, picks),
        startedAgo(125),
        'PRIMAL'
      );
      expect(result.adjustedDna).toBeLessThan(untriggeredResult.adjustedDna);
    });

    it('ignores a Phoenix trigger claimed without phoenix held', () => {
      const picks: MutationPick[] = [{ id: 'overgrowth', atFood: 15 }];
      const input = honestMutationInput('PRIMAL', 40, false, picks, 120, {
        phoenix_triggered_at_food: 20,
      });
      const result = validateGameResult(input, startedAgo(125), 'PRIMAL');
      expect(result.valid).toBe(true);
      expect(result.advisoryErrors).toContainEqual(
        expect.stringContaining('PHOENIX_INVALID')
      );
      expect(result.phoenixTriggeredAtFood).toBeNull();
    });

    it('ignores a Phoenix trigger outside [pickAtFood, foodCount]', () => {
      const picks: MutationPick[] = [{ id: 'phoenix', atFood: 20 }];
      for (const bad of [10, 99]) {
        const result = validateGameResult(
          honestMutationInput('PRIMAL', 40, false, picks, 120, {
            phoenix_triggered_at_food: bad,
          }),
          startedAgo(125),
          'PRIMAL'
        );
        expect(result.errors).toContainEqual(expect.stringContaining('PHOENIX_INVALID'));
        expect(result.phoenixTriggeredAtFood).toBeNull();
      }
    });

    it('mutation-free payloads behave exactly as before (regression)', () => {
      const input = honestInput('CYBER', 30, true, 180);
      const result = validateGameResult(input, startedAgo(185), 'CYBER');
      expect(result.valid).toBe(true);
      expect(result.mutations).toEqual([]);
      expect(result.adjustedDna).toBe(
        applyOutcome(computeRunTotals('CYBER', 30).rawDna, true)
      );
    });
  });

  describe('COSMIC claims nothing (WP-3.13 deleted the bounded-trust combo)', () => {
    it('COSMIC pays the recompute and nothing else', () => {
      const input = honestInput('COSMIC', 30, true, 120);
      const result = validateGameResult(input, startedAgo(125), 'COSMIC');
      expect(result.valid).toBe(true);
      expect(result.adjustedDna).toBe(
        applyOutcome(computeRunTotals('COSMIC', 30).rawDna, true)
      );
      expect(result.adjustedScore).toBe(computeRunTotals('COSMIC', 30).score);
    });

    it('a stale combo claim from an old client buys nothing', () => {
      // The engine stopped sending this at WP-3.13, but a reward queued in
      // the outbox by an older build can still arrive. It must not pay, and
      // it must not fail the run either - the run itself was honest.
      const input = {
        ...honestInput('COSMIC', 30, true, 120),
        cosmic: { combo_dna_bonus: 400, combo_score_bonus: 400, max_chain: 9 },
      } as GameResultInput;
      const result = validateGameResult(input, startedAgo(125), 'COSMIC');
      expect(result.valid).toBe(true);
      expect(result.adjustedDna).toBe(
        applyOutcome(computeRunTotals('COSMIC', 30).rawDna, true)
      );
      expect(result.adjustedScore).toBe(computeRunTotals('COSMIC', 30).score);
    });

    it('the recomputed score IS the fold, with no claimed addend', () => {
      // R2's whole surface on the server, in one assertion: whatever the
      // client claims, the score paid is `computeRunTotals`.
      const claimed = computeRunTotals('COSMIC', 30).score + 5000;
      const result = validateGameResult(
        { ...honestInput('COSMIC', 30, true, 120), score: claimed },
        startedAgo(125),
        'COSMIC'
      );
      expect(result.adjustedScore).toBe(computeRunTotals('COSMIC', 30).score);
    });

    it('E-mutations still recompute exactly under COSMIC (base layer)', () => {
      const picks: MutationPick[] = [{ id: 'splitter', atFood: 15 }];
      const base = computeRunTotals('COSMIC', 40, picks);
      const input: GameResultInput = {
        food_count: 40,
        extracted: true,
        score: base.score,
        dna_earned: base.rawDna,
        duration_seconds: 120,
        died: false,
        victory: false,
        mutations: picks,
      };
      const result = validateGameResult(input, startedAgo(125), 'COSMIC');
      expect(result.valid).toBe(true);
      expect(result.adjustedDna).toBe(
        applyOutcomeWithMutations(base.rawDna, true, picks)
      );
    });
  });

  describe('duration bounds — the ONE surviving fatal physics bound', () => {
    it('rejects duration exceeding server elapsed time, and this one IS fatal', () => {
      const input = honestInput('PRIMAL', 10, false, 60);
      const result = validateGameResult(input, startedAgo(30), 'PRIMAL');

      // FATAL, and deliberately the only bound of its kind left: the
      // food-rate bound is DERIVED from duration, so an unbounded duration
      // is an unbounded run. Signal's `endure` objective also reads
      // `duration_seconds` straight off the row.
      expect(result.valid).toBe(false);
      expect(result.fatalErrors).toContainEqual(
        expect.stringContaining('INVALID_DURATION')
      );
      expect(result.errors).toContainEqual(expect.stringContaining('INVALID_DURATION'));
    });

    it('allows the 10 second network-latency buffer', () => {
      const input = honestInput('PRIMAL', 10, false, 60);
      const result = validateGameResult(input, startedAgo(55), 'PRIMAL');
      expect(result.valid).toBe(true);
    });

    it('stores the claim clamped to elapsed time, not to elapsed + the skew', () => {
      // The +10 above is a tolerance for REJECTING a claim. It is not a
      // licence to record ten seconds that did not pass.
      const input = honestInput('PRIMAL', 10, false, 60);
      const result = validateGameResult(input, startedAgo(55), 'PRIMAL');
      expect(result.durationSeconds).toBeGreaterThanOrEqual(54);
      expect(result.durationSeconds).toBeLessThanOrEqual(56);
    });

    it('has NO flat maximum any more — a long careful run stays valid', () => {
      // WP-2.05 deleted `GAME_CONFIG.session.maxDuration` (owner ruling,
      // 2026-07-26: a long run is a good run). This used to be
      // "rejects duration exceeding the max game duration"; a ten-minute
      // wall invalidated exactly the tactical-hold play the extraction
      // mechanic exists to reward.
      const input = honestInput('PRIMAL', 10, false, 650);
      const result = validateGameResult(input, startedAgo(700), 'PRIMAL');

      expect(result.valid).toBe(true);
      expect(result.fatalErrors).toEqual([]);
      expect(result.durationSeconds).toBe(650);
    });
  });
});

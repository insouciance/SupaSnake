/**
 * Validator under weekly anomalies (Design v2 Phase 4B, section 7.2):
 * the anomaly comes from the SESSION ROW (server-stamped), its [E]
 * effects recompute exactly, and claims can flag - never inflate.
 */

import { describe, expect, it } from '@jest/globals';
import { validateGameResult } from '@/lib/server/gameValidator';
import {
  applyOutcomeWithMutations,
  computeRunTotals,
} from '@/shared/game/rulesets';

const startedAt = () => new Date(Date.now() - 120_000);

describe('exact recompute under Gold Rush (food x1.5)', () => {
  it('pays the anomaly-modified recompute for an honest claim', () => {
    const { rawDna, score } = computeRunTotals(
      'PRIMAL', 40, [], null, [], 'gold_rush'
    );
    const result = validateGameResult(
      {
        food_count: 40,
        extracted: true,
        score,
        dna_earned: rawDna,
        duration_seconds: 120,
        died: false,
        victory: false,
      },
      startedAt(),
      'PRIMAL',
      [],
      null,
      'gold_rush'
    );
    expect(result.valid).toBe(true);
    expect(result.rawDna).toBe(rawDna);
    expect(result.adjustedDna).toBe(Math.floor(rawDna * 1.25));
  });

  it('a claim WITHOUT the anomaly bonus flags (mismatch) but pays the recompute', () => {
    const plain = computeRunTotals('PRIMAL', 40);
    const rush = computeRunTotals('PRIMAL', 40, [], null, [], 'gold_rush');
    const result = validateGameResult(
      {
        food_count: 40,
        extracted: true,
        score: plain.score,
        dna_earned: plain.rawDna, // stale claim - no x1.5
        duration_seconds: 120,
        died: false,
        victory: false,
      },
      startedAt(),
      'PRIMAL',
      [],
      null,
      'gold_rush'
    );
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes('DNA_MISMATCH'))).toBe(true);
    // The payout is the server's own anomaly recompute - never the claim
    expect(result.rawDna).toBe(rush.rawDna);
  });

  it('score stays anomaly-free: an inflated score claim flags', () => {
    const rush = computeRunTotals('PRIMAL', 40, [], null, [], 'gold_rush');
    const result = validateGameResult(
      {
        food_count: 40,
        extracted: true,
        score: Math.round(rush.rawDna), // score inflated as if x1.5 applied
        dna_earned: rush.rawDna,
        duration_seconds: 120,
        died: false,
        victory: false,
      },
      startedAt(),
      'PRIMAL',
      [],
      null,
      'gold_rush'
    );
    expect(result.errors.some((e) => e.includes('SCORE_MISMATCH'))).toBe(true);
    expect(result.adjustedScore).toBe(computeRunTotals('PRIMAL', 40).score);
  });
});

describe('Twin Exits outcome (bank x1.15 only)', () => {
  it('banked pays x1.15; salvage stays x0.60', () => {
    const { rawDna, score } = computeRunTotals('CYBER', 30);
    const banked = validateGameResult(
      {
        food_count: 30,
        extracted: true,
        score,
        dna_earned: rawDna,
        duration_seconds: 60,
        died: false,
        victory: false,
      },
      startedAt(),
      'CYBER',
      [],
      null,
      'twin_exits'
    );
    expect(banked.valid).toBe(true);
    expect(banked.adjustedDna).toBe(Math.floor(rawDna * 1.15));

    const crashed = validateGameResult(
      {
        food_count: 30,
        extracted: false,
        score,
        dna_earned: rawDna,
        duration_seconds: 60,
        died: true,
        victory: false,
      },
      startedAt(),
      'CYBER',
      [],
      null,
      'twin_exits'
    );
    expect(crashed.adjustedDna).toBe(Math.floor(rawDna * 0.6));
  });

  it('mutation outcome shaping composes identically on the board', () => {
    const picks = [{ id: 'mirror_wager' as const, atFood: 20 }];
    const { rawDna, score } = computeRunTotals('CYBER', 30, picks);
    const result = validateGameResult(
      {
        food_count: 30,
        extracted: true,
        score,
        dna_earned: rawDna,
        duration_seconds: 60,
        died: false,
        victory: false,
        mutations: picks,
      },
      startedAt(),
      'CYBER',
      [],
      null,
      'twin_exits'
    );
    expect(result.adjustedDna).toBe(
      applyOutcomeWithMutations(rawDna, true, picks, false, [], 'twin_exits')
    );
    expect(result.adjustedDna).toBe(Math.floor(rawDna * 1.5)); // Wager SETS 1.50
  });
});

describe('[P] anomalies leave validation identical to a normal run', () => {
  it('meteor_shower / blackout recompute exactly as null', () => {
    const { rawDna, score } = computeRunTotals('COSMIC', 25);
    for (const anomaly of ['meteor_shower', 'blackout'] as const) {
      const result = validateGameResult(
        {
          food_count: 25,
          extracted: true,
          score,
          dna_earned: rawDna,
          duration_seconds: 90,
          died: false,
          victory: false,
        },
        startedAt(),
        'COSMIC',
        [],
        null,
        anomaly
      );
      expect(result.valid).toBe(true);
      expect(result.adjustedDna).toBe(Math.floor(rawDna * 1.25));
    }
  });
});

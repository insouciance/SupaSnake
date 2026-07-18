/**
 * Tests for Dynasty Rulesets - the shared client/server scoring authority.
 * Determinism, exact tuning numbers, monotonicity, caps, integer outputs.
 */

import { GAME_CONFIG } from '@/shared/config/game';
import {
  BANK,
  COSMIC_CONSTELLATION,
  COSMIC_FLUX,
  COSMIC_SPEED_MS,
  COSMIC_TRUST_MAX_BONUS_RATIO,
  FOOD_BASE_DNA,
  FOOD_BASE_SCORE,
  RULESETS,
  applyOutcome,
  applyOutcomeWithMutations,
  computeRunTotals,
  cosmicComboMultiplier,
  getRuleset,
  normalizeDynastyName,
  outcomeMultipliers,
  rollExitInterval,
  rulesetExplainer,
  type DynastyName,
} from './rulesets';
import type { MutationPick } from './mutations';

const ALL_DYNASTIES: DynastyName[] = ['PRIMAL', 'CYBER', 'COSMIC'];

describe('bank constants', () => {
  it('banks +25% on extraction and salvages 60% on death', () => {
    expect(BANK.extractMultiplier).toBe(1.25);
    expect(BANK.deathMultiplier).toBe(0.6);
  });

  it('bases food DNA on the GAME_CONFIG economy value (PRIMAL base 10)', () => {
    expect(FOOD_BASE_DNA).toBe(GAME_CONFIG.economy.dna.foodValue);
    expect(FOOD_BASE_DNA).toBe(10);
    expect(FOOD_BASE_SCORE).toBe(10);
  });
});

describe('PRIMAL ruleset (Steady Growth)', () => {
  const primal = RULESETS.PRIMAL;

  it('has a fixed speed equal to the config initial speed', () => {
    expect(primal.speedForFood(0)).toBe(GAME_CONFIG.snake.initialSpeed);
    expect(primal.speedForFood(1)).toBe(200);
    expect(primal.speedForFood(50)).toBe(200);
    expect(primal.speedForFood(500)).toBe(200);
  });

  it('compounds food value: round(10 * (1 + 0.02 * (n - 1)))', () => {
    expect(primal.foodDnaValue(1)).toBe(10);
    expect(primal.foodDnaValue(2)).toBe(10); // 10.2 -> 10
    expect(primal.foodDnaValue(3)).toBe(10); // 10.4 -> 10
    expect(primal.foodDnaValue(4)).toBe(11); // 10.6 -> 11
    expect(primal.foodDnaValue(11)).toBe(12); // 12.0
    expect(primal.foodDnaValue(26)).toBe(15); // 15.0
    expect(primal.foodDnaValue(51)).toBe(20); // 20.0
    expect(primal.foodDnaValue(100)).toBe(30); // 29.8 -> 30
  });

  it('food value never decreases with n', () => {
    for (let n = 2; n <= 200; n++) {
      expect(primal.foodDnaValue(n)).toBeGreaterThanOrEqual(primal.foodDnaValue(n - 1));
    }
  });

  it('has a flat x1 score multiplier', () => {
    expect(primal.scoreMultiplier(1)).toBe(1);
    expect(primal.scoreMultiplier(100)).toBe(1);
  });
});

describe('CYBER ruleset (Overclock)', () => {
  const cyber = RULESETS.CYBER;

  it('ramps speed from initialSpeed by food count (log curve, clamped to minSpeed)', () => {
    expect(cyber.speedForFood(0)).toBe(GAME_CONFIG.snake.initialSpeed);
    // floor(200 / (1 + 0.03 * f))
    expect(cyber.speedForFood(1)).toBe(194);
    expect(cyber.speedForFood(10)).toBe(153);
    expect(cyber.speedForFood(30)).toBe(105);
    expect(cyber.speedForFood(100)).toBe(50);
    expect(cyber.speedForFood(1000)).toBe(GAME_CONFIG.snake.minSpeed);
  });

  it('speed never increases with food count and never drops below minSpeed', () => {
    for (let f = 1; f <= 300; f++) {
      expect(cyber.speedForFood(f)).toBeLessThanOrEqual(cyber.speedForFood(f - 1));
      expect(cyber.speedForFood(f)).toBeGreaterThanOrEqual(GAME_CONFIG.snake.minSpeed);
    }
  });

  it('tiers the multiplier: floor(n/5) capped at 4, mult = 1 + 0.5 * tier', () => {
    // Foods 1-4: tier 0 -> x1
    expect(cyber.scoreMultiplier(1)).toBe(1);
    expect(cyber.scoreMultiplier(4)).toBe(1);
    // Foods 5-9: tier 1 -> x1.5
    expect(cyber.scoreMultiplier(5)).toBe(1.5);
    expect(cyber.scoreMultiplier(9)).toBe(1.5);
    // Foods 10-14: tier 2 -> x2
    expect(cyber.scoreMultiplier(10)).toBe(2);
    // Foods 15-19: tier 3 -> x2.5
    expect(cyber.scoreMultiplier(15)).toBe(2.5);
    // Food 20+: tier capped at 4 -> x3
    expect(cyber.scoreMultiplier(20)).toBe(3);
    expect(cyber.scoreMultiplier(500)).toBe(3);
  });

  it('applies the tier multiplier to per-food DNA', () => {
    expect(cyber.foodDnaValue(1)).toBe(10);
    expect(cyber.foodDnaValue(5)).toBe(15);
    expect(cyber.foodDnaValue(10)).toBe(20);
    expect(cyber.foodDnaValue(15)).toBe(25);
    expect(cyber.foodDnaValue(20)).toBe(30);
    expect(cyber.foodDnaValue(100)).toBe(30);
  });
});

describe('COSMIC ruleset (Flux)', () => {
  const cosmic = RULESETS.COSMIC;

  it('has a fixed 160 ms tick between PRIMAL and CYBER tier 1', () => {
    expect(COSMIC_SPEED_MS).toBe(160);
    expect(cosmic.speedForFood(0)).toBe(160);
    expect(cosmic.speedForFood(80)).toBe(160);
  });

  it('pays a flat base food value - the combo layer sits on top', () => {
    expect(cosmic.foodDnaValue(1)).toBe(10);
    expect(cosmic.foodDnaValue(50)).toBe(10);
    expect(cosmic.scoreMultiplier(50)).toBe(1);
  });

  it('carries the constellation config: 3 glyphs, groups of 3, 8-tick window', () => {
    expect(cosmic.constellation).toBe(COSMIC_CONSTELLATION);
    expect(COSMIC_CONSTELLATION.glyphCount).toBe(3);
    expect(COSMIC_CONSTELLATION.groupSize).toBe(3);
    expect(COSMIC_CONSTELLATION.chainWindowTicks).toBe(8);
    expect(COSMIC_CONSTELLATION.comboCap).toBe(2.4);
  });

  it('carries the flux config: 12s open / 8s closed / ~2s telegraph at 160ms', () => {
    expect(cosmic.flux).toBe(COSMIC_FLUX);
    expect(COSMIC_FLUX.openTicks).toBe(75); // 12s / 0.16s
    expect(COSMIC_FLUX.closedTicks).toBe(50); // 8s / 0.16s
    expect(COSMIC_FLUX.telegraphTicks).toBe(12); // ~2s
  });

  it('PRIMAL and CYBER carry no constellation or flux fields', () => {
    expect(RULESETS.PRIMAL.constellation).toBeUndefined();
    expect(RULESETS.PRIMAL.flux).toBeUndefined();
    expect(RULESETS.CYBER.constellation).toBeUndefined();
    expect(RULESETS.CYBER.flux).toBeUndefined();
  });
});

describe('cosmicComboMultiplier', () => {
  it('follows the doc table: x1.0 solo, x1.2 at chain 2, +0.2 per food, cap x2.4', () => {
    expect(cosmicComboMultiplier(0)).toBe(1);
    expect(cosmicComboMultiplier(1)).toBe(1);
    expect(cosmicComboMultiplier(2)).toBeCloseTo(1.2, 10);
    expect(cosmicComboMultiplier(3)).toBeCloseTo(1.4, 10);
    expect(cosmicComboMultiplier(5)).toBeCloseTo(1.8, 10);
    expect(cosmicComboMultiplier(7)).toBeCloseTo(2.2, 10);
    expect(cosmicComboMultiplier(8)).toBe(2.4);
    expect(cosmicComboMultiplier(20)).toBe(2.4);
  });

  it('rounds to clean per-food values at base 10', () => {
    // round(10 x combo) for chains 1..8: the exact per-food payout steps
    const values = [1, 2, 3, 4, 5, 6, 7, 8].map((c) =>
      Math.round(10 * cosmicComboMultiplier(c))
    );
    expect(values).toEqual([10, 12, 14, 16, 18, 20, 22, 24]);
  });

  it('bounded-trust ratio is comboCap - 1 (the clamp ceiling)', () => {
    expect(COSMIC_TRUST_MAX_BONUS_RATIO).toBeCloseTo(1.4, 10);
  });
});

describe('integer determinism', () => {
  it('every foodDnaValue is a non-negative integer for all dynasties', () => {
    for (const dynasty of ALL_DYNASTIES) {
      const ruleset = RULESETS[dynasty];
      for (let n = 1; n <= 500; n++) {
        const value = ruleset.foodDnaValue(n);
        expect(Number.isInteger(value)).toBe(true);
        expect(value).toBeGreaterThanOrEqual(0);
      }
    }
  });

  it('computeRunTotals returns integers and is repeatable', () => {
    for (const dynasty of ALL_DYNASTIES) {
      for (const count of [0, 1, 7, 30, 60, 100, 333]) {
        const first = computeRunTotals(dynasty, count);
        const second = computeRunTotals(dynasty, count);
        expect(first).toEqual(second);
        expect(Number.isInteger(first.rawDna)).toBe(true);
        expect(Number.isInteger(first.score)).toBe(true);
      }
    }
  });

  it('speedForFood is a pure integer ms/tick for all dynasties', () => {
    for (const dynasty of ALL_DYNASTIES) {
      const ruleset = RULESETS[dynasty];
      for (let f = 0; f <= 300; f++) {
        expect(Number.isInteger(ruleset.speedForFood(f))).toBe(true);
      }
    }
  });
});

describe('computeRunTotals', () => {
  it('returns zeros for zero, negative, and non-finite food counts', () => {
    for (const dynasty of ALL_DYNASTIES) {
      expect(computeRunTotals(dynasty, 0)).toEqual({ rawDna: 0, score: 0 });
      expect(computeRunTotals(dynasty, -5)).toEqual({ rawDna: 0, score: 0 });
      expect(computeRunTotals(dynasty, NaN)).toEqual({ rawDna: 0, score: 0 });
    }
  });

  it('floors fractional food counts (defensive - counts are integers)', () => {
    expect(computeRunTotals('PRIMAL', 3.9)).toEqual(computeRunTotals('PRIMAL', 3));
  });

  it('is strictly increasing in food count', () => {
    for (const dynasty of ALL_DYNASTIES) {
      let prev = computeRunTotals(dynasty, 0);
      for (let count = 1; count <= 120; count++) {
        const next = computeRunTotals(dynasty, count);
        expect(next.rawDna).toBeGreaterThan(prev.rawDna);
        expect(next.score).toBeGreaterThan(prev.score);
        prev = next;
      }
    }
  });

  it('matches the fold of per-food values exactly', () => {
    for (const dynasty of ALL_DYNASTIES) {
      const ruleset = RULESETS[dynasty];
      let rawDna = 0;
      let score = 0;
      for (let n = 1; n <= 60; n++) {
        rawDna += ruleset.foodDnaValue(n);
        score += Math.round(FOOD_BASE_SCORE * ruleset.scoreMultiplier(n));
      }
      expect(computeRunTotals(dynasty, 60)).toEqual({ rawDna, score });
    }
  });

  it('produces the expected PRIMAL totals at economy checkpoints', () => {
    // Stepped compounding: sum of round(10 * (1 + 0.02 * (n-1)))
    expect(computeRunTotals('PRIMAL', 10).rawDna).toBe(109);
    expect(computeRunTotals('PRIMAL', 30).rawDna).toBe(387);
    expect(computeRunTotals('PRIMAL', 60).rawDna).toBe(954);
    expect(computeRunTotals('PRIMAL', 100).rawDna).toBe(1990);
    expect(computeRunTotals('PRIMAL', 30).score).toBe(300);
  });

  it('produces the expected CYBER totals at economy checkpoints', () => {
    // 4x10 + 5x15 + 5x20 + 5x25 + (n-19)x30 from food 20 on
    expect(computeRunTotals('CYBER', 10).rawDna).toBe(135);
    expect(computeRunTotals('CYBER', 30).rawDna).toBe(670);
    expect(computeRunTotals('CYBER', 60).rawDna).toBe(1570);
    expect(computeRunTotals('CYBER', 100).rawDna).toBe(2770);
    expect(computeRunTotals('CYBER', 30).score).toBe(670);
  });

  it('COSMIC base totals are flat (combo bonus is layered on top, clamped)', () => {
    expect(computeRunTotals('COSMIC', 30)).toEqual({ rawDna: 300, score: 300 });
  });
});

describe('applyOutcome', () => {
  it('banks +25% (floored) on extraction', () => {
    expect(applyOutcome(100, true)).toBe(125);
    expect(applyOutcome(103, true)).toBe(128); // 128.75 -> 128
    expect(applyOutcome(0, true)).toBe(0);
  });

  it('salvages 60% (floored) on death', () => {
    expect(applyOutcome(100, false)).toBe(60);
    expect(applyOutcome(103, false)).toBe(61); // 61.8 -> 61
    expect(applyOutcome(1, false)).toBe(0);
  });

  it('never pays negative or non-finite values', () => {
    expect(applyOutcome(-50, true)).toBe(0);
    expect(applyOutcome(NaN, false)).toBe(0);
    expect(applyOutcome(Infinity, false)).toBe(0);
  });

  it('banked always beats salvage for the same raw total', () => {
    for (const dynasty of ALL_DYNASTIES) {
      for (const count of [1, 15, 30, 60, 100]) {
        const { rawDna } = computeRunTotals(dynasty, count);
        expect(applyOutcome(rawDna, true)).toBeGreaterThan(applyOutcome(rawDna, false));
      }
    }
  });
});

describe('extraction cadence config', () => {
  it('spawns the first portal at 15 foods, then every 12 +/- 4, despawn 90 ticks', () => {
    for (const dynasty of ALL_DYNASTIES) {
      const { extraction } = RULESETS[dynasty];
      expect(extraction.firstExitAtFood).toBe(15);
      expect(extraction.intervalBase).toBe(12);
      expect(extraction.intervalJitter).toBe(4);
      expect(extraction.despawnTicks).toBe(90);
    }
  });

  it('rollExitInterval spans [8, 16] inclusive and follows the injected rng', () => {
    const { extraction } = RULESETS.PRIMAL;
    expect(rollExitInterval(extraction, () => 0)).toBe(8);
    expect(rollExitInterval(extraction, () => 0.999999)).toBe(16);
    expect(rollExitInterval(extraction, () => 0.5)).toBe(12);

    // Every value in range is reachable, none outside it
    const seen = new Set<number>();
    for (let i = 0; i < 1000; i++) {
      const value = rollExitInterval(extraction, () => i / 1000);
      expect(value).toBeGreaterThanOrEqual(8);
      expect(value).toBeLessThanOrEqual(16);
      seen.add(value);
    }
    expect(seen.size).toBe(9);
  });
});

describe('validation bounds', () => {
  it('gives CYBER a higher food-rate ceiling than the fixed-speed dynasties', () => {
    expect(RULESETS.CYBER.validation.maxFoodPerSecond).toBeGreaterThan(
      RULESETS.PRIMAL.validation.maxFoodPerSecond
    );
    expect(RULESETS.PRIMAL.validation.maxFoodPerSecond).toBe(1.0);
    expect(RULESETS.CYBER.validation.maxFoodPerSecond).toBe(2.5);
    // COSMIC: 160ms tick + clustered constellation groups eat faster than PRIMAL
    expect(RULESETS.COSMIC.validation.maxFoodPerSecond).toBe(1.5);
  });
});

describe('normalizeDynastyName', () => {
  it('accepts known names case-insensitively', () => {
    expect(normalizeDynastyName('PRIMAL')).toBe('PRIMAL');
    expect(normalizeDynastyName('cyber')).toBe('CYBER');
    expect(normalizeDynastyName('Cosmic')).toBe('COSMIC');
  });

  it('falls back to COSMIC for unknown or non-string values', () => {
    expect(normalizeDynastyName('VOID')).toBe('COSMIC');
    expect(normalizeDynastyName(null)).toBe('COSMIC');
    expect(normalizeDynastyName(undefined)).toBe('COSMIC');
    expect(normalizeDynastyName(42)).toBe('COSMIC');
  });
});

describe('getRuleset + explainers', () => {
  it('returns the ruleset matching the dynasty id', () => {
    for (const dynasty of ALL_DYNASTIES) {
      expect(getRuleset(dynasty).id).toBe(dynasty);
    }
  });

  it('provides a one-line explainer for every dynasty', () => {
    for (const dynasty of ALL_DYNASTIES) {
      expect(rulesetExplainer[dynasty]).toBeTruthy();
      expect(typeof rulesetExplainer[dynasty]).toBe('string');
    }
    expect(rulesetExplainer.PRIMAL).toBe(
      'Steady speed — every food worth more than the last'
    );
    expect(rulesetExplainer.CYBER).toBe(
      'Speed rises — survive the overclock for up to ×3'
    );
  });
});

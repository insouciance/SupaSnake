/**
 * Tests for Game Configuration
 */

import { describe, it, expect } from '@jest/globals';
import { GAME_CONFIG } from './game';

describe('Game Configuration', () => {
  describe('Board Configuration', () => {
    it('should have valid grid size', () => {
      expect(GAME_CONFIG.board.gridSize).toBeGreaterThan(0);
      expect(GAME_CONFIG.board.gridSize).toBeLessThanOrEqual(50);
    });

    it('should have consistent board dimensions', () => {
      const { gridSize, cellSize, boardWidth, boardHeight } = GAME_CONFIG.board;
      expect(boardWidth).toBe(gridSize * cellSize);
      expect(boardHeight).toBe(gridSize * cellSize);
    });

    it('should use unit cell size for 3D grid', () => {
      expect(GAME_CONFIG.board.cellSize).toBe(1);
    });
  });

  describe('Snake Physics', () => {
    it('should have valid initial length', () => {
      expect(GAME_CONFIG.snake.initialLength).toBeGreaterThanOrEqual(1);
      expect(GAME_CONFIG.snake.initialLength).toBeLessThan(GAME_CONFIG.board.gridSize);
    });

    it('should have speed progression (slower to faster)', () => {
      const { initialSpeed, minSpeed } = GAME_CONFIG.snake;
      expect(initialSpeed).toBeGreaterThan(minSpeed);
    });

    it('should have interpolation duration less than initial speed', () => {
      // A declared relation, not an enforced one: nothing in production reads
      // `interpolationDuration` — `interpolationBuffer.ts` smooths against the
      // LIVE tick from `getSpeed()`. So this pins the band's own coherence, and
      // it still holds after WP-3.08 moved PRIMAL to 175 (150 < 175, 25ms of
      // margin, against COSMIC's shipped 10ms). The per-dynasty ticks are
      // checked against this number where they are declared, in
      // `rulesets.test.ts`, which is the only place it can mean anything.
      const { interpolationDuration, initialSpeed } = GAME_CONFIG.snake;
      expect(interpolationDuration).toBeLessThan(initialSpeed);
    });

    it('declares the speed band, and no longer any dynasty\'s tempo', () => {
      // Speed curves live in the ruleset module, per dynasty. What is left here
      // is the band: `initialSpeed` is now read by exactly one thing — the
      // numerator of CYBER's curve, which divides down toward
      // `CYBER_TICK_FLOOR_MS` (100) and therefore never reaches `minSpeed`.
      //
      // 200 stays 200 because CYBER's opening tempo is unchanged. PRIMAL used
      // to read this same field, which is why WP-3.08 gave it
      // `PRIMAL_SPEED_MS`: retuning PRIMAL's tempo here would have silently
      // retuned CYBER's whole curve with it. This test pins the band and the
      // separation, not a tempo.
      const { initialSpeed, minSpeed } = GAME_CONFIG.snake;
      expect(initialSpeed).toBe(200);
      expect(minSpeed).toBe(50);
    });
  });

  describe('Economy - DNA System', () => {
    it('should have positive DNA rewards', () => {
      expect(GAME_CONFIG.economy.dna.foodValue).toBeGreaterThan(0);
      expect(GAME_CONFIG.economy.dna.completionBonus).toBeGreaterThan(0);
    });

    it('should declare only knobs the settlement fold actually reads', () => {
      // WP-0.03 (GROUND_TRUTH §10): `scoreMultiplier` and `firstWinBonus`
      // were config nothing read. `firstWinBonus` in particular described a
      // first-run-of-day bonus the product does not have - the Daily Take
      // (Constitution §7.2) is that idea, and it owns its own numbers. Their
      // absence is the assertion: a config value that no code path reads is
      // a false fact to the next person who opens this file.
      const dna = GAME_CONFIG.economy.dna as Record<string, unknown>;
      expect(dna.scoreMultiplier).toBeUndefined();
      expect(dna.firstWinBonus).toBeUndefined();
    });

    it('should provide meaningful DNA per food', () => {
      expect(GAME_CONFIG.economy.dna.foodValue).toBeGreaterThanOrEqual(5);
    });
  });

  describe('Economy - Energy Commitment (Constitution §8.6 amendment)', () => {
    it('should cap stored and single-run Energy at six', () => {
      expect(GAME_CONFIG.economy.energy.capacity).toBe(6);
    });

    it('should harvest lean, never zero, on an uncharged run', () => {
      const { leanHarvestFactor } = GAME_CONFIG.economy.energy;
      expect(leanHarvestFactor).toBeGreaterThan(0);
      expect(leanHarvestFactor).toBeLessThan(1);
    });

    it('should hide the meter until the player has met the game', () => {
      const { meterVisibleAtBankedRuns, capacity } =
        GAME_CONFIG.economy.energy;
      expect(meterVisibleAtBankedRuns).toBeGreaterThan(0);
      expect(meterVisibleAtBankedRuns).toBeLessThan(capacity * 2);
    });

    it('should expose one recovery cadence and no purchasable cost', () => {
      const energy = GAME_CONFIG.economy.energy as Record<string, unknown>;
      expect(energy.costPerGame).toBeUndefined();
      expect(energy.recoveryIntervalSeconds).toBe(3600);
      expect(energy.commitmentMultipliersBps).toEqual([
        10_000, 22_000, 36_000, 52_000, 72_000, 100_000,
      ]);
    });

    it('keeps clan cadence, best-five, and delayed-run bounds centralized', () => {
      expect(GAME_CONFIG.economy.clanBattle.activeDurationSeconds).toBe(259_200);
      expect(GAME_CONFIG.economy.clanBattle.intermissionDurationSeconds).toBe(86_400);
      expect(GAME_CONFIG.economy.clanBattle.contributingRunsPerMember).toBe(5);
      expect(GAME_CONFIG.economy.clanBattle.completionGraceSeconds).toBe(10_800);
      expect(GAME_CONFIG.economy.clanBattle.maxEligibleRunDurationSeconds).toBe(10_800);
    });
  });

  describe('Breeding System', () => {
    it('should price a breed in the RPC, never in this file', () => {
      // WP-0.03 (GROUND_TRUTH §10): `baseCost: 50` / `crossDynastyCost: 100`
      // were read by nothing and understated the live price by 4x - the
      // server computes `200 + avg(generation) x 100` in the breeding RPC
      // (migration 018), and Ascendance (WP-1.05) changes that curve there
      // too. A second, cheaper price living in a client-importable config is
      // exactly the drift GROUND_TRUTH §10 records.
      const breeding = GAME_CONFIG.breeding as Record<string, unknown>;
      expect(breeding.baseCost).toBeUndefined();
      expect(breeding.crossDynastyCost).toBeUndefined();
    });

    it('should have valid max active breeds', () => {
      expect(GAME_CONFIG.breeding.maxActive).toBeGreaterThan(0);
    });
  });

  describe('Game Session', () => {
    it('should have achievable victory score', () => {
      expect(GAME_CONFIG.session.victoryScore).toBeGreaterThan(0);
      expect(GAME_CONFIG.session.victoryScore).toBeLessThan(500);
    });

    // WP-2.05: there is no session duration ceiling any more, and this test
    // asserts its absence rather than its range. A run's length is bounded
    // by the validator against the session's own observed server time, not
    // by a constant — a long run is a good run (owner ruling, 2026-07-26).
    it('has no duration ceiling, so a long careful run stays valid', () => {
      expect(
        (GAME_CONFIG.session as Record<string, unknown>).maxDuration
      ).toBeUndefined();
    });

    it('should autosave frequently', () => {
      expect(GAME_CONFIG.session.saveInterval).toBeGreaterThanOrEqual(1000);
      expect(GAME_CONFIG.session.saveInterval).toBeLessThanOrEqual(10000);
    });
  });

  describe('Visual Effects', () => {
    it('should have particles enabled', () => {
      expect(GAME_CONFIG.effects.particlesOnCollect).toBe(true);
    });

    it('should have reasonable particle count', () => {
      expect(GAME_CONFIG.effects.particleCount).toBeGreaterThan(0);
      expect(GAME_CONFIG.effects.particleCount).toBeLessThanOrEqual(100);
    });

    it('should target 60 FPS', () => {
      expect(GAME_CONFIG.effects.targetFPS).toBe(60);
    });
  });

  describe('Feature Flags', () => {
    it('should have breeding enabled for MVP', () => {
      expect(GAME_CONFIG.features.breeding).toBe(true);
    });

    it('should have social features enabled', () => {
      expect(GAME_CONFIG.features.leaderboards).toBe(true);
      expect(GAME_CONFIG.features.clans).toBe(true);
    });

    it('should have future features disabled', () => {
      expect(GAME_CONFIG.features.evolution).toBe(false);
      expect(GAME_CONFIG.features.multiplayer).toBe(false);
    });
  });

  describe('Configuration Consistency', () => {
    it('should have all required top-level keys', () => {
      expect(GAME_CONFIG).toHaveProperty('board');
      expect(GAME_CONFIG).toHaveProperty('snake');
      expect(GAME_CONFIG).toHaveProperty('economy');
      expect(GAME_CONFIG).toHaveProperty('breeding');
      expect(GAME_CONFIG).toHaveProperty('session');
      expect(GAME_CONFIG).toHaveProperty('effects');
      expect(GAME_CONFIG).toHaveProperty('features');
    });

    it('should be immutable (const)', () => {
      expect(() => {
        (GAME_CONFIG as any).board = {};
      }).toThrow();
    });
  });

  describe('Balance Validation', () => {
    it('should reach the real breeding floor in a handful of games', () => {
      // Restated against the price the server actually charges (migration
      // 018: `200 + avg(generation) x 100`, so 300 DNA for a Gen-1 pair)
      // instead of the dead `breeding.baseCost: 50` this test used to read.
      // The assertion is the same product statement - a breed is a few
      // sessions away, not a grind - measured against a number that exists.
      const GEN1_BREED_COST = 300;
      const avgFoodPerGame = 10;
      const dnaPerGame = avgFoodPerGame * GAME_CONFIG.economy.dna.foodValue;
      const gamesNeededToBreed = Math.ceil(GEN1_BREED_COST / dnaPerGame);
      expect(gamesNeededToBreed).toBeLessThanOrEqual(10);
    });

    it('should bound accumulated exposure to a tunable stock', () => {
      const { capacity } = GAME_CONFIG.economy.energy;
      expect(Number.isInteger(capacity)).toBe(true);
      expect(capacity).toBeLessThanOrEqual(12);
    });

    it('should have grid large enough for snake growth', () => {
      const maxSnakeLength = GAME_CONFIG.session.victoryScore;
      const totalCells = GAME_CONFIG.board.gridSize * GAME_CONFIG.board.gridSize;
      expect(totalCells).toBeGreaterThan(maxSnakeLength);
    });
  });
});

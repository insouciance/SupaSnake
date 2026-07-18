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
      const { interpolationDuration, initialSpeed } = GAME_CONFIG.snake;
      expect(interpolationDuration).toBeLessThan(initialSpeed);
    });

    it('exposes the speed band the dynasty rulesets ramp within', () => {
      // Design v2: speed curves live in the ruleset module (per dynasty);
      // config only defines the band. CYBER reaches minSpeed at 100 foods.
      const { initialSpeed, minSpeed } = GAME_CONFIG.snake;
      expect(initialSpeed).toBe(200);
      expect(minSpeed).toBe(50);
    });
  });

  describe('Economy - DNA System', () => {
    it('should have positive DNA rewards', () => {
      expect(GAME_CONFIG.economy.dna.foodValue).toBeGreaterThan(0);
      expect(GAME_CONFIG.economy.dna.scoreMultiplier).toBeGreaterThanOrEqual(0);
      expect(GAME_CONFIG.economy.dna.completionBonus).toBeGreaterThan(0);
      expect(GAME_CONFIG.economy.dna.firstWinBonus).toBeGreaterThan(0);
    });

    it('should reward first win more than completion', () => {
      const { completionBonus, firstWinBonus } = GAME_CONFIG.economy.dna;
      expect(firstWinBonus).toBeGreaterThan(completionBonus);
    });

    it('should provide meaningful DNA per food', () => {
      expect(GAME_CONFIG.economy.dna.foodValue).toBeGreaterThanOrEqual(5);
    });
  });

  describe('Economy - Energy System', () => {
    it('should have valid energy cap', () => {
      expect(GAME_CONFIG.economy.energy.maxEnergy).toBeGreaterThan(0);
      expect(GAME_CONFIG.economy.energy.maxEnergy).toBeLessThanOrEqual(10);
    });

    it('should cost energy per game', () => {
      expect(GAME_CONFIG.economy.energy.costPerGame).toBeGreaterThan(0);
      expect(GAME_CONFIG.economy.energy.costPerGame).toBeLessThanOrEqual(
        GAME_CONFIG.economy.energy.maxEnergy
      );
    });

    it('should have reasonable regen rate', () => {
      const { regenRateMinutes } = GAME_CONFIG.economy.energy;
      expect(regenRateMinutes).toBeGreaterThanOrEqual(5);
      expect(regenRateMinutes).toBeLessThanOrEqual(60);
    });

    it('should have matching millisecond conversion', () => {
      const { regenRateMinutes, regenRateMs } = GAME_CONFIG.economy.energy;
      expect(regenRateMs).toBe(regenRateMinutes * 60 * 1000);
    });

    it('should allow multiple games with full energy', () => {
      const { maxEnergy, costPerGame } = GAME_CONFIG.economy.energy;
      const gamesPerFullBar = Math.floor(maxEnergy / costPerGame);
      expect(gamesPerFullBar).toBeGreaterThanOrEqual(3);
    });
  });

  describe('Breeding System', () => {
    it('should have DNA costs', () => {
      expect(GAME_CONFIG.breeding.baseCost).toBeGreaterThan(0);
      expect(GAME_CONFIG.breeding.crossDynastyCost).toBeGreaterThan(0);
    });

    it('should charge more for cross-dynasty breeding', () => {
      const { baseCost, crossDynastyCost } = GAME_CONFIG.breeding;
      expect(crossDynastyCost).toBeGreaterThan(baseCost);
    });

    it('should be affordable after several games', () => {
      const gamesNeeded = GAME_CONFIG.breeding.baseCost / GAME_CONFIG.economy.dna.foodValue;
      expect(gamesNeeded).toBeLessThan(20);
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

    it('should have reasonable max duration', () => {
      const { maxDuration } = GAME_CONFIG.session;
      expect(maxDuration).toBeGreaterThanOrEqual(60);
      expect(maxDuration).toBeLessThanOrEqual(1800);
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
    it('should earn enough DNA in one game to breed', () => {
      const avgFoodPerGame = 10;
      const dnaPerGame = avgFoodPerGame * GAME_CONFIG.economy.dna.foodValue;
      const gamesNeededToBreed = Math.ceil(GAME_CONFIG.breeding.baseCost / dnaPerGame);
      expect(gamesNeededToBreed).toBeLessThanOrEqual(10);
    });

    it('should regenerate full energy bar in reasonable time', () => {
      const { maxEnergy, regenRateMinutes } = GAME_CONFIG.economy.energy;
      const minutesToFullBar = maxEnergy * regenRateMinutes;
      expect(minutesToFullBar).toBeGreaterThanOrEqual(30);
      expect(minutesToFullBar).toBeLessThanOrEqual(180);
    });

    it('should have grid large enough for snake growth', () => {
      const maxSnakeLength = GAME_CONFIG.session.victoryScore;
      const totalCells = GAME_CONFIG.board.gridSize * GAME_CONFIG.board.gridSize;
      expect(totalCells).toBeGreaterThan(maxSnakeLength);
    });
  });
});

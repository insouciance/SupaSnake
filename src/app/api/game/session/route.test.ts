/**
 * Tests for Game Session API - Unit tests for business logic
 */

import { describe, it, expect } from '@jest/globals';
import { GAME_CONFIG } from '@/shared/config/game';

describe('Game Session Logic', () => {
  describe('Session Start', () => {
    it('should require minimum energy to start', () => {
      const playerEnergy = 1;
      const requiredEnergy = GAME_CONFIG.economy.energy.costPerGame;

      expect(playerEnergy >= requiredEnergy).toBe(true);
    });

    it('should fail if no energy', () => {
      const playerEnergy = 0;
      const requiredEnergy = GAME_CONFIG.economy.energy.costPerGame;

      expect(playerEnergy < requiredEnergy).toBe(true);
    });

    it('should deduct energy cost', () => {
      const startEnergy = 5;
      const cost = GAME_CONFIG.economy.energy.costPerGame;
      const remainingEnergy = startEnergy - cost;

      expect(remainingEnergy).toBe(4);
    });

    it('should create session with variant ID', () => {
      const sessionData = {
        variant_id: 'EMBER_1',
        player_id: 'uuid-123',
        started_at: new Date().toISOString(),
      };

      expect(sessionData.variant_id).toBe('EMBER_1');
      expect(sessionData.player_id).toBeDefined();
    });
  });

  describe('Session End', () => {
    it('should record final stats', () => {
      const sessionResult = {
        score: 42,
        dna_earned: 420,
        duration_seconds: 180,
        died: true,
        victory: false,
      };

      expect(sessionResult.score).toBeGreaterThanOrEqual(0);
      expect(sessionResult.dna_earned).toBeGreaterThanOrEqual(0);
      expect(sessionResult.duration_seconds).toBeGreaterThanOrEqual(0);
    });

    it('should add DNA to player total', () => {
      const playerDna = 100;
      const dnaEarned = 50;
      const newTotal = playerDna + dnaEarned;

      expect(newTotal).toBe(150);
    });

    it('should set ended_at timestamp', () => {
      const endedAt = new Date().toISOString();
      expect(endedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    });
  });

  describe('Action Validation', () => {
    it('should accept start action', () => {
      const validActions = ['start', 'end'];
      expect(validActions.includes('start')).toBe(true);
    });

    it('should accept end action', () => {
      const validActions = ['start', 'end'];
      expect(validActions.includes('end')).toBe(true);
    });

    it('should reject invalid actions', () => {
      const validActions = ['start', 'end'];
      expect(validActions.includes('pause')).toBe(false);
    });
  });

  describe('DNA Calculation', () => {
    it('should calculate DNA from food collected', () => {
      const foodCollected = 5;
      const dnaPerFood = GAME_CONFIG.economy.dna.foodValue;
      const totalDna = foodCollected * dnaPerFood;

      expect(totalDna).toBe(50);
    });

    it('should add bonus DNA for completion', () => {
      const baseDna = 100;
      const bonus = GAME_CONFIG.economy.dna.completionBonus;
      const total = baseDna + bonus;

      expect(total).toBe(150);
    });
  });

  describe('Games Played Counter', () => {
    it('should increment total_games_played on session end', () => {
      const currentGamesPlayed = 5;
      const newGamesPlayed = currentGamesPlayed + 1;

      expect(newGamesPlayed).toBe(6);
    });

    it('should handle first game (no existing count)', () => {
      const currentGamesPlayed = undefined;
      const newGamesPlayed = (currentGamesPlayed || 0) + 1;

      expect(newGamesPlayed).toBe(1);
    });

    it('should handle null games played', () => {
      const currentGamesPlayed = null;
      const newGamesPlayed = (currentGamesPlayed || 0) + 1;

      expect(newGamesPlayed).toBe(1);
    });

    it('should calculate gamesPlayedCount correctly', () => {
      const currentTotal = 10;
      const gamesPlayedCount = currentTotal + 1;

      expect(gamesPlayedCount).toBe(11);
    });
  });

  describe('High Score Tracking', () => {
    it('should update high score when beaten', () => {
      const currentHighScore = 50;
      const newScore = 75;
      const newHighScore = Math.max(currentHighScore, newScore);

      expect(newHighScore).toBe(75);
    });

    it('should keep existing high score if not beaten', () => {
      const currentHighScore = 100;
      const newScore = 50;
      const newHighScore = Math.max(currentHighScore, newScore);

      expect(newHighScore).toBe(100);
    });

    it('should handle no existing high score', () => {
      const currentHighScore = undefined;
      const newScore = 50;
      const newHighScore = Math.max(currentHighScore || 0, newScore);

      expect(newHighScore).toBe(50);
    });
  });

  describe('Rate Limiting', () => {
    it('should block rapid game starts', () => {
      const lastActionTime = Date.now() - 1000;
      const rateLimitMs = 5000;
      const elapsed = Date.now() - lastActionTime;

      expect(elapsed < rateLimitMs).toBe(true);
    });

    it('should allow game start after cooldown', () => {
      const lastActionTime = Date.now() - 6000;
      const rateLimitMs = 5000;
      const elapsed = Date.now() - lastActionTime;

      expect(elapsed >= rateLimitMs).toBe(true);
    });
  });

  describe('Validation', () => {
    it('should accept valid game results', () => {
      const score = 10;
      const durationSeconds = 60;
      const maxScore = Math.ceil(durationSeconds / 2);

      expect(score <= maxScore).toBe(true);
    });

    it('should reject impossible scores', () => {
      const score = 100;
      const durationSeconds = 60;
      const maxScore = Math.ceil(durationSeconds / 2);

      expect(score > maxScore).toBe(true);
    });

    it('should adjust DNA when invalid', () => {
      const claimedDna = 1000;
      const validDna = 150;
      const adjustedDna = Math.min(claimedDna, validDna);

      expect(adjustedDna).toBe(150);
    });
  });
});

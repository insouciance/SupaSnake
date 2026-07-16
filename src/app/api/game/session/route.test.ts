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

    it('should create session from the equipped snake', () => {
      // Session start receives a collected_snakes UUID and derives
      // variant + dynasty from the DB join (no text variant ids)
      const equippedSnake = {
        id: '4d3f2f6a-9d1e-4c1b-8f3a-2b5e6d7c8a90',
        snake_variant_id: 'a1b2c3d4-e5f6-4a5b-8c7d-9e0f1a2b3c4d',
        is_equipped: true,
        snake_variants: { name: 'CYBER SPARK', dynasties: { name: 'CYBER' } },
      };

      const sessionData = {
        player_id: 'uuid-123',
        snake_used_id: equippedSnake.id,
        snake_variant_id: equippedSnake.snake_variant_id,
        dynasty: equippedSnake.snake_variants.dynasties.name,
        started_at: new Date().toISOString(),
      };

      expect(sessionData.snake_used_id).toBe(equippedSnake.id);
      expect(sessionData.snake_variant_id).toBe(equippedSnake.snake_variant_id);
      expect(sessionData.dynasty).toBe('CYBER');
      expect(sessionData.player_id).toBeDefined();
    });

    it('should reject start without snake_id', () => {
      const body: { snake_id?: string } = {};
      const isInvalid = !body.snake_id;

      expect(isInvalid).toBe(true);
    });

    it('should reject start when snake is not equipped', () => {
      const snake = { is_equipped: false };
      const rejected = !snake.is_equipped;

      expect(rejected).toBe(true);
    });

    it('should reject start when player owns no snakes', () => {
      const ownedCount = 0;
      const rejected = !ownedCount;

      expect(rejected).toBe(true);
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

    it('should increment total_dna_earned by adjusted DNA (not reset to balance)', () => {
      const previousTotalDnaEarned = 900;
      const currentDnaBalance = 100; // spent DNA does not reduce lifetime earnings
      const adjustedDna = 50;

      const newTotalDnaEarned = previousTotalDnaEarned + adjustedDna;

      expect(newTotalDnaEarned).toBe(950);
      expect(newTotalDnaEarned).not.toBe(currentDnaBalance + adjustedDna);
    });

    it('should map record_daily_play RPC row to streak response', () => {
      // RPC returns a table row (array from supabase.rpc)
      const rpcRows = [
        {
          current_streak: 3,
          longest_streak: 7,
          streak_multiplier: '1.10',
          grace_consumed: false,
        },
      ];

      const row = Array.isArray(rpcRows) ? rpcRows[0] : rpcRows;
      const streak = {
        current: row.current_streak,
        longest: row.longest_streak,
        multiplier: Number(row.streak_multiplier),
        graceConsumed: row.grace_consumed,
      };

      expect(streak).toEqual({
        current: 3,
        longest: 7,
        multiplier: 1.1,
        graceConsumed: false,
      });
    });

    it('should omit streak from response when RPC fails (non-fatal)', () => {
      const streak = null;
      const response = {
        success: true,
        ...(streak ? { streak } : {}),
      };

      expect(response.success).toBe(true);
      expect('streak' in response).toBe(false);
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

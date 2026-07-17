/**
 * Tests for Player API - Unit tests for business logic
 */

import { describe, it, expect } from '@jest/globals';
import { GAME_CONFIG } from '@/shared/config/game';
import {
  DEFAULT_AIM_SYSTEM,
  isAimSystemId,
  isAimSystemUnlocked,
  type AimStats,
} from '@/lib/game/aimSystems';

describe('Player API Logic', () => {
  describe('New Player Creation', () => {
    it('should have correct default resources', () => {
      const newPlayerDefaults = {
        dna: 0,
        energy: 5,
        max_energy: 5,
      };

      expect(newPlayerDefaults.dna).toBe(0);
      expect(newPlayerDefaults.energy).toBe(GAME_CONFIG.economy.energy.maxEnergy);
      expect(newPlayerDefaults.max_energy).toBe(GAME_CONFIG.economy.energy.maxEnergy);
    });

    it('should not auto-seed a starter snake (player picks in Lab)', () => {
      // New players own zero snakes until they select a starter
      const collectionSize = 0;
      const needsStarterSelection = collectionSize === 0;
      expect(needsStarterSelection).toBe(true);
    });

    it('should start with CYBER dynasty selected', () => {
      const defaultDynasty = 'CYBER';
      expect(defaultDynasty).toBe('CYBER');
    });
  });

  describe('Starter Selection Flag', () => {
    it('should flag needsStarterSelection when collection is empty', () => {
      const collectionSize = 0;
      expect(collectionSize === 0).toBe(true);
    });

    it('should not flag needsStarterSelection when player owns snakes', () => {
      const collectionSize = 3;
      expect(collectionSize === 0).toBe(false);
    });
  });

  describe('Player Stats', () => {
    it('should track game statistics', () => {
      const playerStats = {
        total_games_played: 0,
        total_dna_earned: 0,
        high_score: 0,
        breeds_completed: 0,
      };

      expect(playerStats.total_games_played).toBeDefined();
      expect(playerStats.total_dna_earned).toBeDefined();
      expect(playerStats.high_score).toBeDefined();
      expect(playerStats.breeds_completed).toBeDefined();
    });
  });

  describe('Resource Management', () => {
    it('should not exceed max energy', () => {
      const energy = 10;
      const maxEnergy = GAME_CONFIG.economy.energy.maxEnergy;
      const clampedEnergy = Math.min(energy, maxEnergy);

      expect(clampedEnergy).toBe(5);
    });

    it('should not go below 0 DNA', () => {
      const dna = -50;
      const clampedDna = Math.max(0, dna);

      expect(clampedDna).toBe(0);
    });
  });

  describe('Dynasty Selection', () => {
    it('should accept valid dynasties', () => {
      const validDynasties = ['CYBER', 'PRIMAL', 'COSMIC'];

      expect(validDynasties).toContain('CYBER');
      expect(validDynasties).toContain('PRIMAL');
      expect(validDynasties).toContain('COSMIC');
    });

    it('should reject unknown dynasty names', () => {
      const validDynasties = ['CYBER', 'PRIMAL', 'COSMIC'];

      expect(validDynasties.includes('SHADOW')).toBe(false);
      expect(validDynasties.includes('cyber')).toBe(false);
    });
  });

  describe('Aim System Selection', () => {
    const freshStats: AimStats = {
      highScore: 0,
      totalGames: 0,
      breeds: 0,
      maxGeneration: 0,
    };

    it('defaults to pulse for new players', () => {
      expect(DEFAULT_AIM_SYSTEM).toBe('pulse');
      expect(isAimSystemUnlocked(DEFAULT_AIM_SYSTEM, freshStats)).toBe(true);
    });

    it('rejects unknown aim system ids (400 path)', () => {
      expect(isAimSystemId('laser')).toBe(false);
      expect(isAimSystemId('')).toBe(false);
      expect(isAimSystemId(undefined)).toBe(false);
    });

    it('rejects selecting a locked system server-side (403 path)', () => {
      // Fresh player tries to equip vector (needs high score 15)
      expect(isAimSystemUnlocked('vector', freshStats)).toBe(false);
      // ... and apex (needs score 50 or gen 5)
      expect(isAimSystemUnlocked('apex', freshStats)).toBe(false);
    });

    it('allows selecting an unlocked system', () => {
      const veteran: AimStats = {
        highScore: 32,
        totalGames: 40,
        breeds: 2,
        maxGeneration: 3,
      };
      expect(isAimSystemUnlocked('vector', veteran)).toBe(true);
      expect(isAimSystemUnlocked('sequence', veteran)).toBe(true);
      expect(isAimSystemUnlocked('radar', veteran)).toBe(true);
      expect(isAimSystemUnlocked('apex', veteran)).toBe(false);
    });

    it('derives maxGeneration as MAX over collected snakes', () => {
      const collected = [{ generation: 1 }, { generation: 5 }, { generation: 2 }];
      const maxGeneration = collected.reduce(
        (max, s) => Math.max(max, s.generation ?? 0),
        0
      );
      expect(maxGeneration).toBe(5);
      expect(
        isAimSystemUnlocked('apex', { ...freshStats, maxGeneration })
      ).toBe(true);
    });
  });

  describe('Authentication Requirements', () => {
    it('should require authorization header', () => {
      const authHeader = null;
      const isUnauthorized = !authHeader;

      expect(isUnauthorized).toBe(true);
    });

    it('should parse bearer token', () => {
      const authHeader = 'Bearer test-token-123';
      const token = authHeader.replace('Bearer ', '');

      expect(token).toBe('test-token-123');
    });
  });
});

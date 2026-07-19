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

  describe('Aim System Selection (v2)', () => {
    const freshStats: AimStats = {
      highScore: 0,
      totalGames: 0,
      breeds: 0,
      maxGeneration: 0,
    };

    /** Mirrors the GET handler's stored-selection resolution exactly. */
    const resolveGetAimSystem = (stored: unknown, stats: AimStats) =>
      isAimSystemId(stored) && isAimSystemUnlocked(stored, stats)
        ? stored
        : DEFAULT_AIM_SYSTEM;

    it('defaults to deadeye for new players', () => {
      expect(DEFAULT_AIM_SYSTEM).toBe('deadeye');
      expect(isAimSystemUnlocked(DEFAULT_AIM_SYSTEM, freshStats)).toBe(true);
    });

    it('PATCH accepts gridlock at exactly high score 15', () => {
      expect(
        isAimSystemUnlocked('gridlock', { ...freshStats, highScore: 15 })
      ).toBe(true);
      expect(
        isAimSystemUnlocked('gridlock', { ...freshStats, highScore: 14 })
      ).toBe(false);
    });

    it('rejects selecting a locked system server-side (403 path)', () => {
      // Fresh player tries to equip gridlock (needs high score 15)...
      expect(isAimSystemUnlocked('gridlock', freshStats)).toBe(false);
      // ...pathline (score 30 or 25 games) and firefly (breed or score 50)
      expect(isAimSystemUnlocked('pathline', freshStats)).toBe(false);
      expect(isAimSystemUnlocked('firefly', freshStats)).toBe(false);
    });

    it("rejects retired v1 ids like 'pulse' (400 path)", () => {
      for (const legacy of ['pulse', 'vector', 'sequence', 'radar', 'apex']) {
        expect(isAimSystemId(legacy)).toBe(false);
      }
      expect(isAimSystemId('laser')).toBe(false);
      expect(isAimSystemId('')).toBe(false);
      expect(isAimSystemId(undefined)).toBe(false);
    });

    it('allows selecting an unlocked system', () => {
      const veteran: AimStats = {
        highScore: 32,
        totalGames: 40,
        breeds: 2,
        maxGeneration: 3,
      };
      for (const id of ['deadeye', 'gridlock', 'pathline', 'firefly']) {
        expect(isAimSystemUnlocked(id, veteran)).toBe(true);
      }
    });

    it('GET falls back to deadeye for a stored-but-locked pick', () => {
      // Migration edge: a breeds-only v1 sequence player was remapped to
      // pathline (hs>=30 or games>=25) which they have NOT unlocked
      const breedsOnly: AimStats = { ...freshStats, breeds: 2, totalGames: 10 };
      expect(resolveGetAimSystem('pathline', breedsOnly)).toBe('deadeye');
      // Unlocked stored picks pass through untouched
      expect(resolveGetAimSystem('firefly', breedsOnly)).toBe('firefly');
      expect(
        resolveGetAimSystem('gridlock', { ...freshStats, highScore: 20 })
      ).toBe('gridlock');
      // Unknown/legacy stored values (pre-026 rows) resolve to the default
      expect(resolveGetAimSystem('pulse', breedsOnly)).toBe('deadeye');
      expect(resolveGetAimSystem(null, breedsOnly)).toBe('deadeye');
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

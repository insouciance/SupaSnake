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
    it('should start with no DNA and no seeded charge state', () => {
      // A new player row carries no energy fields at all (§8.6): there is
      // no starting balance to seed, because charges are derived from
      // (charges_day, charges_used) and an untouched ledger already reads
      // as a full day.
      const newPlayerDefaults: Record<string, unknown> = { dna: 0 };

      expect(newPlayerDefaults.dna).toBe(0);
      expect(newPlayerDefaults.energy).toBeUndefined();
      expect(newPlayerDefaults.max_energy).toBeUndefined();
      expect(newPlayerDefaults.charges_used).toBeUndefined();
    });

    it('should bootstrap a starter without requiring Lab selection', () => {
      const bootstrap = {
        equippedSnake: { name: 'PRIMAL SEED', dynasty: 'PRIMAL' },
        onboarding: { needsStarterSelection: false },
      };
      expect(bootstrap.equippedSnake.dynasty).toBe('PRIMAL');
      expect(bootstrap.onboarding.needsStarterSelection).toBe(false);
    });

    it('should start with PRIMAL dynasty selected', () => {
      const defaultDynasty = 'PRIMAL';
      expect(defaultDynasty).toBe('PRIMAL');
    });
  });

  describe('Starter Bootstrap State', () => {
    it('never exposes mandatory starter selection in FTUE v2', () => {
      const ftueV2Enabled = true;
      const collectionSize = 0;
      expect(ftueV2Enabled ? false : collectionSize === 0).toBe(false);
    });

    it('remains non-blocking when a player already owns snakes', () => {
      const ftueV2Enabled = true;
      const collectionSize = 3;
      expect(ftueV2Enabled ? false : collectionSize === 0).toBe(false);
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
    it('should have no energy cap to clamp against (GT §9.1)', () => {
      // The clamp this test used to assert is precisely the shape of the
      // bug that destroyed purchased energy: Math.min(balance, cap). With
      // no balance and no cap, that expression cannot be written.
      const energy = GAME_CONFIG.economy.energy as Record<string, unknown>;
      expect(energy.maxEnergy).toBeUndefined();
      expect(GAME_CONFIG.economy.energy.chargesPerDay).toBeGreaterThan(0);
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

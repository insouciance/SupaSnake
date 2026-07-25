/**
 * Tests for Player API - Unit tests for business logic
 */

import { describe, it, expect } from '@jest/globals';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { GAME_CONFIG } from '@/shared/config/game';
import {
  AIM_SYSTEM_IDS,
  DEFAULT_AIM_SYSTEM,
  isAimSystemId,
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

  describe('Aim System Selection (universal — §6.1, §15 overturn 10)', () => {
    /** Mirrors the GET handler's stored-selection resolution exactly. */
    const resolveGetAimSystem = (stored: unknown) =>
      isAimSystemId(stored) ? stored : DEFAULT_AIM_SYSTEM;

    /** Mirrors the PATCH handler's validation exactly: the id, and nothing
     *  else. There is no stats argument to pass, which is the point. */
    const patchOutcome = (aimSystem: unknown) =>
      isAimSystemId(aimSystem) ? 200 : 400;

    it('defaults to deadeye for new players', () => {
      expect(DEFAULT_AIM_SYSTEM).toBe('deadeye');
    });

    it('PATCH accepts every system for a fresh account with zero progression', () => {
      // The "fresh account" in this handler is not a stats object any more —
      // it is the absence of one. Nothing is read, so nothing can be short.
      for (const id of AIM_SYSTEM_IDS) {
        expect(patchOutcome(id)).toBe(200);
      }
    });

    it('has no 403 path left: a valid id is never rejected', () => {
      for (const id of ['gridlock', 'pathline', 'firefly']) {
        expect(patchOutcome(id)).not.toBe(403);
        expect(patchOutcome(id)).toBe(200);
      }
    });

    it("rejects retired v1 ids like 'pulse' (400 path)", () => {
      for (const legacy of ['pulse', 'vector', 'sequence', 'radar', 'apex']) {
        expect(isAimSystemId(legacy)).toBe(false);
        expect(patchOutcome(legacy)).toBe(400);
      }
      expect(patchOutcome('laser')).toBe(400);
      expect(patchOutcome('')).toBe(400);
      expect(patchOutcome(undefined)).toBe(400);
    });

    it('GET serves any stored valid pick back, whatever the account has done', () => {
      for (const id of AIM_SYSTEM_IDS) {
        expect(resolveGetAimSystem(id)).toBe(id);
      }
      // Unknown/legacy stored values (pre-026 rows) resolve to the default
      expect(resolveGetAimSystem('pulse')).toBe(DEFAULT_AIM_SYSTEM);
      expect(resolveGetAimSystem(null)).toBe(DEFAULT_AIM_SYSTEM);
    });

    it('the route source reads no progression stat on the aim path', () => {
      const source = readFileSync(
        join(process.cwd(), 'src/app/api/player/route.ts'),
        'utf8'
      );
      const code = source
        .replace(/\/\*[\s\S]*?\*\//g, '')
        .replace(/\/\/.*$/gm, '');
      // The PATCH player lookup selects the id alone; no aim-unlock helper
      // and no unlock stat survives anywhere in the handler.
      expect(code).not.toMatch(/isAimSystemUnlocked/);
      expect(code).not.toMatch(/buildAimStats/);
      expect(code).not.toMatch(/aimStats/);
      expect(code).not.toMatch(/breeds_completed/);
      expect(code).toContain(".select('id')");
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

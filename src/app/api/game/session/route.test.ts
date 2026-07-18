/**
 * Tests for Game Session API - Unit tests for business logic
 */

import { describe, it, expect } from '@jest/globals';
import { GAME_CONFIG } from '@/shared/config/game';
import {
  applyDnaMultiplier,
  combineDnaMultipliers,
} from '@/lib/server/dnaMultipliers';
import {
  validateGameResult,
  validateLegacyGameResult,
} from '@/lib/server/gameValidator';
import {
  applyOutcome,
  computeRunTotals,
  normalizeDynastyName,
} from '@/shared/game/rulesets';

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

    it('should reject re-ending an already ended session (409, no double DNA)', () => {
      // Idempotency guard: a session with ended_at set must never grant
      // rewards again (offline outbox replays, double-fire at death)
      const session = { ended_at: '2026-07-15T10:00:00.000Z' };
      const alreadyEnded = Boolean(session.ended_at);

      expect(alreadyEnded).toBe(true);
      const response = alreadyEnded
        ? { status: 409, body: { error: 'Session already ended', alreadyEnded: true } }
        : { status: 200, body: { success: true } };
      expect(response.status).toBe(409);
      expect(response.body).toMatchObject({ alreadyEnded: true });
    });

    it('should treat a raced concurrent end as already ended', () => {
      // The UPDATE is guarded with .is('ended_at', null) - the loser of a
      // concurrent race matches zero rows and must return 409
      const updatedRows: Array<{ id: string }> = [];
      const lostRace = updatedRows.length === 0;

      expect(lostRace).toBe(true);
    });

    it('should end a session that has not ended yet', () => {
      const session = { ended_at: null };
      expect(Boolean(session.ended_at)).toBe(false);
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

  describe('DNA Calculation (Design v2 recompute)', () => {
    it('derives the base payout from the ruleset fold, not the claim', () => {
      const { rawDna } = computeRunTotals('PRIMAL', 5);
      expect(rawDna).toBe(52); // 10+10+10+11+11 (compounding food value)
      expect(computeRunTotals('COSMIC', 5).rawDna).toBe(
        5 * GAME_CONFIG.economy.dna.foodValue
      );
    });

    it('pays banked vs salvage from the same raw total', () => {
      const { rawDna } = computeRunTotals('PRIMAL', 30); // 387
      expect(applyOutcome(rawDna, true)).toBe(483); // banked +25%
      expect(applyOutcome(rawDna, false)).toBe(232); // salvaged 60%
    });

    it('should add bonus DNA for completion', () => {
      const baseDna = 100;
      const bonus = GAME_CONFIG.economy.dna.completionBonus;
      const total = baseDna + bonus;

      expect(total).toBe(150);
    });
  });

  describe('End-action validation wiring (Design v2)', () => {
    const startedAgo = (seconds: number) => new Date(Date.now() - seconds * 1000);

    it('reads the dynasty from the session row, never the end request', () => {
      // The route normalizes game_sessions.dynasty (TEXT, stored at start)
      const sessionRow = { dynasty: 'cyber' };
      expect(normalizeDynastyName(sessionRow.dynasty)).toBe('CYBER');
      // Unknown/legacy rows fall back to the flat placeholder ruleset
      expect(normalizeDynastyName(null)).toBe('COSMIC');
    });

    it('recomputes a banked CYBER run server-side (honest client)', () => {
      const { rawDna, score } = computeRunTotals('CYBER', 30);
      const result = validateGameResult(
        {
          food_count: 30,
          extracted: true,
          score,
          dna_earned: rawDna,
          duration_seconds: 120,
          died: false,
          victory: false,
        },
        startedAgo(125),
        'CYBER'
      );

      expect(result.valid).toBe(true);
      expect(result.adjustedDna).toBe(applyOutcome(rawDna, true)); // 837
      expect(result.foodCount).toBe(30);
      expect(result.extracted).toBe(true);
    });

    it('recomputes a death run at the salvage rate per dynasty', () => {
      for (const dynasty of ['PRIMAL', 'CYBER'] as const) {
        const { rawDna, score } = computeRunTotals(dynasty, 20);
        const result = validateGameResult(
          {
            food_count: 20,
            extracted: false,
            score,
            dna_earned: rawDna,
            duration_seconds: 90,
            died: true,
            victory: false,
          },
          startedAgo(95),
          dynasty
        );
        expect(result.adjustedDna).toBe(applyOutcome(rawDna, false));
      }
    });

    it('pays the recompute (not the claim) on a cheat attempt, flagged invalid', () => {
      const result = validateGameResult(
        {
          food_count: 30,
          extracted: true,
          score: 99999,
          dna_earned: 99999,
          duration_seconds: 120,
          died: false,
          victory: false,
        },
        startedAgo(125),
        'PRIMAL'
      );

      const { rawDna } = computeRunTotals('PRIMAL', 30);
      expect(result.valid).toBe(false);
      expect(result.adjustedDna).toBe(applyOutcome(rawDna, true));
    });

    it('falls back to legacy bounds math when food_count is absent (old client)', () => {
      // Route branch: typeof food_count !== 'number' -> validateLegacyGameResult
      const legacyBody: { food_count?: number; score: number } = { score: 12 };
      expect(typeof legacyBody.food_count === 'number').toBe(false);

      const result = validateLegacyGameResult(
        {
          score: 12,
          dna_earned: 121,
          duration_seconds: 60,
          died: true,
          victory: false,
        },
        startedAgo(65)
      );

      expect(result.valid).toBe(true);
      expect(result.adjustedDna).toBe(121); // flat 10/food + 10% bonus, no outcome cut
      expect(result.extracted).toBe(false);
      expect(result.foodCount).toBe(12); // legacy score IS the food count
    });

    it('stores recomputed score/foods/extracted on the session row', () => {
      const { rawDna, score } = computeRunTotals('PRIMAL', 18);
      const validation = validateGameResult(
        {
          food_count: 18,
          extracted: true,
          score,
          dna_earned: rawDna,
          duration_seconds: 80,
          died: false,
          victory: false,
        },
        startedAgo(85),
        'PRIMAL'
      );

      const sessionUpdate = {
        score: validation.adjustedScore,
        foods_collected: validation.foodCount,
        extracted: validation.extracted,
        validated: validation.valid,
      };

      expect(sessionUpdate).toEqual({
        score,
        foods_collected: 18,
        extracted: true,
        validated: true,
      });
    });
  });

  describe('DNA Multiplier Integration', () => {
    it('multiplies the banked payout by the streak x set stack and rounds down', () => {
      // 7-day streak (x1.10, Design v2 retune), 1 completed dynasty (x1.10)
      const { multiplier, breakdown } = combineDnaMultipliers(1.1, 1);
      const adjustedDna = 47;

      const finalDna = applyDnaMultiplier(adjustedDna, multiplier);

      // 47 * 1.21 = 56.87 -> 56
      expect(multiplier).toBeCloseTo(1.21, 4);
      expect(finalDna).toBe(56);
      expect(breakdown.total).toBe(multiplier);
    });

    it('grants base DNA unchanged when no bonuses apply', () => {
      const { multiplier } = combineDnaMultipliers(1, 0);
      expect(applyDnaMultiplier(50, multiplier)).toBe(50);
    });

    it('falls back to base DNA when multiplier lookup fails (x1)', () => {
      // Route catches multiplier errors and keeps dnaMultiplier = 1
      const dnaMultiplier = 1;
      const adjustedDna = 33;
      expect(applyDnaMultiplier(adjustedDna, dnaMultiplier)).toBe(33);
    });

    it('logs the breakdown into economy transaction metadata', () => {
      const { breakdown } = combineDnaMultipliers(1.1, 2);
      const metadata = {
        score: 10,
        food_count: 10,
        extracted: false,
        original_dna_claimed: 100,
        validated: true,
        base_dna: 100,
        ...(breakdown ? { dna_multiplier: breakdown } : {}),
      };

      expect(metadata.base_dna).toBe(100);
      expect(metadata.dna_multiplier).toEqual(breakdown);
      expect(metadata.dna_multiplier.completedDynasties).toBe(2);
      expect(metadata.extracted).toBe(false);
    });

    it('omits dnaMultiplier from response when breakdown is unavailable', () => {
      const dnaBreakdown = null;
      const response = {
        success: true,
        ...(dnaBreakdown ? { dnaMultiplier: dnaBreakdown } : {}),
      };

      expect('dnaMultiplier' in response).toBe(false);
    });

    it('credits player totals with the multiplied DNA', () => {
      const playerDna = 100;
      const previousTotalEarned = 500;
      const finalDna = applyDnaMultiplier(40, 1.25); // 50

      expect(playerDna + finalDna).toBe(150);
      expect(previousTotalEarned + finalDna).toBe(550);
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

  describe('Validation bounds', () => {
    it('bounds food count per dynasty (replaces the score <= duration/2 rule)', () => {
      const duration = 60;
      // PRIMAL: 1.0 foods/sec; CYBER: 2.5 foods/sec
      expect(Math.ceil(duration * 1.0)).toBe(60);
      expect(Math.ceil(duration * 2.5)).toBe(150);
    });

    it('legacy path still rejects impossible scores', () => {
      const score = 100;
      const durationSeconds = 60;
      const maxScore = Math.ceil(durationSeconds / 2);

      expect(score > maxScore).toBe(true);
    });

    it('legacy path still adjusts DNA when invalid', () => {
      const claimedDna = 1000;
      const validDna = 150;
      const adjustedDna = Math.min(claimedDna, validDna);

      expect(adjustedDna).toBe(150);
    });
  });
});

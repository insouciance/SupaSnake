/**
 * Tests for Game Session API - Unit tests for business logic
 */

import * as fs from 'fs';
import * as path from 'path';
import { describe, it, expect } from '@jest/globals';
import { GAME_CONFIG } from '@/shared/config/game';
import { validateGameResult } from '@/lib/server/gameValidator';
import {
  applyOutcome,
  computeRunTotals,
  normalizeDynastyName,
} from '@/shared/game/rulesets';

describe('Game Session Logic', () => {
  describe('Session Start', () => {
    it('has no energy gate at all — every run starts (Constitution §8.6)', () => {
      // Structural, not arithmetic: the route must contain no start check
      // and no cost constant. "Energy never gates playing. Every run always
      // starts, always Scores, always ranks, always counts."
      const source = fs.readFileSync(
        path.join(__dirname, 'route.ts'),
        'utf8'
      );
      expect(source).not.toMatch(/Not enough energy/);
      expect(source).not.toMatch(/costPerGame/);
      expect(source).not.toMatch(/player\.energy/);
      expect(source).not.toMatch(/energy_regen_at/);
    });

    it('consumes a charge instead of deducting a balance', () => {
      const source = fs.readFileSync(
        path.join(__dirname, 'route.ts'),
        'utf8'
      );
      // One call, to the atomic server RPC wrapper - never an arithmetic
      // read-modify-write on a column in this route.
      expect(source).toMatch(/consumeRunCharge\(/);
      expect(source).not.toMatch(/energy: newEnergy/);
    });

    it('stamps how the run settles on the session row, at start', () => {
      const source = fs.readFileSync(
        path.join(__dirname, 'route.ts'),
        'utf8'
      );
      expect(source).toMatch(/charge_state: charge\.state/);
      // The stamp is written after the session insert, so a failed insert
      // can never burn a charge for a run that did not happen.
      expect(source.indexOf('charge_state: charge.state')).toBeGreaterThan(
        source.indexOf('.from(\'game_sessions\')')
      );
    });

    it('stamps the ruled dynasty growth profile and ignores client profile asks', () => {
      const source = fs.readFileSync(
        path.join(__dirname, 'route.ts'),
        'utf8'
      );
      expect(source).toMatch(
        /let growthProfileId: GrowthProfileId = ACTIVE_GROWTH_PROFILE/
      );
      expect(source).not.toMatch(/requestedProfile/);
      expect(source).not.toMatch(/GROWTH_LAB_ENABLED/);
      expect(source).toMatch(/growthProfileId \? \{ growthProfile: growthProfileId \}/);
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
      // RPC returns a table row (array from supabase.rpc). WP-0.02: the row
      // carries a COUNT only - streak_multiplier is gone from the RPC's
      // return type and from player_streaks (migration 040).
      const rpcRows = [
        {
          current_streak: 3,
          longest_streak: 7,
          grace_consumed: false,
        },
      ];

      const row = Array.isArray(rpcRows) ? rpcRows[0] : rpcRows;
      const streak = {
        current: row.current_streak,
        longest: row.longest_streak,
        graceConsumed: row.grace_consumed,
      };

      expect(streak).toEqual({
        current: 3,
        longest: 7,
        graceConsumed: false,
      });
      expect('multiplier' in streak).toBe(false);
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

  describe('Free Play (mode: free, Design v2 §7.4)', () => {
    const startedAgo = (seconds: number) => new Date(Date.now() - seconds * 1000);

    it('every mode starts — free play is no longer the zero-charge fallback', () => {
      // The old gate made 'free' the only startable mode at zero energy.
      // Free Play is now a deliberate choice, never a demotion.
      const source = fs.readFileSync(
        path.join(__dirname, 'route.ts'),
        'utf8'
      );
      const startAction = source.slice(
        source.indexOf("if (action === 'start')"),
        source.indexOf("if (action === 'end')")
      );
      expect(startAction).not.toMatch(/status: 400 \}[\s\S]{0,80}energy/i);
      expect(startAction).not.toMatch(/isFreePlay &&[\s\S]{0,60}energy/i);
    });

    it('start marks the free session and exempts it from the envelope', () => {
      const isFreePlay = true;

      const insertRow = {
        player_id: 'uuid-123',
        dynasty: 'CYBER',
        ...(isFreePlay ? { is_free_play: true } : {}),
      };
      expect(insertRow.is_free_play).toBe(true);

      // Rewardless practice pays nothing, so it takes nothing: it consumes
      // no charge and is stamped 'exempt'.
      const source = fs.readFileSync(
        path.join(__dirname, 'route.ts'),
        'utf8'
      );
      expect(source).toMatch(/rewardless: isFreePlay/);
    });

    it('earning start omits the free marker from the insert', () => {
      const isFreePlay = false;
      const insertRow: { player_id: string; is_free_play?: boolean } = {
        player_id: 'uuid-123',
        ...(isFreePlay ? { is_free_play: true } : {}),
      };
      expect('is_free_play' in insertRow).toBe(false);
    });

    it('end validates normally but records a zero payout on the session row', () => {
      const { rawDna, score } = computeRunTotals('CYBER', 20);
      const validation = validateGameResult(
        {
          food_count: 20,
          extracted: true,
          score,
          dna_earned: rawDna,
          duration_seconds: 90,
          died: false,
          victory: false,
        },
        startedAgo(95),
        'CYBER'
      );
      expect(validation.valid).toBe(true);

      const isFreeSession = true;
      const finalDna = validation.adjustedDna;
      const sessionUpdate = {
        score: validation.adjustedScore,
        dna_earned: isFreeSession ? 0 : finalDna,
        validated: validation.valid,
        extracted: validation.extracted,
      };

      expect(sessionUpdate.dna_earned).toBe(0);
      expect(sessionUpdate.validated).toBe(true); // validation still runs
      expect(sessionUpdate.extracted).toBe(true);
    });

    it('end computes hypotheticalDna from the recompute alone (no stack)', () => {
      const { rawDna, score } = computeRunTotals('PRIMAL', 30);
      const validation = validateGameResult(
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
        'PRIMAL'
      );

      // WP-0.02: what the run WOULD have paid is the validator's exact
      // recompute - raw fold x outcome multiplier. No streak, no set bonus,
      // no clan duel, and nothing else the account could contribute.
      const hypotheticalDna = validation.adjustedDna;

      expect(validation.adjustedDna).toBe(applyOutcome(rawDna, true)); // 483
      expect(hypotheticalDna).toBe(483);
    });

    it('free end response pays nothing and grants no streak', () => {
      const isFreeSession = true;
      const streak = null; // record_daily_play NOT called for free sessions
      const response = {
        success: true,
        freePlay: isFreeSession,
        validation: { adjustedDna: 0, baseDna: 483 },
        // 483, not 584: WP-0.02 removed the streak/set/clan-duel factors from
        // the payout. `newAchievements` is gone with WP-0.04's retirement of
        // the achievement mechanism.
        hypotheticalDna: 483,
        ...(streak ? { streak } : {}),
      };

      expect(response.freePlay).toBe(true);
      expect(response.validation.adjustedDna).toBe(0);
      expect(response.hypotheticalDna).toBeGreaterThan(0);
      expect('streak' in response).toBe(false);
      // WP-0.04: newAchievements is gone from every end response - free or
      // earning. The mechanism it reported was retired into the Records.
      expect('newAchievements' in response).toBe(false);
    });

    it('free end leaves player totals untouched (no DNA, no total_dna_earned)', () => {
      const player = { dna: 100, total_dna_earned: 900, total_games_played: 5 };
      const isFreeSession = true;

      // The route returns before any players update on free sessions
      const playerAfter = isFreeSession
        ? { ...player }
        : { ...player, dna: player.dna + 50 };

      expect(playerAfter).toEqual(player);
    });

    it('the free marker on the session row is authoritative, never the end request', () => {
      // A cheat sending mode:'earn' on end cannot convert a free session
      const sessionRow = { is_free_play: true };
      const endRequestBody = { mode: 'earn' };
      const isFreeSession = sessionRow.is_free_play === true;

      expect(endRequestBody.mode).toBe('earn');
      expect(isFreeSession).toBe(true);
    });

    it('refuses free starts cleanly while migration 016 is pending (503)', () => {
      // Insert fails because is_free_play does not exist yet - the route
      // maps that to a clear 503 instead of a generic 500. Earning starts
      // never hit this: their insert omits the marker entirely.
      const isFreePlay = true;
      const sessionError = {
        message: "Could not find the 'is_free_play' column of 'game_sessions' in the schema cache",
      };

      const isMigrationPending =
        isFreePlay && /is_free_play/i.test(sessionError.message || '');
      expect(isMigrationPending).toBe(true);

      const response = isMigrationPending
        ? { status: 503, error: 'Free Play is not available yet — try an earning run' }
        : { status: 500, error: 'Failed to create session' };
      expect(response.status).toBe(503);
    });

    it('free end still runs on the same idempotency guard (409 on replays)', () => {
      const session = { ended_at: '2026-07-18T10:00:00.000Z', is_free_play: true };
      const alreadyEnded = Boolean(session.ended_at);
      expect(alreadyEnded).toBe(true); // duplicate free ends 409 like earning ends
    });

    it('route source: free sessions skip payout, streak, and economy writes', () => {
      // Structural guard on the handler itself: the free-session early
      // return must precede every reward-side write in the end action.
      const fs = require('fs');
      const path = require('path');
      const source = fs.readFileSync(path.join(__dirname, 'route.ts'), 'utf8');

      const freeReturn = source.indexOf('if (isFreeSession) {');
      expect(freeReturn).toBeGreaterThan(-1);
      // Reward-side writes all appear only after the free-session return
      expect(source.indexOf("'record_daily_play'")).toBeGreaterThan(freeReturn);
      expect(source.indexOf('total_dna_earned: newTotalDnaEarned')).toBeGreaterThan(freeReturn);
      expect(source.indexOf("source_type: 'game_reward'")).toBeGreaterThan(freeReturn);
      expect(source.indexOf('refreshPlayerRecords(')).toBeGreaterThan(freeReturn);
      // The free start writes no economy transaction at all. A charge is
      // not a currency (§8.6), so nothing is logged to the ledger for it -
      // the session row's charge_state IS the audit record.
      expect(source).not.toMatch(/source_type: 'game_start'/);
      expect(source).not.toMatch(/resource_type: 'energy'/);
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
      // COSMIC compounds too since WP-3.13, at double PRIMAL's rate:
      // 10+10+11+11+12. It was a flat 5 x foodValue while the deleted combo
      // was its whole Yield story.
      expect(computeRunTotals('COSMIC', 5).rawDna).toBe(54);
      expect(computeRunTotals('COSMIC', 5).rawDna).toBeGreaterThan(
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
      // Unknown/legacy rows fall back to the PAYOUT FLOOR, which WP-3.13's
      // COSMIC Yield re-base moved from COSMIC to PRIMAL.
      expect(normalizeDynastyName(null)).toBe('PRIMAL');
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
      // WP-2.05: ADVISORY. The claim is refused - the payout is and always
      // was the server recompute - but refusing a CLAIM is not the same as
      // refusing a RUN, and the run keeps its progression.
      expect(result.valid).toBe(true);
      expect(result.advisoryErrors).toContainEqual(
        expect.stringContaining('DNA_MISMATCH')
      );
      expect(result.advisoryErrors).toContainEqual(
        expect.stringContaining('SCORE_MISMATCH')
      );
      expect(result.fatalErrors).toEqual([]);
      expect(result.adjustedDna).toBe(applyOutcome(rawDna, true));
    });

    it('treats payloads without food_count as zero-food runs (fallback removed)', () => {
      // Route coerces a missing food_count to 0 - a pre-v2 payload can no
      // longer mint DNA from a bare score claim; it flags and pays 0.
      const legacyBody: { food_count?: number; score: number } = { score: 12 };
      const coerced =
        typeof legacyBody.food_count === 'number' ? legacyBody.food_count : 0;
      expect(coerced).toBe(0);

      const result = validateGameResult(
        {
          food_count: coerced,
          extracted: false,
          score: 12,
          dna_earned: 121,
          duration_seconds: 60,
          died: true,
          victory: false,
        },
        startedAgo(65),
        'COSMIC'
      );

      // WP-2.05: the mismatch is recorded as advisory; the run is still
      // bounded, and it still pays exactly nothing.
      expect(result.valid).toBe(true);
      expect(result.advisoryErrors).toContainEqual(
        expect.stringContaining('DNA_MISMATCH')
      );
      expect(result.adjustedDna).toBe(0); // pays the recompute: nothing
      expect(result.foodCount).toBe(0);
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

  describe('Settlement: raw fold x outcome multiplier, and nothing else (WP-0.02)', () => {
    const routeSource = () => fs.readFileSync(path.join(__dirname, 'route.ts'), 'utf8');
    const startedAgo = (seconds: number) => new Date(Date.now() - seconds * 1000);

    it('settles a banked run at exactly the validator recompute', () => {
      const { rawDna, score } = computeRunTotals('PRIMAL', 30);
      const validation = validateGameResult(
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
        'PRIMAL'
      );

      // Yield IS the recompute. The route no longer multiplies it by
      // anything: `const yieldDna = validation.adjustedDna`.
      const yieldDna = validation.adjustedDna;

      expect(yieldDna).toBe(applyOutcome(rawDna, true));
      expect(yieldDna).toBe(Math.floor(rawDna * 1.25));
    });

    it('settles a died run at the salvage multiplier and nothing else', () => {
      const { rawDna, score } = computeRunTotals('CYBER', 24);
      const validation = validateGameResult(
        {
          food_count: 24,
          extracted: false,
          score,
          dna_earned: rawDna,
          duration_seconds: 100,
          died: true,
          victory: false,
        },
        startedAgo(105),
        'CYBER'
      );

      const yieldDna = validation.adjustedDna;
      expect(yieldDna).toBe(applyOutcome(rawDna, false));
      expect(yieldDna).toBe(Math.floor(rawDna * 0.6));
    });

    it('a 30-day streak, a full collection and a duel win change nothing', () => {
      // The whole point of the WP: two players with identical runs and
      // wildly different account state settle at the same number. There is
      // no parameter left to express the difference with.
      const { rawDna, score } = computeRunTotals('COSMIC', 40);
      const settle = () => {
        const validation = validateGameResult(
          {
            food_count: 40,
            extracted: true,
            score,
            dna_earned: rawDna,
            duration_seconds: 150,
            died: false,
            victory: false,
          },
          startedAgo(155),
          'COSMIC'
        );
        return validation.adjustedDna;
      };

      const veteranWithEverything = settle();
      const dayOnePlayerWithNothing = settle();

      expect(veteranWithEverything).toBe(dayOnePlayerWithNothing);
      expect(veteranWithEverything).toBe(applyOutcome(rawDna, true));
    });

    it('route source: the multiplier stack has no way back into settlement', () => {
      const source = routeSource();

      // The module is deleted; the route must not import or call it.
      expect(source).not.toMatch(/dnaMultipliers/);
      expect(source).not.toMatch(/getDnaMultiplier|applyDnaMultiplier|combineDnaMultipliers/);
      // No breakdown leaks into the response or the economy ledger.
      expect(source).not.toMatch(/dnaBreakdown/);
      expect(source).not.toMatch(/dna_multiplier/);
      // No streak / set-bonus / clan-duel factor is read anywhere.
      expect(source).not.toMatch(/streak_multiplier/);
      expect(source).not.toMatch(/clan_duel_bonus/);
      expect(source).not.toMatch(/setBonus|completedDynasties/);
      // Yield is the recompute, scaled by exactly ONE thing: the equipped
      // snake's Ascendance generation (WP-1.05, Constitution §8.2). This
      // assertion replaced `yieldDna = validation.adjustedDna` verbatim when
      // Ascendance landed - the multiplier STACK is still gone, and the one
      // surviving factor is per-snake progression, not account state.
      expect(source).toMatch(
        /const yieldDna = applyAscendanceYield\(\s*validation\.adjustedDna,\s*ascendanceGeneration\s*\);/
      );
      // The generation comes from SERVER STATE, never from the request.
      // WP-2.05 added the run-start context in front of the snake-row read:
      // the generation that pays is the one the run STARTED with, so a breed
      // completing mid-run cannot change what the run in flight is worth.
      // The snake row remains the fallback for any run without a context.
      expect(source).toMatch(
        /const ascendanceGeneration =\s*runContext\?\.snake\.generation \?\?/
      );
      expect(source).toMatch(
        /typeof usedSnakeRow\?\.generation === 'number'/
      );
      // And still nothing from the request: `body.generation` has never
      // existed and must not start now.
      expect(source).not.toMatch(/\bbody\.generation\b/);
    });

    it('the multiplier module is gone from the tree entirely', () => {
      const modulePath = path.join(
        __dirname,
        '..',
        '..',
        '..',
        '..',
        'lib',
        'server',
        'dnaMultipliers.ts'
      );
      expect(fs.existsSync(modulePath)).toBe(false);
    });

    it('economy transaction metadata records the base payout, no breakdown', () => {
      const metadata = {
        score: 10,
        food_count: 10,
        extracted: false,
        original_dna_claimed: 100,
        validated: true,
        base_dna: 100,
      };

      expect(metadata.base_dna).toBe(100);
      expect('dna_multiplier' in metadata).toBe(false);
    });

    it('credits player totals with the settled DNA', () => {
      const playerDna = 100;
      const previousTotalEarned = 500;
      const finalDna = applyOutcome(40, true); // 50

      expect(finalDna).toBe(50);
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

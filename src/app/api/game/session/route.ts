/**
 * Game Session API - Start/End game sessions
 * Server authority: Energy deducted server-side, results validated
 */

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { GAME_CONFIG } from '@/shared/config/game';
import { checkRateLimit } from '@/lib/server/rateLimit';
import { validateGameResult } from '@/lib/server/gameValidator';
import { normalizeDynastyName } from '@/shared/game/rulesets';
import { sanitizeTraits, type TraitId } from '@/shared/game/traits';
import {
  MASTERY_UNLOCK_TRACK,
  fullMutationPool,
  levelForXp,
  masteryUnlockLabel,
  masteryXpForRun,
  unlockedMutationPool,
} from '@/shared/game/mastery';
import { getMasteryXp, grantMasteryXp } from '@/lib/server/mastery';
import { calculateNextRegenAfterConsume } from '@/lib/server/energyRegen';
import { checkAchievements, type AchievementDefinition, type PlayerStats } from '@/lib/server/achievementChecker';
import {
  getDnaMultiplier,
  applyDnaMultiplier,
  type DnaMultiplierBreakdown,
} from '@/lib/server/dnaMultipliers';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export async function POST(request: NextRequest) {
  try {
    const authHeader = request.headers.get('authorization');
    if (!authHeader) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const token = authHeader.replace('Bearer ', '');
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);

    if (authError || !user) {
      return NextResponse.json({ error: 'Invalid token' }, { status: 401 });
    }

    const body = await request.json();
    const {
      action,
      mode,
      sessionId,
      snake_id,
      score,
      dna_earned,
      duration_seconds,
      died,
      victory,
      food_count,
      extracted,
      mutations,
      phoenix_triggered_at_food,
      cosmic,
    } = body;

    const { data: player } = await supabase
      .from('players')
      .select('id, energy, dna, max_energy, energy_regen_at')
      .eq('user_id', user.id)
      .single();

    if (!player) {
      return NextResponse.json({ error: 'Player not found' }, { status: 404 });
    }

    // Design v2 §7.4 Free Play: unlimited practice runs - no energy cost on
    // start, no rewards of any kind on end. The session row is still written
    // and validated (server authority unchanged) but marked is_free_play so
    // contracts/leaderboards/economy reads exclude it.
    const isFreePlay = mode === 'free';

    if (action === 'start') {
      const rateCheck = await checkRateLimit(supabase, player.id, 'game_start');
      if (!rateCheck.allowed) {
        return NextResponse.json(
          { error: 'Rate limited', retryAfterMs: rateCheck.retryAfterMs },
          { status: 429 }
        );
      }

      // Free Play bypasses the energy gate - energy meters earning runs only
      if (!isFreePlay && player.energy < GAME_CONFIG.economy.energy.costPerGame) {
        return NextResponse.json({ error: 'Not enough energy' }, { status: 400 });
      }

      if (!snake_id) {
        return NextResponse.json({ error: 'snake_id is required' }, { status: 400 });
      }

      // Load the snake with its variant + dynasty; validate ownership.
      // select('*') on the row itself so the traits column (migration 018)
      // rides along when it exists without erroring pre-018.
      const { data: snake } = await supabase
        .from('collected_snakes')
        .select('*, snake_variants(id, name, dynasties(name))')
        .eq('id', snake_id)
        .eq('player_id', player.id)
        .single();

      if (!snake) {
        const { count } = await supabase
          .from('collected_snakes')
          .select('*', { count: 'exact', head: true })
          .eq('player_id', player.id);

        if (!count) {
          return NextResponse.json(
            { error: 'No snakes in collection. Choose a starter in the Lab.' },
            { status: 400 }
          );
        }
        return NextResponse.json({ error: 'Snake not found or not owned' }, { status: 400 });
      }

      if (!snake.is_equipped) {
        return NextResponse.json({ error: 'Snake is not equipped' }, { status: 400 });
      }

      // Joined variant/dynasty rows (supabase returns object for FK joins)
      const variantJoin = snake.snake_variants as unknown as
        | { id: string; name: string; dynasties: { name: string } | null }
        | null;
      const dynastyName = variantJoin?.dynasties?.name;

      if (!dynastyName) {
        return NextResponse.json({ error: 'Snake variant data is invalid' }, { status: 500 });
      }

      // Server-trusted trait config for the engine (Design v2 Phase 3A):
      // read from the snake ROW - the client never asserts its own traits
      const snakeTraits = sanitizeTraits(
        (snake as Record<string, unknown>).traits
      );

      // Per-dynasty mastery (section 7.1): the offer pool the engine may
      // draw from. Earning runs get the EARNED pool (base ten + this
      // dynasty's M3/M6/M9 unlocks, recomputed from player_mastery -
      // pre-019 this reads as 0 XP => base pool). Free Play gets the
      // entire pool (section 7.4: practice is also a showroom).
      const startDynasty = normalizeDynastyName(dynastyName);
      const masteryXp = await getMasteryXp(supabase, player.id, startDynasty);
      const masteryLevel = levelForXp(masteryXp);
      const mutationPool = isFreePlay
        ? fullMutationPool(startDynasty)
        : unlockedMutationPool(startDynasty, masteryLevel);
      const masteryInfo = {
        dynasty: startDynasty,
        xp: masteryXp,
        level: masteryLevel,
      };

      const serverStartedAt = new Date().toISOString();

      const { data: session, error: sessionError } = await supabase
        .from('game_sessions')
        .insert({
          player_id: player.id,
          snake_used_id: snake.id,
          snake_variant_id: snake.snake_variant_id,
          dynasty: dynastyName,
          server_started_at: serverStartedAt,
          // Free-play marker (migration 016) - only sent when true so the
          // insert stays compatible with the pre-016 schema until it applies
          ...(isFreePlay ? { is_free_play: true } : {}),
        })
        .select()
        .single();

      if (sessionError) {
        console.error('Session creation error:', sessionError);
        // Pre-migration-016 window: the is_free_play column doesn't exist
        // yet - refuse free mode with a clear signal instead of a raw 500.
        // Earning runs are unaffected (the marker is omitted from their
        // insert), so this branch stays deployable before 016 applies.
        if (isFreePlay && /is_free_play/i.test(sessionError.message || '')) {
          return NextResponse.json(
            { error: 'Free Play is not available yet — try an earning run' },
            { status: 503 }
          );
        }
        return NextResponse.json({ error: 'Failed to create session', details: sessionError.message }, { status: 500 });
      }

      // Free Play: no energy deduction, no regen-timer change, no economy
      // transaction - the run costs nothing and pays nothing
      if (isFreePlay) {
        return NextResponse.json({
          sessionId: session.id,
          freePlay: true,
          energy: player.energy,
          energyRegenAt: player.energy_regen_at,
          traits: snakeTraits,
          mutationPool,
          mastery: masteryInfo,
        });
      }

      const newEnergy = player.energy - GAME_CONFIG.economy.energy.costPerGame;
      const maxEnergy = player.max_energy || GAME_CONFIG.economy.energy.maxEnergy;

      // Calculate the regen timer - start or preserve existing future timer
      const newRegenAt = calculateNextRegenAfterConsume(
        newEnergy,
        maxEnergy,
        player.energy_regen_at
      );

      const { error: energyUpdateError } = await supabase
        .from('players')
        .update({
          energy: newEnergy,
          energy_regen_at: newRegenAt,
        })
        .eq('id', player.id);

      if (energyUpdateError) {
        console.error('Failed to deduct energy on game start:', {
          playerId: player.id,
          sessionId: session.id,
          error: energyUpdateError,
        });
        return NextResponse.json({ error: 'Failed to start game' }, { status: 500 });
      }

      const { error: startTxError } = await supabase.from('economy_transactions').insert({
        player_id: player.id,
        resource_type: 'energy',
        amount: -GAME_CONFIG.economy.energy.costPerGame,
        balance_after: newEnergy,
        source_type: 'game_start',
        source_id: session.id,
      });

      if (startTxError) {
        // Audit log only - the energy deduction itself succeeded
        console.error('Failed to log game_start energy transaction:', {
          playerId: player.id,
          sessionId: session.id,
          error: startTxError,
        });
      }

      return NextResponse.json({
        sessionId: session.id,
        energy: newEnergy,
        energyRegenAt: newRegenAt,
        traits: snakeTraits,
        mutationPool,
        mastery: masteryInfo,
      });
    }

    if (action === 'end') {
      if (!sessionId) {
        return NextResponse.json({ error: 'Session ID required' }, { status: 400 });
      }

      // select('*') on purpose: naming is_free_play here would error the
      // whole read during the pre-migration-016 window. With '*' pre-016
      // rows simply lack the field (=> earning path, which they all are).
      const { data: session } = await supabase
        .from('game_sessions')
        .select('*')
        .eq('id', sessionId)
        .eq('player_id', player.id)
        .single();

      if (!session) {
        return NextResponse.json({ error: 'Session not found' }, { status: 404 });
      }

      // Idempotency guard: a session can only be ended once. Duplicate
      // 'end' calls (offline outbox replay, double-fire at death) must not
      // grant DNA again - return 409 with the current authoritative state.
      if (session.ended_at) {
        const { data: currentPlayer } = await supabase
          .from('players')
          .select('dna, energy, energy_regen_at, total_games_played, high_score, total_dna_earned, breeds_completed')
          .eq('id', player.id)
          .single();

        return NextResponse.json(
          {
            error: 'Session already ended',
            alreadyEnded: true,
            player: currentPlayer ?? null,
          },
          { status: 409 }
        );
      }

      // Design v2 Phase 3A: traits are read from the SNAKE ROW referenced
      // by the session (snake_used_id, server-trusted, stored at start) -
      // the client payload never carries them. select('*') keeps the read
      // deployable before migration 018 (rows simply lack the column).
      let snakeTraits: TraitId[] = [];
      if (session.snake_used_id) {
        const { data: usedSnake } = await supabase
          .from('collected_snakes')
          .select('*')
          .eq('id', session.snake_used_id)
          .single();
        snakeTraits = sanitizeTraits(
          (usedSnake as Record<string, unknown> | null)?.traits
        );
      }

      // Free session (the marker on the row is authoritative, never the
      // request): validate + record normally, PAY NOTHING on the way out.
      const isFreeSession = session.is_free_play === true;

      // Per-dynasty mastery (section 7.1): recompute the player's ACTUAL
      // unlocked pool server-side from player_mastery - the client's list
      // (and whatever the engine offered) is never trusted. Free sessions
      // validate against the full pool (section 7.4: everything unlocked
      // in practice). Pre-019 the XP read is 0 => base pool.
      const endDynasty = normalizeDynastyName(session.dynasty);
      const masteryXpBefore = isFreeSession
        ? 0
        : await getMasteryXp(supabase, player.id, endDynasty);
      const unlockedPool = isFreeSession
        ? fullMutationPool(endDynasty)
        : unlockedMutationPool(endDynasty, levelForXp(masteryXpBefore));

      // Design v2: the client sends the raw food count + how the run ended;
      // the server recomputes the payout exactly from the session row's
      // dynasty (server-trusted, stored at start - never from this request).
      // Payloads without food_count validate as zero-food runs (the legacy
      // deploy-window fallback has been removed).
      const serverStartedAt = new Date(session.server_started_at || Date.now());
      const validation = validateGameResult(
        {
          food_count: typeof food_count === 'number' ? food_count : 0,
          extracted: extracted === true,
          score: score || 0,
          dna_earned: dna_earned || 0,
          duration_seconds: duration_seconds || 0,
          died: died ?? !(extracted === true),
          victory: victory ?? false,
          // Design v2 Phase 2: mutation picks + Phoenix trigger + the
          // COSMIC combo summary - all sanitized inside the validator
          mutations,
          phoenix_triggered_at_food,
          cosmic,
        },
        serverStartedAt,
        endDynasty,
        snakeTraits,
        unlockedPool
      );

      if (!validation.valid) {
        console.warn('Game result validation flags:', {
          playerId: player.id,
          sessionId,
          dynasty: session.dynasty,
          errors: validation.errors,
        });
      }

      // DNA multiplier stack: streak tier x set bonus x clan duel.
      // (Design v2: the dynasty passive is gone - the ruleset already
      // shaped the base payout.) Non-fatal: failures fall back to x1.
      // Free sessions still compute it - it prices the hypothetical payout.
      let dnaMultiplier = 1;
      let dnaBreakdown: DnaMultiplierBreakdown | null = null;
      try {
        const multiplierResult = await getDnaMultiplier(supabase, player.id);
        dnaMultiplier = multiplierResult.multiplier;
        dnaBreakdown = multiplierResult.breakdown;
      } catch (multiplierError) {
        console.error('DNA multiplier error:', multiplierError);
      }

      const finalDna = applyDnaMultiplier(validation.adjustedDna, dnaMultiplier);

      // Sanitized mutation record for the session row (migration 014).
      // One JSONB blob: picks in order + Phoenix trigger + accepted COSMIC
      // combo claim; null for mutation-free non-COSMIC runs.
      const mutationsRecord =
        validation.mutations.length > 0 ||
        validation.phoenixTriggeredAtFood !== null ||
        validation.cosmic !== null
          ? {
              picks: validation.mutations,
              phoenixTriggeredAtFood: validation.phoenixTriggeredAtFood,
              cosmic: validation.cosmic,
            }
          : null;

      // Mark the session ended BEFORE granting rewards - this is the
      // idempotency anchor. Guard on ended_at IS NULL so two concurrent
      // 'end' calls can't both pass the check above and double-grant.
      const { data: endedRows, error: endSessionError } = await supabase
        .from('game_sessions')
        .update({
          score: validation.adjustedScore,
          // Free sessions never earn - the row records a zero payout
          dna_earned: isFreeSession ? 0 : finalDna,
          duration_seconds: duration_seconds || 0,
          died: died ?? true,
          victory: victory ?? false,
          extracted: validation.extracted,
          ended_at: new Date().toISOString(),
          validated: validation.valid,
          validation_errors: validation.errors.length > 0 ? validation.errors : null,
          foods_collected: validation.foodCount,
          mutations: mutationsRecord,
        })
        .eq('id', sessionId)
        .eq('player_id', player.id)
        .is('ended_at', null)
        .select('id');

      if (endSessionError) {
        console.error('Failed to mark game session ended:', {
          playerId: player.id,
          sessionId,
          error: endSessionError,
        });
        return NextResponse.json({ error: 'Failed to end session' }, { status: 500 });
      }

      if (!endedRows || endedRows.length === 0) {
        // Lost the race: another request ended this session first
        return NextResponse.json(
          { error: 'Session already ended', alreadyEnded: true },
          { status: 409 }
        );
      }

      // Free Play end: the run is recorded + validated above, but nothing
      // pays out - no DNA credit, no total_dna_earned, no streak
      // (record_daily_play NOT called), no achievements, no economy
      // transactions. The response carries what the run WOULD have earned
      // so the player sees the stakes they practiced for.
      if (isFreeSession) {
        const { data: freePlayerState } = await supabase
          .from('players')
          .select('dna, energy, energy_regen_at, total_games_played, high_score, total_dna_earned, breeds_completed')
          .eq('id', player.id)
          .single();

        return NextResponse.json({
          success: true,
          freePlay: true,
          player: freePlayerState,
          validation: {
            valid: validation.valid,
            adjustedDna: 0,
            baseDna: validation.adjustedDna,
            score: validation.adjustedScore,
            extracted: validation.extracted,
          },
          hypotheticalDna: finalDna,
          newAchievements: [],
          ...(dnaBreakdown ? { dnaMultiplier: dnaBreakdown } : {}),
        });
      }

      const newDna = player.dna + finalDna;
      const { data: currentPlayer } = await supabase
        .from('players')
        .select('total_games_played, high_score, total_dna_earned')
        .eq('id', player.id)
        .single();

      const newHighScore = Math.max(currentPlayer?.high_score || 0, validation.adjustedScore);
      const gamesPlayedCount = (currentPlayer?.total_games_played || 0) + 1;
      const newTotalDnaEarned = (currentPlayer?.total_dna_earned || 0) + finalDna;

      const { error: rewardUpdateError } = await supabase
        .from('players')
        .update({
          dna: newDna,
          total_games_played: gamesPlayedCount,
          total_dna_earned: newTotalDnaEarned,
          high_score: newHighScore,
        })
        .eq('id', player.id);

      if (rewardUpdateError) {
        // Primary state write failed - the player would silently lose the
        // run's DNA. Re-open the session (best effort) so a client replay
        // can retry, then fail the request.
        console.error('Failed to grant game rewards:', {
          playerId: player.id,
          sessionId,
          dna: finalDna,
          error: rewardUpdateError,
        });
        const { error: reopenError } = await supabase
          .from('game_sessions')
          .update({ ended_at: null })
          .eq('id', sessionId)
          .eq('player_id', player.id);
        if (reopenError) {
          console.error('Failed to re-open session after reward failure:', {
            sessionId,
            error: reopenError,
          });
        }
        return NextResponse.json({ error: 'Failed to grant rewards' }, { status: 500 });
      }

      if (finalDna > 0) {
        const { error: rewardTxError } = await supabase.from('economy_transactions').insert({
          player_id: player.id,
          resource_type: 'dna',
          amount: finalDna,
          balance_after: newDna,
          source_type: 'game_reward',
          source_id: sessionId,
          metadata: {
            score: validation.adjustedScore,
            food_count: validation.foodCount,
            extracted: validation.extracted,
            original_dna_claimed: dna_earned || 0,
            validated: validation.valid,
            base_dna: validation.adjustedDna,
            ...(validation.mutations.length > 0
              ? { mutations: validation.mutations }
              : {}),
            ...(validation.phoenixTriggeredAtFood !== null
              ? { phoenix_triggered_at_food: validation.phoenixTriggeredAtFood }
              : {}),
            ...(validation.cosmic ? { cosmic: validation.cosmic } : {}),
            ...(dnaBreakdown ? { dna_multiplier: dnaBreakdown } : {}),
          },
        });

        if (rewardTxError) {
          // Audit log only - rewards were already granted above
          console.error('Failed to log game_reward DNA transaction:', {
            playerId: player.id,
            sessionId,
            dna: finalDna,
            error: rewardTxError,
          });
        }
      }

      const { data: updatedPlayer } = await supabase
        .from('players')
        .select('dna, energy, energy_regen_at, total_games_played, high_score, total_dna_earned, breeds_completed')
        .eq('id', player.id)
        .single();

      // Per-dynasty mastery XP (section 7.1): EXTRACTED earning runs only
      // (free sessions returned above; deaths grant nothing). The XP is
      // floor(raw x 1.25) - the banked payout BEFORE Mirror Wager /
      // Compound Interest outcome shaping and BEFORE the account
      // multiplier stack, so streaks never inflate mastery. Non-fatal:
      // pre-019 (missing table/RPC) or any grant failure just omits the
      // mastery block from the response.
      let mastery: {
        dynasty: string;
        xpGained: number;
        xp: number;
        level: number;
        leveledUp: boolean;
        unlocks: { level: number; kind: string; label: string }[];
      } | null = null;
      if (validation.extracted) {
        const xpGained = masteryXpForRun(validation.rawDna, true);
        if (xpGained > 0) {
          const granted = await grantMasteryXp(
            supabase,
            player.id,
            endDynasty,
            xpGained
          );
          if (granted) {
            const levelBefore = levelForXp(masteryXpBefore);
            const levelAfter = levelForXp(granted.xpAfter);
            const unlocks: { level: number; kind: string; label: string }[] = [];
            for (let lvl = levelBefore + 1; lvl <= levelAfter; lvl++) {
              unlocks.push({
                level: lvl,
                kind: MASTERY_UNLOCK_TRACK[lvl - 1].kind,
                label: masteryUnlockLabel(endDynasty, lvl),
              });
            }
            mastery = {
              dynasty: endDynasty,
              xpGained,
              xp: granted.xpAfter,
              level: levelAfter,
              leveledUp: levelAfter > levelBefore,
              unlocks,
            };
          }
        }
      }

      // Record daily play streak (non-fatal if it errors)
      let streak: {
        current: number;
        longest: number;
        multiplier: number;
        graceConsumed: boolean;
      } | null = null;
      try {
        const { data: streakRows, error: streakRpcError } = await supabase.rpc(
          'record_daily_play',
          { p_player_id: player.id }
        );

        if (streakRpcError) {
          console.error('record_daily_play error:', streakRpcError);
        } else {
          const row = Array.isArray(streakRows) ? streakRows[0] : streakRows;
          if (row) {
            streak = {
              current: row.current_streak,
              longest: row.longest_streak,
              multiplier: Number(row.streak_multiplier),
              graceConsumed: row.grace_consumed,
            };
          }
        }
      } catch (streakError) {
        console.error('record_daily_play error:', streakError);
      }

      // Check for newly completed achievements
      let newAchievements: string[] = [];
      try {
        // Get collection count for achievement checking
        const { count: collectionCount } = await supabase
          .from('collected_snakes')
          .select('*', { count: 'exact', head: true })
          .eq('player_id', player.id);

        // Get streak info (prefer the freshly recorded streak)
        let currentStreak = streak?.current ?? 0;
        if (!streak) {
          const { data: streakData } = await supabase
            .from('player_streaks')
            .select('current_streak')
            .eq('player_id', player.id)
            .single();
          currentStreak = streakData?.current_streak || 0;
        }

        // Build player stats for achievement checking
        const playerStats: PlayerStats = {
          total_games_played: updatedPlayer?.total_games_played || 0,
          total_dna_earned: updatedPlayer?.total_dna_earned || 0,
          high_score: updatedPlayer?.high_score || 0,
          breeds_completed: updatedPlayer?.breeds_completed || 0,
          collection_count: collectionCount || 0,
          current_streak: currentStreak,
        };

        // Get achievement definitions
        const { data: achievements } = await supabase
          .from('achievement_definitions')
          .select('*');

        // Get existing progress
        const { data: progress } = await supabase
          .from('player_achievements')
          .select('achievement_id, progress, completed')
          .eq('player_id', player.id);

        const existingProgress = new Map(
          (progress || []).map(p => [p.achievement_id, { progress: p.progress, completed: p.completed }])
        );

        // Check achievements
        const result = checkAchievements(
          playerStats,
          (achievements || []) as AchievementDefinition[],
          existingProgress
        );

        // Update progress and mark newly completed
        const progressEntries = Array.from(result.progressUpdates.entries());
        for (const [achievementId, progressValue] of progressEntries) {
          const isNewlyCompleted = result.newlyCompleted.some(a => a.id === achievementId);

          const { error: achievementUpsertError } = await supabase
            .from('player_achievements')
            .upsert({
              player_id: player.id,
              achievement_id: achievementId,
              progress: progressValue,
              completed: isNewlyCompleted || existingProgress.get(achievementId)?.completed || false,
              completed_at: isNewlyCompleted ? new Date().toISOString() : undefined,
            }, { onConflict: 'player_id,achievement_id' });

          if (achievementUpsertError) {
            console.error('Failed to upsert achievement progress:', {
              playerId: player.id,
              achievementId,
              error: achievementUpsertError,
            });
          }
        }

        newAchievements = result.newlyCompleted.map(a => a.name);
      } catch (achievementError) {
        console.error('Achievement check error:', achievementError);
        // Don't fail the request if achievement checking fails
      }

      return NextResponse.json({
        success: true,
        player: updatedPlayer,
        validation: {
          valid: validation.valid,
          adjustedDna: finalDna,
          baseDna: validation.adjustedDna,
          score: validation.adjustedScore,
          extracted: validation.extracted,
        },
        newAchievements,
        ...(dnaBreakdown ? { dnaMultiplier: dnaBreakdown } : {}),
        ...(streak ? { streak } : {}),
        ...(mastery ? { mastery } : {}),
      });
    }

    return NextResponse.json({ error: 'Invalid action' }, { status: 400 });
  } catch (err) {
    console.error('Game session API error:', err);
    return NextResponse.json({ error: 'Server error', details: err instanceof Error ? err.message : String(err) }, { status: 500 });
  }
}

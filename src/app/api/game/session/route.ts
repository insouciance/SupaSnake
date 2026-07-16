/**
 * Game Session API - Start/End game sessions
 * Server authority: Energy deducted server-side, results validated
 */

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { GAME_CONFIG } from '@/shared/config/game';
import { checkRateLimit } from '@/lib/server/rateLimit';
import { validateGameResult } from '@/lib/server/gameValidator';
import { calculateNextRegenAfterConsume } from '@/lib/server/energyRegen';
import { checkAchievements, type AchievementDefinition, type PlayerStats } from '@/lib/server/achievementChecker';

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
    const { action, sessionId, snake_id, score, dna_earned, duration_seconds, died, victory } = body;

    const { data: player } = await supabase
      .from('players')
      .select('id, energy, dna, max_energy, energy_regen_at')
      .eq('user_id', user.id)
      .single();

    if (!player) {
      return NextResponse.json({ error: 'Player not found' }, { status: 404 });
    }

    if (action === 'start') {
      const rateCheck = await checkRateLimit(supabase, player.id, 'game_start');
      if (!rateCheck.allowed) {
        return NextResponse.json(
          { error: 'Rate limited', retryAfterMs: rateCheck.retryAfterMs },
          { status: 429 }
        );
      }

      if (player.energy < GAME_CONFIG.economy.energy.costPerGame) {
        return NextResponse.json({ error: 'Not enough energy' }, { status: 400 });
      }

      if (!snake_id) {
        return NextResponse.json({ error: 'snake_id is required' }, { status: 400 });
      }

      // Load the snake with its variant + dynasty; validate ownership
      const { data: snake } = await supabase
        .from('collected_snakes')
        .select('id, player_id, is_equipped, snake_variant_id, snake_variants(id, name, dynasties(name))')
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

      const serverStartedAt = new Date().toISOString();

      const { data: session, error: sessionError } = await supabase
        .from('game_sessions')
        .insert({
          player_id: player.id,
          snake_used_id: snake.id,
          snake_variant_id: snake.snake_variant_id,
          dynasty: dynastyName,
          server_started_at: serverStartedAt,
        })
        .select()
        .single();

      if (sessionError) {
        console.error('Session creation error:', sessionError);
        return NextResponse.json({ error: 'Failed to create session', details: sessionError.message }, { status: 500 });
      }

      const newEnergy = player.energy - GAME_CONFIG.economy.energy.costPerGame;
      const maxEnergy = player.max_energy || GAME_CONFIG.economy.energy.maxEnergy;

      // Calculate the regen timer - start or preserve existing future timer
      const newRegenAt = calculateNextRegenAfterConsume(
        newEnergy,
        maxEnergy,
        player.energy_regen_at
      );

      await supabase
        .from('players')
        .update({
          energy: newEnergy,
          energy_regen_at: newRegenAt,
        })
        .eq('id', player.id);

      await supabase.from('economy_transactions').insert({
        player_id: player.id,
        resource_type: 'energy',
        amount: -GAME_CONFIG.economy.energy.costPerGame,
        balance_after: newEnergy,
        source_type: 'game_start',
        source_id: session.id,
      });

      return NextResponse.json({
        sessionId: session.id,
        energy: newEnergy,
        energyRegenAt: newRegenAt,
      });
    }

    if (action === 'end') {
      if (!sessionId) {
        return NextResponse.json({ error: 'Session ID required' }, { status: 400 });
      }

      const { data: session } = await supabase
        .from('game_sessions')
        .select('server_started_at')
        .eq('id', sessionId)
        .eq('player_id', player.id)
        .single();

      if (!session) {
        return NextResponse.json({ error: 'Session not found' }, { status: 404 });
      }

      const validation = validateGameResult(
        {
          score: score || 0,
          dna_earned: dna_earned || 0,
          duration_seconds: duration_seconds || 0,
          died: died ?? true,
          victory: victory ?? false,
        },
        new Date(session.server_started_at || Date.now())
      );

      await supabase
        .from('game_sessions')
        .update({
          score: score || 0,
          dna_earned: validation.adjustedDna,
          duration_seconds: duration_seconds || 0,
          died: died ?? true,
          victory: victory ?? false,
          ended_at: new Date().toISOString(),
          validated: validation.valid,
          validation_errors: validation.errors.length > 0 ? validation.errors : null,
          foods_collected: score || 0,
        })
        .eq('id', sessionId)
        .eq('player_id', player.id);

      const newDna = player.dna + validation.adjustedDna;
      const { data: currentPlayer } = await supabase
        .from('players')
        .select('total_games_played, high_score, total_dna_earned')
        .eq('id', player.id)
        .single();

      const newHighScore = Math.max(currentPlayer?.high_score || 0, score || 0);
      const gamesPlayedCount = (currentPlayer?.total_games_played || 0) + 1;
      const newTotalDnaEarned = (currentPlayer?.total_dna_earned || 0) + validation.adjustedDna;

      await supabase
        .from('players')
        .update({
          dna: newDna,
          total_games_played: gamesPlayedCount,
          total_dna_earned: newTotalDnaEarned,
          high_score: newHighScore,
        })
        .eq('id', player.id);

      if (validation.adjustedDna > 0) {
        await supabase.from('economy_transactions').insert({
          player_id: player.id,
          resource_type: 'dna',
          amount: validation.adjustedDna,
          balance_after: newDna,
          source_type: 'game_reward',
          source_id: sessionId,
          metadata: {
            score: score || 0,
            original_dna_claimed: dna_earned || 0,
            validated: validation.valid,
          },
        });
      }

      const { data: updatedPlayer } = await supabase
        .from('players')
        .select('dna, energy, energy_regen_at, total_games_played, high_score, total_dna_earned, breeds_completed')
        .eq('id', player.id)
        .single();

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

          await supabase
            .from('player_achievements')
            .upsert({
              player_id: player.id,
              achievement_id: achievementId,
              progress: progressValue,
              completed: isNewlyCompleted || existingProgress.get(achievementId)?.completed || false,
              completed_at: isNewlyCompleted ? new Date().toISOString() : undefined,
            }, { onConflict: 'player_id,achievement_id' });
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
          adjustedDna: validation.adjustedDna,
        },
        newAchievements,
        ...(streak ? { streak } : {}),
      });
    }

    return NextResponse.json({ error: 'Invalid action' }, { status: 400 });
  } catch (err) {
    console.error('Game session API error:', err);
    return NextResponse.json({ error: 'Server error', details: err instanceof Error ? err.message : String(err) }, { status: 500 });
  }
}

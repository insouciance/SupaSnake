/**
 * Player Stats API
 * Fetches career statistics for the profile page
 */

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export interface CareerStats {
  highScore: number;
  totalGamesPlayed: number;
  totalDnaEarned: number;
  breedsCompleted: number;
  collectionCount: number;
  totalVariants: number;
  currentStreak: number;
  longestStreak: number;
  achievementsCompleted: number;
  totalAchievements: number;
}

export async function GET(request: NextRequest) {
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

    const { data: player, error: playerError } = await supabase
      .from('players')
      .select('id')
      .eq('user_id', user.id)
      .single();

    if (playerError || !player) {
      return NextResponse.json({ error: 'Player not found' }, { status: 404 });
    }

    // Fetch high score from game_sessions
    const { data: highScoreData } = await supabase
      .from('game_sessions')
      .select('score')
      .eq('player_id', player.id)
      .order('score', { ascending: false })
      .limit(1)
      .single();

    // Count total games played
    const { count: gamesCount } = await supabase
      .from('game_sessions')
      .select('*', { count: 'exact', head: true })
      .eq('player_id', player.id);

    // Sum total DNA earned from economy_transactions
    const { data: dnaData } = await supabase
      .from('economy_transactions')
      .select('amount')
      .eq('player_id', player.id)
      .eq('currency_type', 'dna')
      .gt('amount', 0);

    const totalDnaEarned = dnaData?.reduce((sum, t) => sum + t.amount, 0) || 0;

    // Count breeds completed
    const { count: breedsCount } = await supabase
      .from('collected_snakes')
      .select('*', { count: 'exact', head: true })
      .eq('player_id', player.id)
      .gt('generation', 1);

    // Count collection size
    const { count: collectionCount } = await supabase
      .from('collected_snakes')
      .select('*', { count: 'exact', head: true })
      .eq('player_id', player.id);

    // Count total possible variants
    const { count: totalVariants } = await supabase
      .from('snake_variants')
      .select('*', { count: 'exact', head: true });

    // Get streak info
    const { data: streakData } = await supabase
      .from('player_streaks')
      .select('current_streak, longest_streak')
      .eq('player_id', player.id)
      .single();

    // Count achievements
    const { count: achievementsCompleted } = await supabase
      .from('player_achievements')
      .select('*', { count: 'exact', head: true })
      .eq('player_id', player.id)
      .eq('completed', true);

    const { count: totalAchievements } = await supabase
      .from('achievement_definitions')
      .select('*', { count: 'exact', head: true });

    const stats: CareerStats = {
      highScore: highScoreData?.score || 0,
      totalGamesPlayed: gamesCount || 0,
      totalDnaEarned,
      breedsCompleted: breedsCount || 0,
      collectionCount: collectionCount || 0,
      totalVariants: totalVariants || 30,
      currentStreak: streakData?.current_streak || 0,
      longestStreak: streakData?.longest_streak || 0,
      achievementsCompleted: achievementsCompleted || 0,
      totalAchievements: totalAchievements || 18,
    };

    return NextResponse.json(stats);
  } catch (err) {
    console.error('Stats API error:', err);
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}

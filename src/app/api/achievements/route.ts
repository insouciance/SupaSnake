/**
 * Achievements API
 *
 * GET: List all achievements with player progress
 * POST: Claim completed achievement rewards
 */

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

/**
 * GET /api/achievements
 * Returns all achievements with player's progress
 */
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

    // Get player
    const { data: player } = await supabase
      .from('players')
      .select('id')
      .eq('user_id', user.id)
      .single();

    if (!player) {
      return NextResponse.json({ error: 'Player not found' }, { status: 404 });
    }

    // Get all achievement definitions
    const { data: definitions, error: defError } = await supabase
      .from('achievement_definitions')
      .select('*')
      .order('sort_order', { ascending: true });

    if (defError) {
      return NextResponse.json({ error: 'Failed to fetch achievements' }, { status: 500 });
    }

    // Get player's progress
    const { data: progress } = await supabase
      .from('player_achievements')
      .select('achievement_id, progress, completed, completed_at, reward_claimed, reward_claimed_at')
      .eq('player_id', player.id);

    // Merge definitions with progress
    const progressMap = new Map(
      (progress || []).map(p => [p.achievement_id, p])
    );

    const achievements = (definitions || []).map(def => ({
      ...def,
      progress: progressMap.get(def.id)?.progress || 0,
      completed: progressMap.get(def.id)?.completed || false,
      completed_at: progressMap.get(def.id)?.completed_at || null,
      reward_claimed: progressMap.get(def.id)?.reward_claimed || false,
      reward_claimed_at: progressMap.get(def.id)?.reward_claimed_at || null,
    }));

    // Group by category
    const byCategory = achievements.reduce((acc, a) => {
      if (!acc[a.category]) acc[a.category] = [];
      acc[a.category].push(a);
      return acc;
    }, {} as Record<string, typeof achievements>);

    // Stats
    const totalCompleted = achievements.filter(a => a.completed).length;
    const totalUnclaimed = achievements.filter(a => a.completed && !a.reward_claimed).length;

    return NextResponse.json({
      achievements,
      byCategory,
      stats: {
        total: achievements.length,
        completed: totalCompleted,
        unclaimed: totalUnclaimed,
      },
    });
  } catch (err) {
    console.error('Achievements GET error:', err);
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}

/**
 * POST /api/achievements
 * Actions: claim (claim completed achievement rewards)
 */
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
    const { action, achievement_id } = body;

    if (action !== 'claim') {
      return NextResponse.json({ error: 'Invalid action' }, { status: 400 });
    }

    if (!achievement_id) {
      return NextResponse.json({ error: 'Achievement ID required' }, { status: 400 });
    }

    // Get player
    const { data: player } = await supabase
      .from('players')
      .select('id, dna, energy, max_energy')
      .eq('user_id', user.id)
      .single();

    if (!player) {
      return NextResponse.json({ error: 'Player not found' }, { status: 404 });
    }

    // Get player's achievement progress
    const { data: progress } = await supabase
      .from('player_achievements')
      .select('*')
      .eq('player_id', player.id)
      .eq('achievement_id', achievement_id)
      .single();

    if (!progress) {
      return NextResponse.json({ error: 'Achievement progress not found' }, { status: 404 });
    }

    if (!progress.completed) {
      return NextResponse.json({ error: 'Achievement not completed' }, { status: 400 });
    }

    if (progress.reward_claimed) {
      return NextResponse.json({ error: 'Reward already claimed' }, { status: 400 });
    }

    // Get achievement definition for rewards
    const { data: achievement } = await supabase
      .from('achievement_definitions')
      .select('*')
      .eq('id', achievement_id)
      .single();

    if (!achievement) {
      return NextResponse.json({ error: 'Achievement not found' }, { status: 404 });
    }

    // Mark as claimed
    await supabase
      .from('player_achievements')
      .update({
        reward_claimed: true,
        reward_claimed_at: new Date().toISOString(),
      })
      .eq('player_id', player.id)
      .eq('achievement_id', achievement_id);

    // Apply rewards
    const newDna = player.dna + achievement.reward_dna;
    const newEnergy = Math.min(
      player.energy + achievement.reward_energy,
      player.max_energy || 5
    );

    await supabase
      .from('players')
      .update({ dna: newDna, energy: newEnergy })
      .eq('id', player.id);

    // Log transaction
    if (achievement.reward_dna > 0) {
      await supabase.from('economy_transactions').insert({
        player_id: player.id,
        resource_type: 'dna',
        amount: achievement.reward_dna,
        balance_after: newDna,
        source_type: 'achievement_reward',
        metadata: {
          achievement_id,
          achievement_name: achievement.name,
          tier: achievement.tier,
        },
      });
    }

    return NextResponse.json({
      success: true,
      rewards: {
        dna: achievement.reward_dna,
        energy: achievement.reward_energy,
      },
      newBalances: {
        dna: newDna,
        energy: newEnergy,
      },
    });
  } catch (err) {
    console.error('Achievements POST error:', err);
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}

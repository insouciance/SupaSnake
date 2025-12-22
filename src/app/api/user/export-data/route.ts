/**
 * GDPR Data Export API
 * Allows users to export all their personal data
 * Complies with GDPR Article 20 (Right to Data Portability)
 */

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export async function GET(request: NextRequest) {
  try {
    // Verify authentication
    const authHeader = request.headers.get('authorization');
    if (!authHeader) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }

    const token = authHeader.replace('Bearer ', '');
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);

    if (authError || !user) {
      return NextResponse.json(
        { error: 'Invalid token' },
        { status: 401 }
      );
    }

    // Fetch all user data from various tables
    const [
      playerResult,
      snakesResult,
      sessionsResult,
      purchasesResult,
      achievementsResult,
    ] = await Promise.all([
      supabase
        .from('players')
        .select('*')
        .eq('user_id', user.id)
        .single(),
      supabase
        .from('collected_snakes')
        .select('*')
        .eq('player_id', user.id),
      supabase
        .from('game_sessions')
        .select('id, score, dna_earned, duration_seconds, started_at, ended_at, victory')
        .eq('player_id', user.id)
        .order('started_at', { ascending: false })
        .limit(100),
      supabase
        .from('purchase_history')
        .select('id, product_id, amount_paid, currency, purchased_at')
        .eq('user_id', user.id)
        .order('purchased_at', { ascending: false }),
      supabase
        .from('player_achievements')
        .select('achievement_id, unlocked_at, progress')
        .eq('player_id', user.id),
    ]);

    // Build export object
    const exportData = {
      version: '1.0',
      exportedAt: new Date().toISOString(),
      dataCategories: [
        'account',
        'gameplay',
        'collection',
        'purchases',
        'achievements',
      ],

      account: {
        email: user.email,
        createdAt: user.created_at,
        lastSignIn: user.last_sign_in_at,
      },

      player: playerResult.data ? {
        username: playerResult.data.username,
        dna: playerResult.data.dna,
        energy: playerResult.data.energy,
        maxEnergy: playerResult.data.max_energy,
        totalGamesPlayed: playerResult.data.total_games_played,
        totalDnaEarned: playerResult.data.total_dna_earned,
        highScore: playerResult.data.high_score,
        createdAt: playerResult.data.created_at,
      } : null,

      collection: {
        snakes: snakesResult.data?.map(snake => ({
          variantId: snake.variant_id,
          generation: snake.generation,
          acquiredAt: snake.acquired_at,
        })) || [],
      },

      gameplay: {
        recentSessions: sessionsResult.data?.map(session => ({
          score: session.score,
          dnaEarned: session.dna_earned,
          duration: session.duration_seconds,
          startedAt: session.started_at,
          endedAt: session.ended_at,
          victory: session.victory,
        })) || [],
      },

      purchases: purchasesResult.data?.map(purchase => ({
        productId: purchase.product_id,
        amount: purchase.amount_paid,
        currency: purchase.currency,
        purchasedAt: purchase.purchased_at,
      })) || [],

      achievements: achievementsResult.data?.map(achievement => ({
        achievementId: achievement.achievement_id,
        unlockedAt: achievement.unlocked_at,
        progress: achievement.progress,
      })) || [],

      dataRetention: {
        policy: 'Data is retained until account deletion',
        deletionContact: 'privacy@ogsnake.com',
      },
    };

    // Set headers for file download
    const headers = new Headers();
    headers.set('Content-Type', 'application/json');
    headers.set('Content-Disposition', `attachment; filename="ogsnake-data-export-${new Date().toISOString().split('T')[0]}.json"`);

    return new NextResponse(JSON.stringify(exportData, null, 2), {
      status: 200,
      headers,
    });
  } catch (err) {
    console.error('Data export error:', err);
    return NextResponse.json(
      { error: 'Export failed' },
      { status: 500 }
    );
  }
}

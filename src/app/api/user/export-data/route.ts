/**
 * GDPR Data Export API
 * Allows users to export all their personal data
 * Complies with GDPR Article 20 (Right to Data Portability)
 */

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { LEGAL_CONTACT } from '@/shared/config/legal';

type JsonRecord = Record<string, unknown>;

function asRecord(value: unknown): JsonRecord | null {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return null;
  }
  return value as JsonRecord;
}

function relationRecord(value: unknown): JsonRecord | null {
  if (Array.isArray(value)) return asRecord(value[0]);
  return asRecord(value);
}

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

    const token = authHeader.replace(/^Bearer\s+/i, '');
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        auth: { persistSession: false, autoRefreshToken: false },
        global: { headers: { Authorization: `Bearer ${token}` } },
      }
    );
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);

    if (authError || !user) {
      return NextResponse.json(
        { error: 'Invalid token' },
        { status: 401 }
      );
    }

    // Resolve the internal player id first. Every gameplay table references
    // players.id, not auth.users.id. This client carries the user's bearer
    // token, so RLS remains a second boundary in addition to these filters.
    const { data: player, error: playerError } = await supabase
      .from('players')
      .select(
        'id, username, dna, energy, max_energy, total_games_played, total_dna_earned, high_score, breeds_completed, created_at'
      )
      .eq('user_id', user.id)
      .single();

    if (playerError || !player) {
      if (playerError?.code !== 'PGRST116') {
        console.error('GDPR export player lookup failed:', playerError);
      }
      return NextResponse.json(
        { error: playerError?.code === 'PGRST116' ? 'Player not found' : 'Export failed' },
        { status: playerError?.code === 'PGRST116' ? 404 : 500 }
      );
    }

    const [
      snakesResult,
      sessionsResult,
      purchasesResult,
      achievementsResult,
    ] = await Promise.all([
      supabase
        .from('collected_snakes')
        .select(
          `id, snake_variant_id, generation, parent1_id, parent2_id,
           acquired_at, acquired_method, is_equipped, is_favorited, traits, lineage,
           snake_variants(name, rarity, dynasties(name))`
        )
        .eq('player_id', player.id)
        .order('acquired_at', { ascending: false }),
      supabase
        .from('game_sessions')
        .select(
          'id, score, dna_earned, duration_seconds, foods_collected, died, victory, extracted, validated, started_at, ended_at, genome'
        )
        .eq('player_id', player.id)
        .order('started_at', { ascending: false })
        .limit(100),
      supabase
        .from('purchase_history')
        .select(
          'id, product_id, product_name, price_cents, currency, status, purchased_at, refunded_at'
        )
        .eq('player_id', player.id)
        .order('purchased_at', { ascending: false }),
      // WP-0.04: player_achievements is a frozen ledger now (migration
      // 042) - the mechanism is retired but the rows are retained
      // permanently, so portability and erasure still reach them.
      // `unlocked_at` was selected here and has never existed on this
      // table (003:108-121), so this query errored and, because a failed
      // category 500s the whole request, the ENTIRE data export was
      // broken. The earned timestamp is `completed_at`.
      supabase
        .from('player_achievements')
        .select('achievement_id, completed, completed_at, progress')
        .eq('player_id', player.id),
    ]);

    const failedQuery = [
      ['collection', snakesResult.error],
      ['gameplay', sessionsResult.error],
      ['purchases', purchasesResult.error],
      ['achievements', achievementsResult.error],
    ].find((entry) => entry[1]);

    if (failedQuery) {
      console.error('GDPR export category query failed:', {
        category: failedQuery[0],
        error: failedQuery[1],
      });
      return NextResponse.json({ error: 'Export failed' }, { status: 500 });
    }

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

      player: {
        username: player.username,
        dna: player.dna,
        energy: player.energy,
        maxEnergy: player.max_energy,
        totalGamesPlayed: player.total_games_played,
        totalDnaEarned: player.total_dna_earned,
        highScore: player.high_score,
        breedsCompleted: player.breeds_completed,
        createdAt: player.created_at,
      },

      collection: {
        snakes: snakesResult.data?.map((snake) => {
          const variant = relationRecord(snake.snake_variants);
          const dynasty = relationRecord(variant?.dynasties);
          return {
            id: snake.id,
            snakeVariantId: snake.snake_variant_id,
            variantName: variant?.name ?? null,
            rarity: variant?.rarity ?? null,
            dynasty: dynasty?.name ?? null,
            generation: snake.generation,
            parent1Id: snake.parent1_id,
            parent2Id: snake.parent2_id,
            acquiredMethod: snake.acquired_method,
            acquiredAt: snake.acquired_at,
            isEquipped: snake.is_equipped,
            isFavorited: snake.is_favorited,
            traits: snake.traits,
            lineage: snake.lineage,
          };
        }) || [],
      },

      gameplay: {
        recentSessions: sessionsResult.data?.map(session => ({
          score: session.score,
          dnaEarned: session.dna_earned,
          duration: session.duration_seconds,
          foodsCollected: session.foods_collected,
          died: session.died,
          extracted: session.extracted,
          validated: session.validated,
          startedAt: session.started_at,
          endedAt: session.ended_at,
          victory: session.victory,
          genome: session.genome,
        })) || [],
      },

      purchases: purchasesResult.data?.map(purchase => ({
        productId: purchase.product_id,
        productName: purchase.product_name,
        priceCents: purchase.price_cents,
        currency: purchase.currency,
        status: purchase.status,
        purchasedAt: purchase.purchased_at,
        refundedAt: purchase.refunded_at,
      })) || [],

      achievements: achievementsResult.data?.map(achievement => ({
        achievementId: achievement.achievement_id,
        completed: achievement.completed,
        completedAt: achievement.completed_at,
        progress: achievement.progress,
      })) || [],

      dataRetention: {
        policy: 'Data is retained until account deletion',
        deletionContact: LEGAL_CONTACT.dataProtectionEmail,
      },
    };

    // Set headers for file download
    const headers = new Headers();
    headers.set('Content-Type', 'application/json');
    headers.set('Content-Disposition', `attachment; filename="supasnake-data-export-${new Date().toISOString().split('T')[0]}.json"`);
    headers.set('Cache-Control', 'private, no-store');
    headers.set('Pragma', 'no-cache');
    headers.set('X-Content-Type-Options', 'nosniff');

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

/**
 * Leaderboard API
 * Per BA-001: Skill-based brackets for fair competition
 */

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { getSkillBracket, type LeaderboardEntry, type LeaderboardType, type SkillBracket } from '@/lib/leaderboard/types';
import { getIdentitiesForPlayers } from '@/lib/server/identity';
import type { PlayerIdentity } from '@/lib/identity/types';

/**
 * Identity v1 (PLAYER_IDENTITY_V1.md section 4): leaderboard rows render
 * from player_identity_view. playerName stays populated (display_handle)
 * for compatibility; the identity object powers the Player Card row
 * variant. Pre-022 the identity map is empty and rows keep the legacy
 * fallbacks - exactly today's behavior.
 */
function applyIdentities(
  entries: LeaderboardEntry[],
  identities: Map<string, PlayerIdentity>
): LeaderboardEntry[] {
  return entries.map((entry) => {
    const identity = identities.get(entry.playerId);
    if (!identity) return entry;
    return {
      ...entry,
      playerName: identity.displayHandle,
      identity: {
        handle: identity.displayHandle,
        isGenerated: identity.isGenerated,
        title: identity.title,
        clanTag: identity.clanTag,
        founder: identity.isFounder,
        premium: identity.isPremium,
        badges: identity.badges,
        avatarDynasty: identity.avatar?.dynasty ?? null,
        avatarVariantId: identity.avatar?.variantId ?? null,
        avatarVariantName: identity.avatar?.variantName ?? null,
        avatarRarity: identity.avatar?.rarity ?? null,
        mastery: identity.mastery,
        legacyScore: identity.legacyScore,
      },
    };
  });
}

// Server-side Supabase client
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || '',
  process.env.SUPABASE_SERVICE_ROLE_KEY || ''
);

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);

    // Parse query parameters
    const type = (searchParams.get('type') || 'global') as LeaderboardType;
    const bracket = searchParams.get('bracket') as SkillBracket | null;
    const dynasty = searchParams.get('dynasty'); // CYBER, PRIMAL, COSMIC
    const limit = Math.min(parseInt(searchParams.get('limit') || '50'), 100);
    const offset = parseInt(searchParams.get('offset') || '0');

    // Validate type
    if (!['global', 'weekly', 'daily'].includes(type)) {
      return NextResponse.json({ error: 'Invalid type' }, { status: 400 });
    }

    // Validate bracket if provided
    if (bracket && !['beginner', 'intermediate', 'advanced', 'master'].includes(bracket)) {
      return NextResponse.json({ error: 'Invalid bracket' }, { status: 400 });
    }

    // Validate dynasty if provided
    if (dynasty && !['CYBER', 'PRIMAL', 'COSMIC'].includes(dynasty)) {
      return NextResponse.json({ error: 'Invalid dynasty' }, { status: 400 });
    }

    // Calculate time filter for weekly/daily
    let timeFilter: Date | null = null;
    if (type === 'daily') {
      timeFilter = new Date();
      timeFilter.setUTCHours(0, 0, 0, 0);
    } else if (type === 'weekly') {
      timeFilter = new Date();
      const day = timeFilter.getUTCDay();
      const diff = timeFilter.getUTCDate() - day + (day === 0 ? -6 : 1);
      timeFilter.setUTCDate(diff);
      timeFilter.setUTCHours(0, 0, 0, 0);
    }

    // For global leaderboard, query players
    if (type === 'global') {
      const { data, error } = await supabase
        .from('players')
        .select(`
          id,
          username,
          high_score,
          total_dna_earned,
          collected_snakes:collected_snakes(
            generation
          )
        `)
        .gt('high_score', 0)
        .order('high_score', { ascending: false })
        .range(offset, offset + limit - 1);

      if (error) {
        console.error('Leaderboard query error:', error);
        return NextResponse.json({ error: 'Failed to fetch leaderboard' }, { status: 500 });
      }

      let entries: LeaderboardEntry[] = (data || []).map((player: any, index: number) => {
        const highestGen = player.collected_snakes?.reduce(
          (max: number, s: any) => Math.max(max, s.generation || 1),
          1
        ) || 1;

        return {
          rank: offset + index + 1,
          playerId: player.id,
          playerName: player.username || `Player ${player.id.slice(0, 6)}`,
          score: player.high_score || 0,
          highestGeneration: highestGen,
          collectionCount: player.collected_snakes?.length || 0,
          bracket: getSkillBracket(highestGen),
          updatedAt: new Date().toISOString(),
        };
      });

      // Filter by bracket if specified
      if (bracket) {
        entries = entries.filter(e => e.bracket === bracket);
      }

      // Identity v1: rows render display_handle + card fields (no-op pre-022)
      entries = applyIdentities(
        entries,
        await getIdentitiesForPlayers(supabase, entries.map(e => e.playerId))
      );

      // Get total count
      const { count } = await supabase
        .from('players')
        .select('*', { count: 'exact', head: true });

      return NextResponse.json({
        entries,
        total: count || 0,
        type,
        bracket: bracket || 'all',
      });
    }

    // For weekly/daily, query game sessions. Anomaly-board runs (Design
    // v2 §7.2) score on their OWN weekly board, not the dynasty boards -
    // excluded when the migration-021 column exists, with a filterless
    // retry for the pre-021 window (where no anomaly session can exist).
    const buildSessionQuery = (excludeAnomaly: boolean) => {
      let query = supabase
        .from('game_sessions')
        .select(`
          player_id,
          score,
          dynasty,
          players:player_id(
            username,
            collected_snakes(generation)
          )
        `)
        // Free Play never ranks (Design v2 §7.4: practice runs are rewardless)
        .eq('is_free_play', false)
        .gte('started_at', timeFilter!.toISOString())
        .order('score', { ascending: false })
        .range(offset, offset + limit - 1);
      if (excludeAnomaly) {
        query = query.is('anomaly_id', null);
      }
      // Apply dynasty filter if specified
      if (dynasty) {
        query = query.eq('dynasty', dynasty);
      }
      return query;
    };

    let { data, error } = await buildSessionQuery(true);
    if (error && /anomaly_id/i.test(error.message || '')) {
      // Pre-021: the column does not exist yet - nothing to exclude
      ({ data, error } = await buildSessionQuery(false));
    }

    if (error) {
      console.error('Leaderboard query error:', error);
      return NextResponse.json({ error: 'Failed to fetch leaderboard' }, { status: 500 });
    }

    // Weekly/Daily from game sessions
    let entries: LeaderboardEntry[] = (data || []).map((session: any, index: number) => {
      const player = session.players;
      const highestGen = player?.collected_snakes?.reduce(
        (max: number, s: any) => Math.max(max, s.generation || 1),
        1
      ) || 1;

      return {
        rank: offset + index + 1,
        playerId: session.player_id,
        playerName: player?.username || `Player ${session.player_id?.slice(0, 6) || 'Unknown'}`,
        score: session.score || 0,
        highestGeneration: highestGen,
        collectionCount: player?.collected_snakes?.length || 0,
        bracket: getSkillBracket(highestGen),
        updatedAt: new Date().toISOString(),
      };
    });

    // Filter by bracket if specified
    if (bracket) {
      entries = entries.filter(e => e.bracket === bracket);
    }

    // Identity v1: rows render display_handle + card fields (no-op pre-022)
    entries = applyIdentities(
      entries,
      await getIdentitiesForPlayers(supabase, entries.map(e => e.playerId))
    );

    // Get total count (with dynasty filter if specified) - same
    // exclusions as the entries query, same pre-021 retry
    const buildCountQuery = (excludeAnomaly: boolean) => {
      let query = supabase
        .from('game_sessions')
        .select('*', { count: 'exact', head: true })
        // Same exclusion as the entries query: free sessions never rank
        .eq('is_free_play', false)
        .gte('started_at', timeFilter!.toISOString());
      if (excludeAnomaly) {
        query = query.is('anomaly_id', null);
      }
      if (dynasty) {
        query = query.eq('dynasty', dynasty);
      }
      return query;
    };

    let { count, error: countError } = await buildCountQuery(true);
    if (countError && /anomaly_id/i.test(countError.message || '')) {
      ({ count } = await buildCountQuery(false));
    }

    return NextResponse.json({
      entries,
      total: count || 0,
      type,
      bracket: bracket || 'all',
      dynasty: dynasty || 'all',
    });
  } catch (error) {
    console.error('Leaderboard error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

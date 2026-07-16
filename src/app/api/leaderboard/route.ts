/**
 * Leaderboard API
 * Per BA-001: Skill-based brackets for fair competition
 */

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { getSkillBracket, type LeaderboardEntry, type LeaderboardType, type SkillBracket } from '@/lib/leaderboard/types';

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
          display_name,
          high_score,
          total_dna_earned,
          collected_snakes:collected_snakes(
            generation
          )
        `)
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
          playerName: player.display_name || `Player ${player.id.slice(0, 6)}`,
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

    // For weekly/daily, query game sessions
    let sessionQuery = supabase
      .from('game_sessions')
      .select(`
        player_id,
        score,
        dynasty,
        players:player_id(
          display_name,
          collected_snakes(generation)
        )
      `)
      .gte('started_at', timeFilter!.toISOString())
      .order('score', { ascending: false })
      .range(offset, offset + limit - 1);

    // Apply dynasty filter if specified
    if (dynasty) {
      sessionQuery = sessionQuery.eq('dynasty', dynasty);
    }

    const { data, error } = await sessionQuery;

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
        playerName: player?.display_name || `Player ${session.player_id?.slice(0, 6) || 'Unknown'}`,
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

    // Get total count (with dynasty filter if specified)
    let countQuery = supabase
      .from('game_sessions')
      .select('*', { count: 'exact', head: true })
      .gte('started_at', timeFilter!.toISOString());

    if (dynasty) {
      countQuery = countQuery.eq('dynasty', dynasty);
    }

    const { count } = await countQuery;

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

'use client';

/**
 * Leaderboard Page
 * Per BA-001: Skill-based brackets for fair competition
 * Per SO-004: Social discovery by Day 2-3
 */

import { useState, useEffect, useCallback } from 'react';
import { redirect } from 'next/navigation';
import { useAuth } from '@/lib/auth/AuthProvider';
import { GAME_CONFIG } from '@/shared/config/game';
import {
  type LeaderboardEntry,
  type LeaderboardType,
  type SkillBracket,
  BRACKET_NAMES,
  BRACKET_COLORS,
} from '@/lib/leaderboard/types';
import { useLeaderboardRealtime, type HighScoreEvent } from '@/hooks/useLeaderboardRealtime';
import { useToast } from '@/components/ui/Toast';
import { NavBar } from '@/components/ui/NavBar';
import Link from 'next/link';

type DynastyId = 'CYBER' | 'PRIMAL' | 'COSMIC';

const DYNASTY_COLORS: Record<DynastyId, string> = {
  CYBER: '#06B6D4',
  PRIMAL: '#4A7C2A',
  COSMIC: '#8B5CF6',
};

// Rank badge component
function RankBadge({ rank }: { rank: number }) {
  if (rank === 1) {
    return (
      <span className="inline-flex items-center justify-center w-8 h-8 rounded-arcade bg-yellow-500 text-scale-blue-dark font-display text-sm shadow-[0_0_12px_rgba(234,179,8,0.5)]">
        1
      </span>
    );
  }
  if (rank === 2) {
    return (
      <span className="inline-flex items-center justify-center w-8 h-8 rounded-arcade bg-gray-300 text-scale-blue-dark font-display text-sm shadow-[0_0_8px_rgba(156,163,175,0.4)]">
        2
      </span>
    );
  }
  if (rank === 3) {
    return (
      <span className="inline-flex items-center justify-center w-8 h-8 rounded-arcade bg-amber-600 text-bone-white font-display text-sm shadow-[0_0_8px_rgba(217,119,6,0.4)]">
        3
      </span>
    );
  }
  return (
    <span className="inline-flex items-center justify-center w-8 h-8 text-beige font-body text-sm">
      #{rank}
    </span>
  );
}

export default function LeaderboardPage() {
  if (!GAME_CONFIG.features.leaderboards) {
    redirect('/');
  }

  const { user } = useAuth();
  const { showToast } = useToast();
  const [entries, setEntries] = useState<LeaderboardEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [type, setType] = useState<LeaderboardType>('global');
  const [bracket, setBracket] = useState<SkillBracket | 'all'>('all');
  const [dynasty, setDynasty] = useState<DynastyId | 'all'>('all');
  const [total, setTotal] = useState(0);

  const fetchLeaderboard = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ type, limit: '50' });
      if (bracket !== 'all') {
        params.set('bracket', bracket);
      }
      // Dynasty filter only applies to weekly/daily
      if (dynasty !== 'all' && type !== 'global') {
        params.set('dynasty', dynasty);
      }

      const response = await fetch(`/api/leaderboard?${params}`);
      const data = await response.json();

      if (response.ok) {
        setEntries(data.entries);
        setTotal(data.total);
      }
    } catch (error) {
      console.error('Failed to fetch leaderboard:', error);
    } finally {
      setLoading(false);
    }
  }, [type, bracket, dynasty]);

  // Handle real-time high score events
  const handleNewHighScore = useCallback((event: HighScoreEvent) => {
    // Don't show notification for own scores
    if (event.playerId === user?.id) return;

    showToast(
      `New high score: ${event.score} points (${event.dynasty})!`,
      'success',
      5000
    );

    // Refresh leaderboard to show new entry
    fetchLeaderboard();
  }, [user?.id, showToast, fetchLeaderboard]);

  // Subscribe to real-time updates
  const { isConnected } = useLeaderboardRealtime({
    onNewHighScore: handleNewHighScore,
    minScoreThreshold: 50,
  });

  useEffect(() => {
    fetchLeaderboard();
  }, [fetchLeaderboard]);

  const myRank = entries.find(e => e.playerId === user?.id)?.rank;

  return (
    <div className="min-h-screen bg-scale-blue-dark text-bone-white">
      <NavBar />

      {/* Content with top padding for fixed nav */}
      <div className="max-w-5xl mx-auto px-4 pt-20 pb-12">
        {/* Header */}
        <div className="flex justify-between items-center mb-8">
          <div>
            <h1 className="text-4xl font-display uppercase tracking-arcade text-venom-orange">
              Leaderboard
            </h1>
            <div className="flex items-center gap-3 mt-1">
              <p className="text-beige font-body">Compete with other players</p>
              {isConnected && (
                <span className="flex items-center gap-1.5 text-xs text-green-400 font-body">
                  <span className="w-2 h-2 bg-green-400 rounded-full animate-pulse" />
                  Live
                </span>
              )}
            </div>
          </div>
          <Link
            href="/game"
            className="px-6 py-3 bg-venom-orange border-[3px] border-venom-orange-dark rounded-arcade font-display uppercase tracking-arcade text-scale-blue-dark hover:bg-venom-orange-light hover:scale-[1.02] active:scale-[0.98] transition-all"
          >
            Play
          </Link>
        </div>

        {/* Filters */}
        <div className="flex flex-wrap gap-4 mb-8">
          {/* Time Filter */}
          <div className="flex gap-2">
            {(['global', 'weekly', 'daily'] as LeaderboardType[]).map((t) => (
              <button
                key={t}
                onClick={() => setType(t)}
                className={`px-4 py-2 rounded-arcade border-[3px] font-display uppercase text-sm transition-all ${
                  type === t
                    ? 'bg-venom-orange border-venom-orange-dark text-scale-blue-dark'
                    : 'bg-scale-blue border-scale-blue-light text-beige hover:border-venom-orange hover:text-bone-white'
                }`}
              >
                {t}
              </button>
            ))}
          </div>

          {/* Bracket Filter */}
          <div className="flex gap-2">
            <button
              onClick={() => setBracket('all')}
              className={`px-4 py-2 rounded-arcade border-[3px] font-body text-sm transition-all ${
                bracket === 'all'
                  ? 'bg-scale-blue-light border-scale-blue-light text-bone-white'
                  : 'bg-scale-blue border-scale-blue-light text-beige hover:border-venom-orange'
              }`}
            >
              All Brackets
            </button>
            {(Object.keys(BRACKET_NAMES) as SkillBracket[]).map((b) => (
              <button
                key={b}
                onClick={() => setBracket(b)}
                className={`px-4 py-2 rounded-arcade border-[3px] font-body text-sm transition-all ${
                  bracket === b
                    ? 'text-bone-white border-transparent'
                    : 'bg-scale-blue border-scale-blue-light text-beige hover:border-venom-orange'
                }`}
                style={{
                  backgroundColor: bracket === b ? BRACKET_COLORS[b] : undefined,
                  borderColor: bracket === b ? BRACKET_COLORS[b] : undefined,
                }}
              >
                {b.charAt(0).toUpperCase() + b.slice(1)}
              </button>
            ))}
          </div>

          {/* Dynasty Filter (only for weekly/daily) */}
          {type !== 'global' && (
            <div className="flex gap-2">
              <button
                onClick={() => setDynasty('all')}
                className={`px-4 py-2 rounded-arcade border-[3px] font-body text-sm transition-all ${
                  dynasty === 'all'
                    ? 'bg-scale-blue-light border-scale-blue-light text-bone-white'
                    : 'bg-scale-blue border-scale-blue-light text-beige hover:border-venom-orange'
                }`}
              >
                All Dynasties
              </button>
              {(['CYBER', 'PRIMAL', 'COSMIC'] as DynastyId[]).map((d) => (
                <button
                  key={d}
                  onClick={() => setDynasty(d)}
                  className={`px-4 py-2 rounded-arcade border-[3px] font-display uppercase text-sm transition-all ${
                    dynasty === d
                      ? 'text-bone-white border-transparent'
                      : 'bg-scale-blue border-scale-blue-light text-beige hover:border-venom-orange'
                  }`}
                  style={{
                    backgroundColor: dynasty === d ? DYNASTY_COLORS[d] : undefined,
                    borderColor: dynasty === d ? DYNASTY_COLORS[d] : undefined,
                  }}
                >
                  {d}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* My Position */}
        {myRank && (
          <div className="bg-venom-orange/10 border-[3px] border-venom-orange rounded-arcade p-4 mb-6">
            <p className="text-venom-orange font-body">
              Your Rank: <span className="font-display text-2xl">#{myRank}</span>
            </p>
          </div>
        )}

        {/* Leaderboard Table */}
        <div className="bg-scale-blue border-[3px] border-scale-blue-light rounded-arcade overflow-hidden">
          {/* Header */}
          <div className="grid grid-cols-12 gap-4 p-4 bg-scale-blue-dark border-b border-scale-blue-light font-display uppercase text-sm text-beige">
            <div className="col-span-1">Rank</div>
            <div className="col-span-4">Player</div>
            <div className="col-span-2 text-right">Score</div>
            <div className="col-span-2 text-right">Gen</div>
            <div className="col-span-3">Bracket</div>
          </div>

          {/* Entries */}
          {loading ? (
            <div className="p-12 text-center">
              <div className="animate-spin w-10 h-10 border-4 border-t-transparent border-venom-orange rounded-full mx-auto mb-4" />
              <p className="text-beige font-body">Loading...</p>
            </div>
          ) : entries.length === 0 ? (
            <div className="p-12 text-center">
              <p className="text-beige font-body text-lg">No entries yet</p>
              <p className="text-beige/60 font-body text-sm mt-2">Be the first on the leaderboard!</p>
            </div>
          ) : (
            entries.map((entry, idx) => (
              <div
                key={entry.playerId}
                className={`grid grid-cols-12 gap-4 p-4 border-t border-scale-blue-light items-center transition-all hover:bg-scale-blue-light/30 ${
                  entry.playerId === user?.id ? 'bg-venom-orange/10' : ''
                } ${
                  entry.rank <= 3 ? 'bg-scale-blue-dark/50' : ''
                }`}
              >
                {/* Rank */}
                <div className="col-span-1">
                  <RankBadge rank={entry.rank} />
                </div>

                {/* Player */}
                <div className="col-span-4 font-body truncate">
                  <span className={entry.rank <= 3 ? 'text-bone-white font-bold' : 'text-beige'}>
                    {entry.playerName}
                  </span>
                  {entry.playerId === user?.id && (
                    <span className="ml-2 text-xs text-venom-orange">(You)</span>
                  )}
                </div>

                {/* Score */}
                <div className={`col-span-2 text-right font-display ${
                  entry.rank === 1 ? 'text-yellow-400 text-lg' :
                  entry.rank === 2 ? 'text-gray-300' :
                  entry.rank === 3 ? 'text-amber-500' :
                  'text-bone-white'
                }`}>
                  {entry.score.toLocaleString()}
                </div>

                {/* Generation */}
                <div className="col-span-2 text-right text-beige font-body">
                  Gen {entry.highestGeneration}
                </div>

                {/* Bracket */}
                <div className="col-span-3">
                  <span
                    className="px-3 py-1 rounded-arcade text-xs font-body border"
                    style={{
                      backgroundColor: BRACKET_COLORS[entry.bracket] + '20',
                      borderColor: BRACKET_COLORS[entry.bracket],
                      color: BRACKET_COLORS[entry.bracket],
                    }}
                  >
                    {entry.bracket.charAt(0).toUpperCase() + entry.bracket.slice(1)}
                  </span>
                </div>
              </div>
            ))
          )}
        </div>

        {/* Total Count */}
        <div className="text-center text-beige/60 mt-6 text-sm font-body">
          {total.toLocaleString()} total players
        </div>

        {/* Fair Play Notice */}
        <div className="text-center text-beige/40 mt-8 text-xs font-body space-y-1">
          <p>Players compete within their skill bracket for fair competition.</p>
          <p>Brackets are based on highest snake generation.</p>
        </div>
      </div>
    </div>
  );
}

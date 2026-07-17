'use client';

/**
 * Leaderboard Page
 * Per BA-001: Skill-based brackets for fair competition
 * Per SO-004: Social discovery by Day 2-3
 */

import { useState, useEffect, useCallback, type CSSProperties } from 'react';
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
import { IconTrophy } from '@/components/ui/icons';

type DynastyId = 'CYBER' | 'PRIMAL' | 'COSMIC';

// Dynasty tokens (match tailwind cyber/primal/cosmic colors)
const DYNASTY_CHIP_SELECTED: Record<DynastyId, string> = {
  CYBER: 'bg-cyber border-cyber text-void-deep shadow-glow-sm shadow-cyber/60',
  PRIMAL: 'bg-primal border-primal text-bone-white shadow-glow-sm shadow-primal/60',
  COSMIC: 'bg-cosmic border-cosmic text-bone-white shadow-glow-sm shadow-cosmic/60',
};

// Podium metals (gold / silver / bronze)
const PODIUM: Record<number, { glow: string; text: string; label: string }> = {
  1: { glow: '#fbbf24', text: 'text-rarity-legendary', label: '1st' },
  2: { glow: '#d1d5db', text: 'text-gray-300', label: '2nd' },
  3: { glow: '#d97706', text: 'text-amber-500', label: '3rd' },
};

// Rank badge component
function RankBadge({ rank }: { rank: number }) {
  if (rank === 1) {
    return (
      <span className="inline-flex items-center justify-center w-8 h-8 rounded-arcade bg-rarity-legendary text-void-deep font-display text-sm shadow-glow-sm shadow-rarity-legendary/60">
        1
      </span>
    );
  }
  if (rank === 2) {
    return (
      <span className="inline-flex items-center justify-center w-8 h-8 rounded-arcade bg-gray-300 text-void-deep font-display text-sm shadow-glow-sm shadow-gray-300/40">
        2
      </span>
    );
  }
  if (rank === 3) {
    return (
      <span className="inline-flex items-center justify-center w-8 h-8 rounded-arcade bg-amber-600 text-bone-white font-display text-sm shadow-glow-sm shadow-amber-600/50">
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
  const podiumEntries = entries.filter(e => e.rank >= 1 && e.rank <= 3);

  return (
    <div className="app-bg text-bone-white">
      <NavBar />

      {/* Content clears the floating nav rail (bottom mobile / right desktop) */}
      <div className="max-w-5xl mx-auto px-4 pt-8 pb-28 sm:pb-12 sm:pr-16">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-4 mb-8 animate-fade-up">
          <div>
            <h1 className="heading-display text-4xl text-venom-orange text-glow-orange flex items-center gap-3">
              <IconTrophy size={34} />
              Leaderboard
            </h1>
            <div className="flex items-center gap-3 mt-1">
              <p className="text-beige font-body">Compete with other players</p>
              {isConnected && (
                <span className="flex items-center gap-1.5 text-xs text-rarity-uncommon font-body">
                  <span className="w-2 h-2 bg-rarity-uncommon rounded-full animate-pulse" />
                  Live
                </span>
              )}
            </div>
          </div>
          <Link
            href="/game"
            className="btn-go self-start px-6 py-3 min-h-[44px] inline-flex items-center"
          >
            Play
          </Link>
        </div>

        {/* Filters */}
        <div className="flex flex-wrap gap-4 mb-8 animate-fade-up">
          {/* Time Filter */}
          <div className="flex flex-wrap gap-2">
            {(['global', 'weekly', 'daily'] as LeaderboardType[]).map((t) => (
              <button
                key={t}
                onClick={() => setType(t)}
                className={`px-4 py-2 min-h-[44px] rounded-arcade border-2 font-display uppercase text-sm transition-all ${
                  type === t
                    ? 'bg-cta-gradient border-venom-orange-light text-void-deep shadow-glow-sm shadow-venom-orange/50'
                    : 'bg-void/50 border-scale-blue-light/60 text-beige hover:border-venom-orange hover:text-bone-white'
                }`}
              >
                {t}
              </button>
            ))}
          </div>

          {/* Bracket Filter */}
          <div className="flex flex-wrap gap-2">
            <button
              onClick={() => setBracket('all')}
              className={`px-4 py-2 min-h-[44px] rounded-arcade border-2 font-body text-sm transition-all ${
                bracket === 'all'
                  ? 'bg-scale-blue-light border-scale-blue-light text-bone-white'
                  : 'bg-void/50 border-scale-blue-light/60 text-beige hover:border-venom-orange'
              }`}
            >
              All Brackets
            </button>
            {(Object.keys(BRACKET_NAMES) as SkillBracket[]).map((b) => (
              <button
                key={b}
                onClick={() => setBracket(b)}
                className={`px-4 py-2 min-h-[44px] rounded-arcade border-2 font-body text-sm transition-all ${
                  bracket === b
                    ? 'text-bone-white border-transparent'
                    : 'bg-void/50 border-scale-blue-light/60 text-beige hover:border-venom-orange'
                }`}
                style={{
                  backgroundColor: bracket === b ? BRACKET_COLORS[b] : undefined,
                  borderColor: bracket === b ? BRACKET_COLORS[b] : undefined,
                  boxShadow: bracket === b ? `0 0 10px -3px ${BRACKET_COLORS[b]}` : undefined,
                }}
              >
                {b.charAt(0).toUpperCase() + b.slice(1)}
              </button>
            ))}
          </div>

          {/* Dynasty Filter (only for weekly/daily) */}
          {type !== 'global' && (
            <div className="flex flex-wrap gap-2">
              <button
                onClick={() => setDynasty('all')}
                className={`px-4 py-2 min-h-[44px] rounded-arcade border-2 font-body text-sm transition-all ${
                  dynasty === 'all'
                    ? 'bg-scale-blue-light border-scale-blue-light text-bone-white'
                    : 'bg-void/50 border-scale-blue-light/60 text-beige hover:border-venom-orange'
                }`}
              >
                All Dynasties
              </button>
              {(['CYBER', 'PRIMAL', 'COSMIC'] as DynastyId[]).map((d) => (
                <button
                  key={d}
                  onClick={() => setDynasty(d)}
                  className={`px-4 py-2 min-h-[44px] rounded-arcade border-2 font-display uppercase text-sm transition-all ${
                    dynasty === d
                      ? DYNASTY_CHIP_SELECTED[d]
                      : 'bg-void/50 border-scale-blue-light/60 text-beige hover:border-venom-orange'
                  }`}
                >
                  {d}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* My Position */}
        {myRank && (
          <div className="panel-glow [--glow:#22d3ee] p-4 mb-6 animate-fade-up">
            <p className="text-venom-orange font-body">
              Your Rank: <span className="font-display text-2xl text-glow-orange">#{myRank}</span>
            </p>
          </div>
        )}

        {/* Podium - top three */}
        {!loading && podiumEntries.length > 0 && (
          <div className="grid grid-cols-3 gap-2 sm:gap-4 mb-6 items-end animate-fade-up">
            {[2, 1, 3].map((rank) => {
              const entry = podiumEntries.find(e => e.rank === rank);
              if (!entry) return <div key={rank} />;
              const metal = PODIUM[rank];
              return (
                <div
                  key={rank}
                  className={`panel-glow text-center px-2 sm:px-4 ${
                    rank === 1 ? 'py-6 animate-breathe' : 'py-4'
                  }`}
                  style={{ '--glow': metal.glow } as CSSProperties}
                >
                  <IconTrophy
                    size={rank === 1 ? 28 : 20}
                    className={`mx-auto mb-1 ${metal.text}`}
                  />
                  <p className={`font-display ${metal.text} ${rank === 1 ? 'text-lg' : 'text-sm'}`}>
                    {metal.label}
                  </p>
                  <p className="font-body text-bone-white truncate text-sm sm:text-base">
                    {entry.playerName}
                  </p>
                  <p className={`font-display ${metal.text} ${rank === 1 ? 'text-2xl' : 'text-lg'}`}>
                    {entry.score.toLocaleString()}
                  </p>
                </div>
              );
            })}
          </div>
        )}

        {/* Leaderboard Table */}
        <div className="panel-elevated overflow-hidden animate-fade-up">
          {/* Header */}
          <div className="grid grid-cols-12 gap-4 p-4 bg-void/60 border-b border-scale-blue-light/60 label-arcade">
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
                className={`grid grid-cols-12 gap-4 p-4 border-t border-scale-blue-light/40 items-center transition-all hover:bg-scale-blue-light/20 ${
                  entry.playerId === user?.id ? 'bg-venom-orange/10' : ''
                } ${
                  entry.rank === 1 ? 'bg-gradient-to-r from-rarity-legendary/10 to-transparent' :
                  entry.rank === 2 ? 'bg-gradient-to-r from-gray-300/10 to-transparent' :
                  entry.rank === 3 ? 'bg-gradient-to-r from-amber-600/10 to-transparent' : ''
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
                  entry.rank === 1 ? 'text-rarity-legendary text-lg [--glow:#fbbf24] text-glow' :
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

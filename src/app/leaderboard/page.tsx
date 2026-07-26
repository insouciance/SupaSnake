'use client';

/**
 * Leaderboard Page
 * Per SO-004: Social discovery by Day 2-3
 *
 * Constitution §6.1: Score is the skill number. Generation "skill brackets"
 * are deleted, and "your rank" comes from the server's `viewer` block - the
 * page must never compare a leaderboard `playerId` (players.id) against the
 * auth user id, which is what made myRank permanently undefined (GT §9.3).
 */

import { useState, useEffect, useCallback, type CSSProperties } from 'react';
import { redirect } from 'next/navigation';
import { useAuth } from '@/lib/auth/AuthProvider';
import { GAME_CONFIG } from '@/shared/config/game';
import {
  type LeaderboardEntry,
  type LeaderboardType,
  type LeaderboardViewer,
} from '@/lib/leaderboard/types';
import { PlayerCard } from '@/components/identity/PlayerCard';
import type { PlayerIdentity } from '@/lib/identity/types';
import { useLeaderboardRealtime, type HighScoreEvent } from '@/hooks/useLeaderboardRealtime';
import { useToast } from '@/components/ui/Toast';
import { NavBar } from '@/components/ui/NavBar';
import Link from 'next/link';
import { IconTrophy } from '@/components/ui/icons';
import { AnomalyPanel, type AnomalyBoardView } from '@/components/game/AnomalyPanel';
import { AscensionMonth } from '@/components/signal/AscensionMonth';

type DynastyId = 'CYBER' | 'PRIMAL' | 'COSMIC';

/** Board tabs: the three score boards + the weekly anomaly board (§7.2). */
type BoardTab = LeaderboardType | 'anomaly';

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

/**
 * Identity v1 (section 4.3): leaderboard rows are Player Card `row`
 * surfaces. The API's identity object maps into the card's shape; rows
 * without one (pre-022) keep the legacy plain-name render.
 */
function entryIdentity(entry: LeaderboardEntry): PlayerIdentity | null {
  const identity = entry.identity;
  if (!identity) return null;
  return {
    playerId: entry.playerId,
    userId: null,
    handle: identity.isGenerated ? null : identity.handle,
    displayHandle: identity.handle,
    isGenerated: identity.isGenerated,
    isFounder: identity.founder,
    isPremium: identity.premium === true,
    title: identity.title,
    bannerId: null,
    bannerRender: null,
    badges: identity.badges ?? [],
    avatar:
      identity.avatarVariantId && identity.avatarVariantName
        ? {
            variantId: identity.avatarVariantId,
            variantName: identity.avatarVariantName,
            rarity: identity.avatarRarity ?? 'common',
            dynasty: identity.avatarDynasty ?? 'COSMIC',
            generation: 1,
          }
        : null,
    clanTag: identity.clanTag,
    clanName: null,
    mastery: identity.mastery ?? {},
    legacyScore: identity.legacyScore ?? 0,
  };
}

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

  const { session, isLoading: isAuthLoading } = useAuth();
  const { showToast } = useToast();
  const [entries, setEntries] = useState<LeaderboardEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<BoardTab>('global');
  const [dynasty, setDynasty] = useState<DynastyId | 'all'>('all');
  const [total, setTotal] = useState(0);
  // The server's identity join (players.id space) - never the auth user id
  const [viewer, setViewer] = useState<LeaderboardViewer | null>(null);
  // Weekly Anomaly board (§7.2): fetched when its tab is selected
  const [anomalyBoard, setAnomalyBoard] = useState<AnomalyBoardView | null>(null);

  const type: LeaderboardType = tab === 'anomaly' ? 'weekly' : tab;
  const anomalyTab = tab === 'anomaly';

  const fetchLeaderboard = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ type, view: 'board', limit: '50' });
      // Dynasty filter only applies to weekly/daily
      if (dynasty !== 'all' && type !== 'global') {
        params.set('dynasty', dynasty);
      }

      // Credentials are optional (the board is public) but they are what
      // lets the server resolve "you" - see LeaderboardViewer.
      const response = await fetch(`/api/leaderboard?${params}`, {
        headers: session?.access_token
          ? { Authorization: `Bearer ${session.access_token}` }
          : undefined,
      });
      const data = await response.json();

      if (response.ok) {
        setEntries(data.entries);
        setTotal(data.total);
        setViewer(data.viewer ?? null);
      }
    } catch (error) {
      console.error('Failed to fetch leaderboard:', error);
    } finally {
      setLoading(false);
    }
  }, [type, dynasty, session?.access_token]);

  // Handle real-time high score events
  const handleNewHighScore = useCallback((event: HighScoreEvent) => {
    // Don't show notification for own scores. The realtime payload carries
    // game_sessions.player_id (players.id), so it is compared against the
    // server-resolved viewer id - never the auth user id (GT §9.3).
    if (viewer?.playerId && event.playerId === viewer.playerId) return;

    showToast(
      `New high score: ${event.score} points (${event.dynasty})!`,
      'success',
      5000
    );

    // Refresh leaderboard to show new entry
    fetchLeaderboard();
  }, [viewer?.playerId, showToast, fetchLeaderboard]);

  // Subscribe to real-time updates
  const { isConnected } = useLeaderboardRealtime({
    onNewHighScore: handleNewHighScore,
    minScoreThreshold: 50,
  });

  useEffect(() => {
    if (anomalyTab) return; // the anomaly tab has its own fetch below
    // Wait for the session to resolve before the first board request.
    // `useAuth` starts with `session: null` while `getSession()` is in flight,
    // so firing here unconditionally sent a request with no Authorization
    // header - and the server can only resolve `viewer` from a token. The
    // signed-in player was therefore served a viewer-less board first and a
    // correct one a moment later: their rank flickered in, and the board was
    // fetched twice on every visit. Deferring costs the logged-out visitor
    // nothing over the network (`getSession()` reads local storage) and the
    // board stays public - an unresolved session simply means no viewer.
    if (isAuthLoading) return;
    fetchLeaderboard();
  }, [fetchLeaderboard, anomalyTab, isAuthLoading]);

  // Weekly Anomaly board (§7.2): its own leaderboard, normal DNA rules
  useEffect(() => {
    if (!anomalyTab || !session?.access_token) return;
    let cancelled = false;
    fetch('/api/anomaly', {
      headers: { Authorization: `Bearer ${session.access_token}` },
    })
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (!cancelled && data?.anomaly) {
          setAnomalyBoard(data as AnomalyBoardView);
        }
      })
      .catch((err) => console.error('Failed to fetch anomaly board:', err));
    return () => {
      cancelled = true;
    };
  }, [anomalyTab, session?.access_token]);

  // GT §9.3 fix: the rank comes from the server's players.id join, not from
  // matching an auth user id against a players.id.
  const myRank = viewer?.ranked ? viewer.rank : undefined;
  const myPlayerId = viewer?.playerId ?? null;
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
          {/* Board Filter: the three score boards + this week's anomaly */}
          <div className="flex flex-wrap gap-2">
            {(['global', 'weekly', 'daily', 'anomaly'] as BoardTab[]).map((t) => (
              <button
                key={t}
                onClick={() => setTab(t)}
                data-testid={`leaderboard-tab-${t}`}
                className={`px-4 py-2 min-h-[44px] rounded-arcade border-2 font-display uppercase text-sm transition-all ${
                  tab === t
                    ? 'bg-cta-gradient border-venom-orange-light text-void-deep shadow-glow-sm shadow-venom-orange/50'
                    : 'bg-void/50 border-scale-blue-light/60 text-beige hover:border-venom-orange hover:text-bone-white'
                }`}
              >
                {t}
              </button>
            ))}
          </div>

          {/* Generation "skill brackets" deleted per Constitution §6.1 -
              they bucketed players by a DNA purchase and called it skill. */}

          {/* Dynasty Filter (only for weekly/daily) */}
          {!anomalyTab && type !== 'global' && (
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

        {/* Weekly Anomaly board (§7.2): its own leaderboard - normal DNA
            rules, one rotating modifier per week */}
        {anomalyTab && (
          <div className="max-w-xl animate-fade-up space-y-3" data-testid="anomaly-board-tab">
            {!session?.access_token ? (
              <p className="text-beige font-body">
                Sign in to see this week&apos;s anomaly board.
              </p>
            ) : !anomalyBoard ? (
              <div className="p-12 text-center">
                <div className="animate-spin w-10 h-10 border-4 border-t-transparent border-venom-orange rounded-full mx-auto mb-4" />
                <p className="text-beige font-body">Loading...</p>
              </div>
            ) : !anomalyBoard.live ? (
              <p className="text-beige font-body">
                The Anomaly board is not live yet — this week would be{' '}
                <span className="text-bone-white">{anomalyBoard.anomaly.name}</span>.
              </p>
            ) : (
              <>
                <AnomalyPanel board={anomalyBoard} />
                <p className="text-beige/40 text-xs font-body">
                  Anomaly runs pay normal DNA and score here — not on the
                  weekly dynasty boards.
                </p>
              </>
            )}
          </div>
        )}

        {/* My Position */}
        {!anomalyTab && myRank && (
          <div
            data-testid="leaderboard-my-rank"
            data-rank={myRank}
            className="panel-glow [--glow:#22d3ee] p-4 mb-6 animate-fade-up"
          >
            <p className="text-venom-orange font-body">
              Your Rank: <span className="font-display text-2xl text-glow-orange">#{myRank}</span>
            </p>
          </div>
        )}

        {/* Podium - top three */}
        {!anomalyTab && !loading && podiumEntries.length > 0 && (
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
        {!anomalyTab && (
        <div className="panel-elevated overflow-hidden animate-fade-up">
          {/* Header */}
          <div className="grid grid-cols-12 gap-4 p-4 bg-void/60 border-b border-scale-blue-light/60 label-arcade">
            <div className="col-span-2">Rank</div>
            <div className="col-span-6">Player</div>
            <div className="col-span-4 text-right">Score</div>
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
            entries.map((entry) => {
              const isMe = myPlayerId !== null && entry.playerId === myPlayerId;
              return (
              <div
                key={entry.playerId}
                data-testid="leaderboard-row"
                data-you={isMe ? 'true' : undefined}
                className={`grid grid-cols-12 gap-4 p-4 border-t border-scale-blue-light/40 items-center transition-all hover:bg-scale-blue-light/20 ${
                  isMe ? 'bg-venom-orange/10' : ''
                } ${
                  entry.rank === 1 ? 'bg-gradient-to-r from-rarity-legendary/10 to-transparent' :
                  entry.rank === 2 ? 'bg-gradient-to-r from-gray-300/10 to-transparent' :
                  entry.rank === 3 ? 'bg-gradient-to-r from-amber-600/10 to-transparent' : ''
                }`}
              >
                {/* Rank */}
                <div className="col-span-2">
                  <RankBadge rank={entry.rank} />
                </div>

                {/* Player - Identity v1: the Player Card row variant */}
                <div className="col-span-6 font-body min-w-0">
                  {(() => {
                    const identity = entryIdentity(entry);
                    return identity ? (
                      <span className="inline-flex items-center gap-2 min-w-0 max-w-full">
                        <PlayerCard identity={identity} variant="row" />
                        {isMe && (
                          <span className="text-xs text-venom-orange shrink-0">(You)</span>
                        )}
                      </span>
                    ) : (
                      <span className="truncate">
                        <span className={entry.rank <= 3 ? 'text-bone-white font-bold' : 'text-beige'}>
                          {entry.playerName}
                        </span>
                        {isMe && (
                          <span className="ml-2 text-xs text-venom-orange">(You)</span>
                        )}
                      </span>
                    );
                  })()}
                </div>

                {/* Score */}
                <div className={`col-span-4 text-right font-display ${
                  entry.rank === 1 ? 'text-rarity-legendary text-lg [--glow:#fbbf24] text-glow' :
                  entry.rank === 2 ? 'text-gray-300' :
                  entry.rank === 3 ? 'text-amber-500' :
                  'text-bone-white'
                }`}>
                  {entry.score.toLocaleString()}
                </div>
              </div>
              );
            })
          )}
        </div>
        )}

        {/* Total Count */}
        {!anomalyTab && (
        <div className="text-center text-beige/60 mt-6 text-sm font-body">
          {total.toLocaleString()} ranked players
        </div>
        )}

        {/* Ascension — Score, this month (Constitution §6.1, §12.2).
            Mounted here because §6.1 presents it "everywhere as 'Score, this
            month'", and Score's district is this page. It is a READING, not a
            tab: it adds no board, no cadence, no claim and no navigation entry,
            which is what §12.2 means by "its monthly aggregation view, not a
            surface". Flag-gated off; it renders nothing when the flag is down. */}
        {!anomalyTab && <AscensionMonth token={session?.access_token} />}

        {/* Fair Play Notice (Constitution §6.1) */}
        {!anomalyTab && (
        <div className="text-center text-beige/40 mt-8 text-xs font-body space-y-1">
          <p>Score measures the pilot: it never reads your genes, traits or lineage.</p>
          <p>Only completed, validated runs rank, and every player holds one entry — their best.</p>
        </div>
        )}
      </div>
    </div>
  );
}

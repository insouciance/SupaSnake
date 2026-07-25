'use client';

/**
 * useLeaderboardRealtime Hook
 *
 * Subscribes to Supabase Realtime for live leaderboard updates.
 * Triggers callbacks when new high scores are set.
 */

import { useEffect, useState, useCallback, useRef } from 'react';
import { supabase } from '@/lib/supabase/client';
import type { RealtimeChannel } from '@supabase/supabase-js';
import {
  LEADERBOARD_CONTENT_EPOCH,
  ineligibleReason,
  type RankableSessionRow,
} from '@/lib/leaderboard/eligibility';

export interface HighScoreEvent {
  playerId: string;
  playerName?: string;
  score: number;
  dynasty: string;
  timestamp: string;
}

interface UseLeaderboardRealtimeOptions {
  /** Called when a new high score is recorded */
  onNewHighScore?: (event: HighScoreEvent) => void;
  /** Minimum score to trigger notification (prevents spam) */
  minScoreThreshold?: number;
}

interface UseLeaderboardRealtimeReturn {
  /** Whether connected to realtime channel */
  isConnected: boolean;
  /** Connection error if any */
  error: string | null;
}

export function useLeaderboardRealtime(
  options: UseLeaderboardRealtimeOptions
): UseLeaderboardRealtimeReturn {
  const { onNewHighScore, minScoreThreshold = 50 } = options;

  const [isConnected, setIsConnected] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const channelRef = useRef<RealtimeChannel | null>(null);

  // Sessions already announced. A settled run arrives as an INSERT and then
  // one or more UPDATEs; the announcement is per run, not per row version.
  const announcedRef = useRef<Set<string>>(new Set());

  // Handle an incoming game_sessions row change (potential high score).
  //
  // FINDING F-2 (WP-1.06): this used to broadcast **any** row whose score
  // cleared a threshold. A run still in progress, a Free Play run, an Anomaly
  // run, a run that failed server validation, an abandoned run - every one of
  // them could raise "New high score!" for a result that will never appear on
  // the board the toast is telling you to look at. The eligibility predicate
  // WP-0.05 wrote for the board is now the same gate the toast passes through,
  // so the notification can only ever describe a run that actually ranks.
  //
  // Two conditions are deliberately NOT applied here, and both are strictly
  // safe: the board's time window (this is a live event - it happened now)
  // and the dev/QA cohort exclusion, which is server-resolved and unavailable
  // to a client. The cohort filter still governs what the board itself shows.
  const handleGameSession = useCallback(
    (payload: { new?: Record<string, unknown> | null }) => {
      const row = (payload?.new ?? null) as RankableSessionRow | null;
      if (!row) return;

      const score = typeof row.score === 'number' ? row.score : null;
      if (score === null || score < minScoreThreshold) return;

      if (
        ineligibleReason(row, { windowStart: LEADERBOARD_CONTENT_EPOCH }) !== null
      ) {
        return;
      }

      if (row.id) {
        if (announcedRef.current.has(row.id)) return;
        announcedRef.current.add(row.id);
      }

      if (onNewHighScore) {
        onNewHighScore({
          playerId: row.player_id as string,
          score,
          dynasty: row.dynasty || 'PRIMAL',
          timestamp: new Date().toISOString(),
        });
      }
    },
    [onNewHighScore, minScoreThreshold]
  );

  useEffect(() => {
    // Create channel subscription
    const channel = supabase.channel('leaderboard-updates');

    // Subscribe to game_sessions changes for high scores.
    //
    // INSERT alone cannot carry an eligible run: a session row is inserted
    // when the run STARTS, with score 0 and no `ended_at`, and settlement
    // writes the score and the end state as an UPDATE. Listening to INSERT
    // only - as this hook did - meant the eligibility gate above would reject
    // every event and the feature would be silently dead. Both events are
    // subscribed and the same predicate decides; `announcedRef` keeps one run
    // to one announcement.
    for (const event of ['INSERT', 'UPDATE'] as const) {
      channel.on(
        'postgres_changes',
        {
          event,
          schema: 'public',
          table: 'game_sessions',
        },
        handleGameSession
      );
    }

    // WP-0.04: the player_achievements subscription that used to sit here
    // is gone with the mechanism. player_achievements is a frozen ledger
    // (migration 042) - nothing writes it, so nothing can broadcast it.

    // Subscribe and handle connection state
    channel.subscribe((status) => {
      if (status === 'SUBSCRIBED') {
        setIsConnected(true);
        setError(null);
      } else if (status === 'CHANNEL_ERROR') {
        setIsConnected(false);
        setError('Failed to connect to realtime updates');
      } else if (status === 'TIMED_OUT') {
        setIsConnected(false);
        setError('Connection timed out');
      }
    });

    channelRef.current = channel;

    // Cleanup on unmount
    return () => {
      if (channelRef.current) {
        channelRef.current.unsubscribe();
        channelRef.current = null;
      }
    };
  }, [handleGameSession]);

  return { isConnected, error };
}

export default useLeaderboardRealtime;

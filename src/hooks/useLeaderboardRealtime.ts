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
  /** Called when a new achievement is unlocked */
  onAchievementUnlocked?: (event: { playerId: string; achievementName: string }) => void;
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
  const { onNewHighScore, onAchievementUnlocked, minScoreThreshold = 50 } = options;

  const [isConnected, setIsConnected] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const channelRef = useRef<RealtimeChannel | null>(null);

  // Handle incoming game session (potential high score)
  const handleGameSession = useCallback(
    (payload: { new: Record<string, unknown> }) => {
      const session = payload.new;

      // Only notify for scores above threshold
      const score = session.score as number;
      if (score < minScoreThreshold) return;

      if (onNewHighScore) {
        onNewHighScore({
          playerId: session.player_id as string,
          score,
          dynasty: (session.dynasty as string) || 'PRIMAL',
          timestamp: new Date().toISOString(),
        });
      }
    },
    [onNewHighScore, minScoreThreshold]
  );

  // Handle incoming achievement unlock
  const handleAchievement = useCallback(
    (payload: { new: Record<string, unknown> }) => {
      const achievement = payload.new;

      // Only notify for newly completed achievements
      if (!achievement.completed) return;

      if (onAchievementUnlocked) {
        onAchievementUnlocked({
          playerId: achievement.player_id as string,
          achievementName: achievement.achievement_id as string,
        });
      }
    },
    [onAchievementUnlocked]
  );

  useEffect(() => {
    // Create channel subscription
    const channel = supabase.channel('leaderboard-updates');

    // Subscribe to game_sessions inserts for high scores
    channel.on(
      'postgres_changes',
      {
        event: 'INSERT',
        schema: 'public',
        table: 'game_sessions',
      },
      handleGameSession
    );

    // Subscribe to player_achievements updates for achievement unlocks
    if (onAchievementUnlocked) {
      channel.on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'player_achievements',
          filter: 'completed=eq.true',
        },
        handleAchievement
      );
    }

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
  }, [handleGameSession, handleAchievement, onAchievementUnlocked]);

  return { isConnected, error };
}

export default useLeaderboardRealtime;

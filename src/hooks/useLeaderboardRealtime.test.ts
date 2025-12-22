/**
 * useLeaderboardRealtime Hook Tests
 */

import { renderHook, act } from '@testing-library/react';
import { useLeaderboardRealtime } from './useLeaderboardRealtime';

// Mock Supabase client
const mockChannel = {
  on: jest.fn().mockReturnThis(),
  subscribe: jest.fn().mockReturnThis(),
  unsubscribe: jest.fn(),
};

const mockSupabase = {
  channel: jest.fn(() => mockChannel),
};

jest.mock('@/lib/supabase/client', () => ({
  createBrowserClient: () => mockSupabase,
}));

describe('useLeaderboardRealtime', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('subscription', () => {
    it('creates a channel subscription on mount', () => {
      const onNewHighScore = jest.fn();
      renderHook(() => useLeaderboardRealtime({ onNewHighScore }));

      expect(mockSupabase.channel).toHaveBeenCalledWith('leaderboard-updates');
      expect(mockChannel.subscribe).toHaveBeenCalled();
    });

    it('unsubscribes on unmount', () => {
      const onNewHighScore = jest.fn();
      const { unmount } = renderHook(() => useLeaderboardRealtime({ onNewHighScore }));

      unmount();

      expect(mockChannel.unsubscribe).toHaveBeenCalled();
    });

    it('listens for INSERT events on game_sessions', () => {
      const onNewHighScore = jest.fn();
      renderHook(() => useLeaderboardRealtime({ onNewHighScore }));

      expect(mockChannel.on).toHaveBeenCalledWith(
        'postgres_changes',
        expect.objectContaining({
          event: 'INSERT',
          table: 'game_sessions',
        }),
        expect.any(Function)
      );
    });
  });

  describe('onNewHighScore callback', () => {
    it('calls onNewHighScore when a high score event is received', () => {
      const onNewHighScore = jest.fn();

      // Capture the callback
      let capturedCallback: ((payload: unknown) => void) | null = null;
      mockChannel.on.mockImplementation((event, filter, callback) => {
        capturedCallback = callback;
        return mockChannel;
      });

      renderHook(() => useLeaderboardRealtime({ onNewHighScore }));

      // Simulate receiving an event
      if (capturedCallback) {
        act(() => {
          capturedCallback({
            new: {
              player_id: 'player-123',
              score: 150,
              dynasty: 'EMBER',
            },
          });
        });
      }

      expect(onNewHighScore).toHaveBeenCalledWith(
        expect.objectContaining({
          playerId: 'player-123',
          score: 150,
          dynasty: 'EMBER',
        })
      );
    });
  });

  describe('isConnected state', () => {
    it('starts as false', () => {
      const { result } = renderHook(() => useLeaderboardRealtime({}));
      expect(result.current.isConnected).toBe(false);
    });
  });
});

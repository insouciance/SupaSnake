/**
 * useLeaderboardRealtime Hook Tests
 */

import { renderHook, act } from '@testing-library/react';
import { useLeaderboardRealtime } from './useLeaderboardRealtime';
import { supabase } from '@/lib/supabase/client';

// Mock the Supabase client singleton (the hook imports `supabase` directly).
// The channel object is defined inside the factory to avoid TDZ issues with
// jest.mock hoisting; it is re-exposed below for assertions.
jest.mock('@/lib/supabase/client', () => {
  const channel = {
    on: jest.fn().mockReturnThis(),
    subscribe: jest.fn().mockReturnThis(),
    unsubscribe: jest.fn(),
  };
  return {
    supabase: {
      channel: jest.fn(() => channel),
    },
  };
});

const mockSupabase = supabase as unknown as { channel: jest.Mock };
const mockChannel = mockSupabase.channel() as {
  on: jest.Mock;
  subscribe: jest.Mock;
  unsubscribe: jest.Mock;
};

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
              dynasty: 'CYBER',
            },
          });
        });
      }

      expect(onNewHighScore).toHaveBeenCalledWith(
        expect.objectContaining({
          playerId: 'player-123',
          score: 150,
          dynasty: 'CYBER',
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

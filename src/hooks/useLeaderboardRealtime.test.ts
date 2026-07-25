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

    it('listens for INSERT and UPDATE events on game_sessions', () => {
      const onNewHighScore = jest.fn();
      renderHook(() => useLeaderboardRealtime({ onNewHighScore }));

      // Settlement writes the score as an UPDATE - an INSERT-only
      // subscription can never see an eligible run (F-2).
      for (const event of ['INSERT', 'UPDATE']) {
        expect(mockChannel.on).toHaveBeenCalledWith(
          'postgres_changes',
          expect.objectContaining({ event, table: 'game_sessions' }),
          expect.any(Function)
        );
      }
    });
  });

  describe('onNewHighScore callback', () => {
    /**
     * FINDING F-2 (WP-1.06). The previous version of this suite asserted the
     * bug: it fed the handler a bare `{ player_id, score, dynasty }` - a row
     * with no `ended_at`, no `validated`, no mode - and expected a "New high
     * score!" announcement. That is precisely the run that will never rank.
     * The case is rewritten around the eligibility predicate the board uses,
     * and the ineligible shapes it used to accept are now regression tests.
     */
    function captureHandler(onNewHighScore: jest.Mock) {
      let captured: ((payload: unknown) => void) | null = null;
      mockChannel.on.mockImplementation((event, filter, callback) => {
        captured = callback;
        return mockChannel;
      });
      renderHook(() => useLeaderboardRealtime({ onNewHighScore }));
      return captured as unknown as (payload: unknown) => void;
    }

    const eligibleRow = {
      id: 'session-1',
      player_id: 'player-123',
      score: 150,
      dynasty: 'CYBER',
      started_at: '2026-07-20T10:00:00.000Z',
      ended_at: '2026-07-20T10:04:00.000Z',
      validated: true,
      is_free_play: false,
      anomaly_id: null,
      end_reason: 'completed',
    };

    it('announces a settled, validated, rankable run', () => {
      const onNewHighScore = jest.fn();
      const handler = captureHandler(onNewHighScore);

      act(() => {
        handler({ new: eligibleRow });
      });

      expect(onNewHighScore).toHaveBeenCalledWith(
        expect.objectContaining({
          playerId: 'player-123',
          score: 150,
          dynasty: 'CYBER',
        })
      );
    });

    it('announces a run once, however many row versions arrive', () => {
      const onNewHighScore = jest.fn();
      const handler = captureHandler(onNewHighScore);

      act(() => {
        handler({ new: eligibleRow });
        handler({ new: { ...eligibleRow, dynasty: 'PRIMAL' } });
      });

      expect(onNewHighScore).toHaveBeenCalledTimes(1);
    });

    it.each([
      ['an in-progress run', { ended_at: null }],
      ['a run that failed validation', { validated: false }],
      ['a run with no validation verdict', { validated: null }],
      ['a Free Play run', { is_free_play: true }],
      ['an Anomaly run', { anomaly_id: 'gold_rush' }],
      ['an abandoned run', { end_reason: 'abandoned' }],
      ['an expired run', { end_reason: 'expired' }],
      ['a run with no player', { player_id: null }],
      ['a pre-epoch run', { started_at: '2026-07-01T00:00:00.000Z' }],
    ])('stays silent for %s (F-2)', (_label, override) => {
      const onNewHighScore = jest.fn();
      const handler = captureHandler(onNewHighScore);

      act(() => {
        handler({ new: { ...eligibleRow, ...override } });
      });

      expect(onNewHighScore).not.toHaveBeenCalled();
    });

    it('stays silent below the score threshold', () => {
      const onNewHighScore = jest.fn();
      const handler = captureHandler(onNewHighScore);

      act(() => {
        handler({ new: { ...eligibleRow, score: 10 } });
      });

      expect(onNewHighScore).not.toHaveBeenCalled();
    });

    it('ignores an empty payload', () => {
      const onNewHighScore = jest.fn();
      const handler = captureHandler(onNewHighScore);

      act(() => {
        handler({ new: null });
      });

      expect(onNewHighScore).not.toHaveBeenCalled();
    });
  });

  describe('isConnected state', () => {
    it('starts as false', () => {
      const { result } = renderHook(() => useLeaderboardRealtime({}));
      expect(result.current.isConnected).toBe(false);
    });
  });
});

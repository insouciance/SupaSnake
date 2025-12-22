/**
 * useOfflineProgress Hook Tests
 */

import { renderHook, act, waitFor } from '@testing-library/react';
import { useOfflineProgress } from './useOfflineProgress';

// Mock fetch
const mockFetch = jest.fn();
global.fetch = mockFetch;

// Mock auth context
jest.mock('@/lib/auth/AuthProvider', () => ({
  useAuth: () => ({
    session: { access_token: 'test-token' },
    user: { id: 'user-123' },
  }),
}));

describe('useOfflineProgress', () => {
  describe('loadPlayerAndCalculate', () => {
    // loadPlayerAndCalculate is an internal async function that:
    // 1. Fetches player data from /api/player
    // 2. Calculates offline progress using calculateOfflineProgress
    // 3. Sets progress and showModal state
    // Tests below cover this behavior through the hook's public interface

    it('fetches player data and calculates progress on mount', async () => {
      const now = new Date('2024-01-15T12:00:00Z');
      jest.useFakeTimers();
      jest.setSystemTime(now);

      const twoHoursAgo = new Date('2024-01-15T10:00:00Z').toISOString();
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          player: { energy: 2, max_energy: 5, last_login_at: twoHoursAgo },
          lastLoginAt: twoHoursAgo,
          collectionSize: 10,
        }),
      });

      const { result } = renderHook(() => useOfflineProgress());

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      expect(result.current.progress).not.toBeNull();
      expect(result.current.progress?.passiveDnaEarned).toBe(20);
      jest.useRealTimers();
    });

    it('handles fetch errors gracefully', async () => {
      mockFetch.mockRejectedValueOnce(new Error('Network error'));

      const { result } = renderHook(() => useOfflineProgress());

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      expect(result.current.error).toBe('Network error');
    });

    it('handles non-ok response', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 500,
      });

      const { result } = renderHook(() => useOfflineProgress());

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      expect(result.current.error).toBe('Failed to fetch player data');
    });
  });

  beforeEach(() => {
    jest.clearAllMocks();
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  function mockPlayerResponse(lastLoginAt: string | null, collectionSize: number) {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        player: {
          energy: 2,
          max_energy: 5,
          last_login_at: lastLoginAt,
        },
        lastLoginAt,
        collectionSize,
      }),
    });
  }

  function mockClaimResponse(rewards: { passiveDnaEarned: number; energyRestored: number }) {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        success: true,
        rewards,
        newBalances: { dna: 100, energy: 5 },
      }),
    });
  }

  it('fetches player data on mount', async () => {
    const now = new Date('2024-01-15T12:00:00Z');
    jest.setSystemTime(now);

    const twoHoursAgo = new Date('2024-01-15T10:00:00Z').toISOString();
    mockPlayerResponse(twoHoursAgo, 10);

    const { result } = renderHook(() => useOfflineProgress());

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(mockFetch).toHaveBeenCalledWith(
      '/api/player',
      expect.objectContaining({
        headers: expect.objectContaining({
          Authorization: 'Bearer test-token',
        }),
      })
    );
  });

  it('calculates offline progress preview', async () => {
    const now = new Date('2024-01-15T12:00:00Z');
    jest.setSystemTime(now);

    const twoHoursAgo = new Date('2024-01-15T10:00:00Z').toISOString();
    mockPlayerResponse(twoHoursAgo, 10);

    const { result } = renderHook(() => useOfflineProgress());

    await waitFor(() => {
      expect(result.current.progress).not.toBeNull();
    });

    expect(result.current.progress?.passiveDnaEarned).toBe(20);
    expect(result.current.progress?.shouldShowModal).toBe(true);
  });

  it('shows modal when rewards available', async () => {
    const now = new Date('2024-01-15T12:00:00Z');
    jest.setSystemTime(now);

    const twoHoursAgo = new Date('2024-01-15T10:00:00Z').toISOString();
    mockPlayerResponse(twoHoursAgo, 10);

    const { result } = renderHook(() => useOfflineProgress());

    await waitFor(() => {
      expect(result.current.showModal).toBe(true);
    });
  });

  it('does not show modal for short offline periods', async () => {
    const now = new Date('2024-01-15T12:00:00Z');
    jest.setSystemTime(now);

    const threeMinutesAgo = new Date('2024-01-15T11:57:00Z').toISOString();
    mockPlayerResponse(threeMinutesAgo, 10);

    const { result } = renderHook(() => useOfflineProgress());

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(result.current.showModal).toBe(false);
  });

  it('claims rewards when claimRewards is called', async () => {
    const now = new Date('2024-01-15T12:00:00Z');
    jest.setSystemTime(now);

    const twoHoursAgo = new Date('2024-01-15T10:00:00Z').toISOString();
    mockPlayerResponse(twoHoursAgo, 10);

    const { result } = renderHook(() => useOfflineProgress());

    await waitFor(() => {
      expect(result.current.showModal).toBe(true);
    });

    mockClaimResponse({ passiveDnaEarned: 20, energyRestored: 3 });

    await act(async () => {
      await result.current.claimRewards();
    });

    expect(mockFetch).toHaveBeenCalledWith(
      '/api/player/claim-offline',
      expect.objectContaining({
        method: 'POST',
      })
    );

    expect(result.current.showModal).toBe(false);
    expect(result.current.claimed).toBe(true);
  });

  it('dismisses modal without claiming', async () => {
    const now = new Date('2024-01-15T12:00:00Z');
    jest.setSystemTime(now);

    const twoHoursAgo = new Date('2024-01-15T10:00:00Z').toISOString();
    mockPlayerResponse(twoHoursAgo, 10);

    const { result } = renderHook(() => useOfflineProgress());

    await waitFor(() => {
      expect(result.current.showModal).toBe(true);
    });

    act(() => {
      result.current.dismissModal();
    });

    expect(result.current.showModal).toBe(false);
    expect(result.current.claimed).toBe(false);
  });
});

import { renderHook, act, waitFor } from '@testing-library/react';
import { useWalletSync } from './useWalletSync';

// =============================================================================
// MOCKS
// =============================================================================

// Mock auth provider
jest.mock('@/lib/auth/AuthProvider', () => ({
  useAuth: jest.fn(),
}));

// Mock collection store
jest.mock('@/lib/stores/collectionStore', () => ({
  useCollectionStore: jest.fn(),
}));

// Mock game store
jest.mock('@/lib/store/gameStore', () => ({
  useGameStore: jest.fn(),
}));

import { useAuth } from '@/lib/auth/AuthProvider';
import { useCollectionStore } from '@/lib/stores/collectionStore';
import { useGameStore } from '@/lib/store/gameStore';

const mockUseAuth = useAuth as jest.Mock;
const mockUseCollectionStore = useCollectionStore as jest.Mock;
const mockUseGameStore = useGameStore as jest.Mock;

// Mock fetch globally
const mockFetch = jest.fn();
global.fetch = mockFetch;

// =============================================================================
// TESTS
// =============================================================================

describe('useWalletSync', () => {
  const mockSetDnaBalance = jest.fn();
  const mockSyncEnergyFromServer = jest.fn();

  beforeEach(() => {
    jest.clearAllMocks();

    // Default mock implementations
    mockUseAuth.mockReturnValue({
      session: { access_token: 'test-token' },
    });

    mockUseCollectionStore.mockImplementation((selector: (state: unknown) => unknown) => {
      const state = {
        dnaBalance: 1000,
        setDnaBalance: mockSetDnaBalance,
      };
      return selector(state);
    });

    mockUseGameStore.mockImplementation((selector: (state: unknown) => unknown) => {
      const state = {
        energy: 5,
        maxEnergy: 5,
        energyRegenAt: null,
        syncEnergyFromServer: mockSyncEnergyFromServer,
      };
      return selector(state);
    });
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('should return current wallet state from stores', async () => {
    // Mock fetch to resolve immediately for this test
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({ player: { dna: 1000, energy: 5, energy_regen_at: null } }),
    });

    const { result } = renderHook(() => useWalletSync());

    // Check store values are accessible
    expect(result.current.dnaBalance).toBe(1000);
    expect(result.current.energy).toBe(5);
    expect(result.current.maxEnergy).toBe(5);
    expect(result.current.energyRegenAt).toBeNull();
    expect(result.current.error).toBeNull();

    // Wait for loading to complete
    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });
  });

  it('should fetch wallet data on mount when authenticated', async () => {
    const mockResponse = {
      player: {
        dna: 1500,
        energy: 3,
        energy_regen_at: '2026-01-28T12:00:00Z',
      },
    };

    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve(mockResponse),
    });

    renderHook(() => useWalletSync());

    await waitFor(() => {
      expect(mockFetch).toHaveBeenCalledWith('/api/player', {
        headers: { Authorization: 'Bearer test-token' },
      });
    });

    await waitFor(() => {
      expect(mockSetDnaBalance).toHaveBeenCalledWith(1500);
      expect(mockSyncEnergyFromServer).toHaveBeenCalledWith(3, '2026-01-28T12:00:00Z');
    });
  });

  it('should not fetch when not authenticated', () => {
    mockUseAuth.mockReturnValue({
      session: null,
    });

    renderHook(() => useWalletSync());

    expect(mockFetch).not.toHaveBeenCalled();
  });

  it('should set error state on fetch failure', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
    });

    const { result } = renderHook(() => useWalletSync());

    await waitFor(() => {
      expect(result.current.error).toBe('Failed to sync wallet');
    });
  });

  it('should handle network errors', async () => {
    mockFetch.mockRejectedValueOnce(new Error('Network error'));

    const { result } = renderHook(() => useWalletSync());

    await waitFor(() => {
      expect(result.current.error).toBe('Network error');
    });
  });

  it('should provide syncWallet function for manual sync', async () => {
    const mockResponse = {
      player: {
        dna: 2000,
        energy: 4,
        energy_regen_at: null,
      },
    };

    mockFetch.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve(mockResponse),
    });

    const { result } = renderHook(() => useWalletSync());

    // Wait for initial sync
    await waitFor(() => {
      expect(mockFetch).toHaveBeenCalledTimes(1);
    });

    // Call manual sync
    await act(async () => {
      await result.current.syncWallet();
    });

    expect(mockFetch).toHaveBeenCalledTimes(2);
    expect(mockSetDnaBalance).toHaveBeenLastCalledWith(2000);
  });

  it('should handle missing player data gracefully', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({}),
    });

    const { result } = renderHook(() => useWalletSync());

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    // Should not call setters if player is missing
    expect(mockSetDnaBalance).not.toHaveBeenCalled();
    expect(mockSyncEnergyFromServer).not.toHaveBeenCalled();
  });

  it('should handle undefined dna in response', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({ player: { energy: 3, energy_regen_at: null } }),
    });

    renderHook(() => useWalletSync());

    await waitFor(() => {
      expect(mockSyncEnergyFromServer).toHaveBeenCalledWith(3, null);
    });

    // DNA setter should not be called if undefined
    expect(mockSetDnaBalance).not.toHaveBeenCalled();
  });

  describe('visibility change handling (handleVisibilityChange)', () => {
    it('should sync wallet when tab becomes visible', async () => {
      const mockResponse = {
        player: { dna: 1500, energy: 3, energy_regen_at: null },
      };

      mockFetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve(mockResponse),
      });

      renderHook(() => useWalletSync());

      // Wait for initial sync
      await waitFor(() => {
        expect(mockFetch).toHaveBeenCalledTimes(1);
      });

      // Simulate tab becoming visible
      Object.defineProperty(document, 'visibilityState', {
        value: 'visible',
        writable: true,
        configurable: true,
      });

      await act(async () => {
        document.dispatchEvent(new Event('visibilitychange'));
      });

      await waitFor(() => {
        expect(mockFetch).toHaveBeenCalledTimes(2);
      });
    });

    it('should not sync when tab becomes hidden', async () => {
      const mockResponse = {
        player: { dna: 1500, energy: 3, energy_regen_at: null },
      };

      mockFetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve(mockResponse),
      });

      renderHook(() => useWalletSync());

      // Wait for initial sync
      await waitFor(() => {
        expect(mockFetch).toHaveBeenCalledTimes(1);
      });

      // Simulate tab becoming hidden
      Object.defineProperty(document, 'visibilityState', {
        value: 'hidden',
        writable: true,
        configurable: true,
      });

      await act(async () => {
        document.dispatchEvent(new Event('visibilitychange'));
      });

      // Should still only have 1 call (no sync on hidden)
      expect(mockFetch).toHaveBeenCalledTimes(1);
    });

    it('should not sync on visibility change when not authenticated', async () => {
      mockUseAuth.mockReturnValue({
        session: null,
      });

      renderHook(() => useWalletSync());

      // Simulate tab becoming visible
      Object.defineProperty(document, 'visibilityState', {
        value: 'visible',
        writable: true,
        configurable: true,
      });

      await act(async () => {
        document.dispatchEvent(new Event('visibilitychange'));
      });

      expect(mockFetch).not.toHaveBeenCalled();
    });

    it('should cleanup visibility listener on unmount', () => {
      const removeEventListenerSpy = jest.spyOn(document, 'removeEventListener');

      const { unmount } = renderHook(() => useWalletSync());

      unmount();

      expect(removeEventListenerSpy).toHaveBeenCalledWith(
        'visibilitychange',
        expect.any(Function)
      );

      removeEventListenerSpy.mockRestore();
    });
  });
});

'use client';

/**
 * useWalletSync - Unified wallet synchronization hook
 *
 * Combines DNA balance (collectionStore) + recovering Energy status
 * (gameStore, Constitution §8.6)
 * Single source of truth: /api/player endpoint
 *
 * Constraints:
 * - TE-003: Cross-platform sync (server-authoritative)
 * - Server Authority: All values from API responses
 * - No localStorage for critical balances
 */

import { useCallback, useEffect, useState, useRef } from 'react';
import { useAuth } from '@/lib/auth/AuthProvider';
import { useCollectionStore } from '@/lib/stores/collectionStore';
import { useGameStore, type ChargeSnapshot } from '@/lib/store/gameStore';

interface WalletState {
  dnaBalance: number;
  /** Recovering Energy status; null until the first sync. */
  charge: ChargeSnapshot | null;
  isLoading: boolean;
  error: string | null;
  syncWallet: () => Promise<void>;
}

export function useWalletSync(): WalletState {
  const { session } = useAuth();
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const hasSyncedRef = useRef(false);

  // Read from stores
  const dnaBalance = useCollectionStore((state) => state.dnaBalance);
  const setDnaBalance = useCollectionStore((state) => state.setDnaBalance);
  const charge = useGameStore((state) => state.charge);
  const syncChargeFromServer = useGameStore((state) => state.syncChargeFromServer);

  const syncWallet = useCallback(async () => {
    if (!session?.access_token) return;

    setIsLoading(true);
    setError(null);

    try {
      const response = await fetch('/api/player', {
        headers: { Authorization: `Bearer ${session.access_token}` },
      });

      if (!response.ok) {
        throw new Error('Failed to sync wallet');
      }

      const data = await response.json();

      if (data.player) {
        // Sync DNA to collectionStore
        if (data.player.dna !== undefined) {
          setDnaBalance(data.player.dna);
        }
      }

      // The compatibility-named charge block is top-level on the response.
      // Its stock was reconciled against server time before being returned.
      syncChargeFromServer((data.charge as ChargeSnapshot | undefined) ?? null);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Wallet sync failed';
      setError(message);
    } finally {
      setIsLoading(false);
    }
  }, [session?.access_token, setDnaBalance, syncChargeFromServer]);

  // Sync on mount when authenticated (once)
  useEffect(() => {
    if (session?.access_token && !hasSyncedRef.current) {
      hasSyncedRef.current = true;
      syncWallet();
    }
  }, [session?.access_token, syncWallet]);

  // Re-sync when tab becomes visible (prevents stale data)
  useEffect(() => {
    function handleVisibilityChange() {
      if (document.visibilityState === 'visible' && session?.access_token) {
        syncWallet();
      }
    }

    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [session?.access_token, syncWallet]);

  return {
    dnaBalance,
    charge,
    isLoading,
    error,
    syncWallet,
  };
}

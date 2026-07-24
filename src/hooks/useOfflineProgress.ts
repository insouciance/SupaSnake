'use client';

/**
 * useOfflineProgress Hook
 *
 * Fetches player data on mount, calculates offline progress,
 * and manages the Welcome Back modal state.
 *
 * 100% server-authoritative: No localStorage used.
 */

import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '@/lib/auth/AuthProvider';
import {
  calculateOfflineProgress,
  type OfflineProgress,
} from '@/lib/progression/offlineProgress';

interface UseOfflineProgressReturn {
  /** Calculated offline progress (preview) */
  progress: OfflineProgress | null;
  /** Whether to show the Welcome Back modal */
  showModal: boolean;
  /** Whether data is still loading */
  isLoading: boolean;
  /** Error message if any */
  error: string | null;
  /** Whether rewards have been claimed */
  claimed: boolean;
  /** Claim rewards from server */
  claimRewards: () => Promise<boolean>;
  /** Dismiss modal without claiming */
  dismissModal: () => void;
  /** Server-confirmed rewards after claiming */
  confirmedRewards: {
    passiveDnaEarned: number;
    energyRestored: number;
  } | null;
}

export function useOfflineProgress(): UseOfflineProgressReturn {
  const { session } = useAuth();

  const [progress, setProgress] = useState<OfflineProgress | null>(null);
  const [showModal, setShowModal] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [claimed, setClaimed] = useState(false);
  const [confirmedRewards, setConfirmedRewards] = useState<{
    passiveDnaEarned: number;
    energyRestored: number;
  } | null>(null);

  // Fetch player data and calculate progress on mount
  useEffect(() => {
    const accessToken = session?.access_token;
    if (!accessToken) {
      setIsLoading(false);
      return;
    }

    // loadPlayerAndCalculate: Fetches player data and calculates offline progress
    (async () => {
      try {
        const response = await fetch('/api/player', {
          headers: {
            Authorization: `Bearer ${accessToken}`,
          },
        });

        if (!response.ok) {
          throw new Error('Failed to fetch player data');
        }

        const data = await response.json();
        const { player, lastLoginAt, collectionSize } = data;

        // Calculate preview (same logic server will use)
        const offlineProgress = calculateOfflineProgress({
          lastLoginAt: lastLoginAt || new Date().toISOString(),
          currentEnergy: player.energy,
          maxEnergy: player.max_energy,
          collectionSize: collectionSize || 0,
        });

        setProgress(offlineProgress);

        // Show modal if there are rewards and enough time has passed
        if (
          (player.total_games_played ?? 0) > 0 &&
          offlineProgress.shouldShowModal &&
          offlineProgress.hasRewards
        ) {
          setShowModal(true);
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Unknown error');
      } finally {
        setIsLoading(false);
      }
    })();
  }, [session?.access_token]);

  // Claim rewards from server
  const claimRewards = useCallback(async () => {
    if (!session?.access_token) {
      setError('Not authenticated');
      return false;
    }

    try {
      const response = await fetch('/api/player/claim-offline', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session.access_token}`,
        },
      });

      if (!response.ok) {
        throw new Error('Failed to claim rewards');
      }

      const data = await response.json();

      // Store server-confirmed rewards
      setConfirmedRewards({
        passiveDnaEarned: data.rewards.passiveDnaEarned,
        energyRestored: data.rewards.energyRestored,
      });

      setClaimed(true);
      setShowModal(false);
      return true;
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to claim rewards');
      return false;
    }
  }, [session?.access_token]);

  // Dismiss modal without claiming
  const dismissModal = useCallback(() => {
    setShowModal(false);
  }, []);

  return {
    progress,
    showModal,
    isLoading,
    error,
    claimed,
    claimRewards,
    dismissModal,
    confirmedRewards,
  };
}

export default useOfflineProgress;

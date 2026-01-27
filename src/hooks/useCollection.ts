'use client';

/**
 * useCollection Hook - Combines collection store state with derived data and actions
 *
 * This hook provides:
 * - Data from the collection store (dynasties, variants, ownedSnakes)
 * - Derived data (filtered variants, completion stats, equipped snake)
 * - UI state (modals, loading, errors)
 * - Actions (unlock, equip, refresh)
 */

import { useCallback, useEffect, useMemo } from 'react';
import { useCollectionStore } from '@/lib/stores/collectionStore';
import { useAuth } from '@/lib/auth/AuthProvider';
import type {
  Dynasty,
  SnakeVariant,
  OwnedSnake,
  UnlockResponse,
  EquipResponse,
} from '@/shared/types/snake-data-model';

// =============================================================================
// TYPES
// =============================================================================

export interface UseCollectionReturn {
  // Data from store
  dynasties: Dynasty[];
  variants: SnakeVariant[];
  ownedSnakes: OwnedSnake[];
  dnaBalance: number;

  // Derived data
  activeDynastyId: string | null;
  currentDynastyVariants: SnakeVariant[];
  currentDynastyOwned: OwnedSnake[];
  completionByDynasty: Record<string, { owned: number; total: number }>;
  equippedSnake: OwnedSnake | null;

  // UI State
  selectedVariant: SnakeVariant | null;
  selectedOwned: OwnedSnake | null;
  isDetailModalOpen: boolean;
  isUnlockModalOpen: boolean;
  isLoading: boolean;
  error: string | null;

  // Actions
  setActiveDynasty: (id: string) => void;
  openDetailModal: (variant: SnakeVariant, owned: OwnedSnake) => void;
  closeDetailModal: () => void;
  openUnlockModal: (variant: SnakeVariant) => void;
  closeUnlockModal: () => void;
  unlockVariant: (variantId: string) => Promise<void>;
  equipSnake: (snakeId: string) => Promise<void>;
  refresh: () => Promise<void>;
}

// =============================================================================
// FETCH HELPERS
// =============================================================================

async function fetchDynasties(token: string): Promise<Dynasty[]> {
  const response = await fetch('/api/dynasties', {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!response.ok) {
    throw new Error('Failed to fetch dynasties');
  }
  const data = await response.json();
  return data.dynasties;
}

async function fetchVariants(token: string): Promise<SnakeVariant[]> {
  const response = await fetch('/api/variants', {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!response.ok) {
    throw new Error('Failed to fetch variants');
  }
  const data = await response.json();
  return data.variants;
}

async function fetchCollection(token: string): Promise<{
  snakes: OwnedSnake[];
  dnaBalance: number;
}> {
  const response = await fetch('/api/collection', {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!response.ok) {
    throw new Error('Failed to fetch collection');
  }
  const data = await response.json();
  return {
    snakes: data.snakes ?? [],
    dnaBalance: data.dnaBalance ?? 0,
  };
}

// =============================================================================
// HOOK
// =============================================================================

export function useCollection(): UseCollectionReturn {
  // Auth session for API calls
  const { session } = useAuth();

  // Store state and actions
  const {
    dynasties,
    variants,
    ownedSnakes,
    equippedSnakeId,
    activeDynastyId,
    selectedVariant,
    selectedOwned,
    isDetailModalOpen,
    isUnlockModalOpen,
    isLoading,
    error,
    setDynasties,
    setVariants,
    setOwnedSnakes,
    setEquippedSnakeId,
    setLoading,
    setError,
    setActiveDynasty,
    openDetailModal,
    closeDetailModal,
    openUnlockModal,
    closeUnlockModal,
    setUnlocking,
    setEquipping,
    setUnlockError,
    addOwnedSnake,
  } = useCollectionStore();

  // DNA balance from store (extended interface)
  const dnaBalance = useCollectionStore(
    (state) => (state as { dnaBalance?: number }).dnaBalance ?? 0
  );
  const setDnaBalance = useCollectionStore(
    (state) =>
      (state as { setDnaBalance?: (balance: number) => void }).setDnaBalance
  );

  // ===========================================================================
  // DATA FETCHING
  // ===========================================================================

  const refresh = useCallback(async () => {
    // Wait for auth session
    if (!session?.access_token) {
      return;
    }

    setLoading(true);
    setError(null);

    const token = session.access_token;

    try {
      const [dynastiesData, variantsData, collectionData] = await Promise.all([
        fetchDynasties(token),
        fetchVariants(token),
        fetchCollection(token),
      ]);

      setDynasties(dynastiesData);
      setVariants(variantsData);
      setOwnedSnakes(collectionData.snakes);

      // Set DNA balance if the store supports it
      if (setDnaBalance) {
        setDnaBalance(collectionData.dnaBalance);
      }

      // Find equipped snake from collection
      const equipped = collectionData.snakes.find((s) => s.isEquipped);
      if (equipped) {
        setEquippedSnakeId(equipped.id);
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to load collection';
      setError(message);
    } finally {
      setLoading(false);
    }
  }, [
    session?.access_token,
    setDynasties,
    setVariants,
    setOwnedSnakes,
    setEquippedSnakeId,
    setLoading,
    setError,
    setDnaBalance,
  ]);

  // Fetch data on mount
  useEffect(() => {
    refresh();
  }, [refresh]);

  // Auto-select first dynasty if none active
  useEffect(() => {
    if (!activeDynastyId && dynasties.length > 0) {
      const firstDynasty = dynasties[0];
      setActiveDynasty(firstDynasty.id);
    }
  }, [activeDynastyId, dynasties, setActiveDynasty]);

  // ===========================================================================
  // DERIVED DATA
  // ===========================================================================

  // Filter variants by active dynasty
  const currentDynastyVariants = useMemo(() => {
    if (!activeDynastyId) return [];
    return variants
      .filter((v) => v.dynastyId === activeDynastyId)
      .sort((a, b) => a.sortOrder - b.sortOrder);
  }, [variants, activeDynastyId]);

  // Filter owned snakes by active dynasty
  const currentDynastyOwned = useMemo(() => {
    if (!activeDynastyId) return [];
    const dynastyVariantIds = new Set(
      variants.filter((v) => v.dynastyId === activeDynastyId).map((v) => v.id)
    );
    return ownedSnakes.filter(
      (s) => s.snakeVariantId && dynastyVariantIds.has(s.snakeVariantId)
    );
  }, [ownedSnakes, variants, activeDynastyId]);

  // Calculate completion stats per dynasty
  const completionByDynasty = useMemo(() => {
    const completion: Record<string, { owned: number; total: number }> = {};

    for (const dynasty of dynasties) {
      const dynastyVariants = variants.filter((v) => v.dynastyId === dynasty.id);
      const dynastyVariantIds = new Set(dynastyVariants.map((v) => v.id));
      const ownedCount = ownedSnakes.filter(
        (s) => s.snakeVariantId && dynastyVariantIds.has(s.snakeVariantId)
      ).length;

      completion[dynasty.id] = {
        owned: ownedCount,
        total: dynastyVariants.length,
      };
    }

    return completion;
  }, [dynasties, variants, ownedSnakes]);

  // Get currently equipped snake
  const equippedSnake = useMemo(() => {
    if (!equippedSnakeId) return null;
    return ownedSnakes.find((s) => s.id === equippedSnakeId) ?? null;
  }, [ownedSnakes, equippedSnakeId]);

  // ===========================================================================
  // ACTIONS
  // ===========================================================================

  const unlockVariant = useCallback(
    async (variantId: string) => {
      setUnlocking(true);
      setUnlockError(null);

      // Find the variant for optimistic update
      const variant = variants.find((v) => v.id === variantId);
      if (!variant) {
        setUnlockError('Variant not found');
        setUnlocking(false);
        return;
      }

      // Store previous state for rollback
      const previousOwnedSnakes = [...ownedSnakes];
      const previousDnaBalance = dnaBalance;

      // Optimistic update: create a temporary owned snake
      const optimisticSnake: OwnedSnake = {
        id: `temp-${Date.now()}`,
        playerId: '',
        variantId: variant.name,
        snakeVariantId: variant.id,
        generation: 1,
        parent1Id: null,
        parent2Id: null,
        acquiredAt: new Date().toISOString(),
        acquiredMethod: 'unlock',
        isEquipped: false,
        isFavorited: false,
      };

      // Apply optimistic update
      addOwnedSnake(optimisticSnake);
      if (setDnaBalance) {
        setDnaBalance(Math.max(0, dnaBalance - variant.unlockCostDna));
      }

      try {
        const response = await fetch('/api/collection', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${session?.access_token}`,
          },
          body: JSON.stringify({ variantId }),
        });

        const data: UnlockResponse = await response.json();

        if (!response.ok || !data.success) {
          throw new Error(data.error ?? 'Failed to unlock variant');
        }

        // Replace optimistic snake with real one
        if (data.snake) {
          setOwnedSnakes([
            ...previousOwnedSnakes,
            data.snake,
          ]);
        }

        // Update DNA balance with server value
        if (setDnaBalance && data.newDnaBalance !== undefined) {
          setDnaBalance(data.newDnaBalance);
        }

        // Close the modal on success
        closeUnlockModal();
      } catch (err) {
        // Rollback optimistic update
        setOwnedSnakes(previousOwnedSnakes);
        if (setDnaBalance) {
          setDnaBalance(previousDnaBalance);
        }

        const message = err instanceof Error ? err.message : 'Failed to unlock variant';
        setUnlockError(message);
      } finally {
        setUnlocking(false);
      }
    },
    [
      session?.access_token,
      variants,
      ownedSnakes,
      dnaBalance,
      addOwnedSnake,
      setOwnedSnakes,
      setDnaBalance,
      setUnlocking,
      setUnlockError,
      closeUnlockModal,
    ]
  );

  const equipSnake = useCallback(
    async (snakeId: string) => {
      setEquipping(true);

      // Store previous state for rollback
      const previousEquippedId = equippedSnakeId;
      const previousOwnedSnakes = [...ownedSnakes];

      // Optimistic update: set this snake as equipped
      setEquippedSnakeId(snakeId);
      setOwnedSnakes(
        ownedSnakes.map((s) => ({
          ...s,
          isEquipped: s.id === snakeId,
        }))
      );

      try {
        const response = await fetch('/api/collection/equip', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${session?.access_token}`,
          },
          body: JSON.stringify({ snakeId }),
        });

        const data: EquipResponse = await response.json();

        if (!response.ok || !data.success) {
          throw new Error(data.error ?? 'Failed to equip snake');
        }

        // Close detail modal after successful equip
        closeDetailModal();
      } catch (err) {
        // Rollback optimistic update
        setEquippedSnakeId(previousEquippedId);
        setOwnedSnakes(previousOwnedSnakes);

        const message = err instanceof Error ? err.message : 'Failed to equip snake';
        setError(message);
      } finally {
        setEquipping(false);
      }
    },
    [
      session?.access_token,
      ownedSnakes,
      equippedSnakeId,
      setEquippedSnakeId,
      setOwnedSnakes,
      setEquipping,
      setError,
      closeDetailModal,
    ]
  );

  // ===========================================================================
  // RETURN
  // ===========================================================================

  return {
    // Data from store
    dynasties,
    variants,
    ownedSnakes,
    dnaBalance,

    // Derived data
    activeDynastyId,
    currentDynastyVariants,
    currentDynastyOwned,
    completionByDynasty,
    equippedSnake,

    // UI State
    selectedVariant,
    selectedOwned,
    isDetailModalOpen,
    isUnlockModalOpen,
    isLoading,
    error,

    // Actions
    setActiveDynasty,
    openDetailModal,
    closeDetailModal,
    openUnlockModal,
    closeUnlockModal,
    unlockVariant,
    equipSnake,
    refresh,
  };
}

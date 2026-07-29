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
import {
  distinctVariantCount,
  highestGenerationSnakes,
} from '@/lib/collection/roster';
import type {
  Dynasty,
  SnakeVariant,
  OwnedSnake,
  UnlockResponse,
  EquipResponse,
  FavoriteResponse,
} from '@/shared/types/snake-data-model';

// =============================================================================
// TYPES
// =============================================================================

/**
 * Per-dynasty completion. `owned` counts DISTINCT VARIANTS, because that is
 * what the sticker book has slots for; `snakes` counts active highest-gen
 * builds. Historical generations remain in `ownedSnakes`, outside this UI
 * projection. Counting rows in `owned` is what once rendered 43/11 (391%).
 */
export interface DynastyCompletion {
  owned: number;
  total: number;
  snakes: number;
}

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
  completionByDynasty: Record<string, DynastyCompletion>;
  equippedSnake: OwnedSnake | null;

  // UI State
  selectedVariant: SnakeVariant | null;
  selectedOwned: OwnedSnake | null;
  isDetailModalOpen: boolean;
  isUnlockModalOpen: boolean;
  isLoading: boolean;
  error: string | null;
  equipError: string | null;

  // Actions
  setActiveDynasty: (id: string) => void;
  openDetailModal: (variant: SnakeVariant, owned: OwnedSnake) => void;
  selectOwnedSnake: (owned: OwnedSnake) => void;
  closeDetailModal: () => void;
  openUnlockModal: (variant: SnakeVariant) => void;
  closeUnlockModal: () => void;
  unlockVariant: (
    variantId: string,
    options?: { equip?: boolean }
  ) => Promise<OwnedSnake | null>;
  equipSnake: (snakeId: string) => Promise<boolean>;
  toggleFavorite: (snakeId: string, favorited: boolean) => Promise<boolean>;
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
    equipError,
    setDynasties,
    setVariants,
    setOwnedSnakes,
    setEquippedSnakeId,
    setLoading,
    setError,
    setActiveDynasty,
    openDetailModal,
    selectOwnedSnake,
    closeDetailModal,
    openUnlockModal,
    closeUnlockModal,
    setUnlocking,
    setEquipping,
    setUnlockError,
    setEquipError,
  } = useCollectionStore();

  // DNA balance from store (proper typed access)
  const dnaBalance = useCollectionStore((state) => state.dnaBalance);
  const setDnaBalance = useCollectionStore((state) => state.setDnaBalance);

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

      // Set DNA balance from server (server authority)
      setDnaBalance(collectionData.dnaBalance);

      // Find equipped snake from collection
      const equipped = collectionData.snakes.find((s) => s.isEquipped);
      if (equipped) {
        setEquippedSnakeId(equipped.id);
      } else {
        setEquippedSnakeId(null);
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

  // Voluntary Lab opens on the equipped snake's dynasty. A genuinely fresh
  // fallback is PRIMAL, independent of catalog sort order (which may still
  // list CYBER first for existing collection presentation).
  useEffect(() => {
    if (!activeDynastyId && dynasties.length > 0) {
      const equipped =
        ownedSnakes.find((snake) => snake.id === equippedSnakeId) ??
        ownedSnakes.find((snake) => snake.isEquipped);
      const equippedVariant = variants.find(
        (variant) => variant.id === equipped?.snakeVariantId
      );
      const preferred =
        dynasties.find((dynasty) => dynasty.id === equippedVariant?.dynastyId) ??
        dynasties.find((dynasty) => dynasty.name === 'PRIMAL') ??
        dynasties[0];
      setActiveDynasty(preferred.id);
    }
  }, [
    activeDynastyId,
    dynasties,
    equippedSnakeId,
    ownedSnakes,
    variants,
    setActiveDynasty,
  ]);

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

  // The main Lab presents breeding as forward lineage progression: only the
  // highest generation of each variant is active here. The full `ownedSnakes`
  // array remains intact for pedigree, history and the Breeding Lab.
  const currentDynastyOwned = useMemo(() => {
    if (!activeDynastyId) return [];
    const dynastyVariantIds = new Set(
      variants.filter((v) => v.dynastyId === activeDynastyId).map((v) => v.id)
    );
    return highestGenerationSnakes(
      ownedSnakes.filter(
        (s) => s.snakeVariantId && dynastyVariantIds.has(s.snakeVariantId)
      )
    );
  }, [ownedSnakes, variants, activeDynastyId]);

  // Calculate completion stats per dynasty. `owned` is the number of
  // DISTINCT variants collected - the sticker book has one slot per variant,
  // so counting rows made a player with 43 snakes across 11 variants read
  // "43/11 (391%)". `snakes` carries only active highest-generation builds;
  // lower generations are pedigree/history, not parallel playable copies.
  const completionByDynasty = useMemo(() => {
    const completion: Record<string, DynastyCompletion> = {};

    for (const dynasty of dynasties) {
      const dynastyVariants = variants.filter((v) => v.dynastyId === dynasty.id);
      const dynastyVariantIds = new Set(dynastyVariants.map((v) => v.id));
      const dynastySnakes = ownedSnakes.filter(
        (s) => s.snakeVariantId && dynastyVariantIds.has(s.snakeVariantId)
      );

      const activeSnakes = highestGenerationSnakes(dynastySnakes);
      completion[dynasty.id] = {
        owned: distinctVariantCount(dynastySnakes),
        total: dynastyVariants.length,
        snakes: activeSnakes.length,
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
    async (
      variantId: string,
      { equip = true }: { equip?: boolean } = {}
    ): Promise<OwnedSnake | null> => {
      setUnlocking(true);
      setUnlockError(null);

      // Find the variant for optimistic update
      const variant = variants.find((v) => v.id === variantId);
      if (!variant) {
        setUnlockError('Variant not found');
        setUnlocking(false);
        return null;
      }

      // Store previous state for rollback
      const previousOwnedSnakes = [...ownedSnakes];
      const previousDnaBalance = dnaBalance;
      const previousEquippedId = equippedSnakeId;

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
        isEquipped: equip,
        isFavorited: false,
      };

      // Apply optimistic update
      setOwnedSnakes([
        ...previousOwnedSnakes.map((snake) =>
          equip ? { ...snake, isEquipped: false } : snake
        ),
        optimisticSnake,
      ]);
      if (equip) setEquippedSnakeId(optimisticSnake.id);
      setDnaBalance(Math.max(0, dnaBalance - variant.unlockCostDna));

      try {
        const response = await fetch('/api/collection', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${session?.access_token}`,
          },
          body: JSON.stringify({ variantId, equip }),
        });

        const data: UnlockResponse = await response.json();

        if (!response.ok || !data.success) {
          throw new Error(data.error ?? 'Failed to unlock variant');
        }

        if (!data.snake) throw new Error('Unlock returned incomplete snake data');

        const becameEquipped = data.equipped === true && data.snake.isEquipped;
        setOwnedSnakes([
          ...previousOwnedSnakes.map((snake) =>
            becameEquipped ? { ...snake, isEquipped: false } : snake
          ),
          data.snake,
        ]);
        if (becameEquipped) setEquippedSnakeId(data.snake.id);

        // Update DNA balance with server value
        if (data.newDnaBalance !== undefined) {
          setDnaBalance(data.newDnaBalance);
        }

        // Close the modal on success
        closeUnlockModal();
        return data.snake;
      } catch (err) {
        // Rollback optimistic update
        setOwnedSnakes(previousOwnedSnakes);
        setDnaBalance(previousDnaBalance);
        setEquippedSnakeId(previousEquippedId);

        const message = err instanceof Error ? err.message : 'Failed to unlock variant';
        setUnlockError(message);
        return null;
      } finally {
        setUnlocking(false);
      }
    },
    [
      session?.access_token,
      variants,
      ownedSnakes,
      dnaBalance,
      equippedSnakeId,
      setOwnedSnakes,
      setEquippedSnakeId,
      setDnaBalance,
      setUnlocking,
      setUnlockError,
      closeUnlockModal,
    ]
  );

  const equipSnake = useCallback(
    async (snakeId: string): Promise<boolean> => {
      setEquipping(true);
      setEquipError(null);

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

        // Adopt the server's row. It carries the wide variant join, so
        // traitSlots and lineage arrive correct rather than staying whatever
        // the optimistic copy happened to hold. Absent only when the equip
        // committed but the re-read failed, in which case the optimistic
        // projection above is already right.
        const serverRow = data.equippedSnake;
        if (serverRow) {
          setOwnedSnakes(
            previousOwnedSnakes.map((snake) =>
              snake.id === serverRow.id
                ? serverRow
                : { ...snake, isEquipped: false }
            )
          );
          setEquippedSnakeId(serverRow.id);
        }

        // The sheet stays open: the player wants to see "Equipped" flip and
        // to keep comparing this variant's siblings.
        return true;
      } catch (err) {
        // Rollback optimistic update
        setEquippedSnakeId(previousEquippedId);
        setOwnedSnakes(previousOwnedSnakes);

        const message = err instanceof Error ? err.message : 'Failed to equip snake';
        setEquipError(message);
        return false;
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
      setEquipError,
    ]
  );

  /**
   * Favoriting is a display preference, but not a cosmetic one: the roster
   * rule ranks favorited snakes second, so the heart decides which snake
   * represents its variant on the collection card. It persists.
   */
  const toggleFavorite = useCallback(
    async (snakeId: string, favorited: boolean): Promise<boolean> => {
      const previousOwnedSnakes = [...ownedSnakes];

      setOwnedSnakes(
        ownedSnakes.map((snake) =>
          snake.id === snakeId ? { ...snake, isFavorited: favorited } : snake
        )
      );

      try {
        const response = await fetch('/api/collection/favorite', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${session?.access_token}`,
          },
          body: JSON.stringify({ snakeId, favorited }),
        });

        const data: FavoriteResponse = await response.json();
        if (!response.ok || !data.success) {
          throw new Error(data.error ?? 'Failed to update favorite');
        }
        return true;
      } catch {
        setOwnedSnakes(previousOwnedSnakes);
        return false;
      }
    },
    [session?.access_token, ownedSnakes, setOwnedSnakes]
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
    equipError,

    // Actions
    setActiveDynasty,
    openDetailModal,
    selectOwnedSnake,
    closeDetailModal,
    openUnlockModal,
    closeUnlockModal,
    unlockVariant,
    equipSnake,
    toggleFavorite,
    refresh,
  };
}

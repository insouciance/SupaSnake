/**
 * Collection Store - Zustand state management for snake collection
 *
 * State: dynasties, variants, ownedSnakes, equippedSnakeId
 * Actions: setters, mutations, async fetches
 * Selectors: getVariantsByDynasty, isVariantOwned, getEquippedSnake
 */

import { create } from 'zustand';
import type { Dynasty, SnakeVariant, OwnedSnake } from '@/shared/types/snake-data-model';
import { sanitizeLineage, startingStrainPoints } from '@/shared/game/lineage';
import { sanitizeTraits } from '@/shared/game/traits';
import type { StrainPoints } from '@/shared/game/strains';

// =============================================================================
// TYPES
// =============================================================================

interface CollectionUIState {
  // Navigation
  activeDynastyId: string | null;

  // Modal state
  selectedVariant: SnakeVariant | null;
  selectedOwned: OwnedSnake | null;
  isDetailModalOpen: boolean;
  isUnlockModalOpen: boolean;

  // Loading states
  isUnlocking: boolean;
  isEquipping: boolean;

  // Error state
  unlockError: string | null;
  /**
   * Equip failures live here, NOT in the page-wide `error`. That banner
   * offers a "Retry" that refetches the whole collection — the wrong
   * affordance for "this one snake would not equip", and the reason a single
   * failure used to surface twice.
   */
  equipError: string | null;
}

interface CollectionState extends CollectionUIState {
  // Data
  dynasties: Dynasty[];
  variants: SnakeVariant[];
  ownedSnakes: OwnedSnake[];
  equippedSnakeId: string | null;
  dnaBalance: number;

  // UI State (general)
  isLoading: boolean;
  error: string | null;

  // Setters
  setDynasties: (dynasties: Dynasty[]) => void;
  setVariants: (variants: SnakeVariant[]) => void;
  setOwnedSnakes: (snakes: OwnedSnake[]) => void;
  setEquippedSnakeId: (id: string | null) => void;
  setDnaBalance: (balance: number) => void;
  setLoading: (loading: boolean) => void;
  setError: (error: string | null) => void;

  // UI Actions
  setActiveDynasty: (dynastyId: string) => void;
  openDetailModal: (variant: SnakeVariant, owned: OwnedSnake) => void;
  /** Switch the open detail sheet to a sibling of the same variant. */
  selectOwnedSnake: (owned: OwnedSnake) => void;
  closeDetailModal: () => void;
  openUnlockModal: (variant: SnakeVariant) => void;
  closeUnlockModal: () => void;
  setUnlocking: (loading: boolean) => void;
  setEquipping: (loading: boolean) => void;
  setUnlockError: (error: string | null) => void;
  setEquipError: (error: string | null) => void;

  // Mutations
  addOwnedSnake: (snake: OwnedSnake) => void;
  updateOwnedSnake: (id: string, updates: Partial<OwnedSnake>) => void;

  // Selectors (computed)
  getVariantsByDynasty: (dynastyId: string) => SnakeVariant[];
  isVariantOwned: (variantId: string) => boolean;
  getEquippedSnake: () => OwnedSnake | null;
  getDynastyById: (id: string) => Dynasty | undefined;
  getVariantById: (id: string) => SnakeVariant | undefined;
  getStartingStrains: (snakeId: string) => StrainPoints;
}

// =============================================================================
// INITIAL STATE (exported for testing)
// =============================================================================

export const initialState = {
  // Data
  dynasties: [] as Dynasty[],
  variants: [] as SnakeVariant[],
  ownedSnakes: [] as OwnedSnake[],
  equippedSnakeId: null as string | null,
  dnaBalance: 0,

  // General UI state
  isLoading: false,
  error: null as string | null,

  // Collection UI state
  activeDynastyId: null as string | null,
  selectedVariant: null as SnakeVariant | null,
  selectedOwned: null as OwnedSnake | null,
  isDetailModalOpen: false,
  isUnlockModalOpen: false,
  isUnlocking: false,
  isEquipping: false,
  unlockError: null as string | null,
  equipError: null as string | null,
};

// =============================================================================
// STORE
// =============================================================================

export const useCollectionStore = create<CollectionState>((set, get) => ({
  // Initial state
  ...initialState,

  // Setters
  setDynasties: (dynasties) => set({ dynasties }),
  setVariants: (variants) => set({ variants }),
  setOwnedSnakes: (ownedSnakes) => set({ ownedSnakes }),
  setEquippedSnakeId: (equippedSnakeId) => set({ equippedSnakeId }),
  setDnaBalance: (dnaBalance) => set({ dnaBalance }),
  setLoading: (isLoading) => set({ isLoading }),
  setError: (error) => set({ error }),

  // UI Actions
  setActiveDynasty: (dynastyId) => set({ activeDynastyId: dynastyId }),

  openDetailModal: (variant, owned) =>
    set({
      selectedVariant: variant,
      selectedOwned: owned,
      isDetailModalOpen: true,
      equipError: null,
    }),

  selectOwnedSnake: (owned) => set({ selectedOwned: owned, equipError: null }),

  closeDetailModal: () =>
    set({
      isDetailModalOpen: false,
      selectedVariant: null,
      selectedOwned: null,
      equipError: null,
    }),

  openUnlockModal: (variant) =>
    set({
      selectedVariant: variant,
      isUnlockModalOpen: true,
      unlockError: null,
    }),

  closeUnlockModal: () =>
    set({
      isUnlockModalOpen: false,
      selectedVariant: null,
      unlockError: null,
    }),

  setUnlocking: (isUnlocking) => set({ isUnlocking }),
  setEquipping: (isEquipping) => set({ isEquipping }),
  setUnlockError: (unlockError) => set({ unlockError }),
  setEquipError: (equipError) => set({ equipError }),

  // Mutations
  addOwnedSnake: (snake) =>
    set((state) => ({
      ownedSnakes: [...state.ownedSnakes, snake],
    })),

  updateOwnedSnake: (id, updates) =>
    set((state) => ({
      ownedSnakes: state.ownedSnakes.map((snake) =>
        snake.id === id ? { ...snake, ...updates } : snake
      ),
      selectedOwned:
        state.selectedOwned?.id === id
          ? { ...state.selectedOwned, ...updates }
          : state.selectedOwned,
    })),

  // Selectors
  getVariantsByDynasty: (dynastyId) => {
    const { variants } = get();
    return variants.filter((v) => v.dynastyId === dynastyId);
  },

  isVariantOwned: (variantId) => {
    const { ownedSnakes } = get();
    return ownedSnakes.some((s) => s.snakeVariantId === variantId);
  },

  getEquippedSnake: () => {
    const { ownedSnakes, equippedSnakeId } = get();
    if (!equippedSnakeId) return null;
    return ownedSnakes.find((s) => s.id === equippedSnakeId) || null;
  },

  getDynastyById: (id) => {
    const { dynasties } = get();
    return dynasties.find((d) => d.id === id);
  },

  getVariantById: (id) => {
    const { variants } = get();
    return variants.find((v) => v.id === id);
  },

  getStartingStrains: (snakeId) => {
    const snake = get().ownedSnakes.find((entry) => entry.id === snakeId);
    if (!snake) return {};
    return startingStrainPoints(
      sanitizeLineage(snake.lineage),
      sanitizeTraits(snake.traits)
    );
  },
}));

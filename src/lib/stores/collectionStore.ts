/**
 * Collection Store - Zustand state management for snake collection
 *
 * State: dynasties, variants, ownedSnakes, equippedSnakeId
 * Actions: setters, mutations, async fetches
 * Selectors: getVariantsByDynasty, isVariantOwned, getEquippedSnake
 */

import { create } from 'zustand';
import type { Dynasty, SnakeVariant, OwnedSnake } from '@/shared/types/snake-data-model';

// =============================================================================
// TYPES
// =============================================================================

interface CollectionState {
  // Data
  dynasties: Dynasty[];
  variants: SnakeVariant[];
  ownedSnakes: OwnedSnake[];
  equippedSnakeId: string | null;

  // UI State
  isLoading: boolean;
  error: string | null;

  // Setters
  setDynasties: (dynasties: Dynasty[]) => void;
  setVariants: (variants: SnakeVariant[]) => void;
  setOwnedSnakes: (snakes: OwnedSnake[]) => void;
  setEquippedSnakeId: (id: string | null) => void;
  setLoading: (loading: boolean) => void;
  setError: (error: string | null) => void;

  // Mutations
  addOwnedSnake: (snake: OwnedSnake) => void;
  updateOwnedSnake: (id: string, updates: Partial<OwnedSnake>) => void;

  // Selectors (computed)
  getVariantsByDynasty: (dynastyId: string) => SnakeVariant[];
  isVariantOwned: (variantId: string) => boolean;
  getEquippedSnake: () => OwnedSnake | null;
  getDynastyById: (id: string) => Dynasty | undefined;
  getVariantById: (id: string) => SnakeVariant | undefined;
}

// =============================================================================
// INITIAL STATE (exported for testing)
// =============================================================================

export const initialState = {
  dynasties: [] as Dynasty[],
  variants: [] as SnakeVariant[],
  ownedSnakes: [] as OwnedSnake[],
  equippedSnakeId: null as string | null,
  isLoading: false,
  error: null as string | null,
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
  setLoading: (isLoading) => set({ isLoading }),
  setError: (error) => set({ error }),

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
}));

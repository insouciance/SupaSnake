/**
 * Breeding Store - Zustand state management for the breeding screen
 *
 * State: selected parent snake ids, picker modal state, breeding-in-flight,
 *        last offspring result (drives the reveal animation)
 * Actions: parent selection, picker open/close, breeding lifecycle, reset
 */

import { create } from 'zustand';
import type { Rarity } from '@/shared/types/snake-data-model';

// =============================================================================
// TYPES
// =============================================================================

export type ParentSlotNumber = 1 | 2;

/** Offspring payload from POST /api/breeding, kept for the reveal screen. */
export interface BredOffspring {
  id: string;
  snakeVariantId: string;
  variantName: string;
  dynastyName: string | null;
  rarity: Rarity | null;
  generation: number;
  dnaCost: number | null;
  /** Inherited traits rolled server-side (slot order - reroll targets a slot). */
  traits: string[];
  /** Trait slot count for the offspring (section 6.1). */
  traitSlots: number | null;
}

interface BreedingState {
  // Parent selection (collected_snakes ids)
  parent1Id: string | null;
  parent2Id: string | null;

  // Picker modal: which slot is being picked (null = closed)
  pickerSlot: ParentSlotNumber | null;

  // Breeding lifecycle
  isBreeding: boolean;
  breedError: string | null;

  // Last successful breeding (non-null shows the reveal)
  lastOffspring: BredOffspring | null;

  // Actions
  setParent: (slot: ParentSlotNumber, snakeId: string | null) => void;
  clearParents: () => void;
  openPicker: (slot: ParentSlotNumber) => void;
  closePicker: () => void;
  setBreeding: (isBreeding: boolean) => void;
  setBreedError: (error: string | null) => void;
  setLastOffspring: (offspring: BredOffspring | null) => void;
  reset: () => void;
}

// =============================================================================
// INITIAL STATE (exported for testing)
// =============================================================================

export const initialState = {
  parent1Id: null as string | null,
  parent2Id: null as string | null,
  pickerSlot: null as ParentSlotNumber | null,
  isBreeding: false,
  breedError: null as string | null,
  lastOffspring: null as BredOffspring | null,
};

// =============================================================================
// STORE
// =============================================================================

export const useBreedingStore = create<BreedingState>((set) => ({
  // Initial state
  ...initialState,

  // Actions
  setParent: (slot, snakeId) =>
    set((state) => {
      if (slot === 1) {
        return {
          parent1Id: snakeId,
          // The same snake cannot fill both slots
          parent2Id: snakeId !== null && state.parent2Id === snakeId ? null : state.parent2Id,
        };
      }
      return {
        parent2Id: snakeId,
        parent1Id: snakeId !== null && state.parent1Id === snakeId ? null : state.parent1Id,
      };
    }),

  clearParents: () => set({ parent1Id: null, parent2Id: null }),

  openPicker: (slot) => set({ pickerSlot: slot }),
  closePicker: () => set({ pickerSlot: null }),

  setBreeding: (isBreeding) => set({ isBreeding }),
  setBreedError: (breedError) => set({ breedError }),
  setLastOffspring: (lastOffspring) => set({ lastOffspring }),

  reset: () => set({ ...initialState }),
}));

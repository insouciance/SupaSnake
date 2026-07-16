/**
 * Breeding Store Tests
 */

import { useBreedingStore, initialState, type BredOffspring } from './breedingStore';

// Reset store between tests
beforeEach(() => {
  useBreedingStore.setState(initialState);
});

const mockOffspring: BredOffspring = {
  id: 'child-1',
  snakeVariantId: 'variant-1',
  variantName: 'CYBER SPARK',
  dynastyName: 'CYBER',
  rarity: 'common',
  generation: 2,
  dnaCost: 300,
};

// =============================================================================
// STATE INITIALIZATION
// =============================================================================

describe('Breeding Store - State', () => {
  it('should have correct initial state', () => {
    const state = useBreedingStore.getState();

    expect(state.parent1Id).toBeNull();
    expect(state.parent2Id).toBeNull();
    expect(state.pickerSlot).toBeNull();
    expect(state.isBreeding).toBe(false);
    expect(state.breedError).toBeNull();
    expect(state.lastOffspring).toBeNull();
  });
});

// =============================================================================
// PARENT SELECTION
// =============================================================================

describe('Breeding Store - Parent Selection', () => {
  it('should set parent 1 and parent 2 independently', () => {
    useBreedingStore.getState().setParent(1, 'snake-a');
    useBreedingStore.getState().setParent(2, 'snake-b');

    const state = useBreedingStore.getState();
    expect(state.parent1Id).toBe('snake-a');
    expect(state.parent2Id).toBe('snake-b');
  });

  it('should clear a slot when set to null', () => {
    useBreedingStore.getState().setParent(1, 'snake-a');
    useBreedingStore.getState().setParent(1, null);

    expect(useBreedingStore.getState().parent1Id).toBeNull();
  });

  it('should evict parent 2 when the same snake is chosen for slot 1', () => {
    useBreedingStore.getState().setParent(2, 'snake-a');
    useBreedingStore.getState().setParent(1, 'snake-a');

    const state = useBreedingStore.getState();
    expect(state.parent1Id).toBe('snake-a');
    expect(state.parent2Id).toBeNull();
  });

  it('should evict parent 1 when the same snake is chosen for slot 2', () => {
    useBreedingStore.getState().setParent(1, 'snake-a');
    useBreedingStore.getState().setParent(2, 'snake-a');

    const state = useBreedingStore.getState();
    expect(state.parent2Id).toBe('snake-a');
    expect(state.parent1Id).toBeNull();
  });

  it('should not evict the other slot when clearing with null', () => {
    useBreedingStore.getState().setParent(1, 'snake-a');
    useBreedingStore.getState().setParent(2, 'snake-b');
    useBreedingStore.getState().setParent(1, null);

    const state = useBreedingStore.getState();
    expect(state.parent1Id).toBeNull();
    expect(state.parent2Id).toBe('snake-b');
  });

  it('should clear both parents', () => {
    useBreedingStore.getState().setParent(1, 'snake-a');
    useBreedingStore.getState().setParent(2, 'snake-b');
    useBreedingStore.getState().clearParents();

    const state = useBreedingStore.getState();
    expect(state.parent1Id).toBeNull();
    expect(state.parent2Id).toBeNull();
  });
});

// =============================================================================
// PICKER MODAL
// =============================================================================

describe('Breeding Store - Picker Modal', () => {
  it('should open the picker for a specific slot', () => {
    useBreedingStore.getState().openPicker(2);
    expect(useBreedingStore.getState().pickerSlot).toBe(2);
  });

  it('should close the picker', () => {
    useBreedingStore.getState().openPicker(1);
    useBreedingStore.getState().closePicker();
    expect(useBreedingStore.getState().pickerSlot).toBeNull();
  });
});

// =============================================================================
// BREEDING LIFECYCLE
// =============================================================================

describe('Breeding Store - Breeding Lifecycle', () => {
  it('should track breeding-in-flight', () => {
    useBreedingStore.getState().setBreeding(true);
    expect(useBreedingStore.getState().isBreeding).toBe(true);

    useBreedingStore.getState().setBreeding(false);
    expect(useBreedingStore.getState().isBreeding).toBe(false);
  });

  it('should set and clear breed errors', () => {
    useBreedingStore.getState().setBreedError('Insufficient DNA');
    expect(useBreedingStore.getState().breedError).toBe('Insufficient DNA');

    useBreedingStore.getState().setBreedError(null);
    expect(useBreedingStore.getState().breedError).toBeNull();
  });

  it('should store the last offspring result', () => {
    useBreedingStore.getState().setLastOffspring(mockOffspring);
    expect(useBreedingStore.getState().lastOffspring).toEqual(mockOffspring);

    useBreedingStore.getState().setLastOffspring(null);
    expect(useBreedingStore.getState().lastOffspring).toBeNull();
  });

  it('should reset everything to initial state', () => {
    const store = useBreedingStore.getState();
    store.setParent(1, 'snake-a');
    store.setParent(2, 'snake-b');
    store.openPicker(1);
    store.setBreeding(true);
    store.setBreedError('oops');
    store.setLastOffspring(mockOffspring);

    useBreedingStore.getState().reset();

    const state = useBreedingStore.getState();
    expect(state.parent1Id).toBeNull();
    expect(state.parent2Id).toBeNull();
    expect(state.pickerSlot).toBeNull();
    expect(state.isBreeding).toBe(false);
    expect(state.breedError).toBeNull();
    expect(state.lastOffspring).toBeNull();
  });
});

/**
 * Collection Store Tests
 */

import { useCollectionStore, initialState } from './collectionStore';
import type { Dynasty, SnakeVariant, OwnedSnake } from '@/shared/types/snake-data-model';

// Reset store between tests
beforeEach(() => {
  useCollectionStore.setState(initialState);
});

// =============================================================================
// STATE INITIALIZATION
// =============================================================================

describe('Collection Store - State', () => {
  it('should have correct initial state', () => {
    const state = useCollectionStore.getState();

    expect(state.dynasties).toEqual([]);
    expect(state.variants).toEqual([]);
    expect(state.ownedSnakes).toEqual([]);
    expect(state.equippedSnakeId).toBeNull();
    expect(state.isLoading).toBe(false);
    expect(state.error).toBeNull();
  });
});

// =============================================================================
// SETTERS
// =============================================================================

describe('Collection Store - Setters', () => {
  it('should set dynasties', () => {
    const mockDynasties: Dynasty[] = [
      {
        id: 'd1',
        name: 'CYBER',
        displayName: 'Cyber Dynasty',
        description: 'Digital realm',
        colorPrimary: '#00FFFF',
        colorSecondary: '#FF00FF',
        statBonusType: 'speed',
        statBonusValue: 0.05,
        sortOrder: 1,
        isActive: true,
        createdAt: '2025-01-22T00:00:00Z',
        updatedAt: '2025-01-22T00:00:00Z',
      },
    ];

    useCollectionStore.getState().setDynasties(mockDynasties);
    expect(useCollectionStore.getState().dynasties).toEqual(mockDynasties);
  });

  it('should set variants', () => {
    const mockVariants: SnakeVariant[] = [
      {
        id: 'v1',
        dynastyId: 'd1',
        name: 'CYBER SPARK',
        rarity: 'common',
        loreText: 'Digital snake',
        artUrl: null,
        baseStats: { speed: 10, size: 5, hp: 100 },
        unlockCostDna: 500,
        isStarter: false,
        sortOrder: 1,
        isActive: true,
        createdAt: '2025-01-22T00:00:00Z',
        updatedAt: '2025-01-22T00:00:00Z',
      },
    ];

    useCollectionStore.getState().setVariants(mockVariants);
    expect(useCollectionStore.getState().variants).toEqual(mockVariants);
  });

  it('should set owned snakes', () => {
    const mockSnakes: OwnedSnake[] = [
      {
        id: 's1',
        playerId: 'p1',
        variantId: 'CYBER SPARK',
        snakeVariantId: 'v1',
        generation: 1,
        parent1Id: null,
        parent2Id: null,
        acquiredAt: '2025-01-22T00:00:00Z',
        acquiredMethod: 'tutorial',
        isEquipped: true,
        isFavorited: false,
      },
    ];

    useCollectionStore.getState().setOwnedSnakes(mockSnakes);
    expect(useCollectionStore.getState().ownedSnakes).toEqual(mockSnakes);
  });

  it('should set equipped snake id', () => {
    useCollectionStore.getState().setEquippedSnakeId('snake-123');
    expect(useCollectionStore.getState().equippedSnakeId).toBe('snake-123');
  });

  it('should set loading state', () => {
    useCollectionStore.getState().setLoading(true);
    expect(useCollectionStore.getState().isLoading).toBe(true);
  });

  it('should set error', () => {
    useCollectionStore.getState().setError('Test error');
    expect(useCollectionStore.getState().error).toBe('Test error');
  });
});

// =============================================================================
// MUTATIONS
// =============================================================================

describe('Collection Store - Mutations', () => {
  it('should add owned snake', () => {
    const newSnake: OwnedSnake = {
      id: 's1',
      playerId: 'p1',
      variantId: 'CYBER SPARK',
      snakeVariantId: 'v1',
      generation: 1,
      parent1Id: null,
      parent2Id: null,
      acquiredAt: '2025-01-22T00:00:00Z',
      acquiredMethod: 'unlocked',
      isEquipped: false,
      isFavorited: false,
    };

    useCollectionStore.getState().addOwnedSnake(newSnake);
    expect(useCollectionStore.getState().ownedSnakes).toContainEqual(newSnake);
  });

  it('should update owned snake', () => {
    const snake: OwnedSnake = {
      id: 's1',
      playerId: 'p1',
      variantId: 'CYBER SPARK',
      snakeVariantId: 'v1',
      generation: 1,
      parent1Id: null,
      parent2Id: null,
      acquiredAt: '2025-01-22T00:00:00Z',
      acquiredMethod: 'unlocked',
      isEquipped: false,
      isFavorited: false,
    };

    useCollectionStore.setState({ ownedSnakes: [snake] });
    useCollectionStore.getState().updateOwnedSnake('s1', { isFavorited: true });

    const updated = useCollectionStore.getState().ownedSnakes[0];
    expect(updated.isFavorited).toBe(true);
  });
});

// =============================================================================
// SELECTORS
// =============================================================================

describe('Collection Store - Selectors', () => {
  const mockDynasties: Dynasty[] = [
    {
      id: 'd1',
      name: 'CYBER',
      displayName: 'Cyber Dynasty',
      description: 'Digital realm',
      colorPrimary: '#00FFFF',
      colorSecondary: '#FF00FF',
      statBonusType: 'speed',
      statBonusValue: 0.05,
      sortOrder: 1,
      isActive: true,
      createdAt: '2025-01-22T00:00:00Z',
      updatedAt: '2025-01-22T00:00:00Z',
    },
    {
      id: 'd2',
      name: 'PRIMAL',
      displayName: 'Primal Dynasty',
      description: 'Nature realm',
      colorPrimary: '#00FF00',
      colorSecondary: '#008800',
      statBonusType: 'dna_generation',
      statBonusValue: 0.1,
      sortOrder: 2,
      isActive: true,
      createdAt: '2025-01-22T00:00:00Z',
      updatedAt: '2025-01-22T00:00:00Z',
    },
  ];

  const mockVariants: SnakeVariant[] = [
    {
      id: 'v1',
      dynastyId: 'd1',
      name: 'CYBER SPARK',
      rarity: 'common',
      loreText: null,
      artUrl: null,
      baseStats: { speed: 10, size: 5, hp: 100 },
      unlockCostDna: 0,
      isStarter: true,
      sortOrder: 1,
      isActive: true,
      createdAt: '2025-01-22T00:00:00Z',
      updatedAt: '2025-01-22T00:00:00Z',
    },
    {
      id: 'v2',
      dynastyId: 'd1',
      name: 'CYBER PULSE',
      rarity: 'common',
      loreText: null,
      artUrl: null,
      baseStats: { speed: 12, size: 4, hp: 90 },
      unlockCostDna: 500,
      isStarter: false,
      sortOrder: 2,
      isActive: true,
      createdAt: '2025-01-22T00:00:00Z',
      updatedAt: '2025-01-22T00:00:00Z',
    },
    {
      id: 'v3',
      dynastyId: 'd2',
      name: 'PRIMAL FANG',
      rarity: 'common',
      loreText: null,
      artUrl: null,
      baseStats: { speed: 8, size: 7, hp: 120 },
      unlockCostDna: 0,
      isStarter: true,
      sortOrder: 1,
      isActive: true,
      createdAt: '2025-01-22T00:00:00Z',
      updatedAt: '2025-01-22T00:00:00Z',
    },
  ];

  const mockOwnedSnakes: OwnedSnake[] = [
    {
      id: 's1',
      playerId: 'p1',
      variantId: 'CYBER SPARK',
      snakeVariantId: 'v1',
      generation: 1,
      parent1Id: null,
      parent2Id: null,
      acquiredAt: '2025-01-22T00:00:00Z',
      acquiredMethod: 'tutorial',
      isEquipped: true,
      isFavorited: false,
    },
  ];

  beforeEach(() => {
    useCollectionStore.setState({
      dynasties: mockDynasties,
      variants: mockVariants,
      ownedSnakes: mockOwnedSnakes,
      equippedSnakeId: 's1',
    });
  });

  it('should get variants by dynasty', () => {
    const cyberVariants = useCollectionStore.getState().getVariantsByDynasty('d1');
    expect(cyberVariants).toHaveLength(2);
    expect(cyberVariants[0].name).toBe('CYBER SPARK');
  });

  it('should check if variant is owned', () => {
    const isOwned = useCollectionStore.getState().isVariantOwned('v1');
    const isNotOwned = useCollectionStore.getState().isVariantOwned('v2');

    expect(isOwned).toBe(true);
    expect(isNotOwned).toBe(false);
  });

  it('should get equipped snake', () => {
    const equipped = useCollectionStore.getState().getEquippedSnake();
    expect(equipped?.id).toBe('s1');
  });

  it('should return null when no snake is equipped', () => {
    useCollectionStore.setState({ equippedSnakeId: null });
    const equipped = useCollectionStore.getState().getEquippedSnake();
    expect(equipped).toBeNull();
  });

  it('should get dynasty by id', () => {
    const dynasty = useCollectionStore.getState().getDynastyById('d1');
    expect(dynasty?.name).toBe('CYBER');
  });

  it('should get variant by id', () => {
    const variant = useCollectionStore.getState().getVariantById('v1');
    expect(variant?.name).toBe('CYBER SPARK');
  });
});

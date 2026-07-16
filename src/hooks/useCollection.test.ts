import { renderHook, act, waitFor } from '@testing-library/react';
import { useCollection } from './useCollection';
import { useCollectionStore } from '@/lib/stores/collectionStore';
import type { Dynasty, SnakeVariant, OwnedSnake } from '@/shared/types/snake-data-model';

// =============================================================================
// MOCKS
// =============================================================================

// Mock the collection store
jest.mock('@/lib/stores/collectionStore', () => ({
  useCollectionStore: jest.fn(),
}));

// Mock the auth provider - useCollection reads `session` for API auth headers
const TEST_TOKEN = 'test-token';
jest.mock('@/lib/auth/AuthProvider', () => ({
  useAuth: () => ({
    session: { access_token: 'test-token' },
    user: { id: 'test-user' },
    isLoading: false,
    isAuthenticated: true,
  }),
}));

const AUTH_HEADERS = { headers: { Authorization: `Bearer ${TEST_TOKEN}` } };

// Mock fetch globally
const mockFetch = jest.fn();
global.fetch = mockFetch;

// =============================================================================
// TEST DATA
// =============================================================================

const mockDynasties: Dynasty[] = [
  {
    id: 'dynasty-1',
    name: 'CYBER',
    displayName: 'Cyber Dynasty',
    description: 'Digital realm snakes',
    colorPrimary: '#00FFFF',
    colorSecondary: '#FF00FF',
    statBonusType: 'speed',
    statBonusValue: 0.05,
    sortOrder: 1,
    isActive: true,
    createdAt: '2024-01-01T00:00:00Z',
    updatedAt: '2024-01-01T00:00:00Z',
  },
  {
    id: 'dynasty-2',
    name: 'PRIMAL',
    displayName: 'Primal Dynasty',
    description: 'Ancient earth snakes',
    colorPrimary: '#2d5016',
    colorSecondary: '#8b4513',
    statBonusType: 'size',
    statBonusValue: 0.05,
    sortOrder: 2,
    isActive: true,
    createdAt: '2024-01-01T00:00:00Z',
    updatedAt: '2024-01-01T00:00:00Z',
  },
];

const mockVariants: SnakeVariant[] = [
  {
    id: 'variant-1',
    dynastyId: 'dynasty-1',
    name: 'CYBER SPARK',
    rarity: 'common',
    loreText: 'A spark of digital energy',
    artUrl: null,
    baseStats: { speed: 10, size: 5, hp: 100 },
    unlockCostDna: 0,
    isStarter: true,
    sortOrder: 1,
    isActive: true,
    createdAt: '2024-01-01T00:00:00Z',
    updatedAt: '2024-01-01T00:00:00Z',
  },
  {
    id: 'variant-2',
    dynastyId: 'dynasty-1',
    name: 'CYBER SURGE',
    rarity: 'uncommon',
    loreText: 'A surge of digital power',
    artUrl: null,
    baseStats: { speed: 12, size: 5, hp: 100 },
    unlockCostDna: 100,
    isStarter: false,
    sortOrder: 2,
    isActive: true,
    createdAt: '2024-01-01T00:00:00Z',
    updatedAt: '2024-01-01T00:00:00Z',
  },
  {
    id: 'variant-3',
    dynastyId: 'dynasty-2',
    name: 'PRIMAL SEED',
    rarity: 'common',
    loreText: 'From ancient roots',
    artUrl: null,
    baseStats: { speed: 10, size: 6, hp: 100 },
    unlockCostDna: 0,
    isStarter: true,
    sortOrder: 1,
    isActive: true,
    createdAt: '2024-01-01T00:00:00Z',
    updatedAt: '2024-01-01T00:00:00Z',
  },
];

const mockOwnedSnakes: OwnedSnake[] = [
  {
    id: 'owned-1',
    playerId: 'player-1',
    variantId: 'CYBER SPARK',
    snakeVariantId: 'variant-1',
    generation: 1,
    parent1Id: null,
    parent2Id: null,
    acquiredAt: '2024-01-01T00:00:00Z',
    acquiredMethod: 'tutorial',
    isEquipped: true,
    isFavorited: false,
  },
  {
    id: 'owned-2',
    playerId: 'player-1',
    variantId: 'PRIMAL SEED',
    snakeVariantId: 'variant-3',
    generation: 1,
    parent1Id: null,
    parent2Id: null,
    acquiredAt: '2024-01-02T00:00:00Z',
    acquiredMethod: 'unlock',
    isEquipped: false,
    isFavorited: true,
  },
];

// =============================================================================
// STORE MOCK FACTORY
// =============================================================================

interface MockStore {
  dynasties: Dynasty[];
  variants: SnakeVariant[];
  ownedSnakes: OwnedSnake[];
  equippedSnakeId: string | null;
  dnaBalance: number;
  activeDynastyId: string | null;
  selectedVariant: SnakeVariant | null;
  selectedOwned: OwnedSnake | null;
  isDetailModalOpen: boolean;
  isUnlockModalOpen: boolean;
  isLoading: boolean;
  error: string | null;
  setDynasties: jest.Mock;
  setVariants: jest.Mock;
  setOwnedSnakes: jest.Mock;
  setEquippedSnakeId: jest.Mock;
  setDnaBalance: jest.Mock;
  setLoading: jest.Mock;
  setError: jest.Mock;
  setActiveDynasty: jest.Mock;
  openDetailModal: jest.Mock;
  closeDetailModal: jest.Mock;
  openUnlockModal: jest.Mock;
  closeUnlockModal: jest.Mock;
  setUnlocking: jest.Mock;
  setEquipping: jest.Mock;
  setUnlockError: jest.Mock;
  addOwnedSnake: jest.Mock;
  updateOwnedSnake: jest.Mock;
}

function createMockStore(overrides: Partial<MockStore> = {}): MockStore {
  const store: MockStore = {
    // Data
    dynasties: [],
    variants: [],
    ownedSnakes: [],
    equippedSnakeId: null,
    dnaBalance: 500,

    // UI State
    activeDynastyId: null,
    selectedVariant: null,
    selectedOwned: null,
    isDetailModalOpen: false,
    isUnlockModalOpen: false,
    isLoading: false,
    error: null,

    // Setters
    setDynasties: jest.fn(),
    setVariants: jest.fn(),
    setOwnedSnakes: jest.fn(),
    setEquippedSnakeId: jest.fn(),
    setDnaBalance: jest.fn(),
    setLoading: jest.fn(),
    setError: jest.fn(),

    // UI Actions
    setActiveDynasty: jest.fn(),
    openDetailModal: jest.fn(),
    closeDetailModal: jest.fn(),
    openUnlockModal: jest.fn(),
    closeUnlockModal: jest.fn(),
    setUnlocking: jest.fn(),
    setEquipping: jest.fn(),
    setUnlockError: jest.fn(),

    // Mutations
    addOwnedSnake: jest.fn(),
    updateOwnedSnake: jest.fn(),

    ...overrides,
  };

  return store;
}

// =============================================================================
// TESTS
// =============================================================================

describe('fetchDynasties', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should fetch dynasties from API', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({ dynasties: mockDynasties }),
    });

    const response = await fetch('/api/dynasties');
    const data = await response.json();

    expect(mockFetch).toHaveBeenCalledWith('/api/dynasties');
    expect(data.dynasties).toEqual(mockDynasties);
  });

  it('should throw error on failed fetch', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      json: () => Promise.resolve({}),
    });

    const response = await fetch('/api/dynasties');
    expect(response.ok).toBe(false);
  });
});

describe('fetchVariants', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should fetch variants from API', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({ variants: mockVariants }),
    });

    const response = await fetch('/api/variants');
    const data = await response.json();

    expect(mockFetch).toHaveBeenCalledWith('/api/variants');
    expect(data.variants).toEqual(mockVariants);
  });

  it('should throw error on failed fetch', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      json: () => Promise.resolve({}),
    });

    const response = await fetch('/api/variants');
    expect(response.ok).toBe(false);
  });
});

describe('fetchCollection', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should fetch collection from API', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () =>
        Promise.resolve({ snakes: mockOwnedSnakes, dnaBalance: 500 }),
    });

    const response = await fetch('/api/collection');
    const data = await response.json();

    expect(mockFetch).toHaveBeenCalledWith('/api/collection');
    expect(data.snakes).toEqual(mockOwnedSnakes);
    expect(data.dnaBalance).toBe(500);
  });

  it('should handle missing dnaBalance', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({ snakes: [] }),
    });

    const response = await fetch('/api/collection');
    const data = await response.json();

    expect(data.snakes).toEqual([]);
    expect(data.dnaBalance).toBeUndefined();
  });

  it('should throw error on failed fetch', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      json: () => Promise.resolve({}),
    });

    const response = await fetch('/api/collection');
    expect(response.ok).toBe(false);
  });
});

describe('useCollection', () => {
  let mockStore: MockStore;

  beforeEach(() => {
    jest.clearAllMocks();
    mockStore = createMockStore();
    (useCollectionStore as jest.Mock).mockImplementation((selector?: unknown) => {
      if (typeof selector === 'function') {
        return (selector as (state: MockStore) => unknown)(mockStore);
      }
      return mockStore;
    });
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('initialization', () => {
    it('should fetch dynasties, variants, and collection on mount', async () => {
      mockFetch
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve({ dynasties: mockDynasties }),
        })
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve({ variants: mockVariants }),
        })
        .mockResolvedValueOnce({
          ok: true,
          json: () =>
            Promise.resolve({ snakes: mockOwnedSnakes, dnaBalance: 500 }),
        });

      renderHook(() => useCollection());

      await waitFor(() => {
        expect(mockFetch).toHaveBeenCalledWith('/api/dynasties', AUTH_HEADERS);
        expect(mockFetch).toHaveBeenCalledWith('/api/variants', AUTH_HEADERS);
        expect(mockFetch).toHaveBeenCalledWith('/api/collection', AUTH_HEADERS);
      });
    });

    it('should set loading state during fetch', async () => {
      mockFetch.mockImplementation(
        () =>
          new Promise((resolve) =>
            setTimeout(
              () =>
                resolve({
                  ok: true,
                  json: () => Promise.resolve({ dynasties: [] }),
                }),
              100
            )
          )
      );

      renderHook(() => useCollection());

      expect(mockStore.setLoading).toHaveBeenCalledWith(true);
    });

    it('should set error state on fetch failure', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        json: () => Promise.resolve({}),
      });

      renderHook(() => useCollection());

      await waitFor(() => {
        expect(mockStore.setError).toHaveBeenCalledWith(
          'Failed to fetch dynasties'
        );
      });
    });

    it('should auto-select first dynasty if none active', () => {
      // Create a store with dynasties already loaded but no active dynasty
      const storeWithDynasties = createMockStore({
        dynasties: mockDynasties,
        activeDynastyId: null,
      });

      (useCollectionStore as jest.Mock).mockImplementation((selector?: unknown) => {
        if (typeof selector === 'function') {
          return (selector as (state: MockStore) => unknown)(storeWithDynasties);
        }
        return storeWithDynasties;
      });

      // Mock fetch to avoid interference
      mockFetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ dynasties: [], variants: [], snakes: [] }),
      });

      renderHook(() => useCollection());

      // The useEffect should auto-select first dynasty
      expect(storeWithDynasties.setActiveDynasty).toHaveBeenCalledWith('dynasty-1');
    });
  });

  describe('derived data', () => {
    it('should return currentDynastyVariants filtered by activeDynastyId', () => {
      const storeWithData = createMockStore({
        dynasties: mockDynasties,
        variants: mockVariants,
        ownedSnakes: mockOwnedSnakes,
        activeDynastyId: 'dynasty-1',
      });

      (useCollectionStore as jest.Mock).mockImplementation((selector?: unknown) => {
        if (typeof selector === 'function') {
          return (selector as (state: MockStore) => unknown)(storeWithData);
        }
        return storeWithData;
      });

      // Mock fetch to avoid extra calls
      mockFetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ dynasties: [], variants: [], snakes: [] }),
      });

      const { result } = renderHook(() => useCollection());

      expect(result.current.currentDynastyVariants).toHaveLength(2);
      expect(result.current.currentDynastyVariants[0].id).toBe('variant-1');
      expect(result.current.currentDynastyVariants[1].id).toBe('variant-2');
    });

    it('should return currentDynastyOwned filtered by dynasty', () => {
      const storeWithData = createMockStore({
        dynasties: mockDynasties,
        variants: mockVariants,
        ownedSnakes: mockOwnedSnakes,
        activeDynastyId: 'dynasty-1',
      });

      (useCollectionStore as jest.Mock).mockImplementation((selector?: unknown) => {
        if (typeof selector === 'function') {
          return (selector as (state: MockStore) => unknown)(storeWithData);
        }
        return storeWithData;
      });

      mockFetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ dynasties: [], variants: [], snakes: [] }),
      });

      const { result } = renderHook(() => useCollection());

      expect(result.current.currentDynastyOwned).toHaveLength(1);
      expect(result.current.currentDynastyOwned[0].id).toBe('owned-1');
    });

    it('should calculate completionByDynasty correctly', () => {
      const storeWithData = createMockStore({
        dynasties: mockDynasties,
        variants: mockVariants,
        ownedSnakes: mockOwnedSnakes,
      });

      (useCollectionStore as jest.Mock).mockImplementation((selector?: unknown) => {
        if (typeof selector === 'function') {
          return (selector as (state: MockStore) => unknown)(storeWithData);
        }
        return storeWithData;
      });

      mockFetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ dynasties: [], variants: [], snakes: [] }),
      });

      const { result } = renderHook(() => useCollection());

      expect(result.current.completionByDynasty).toEqual({
        'dynasty-1': { owned: 1, total: 2 },
        'dynasty-2': { owned: 1, total: 1 },
      });
    });

    it('should return equippedSnake when equippedSnakeId is set', () => {
      const storeWithData = createMockStore({
        ownedSnakes: mockOwnedSnakes,
        equippedSnakeId: 'owned-1',
      });

      (useCollectionStore as jest.Mock).mockImplementation((selector?: unknown) => {
        if (typeof selector === 'function') {
          return (selector as (state: MockStore) => unknown)(storeWithData);
        }
        return storeWithData;
      });

      mockFetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ dynasties: [], variants: [], snakes: [] }),
      });

      const { result } = renderHook(() => useCollection());

      expect(result.current.equippedSnake).toEqual(mockOwnedSnakes[0]);
    });

    it('should return null for equippedSnake when none equipped', () => {
      const storeWithData = createMockStore({
        ownedSnakes: mockOwnedSnakes,
        equippedSnakeId: null,
      });

      (useCollectionStore as jest.Mock).mockImplementation((selector?: unknown) => {
        if (typeof selector === 'function') {
          return (selector as (state: MockStore) => unknown)(storeWithData);
        }
        return storeWithData;
      });

      mockFetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ dynasties: [], variants: [], snakes: [] }),
      });

      const { result } = renderHook(() => useCollection());

      expect(result.current.equippedSnake).toBeNull();
    });

    it('should return empty currentDynastyVariants when no activeDynastyId', () => {
      const storeWithData = createMockStore({
        variants: mockVariants,
        activeDynastyId: null,
      });

      (useCollectionStore as jest.Mock).mockImplementation((selector?: unknown) => {
        if (typeof selector === 'function') {
          return (selector as (state: MockStore) => unknown)(storeWithData);
        }
        return storeWithData;
      });

      mockFetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ dynasties: [], variants: [], snakes: [] }),
      });

      const { result } = renderHook(() => useCollection());

      expect(result.current.currentDynastyVariants).toHaveLength(0);
    });
  });

  describe('unlockVariant', () => {
    it('should make POST request to unlock endpoint', async () => {
      const storeWithData = createMockStore({
        variants: mockVariants,
        ownedSnakes: [],
        dnaBalance: 500,
      });

      (useCollectionStore as jest.Mock).mockImplementation((selector?: unknown) => {
        if (typeof selector === 'function') {
          return (selector as (state: MockStore) => unknown)(storeWithData);
        }
        return storeWithData;
      });

      mockFetch
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve({ dynasties: [] }),
        })
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve({ variants: [] }),
        })
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve({ snakes: [], dnaBalance: 500 }),
        })
        .mockResolvedValueOnce({
          ok: true,
          json: () =>
            Promise.resolve({
              success: true,
              snake: {
                id: 'new-owned-1',
                playerId: 'player-1',
                variantId: 'CYBER SURGE',
                snakeVariantId: 'variant-2',
                generation: 1,
                parent1Id: null,
                parent2Id: null,
                acquiredAt: '2024-01-03T00:00:00Z',
                acquiredMethod: 'unlock',
                isEquipped: false,
                isFavorited: false,
              },
              newDnaBalance: 400,
            }),
        });

      const { result } = renderHook(() => useCollection());

      await waitFor(() => {
        expect(mockFetch).toHaveBeenCalledTimes(3);
      });

      await act(async () => {
        await result.current.unlockVariant('variant-2');
      });

      expect(mockFetch).toHaveBeenCalledWith('/api/collection', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${TEST_TOKEN}`,
        },
        body: JSON.stringify({ variantId: 'variant-2' }),
      });
    });

    it('should apply optimistic update before API call', async () => {
      const storeWithData = createMockStore({
        variants: mockVariants,
        ownedSnakes: [],
        dnaBalance: 500,
      });

      (useCollectionStore as jest.Mock).mockImplementation((selector?: unknown) => {
        if (typeof selector === 'function') {
          return (selector as (state: MockStore) => unknown)(storeWithData);
        }
        return storeWithData;
      });

      // Set up initial fetches
      mockFetch
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve({ dynasties: [] }),
        })
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve({ variants: [] }),
        })
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve({ snakes: [], dnaBalance: 500 }),
        })
        .mockImplementationOnce(
          () =>
            new Promise((resolve) =>
              setTimeout(
                () =>
                  resolve({
                    ok: true,
                    json: () =>
                      Promise.resolve({
                        success: true,
                        snake: { id: 'new-snake' },
                        newDnaBalance: 400,
                      }),
                  }),
                100
              )
            )
        );

      const { result } = renderHook(() => useCollection());

      await waitFor(() => {
        expect(mockFetch).toHaveBeenCalledTimes(3);
      });

      act(() => {
        result.current.unlockVariant('variant-2');
      });

      // Optimistic update should call addOwnedSnake immediately
      expect(storeWithData.addOwnedSnake).toHaveBeenCalled();
      expect(storeWithData.setDnaBalance).toHaveBeenCalled();
    });

    it('should rollback on API failure', async () => {
      const storeWithData = createMockStore({
        variants: mockVariants,
        ownedSnakes: mockOwnedSnakes,
        dnaBalance: 500,
      });

      (useCollectionStore as jest.Mock).mockImplementation((selector?: unknown) => {
        if (typeof selector === 'function') {
          return (selector as (state: MockStore) => unknown)(storeWithData);
        }
        return storeWithData;
      });

      mockFetch
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve({ dynasties: [] }),
        })
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve({ variants: [] }),
        })
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve({ snakes: mockOwnedSnakes, dnaBalance: 500 }),
        })
        .mockResolvedValueOnce({
          ok: false,
          json: () =>
            Promise.resolve({
              success: false,
              error: 'Insufficient DNA',
            }),
        });

      const { result } = renderHook(() => useCollection());

      await waitFor(() => {
        expect(mockFetch).toHaveBeenCalledTimes(3);
      });

      await act(async () => {
        await result.current.unlockVariant('variant-2');
      });

      // Should rollback by calling setOwnedSnakes with original data
      expect(storeWithData.setOwnedSnakes).toHaveBeenLastCalledWith(
        mockOwnedSnakes
      );
      expect(storeWithData.setUnlockError).toHaveBeenCalledWith(
        'Insufficient DNA'
      );
    });

    it('should set error when variant not found', async () => {
      const storeWithData = createMockStore({
        variants: [],
        ownedSnakes: [],
      });

      (useCollectionStore as jest.Mock).mockImplementation((selector?: unknown) => {
        if (typeof selector === 'function') {
          return (selector as (state: MockStore) => unknown)(storeWithData);
        }
        return storeWithData;
      });

      mockFetch
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve({ dynasties: [] }),
        })
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve({ variants: [] }),
        })
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve({ snakes: [], dnaBalance: 0 }),
        });

      const { result } = renderHook(() => useCollection());

      await waitFor(() => {
        expect(mockFetch).toHaveBeenCalledTimes(3);
      });

      await act(async () => {
        await result.current.unlockVariant('non-existent');
      });

      expect(storeWithData.setUnlockError).toHaveBeenCalledWith(
        'Variant not found'
      );
    });
  });

  describe('equipSnake', () => {
    it('should make POST request to equip endpoint', async () => {
      const storeWithData = createMockStore({
        ownedSnakes: mockOwnedSnakes,
        equippedSnakeId: 'owned-1',
      });

      (useCollectionStore as jest.Mock).mockImplementation((selector?: unknown) => {
        if (typeof selector === 'function') {
          return (selector as (state: MockStore) => unknown)(storeWithData);
        }
        return storeWithData;
      });

      mockFetch
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve({ dynasties: [] }),
        })
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve({ variants: [] }),
        })
        .mockResolvedValueOnce({
          ok: true,
          json: () =>
            Promise.resolve({ snakes: mockOwnedSnakes, dnaBalance: 500 }),
        })
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve({ success: true }),
        });

      const { result } = renderHook(() => useCollection());

      await waitFor(() => {
        expect(mockFetch).toHaveBeenCalledTimes(3);
      });

      await act(async () => {
        await result.current.equipSnake('owned-2');
      });

      expect(mockFetch).toHaveBeenCalledWith('/api/collection/equip', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${TEST_TOKEN}`,
        },
        body: JSON.stringify({ snakeId: 'owned-2' }),
      });
    });

    it('should apply optimistic update for equip', async () => {
      const storeWithData = createMockStore({
        ownedSnakes: mockOwnedSnakes,
        equippedSnakeId: 'owned-1',
      });

      (useCollectionStore as jest.Mock).mockImplementation((selector?: unknown) => {
        if (typeof selector === 'function') {
          return (selector as (state: MockStore) => unknown)(storeWithData);
        }
        return storeWithData;
      });

      mockFetch
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve({ dynasties: [] }),
        })
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve({ variants: [] }),
        })
        .mockResolvedValueOnce({
          ok: true,
          json: () =>
            Promise.resolve({ snakes: mockOwnedSnakes, dnaBalance: 500 }),
        })
        .mockImplementationOnce(
          () =>
            new Promise((resolve) =>
              setTimeout(
                () =>
                  resolve({
                    ok: true,
                    json: () => Promise.resolve({ success: true }),
                  }),
                100
              )
            )
        );

      const { result } = renderHook(() => useCollection());

      await waitFor(() => {
        expect(mockFetch).toHaveBeenCalledTimes(3);
      });

      act(() => {
        result.current.equipSnake('owned-2');
      });

      // Optimistic update should set equipped ID immediately
      expect(storeWithData.setEquippedSnakeId).toHaveBeenCalledWith('owned-2');
    });

    it('should rollback equip on API failure', async () => {
      const storeWithData = createMockStore({
        ownedSnakes: mockOwnedSnakes,
        equippedSnakeId: 'owned-1',
      });

      (useCollectionStore as jest.Mock).mockImplementation((selector?: unknown) => {
        if (typeof selector === 'function') {
          return (selector as (state: MockStore) => unknown)(storeWithData);
        }
        return storeWithData;
      });

      mockFetch
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve({ dynasties: [] }),
        })
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve({ variants: [] }),
        })
        .mockResolvedValueOnce({
          ok: true,
          json: () =>
            Promise.resolve({ snakes: mockOwnedSnakes, dnaBalance: 500 }),
        })
        .mockResolvedValueOnce({
          ok: false,
          json: () =>
            Promise.resolve({ success: false, error: 'Snake not owned' }),
        });

      const { result } = renderHook(() => useCollection());

      await waitFor(() => {
        expect(mockFetch).toHaveBeenCalledTimes(3);
      });

      await act(async () => {
        await result.current.equipSnake('owned-2');
      });

      // Should rollback to original equipped snake
      expect(storeWithData.setEquippedSnakeId).toHaveBeenLastCalledWith(
        'owned-1'
      );
      expect(storeWithData.setError).toHaveBeenCalledWith('Snake not owned');
    });
  });

  describe('refresh', () => {
    it('should refetch all data when called', async () => {
      const storeWithData = createMockStore();

      (useCollectionStore as jest.Mock).mockImplementation((selector?: unknown) => {
        if (typeof selector === 'function') {
          return (selector as (state: MockStore) => unknown)(storeWithData);
        }
        return storeWithData;
      });

      mockFetch
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve({ dynasties: mockDynasties }),
        })
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve({ variants: mockVariants }),
        })
        .mockResolvedValueOnce({
          ok: true,
          json: () =>
            Promise.resolve({ snakes: mockOwnedSnakes, dnaBalance: 500 }),
        });

      const { result } = renderHook(() => useCollection());

      await waitFor(() => {
        expect(mockFetch).toHaveBeenCalledTimes(3);
      });

      // Reset mock for refresh call
      mockFetch.mockClear();
      mockFetch
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve({ dynasties: mockDynasties }),
        })
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve({ variants: mockVariants }),
        })
        .mockResolvedValueOnce({
          ok: true,
          json: () =>
            Promise.resolve({ snakes: mockOwnedSnakes, dnaBalance: 600 }),
        });

      await act(async () => {
        await result.current.refresh();
      });

      expect(mockFetch).toHaveBeenCalledTimes(3);
      expect(storeWithData.setDynasties).toHaveBeenCalledWith(mockDynasties);
      expect(storeWithData.setVariants).toHaveBeenCalledWith(mockVariants);
      expect(storeWithData.setOwnedSnakes).toHaveBeenCalledWith(mockOwnedSnakes);
    });
  });

  describe('UI actions', () => {
    it('should pass through setActiveDynasty from store', () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ dynasties: [], variants: [], snakes: [] }),
      });

      const { result } = renderHook(() => useCollection());

      act(() => {
        result.current.setActiveDynasty('dynasty-2');
      });

      expect(mockStore.setActiveDynasty).toHaveBeenCalledWith('dynasty-2');
    });

    it('should pass through modal actions from store', () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ dynasties: [], variants: [], snakes: [] }),
      });

      const { result } = renderHook(() => useCollection());

      act(() => {
        result.current.openDetailModal(mockVariants[0], mockOwnedSnakes[0]);
      });
      expect(mockStore.openDetailModal).toHaveBeenCalledWith(
        mockVariants[0],
        mockOwnedSnakes[0]
      );

      act(() => {
        result.current.closeDetailModal();
      });
      expect(mockStore.closeDetailModal).toHaveBeenCalled();

      act(() => {
        result.current.openUnlockModal(mockVariants[1]);
      });
      expect(mockStore.openUnlockModal).toHaveBeenCalledWith(mockVariants[1]);

      act(() => {
        result.current.closeUnlockModal();
      });
      expect(mockStore.closeUnlockModal).toHaveBeenCalled();
    });
  });

  describe('edge cases', () => {
    it('should handle empty collection data', async () => {
      mockFetch
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve({ dynasties: [] }),
        })
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve({ variants: [] }),
        })
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve({ snakes: [], dnaBalance: 0 }),
        });

      const { result } = renderHook(() => useCollection());

      await waitFor(() => {
        expect(mockStore.setDynasties).toHaveBeenCalledWith([]);
        expect(mockStore.setVariants).toHaveBeenCalledWith([]);
        expect(mockStore.setOwnedSnakes).toHaveBeenCalledWith([]);
      });

      expect(result.current.completionByDynasty).toEqual({});
    });

    it('should handle missing dnaBalance in response', async () => {
      mockFetch
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve({ dynasties: [] }),
        })
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve({ variants: [] }),
        })
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve({ snakes: [] }), // No dnaBalance
        });

      renderHook(() => useCollection());

      await waitFor(() => {
        expect(mockStore.setOwnedSnakes).toHaveBeenCalledWith([]);
      });

      // Should default to 0
      expect(mockStore.setDnaBalance).toHaveBeenCalledWith(0);
    });

    it('should handle network errors gracefully', async () => {
      mockFetch.mockRejectedValueOnce(new Error('Network error'));

      renderHook(() => useCollection());

      await waitFor(() => {
        expect(mockStore.setError).toHaveBeenCalledWith('Network error');
      });
    });

    it('should sort currentDynastyVariants by sortOrder', () => {
      const unsortedVariants: SnakeVariant[] = [
        { ...mockVariants[1], sortOrder: 2 },
        { ...mockVariants[0], sortOrder: 1 },
      ];

      const storeWithData = createMockStore({
        dynasties: mockDynasties,
        variants: unsortedVariants,
        activeDynastyId: 'dynasty-1',
      });

      (useCollectionStore as jest.Mock).mockImplementation((selector?: unknown) => {
        if (typeof selector === 'function') {
          return (selector as (state: MockStore) => unknown)(storeWithData);
        }
        return storeWithData;
      });

      mockFetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ dynasties: [], variants: [], snakes: [] }),
      });

      const { result } = renderHook(() => useCollection());

      expect(result.current.currentDynastyVariants[0].sortOrder).toBe(1);
      expect(result.current.currentDynastyVariants[1].sortOrder).toBe(2);
    });
  });
});

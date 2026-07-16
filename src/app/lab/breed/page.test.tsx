/**
 * Breeding Lab Page Tests
 * Render tests with mocked auth/collection/toast and fetch.
 */

import { render, screen, waitFor, fireEvent, within } from '@testing-library/react';
import '@testing-library/jest-dom';

import { useBreedingStore, initialState as breedingInitialState } from '@/lib/stores/breedingStore';
import {
  useCollectionStore,
  initialState as collectionInitialState,
} from '@/lib/stores/collectionStore';
import type { OwnedSnake, SnakeVariant } from '@/shared/types/snake-data-model';

// =============================================================================
// MOCKS
// =============================================================================

// Auth: mutable impl so tests can swap auth state without resetModules
const authenticatedAuthState = () => ({
  isAuthenticated: true,
  isLoading: false,
  session: { access_token: 'test-token' },
});
let mockUseAuthImpl: () => object = authenticatedAuthState;

jest.mock('@/lib/auth/AuthProvider', () => ({
  useAuth: () => mockUseAuthImpl(),
}));

// Toast
const mockShowToast = jest.fn();
jest.mock('@/components/ui/Toast', () => ({
  useToast: () => ({ showToast: mockShowToast }),
}));

// Navigation (owned by another workstream; not under test)
jest.mock('@/components/ui/Navigation', () => ({
  Navigation: () => <nav data-testid="navigation" />,
}));

// next/link + next/navigation
jest.mock('next/link', () => {
  return function MockLink({ children, href }: { children: React.ReactNode; href: string }) {
    return <a href={href}>{children}</a>;
  };
});
jest.mock('next/navigation', () => ({
  usePathname: () => '/lab/breed',
  useRouter: () => ({ push: jest.fn() }),
}));

// Collection hook: driven per-test via mockCollection
const makeVariant = (id: string, name: string, dynastyId: string): SnakeVariant => ({
  id,
  dynastyId,
  name,
  rarity: 'common',
  loreText: null,
  artUrl: null,
  baseStats: { speed: 10, size: 5, hp: 100 },
  unlockCostDna: 0,
  isStarter: true,
  sortOrder: 1,
  isActive: true,
  createdAt: '2026-01-01T00:00:00Z',
  updatedAt: '2026-01-01T00:00:00Z',
});

const makeOwned = (
  id: string,
  snakeVariantId: string,
  generation: number,
  dynastyName: string,
  variantName: string
): OwnedSnake => ({
  id,
  playerId: 'player-1',
  variantId: variantName,
  snakeVariantId,
  generation,
  parent1Id: null,
  parent2Id: null,
  acquiredAt: '2026-01-01T00:00:00Z',
  acquiredMethod: 'tutorial',
  isEquipped: false,
  isFavorited: false,
  variantName,
  dynastyName,
});

const cyberVariantA = makeVariant('variant-a', 'CYBER SPARK', 'dyn-cyber');
const cyberVariantB = makeVariant('variant-b', 'CYBER PULSE', 'dyn-cyber');
const primalVariant = makeVariant('variant-c', 'PRIMAL SEED', 'dyn-primal');

const snakeA = makeOwned('snake-a', 'variant-a', 1, 'CYBER', 'CYBER SPARK');
const snakeB = makeOwned('snake-b', 'variant-b', 1, 'CYBER', 'CYBER PULSE');
const snakeC = makeOwned('snake-c', 'variant-c', 1, 'PRIMAL', 'PRIMAL SEED');

const mockCollection = {
  ownedSnakes: [snakeA, snakeB, snakeC],
  variants: [cyberVariantA, cyberVariantB, primalVariant],
  dnaBalance: 1000,
  isLoading: false,
};

jest.mock('@/hooks/useCollection', () => ({
  useCollection: () => mockCollection,
}));

import BreedPage from './page';

// =============================================================================
// SETUP
// =============================================================================

const emptyHistoryResponse = {
  ok: true,
  json: async () => ({ history: [] }),
};

beforeEach(() => {
  jest.clearAllMocks();
  mockUseAuthImpl = authenticatedAuthState;
  mockCollection.dnaBalance = 1000;
  useBreedingStore.setState(breedingInitialState);
  useCollectionStore.setState(collectionInitialState);
  global.fetch = jest.fn().mockResolvedValue(emptyHistoryResponse) as jest.Mock;
});

// =============================================================================
// RENDERING
// =============================================================================

describe('BreedPage - rendering', () => {
  it('renders two empty parent slots and a disabled breed button', async () => {
    render(<BreedPage />);

    expect(screen.getByTestId('parent-slot-1')).toBeInTheDocument();
    expect(screen.getByTestId('parent-slot-2')).toBeInTheDocument();
    expect(screen.getByTestId('breed-button')).toBeDisabled();
    expect(screen.getByTestId('breed-block-reason')).toHaveTextContent('Select two parents');

    await waitFor(() => {
      expect(screen.getByTestId('history-empty')).toBeInTheDocument();
    });
  });

  it('shows the DNA balance and the 50/50 variant hint', () => {
    render(<BreedPage />);

    expect(screen.getByTestId('breed-dna-balance')).toHaveTextContent('1,000');
    expect(screen.getByText(/50\/50 chance/i)).toBeInTheDocument();
  });

  it('shows sign-in prompt when not authenticated', () => {
    mockUseAuthImpl = () => ({
      isAuthenticated: false,
      isLoading: false,
      session: null,
    });

    render(<BreedPage />);

    expect(screen.getByText('Sign In to Play')).toBeInTheDocument();
  });

  it('fetches recent breedings with the bearer token and renders them', async () => {
    (global.fetch as jest.Mock).mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        history: [
          {
            id: 'history-1',
            dnaCost: 300,
            bredAt: '2026-07-01T10:00:00Z',
            parent1: { id: 'snake-a', generation: 1, variantName: 'CYBER SPARK', rarity: 'common' },
            parent2: { id: 'snake-b', generation: 1, variantName: 'CYBER PULSE', rarity: 'common' },
            child: { id: 'snake-x', generation: 2, variantName: 'CYBER PULSE', rarity: 'common' },
          },
        ],
      }),
    });

    render(<BreedPage />);

    await waitFor(() => {
      expect(screen.getByTestId('history-list')).toBeInTheDocument();
    });
    expect(screen.getByText('CYBER PULSE (Gen 2)')).toBeInTheDocument();
    expect(screen.getByText('CYBER SPARK × CYBER PULSE')).toBeInTheDocument();

    expect(global.fetch).toHaveBeenCalledWith('/api/breeding', {
      headers: { Authorization: 'Bearer test-token' },
    });
  });
});

// =============================================================================
// PARENT SELECTION + PREVIEW
// =============================================================================

describe('BreedPage - parent selection and preview', () => {
  it('shows cost and offspring generation when both parents are selected', () => {
    useBreedingStore.setState({ parent1Id: 'snake-a', parent2Id: 'snake-b' });

    render(<BreedPage />);

    expect(screen.getByTestId('breeding-cost')).toHaveTextContent('300');
    expect(screen.getByTestId('offspring-generation')).toHaveTextContent('Gen 2');
    expect(screen.getByTestId('breed-button')).toBeEnabled();
  });

  it('disables breeding when DNA is insufficient', () => {
    mockCollection.dnaBalance = 100;
    useBreedingStore.setState({ parent1Id: 'snake-a', parent2Id: 'snake-b' });

    render(<BreedPage />);

    expect(screen.getByTestId('breed-button')).toBeDisabled();
    expect(screen.getByTestId('breed-block-reason')).toHaveTextContent('Not enough DNA');
  });

  it('opens the picker and restricts parent 2 to the same dynasty', async () => {
    useBreedingStore.setState({ parent1Id: 'snake-a' });

    render(<BreedPage />);

    fireEvent.click(screen.getByTestId('parent-slot-2'));

    expect(screen.getByTestId('snake-picker')).toBeInTheDocument();
    // Same snake as parent 1 -> disabled
    expect(screen.getByTestId('picker-snake-snake-a')).toBeDisabled();
    // Same dynasty -> selectable
    expect(screen.getByTestId('picker-snake-snake-b')).toBeEnabled();
    // Other dynasty -> disabled
    expect(screen.getByTestId('picker-snake-snake-c')).toBeDisabled();

    fireEvent.click(screen.getByTestId('picker-snake-snake-b'));

    expect(useBreedingStore.getState().parent2Id).toBe('snake-b');
    expect(screen.queryByTestId('snake-picker')).not.toBeInTheDocument();
  });
});

// =============================================================================
// BREEDING
// =============================================================================

describe('BreedPage - breeding', () => {
  it('breeds successfully: reveal shown, offspring added, DNA updated', async () => {
    useBreedingStore.setState({ parent1Id: 'snake-a', parent2Id: 'snake-b' });

    (global.fetch as jest.Mock).mockImplementation(
      async (_url: string, options?: RequestInit) => {
        if (options?.method === 'POST') {
          return {
            ok: true,
            json: async () => ({
              success: true,
              child: {
                id: 'child-1',
                snake_variant_id: 'variant-b',
                variant: {
                  id: 'variant-b',
                  name: 'CYBER PULSE',
                  rarity: 'common',
                  dynasty_id: 'dyn-cyber',
                  dynasties: { name: 'CYBER' },
                },
                generation: 2,
              },
              cost: 300,
              remainingDna: 700,
            }),
          };
        }
        return emptyHistoryResponse;
      }
    );

    render(<BreedPage />);

    fireEvent.click(screen.getByTestId('breed-button'));

    await waitFor(() => {
      expect(screen.getByTestId('breeding-reveal')).toBeInTheDocument();
    });
    const reveal = within(screen.getByTestId('breeding-reveal'));
    expect(reveal.getByText('CYBER PULSE')).toBeInTheDocument();
    expect(reveal.getByText(/Generation 2/)).toBeInTheDocument();

    // Offspring added to collection store
    const owned = useCollectionStore.getState().ownedSnakes;
    expect(owned.some((s) => s.id === 'child-1' && s.acquiredMethod === 'bred')).toBe(true);

    // Server-authoritative DNA balance applied
    expect(useCollectionStore.getState().dnaBalance).toBe(700);

    // POST used the snake_case contract of the route
    expect(global.fetch).toHaveBeenCalledWith(
      '/api/breeding',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ parent1_id: 'snake-a', parent2_id: 'snake-b' }),
      })
    );

    // Reveal closes on continue
    fireEvent.click(screen.getByTestId('breeding-reveal-continue'));
    expect(screen.queryByTestId('breeding-reveal')).not.toBeInTheDocument();
  });

  it('shows an error toast when breeding fails', async () => {
    useBreedingStore.setState({ parent1Id: 'snake-a', parent2Id: 'snake-b' });

    (global.fetch as jest.Mock).mockImplementation(
      async (_url: string, options?: RequestInit) => {
        if (options?.method === 'POST') {
          return {
            ok: false,
            json: async () => ({ error: 'Insufficient DNA' }),
          };
        }
        return emptyHistoryResponse;
      }
    );

    render(<BreedPage />);

    fireEvent.click(screen.getByTestId('breed-button'));

    await waitFor(() => {
      expect(mockShowToast).toHaveBeenCalledWith('Insufficient DNA', 'error');
    });
    expect(screen.queryByTestId('breeding-reveal')).not.toBeInTheDocument();
    expect(useBreedingStore.getState().breedError).toBe('Insufficient DNA');
  });
});

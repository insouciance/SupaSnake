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
  mockCollection.ownedSnakes = [snakeA, snakeB, snakeC];
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

  it('shows the DNA balance and no coin-flip language (§8.2)', () => {
    render(<BreedPage />);

    expect(screen.getByTestId('breed-dna-balance')).toHaveTextContent('1,000');
    // The old "50/50 chance of taking either parent's variant" hint is
    // deleted: the variant line is drafted, not rolled.
    expect(screen.queryByText(/50\/50/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/chance/i)).not.toBeInTheDocument();
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

  it('opens the picker and allows a different-dynasty Genome parent', async () => {
    useBreedingStore.setState({ parent1Id: 'snake-a' });

    render(<BreedPage />);

    fireEvent.click(screen.getByTestId('parent-slot-2'));

    expect(screen.getByTestId('snake-picker')).toBeInTheDocument();
    // Same snake as parent 1 -> disabled
    expect(screen.getByTestId('picker-snake-snake-a')).toBeDisabled();
    // Same dynasty -> selectable
    expect(screen.getByTestId('picker-snake-snake-b')).toBeEnabled();
    // Genome lineage breeding also permits a cross-dynasty parent.
    expect(screen.getByTestId('picker-snake-snake-c')).toBeEnabled();

    fireEvent.click(screen.getByTestId('picker-snake-snake-c'));

    expect(useBreedingStore.getState().parent2Id).toBe('snake-c');
    expect(screen.queryByTestId('snake-picker')).not.toBeInTheDocument();
    expect(screen.getByTestId('breed-button')).toBeEnabled();
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

// =============================================================================
// THE DRAFT BOARD (Constitution §8.2)
// =============================================================================
//
// WP-1.05 replaced two suites here. The "trait inheritance preview" suite
// asserted 1/n odds per parent pool; the "offspring traits and reroll" suite
// walked the token-spending redraw. Both described the random system §8.2
// abolished, so they are deleted rather than adapted. What replaces them
// asserts the draft: the board comes from the server, choices are sent back,
// and the choices that were previewed are the choices that are paid for.

const DRAFT_FIXTURE = {
  parent1_id: 'snake-a',
  parent2_id: 'snake-b',
  cross_dynasty: false,
  generation: 2,
  dna_cost: 300,
  ascendance: { generation: 2, yield_bonus: 0, yield_multiplier: 1 },
  trait_pool: [
    { trait_id: 'sprinter', source: 'parent1' },
    { trait_id: 'hoarder', source: 'parent1' },
    { trait_id: 'ascetic', source: 'parent2' },
  ],
  variant_options: [
    {
      variant_id: 'variant-a',
      name: 'CYBER SPARK',
      rarity: 'common',
      dynasty_id: 'dyn-cyber',
      trait_slots: 1,
      lineage_options: [
        { kind: 'parent1', strains: ['VOLT'], strength: 1 },
        { kind: 'parent2', strains: ['AURUM'], strength: 1 },
      ],
    },
    {
      variant_id: 'variant-b',
      name: 'CYBER PULSE',
      rarity: 'legendary',
      dynasty_id: 'dyn-cyber',
      trait_slots: 2,
      lineage_options: [
        { kind: 'parent1', strains: ['VOLT'], strength: 2 },
        { kind: 'parent2', strains: ['AURUM'], strength: 2 },
      ],
    },
  ],
  defaults: {
    variant_id: 'variant-a',
    traits: ['sprinter'],
    lineage_kind: 'parent1',
  },
  preview: {
    variant_id: 'variant-a',
    rarity: 'common',
    generation: 2,
    trait_slots: 1,
    traits: ['sprinter'],
    lineage: { strains: ['VOLT'], strength: 1 },
    lineage_kind: 'parent1',
    dna_cost: 300,
  },
};

/** Serve the draft board, plus an optional breed response. */
function mockDraftFetch(
  draft: Record<string, unknown> = DRAFT_FIXTURE,
  breed?: Record<string, unknown>
): void {
  (global.fetch as jest.Mock).mockImplementation(
    async (url: string, options?: RequestInit) => {
      if (url === '/api/breeding/draft') {
        return { ok: true, json: async () => ({ success: true, draft }) };
      }
      if (url === '/api/breeding' && options?.method === 'POST') {
        return {
          ok: true,
          json: async () => breed ?? { success: false, error: 'no breed mock' },
        };
      }
      return emptyHistoryResponse;
    }
  );
}

describe('BreedPage - the draft board', () => {
  it('renders no board until both parents are chosen', () => {
    mockDraftFetch();
    useBreedingStore.setState({ parent1Id: 'snake-a' });
    render(<BreedPage />);
    expect(screen.queryByTestId('trait-draft')).not.toBeInTheDocument();
    expect(screen.queryByTestId('lineage-draft')).not.toBeInTheDocument();
  });

  it("offers both parents' variant lines, their traits, and their strains", async () => {
    mockDraftFetch();
    useBreedingStore.setState({ parent1Id: 'snake-a', parent2Id: 'snake-b' });
    render(<BreedPage />);

    await waitFor(() => {
      expect(screen.getByTestId('trait-draft')).toBeInTheDocument();
    });
    expect(screen.getByTestId('variant-option-variant-a')).toBeInTheDocument();
    expect(screen.getByTestId('variant-option-variant-b')).toBeInTheDocument();
    expect(screen.getByTestId('trait-option-sprinter')).toBeInTheDocument();
    expect(screen.getByTestId('trait-option-ascetic')).toBeInTheDocument();
    expect(screen.getByTestId('lineage-option-parent1')).toBeInTheDocument();
    expect(screen.getByTestId('lineage-option-parent2')).toBeInTheDocument();

    // The server's resolved preview drives the panel, not a client guess.
    expect(screen.getByTestId('breeding-cost')).toHaveTextContent('300');
    expect(screen.getByTestId('offspring-generation')).toHaveTextContent('Gen 2');
    // Selection state comes from preview.*, so it is always the server's.
    expect(screen.getByTestId('variant-option-variant-a')).toHaveAttribute(
      'aria-pressed',
      'true'
    );
    expect(screen.getByTestId('trait-option-sprinter')).toHaveAttribute(
      'aria-pressed',
      'true'
    );
    expect(screen.getByTestId('trait-option-ascetic')).toHaveAttribute(
      'aria-pressed',
      'false'
    );
  });

  it('sends a variant choice back to the draft endpoint', async () => {
    mockDraftFetch();
    useBreedingStore.setState({ parent1Id: 'snake-a', parent2Id: 'snake-b' });
    render(<BreedPage />);

    await waitFor(() => {
      expect(screen.getByTestId('variant-option-variant-b')).toBeInTheDocument();
    });
    fireEvent.click(screen.getByTestId('variant-option-variant-b'));

    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalledWith(
        '/api/breeding/draft',
        expect.objectContaining({
          body: expect.stringContaining('"variant_id":"variant-b"'),
        })
      );
    });
  });

  it('sends a trait draft back to the draft endpoint', async () => {
    mockDraftFetch();
    useBreedingStore.setState({ parent1Id: 'snake-a', parent2Id: 'snake-b' });
    render(<BreedPage />);

    await waitFor(() => {
      expect(screen.getByTestId('trait-option-ascetic')).toBeInTheDocument();
    });
    fireEvent.click(screen.getByTestId('trait-option-ascetic'));

    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalledWith(
        '/api/breeding/draft',
        expect.objectContaining({
          body: expect.stringContaining('"traits":["ascetic"]'),
        })
      );
    });
  });

  it('PAYS FOR EXACTLY WHAT WAS PREVIEWED', async () => {
    mockDraftFetch(DRAFT_FIXTURE, {
      success: true,
      child: {
        id: 'child-1',
        snake_variant_id: 'variant-a',
        variant: {
          id: 'variant-a',
          name: 'CYBER SPARK',
          rarity: 'common',
          dynasty_id: 'dyn-cyber',
          dynasties: { name: 'CYBER' },
        },
        generation: 2,
        traits: ['sprinter'],
        trait_slots: 1,
      },
      cost: 300,
      remainingDna: 700,
    });
    useBreedingStore.setState({ parent1Id: 'snake-a', parent2Id: 'snake-b' });
    render(<BreedPage />);

    await waitFor(() => {
      expect(screen.getByTestId('trait-draft')).toBeInTheDocument();
    });
    fireEvent.click(screen.getByTestId('breed-button'));

    await waitFor(() => {
      expect(screen.getByTestId('breeding-reveal')).toBeInTheDocument();
    });

    // The breed POST carries the previewed choices verbatim.
    expect(global.fetch).toHaveBeenCalledWith(
      '/api/breeding',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({
          parent1_id: 'snake-a',
          parent2_id: 'snake-b',
          variant_id: DRAFT_FIXTURE.preview.variant_id,
          traits: DRAFT_FIXTURE.preview.traits,
          lineage_kind: DRAFT_FIXTURE.preview.lineage_kind,
        }),
      })
    );

    // And the child the server returned is the child that was previewed.
    const child = useCollectionStore
      .getState()
      .ownedSnakes.find((s) => s.id === 'child-1');
    expect(child?.traits).toEqual(DRAFT_FIXTURE.preview.traits);
    expect(child?.snakeVariantId).toBe(DRAFT_FIXTURE.preview.variant_id);
    expect(child?.generation).toBe(DRAFT_FIXTURE.preview.generation);
  });

  it('offers no reroll anywhere on the page', async () => {
    mockDraftFetch();
    useBreedingStore.setState({ parent1Id: 'snake-a', parent2Id: 'snake-b' });
    render(<BreedPage />);

    await waitFor(() => {
      expect(screen.getByTestId('trait-draft')).toBeInTheDocument();
    });
    expect(screen.queryByText(/reroll/i)).not.toBeInTheDocument();
    expect(screen.queryByTestId('reroll-token-count')).not.toBeInTheDocument();
  });
});

describe('BreedPage - parent slot chips', () => {
  it('shows parent trait chips on the filled parent slots', () => {
    mockCollection.ownedSnakes = [
      { ...snakeA, traits: ['magnetism'], traitSlots: 1 },
      snakeB,
      snakeC,
    ];
    useBreedingStore.setState({ parent1Id: 'snake-a' });

    render(<BreedPage />);

    const slot = within(screen.getByTestId('parent-slot-1-traits'));
    expect(slot.getByTestId('trait-chip-magnetism')).toBeInTheDocument();
  });
});

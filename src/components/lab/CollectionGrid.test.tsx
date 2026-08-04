/**
 * CollectionGrid tests — WP-2.06.
 *
 * This file did not exist. Its absence is why a collection of 43 snakes
 * rendered 11 reachable snakes, all of them the wrong one, for as long as it
 * did. Every assertion below is aimed at that defect:
 *
 *   - 43 snakes across 11 variants render exactly 11 cards (one card per
 *     variant is the sticker book, and the fix must not turn it into a list);
 *   - the card shows the REPRESENTATIVE's generation, not the oldest snake's
 *     — the fixture is built newest-first exactly as /api/collection returns
 *     it, since that ordering is what made the old Map keep the Gen-1
 *     starter;
 *   - historical lower generations are not selectable inventory;
 *   - equal-generation top builds remain available.
 */

import React from 'react';
import { fireEvent, render, screen, within } from '@testing-library/react';
import { CollectionGrid } from './CollectionGrid';
import { dynastyThemes } from '@/hooks/useDynastyTheme';
import type { SnakeVariant, OwnedSnake } from '@/shared/types/snake-data-model';

const theme = dynastyThemes.PRIMAL;

function variant(index: number, overrides: Partial<SnakeVariant> = {}): SnakeVariant {
  return {
    id: `variant-${index}`,
    dynastyId: 'dynasty-1',
    name: `PRIMAL ${index}`,
    rarity: 'common',
    loreText: null,
    artUrl: null,
    baseStats: { speed: 10, size: 5, hp: 100 },
    unlockCostDna: 500,
    isStarter: index === 0,
    sortOrder: index,
    isActive: true,
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-01-01T00:00:00Z',
    ...overrides,
  };
}

function snake(overrides: Partial<OwnedSnake> & { id: string }): OwnedSnake {
  return {
    playerId: 'player-1',
    variantId: 'PRIMAL 0',
    snakeVariantId: 'variant-0',
    generation: 1,
    parent1Id: null,
    parent2Id: null,
    acquiredAt: '2026-01-01T00:00:00Z',
    acquiredMethod: 'bred',
    isEquipped: false,
    isFavorited: false,
    ...overrides,
  };
}

/**
 * The owner's actual shape: 43 snakes over 11 variants, newest first — the
 * order `/api/collection` returns (`.order('acquired_at', ascending: false)`).
 * Variant 0 carries the deep line: a Gen-1 starter acquired first, then
 * generations 2..33.
 */
function ownerCollection(): { variants: SnakeVariant[]; snakes: OwnedSnake[] } {
  const variants = Array.from({ length: 11 }, (_, index) => variant(index));
  const snakes: OwnedSnake[] = [];

  // Variant 0: 33 snakes, newest (Gen 33) first, Gen-1 starter last.
  for (let generation = 33; generation >= 1; generation -= 1) {
    snakes.push(
      snake({
        id: `v0-gen${generation}`,
        snakeVariantId: 'variant-0',
        generation,
        acquiredMethod: generation === 1 ? 'tutorial' : 'bred',
        acquiredAt: new Date(
          Date.UTC(2026, 0, 1) + generation * 86_400_000
        ).toISOString(),
      })
    );
  }

  // Variants 1..10: one snake each.
  for (let index = 1; index < 11; index += 1) {
    snakes.push(
      snake({
        id: `v${index}-gen1`,
        snakeVariantId: `variant-${index}`,
        variantId: `PRIMAL ${index}`,
        acquiredAt: '2026-01-01T00:00:00Z',
      })
    );
  }

  return { variants, snakes };
}

function renderGrid(
  props: Partial<React.ComponentProps<typeof CollectionGrid>> = {}
) {
  const onSelectVariant = jest.fn();
  const { variants, snakes } = ownerCollection();
  render(
    <CollectionGrid
      variants={variants}
      ownedSnakes={snakes}
      dynastyTheme={theme}
      onSelectVariant={onSelectVariant}
      isLoading={false}
      {...props}
    />
  );
  return { onSelectVariant, variants, snakes };
}

describe('CollectionGrid', () => {
  it('renders exactly one card per variant for 43 snakes across 11 variants', () => {
    const { snakes } = renderGrid();

    expect(snakes).toHaveLength(43);
    expect(screen.getAllByRole('button')).toHaveLength(11);
    expect(screen.getAllByRole('listitem')).toHaveLength(11);
  });

  it('shows the representative generation, not the oldest snake in the roster', () => {
    renderGrid();

    // The old Map overwrote on every set(), so with a newest-first feed the
    // LAST row seen — the Gen-1 starter — won and every card read "Gen 1".
    const card = screen.getByTestId('variant-card-variant-0');
    expect(within(card).getByText('Gen 33')).toBeInTheDocument();
    expect(within(card).queryByText('Gen 1')).not.toBeInTheDocument();
  });

  it('does not count historical lower generations as selectable snakes', () => {
    renderGrid();

    const card = screen.getByTestId('variant-card-variant-0');
    expect(card).toHaveAttribute(
      'aria-label',
      'PRIMAL 0, Generation 33, Yield multiplier 1.8114'
    );
    expect(within(card).queryByTestId('variant-card-roster-count')).toBeNull();
    expect(within(card).getByTestId('variant-card-generation-yield')).toHaveTextContent(
      'Payout ×1.8114'
    );
  });

  it('keeps distinct builds when they share the highest generation', () => {
    renderGrid({
      ownedSnakes: [
        snake({ id: 'old', generation: 4 }),
        snake({ id: 'top-a', generation: 11 }),
        snake({ id: 'top-b', generation: 11 }),
      ],
    });

    const card = screen.getByTestId('variant-card-variant-0');
    expect(card).toHaveAttribute(
      'aria-label',
      'PRIMAL 0, Generation 11, Yield multiplier 1.1717, 2 snakes owned'
    );
    expect(within(card).getByTestId('variant-card-roster-count')).toHaveTextContent('×2');
  });

  it('renders no count chip for a variant held once', () => {
    renderGrid();

    const card = screen.getByTestId('variant-card-variant-3');
    expect(card).toHaveAttribute(
      'aria-label',
      'PRIMAL 3, Generation 1, Yield multiplier 1.00'
    );
    expect(
      within(card).queryByTestId('variant-card-roster-count')
    ).not.toBeInTheDocument();
  });

  it('folds trait and lineage names into the card name (WP-2.07b)', () => {
    // The card is ONE button end to end, so its chips can never become
    // tap-to-explain triggers — a button inside a button is invalid and
    // unreachable. The names travel in the accessible name instead; the
    // effect and cost are one tap away in the detail sheet.
    renderGrid({
      ownedSnakes: [
        snake({
          id: 'v0-gen4',
          generation: 4,
          traits: ['scavenger'],
          lineage: { strains: ['AURUM'], strength: 1 },
        }),
      ],
    });

    const card = screen.getByTestId('variant-card-variant-0');
    expect(card).toHaveAttribute(
      'aria-label',
      'PRIMAL 0, Generation 4, Yield multiplier 1.02, Gold lineage, traits Scavenger'
    );
    expect(within(card).queryAllByRole('button')).toHaveLength(0);
  });

  it('hands only the highest generation to the main Lab selector', () => {
    const { onSelectVariant } = renderGrid();

    fireEvent.click(screen.getByTestId('variant-card-variant-0'));

    expect(onSelectVariant).toHaveBeenCalledTimes(1);
    const [selectedVariant, roster] = onSelectVariant.mock.calls[0];
    expect(selectedVariant.id).toBe('variant-0');
    expect(roster).toHaveLength(1);
    expect(roster[0].generation).toBe(33);
  });

  it('hands an empty roster for a locked variant so the caller opens unlock', () => {
    const { onSelectVariant } = renderGrid({ ownedSnakes: [] });

    fireEvent.click(screen.getByTestId('variant-card-variant-2'));

    expect(onSelectVariant).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'variant-2' }),
      []
    );
  });

  it('does not expose an equipped historical generation as the card representative', () => {
    renderGrid({ equippedSnakeId: 'v0-gen1' });

    const card = screen.getByTestId('variant-card-variant-0');
    expect(within(card).getByText('Gen 33')).toBeInTheDocument();
    expect(card).toHaveAttribute(
      'aria-label',
      'PRIMAL 0, Generation 33, Yield multiplier 1.8114'
    );
  });

  it('labels locked cards with their DNA cost, unchanged', () => {
    renderGrid({ ownedSnakes: [] });

    expect(screen.getByTestId('variant-card-variant-4')).toHaveAttribute(
      'aria-label',
      'PRIMAL 4, Locked, 500 DNA to unlock'
    );
  });

  it('uses list semantics, not the invalid role="grid"', () => {
    renderGrid();

    expect(
      screen.getByRole('list', { name: 'Snake variant collection' })
    ).toBeInTheDocument();
    expect(screen.queryByRole('grid')).not.toBeInTheDocument();
  });

  it('renders empty slots alongside the cards', () => {
    renderGrid({ emptySlotCount: 3 });

    expect(screen.getAllByRole('listitem')).toHaveLength(14);
  });

  it('shows the skeleton while loading and the empty state with nothing to show', () => {
    const { unmount } = render(
      <CollectionGrid
        variants={[]}
        ownedSnakes={[]}
        dynastyTheme={theme}
        onSelectVariant={jest.fn()}
        isLoading
      />
    );
    expect(screen.getByLabelText('Loading collection')).toBeInTheDocument();
    unmount();

    render(
      <CollectionGrid
        variants={[]}
        ownedSnakes={[]}
        dynastyTheme={theme}
        onSelectVariant={jest.fn()}
        isLoading={false}
      />
    );
    expect(screen.getByText('No variants yet')).toBeInTheDocument();
  });
});

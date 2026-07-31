import { fireEvent, render, screen } from '@testing-library/react';
import type { OwnedSnake } from '@/shared/types/snake-data-model';
import {
  activeSetupSnakes,
  favoriteSetupSnakesByDynasty,
  SnakePickerSheet,
  snakeBuildSignature,
} from './SnakePickerSheet';

function snake(overrides: Partial<OwnedSnake> = {}): OwnedSnake {
  return {
    id: 'snake-1',
    playerId: 'player-1',
    variantId: 'CYBER SPARK',
    snakeVariantId: 'variant-cyber',
    generation: 1,
    parent1Id: null,
    parent2Id: null,
    acquiredAt: '2026-07-01T12:00:00.000Z',
    acquiredMethod: 'tutorial',
    isEquipped: false,
    isFavorited: false,
    variantName: 'CYBER SPARK',
    dynastyName: 'CYBER',
    traits: [],
    lineage: null,
    ...overrides,
  };
}

describe('SnakePickerSheet', () => {
  it('shows only highest active generations while retaining equal-generation builds', () => {
    const old = snake({ id: 'old', generation: 2 });
    const currentA = snake({ id: 'current-a', generation: 4, traits: ['sprinter'] });
    const currentB = snake({ id: 'current-b', generation: 4, traits: ['patient'] });
    const primal = snake({
      id: 'primal',
      variantId: 'PRIMAL SEED',
      snakeVariantId: 'variant-primal',
      variantName: 'PRIMAL SEED',
      dynastyName: 'PRIMAL',
      generation: 3,
    });

    expect(activeSetupSnakes([old, currentA, currentB, primal], currentA.id).map((item) => item.id))
      .toEqual(['current-a', 'current-b', 'primal']);

    render(
      <SnakePickerSheet
        isOpen
        snakes={[old, currentA, currentB, primal]}
        equippedSnakeId={currentA.id}
        selectingSnakeId={null}
        error={null}
        onSelect={jest.fn()}
        onClose={jest.fn()}
      />
    );

    expect(screen.queryByTestId('snake-picker-option-old')).not.toBeInTheDocument();
    expect(screen.getByTestId('snake-picker-option-current-a')).toBeInTheDocument();
    expect(screen.getByTestId('snake-picker-option-current-b')).toBeInTheDocument();
  });

  it('distinguishes equal-generation builds by trait and lineage identity', () => {
    expect(snakeBuildSignature(snake({
      traits: ['sprinter'],
      lineage: { strains: ['VOLT'], strength: 1 },
    }))).toBe('Sprinter · VOLT lineage 1');
    expect(snakeBuildSignature(snake())).toBe('Original genome');
  });

  it('returns the selected server-owned row and never starts a run itself', () => {
    const onSelect = jest.fn();
    const choice = snake({ id: 'choice', generation: 4, traits: ['patient'] });
    const fetchSpy = jest.spyOn(global, 'fetch');

    render(
      <SnakePickerSheet
        isOpen
        snakes={[choice]}
        equippedSnakeId={null}
        selectingSnakeId={null}
        error={null}
        onSelect={onSelect}
        onClose={jest.fn()}
      />
    );

    fireEvent.click(screen.getByTestId('snake-picker-option-choice'));
    expect(onSelect).toHaveBeenCalledWith(choice);
    expect(fetchSpy).not.toHaveBeenCalled();
    fetchSpy.mockRestore();
  });

  it('keeps full collection management as a contextual secondary route', () => {
    render(
      <SnakePickerSheet
        isOpen
        snakes={[snake()]}
        equippedSnakeId="snake-1"
        selectingSnakeId={null}
        error={null}
        onSelect={jest.fn()}
        onClose={jest.fn()}
      />
    );

    expect(screen.getByRole('link', { name: /Open Snake Lab/i })).toHaveAttribute(
      'href',
      '/lab?returnTo=%2Fgame'
    );
    expect(screen.getByRole('link', { name: /Open Snake Lab/i })).not.toHaveClass('underline');
  });

  it('projects an older favorite onto its active evolved generation', () => {
    const oldFavorite = snake({ id: 'old-favorite', generation: 2, isFavorited: true });
    const evolved = snake({ id: 'evolved', generation: 8, isFavorited: false });
    const cosmic = snake({
      id: 'cosmic',
      snakeVariantId: 'variant-cosmic',
      variantId: 'COSMIC HALO',
      variantName: 'COSMIC HALO',
      dynastyName: 'COSMIC',
      generation: 3,
      isFavorited: true,
    });

    const favorites = favoriteSetupSnakesByDynasty(
      [oldFavorite, evolved, cosmic],
      evolved.id
    );
    expect(favorites.CYBER?.id).toBe('evolved');
    expect(favorites.COSMIC?.id).toBe('cosmic');
    expect(favorites.PRIMAL).toBeNull();
  });

  it('resolves duplicate legacy dynasty favorites to one deterministic dock', () => {
    const first = snake({ id: 'first', generation: 5, isFavorited: true });
    const second = snake({
      id: 'second',
      snakeVariantId: 'variant-cyber-two',
      variantId: 'CYBER ARC',
      variantName: 'CYBER ARC',
      generation: 5,
      isFavorited: true,
      acquiredAt: '2026-07-02T12:00:00.000Z',
    });
    expect(favoriteSetupSnakesByDynasty([first, second], null).CYBER?.id).toBe('second');
    expect(favoriteSetupSnakesByDynasty([first, second], first.id).CYBER?.id).toBe('first');
  });

  it('filters the favorite flow to one dynasty and labels the mutation clearly', () => {
    const cyber = snake({ id: 'cyber' });
    const primal = snake({
      id: 'primal',
      snakeVariantId: 'variant-primal',
      variantId: 'PRIMAL SEED',
      variantName: 'PRIMAL SEED',
      dynastyName: 'PRIMAL',
    });
    const onSelect = jest.fn();
    render(
      <SnakePickerSheet
        isOpen
        snakes={[cyber, primal]}
        equippedSnakeId={cyber.id}
        selectingSnakeId={null}
        error={null}
        favoriteDynasty="PRIMAL"
        onSelect={onSelect}
        onClose={jest.fn()}
      />
    );

    expect(screen.getByRole('heading', { name: 'Choose PRIMAL favorite' })).toBeInTheDocument();
    expect(screen.queryByTestId('snake-picker-option-cyber')).not.toBeInTheDocument();
    fireEvent.click(screen.getByTestId('snake-picker-option-primal'));
    expect(onSelect).toHaveBeenCalledWith(primal);
    expect(screen.getByText('Set favorite')).toHaveClass('whitespace-nowrap');
  });
});

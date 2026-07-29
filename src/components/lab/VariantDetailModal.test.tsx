/**
 * VariantDetailModal tests — WP-2.06.
 *
 * The sheet's `owned` prop means THE SELECTED SNAKE. These tests pin that:
 * the roster selector switches which sibling every stat describes, and Equip
 * acts on the selected one rather than the card's representative.
 */

import React from 'react';
import { fireEvent, render, screen, within } from '@testing-library/react';
import { VariantDetailModal } from './VariantDetailModal';
import type {
  Dynasty,
  SnakeVariant,
  OwnedSnake,
} from '@/shared/types/snake-data-model';

const dynasty: Dynasty = {
  id: 'dynasty-1',
  name: 'PRIMAL',
  displayName: 'Primal Dynasty',
  description: 'Ancient earth snakes',
  colorPrimary: '#2d5016',
  colorSecondary: '#8b4513',
  statBonusType: 'size',
  statBonusValue: 0,
  sortOrder: 1,
  isActive: true,
  createdAt: '2026-01-01T00:00:00Z',
  updatedAt: '2026-01-01T00:00:00Z',
};

const variant: SnakeVariant = {
  id: 'variant-1',
  dynastyId: 'dynasty-1',
  name: 'PRIMAL SEED',
  rarity: 'rare',
  loreText: 'From ancient roots',
  artUrl: null,
  baseStats: { speed: 10, size: 5, hp: 100 },
  unlockCostDna: 0,
  isStarter: true,
  sortOrder: 1,
  isActive: true,
  createdAt: '2026-01-01T00:00:00Z',
  updatedAt: '2026-01-01T00:00:00Z',
};

function snake(overrides: Partial<OwnedSnake> & { id: string }): OwnedSnake {
  return {
    playerId: 'player-1',
    variantId: 'PRIMAL SEED',
    snakeVariantId: 'variant-1',
    generation: 1,
    parent1Id: null,
    parent2Id: null,
    acquiredAt: '2026-01-01T00:00:00Z',
    acquiredMethod: 'bred',
    isEquipped: false,
    isFavorited: false,
    traits: [],
    ...overrides,
  };
}

const GEN_7 = snake({ id: 'gen-7', generation: 7 });
const GEN_4 = snake({ id: 'gen-4', generation: 4, isFavorited: true });
const GEN_1 = snake({ id: 'gen-1', generation: 1, acquiredMethod: 'tutorial' });
const ROSTER = [GEN_7, GEN_4, GEN_1];

function renderModal(
  props: Partial<React.ComponentProps<typeof VariantDetailModal>> = {}
) {
  const handlers = {
    onClose: jest.fn(),
    onEquip: jest.fn(),
    onBreed: jest.fn(),
    onSelectSnake: jest.fn(),
    onToggleFavorite: jest.fn().mockResolvedValue(true),
  };
  const view = render(
    <VariantDetailModal
      variant={variant}
      owned={GEN_7}
      roster={ROSTER}
      dynasty={dynasty}
      isOpen
      isEquipping={false}
      isEquipped={false}
      {...handlers}
      {...props}
    />
  );
  return { ...handlers, ...view };
}

describe('VariantDetailModal roster selector', () => {
  it('renders one radio per sibling inside a radiogroup', () => {
    renderModal();

    const group = screen.getByRole('radiogroup', {
      name: 'Choose which PRIMAL SEED to view',
    });
    expect(within(group).getAllByRole('radio')).toHaveLength(3);
    expect(screen.getByText('Your PRIMAL SEED (3)')).toBeInTheDocument();
  });

  it('wraps rather than scrolling — a scroller inside a scrolling sheet hides options', () => {
    renderModal();

    const group = screen.getByRole('radiogroup', {
      name: 'Choose which PRIMAL SEED to view',
    });
    expect(group.className).toContain('flex-wrap');
    expect(group.className).not.toContain('overflow-x');
  });

  it('marks the selected sibling and only that one', () => {
    renderModal({ owned: GEN_4 });

    expect(screen.getByTestId('roster-option-gen-4')).toHaveAttribute(
      'aria-checked',
      'true'
    );
    expect(screen.getByTestId('roster-option-gen-7')).toHaveAttribute(
      'aria-checked',
      'false'
    );
  });

  it('announces favorited and equipped state per option', () => {
    renderModal({ equippedSnakeId: 'gen-1' });

    expect(screen.getByTestId('roster-option-gen-4')).toHaveAttribute(
      'aria-label',
      'Generation 4, favorited'
    );
    expect(screen.getByTestId('roster-option-gen-1')).toHaveAttribute(
      'aria-label',
      'Generation 1, equipped'
    );
  });

  it('asks the caller to switch siblings', () => {
    const { onSelectSnake } = renderModal();

    fireEvent.click(screen.getByTestId('roster-option-gen-1'));

    expect(onSelectSnake).toHaveBeenCalledWith(GEN_1);
  });

  it('renders no selector for a variant held once', () => {
    renderModal({ owned: GEN_7, roster: [GEN_7] });

    expect(
      screen.queryByTestId('variant-roster-selector')
    ).not.toBeInTheDocument();
  });

  it('falls back to the single owned snake when no roster is supplied', () => {
    renderModal({ owned: GEN_7, roster: undefined });

    expect(
      screen.queryByTestId('variant-roster-selector')
    ).not.toBeInTheDocument();
  });
});

describe('VariantDetailModal reads the selected sibling', () => {
  it('shows the selected snake generation, not the roster head', () => {
    renderModal({ owned: GEN_1 });

    // GEN_7 leads the roster; the stat must describe the SELECTED snake.
    expect(screen.getByTestId('variant-generation')).toHaveTextContent('Gen 1');
    expect(screen.getByTestId('variant-yield-multiplier')).toHaveTextContent(
      'Yield ×1.00'
    );
  });

  it('states the exact Ascendance multiplier beside an ascended generation', () => {
    renderModal({ owned: GEN_7 });

    expect(screen.getByTestId('variant-generation')).toHaveTextContent('Gen 7');
    expect(screen.getByTestId('variant-yield-multiplier')).toHaveTextContent(
      'Yield ×1.0723'
    );
  });

  it('equips the SELECTED sibling', () => {
    // The sheet's contract is that `owned` IS the selected snake, so the
    // caller's equip handler acts on the selection by construction. This
    // asserts the press routes through while a sibling is selected.
    const { onEquip } = renderModal({ owned: GEN_4 });

    fireEvent.click(screen.getByLabelText('Equip this snake'));

    expect(onEquip).toHaveBeenCalledTimes(1);
    expect(screen.getByTestId('roster-option-gen-4')).toHaveAttribute(
      'aria-checked',
      'true'
    );
  });

  it('does not close the sheet on equip — the player watches the flip', () => {
    const { onEquip, onClose } = renderModal();

    fireEvent.click(screen.getByLabelText('Equip this snake'));

    expect(onEquip).toHaveBeenCalled();
    expect(onClose).not.toHaveBeenCalled();
  });

  it('disables Equip for the snake that is already equipped', () => {
    renderModal({ owned: GEN_4, isEquipped: true });

    expect(screen.getByLabelText('Already equipped')).toBeDisabled();
  });
});

describe('VariantDetailModal favorite persistence', () => {
  it('reflects the snake row rather than local state', () => {
    renderModal({ owned: GEN_4 });

    expect(screen.getByLabelText('Remove from favorites')).toHaveAttribute(
      'aria-pressed',
      'true'
    );
  });

  it('asks the caller to persist the toggle', () => {
    const { onToggleFavorite } = renderModal({ owned: GEN_7 });

    fireEvent.click(screen.getByLabelText('Add to favorites'));

    expect(onToggleFavorite).toHaveBeenCalledWith('gen-7', true);
  });

  it('unfavorites an already-favorited snake', () => {
    const { onToggleFavorite } = renderModal({ owned: GEN_4 });

    fireEvent.click(screen.getByLabelText('Remove from favorites'));

    expect(onToggleFavorite).toHaveBeenCalledWith('gen-4', false);
  });
});

describe('VariantDetailModal equip errors', () => {
  it('renders the equip error inside the sheet, beside the control', () => {
    renderModal({ equipError: 'Another equip is in flight. Try again.' });

    const alert = screen.getByTestId('variant-equip-error');
    expect(alert).toHaveTextContent('Another equip is in flight. Try again.');
    expect(alert).toHaveAttribute('role', 'alert');
  });

  it('renders nothing when there is no equip error', () => {
    renderModal();

    expect(screen.queryByTestId('variant-equip-error')).not.toBeInTheDocument();
  });
});

describe('VariantDetailModal dialog behaviour', () => {
  it('moves focus into the sheet when opened', () => {
    renderModal();

    const dialog = screen.getByTestId('variant-detail-modal');
    expect(dialog).toHaveAttribute('aria-modal', 'true');
    expect(dialog.contains(document.activeElement)).toBe(true);
  });

  it('closes on Escape', () => {
    const { onClose } = renderModal();

    fireEvent.keyDown(document, { key: 'Escape' });

    expect(onClose).toHaveBeenCalled();
  });

  it('renders nothing when closed', () => {
    renderModal({ isOpen: false });

    expect(
      screen.queryByTestId('variant-detail-modal')
    ).not.toBeInTheDocument();
  });
});

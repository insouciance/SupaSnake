/**
 * Tests for BreedingReveal traits + reroll flow (Design v2 Phase 3A):
 * rolled traits pop in, empty slots show, and the reroll flow walks
 * token count -> confirm -> result.
 */

import { describe, it, expect, jest, beforeEach } from '@jest/globals';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { BreedingReveal, type RerollResult } from './BreedingReveal';
import type { BredOffspring } from '@/lib/stores/breedingStore';

function makeOffspring(overrides: Partial<BredOffspring> = {}): BredOffspring {
  return {
    id: 'child-1',
    snakeVariantId: 'variant-b',
    variantName: 'CYBER PULSE',
    dynastyName: 'CYBER',
    rarity: 'rare',
    generation: 2,
    dnaCost: 300,
    traits: ['sprinter', 'hoarder'],
    traitSlots: 2,
    ...overrides,
  };
}

describe('BreedingReveal - inherited traits', () => {
  beforeEach(() => jest.clearAllMocks());

  it('shows each rolled trait as a chip in slot order', () => {
    render(<BreedingReveal offspring={makeOffspring()} onClose={jest.fn()} />);
    const traits = screen.getByTestId('reveal-traits');
    expect(traits).toBeInTheDocument();
    expect(screen.getByTestId('trait-chip-sprinter')).toBeInTheDocument();
    expect(screen.getByTestId('trait-chip-hoarder')).toBeInTheDocument();
  });

  it('shows empty slots and the no-traits note for traitless offspring', () => {
    render(
      <BreedingReveal
        offspring={makeOffspring({ traits: [], traitSlots: 2 })}
        onClose={jest.fn()}
      />
    );
    expect(screen.getAllByTestId('trait-slot-empty')).toHaveLength(2);
    expect(screen.getByTestId('reveal-no-traits')).toBeInTheDocument();
  });

  it('hides the reroll flow without an onReroll handler', () => {
    render(<BreedingReveal offspring={makeOffspring()} onClose={jest.fn()} />);
    expect(screen.queryByTestId('reroll-slot-1')).not.toBeInTheDocument();
    expect(screen.queryByTestId('reroll-token-count')).not.toBeInTheDocument();
  });

  it('hides reroll buttons at zero tokens but still shows the counter', () => {
    render(
      <BreedingReveal
        offspring={makeOffspring()}
        onClose={jest.fn()}
        rerollTokens={0}
        onReroll={jest.fn() as unknown as (slot: number) => Promise<RerollResult | null>}
      />
    );
    expect(screen.queryByTestId('reroll-slot-1')).not.toBeInTheDocument();
    expect(screen.getByTestId('reroll-token-count')).toHaveTextContent(
      'Reroll tokens: 0'
    );
  });
});

describe('BreedingReveal - reroll flow (token count, confirm, result)', () => {
  it('confirm -> onReroll(slot) -> chips and token count update', async () => {
    const onReroll = jest
      .fn<
        (slot: number) => Promise<RerollResult | null>
      >()
      .mockResolvedValue({ traits: ['sprinter', 'ascetic'], rerollTokens: 1 });

    render(
      <BreedingReveal
        offspring={makeOffspring()}
        onClose={jest.fn()}
        rerollTokens={2}
        onReroll={onReroll}
      />
    );

    expect(screen.getByTestId('reroll-token-count')).toHaveTextContent(
      'Reroll tokens: 2'
    );

    // Ask to reroll slot 2 (Hoarder) -> confirm panel names the trait
    fireEvent.click(screen.getByTestId('reroll-slot-2'));
    expect(screen.getByTestId('reroll-confirm')).toHaveTextContent('Hoarder');

    fireEvent.click(screen.getByTestId('reroll-confirm-yes'));

    await waitFor(() => {
      expect(screen.getByTestId('trait-chip-ascetic')).toBeInTheDocument();
    });
    expect(onReroll).toHaveBeenCalledWith(2);
    expect(screen.queryByTestId('trait-chip-hoarder')).not.toBeInTheDocument();
    expect(screen.getByTestId('reroll-token-count')).toHaveTextContent(
      'Reroll tokens: 1'
    );
    expect(screen.queryByTestId('reroll-confirm')).not.toBeInTheDocument();
  });

  it('cancel closes the confirm without calling onReroll', () => {
    const onReroll = jest.fn<(slot: number) => Promise<RerollResult | null>>();
    render(
      <BreedingReveal
        offspring={makeOffspring()}
        onClose={jest.fn()}
        rerollTokens={1}
        onReroll={onReroll}
      />
    );

    fireEvent.click(screen.getByTestId('reroll-slot-1'));
    fireEvent.click(screen.getByTestId('reroll-confirm-no'));
    expect(onReroll).not.toHaveBeenCalled();
    expect(screen.queryByTestId('reroll-confirm')).not.toBeInTheDocument();
  });

  it('a failed reroll keeps the traits and shows the error', async () => {
    const onReroll = jest
      .fn<(slot: number) => Promise<RerollResult | null>>()
      .mockResolvedValue(null);

    render(
      <BreedingReveal
        offspring={makeOffspring()}
        onClose={jest.fn()}
        rerollTokens={1}
        onReroll={onReroll}
      />
    );

    fireEvent.click(screen.getByTestId('reroll-slot-1'));
    fireEvent.click(screen.getByTestId('reroll-confirm-yes'));

    await waitFor(() => {
      expect(screen.getByTestId('reroll-error')).toBeInTheDocument();
    });
    expect(screen.getByTestId('trait-chip-sprinter')).toBeInTheDocument();
    expect(screen.getByTestId('trait-chip-hoarder')).toBeInTheDocument();
    expect(screen.getByTestId('reroll-token-count')).toHaveTextContent(
      'Reroll tokens: 1'
    );
  });
});

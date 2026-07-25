/**
 * Tests for BreedingReveal's drafted-trait panel (Constitution §8.2).
 *
 * WP-1.05 deleted the whole reroll-flow suite that used to live here
 * (token count -> confirm -> result). The flow it exercised is retired,
 * so the tests are removed rather than adapted; what remains asserts that
 * the reveal confirms the DRAFT and offers no way to redraw it.
 */

import { describe, it, expect, jest, beforeEach } from '@jest/globals';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { BreedingReveal } from './BreedingReveal';
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
    lineage: null,
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

  it('offers no redraw of any kind - the draft is final (§8.2)', () => {
    render(<BreedingReveal offspring={makeOffspring()} onClose={jest.fn()} />);
    expect(screen.queryByTestId('reroll-slot-1')).not.toBeInTheDocument();
    expect(screen.queryByTestId('reroll-token-count')).not.toBeInTheDocument();
    expect(screen.queryByTestId('reroll-confirm')).not.toBeInTheDocument();
    expect(screen.queryByText(/reroll/i)).not.toBeInTheDocument();
  });
});

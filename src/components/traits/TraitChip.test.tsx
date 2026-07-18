/**
 * Tests for TraitChip / EmptyTraitSlot / TraitChipRow (Design v2 Phase 3A):
 * compact chips with effect+tradeoff tooltips and slot-aware rows.
 */

import { describe, it, expect } from '@jest/globals';
import { render, screen } from '@testing-library/react';
import { TraitChip, EmptyTraitSlot, TraitChipRow } from './TraitChip';
import { TRAITS } from '@/shared/game/traits';

describe('TraitChip', () => {
  it('renders the trait name with an effect + tradeoff tooltip', () => {
    render(<TraitChip traitId="sprinter" />);
    const chip = screen.getByTestId('trait-chip-sprinter');
    expect(chip).toHaveTextContent('Sprinter');
    expect(chip).toHaveAttribute(
      'title',
      `Sprinter: ${TRAITS.sprinter.effect} — ${TRAITS.sprinter.cost}`
    );
    expect(chip).toHaveAttribute('aria-label', expect.stringContaining('First 10 foods'));
  });

  it('every Launch Eight trait renders', () => {
    for (const id of Object.keys(TRAITS)) {
      const { unmount } = render(<TraitChip traitId={id as keyof typeof TRAITS} />);
      expect(screen.getByTestId(`trait-chip-${id}`)).toBeInTheDocument();
      unmount();
    }
  });
});

describe('EmptyTraitSlot', () => {
  it('renders a labeled empty slot', () => {
    render(<EmptyTraitSlot />);
    expect(screen.getByTestId('trait-slot-empty')).toHaveAttribute(
      'aria-label',
      'Empty trait slot'
    );
  });
});

describe('TraitChipRow', () => {
  it('renders filled chips then dashed empties up to the slot count', () => {
    render(<TraitChipRow traits={['sprinter']} slots={2} />);
    expect(screen.getByTestId('trait-chip-sprinter')).toBeInTheDocument();
    expect(screen.getAllByTestId('trait-slot-empty')).toHaveLength(1);
  });

  it('renders nothing for a slotless traitless snake', () => {
    const { container } = render(<TraitChipRow traits={[]} slots={0} />);
    expect(container).toBeEmptyDOMElement();
  });

  it('drops unknown trait ids defensively', () => {
    render(<TraitChipRow traits={['sprinter', 'bogus']} slots={2} />);
    expect(screen.getByTestId('trait-chip-sprinter')).toBeInTheDocument();
    // The bogus id renders neither a chip nor eats the empty slot
    expect(screen.getAllByTestId('trait-slot-empty')).toHaveLength(1);
  });

  it('never renders fewer slots than filled traits', () => {
    render(<TraitChipRow traits={['sprinter', 'hoarder']} slots={1} />);
    expect(screen.getByTestId('trait-chip-sprinter')).toBeInTheDocument();
    expect(screen.getByTestId('trait-chip-hoarder')).toBeInTheDocument();
    expect(screen.queryAllByTestId('trait-slot-empty')).toHaveLength(0);
  });
});

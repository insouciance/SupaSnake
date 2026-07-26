/**
 * Tests for TraitChip / EmptyTraitSlot / TraitChipRow (Design v2 Phase 3A):
 * compact chips with effect+tradeoff tooltips and slot-aware rows.
 *
 * WP-2.07b added `interactive`. The load-bearing assertion is the DEFAULT
 * one: a plain chip renders no `<button>`. `VariantCard` is a single button
 * end to end and the breeding draft's toggles are buttons, so the moment
 * this chip grows an unconditional trigger those surfaces ship nested
 * interactive elements — invalid HTML, unreachable by keyboard.
 */

import { describe, it, expect } from '@jest/globals';
import { render, screen, fireEvent } from '@testing-library/react';
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

  it('renders NO button by default — the invariant nested hosts depend on', () => {
    const { container } = render(<TraitChip traitId="sprinter" />);
    expect(container.querySelectorAll('button')).toHaveLength(0);
    expect(screen.queryByTestId('info-popover-trait-sprinter')).toBeNull();
    // The title/aria-label channel is unchanged for those hosts.
    expect(screen.getByTestId('trait-chip-sprinter')).toHaveAttribute('title');
  });

  it('keeps the same chip markup when it becomes interactive', () => {
    render(<TraitChip traitId="sprinter" interactive />);
    const chip = screen.getByTestId('trait-chip-sprinter');
    expect(chip.tagName).toBe('SPAN');
    expect(chip).toHaveAttribute(
      'title',
      `Sprinter: ${TRAITS.sprinter.effect} — ${TRAITS.sprinter.cost}`
    );
  });

  it('opens a panel carrying effect AND cost when tapped', () => {
    render(<TraitChip traitId="scavenger" interactive />);
    const trigger = screen.getByTestId('info-popover-trait-scavenger');

    expect(screen.queryByTestId('info-panel-trait-scavenger')).toBeNull();
    fireEvent.click(trigger);

    const panel = screen.getByTestId('info-panel-trait-scavenger');
    expect(panel).toHaveTextContent(TRAITS.scavenger.effect);
    expect(panel).toHaveTextContent(TRAITS.scavenger.cost);
  });

  it('carries a trait run notice into the panel', () => {
    // Ascetic removes every mutation food from the run; that is the sentence
    // the owner's playtest went looking for and did not find.
    render(<TraitChip traitId="ascetic" interactive />);
    fireEvent.click(screen.getByTestId('info-popover-trait-ascetic'));
    expect(screen.getByTestId('info-panel-trait-ascetic')).toHaveTextContent(
      'no mutation foods'
    );
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

  it('forwards interactivity to every filled chip, and to no empty slot', () => {
    const { container } = render(
      <TraitChipRow traits={['sprinter', 'hoarder']} slots={3} interactive />
    );
    expect(container.querySelectorAll('button')).toHaveLength(2);
    expect(screen.getByTestId('info-popover-trait-sprinter')).toBeInTheDocument();
    expect(screen.getByTestId('info-popover-trait-hoarder')).toBeInTheDocument();
  });

  it('renders no button when interactivity is not asked for', () => {
    const { container } = render(<TraitChipRow traits={['sprinter']} slots={2} />);
    expect(container.querySelectorAll('button')).toHaveLength(0);
  });

  it('never renders fewer slots than filled traits', () => {
    render(<TraitChipRow traits={['sprinter', 'hoarder']} slots={1} />);
    expect(screen.getByTestId('trait-chip-sprinter')).toBeInTheDocument();
    expect(screen.getByTestId('trait-chip-hoarder')).toBeInTheDocument();
    expect(screen.queryAllByTestId('trait-slot-empty')).toHaveLength(0);
  });
});

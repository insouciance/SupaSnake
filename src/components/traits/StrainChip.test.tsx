/**
 * StrainChip — the strain-colored pip chip.
 *
 * WP-2.07b: the chip had NO `aria-label`, so its identity line lived only
 * in a `title` — invisible on touch and not reliably announced. The label
 * is unconditional now, in both modes, and `interactive` adds the tap.
 */

import { render, screen, fireEvent } from '@testing-library/react';
import { StrainChip } from './StrainChip';
import { STRAINS } from '@/shared/game/strains';

describe('StrainChip', () => {
  it('renders the catalog name, identity tooltip, and capped point pips', () => {
    render(<StrainChip strain="FERAL" points={7} />);
    const chip = screen.getByTestId('strain-chip-FERAL');
    expect(chip).toHaveTextContent('Feral');
    expect(chip).toHaveTextContent('••••');
    expect(chip).toHaveAttribute('title', expect.stringContaining('Body'));
    expect(screen.getByLabelText('7 points')).toBeInTheDocument();
  });

  it('omits pips for an offer-bias-only lineage', () => {
    render(<StrainChip strain="VOLT" points={0} />);
    expect(screen.getByTestId('strain-chip-VOLT')).not.toHaveTextContent('•');
  });

  it('can pair the family rune with its visible written identity', () => {
    render(<StrainChip strain="VOLT" showGlyph />);
    const chip = screen.getByTestId('strain-chip-VOLT');
    expect(chip).toHaveTextContent('Volt');
    expect(chip.querySelector('svg')).toBeInTheDocument();
  });

  it('carries an aria-label in display-only mode', () => {
    render(<StrainChip strain="AURUM" />);
    expect(screen.getByTestId('strain-chip-AURUM')).toHaveAttribute(
      'aria-label',
      `${STRAINS.AURUM.name} — ${STRAINS.AURUM.identity}`
    );
  });

  it('carries the same aria-label in interactive mode, plus its points', () => {
    render(<StrainChip strain="AURUM" points={2} interactive />);
    expect(screen.getByTestId('strain-chip-AURUM')).toHaveAttribute(
      'aria-label',
      `${STRAINS.AURUM.name} — ${STRAINS.AURUM.identity}, 2 points`
    );
  });

  it('renders no button by default, so it is safe inside a button host', () => {
    const { container } = render(<StrainChip strain="UMBRA" points={1} />);
    expect(container.querySelectorAll('button')).toHaveLength(0);
  });

  it('explains the strain on tap when interactive', () => {
    render(<StrainChip strain="FLUX" interactive />);
    fireEvent.click(screen.getByTestId('info-popover-strain-FLUX'));
    expect(screen.getByTestId('info-panel-strain-FLUX')).toHaveTextContent(
      STRAINS.FLUX.identity
    );
  });

  it('names the trigger with the strain and its points, not the identity', () => {
    render(<StrainChip strain="VOLT" points={1} interactive />);
    expect(
      screen.getByRole('button', { name: 'Volt, 1 point: what it does' })
    ).toBeInTheDocument();
  });
});

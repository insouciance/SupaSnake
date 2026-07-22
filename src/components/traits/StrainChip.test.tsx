import { render, screen } from '@testing-library/react';
import { StrainChip } from './StrainChip';

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
});

import { render, screen } from '@testing-library/react';
import { LabHeader } from './LabHeader';

describe('LabHeader Genome FTUE', () => {
  it('always provides a clear route back Home', () => {
    render(<LabHeader energy={5} maxEnergy={5} dna={100} />);
    expect(screen.getByRole('link', { name: /back home/i })).toHaveAttribute('href', '/');
  });

  it('keeps the Codex invisible until the server gate opens', () => {
    const { rerender } = render(<LabHeader energy={5} maxEnergy={5} dna={100} />);
    expect(screen.queryByRole('link', { name: /genome codex/i })).toBeNull();

    rerender(<LabHeader energy={5} maxEnergy={5} dna={100} codexUnlocked />);
    expect(screen.getByRole('link', { name: /genome codex/i })).toHaveAttribute('href', '/codex');
  });
});

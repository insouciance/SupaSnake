import { render, screen } from '@testing-library/react';
import { LabHeader } from './LabHeader';

describe('LabHeader', () => {
  it('always provides a clear route back Home', () => {
    render(<LabHeader charge={null} dna={100} />);
    expect(screen.getByRole('link', { name: /back home/i })).toHaveAttribute('href', '/');
  });

  /**
   * REWRITTEN (WP-2.07a). This test used to assert the opposite — that the
   * Codex link stayed invisible until the server's 15-bank gate opened. The
   * Codex is a lexicon now: it explains the game's own vocabulary, so hiding
   * the door to it hid the explanations from precisely the players who had
   * not learned the words yet. The discovery archive inside is still
   * progressive; the way in is not.
   */
  it('always links the Codex, at every banked-run count', () => {
    render(<LabHeader charge={null} dna={100} />);
    expect(screen.getByRole('link', { name: /genome codex/i })).toHaveAttribute(
      'href',
      '/codex'
    );
  });

  it('shows the day’s charges only once the server has synced them', () => {
    const { rerender } = render(<LabHeader charge={null} dna={2450} />);
    expect(screen.queryByLabelText(/charges:/i)).toBeNull();

    rerender(
      <LabHeader
        charge={{
          remaining: 4,
          perDay: 6,
          usedToday: 2,
          day: '2026-07-26',
          refillsAt: '2026-07-27T00:00:00.000Z',
        }}
        dna={2450}
      />
    );
    expect(screen.getByLabelText('Charges: 4 of 6')).toBeInTheDocument();
    expect(screen.getByLabelText('DNA balance: 2,450')).toBeInTheDocument();
  });
});

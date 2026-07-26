/**
 * Ascension, flag OFF — the tested rollback path.
 *
 * `src/lib/ascension/config.ts` promises the off path is exercised explicitly
 * rather than inferred from an omitted flag. This file is that proof: with
 * `ASCENSION_V1_ENABLED` false the component renders nothing at all and reads
 * nothing at all, so unsetting `NEXT_PUBLIC_ASCENSION_V1` takes the month view
 * off the leaderboard without touching a line of code.
 *
 * It is also the §12.2 proof. Ascension is a VIEW, not a surface, and the
 * strongest evidence of that is that the whole thing can be removed by a
 * boolean and nothing else in the game changes state: no settlement is
 * stranded, no cycle is left half-closed, no grant is left unreplayed. There
 * is nothing to strand, because Ascension never writes.
 */

import { render, screen, waitFor } from '@testing-library/react';
import { AscensionMonth } from './AscensionMonth';

jest.mock('@/lib/ascension/config', () => ({ ASCENSION_V1_ENABLED: false }));

jest.mock('next/navigation', () => ({
  useSearchParams: () => new URLSearchParams('month=2026-07'),
}));

describe('AscensionMonth (flag off)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    global.fetch = jest.fn() as unknown as typeof fetch;
  });

  it('renders nothing and reads nothing', async () => {
    const { container } = render(<AscensionMonth token="test-token" />);

    await waitFor(() => expect(global.fetch).not.toHaveBeenCalled());
    expect(container).toBeEmptyDOMElement();
    expect(container.textContent).toBe('');
    expect(screen.queryByTestId('ascension-month')).not.toBeInTheDocument();
  });

  it('leaves nothing a player could tap or follow', () => {
    const { container } = render(<AscensionMonth token="test-token" />);
    expect(container.querySelectorAll('button')).toHaveLength(0);
    expect(container.querySelectorAll('a')).toHaveLength(0);
  });

  it('renders nothing without a token either', () => {
    const { container } = render(<AscensionMonth token={undefined} />);
    expect(container).toBeEmptyDOMElement();
  });
});

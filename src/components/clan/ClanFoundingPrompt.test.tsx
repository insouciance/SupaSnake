/**
 * The founding prompt (§9.2): one prompt, skippable, and silent before the
 * ramp beat.
 *
 * The assertion that carries Rule 8 here is a negative one. Below eight banked
 * runs the component must render NOTHING — not a locked card, not a counter,
 * not "3 of 8". A player who has been shown a number they have not reached has
 * been shown a cut line, whatever the number is called.
 */

import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import {
  ClanFoundingPrompt,
  resetClanFoundingPromptMemory,
} from './ClanFoundingPrompt';
import { SERPENT_UNLOCK_BANKED_RUNS } from '@/lib/serpent/config';

beforeEach(() => {
  resetClanFoundingPromptMemory();
  global.fetch = jest.fn().mockResolvedValue({
    ok: true,
    status: 200,
    json: async () => ({ genomeFtue: { bankedRuns: SERPENT_UNLOCK_BANKED_RUNS } }),
  });
});

describe('below the ramp beat, the prompt does not exist (Rule 8)', () => {
  it.each([0, 1, 3, SERPENT_UNLOCK_BANKED_RUNS - 1])(
    'renders nothing at %i banked runs',
    (banked) => {
      const { container } = render(
        <ClanFoundingPrompt inClan={false} bankedRuns={banked} />
      );
      expect(container).toBeEmptyDOMElement();
    }
  );

  it('renders no counter, progress bar or remaining-runs copy at all', () => {
    const { container } = render(<ClanFoundingPrompt inClan={false} bankedRuns={3} />);

    expect(container.textContent).toBe('');
    expect(container.querySelector('[role="progressbar"]')).toBeNull();
    expect(container.querySelector('progress')).toBeNull();
  });

  it('renders nothing when the ramp count is unknown', () => {
    const { container } = render(
      <ClanFoundingPrompt inClan={false} bankedRuns={null} />
    );
    expect(container).toBeEmptyDOMElement();
  });

  it('does not re-read /api/player when the caller already looked', () => {
    render(
      <ClanFoundingPrompt accessToken="token" inClan={false} bankedRuns={null} />
    );
    expect(global.fetch).not.toHaveBeenCalled();
  });
});

describe('at the ramp beat', () => {
  it('appears, and says why a clan rather than what it is worth', () => {
    render(
      <ClanFoundingPrompt inClan={false} bankedRuns={SERPENT_UNLOCK_BANKED_RUNS} />
    );

    expect(screen.getByTestId('clan-founding-prompt')).toBeInTheDocument();
    expect(screen.getByText(/The World Serpent is hunting/i)).toBeInTheDocument();
    expect(screen.getByText(/strongest five banked yields/i)).toBeInTheDocument();
    expect(screen.getByText(/A clan of one is a clan/i)).toBeInTheDocument();
  });

  it('offers founding and joining, and nothing to buy (Rule 7)', () => {
    const { container } = render(
      <ClanFoundingPrompt inClan={false} bankedRuns={SERPENT_UNLOCK_BANKED_RUNS} />
    );

    expect(screen.getByTestId('founding-prompt-found')).toBeInTheDocument();
    expect(screen.getByTestId('founding-prompt-join')).toBeInTheDocument();
    expect(container.textContent).not.toMatch(/\bbuy|\bprice|\bpurchase|\b€|\$/i);
  });

  it('reads the ramp count from /api/player when nobody supplied it', async () => {
    render(<ClanFoundingPrompt accessToken="token" inClan={false} />);

    await waitFor(() =>
      expect(screen.getByTestId('clan-founding-prompt')).toBeInTheDocument()
    );
    expect(global.fetch).toHaveBeenCalledWith(
      '/api/player',
      expect.objectContaining({ headers: { Authorization: 'Bearer token' } })
    );
  });

  it('calls the in-place handlers instead of navigating when given them', () => {
    const onFound = jest.fn();
    const onJoin = jest.fn();
    render(
      <ClanFoundingPrompt
        inClan={false}
        bankedRuns={SERPENT_UNLOCK_BANKED_RUNS}
        onFound={onFound}
        onJoin={onJoin}
      />
    );

    fireEvent.click(screen.getByTestId('founding-prompt-found'));
    fireEvent.click(screen.getByTestId('founding-prompt-join'));
    expect(onFound).toHaveBeenCalledTimes(1);
    expect(onJoin).toHaveBeenCalledTimes(1);
  });

  it('falls back to links, so the prompt is never a dead end', () => {
    render(
      <ClanFoundingPrompt inClan={false} bankedRuns={SERPENT_UNLOCK_BANKED_RUNS} />
    );
    expect(screen.getByTestId('founding-prompt-found')).toHaveAttribute('href', '/clan');
    expect(screen.getByTestId('founding-prompt-join')).toHaveAttribute('href', '/clan');
  });
});

describe('skipping costs nothing', () => {
  it('dismisses for the page lifecycle and says the page stays reachable', () => {
    render(
      <ClanFoundingPrompt inClan={false} bankedRuns={SERPENT_UNLOCK_BANKED_RUNS} />
    );

    expect(screen.getByText(/Skipping costs nothing/i)).toBeInTheDocument();
    fireEvent.click(screen.getByTestId('founding-prompt-dismiss'));

    expect(screen.queryByTestId('clan-founding-prompt')).not.toBeInTheDocument();
  });

  it('stays dismissed on the next render', () => {
    const first = render(
      <ClanFoundingPrompt inClan={false} bankedRuns={SERPENT_UNLOCK_BANKED_RUNS} />
    );
    fireEvent.click(screen.getByTestId('founding-prompt-dismiss'));
    first.unmount();
    render(
      <ClanFoundingPrompt inClan={false} bankedRuns={SERPENT_UNLOCK_BANKED_RUNS} />
    );
    expect(screen.queryByTestId('clan-founding-prompt')).not.toBeInTheDocument();
  });
});

describe('a player already in a clan', () => {
  it('is never prompted, however many runs they have banked', () => {
    const { container } = render(<ClanFoundingPrompt inClan bankedRuns={500} />);
    expect(container).toBeEmptyDOMElement();
  });
});

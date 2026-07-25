/**
 * Tests for DuelPanel - clan duel card render states
 */

import { render, screen, waitFor } from '@testing-library/react';
import { DuelPanel, formatCountdown, scoreBarWidth, type DuelData } from './DuelPanel';

function mockFetchResponse(status: number, body: unknown) {
  global.fetch = jest.fn().mockResolvedValue({
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  }) as unknown as typeof fetch;
}

function futureIso(hoursFromNow: number): string {
  return new Date(Date.now() + hoursFromNow * 3600_000).toISOString();
}

function activeDuelData(overrides: Partial<DuelData> = {}): DuelData {
  return {
    duel: {
      weekStart: '2026-07-13',
      status: 'active',
      isBye: false,
      opponent: { name: 'Dragon Lords', tag: 'DRAG', rating: 990 },
      myScore: 4200,
      theirScore: 2100,
      endsAt: futureIso(50),
      myTopContributors: [
        { name: 'viper', dna: 2400 },
        { name: 'cobra', dna: 1800 },
      ],
    },
    rating: 1010,
    record: { wins: 3, losses: 1 },
    lastWeek: null,
    ...overrides,
  };
}

afterEach(() => {
  jest.restoreAllMocks();
});

describe('formatCountdown', () => {
  it('formats days and hours', () => {
    expect(formatCountdown(50 * 3600_000)).toBe('2d 2h');
  });

  it('formats hours and minutes under a day', () => {
    expect(formatCountdown(3 * 3600_000 + 24 * 60_000)).toBe('3h 24m');
  });

  it('formats minutes under an hour', () => {
    expect(formatCountdown(18 * 60_000)).toBe('18m');
  });

  it('shows settling state when the week has ended', () => {
    expect(formatCountdown(0)).toBe('Settling...');
    expect(formatCountdown(-1000)).toBe('Settling...');
  });
});

describe('scoreBarWidth', () => {
  it('gives the leader 100% and the trailer a proportional width', () => {
    expect(scoreBarWidth(4200, 2100)).toBe(100);
    expect(scoreBarWidth(2100, 4200)).toBe(50);
  });

  it('is 0 when both scores are 0', () => {
    expect(scoreBarWidth(0, 0)).toBe(0);
  });
});

describe('DuelPanel', () => {
  it('renders nothing without an access token', () => {
    global.fetch = jest.fn() as unknown as typeof fetch;
    const { container } = render(<DuelPanel accessToken={null} />);
    expect(container.firstChild).toBeNull();
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it('renders nothing when the player is not in a clan (404)', async () => {
    mockFetchResponse(404, { error: 'Not in a clan' });
    const { container } = render(<DuelPanel accessToken="token" />);

    await waitFor(() => expect(global.fetch).toHaveBeenCalled());
    expect(container.querySelector('[data-testid="duel-panel"]')).toBeNull();
  });

  it('renders an active duel with opponent, live scores, countdown, and contributors', async () => {
    mockFetchResponse(200, activeDuelData());
    render(<DuelPanel accessToken="token" />);

    await screen.findByTestId('duel-active');

    expect(screen.getByText(/vs Dragon Lords/i)).toBeInTheDocument();
    expect(screen.getByText('4,200')).toBeInTheDocument();
    expect(screen.getByText('2,100')).toBeInTheDocument();
    expect(screen.getByTestId('my-score-bar')).toHaveStyle({ width: '100%' });
    expect(screen.getByTestId('their-score-bar')).toHaveStyle({ width: '50%' });
    expect(screen.getByTestId('duel-countdown')).toHaveTextContent(/Week ends in/i);
    expect(screen.getByText('viper')).toBeInTheDocument();
    expect(screen.getByText('cobra')).toBeInTheDocument();
    expect(screen.getByTestId('duel-record-chip')).toHaveTextContent('1010 RATING');
    expect(screen.getByTestId('duel-record-chip')).toHaveTextContent('3W-1L');
    // projected ELO change (1010 vs 990: ~+15 / -17)
    expect(screen.getByTestId('duel-projection')).toHaveTextContent('Win +15');
    expect(screen.getByTestId('duel-projection')).toHaveTextContent('Lose -17');
  });

  it('renders the bye state', async () => {
    mockFetchResponse(
      200,
      activeDuelData({
        duel: {
          weekStart: '2026-07-13',
          status: 'bye',
          isBye: true,
          opponent: null,
          myScore: 800,
          theirScore: 0,
          endsAt: futureIso(30),
          myTopContributors: [],
        },
      })
    );
    render(<DuelPanel accessToken="token" />);

    await screen.findByTestId('duel-bye');
    expect(screen.getByText(/Rest week — no opponent/i)).toBeInTheDocument();
    expect(screen.queryByTestId('duel-active')).toBeNull();
  });

  it('renders the unpaired state when the clan has no duel this week', async () => {
    mockFetchResponse(200, activeDuelData({ duel: null }));
    render(<DuelPanel accessToken="token" />);

    await screen.findByTestId('duel-unpaired');
    expect(screen.getByText(/joins the bracket next week/i)).toBeInTheDocument();
  });

  it('renders last week win banner with rating gain and +5% DNA bonus badge', async () => {
    mockFetchResponse(
      200,
      activeDuelData({
        lastWeek: {
          result: 'won',
          ratingDelta: 16,
          opponentName: 'Old Rivals',
          myScore: 5000,
          theirScore: 4000,
        },
      })
    );
    render(<DuelPanel accessToken="token" />);

    await screen.findByTestId('last-week-banner');
    expect(screen.getByText(/Victory over Old Rivals/i)).toBeInTheDocument();
    expect(screen.getByText(/\+16 rating/i)).toBeInTheDocument();
    // WP-0.02 / Rule 8: winning a duel pays no DNA bonus and the badge that
    // advertised one is deleted. A win is a rating and a story, never a
    // multiplier on anybody's payout.
    expect(screen.queryByTestId('duel-bonus-badge')).toBeNull();
    expect(screen.queryByText(/\+5% DNA/i)).toBeNull();
  });

  it('renders last week loss banner without any DNA bonus claim', async () => {
    mockFetchResponse(
      200,
      activeDuelData({
        lastWeek: {
          result: 'lost',
          ratingDelta: -16,
          opponentName: 'Dragon Lords',
          myScore: 1000,
          theirScore: 3000,
        },
      })
    );
    render(<DuelPanel accessToken="token" />);

    await screen.findByTestId('last-week-banner');
    expect(screen.getByText(/Defeat vs Dragon Lords/i)).toBeInTheDocument();
    expect(screen.getByText(/-16 rating/i)).toBeInTheDocument();
    expect(screen.queryByTestId('duel-bonus-badge')).toBeNull();
  });

  it('renders nothing when the fetch throws (network failure is non-fatal)', async () => {
    global.fetch = jest.fn().mockRejectedValue(new Error('offline')) as unknown as typeof fetch;
    const { container } = render(<DuelPanel accessToken="token" />);

    await waitFor(() => expect(global.fetch).toHaveBeenCalled());
    expect(container.querySelector('[data-testid="duel-panel"]')).toBeNull();
  });
});

/**
 * Home Page Tests - real pilot stats, daily reward auto-open, FTUE mount
 */

import { render, screen, waitFor } from '@testing-library/react';
import Home from './page';

// Child components with their own routing/effects are stubbed
jest.mock('@/components/ui/NavBar', () => ({
  NavBar: () => <div data-testid="navbar" />,
}));

jest.mock('@/components/ftue/StarterSelection', () => ({
  StarterSelection: () => <div data-testid="starter-selection" />,
}));

const mockTrackEvent = jest.fn();
jest.mock('@/lib/analytics/posthog', () => ({
  trackEvent: (...args: unknown[]) => mockTrackEvent(...args),
}));

const mockUseAuth = jest.fn();
jest.mock('@/lib/auth/AuthProvider', () => ({
  useAuth: () => mockUseAuth(),
}));

interface FetchFixtures {
  player?: Record<string, unknown>;
  streaks?: Record<string, unknown>;
  daily?: Record<string, unknown>;
}

function jsonResponse(body: unknown): Response {
  return {
    ok: true,
    status: 200,
    json: async () => body,
  } as unknown as Response;
}

function buildTiers() {
  return Array.from({ length: 28 }, (_, i) => ({
    day: i + 1,
    dna: 50,
    energy: 0,
    bonusType: null,
  }));
}

function setupFetch(fixtures: FetchFixtures = {}) {
  const playerBody = fixtures.player ?? {
    player: { dna: 320, energy: 4, max_energy: 5, high_score: 777 },
    collectionSize: 3,
    needsStarterSelection: false,
  };
  const streaksBody = fixtures.streaks ?? { currentStreak: 5, multiplier: 1.1 };
  const dailyBody = fixtures.daily ?? {
    currentDay: 3,
    canClaimToday: true,
    tiers: buildTiers(),
    streak: { current: 5, multiplier: 1.1 },
  };

  global.fetch = jest.fn(async (url: RequestInfo | URL) => {
    const u = String(url);
    if (u.includes('/api/player')) return jsonResponse(playerBody);
    if (u.includes('/api/streaks')) return jsonResponse(streaksBody);
    if (u.includes('/api/daily-rewards')) return jsonResponse(dailyBody);
    return jsonResponse({});
  }) as jest.Mock;
}

function setAuthed() {
  mockUseAuth.mockReturnValue({
    isAuthenticated: true,
    isLoading: false,
    signInAnonymously: jest.fn(),
    session: { access_token: 'test-token' },
  });
}

function setUnauthed() {
  mockUseAuth.mockReturnValue({
    isAuthenticated: false,
    isLoading: false,
    signInAnonymously: jest.fn(),
    session: null,
  });
}

describe('Home page', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    window.localStorage.clear();
    setupFetch();
  });

  describe('unauthenticated', () => {
    it('renders the command center without fetching stats', () => {
      setUnauthed();
      render(<Home />);

      expect(screen.getByText('OG Snake')).toBeInTheDocument();
      expect(
        screen.getByText('Launch a game to start your pilot record.')
      ).toBeInTheDocument();
      expect(global.fetch).not.toHaveBeenCalled();
    });
  });

  describe('real pilot stats', () => {
    it('fetches and shows high score, streak, DNA, energy and collection', async () => {
      setAuthed();
      render(<Home />);

      await waitFor(() => {
        expect(screen.getByText('777')).toBeInTheDocument();
      });

      expect(screen.getByText('High Score')).toBeInTheDocument();
      expect(screen.getByText('320')).toBeInTheDocument(); // DNA
      expect(screen.getByText('4/5')).toBeInTheDocument(); // Energy
      expect(screen.getByText('Collection')).toBeInTheDocument();

      const calls = (global.fetch as jest.Mock).mock.calls.map((c) => String(c[0]));
      expect(calls).toEqual(
        expect.arrayContaining(['/api/player', '/api/streaks', '/api/daily-rewards'])
      );
    });

    it('sends the auth token with stat requests', async () => {
      setAuthed();
      render(<Home />);

      await waitFor(() => {
        expect(global.fetch).toHaveBeenCalled();
      });

      const playerCall = (global.fetch as jest.Mock).mock.calls.find(
        (c) => String(c[0]) === '/api/player'
      );
      expect(playerCall?.[1]?.headers).toEqual({ Authorization: 'Bearer test-token' });
    });

    it('does not render the hardcoded placeholder rank', async () => {
      setAuthed();
      render(<Home />);

      await waitFor(() => {
        expect(screen.getByText('777')).toBeInTheDocument();
      });
      expect(screen.queryByText('#142')).not.toBeInTheDocument();
      expect(screen.queryByText('Rank')).not.toBeInTheDocument();
    });

    it('fires the daily_login analytics event with streak data', async () => {
      setAuthed();
      render(<Home />);

      await waitFor(() => {
        expect(mockTrackEvent).toHaveBeenCalledWith(
          'daily_login',
          expect.objectContaining({ current_streak: 5 })
        );
      });
    });
  });

  describe('FTUE starter selection', () => {
    it('mounts StarterSelection when the player owns no snakes', async () => {
      setAuthed();
      setupFetch({
        player: {
          player: { dna: 0, energy: 5, max_energy: 5, high_score: 0 },
          collectionSize: 0,
          needsStarterSelection: true,
        },
      });
      render(<Home />);

      await waitFor(() => {
        expect(screen.getByTestId('starter-selection')).toBeInTheDocument();
      });
      // Daily reward modal defers to FTUE
      expect(screen.queryByText('Daily Rewards')).not.toBeInTheDocument();
    });

    it('does not mount StarterSelection for players with snakes', async () => {
      setAuthed();
      render(<Home />);

      await waitFor(() => {
        expect(screen.getByText('777')).toBeInTheDocument();
      });
      expect(screen.queryByTestId('starter-selection')).not.toBeInTheDocument();
    });
  });

  describe('daily reward modal', () => {
    it('auto-opens when a reward is claimable', async () => {
      setAuthed();
      render(<Home />);

      await waitFor(() => {
        expect(screen.getByText('Daily Rewards')).toBeInTheDocument();
      });
    });

    it('does not auto-open when already claimed today', async () => {
      setAuthed();
      setupFetch({
        daily: {
          currentDay: 4,
          canClaimToday: false,
          tiers: buildTiers(),
          streak: { current: 5, multiplier: 1.1 },
        },
      });
      render(<Home />);

      await waitFor(() => {
        expect(screen.getByText('777')).toBeInTheDocument();
      });
      expect(screen.queryByText('Daily Rewards')).not.toBeInTheDocument();
    });

    it('does not re-open after dismissal on the same day', async () => {
      setAuthed();
      const today = new Date().toISOString().split('T')[0];
      window.localStorage.setItem(`daily-reward-dismissed-${today}`, '1');
      render(<Home />);

      await waitFor(() => {
        expect(screen.getByText('777')).toBeInTheDocument();
      });
      expect(screen.queryByText('Daily Rewards')).not.toBeInTheDocument();
    });
  });

  describe('FTUE hint', () => {
    it('shows the one-time home hint for authed players', async () => {
      setAuthed();
      render(<Home />);

      await waitFor(() => {
        expect(
          screen.getByText('Play to earn DNA - spend it in the Lab')
        ).toBeInTheDocument();
      });
    });

    it('hides the hint once dismissed previously', async () => {
      setAuthed();
      window.localStorage.setItem('hint-dismissed-home-play-dna', '1');
      render(<Home />);

      await waitFor(() => {
        expect(screen.getByText('777')).toBeInTheDocument();
      });
      expect(
        screen.queryByText('Play to earn DNA - spend it in the Lab')
      ).not.toBeInTheDocument();
    });
  });
});

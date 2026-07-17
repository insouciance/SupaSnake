/**
 * Home Page Tests - Specimen Chamber menu: ambient counters, mission line,
 * daily reward auto-open, FTUE mount, identity continuity, Launch gating
 */

import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import Home from './page';
import { recordLastUser, readLastUser, PROGRESS_LOSS_NOTICE_KEY } from '@/lib/auth/lastUser';
import { enqueueReward, readOutbox } from '@/lib/outbox/rewardOutbox';

// The 3D chamber is dynamically imported (WebGL); stub the dynamic loader
jest.mock('next/dynamic', () => ({
  __esModule: true,
  default: () => {
    const DynamicStub = () => <div data-testid="specimen-chamber" />;
    return DynamicStub;
  },
}));

// Child components with their own routing/effects are stubbed
jest.mock('@/components/ui/Navigation', () => ({
  Navigation: () => <div data-testid="navigation" />,
}));

const mockPush = jest.fn();
jest.mock('next/navigation', () => ({
  useRouter: () => ({ push: mockPush }),
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
  collection?: Record<string, unknown>;
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
  const collectionBody = fixtures.collection ?? {
    snakes: [{ id: 'snake-1', isEquipped: true, dynastyName: 'CYBER' }],
    dnaBalance: 320,
  };

  global.fetch = jest.fn(async (url: RequestInfo | URL) => {
    const u = String(url);
    if (u.includes('/api/player')) return jsonResponse(playerBody);
    if (u.includes('/api/streaks')) return jsonResponse(streaksBody);
    if (u.includes('/api/daily-rewards')) return jsonResponse(dailyBody);
    if (u.includes('/api/collection')) return jsonResponse(collectionBody);
    return jsonResponse({});
  }) as jest.Mock;
}

function setAuthed(opts: { isAnonymous?: boolean } = {}) {
  mockUseAuth.mockReturnValue({
    isAuthenticated: true,
    isLoading: false,
    isAnonymous: opts.isAnonymous ?? false,
    signInAnonymously: jest.fn(),
    session: { access_token: 'test-token' },
  });
}

function setUnauthed() {
  const signInAnonymously = jest.fn();
  mockUseAuth.mockReturnValue({
    isAuthenticated: false,
    isLoading: false,
    isAnonymous: false,
    signInAnonymously,
    session: null,
  });
  return { signInAnonymously };
}

/** Waits for authed stats to land (energy counter shows current/max) */
async function waitForStats() {
  await waitFor(() => {
    expect(screen.getByText('4/5')).toBeInTheDocument();
  });
}

describe('Home page', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    window.localStorage.clear();
    setupFetch();
  });

  describe('unauthenticated', () => {
    it('renders wordmark and Launch without fetching stats', () => {
      setUnauthed();
      render(<Home />);

      expect(screen.getByText('SUPASNAKE')).toBeInTheDocument();
      expect(screen.getByText('Launch')).toBeInTheDocument();
      expect(screen.getByText('Where Skill Creates Legacy')).toBeInTheDocument();
      expect(global.fetch).not.toHaveBeenCalled();
    });
  });

  describe('ambient counters (server authority)', () => {
    it('fetches and shows DNA and energy', async () => {
      setAuthed();
      render(<Home />);

      await waitForStats();

      expect(screen.getByText('320')).toBeInTheDocument(); // DNA
      expect(screen.getByText('4/5')).toBeInTheDocument(); // Energy

      const calls = (global.fetch as jest.Mock).mock.calls.map((c) => String(c[0]));
      expect(calls).toEqual(
        expect.arrayContaining([
          '/api/player',
          '/api/streaks',
          '/api/daily-rewards',
          '/api/collection',
        ])
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

    it('does not render dashboard remnants (stat strip, briefing, rank)', async () => {
      setAuthed();
      render(<Home />);

      await waitForStats();
      expect(screen.queryByText('#142')).not.toBeInTheDocument();
      expect(screen.queryByText('Rank')).not.toBeInTheDocument();
      expect(screen.queryByText('Pilot Stats')).not.toBeInTheDocument();
      expect(screen.queryByText('Mission Briefing')).not.toBeInTheDocument();
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

  describe('mission line', () => {
    it('surfaces the daily reward with a tappable line when claimable', async () => {
      setAuthed();
      // Pre-dismiss so the calendar does not auto-open
      const today = new Date().toISOString().split('T')[0];
      window.localStorage.setItem(`daily-reward-dismissed-${today}`, '1');
      render(<Home />);

      await waitFor(() => {
        expect(screen.getByText('Daily reward ready')).toBeInTheDocument();
      });
      expect(screen.queryByText('Daily Rewards')).not.toBeInTheDocument();

      fireEvent.click(screen.getByText('Daily reward ready'));

      expect(screen.getByText('Daily Rewards')).toBeInTheDocument();
    });

    it('shows the next-goal progress line when nothing is claimable', async () => {
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

      await waitForStats();
      expect(screen.getByText('Next goal · 3/30 variants')).toBeInTheDocument();
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

      await waitForStats();
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

      await waitForStats();
      expect(screen.queryByText('Daily Rewards')).not.toBeInTheDocument();
    });

    it('does not re-open after dismissal on the same day', async () => {
      setAuthed();
      const today = new Date().toISOString().split('T')[0];
      window.localStorage.setItem(`daily-reward-dismissed-${today}`, '1');
      render(<Home />);

      await waitForStats();
      expect(screen.queryByText('Daily Rewards')).not.toBeInTheDocument();
    });
  });

  describe('identity continuity (no silent new identity)', () => {
    it('shows Welcome Back when a registered account used this device', () => {
      setUnauthed();
      recordLastUser({ id: 'user-1', is_anonymous: false, email: 'player@example.com' });
      render(<Home />);

      expect(screen.getByTestId('welcome-back-modal')).toBeInTheDocument();
      expect(screen.getByText('Sign In')).toBeInTheDocument();
      expect(screen.getByText('pl****@example.com')).toBeInTheDocument();
    });

    it('start fresh clears the marker and dismisses Welcome Back', () => {
      setUnauthed();
      recordLastUser({ id: 'user-1', is_anonymous: false, email: 'player@example.com' });
      render(<Home />);

      fireEvent.click(
        screen.getByText('Start fresh instead (new account, empty collection)')
      );

      expect(screen.queryByTestId('welcome-back-modal')).not.toBeInTheDocument();
      expect(readLastUser()).toBeNull();
    });

    it('does not show Welcome Back without a marker', () => {
      setUnauthed();
      render(<Home />);
      expect(screen.queryByTestId('welcome-back-modal')).not.toBeInTheDocument();
    });

    it('does not show Welcome Back when the previous user was anonymous', () => {
      setUnauthed();
      recordLastUser({ id: 'anon-1', is_anonymous: true });
      render(<Home />);
      expect(screen.queryByTestId('welcome-back-modal')).not.toBeInTheDocument();
    });

    it('warns once before replacing a lost anonymous session on Launch', () => {
      const { signInAnonymously } = setUnauthed();
      recordLastUser({ id: 'anon-1', is_anonymous: true });
      render(<Home />);

      fireEvent.click(screen.getByText('Launch'));

      expect(screen.getByTestId('progress-loss-notice')).toBeInTheDocument();
      expect(signInAnonymously).not.toHaveBeenCalled();
    });

    it('continue-as-guest signs in anonymously and marks the notice as seen', async () => {
      const { signInAnonymously } = setUnauthed();
      signInAnonymously.mockResolvedValue(undefined);
      recordLastUser({ id: 'anon-1', is_anonymous: true });
      render(<Home />);

      fireEvent.click(screen.getByText('Launch'));
      fireEvent.click(screen.getByText('Continue as Guest'));

      await waitFor(() => {
        expect(signInAnonymously).toHaveBeenCalled();
      });
      expect(mockPush).toHaveBeenCalledWith('/game');
      expect(window.localStorage.getItem(PROGRESS_LOSS_NOTICE_KEY)).toBe('1');
    });

    it('signs in anonymously without prompts on a truly fresh device', async () => {
      const { signInAnonymously } = setUnauthed();
      signInAnonymously.mockResolvedValue(undefined);
      render(<Home />);

      fireEvent.click(screen.getByText('Launch'));

      await waitFor(() => {
        expect(signInAnonymously).toHaveBeenCalled();
      });
      expect(screen.queryByTestId('progress-loss-notice')).not.toBeInTheDocument();
      expect(screen.queryByTestId('welcome-back-modal')).not.toBeInTheDocument();
    });
  });

  describe('save-progress prompt for anonymous players', () => {
    it('shows the banner for anonymous users', async () => {
      setAuthed({ isAnonymous: true });
      render(<Home />);

      await waitFor(() => {
        expect(screen.getByTestId('save-progress-banner')).toBeInTheDocument();
      });
    });

    it('collapses to a corner chip after dismissal', async () => {
      setAuthed({ isAnonymous: true });
      render(<Home />);

      await waitFor(() => {
        expect(screen.getByTestId('save-progress-banner')).toBeInTheDocument();
      });
      fireEvent.click(screen.getByLabelText('Dismiss save progress banner'));

      expect(screen.queryByTestId('save-progress-banner')).not.toBeInTheDocument();
      expect(screen.getByTestId('save-progress-chip')).toBeInTheDocument();
    });

    it('never renders for registered users', async () => {
      setAuthed({ isAnonymous: false });
      render(<Home />);

      await waitForStats();
      expect(screen.queryByTestId('save-progress-banner')).not.toBeInTheDocument();
      expect(screen.queryByTestId('save-progress-chip')).not.toBeInTheDocument();
    });
  });

  describe('reward outbox replay', () => {
    it('replays queued game rewards on load with the auth token', async () => {
      setAuthed();
      enqueueReward({
        sessionId: 'lost-session',
        score: 9,
        dna_earned: 90,
        duration_seconds: 60,
        timestamp: Date.now(),
      });
      render(<Home />);

      await waitFor(() => {
        const call = (global.fetch as jest.Mock).mock.calls.find(
          (c) => String(c[0]) === '/api/game/session'
        );
        expect(call).toBeDefined();
        expect(call?.[1]?.headers?.Authorization).toBe('Bearer test-token');
        expect(JSON.parse(call?.[1]?.body).sessionId).toBe('lost-session');
      });

      await waitFor(() => {
        expect(readOutbox()).toEqual([]);
      });
    });

    it('does not touch the session endpoint when the queue is empty', async () => {
      setAuthed();
      render(<Home />);

      await waitForStats();
      const sessionCalls = (global.fetch as jest.Mock).mock.calls.filter(
        (c) => String(c[0]) === '/api/game/session'
      );
      expect(sessionCalls).toHaveLength(0);
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

      await waitForStats();
      expect(
        screen.queryByText('Play to earn DNA - spend it in the Lab')
      ).not.toBeInTheDocument();
    });
  });
});

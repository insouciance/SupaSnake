/**
 * Home Page Tests - Specimen Chamber menu: ambient counters, mission line,
 * notification-first meta discovery, identity continuity, and one-click launch
 */

import { act, render, screen, waitFor, fireEvent } from '@testing-library/react';
import Home from './page';
import { recordLastUser, readLastUser, PROGRESS_LOSS_NOTICE_KEY } from '@/lib/auth/lastUser';
import { enqueueReward, readOutbox } from '@/lib/outbox/rewardOutbox';
import {
  dispatchNotificationAction,
  useNotificationStore,
} from '@/lib/stores/notificationStore';
import { LAUNCH_HANDOFF_KEY } from '@/lib/ftue/launchFlow';

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
  contracts?: Record<string, unknown>;
  collection?: Record<string, unknown>;
  season?: Record<string, unknown>;
}

function jsonResponse(body: unknown): Response {
  return {
    ok: true,
    status: 200,
    json: async () => body,
  } as unknown as Response;
}

function buildContract(overrides: Record<string, unknown> = {}) {
  return {
    contractId: 'banker',
    contractType: 'extract_n',
    name: 'Banker',
    description: 'Bank 3 extractions',
    params: { count: 3 },
    rewardDna: 400,
    rewardEnergy: 0,
    rewardXp: 150,
    offeredSlot: 1,
    picked: false,
    progress: { current: 0, target: 3 },
    completed: false,
    claimed: false,
    ...overrides,
  };
}

/** Fresh board: 3 unpicked offers, both picks available (auto-opens) */
function buildOffersBoard() {
  return {
    contracts: [
      buildContract(),
      buildContract({ contractId: 'sprinter', name: 'Sprinter', offeredSlot: 2 }),
      buildContract({ contractId: 'nerve', name: 'Nerve', offeredSlot: 3 }),
    ],
    picksRemaining: 2,
    claimable: false,
  };
}

/** Quiet board: both picks made, nothing complete yet (no auto-open) */
function buildQuietBoard() {
  return {
    contracts: [
      buildContract({ picked: true, progress: { current: 1, target: 3 } }),
      buildContract({
        contractId: 'sprinter',
        name: 'Sprinter',
        offeredSlot: 2,
        picked: true,
        progress: { current: 0, target: 1 },
      }),
      buildContract({ contractId: 'nerve', name: 'Nerve', offeredSlot: 3 }),
    ],
    picksRemaining: 0,
    claimable: false,
  };
}

function buildSeason({ premiumTier = false }: { premiumTier?: boolean } = {}) {
  return {
    live: true,
    season: {
      seq: 1,
      name: 'Solstice',
      theme: 'cosmic',
      week: 1,
      weeks: 8,
      playoff_phase: 'none',
    },
    track: {
      xp: 100,
      level: 1,
      max_level: 10,
      xp_per_level: 100,
      reroll_tokens: 0,
      premium: { is_premium: false, season_locked_in: false },
      tiers: [
        {
          level: 1,
          is_premium: premiumTier,
          reward_type: 'reroll_token',
          reward_id: null,
          reward_amount: 1,
          claimed: false,
        },
      ],
    },
  };
}

function setupFetch(fixtures: FetchFixtures = {}) {
  const playerBody = fixtures.player ?? {
    player: {
      id: 'player-1',
      dna: 320,
      high_score: 777,
      total_games_played: 3,
    },
    // The day's harvest envelope (§8.6). `visible` carries the ramp: this
    // fixture has 3 banked runs, below the 4-run threshold, so the meter is
    // hidden - see the dedicated ramp tests below.
    charge: {
      remaining: 4,
      perDay: 6,
      usedToday: 2,
      day: '2026-07-25',
      refillsAt: '2026-07-26T00:00:00.000Z',
      visible: true,
    },
    collectionSize: 3,
    needsStarterSelection: false,
    hasCompletedFirstRun: true,
  };
  const streaksBody = fixtures.streaks ?? { currentStreak: 5, longestStreak: 12 };
  const contractsBody = fixtures.contracts ?? buildOffersBoard();
  const collectionBody = fixtures.collection ?? {
    snakes: [{ id: 'snake-1', isEquipped: true, dynastyName: 'PRIMAL' }],
    dnaBalance: 320,
  };

  global.fetch = jest.fn(async (url: RequestInfo | URL, init?: RequestInit) => {
    const u = String(url);
    if (u.includes('/api/player/bootstrap')) {
      return jsonResponse({
        ftueV2: true,
        player: {
          id: 'player-1',
          dna: 0,
          highScore: 0,
          totalGamesPlayed: 0,
        },
        equippedSnake: {
          id: 'snake-1',
          variantId: 'variant-1',
          name: 'PRIMAL SEED',
          dynasty: 'PRIMAL',
          generation: 1,
          traits: [],
          lineage: { strains: ['FERAL'], strength: 0 },
        },
        onboarding: {
          version: 2,
          isNewPlayer: true,
          starterGranted: true,
          equipmentRepaired: true,
          hasCompletedFirstRun: false,
          needsStarterSelection: false,
        },
      });
    }
    if (u.includes('/api/player')) return jsonResponse(playerBody);
    if (u.includes('/api/streaks')) return jsonResponse(streaksBody);
    if (u.includes('/api/contracts')) return jsonResponse(contractsBody);
    if (u.includes('/api/season')) return jsonResponse(fixtures.season ?? {});
    if (u.includes('/api/collection')) return jsonResponse(collectionBody);
    if (u.includes('/api/game/session')) {
      const body = init?.body ? JSON.parse(String(init.body)) : {};
      return body.action === 'start'
        ? jsonResponse({ sessionId: 'session-1' })
        : jsonResponse({ success: true });
    }
    return jsonResponse({});
  }) as jest.Mock;
}

function setAuthed(opts: { isAnonymous?: boolean } = {}) {
  mockUseAuth.mockReturnValue({
    isAuthenticated: true,
    isLoading: false,
    isAnonymous: opts.isAnonymous ?? false,
    signInAnonymously: jest.fn(),
    session: { access_token: 'test-token', user: { id: 'user-1' } },
  });
}

function setUnauthed() {
  const signInAnonymously = jest.fn().mockResolvedValue({
    error: null,
    session: { access_token: 'anon-token', user: { id: 'anon-1' } },
  });
  mockUseAuth.mockReturnValue({
    isAuthenticated: false,
    isLoading: false,
    isAnonymous: false,
    signInAnonymously,
    session: null,
  });
  return { signInAnonymously };
}

/** Waits for authed stats to land (the charge counter shows left/perDay) */
async function waitForStats() {
  await waitFor(() => {
    expect(screen.getByText('4/6')).toBeInTheDocument();
  });
}

describe('Home page', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    window.localStorage.clear();
    window.sessionStorage.clear();
    window.history.replaceState(null, '', '/');
    useNotificationStore.setState({ notifications: {}, hasHydrated: true });
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

  describe('the charge meter ramp (Constitution §8.6)', () => {
    it('hides the meter until the player has met the game', async () => {
      // "A new player never meets scarcity before they have met the game."
      // The server sends visible:false below the banked-run threshold and
      // Home must honour it rather than deciding for itself.
      setAuthed();
      setupFetch({
        player: {
          player: {
            id: 'player-1',
            dna: 320,
            high_score: 10,
            total_games_played: 1,
          },
          charge: {
            remaining: 5,
            perDay: 6,
            usedToday: 1,
            day: '2026-07-25',
            refillsAt: '2026-07-26T00:00:00.000Z',
            visible: false,
          },
          collectionSize: 1,
          needsStarterSelection: false,
          hasCompletedFirstRun: true,
        },
      });
      render(<Home />);

      await waitFor(() => {
        expect(screen.getByText('320')).toBeInTheDocument();
      });
      expect(screen.queryByText('5/6')).not.toBeInTheDocument();
      expect(screen.queryByTitle('Charges today')).not.toBeInTheDocument();
    });

    it('shows the meter once the ramp opens it', async () => {
      setAuthed();
      render(<Home />);
      await waitForStats();
      expect(screen.getByTitle('Charges today')).toBeInTheDocument();
    });
  });

  describe('ambient counters (server authority)', () => {
    it('fetches and shows DNA and the day\'s charges', async () => {
      setAuthed();
      render(<Home />);

      await waitForStats();

      expect(screen.getByText('320')).toBeInTheDocument(); // DNA
      expect(screen.getByText('4/6')).toBeInTheDocument(); // charges today

      await waitFor(() => {
        const calls = (global.fetch as jest.Mock).mock.calls.map((c) => String(c[0]));
        expect(calls).toEqual(
          expect.arrayContaining([
            '/api/player',
            '/api/streaks',
            '/api/contracts',
            '/api/collection',
          ])
        );
      });
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
      // WP-0.02: the streak has no multiplier left to report.
      const dailyLogin = mockTrackEvent.mock.calls.find(
        (call: unknown[]) => call[0] === 'daily_login'
      );
      expect(dailyLogin?.[1]).not.toHaveProperty('streak_multiplier');
    });
  });

  describe('mission line', () => {
    it('surfaces new contracts with a tappable beacon line when picks are open', async () => {
      setAuthed();
      // Pre-dismiss so the board does not auto-open
      const today = new Date().toISOString().split('T')[0];
      window.localStorage.setItem(`daily-reward-dismissed-${today}`, '1');
      render(<Home />);

      await waitFor(() => {
        expect(screen.getByText('New contracts available')).toBeInTheDocument();
      });
      expect(screen.queryByText('Daily Contracts')).not.toBeInTheDocument();

      fireEvent.click(screen.getByText('New contracts available'));

      expect(screen.getByText('Daily Contracts')).toBeInTheDocument();
    });

    it('shows contract completion progress once both picks are made', async () => {
      setAuthed();
      setupFetch({
        contracts: {
          contracts: [
            buildContract({
              picked: true,
              completed: true,
              progress: { current: 3, target: 3 },
            }),
            buildContract({
              contractId: 'sprinter',
              name: 'Sprinter',
              offeredSlot: 2,
              picked: true,
              progress: { current: 0, target: 1 },
            }),
            buildContract({ contractId: 'nerve', name: 'Nerve', offeredSlot: 3 }),
          ],
          picksRemaining: 0,
          claimable: true,
        },
      });
      const today = new Date().toISOString().split('T')[0];
      window.localStorage.setItem(`daily-reward-dismissed-${today}`, '1');
      render(<Home />);

      await waitFor(() => {
        expect(screen.getByText('Contracts: 1/2 complete')).toBeInTheDocument();
      });

      fireEvent.click(screen.getByText('Contracts: 1/2 complete'));
      expect(screen.getByTestId('contracts-board')).toBeInTheDocument();
    });

    it('falls back to the next-goal progress line without contract activity', async () => {
      setAuthed();
      // No offers on the board (e.g. server has no active pool)
      setupFetch({ contracts: { contracts: [], picksRemaining: 2, claimable: false } });
      render(<Home />);

      await waitForStats();
      expect(screen.getByText('Next goal · 3/30 variants')).toBeInTheDocument();
    });
  });

  describe('FTUE v2 first-run policy', () => {
    it('never mounts mandatory starter selection or fetches meta systems before a run', async () => {
      setAuthed();
      setupFetch({
        player: {
          player: {
            id: 'player-1',
            dna: 0,
            high_score: 0,
            total_games_played: 0,
          },
          collectionSize: 0,
          needsStarterSelection: true,
          hasCompletedFirstRun: false,
        },
      });
      render(<Home />);

      await waitFor(() => {
        expect(screen.getByText('Your first run is ready')).toBeInTheDocument();
      });
      expect(screen.queryByTestId('starter-selection')).not.toBeInTheDocument();
      expect(screen.queryByTestId('contracts-board')).not.toBeInTheDocument();
      const urls = (global.fetch as jest.Mock).mock.calls.map((call) => String(call[0]));
      expect(urls).not.toContain('/api/contracts');
      expect(urls).not.toContain('/api/season');
    });
  });

  describe('notification-first contracts', () => {
    it('publishes a badge but never auto-opens when picks are available', async () => {
      setAuthed();
      render(<Home />);

      await waitFor(() => {
        expect(useNotificationStore.getState().notifications.contracts).toMatchObject({
          badgeKind: 'exclamation',
          href: '/#contracts',
        });
      });
      expect(screen.queryByTestId('contracts-board')).not.toBeInTheDocument();
    });

    it('publishes a numeric badge without auto-opening a claimable reward', async () => {
      setAuthed();
      const board = buildQuietBoard();
      (board.contracts[0] as Record<string, unknown>).completed = true;
      board.claimable = true;
      setupFetch({ contracts: board });
      render(<Home />);

      await waitFor(() => {
        expect(useNotificationStore.getState().notifications.contracts).toMatchObject({
          badgeKind: 'numeric',
          count: 1,
        });
      });
      expect(screen.queryByTestId('contracts-board')).not.toBeInTheDocument();

      fireEvent.click(screen.getByText('Contracts: 1/2 complete'));
      fireEvent.click(screen.getByRole('button', { name: 'Close' }));
      expect(useNotificationStore.getState().notifications.contracts).toMatchObject({
        badgeKind: 'numeric',
        count: 1,
      });
    });

    it('opens after an explicit mission action', async () => {
      setAuthed();
      render(<Home />);

      const mission = await screen.findByText('New contracts available');
      fireEvent.click(mission);
      expect(screen.getByTestId('contracts-board')).toBeInTheDocument();
    });

    it('opens when the player follows the inbox hash', async () => {
      setAuthed();
      window.history.replaceState(null, '', '/#contracts');
      render(<Home />);

      expect(await screen.findByTestId('contracts-board')).toBeInTheDocument();
    });

    it('opens the existing contracts board for the semantic notification action', async () => {
      setAuthed();
      render(<Home />);

      await waitFor(() => {
        expect(useNotificationStore.getState().notifications.contracts).toBeDefined();
      });
      act(() => dispatchNotificationAction('open-contracts'));

      expect(screen.getByTestId('contracts-board')).toBeInTheDocument();
    });

    it('keeps an unresolved contract-choice badge after the board is closed', async () => {
      setAuthed();
      render(<Home />);

      const mission = await screen.findByText('New contracts available');
      fireEvent.click(mission);
      fireEvent.click(screen.getByRole('button', { name: 'Maybe Later' }));

      expect(useNotificationStore.getState().notifications.contracts).toMatchObject({
        badgeKind: 'exclamation',
        actionLabel: 'Choose Contracts',
      });
    });

    it('clears the choice badge immediately after the contracts are selected', async () => {
      setAuthed();
      const pickedBoard = buildQuietBoard();
      const fallbackFetch = global.fetch;
      global.fetch = jest.fn(async (url: RequestInfo | URL, init?: RequestInit) => {
        if (String(url).includes('/api/contracts') && init?.method === 'POST') {
          return jsonResponse(pickedBoard);
        }
        return fallbackFetch(url, init);
      }) as jest.Mock;
      render(<Home />);

      fireEvent.click(await screen.findByText('New contracts available'));
      fireEvent.click(screen.getByTestId('contract-card-banker'));
      fireEvent.click(screen.getByTestId('contract-card-sprinter'));
      fireEvent.click(screen.getByTestId('contracts-confirm'));

      await waitFor(() => {
        expect(useNotificationStore.getState().notifications.contracts).toBeUndefined();
      });
    });

    it('clears a numeric reward badge immediately after the final claim', async () => {
      setAuthed();
      const board = buildQuietBoard();
      (board.contracts[0] as Record<string, unknown>).completed = true;
      board.claimable = true;
      setupFetch({ contracts: board });
      const fallbackFetch = global.fetch;
      global.fetch = jest.fn(async (url: RequestInfo | URL, init?: RequestInit) => {
        if (String(url).includes('/api/contracts') && init?.method === 'POST') {
          return jsonResponse({
            contractId: 'banker',
            dnaGranted: 400,
            energyGranted: 0,
            xpGranted: 150,
          });
        }
        return fallbackFetch(url, init);
      }) as jest.Mock;
      render(<Home />);

      fireEvent.click(await screen.findByText('Contracts: 1/2 complete'));
      fireEvent.click(screen.getByTestId('contract-claim-banker'));

      await waitFor(() => {
        expect(useNotificationStore.getState().notifications.contracts).toBeUndefined();
      });
    });
  });

  describe('notification-first season rewards', () => {
    it('opens the existing season track for its semantic notification action', async () => {
      setAuthed();
      setupFetch({ season: buildSeason() });
      render(<Home />);

      await waitFor(() => {
        expect(useNotificationStore.getState().notifications.season).toMatchObject({
          badgeKind: 'numeric',
          action: 'open-season',
        });
      });
      act(() => dispatchNotificationAction('open-season'));

      expect(screen.getByTestId('season-track')).toBeInTheDocument();
    });

    it('does not advertise a premium reward the player cannot claim', async () => {
      setAuthed();
      setupFetch({ season: buildSeason({ premiumTier: true }) });
      render(<Home />);

      await waitForStats();
      await waitFor(() => {
        expect(useNotificationStore.getState().notifications.season).toBeUndefined();
      });
    });

    it('clears the season badge immediately after the final reward is claimed', async () => {
      setAuthed();
      setupFetch({ season: buildSeason() });
      const fallbackFetch = global.fetch;
      global.fetch = jest.fn(async (url: RequestInfo | URL, init?: RequestInit) => {
        if (String(url).includes('/api/season') && init?.method === 'POST') {
          return jsonResponse({ reward: { reroll_tokens: 1 } });
        }
        return fallbackFetch(url, init);
      }) as jest.Mock;
      render(<Home />);

      await waitFor(() => {
        expect(useNotificationStore.getState().notifications.season).toBeDefined();
      });
      act(() => dispatchNotificationAction('open-season'));
      fireEvent.click(screen.getByTestId('season-claim-1'));

      await waitFor(() => {
        expect(useNotificationStore.getState().notifications.season).toBeUndefined();
      });
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
      recordLastUser({ id: 'anon-1', is_anonymous: true });
      render(<Home />);

      fireEvent.click(screen.getByText('Launch'));
      fireEvent.click(screen.getByText('Continue as Guest'));

      await waitFor(() => {
        expect(signInAnonymously).toHaveBeenCalled();
      });
      await waitFor(() => {
        expect(mockPush).toHaveBeenCalledWith('/game?launch=ftue-v2');
      });
      expect(window.localStorage.getItem(PROGRESS_LOSS_NOTICE_KEY)).toBe('1');
    });

    it('takes a truly fresh guest from one Launch through auth, bootstrap, and run loading', async () => {
      const { signInAnonymously } = setUnauthed();
      render(<Home />);

      fireEvent.click(screen.getByText('Launch'));

      await waitFor(() => {
        expect(signInAnonymously).toHaveBeenCalled();
      });
      await waitFor(() => {
        expect(mockPush).toHaveBeenCalledWith('/game?launch=ftue-v2');
      });
      const urls = (global.fetch as jest.Mock).mock.calls.map((call) => String(call[0]));
      expect(urls.indexOf('/api/player/bootstrap')).toBeLessThan(
        urls.indexOf('/api/game/session')
      );
      expect(JSON.parse(String(sessionStorage.getItem(LAUNCH_HANDOFF_KEY)))).toMatchObject({
        mode: 'earn',
        bootstrap: { equippedSnake: { name: 'PRIMAL SEED', dynasty: 'PRIMAL' } },
        run: { sessionId: 'session-1' },
      });
      expect(screen.queryByTestId('progress-loss-notice')).not.toBeInTheDocument();
      expect(screen.queryByTestId('welcome-back-modal')).not.toBeInTheDocument();
    });
  });

  describe('first-run account policy', () => {
    it('does not push a save-progress banner or chip at anonymous players', async () => {
      setAuthed({ isAnonymous: true });
      render(<Home />);

      await waitForStats();
      expect(screen.queryByTestId('save-progress-chip')).not.toBeInTheDocument();
      expect(screen.queryByTestId('save-progress-banner')).not.toBeInTheDocument();
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

  describe('progressive discovery', () => {
    it('does not auto-overlay a Lab/DNA tutorial on Home', async () => {
      setAuthed();
      render(<Home />);

      await waitForStats();
      expect(
        screen.queryByText('Play to earn DNA - spend it in the Lab')
      ).not.toBeInTheDocument();
    });
  });
});

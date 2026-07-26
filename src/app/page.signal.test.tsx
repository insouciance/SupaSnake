/**
 * Home with the World Signal ARMED (Constitution §7.2, §12.2, §5 / Rule 10).
 *
 * A separate file from `page.test.tsx` because `SIGNAL_V1_ENABLED` is a
 * module-scope constant: that file is the flag-OFF proof, this one is the
 * flag-ON proof, and neither infers the other's behaviour.
 *
 * The load-bearing assertion here is the TAP COUNT. §5 puts a live board
 * within three taps of opening the game and the Signal must not spend one of
 * them: it is a surface a player chooses to look at, never a gate in front of
 * play. The suite proves it two ways — LAUNCH still reaches the board in one
 * tap with the Signal on screen, and the Signal never renders anything that
 * covers, disables or precedes it.
 */

import { act, render, screen, waitFor, fireEvent } from '@testing-library/react';
import Home from './page';
import { LAUNCH_HANDOFF_KEY } from '@/lib/ftue/launchFlow';
import { useNotificationStore } from '@/lib/stores/notificationStore';

jest.mock('@/lib/signal/config', () => ({ SIGNAL_V1_ENABLED: true }));

jest.mock('next/dynamic', () => ({
  __esModule: true,
  default: () => {
    const DynamicStub = () => <div data-testid="specimen-chamber" />;
    return DynamicStub;
  },
}));

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

jest.mock('@/lib/analytics/posthog', () => ({
  trackEvent: jest.fn(),
  setUserProperties: jest.fn(),
  isAnalyticsInitialized: () => true,
  onAnalyticsReady: (callback: () => void) => {
    callback();
    return () => {};
  },
}));

const mockUseAuth = jest.fn();
jest.mock('@/lib/auth/AuthProvider', () => ({
  useAuth: () => mockUseAuth(),
}));

const DAY_KEY = '2026-07-26';

function jsonResponse(body: unknown): Response {
  return { ok: true, status: 200, json: async () => body } as unknown as Response;
}

function signalPanel(overrides: Record<string, unknown> = {}) {
  return {
    live: true,
    day: {
      id: 'day-1',
      day: DAY_KEY,
      startsAt: `${DAY_KEY}T00:00:00.000Z`,
      endsAt: '2026-07-27T00:00:00.000Z',
      seed: 'Dabcdef12',
      condition: {
        id: 'blackout',
        name: 'Blackout',
        effect: 'Vision is cut to a narrow cone',
        strainTilt: 'UMBRA',
      },
      objectives: [
        {
          id: 'signal_endure',
          kind: 'endure',
          target: 120,
          label: 'ENDURE',
          description: 'Survive 120 seconds in a single run',
          bonusDna: 150,
        },
        {
          id: 'signal_extract',
          kind: 'extract',
          target: 300,
          label: 'EXTRACT',
          description: 'Bank a run worth 300 Yield',
          bonusDna: 150,
        },
        {
          id: 'signal_engineer',
          kind: 'engineer',
          target: 4,
          label: 'ENGINEER',
          description: 'Accept 4 genes in a single run',
          bonusDna: 150,
        },
      ],
    },
    you: {
      chosen: false,
      objectiveId: null,
      objective: null,
      progress: 0,
      target: 0,
      completed: false,
      bonusPaid: false,
    },
    marks: { signalsCompleted: 12, reached: [], next: 30 },
    ...overrides,
  };
}

interface Fixtures {
  panel?: unknown;
  panelOk?: boolean;
}

function setupFetch(fixtures: Fixtures = {}) {
  const playerBody = {
    player: { id: 'player-1', dna: 320, high_score: 777, total_games_played: 3 },
    charge: {
      remaining: 4,
      perDay: 6,
      usedToday: 2,
      day: DAY_KEY,
      refillsAt: '2026-07-27T00:00:00.000Z',
      visible: true,
    },
    collectionSize: 3,
    needsStarterSelection: false,
    hasCompletedFirstRun: true,
  };

  global.fetch = jest.fn(async (url: RequestInfo | URL, init?: RequestInit) => {
    const u = String(url);
    if (u.includes('/api/signal/panel')) {
      if (fixtures.panelOk === false) {
        return { ok: false, status: 500, json: async () => ({}) } as unknown as Response;
      }
      return jsonResponse(fixtures.panel ?? signalPanel());
    }
    if (u.includes('/api/player/bootstrap')) {
      return jsonResponse({
        ftueV2: true,
        player: { id: 'player-1', dna: 0, highScore: 0, totalGamesPlayed: 0 },
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
          isNewPlayer: false,
          starterGranted: true,
          equipmentRepaired: true,
          hasCompletedFirstRun: true,
          needsStarterSelection: false,
        },
      });
    }
    if (u.includes('/api/player')) return jsonResponse(playerBody);
    if (u.includes('/api/streaks')) return jsonResponse({ currentStreak: 5 });
    if (u.includes('/api/collection')) {
      return jsonResponse({
        snakes: [{ id: 'snake-1', isEquipped: true, dynastyName: 'PRIMAL' }],
        dnaBalance: 320,
      });
    }
    if (u.includes('/api/game/session')) {
      const body = init?.body ? JSON.parse(String(init.body)) : {};
      return body.action === 'start'
        ? jsonResponse({ sessionId: 'session-1' })
        : jsonResponse({ success: true });
    }
    return jsonResponse({});
  }) as jest.Mock;
}

function setAuthed() {
  mockUseAuth.mockReturnValue({
    isAuthenticated: true,
    isLoading: false,
    isAnonymous: false,
    signInAnonymously: jest.fn(),
    session: { access_token: 'test-token', user: { id: 'user-1' } },
  });
}

async function waitForStats() {
  await waitFor(() => expect(screen.getByText('4/6')).toBeInTheDocument());
}

function sessionStartBody(): Record<string, unknown> | null {
  const call = (global.fetch as jest.Mock).mock.calls.find(
    (c) => String(c[0]) === '/api/game/session'
  );
  return call ? JSON.parse(String(call[1]?.body)) : null;
}

describe('Home with the World Signal armed', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    window.localStorage.clear();
    window.sessionStorage.clear();
    window.history.replaceState(null, '', '/');
    useNotificationStore.setState({ notifications: {}, hasHydrated: true });
    setupFetch();
    setAuthed();
  });

  describe('the surface', () => {
    it('renders the day on Home and reads the panel with the auth token', async () => {
      render(<Home />);
      await waitForStats();

      expect(await screen.findByTestId('signal-chip')).toBeInTheDocument();
      const panelCall = (global.fetch as jest.Mock).mock.calls.find(
        (c) => String(c[0]) === '/api/signal/panel'
      );
      expect(panelCall?.[1]?.headers).toEqual({ Authorization: 'Bearer test-token' });
    });

    it('opens the day\'s three objectives from the chip', async () => {
      render(<Home />);
      await waitForStats();

      fireEvent.click(await screen.findByTestId('signal-chip'));

      expect(screen.getByTestId('signal-objective-signal_endure')).toBeInTheDocument();
      expect(screen.getByTestId('signal-objective-signal_extract')).toBeInTheDocument();
      expect(screen.getByTestId('signal-objective-signal_engineer')).toBeInTheDocument();
    });

    it('is the ONLY daily surface — no contracts board comes back beside it', async () => {
      render(<Home />);
      await waitForStats();
      fireEvent.click(await screen.findByTestId('signal-chip'));

      // §12.2: the Signal replaces the retired Contracts slot; it does not sit
      // beside a revived one.
      expect(screen.queryByTestId('contracts-board')).not.toBeInTheDocument();
      expect(screen.queryByText('Daily Contracts')).not.toBeInTheDocument();
      const urls = (global.fetch as jest.Mock).mock.calls.map((c) => String(c[0]));
      expect(urls.some((u) => u.includes('/api/contracts'))).toBe(false);
    });

    it('renders a clean off state, not an error, when the day is not live', async () => {
      setupFetch({
        panel: {
          live: false,
          day: null,
          you: {
            chosen: false,
            objectiveId: null,
            objective: null,
            progress: 0,
            target: 0,
            completed: false,
            bonusPaid: false,
          },
          marks: { signalsCompleted: 0, reached: [], next: 30 },
        },
      });
      render(<Home />);
      await waitForStats();

      fireEvent.click(await screen.findByTestId('signal-chip'));
      expect(screen.getByTestId('signal-off')).toBeInTheDocument();
      expect(screen.queryByTestId('signal-error')).not.toBeInTheDocument();
    });

    it('surfaces a failed panel read as an error state', async () => {
      setupFetch({ panelOk: false });
      render(<Home />);
      await waitForStats();

      fireEvent.click(await screen.findByTestId('signal-chip'));
      expect(screen.getByTestId('signal-error')).toBeInTheDocument();
      expect(screen.queryByTestId('signal-objectives')).not.toBeInTheDocument();
    });

    it('reads an already-taken day as progress, offering no second choice', async () => {
      const panel = signalPanel();
      panel.you = {
        chosen: true,
        objectiveId: 'signal_extract',
        objective: panel.day.objectives[1],
        progress: 180,
        target: 300,
        completed: false,
        bonusPaid: false,
      };
      setupFetch({ panel });
      render(<Home />);
      await waitForStats();

      fireEvent.click(await screen.findByTestId('signal-chip'));
      expect(screen.getByTestId('signal-taken')).toBeInTheDocument();
      expect(screen.getByText('180 / 300')).toBeInTheDocument();
      expect(screen.queryByTestId('signal-objectives')).not.toBeInTheDocument();
    });
  });

  describe('taking the day', () => {
    it('starts the day\'s Signal run with the objective as a lookup key', async () => {
      render(<Home />);
      await waitForStats();

      fireEvent.click(await screen.findByTestId('signal-chip'));
      fireEvent.click(screen.getByTestId('signal-objective-signal_extract'));

      await waitFor(() => {
        expect(mockPush).toHaveBeenCalledWith('/game?launch=ftue-v2');
      });

      // §8.6: the take and the START are one request, so the exemption is
      // decided at the moment the charge is. `mode: 'signal'` is a REQUEST;
      // the day, the target and the condition are all server-derived, and
      // there is deliberately no field for them here (Rule 11).
      const body = sessionStartBody();
      expect(body).toMatchObject({
        action: 'start',
        mode: 'signal',
        signalObjectiveId: 'signal_extract',
      });
      expect(body).not.toHaveProperty('day');
      expect(body).not.toHaveProperty('target');
      expect(body).not.toHaveProperty('seed');
      expect(body).not.toHaveProperty('condition');
      expect(body).not.toHaveProperty('signalObjectiveRunId');

      expect(
        JSON.parse(String(sessionStorage.getItem(LAUNCH_HANDOFF_KEY)))
      ).toMatchObject({ run: { sessionId: 'session-1' } });
    });

    it('takes exactly the objective the player tapped', async () => {
      render(<Home />);
      await waitForStats();

      fireEvent.click(await screen.findByTestId('signal-chip'));
      fireEvent.click(screen.getByTestId('signal-objective-signal_engineer'));

      await waitFor(() => expect(sessionStartBody()).not.toBeNull());
      expect(sessionStartBody()).toMatchObject({
        signalObjectiveId: 'signal_engineer',
      });
    });

    it('never claims a reward — taking opens an attempt and pays nothing', async () => {
      render(<Home />);
      await waitForStats();

      fireEvent.click(await screen.findByTestId('signal-chip'));
      fireEvent.click(screen.getByTestId('signal-objective-signal_endure'));

      await waitFor(() => expect(mockPush).toHaveBeenCalled());
      // §7.2: "rewards settle automatically — no claim cascades, ever."
      const urls = (global.fetch as jest.Mock).mock.calls.map((c) => String(c[0]));
      expect(urls.some((u) => /claim/i.test(u))).toBe(false);
    });
  });

  describe('the tap count is unchanged (§5, Rule 10)', () => {
    it('still reaches a prepared board in ONE tap on LAUNCH, Signal on screen', async () => {
      render(<Home />);
      await waitForStats();
      // The Signal is loaded and visible — this is the state that could have
      // cost a tap, and does not.
      expect(await screen.findByTestId('signal-chip')).toBeInTheDocument();

      fireEvent.click(screen.getByTestId('launch-cta'));

      await waitFor(() => {
        expect(mockPush).toHaveBeenCalledWith('/game?launch=ftue-v2');
      });
      expect(mockPush).toHaveBeenCalledTimes(1);
      // Identical to the flag-off baseline in `page.test.tsx`: an ordinary
      // LAUNCH is an ordinary earning run, untouched by the Signal.
      expect(sessionStartBody()).toMatchObject({ action: 'start', mode: 'earn' });
      expect(sessionStartBody()).not.toHaveProperty('signalObjectiveId');
    });

    it('never renders a gate, dialog or interstitial in front of LAUNCH', async () => {
      render(<Home />);
      await waitForStats();
      await screen.findByTestId('signal-chip');

      // Nothing modal, and the primary action is enabled and reachable from
      // the first paint — the Signal card is not even open until asked for.
      expect(screen.queryByTestId('signal-card')).not.toBeInTheDocument();
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
      expect(screen.getByTestId('launch-cta')).not.toBeDisabled();
    });

    it('leaves LAUNCH available while the Signal card is open', async () => {
      render(<Home />);
      await waitForStats();
      fireEvent.click(await screen.findByTestId('signal-chip'));
      expect(screen.getByTestId('signal-card')).toBeInTheDocument();

      fireEvent.click(screen.getByTestId('launch-cta'));

      await waitFor(() => {
        expect(mockPush).toHaveBeenCalledWith('/game?launch=ftue-v2');
      });
      expect(sessionStartBody()).toMatchObject({ mode: 'earn' });
    });

    it('does not read the Signal before the player has finished a first run', async () => {
      // FTUE v2: a first run is never made to compete with a daily. Same
      // threshold every other meta surface on Home uses.
      global.fetch = jest.fn(async (url: RequestInfo | URL) => {
        const u = String(url);
        if (u.includes('/api/player')) {
          return jsonResponse({
            player: { id: 'player-1', dna: 0, high_score: 0, total_games_played: 0 },
            charge: {
              remaining: 6,
              perDay: 6,
              usedToday: 0,
              day: DAY_KEY,
              refillsAt: '2026-07-27T00:00:00.000Z',
              visible: false,
            },
            collectionSize: 1,
            needsStarterSelection: false,
            hasCompletedFirstRun: false,
          });
        }
        if (u.includes('/api/streaks')) return jsonResponse({ currentStreak: 0 });
        return jsonResponse({});
      }) as jest.Mock;

      render(<Home />);
      await waitFor(() =>
        expect(screen.getByText('Your first run is ready')).toBeInTheDocument()
      );
      await act(async () => {
        await Promise.resolve();
      });

      expect(screen.queryByTestId('signal-chip')).not.toBeInTheDocument();
      const urls = (global.fetch as jest.Mock).mock.calls.map((c) => String(c[0]));
      expect(urls.some((u) => u.includes('/api/signal'))).toBe(false);
    });
  });
});

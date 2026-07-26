/**
 * @jest-environment jsdom
 */

import {
  INITIAL_LAUNCH_STATE,
  LAUNCH_HANDOFF_KEY,
  bootstrapForLaunch,
  consumeLaunchHandoff,
  launchHandoffStorageAvailable,
  prepareLaunchHandoff,
  storeLaunchHandoff,
  transitionLaunch,
  type LaunchHandoff,
} from './launchFlow';
import type { FtueBootstrapResponse } from './types';

const bootstrap: FtueBootstrapResponse = {
  ftueV2: true,
  player: {
    id: 'player-1',
    dna: 0,
    energy: 5,
    maxEnergy: 5,
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
};

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

describe('FTUE v2 launch flow', () => {
  beforeEach(() => sessionStorage.clear());

  it('moves through every prerequisite and ignores stale completion events', () => {
    let state = transitionLaunch(INITIAL_LAUNCH_STATE, {
      type: 'BEGIN',
      alreadyAuthenticated: false,
    });
    expect(state.phase).toBe('authenticating');
    expect(transitionLaunch(state, { type: 'RUN_LOADED' })).toBe(state);

    state = transitionLaunch(state, { type: 'AUTHENTICATED' });
    expect(state.phase).toBe('bootstrapping');
    state = transitionLaunch(state, { type: 'BOOTSTRAPPED' });
    expect(state.phase).toBe('loading-run');
    state = transitionLaunch(state, { type: 'RUN_LOADED' });
    expect(state.phase).toBe('board-ready');
  });

  it('moves failures to an in-place Retry state', () => {
    const state = transitionLaunch(
      { phase: 'bootstrapping', error: null },
      { type: 'FAIL', error: 'Network unavailable' }
    );
    expect(state).toEqual({ phase: 'failed', error: 'Network unavailable' });
    expect(
      transitionLaunch(state, { type: 'BEGIN', alreadyAuthenticated: true }).phase
    ).toBe('bootstrapping');
  });

  it('authenticates bootstrap requests and rejects incomplete success payloads', async () => {
    const fetcher = jest.fn().mockResolvedValue(jsonResponse(bootstrap));
    await expect(bootstrapForLaunch('token', fetcher)).resolves.toEqual(bootstrap);
    expect(fetcher).toHaveBeenCalledWith('/api/player/bootstrap', {
      method: 'POST',
      headers: { Authorization: 'Bearer token' },
    });

    fetcher.mockResolvedValueOnce(jsonResponse({ ftueV2: true }));
    await expect(bootstrapForLaunch('token', fetcher)).rejects.toThrow(
      'incomplete data'
    );
  });

  it('starts an earning run with the authoritative equipped snake', async () => {
    const fetcher = jest.fn().mockResolvedValue(
      jsonResponse({ sessionId: 'session-1' })
    );

    const handoff = await prepareLaunchHandoff('token', 'user-1', bootstrap, fetcher);

    expect(handoff.mode).toBe('earn');
    expect(JSON.parse(String(fetcher.mock.calls[0][1]?.body))).toEqual({
      action: 'start',
      mode: 'earn',
      snake_id: 'snake-1',
    });
  });

  it('sends a taken Signal objective on the START request (§7.2, §8.6)', async () => {
    const fetcher = jest.fn().mockResolvedValue(
      jsonResponse({ sessionId: 'session-signal' })
    );

    const handoff = await prepareLaunchHandoff(
      'token',
      'user-1',
      bootstrap,
      fetcher,
      'signal_extract'
    );

    // The take and the START are ONE request: migration 049 binds the day's
    // attempt to an OPEN run, and §8.6 decides the charge in the same call.
    // Taking the objective separately after an ordinary start would burn a
    // charge on the run the Constitution makes exempt.
    expect(JSON.parse(String(fetcher.mock.calls[0][1]?.body))).toEqual({
      action: 'start',
      mode: 'signal',
      signalObjectiveId: 'signal_extract',
      snake_id: 'snake-1',
    });
    // Client-side a Signal run is an ordinary EARNING run; only the server
    // knows it is the day's attempt, and only because it derived the day.
    expect(handoff.mode).toBe('earn');
  });

  it('sends no Signal field when the player did not take one', async () => {
    const fetcher = jest.fn().mockResolvedValue(
      jsonResponse({ sessionId: 'session-1' })
    );

    await prepareLaunchHandoff('token', 'user-1', bootstrap, fetcher, '');

    // An empty id is not a choice. `mode: 'signal'` with an objective the day
    // did not derive would be refused by the server anyway, but an ordinary
    // LAUNCH must not even ask.
    const body = JSON.parse(String(fetcher.mock.calls[0][1]?.body));
    expect(body).toEqual({ action: 'start', mode: 'earn', snake_id: 'snake-1' });
    expect(body).not.toHaveProperty('signalObjectiveId');
  });

  it('always launches an earning run, whatever the day\'s charges (§8.6)', async () => {
    // There is no energy race left to recover from: the server cannot
    // reject a start for lack of charges, so Launch never silently demotes
    // the player to practice. A spent day yields a lean earning run.
    const fetcher = jest.fn().mockResolvedValueOnce(
      jsonResponse({
        sessionId: 'session-lean',
        charge: {
          state: 'lean',
          remaining: 0,
          perDay: 6,
          usedToday: 6,
          day: '2026-07-25',
          refillsAt: '2026-07-26T00:00:00.000Z',
          visible: true,
        },
      })
    );

    const handoff = await prepareLaunchHandoff('token', 'user-1', bootstrap, fetcher);

    expect(handoff.mode).toBe('earn');
    expect(handoff.run.charge?.state).toBe('lean');
    // One request only - no probe, no retry-as-free.
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(JSON.parse(String(fetcher.mock.calls[0][1]?.body)).mode).toBe('earn');
  });

  it('does not retry as free when a start genuinely fails', async () => {
    // The old retry-as-free branch masked exactly one 400. With the gate
    // gone, every failure must surface for Retry rather than be papered
    // over with a rewardless run the player did not ask for.
    const fetcher = jest
      .fn()
      .mockResolvedValueOnce(jsonResponse({ error: 'Snake not found or not owned' }, 400));

    await expect(
      prepareLaunchHandoff('token', 'user-1', bootstrap, fetcher)
    ).rejects.toThrow();
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it('stores transient initialization and consumes it exactly once', () => {
    const handoff: LaunchHandoff = {
      version: 1,
      createdAt: 1_000,
      userId: 'user-1',
      mode: 'earn',
      bootstrap,
      run: { sessionId: 'session-1' },
    };

    expect(storeLaunchHandoff(handoff, sessionStorage)).toBe(true);
    expect(consumeLaunchHandoff('user-1', sessionStorage, 2_000)).toEqual(handoff);
    expect(consumeLaunchHandoff('user-1', sessionStorage, 2_000)).toBeNull();
  });

  it('checks transient storage before creating a server run', () => {
    expect(launchHandoffStorageAvailable(sessionStorage)).toBe(true);
    const blocked = {
      getItem: jest.fn(),
      removeItem: jest.fn(),
      setItem: jest.fn(() => {
        throw new Error('blocked');
      }),
      clear: jest.fn(),
      key: jest.fn(),
      length: 0,
    } satisfies Storage;
    expect(launchHandoffStorageAvailable(blocked)).toBe(false);
  });

  it('discards stale or wrong-identity handoffs before they can start a board', () => {
    const handoff: LaunchHandoff = {
      version: 1,
      createdAt: 1_000,
      userId: 'user-1',
      mode: 'earn',
      bootstrap,
      run: { sessionId: 'session-1' },
    };
    sessionStorage.setItem(LAUNCH_HANDOFF_KEY, JSON.stringify(handoff));
    expect(consumeLaunchHandoff('user-2', sessionStorage, 2_000)).toBeNull();
    expect(sessionStorage.getItem(LAUNCH_HANDOFF_KEY)).toBeNull();

    sessionStorage.setItem(LAUNCH_HANDOFF_KEY, JSON.stringify(handoff));
    expect(consumeLaunchHandoff('user-1', sessionStorage, 400_000)).toBeNull();
  });
});

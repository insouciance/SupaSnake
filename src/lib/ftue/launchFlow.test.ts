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
      jsonResponse({ sessionId: 'session-1', energy: 4, energyRegenAt: null })
    );

    const handoff = await prepareLaunchHandoff('token', 'user-1', bootstrap, fetcher);

    expect(handoff.mode).toBe('earn');
    expect(JSON.parse(String(fetcher.mock.calls[0][1]?.body))).toEqual({
      action: 'start',
      mode: 'earn',
      snake_id: 'snake-1',
    });
  });

  it('recovers an energy race by preparing a free run', async () => {
    const fetcher = jest
      .fn()
      .mockResolvedValueOnce(jsonResponse({ error: 'Not enough energy' }, 400))
      .mockResolvedValueOnce(
        jsonResponse({
          sessionId: 'session-free',
          energy: 0,
          energyRegenAt: null,
          freePlay: true,
        })
      );

    const handoff = await prepareLaunchHandoff('token', 'user-1', bootstrap, fetcher);

    expect(handoff.mode).toBe('free');
    expect(fetcher).toHaveBeenCalledTimes(2);
    expect(JSON.parse(String(fetcher.mock.calls[1][1]?.body)).mode).toBe('free');
  });

  it('stores transient initialization and consumes it exactly once', () => {
    const handoff: LaunchHandoff = {
      version: 1,
      createdAt: 1_000,
      userId: 'user-1',
      mode: 'earn',
      bootstrap,
      run: { sessionId: 'session-1', energy: 4, energyRegenAt: null },
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
      run: { sessionId: 'session-1', energy: 4, energyRegenAt: null },
    };
    sessionStorage.setItem(LAUNCH_HANDOFF_KEY, JSON.stringify(handoff));
    expect(consumeLaunchHandoff('user-2', sessionStorage, 2_000)).toBeNull();
    expect(sessionStorage.getItem(LAUNCH_HANDOFF_KEY)).toBeNull();

    sessionStorage.setItem(LAUNCH_HANDOFF_KEY, JSON.stringify(handoff));
    expect(consumeLaunchHandoff('user-1', sessionStorage, 400_000)).toBeNull();
  });
});

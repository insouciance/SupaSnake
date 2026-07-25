/**
 * @jest-environment node
 */

var mockGetUser: jest.Mock;
var mockFrom: jest.Mock;
var mockRpc: jest.Mock;
var mockCheckRateLimit: jest.Mock;

jest.mock('@supabase/supabase-js', () => ({
  createClient: () => ({
    auth: { getUser: (...args: unknown[]) => mockGetUser(...args) },
    from: (...args: unknown[]) => mockFrom(...args),
    rpc: (...args: unknown[]) => mockRpc(...args),
  }),
}));

jest.mock('@/lib/server/rateLimit', () => ({
  checkRateLimit: (...args: unknown[]) => mockCheckRateLimit(...args),
}));

jest.mock('@/lib/ftue/config', () => ({ FTUE_V2_ENABLED: true }));

import { NextRequest } from 'next/server';
import { POST } from './route';

const REPAIRED_PLAYER = {
  id: 'player-1',
  energy: 5,
  dna: 0,
  max_energy: 5,
  energy_regen_at: null,
};

function request() {
  return new NextRequest('http://localhost/api/game/session', {
    method: 'POST',
    headers: {
      authorization: 'Bearer token',
      'content-type': 'application/json',
    },
    // Omitting snake_id gives the handler a deterministic stop immediately
    // after player repair and the rate check, before unrelated start queries.
    body: JSON.stringify({ action: 'start', mode: 'free' }),
  });
}

/**
 * WP-0.06 added one `game_sessions` write to the start path: the sweep that
 * closes this player's own runs left open past the stale window. It runs after
 * the repair and the rate check, so the ordering this suite exists to protect
 * is unchanged — but it is a table access, so the fake has to answer for it.
 */
function playerLookupSequence(
  results: Array<{ data: typeof REPAIRED_PLAYER | null; error: { code: string } | null }>
) {
  return jest.fn((table: string) => {
    if (table === 'game_sessions') {
      const chain: Record<string, unknown> = {};
      for (const op of ['update', 'eq', 'is', 'lt', 'select']) {
        chain[op] = () => chain;
      }
      chain.then = (onFulfilled: (v: unknown) => unknown) =>
        Promise.resolve({ data: [], error: null }).then(onFulfilled);
      return chain;
    }
    if (table !== 'players') throw new Error(`Unexpected table ${table}`);
    return {
      select: () => ({
        eq: () => ({
          single: () => Promise.resolve(results.shift()),
        }),
      }),
    };
  });
}

/** Calls to `players` only — the sweep's `game_sessions` write is separate. */
const playerLookups = () =>
  mockFrom.mock.calls.filter(([table]) => table === 'players').length;

describe('POST /api/game/session start repair', () => {
  beforeEach(() => {
    mockGetUser = jest.fn().mockResolvedValue({
      data: { user: { id: 'user-1' } },
      error: null,
    });
    mockRpc = jest.fn();
    mockCheckRateLimit = jest.fn().mockResolvedValue({ allowed: true });
  });

  it('bootstraps and re-queries a missing FTUE-v2 player before start-side writes', async () => {
    mockFrom = playerLookupSequence([
      { data: null, error: { code: 'PGRST116' } },
      { data: REPAIRED_PLAYER, error: null },
    ]);
    mockRpc.mockResolvedValue({ data: { onboarding: { version: 2 } }, error: null });

    const response = await POST(request());
    const body = await response.json();

    expect(mockRpc).toHaveBeenCalledWith('bootstrap_player', {
      p_user_id: 'user-1',
    });
    expect(playerLookups()).toBe(2);
    expect(mockCheckRateLimit).toHaveBeenCalledWith(
      expect.any(Object),
      REPAIRED_PLAYER.id,
      'game_start'
    );
    expect(response.status).toBe(400);
    expect(body).toEqual({ error: 'snake_id is required' });
  });

  it('keeps bootstrap failure retryable and performs no start-side write', async () => {
    mockFrom = playerLookupSequence([
      { data: null, error: { code: 'PGRST116' } },
    ]);
    mockRpc.mockResolvedValue({
      data: null,
      error: { code: 'XX000', message: 'transaction aborted' },
    });

    const response = await POST(request());
    const body = await response.json();

    expect(response.status).toBe(503);
    expect(body).toEqual({
      error: 'Player preparation failed — retry when you are ready',
    });
    expect(playerLookups()).toBe(1);
    expect(mockCheckRateLimit).not.toHaveBeenCalled();
  });
});

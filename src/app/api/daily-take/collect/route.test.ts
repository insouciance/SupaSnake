/**
 * @jest-environment node
 *
 * POST /api/daily-take/collect — the published contract (Constitution §7.2).
 *
 * The game's ONE claim (§12.2), so this file carries WP-1.04's sharpest
 * acceptance criterion: calling it twice must grant nothing the second time,
 * and that must be true because of what the server does, not because of what
 * the surface disabled.
 *
 * The flag-OFF payload is a 200 with `live: false`, never a 404 — the rollback
 * path is TESTED, never inferred from an omitted flag.
 */

const mockCaptureException = jest.fn();
const mockGetUser = jest.fn();
const mockFrom = jest.fn();
const mockRpc = jest.fn();

jest.mock('@sentry/nextjs', () => ({
  captureException: (...args: unknown[]) => mockCaptureException(...args),
}));

jest.mock('@supabase/supabase-js', () => ({
  createClient: () => ({
    auth: { getUser: (...args: unknown[]) => mockGetUser(...args) },
    from: (table: string) => mockFrom(table),
    rpc: (fn: string, params: unknown) => mockRpc(fn, params),
  }),
}));

import { NextRequest } from 'next/server';
import { TAKE_COLLECT_ENDPOINT } from '@/lib/game/dailyTake';

type RouteModule = typeof import('./route');

function loadRoute(enabled: boolean): RouteModule {
  if (enabled) {
    process.env.NEXT_PUBLIC_DAILY_TAKE_V1 = 'true';
  } else {
    delete process.env.NEXT_PUBLIC_DAILY_TAKE_V1;
  }
  let mod!: RouteModule;
  jest.isolateModules(() => {
    mod = require('./route') as RouteModule;
  });
  return mod;
}

function request(authorization?: string, body: unknown = {}) {
  const headers: Record<string, string> = { 'content-type': 'application/json' };
  if (authorization) headers.authorization = authorization;
  return new NextRequest('http://localhost/api/daily-take/collect', {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
  });
}

/** The player lookup the route performs before collecting. */
function playerFound(found = true) {
  mockFrom.mockImplementation(() => {
    const chain: Record<string, unknown> = {};
    chain.select = () => chain;
    chain.eq = () => chain;
    chain.maybeSingle = () =>
      Promise.resolve({ data: found ? { id: 'player-1' } : null, error: null });
    return chain;
  });
}

/**
 * A `collect_daily_take` double that behaves the way migration 050 does: the
 * FIRST call in a UTC day claims it, and every call after that finds the day
 * settled and grants nothing. That behaviour is the compare-and-set; this
 * models it so the route can be tested against it.
 */
function rpcThatClaimsTheDayOnce() {
  let claimedBy: string | null = null;
  mockRpc.mockImplementation((_fn: string, params: { p_player_id: string }) => {
    const first = claimedBy === null;
    if (first) claimedBy = params.p_player_id;
    return Promise.resolve({
      data: {
        collected: first,
        already_collected: !first,
        amount: first ? 200 : 0,
        tier: 3,
        multiplier: '2',
        streak_days: 14,
        longest_streak: 40,
        cooled: false,
        day: '2026-07-26',
        dna: 1200,
      },
      error: null,
    });
  });
}

beforeEach(() => {
  mockCaptureException.mockReset();
  mockGetUser.mockReset();
  mockFrom.mockReset();
  mockRpc.mockReset();
  mockGetUser.mockResolvedValue({ data: { user: { id: 'user-1' } }, error: null });
});

describe('the route WP-1.06 was already pointed at', () => {
  it('lives at the path the Results slot posts to', () => {
    expect(TAKE_COLLECT_ENDPOINT).toBe('/api/daily-take/collect');
  });

  it('is not named like a claim, so §12.2 s pinned list cannot grow', () => {
    // `faucetPurge.test.ts` pins every route directory matching
    // /reward|claim|bonus|stipend/ to exactly ['player/claim-offline'].
    expect(/reward|claim|bonus|stipend/i.test('daily-take/collect')).toBe(false);
  });
});

describe('authentication', () => {
  it('refuses a request with no Authorization header', async () => {
    const route = loadRoute(true);
    const response = await route.POST(request());
    expect(response.status).toBe(401);
    expect(mockRpc).not.toHaveBeenCalled();
  });

  it('refuses an invalid token', async () => {
    const route = loadRoute(true);
    mockGetUser.mockResolvedValue({ data: { user: null }, error: { message: 'bad token' } });
    const response = await route.POST(request('Bearer nope'));
    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({ error: 'Invalid token' });
    expect(mockRpc).not.toHaveBeenCalled();
  });

  it('answers 404 for a signed-in user with no player row', async () => {
    const route = loadRoute(true);
    playerFound(false);
    const response = await route.POST(request('Bearer ok'));
    expect(response.status).toBe(404);
    expect(mockRpc).not.toHaveBeenCalled();
  });
});

describe('collecting', () => {
  it('pays the Take once, with the tier applied', async () => {
    const route = loadRoute(true);
    playerFound();
    rpcThatClaimsTheDayOnce();

    const response = await route.POST(request('Bearer ok'));

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      live: true,
      collected: true,
      amount: 200,
      streakDays: 14,
      multiplier: 2,
      cooled: false,
      dna: 1200,
    });
  });

  it('DOUBLE COLLECT IS IMPOSSIBLE — the second call grants nothing', async () => {
    const route = loadRoute(true);
    playerFound();
    rpcThatClaimsTheDayOnce();

    const first = await (await route.POST(request('Bearer ok'))).json();
    const second = await (await route.POST(request('Bearer ok'))).json();

    expect(first).toMatchObject({ collected: true, amount: 200, dna: 1200 });
    expect(second).toMatchObject({ collected: false, amount: 0, dna: null });
  });

  it('grants nothing on ten concurrent taps', async () => {
    const route = loadRoute(true);
    playerFound();
    rpcThatClaimsTheDayOnce();

    const responses = await Promise.all(
      Array.from({ length: 10 }, () => route.POST(request('Bearer ok')))
    );
    const bodies = await Promise.all(responses.map((r) => r.json()));

    expect(bodies.filter((b) => b.collected === true)).toHaveLength(1);
    expect(bodies.reduce((sum, b) => sum + b.amount, 0)).toBe(200);
    // Every one of them is a 200. A replay is not an error.
    expect(responses.every((r) => r.status === 200)).toBe(true);
  });

  it('reports the cooled flag when the collect walked the ladder down', async () => {
    const route = loadRoute(true);
    playerFound();
    mockRpc.mockResolvedValue({
      data: {
        collected: true,
        amount: 150,
        tier: 2,
        multiplier: '1.5',
        streak_days: 7,
        longest_streak: 40,
        cooled: true,
        dna: 900,
      },
      error: null,
    });

    const body = await (await route.POST(request('Bearer ok'))).json();

    expect(body).toMatchObject({ collected: true, amount: 150, multiplier: 1.5, cooled: true });
  });
});

describe('the request cannot name what it collects (Rule 11)', () => {
  it('passes only the player id to the RPC, whatever the body says', async () => {
    const route = loadRoute(true);
    playerFound();
    rpcThatClaimsTheDayOnce();

    await route.POST(
      request('Bearer ok', {
        amount: 999999,
        multiplier: 100,
        tier: 4,
        streakDays: 365,
        day: '2020-01-01',
        playerId: 'somebody-else',
        sessionId: 'a-run-that-pays',
      })
    );

    expect(mockRpc).toHaveBeenCalledTimes(1);
    expect(mockRpc).toHaveBeenCalledWith('collect_daily_take', { p_player_id: 'player-1' });
  });

  it('survives a body that is not JSON at all', async () => {
    const route = loadRoute(true);
    playerFound();
    rpcThatClaimsTheDayOnce();

    const response = await route.POST(
      new NextRequest('http://localhost/api/daily-take/collect', {
        method: 'POST',
        headers: { authorization: 'Bearer ok' },
        body: 'not json',
      })
    );

    // The body is never read, so there is nothing to fail on.
    expect(response.status).toBe(200);
  });

  it('never grants to a player other than the token s own', async () => {
    const route = loadRoute(true);
    playerFound();
    rpcThatClaimsTheDayOnce();

    await route.POST(request('Bearer ok', { playerId: 'victim' }));

    expect(mockRpc).toHaveBeenCalledWith('collect_daily_take', { p_player_id: 'player-1' });
  });
});

describe('the flag-off rollback path', () => {
  it('answers 200 with live:false and touches no database at all', async () => {
    const route = loadRoute(false);
    playerFound();
    rpcThatClaimsTheDayOnce();

    const response = await route.POST(request('Bearer ok'));

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      live: false,
      collected: false,
      amount: 0,
      streakDays: 0,
      multiplier: 1,
      cooled: false,
      dna: null,
    });
    expect(mockRpc).not.toHaveBeenCalled();
    expect(mockFrom).not.toHaveBeenCalled();
  });

  it('is a 200, not a 404 — the off state stays distinguishable', async () => {
    const route = loadRoute(false);
    const response = await route.POST(request('Bearer ok'));
    // `collectDailyTake` in src/lib/game/dailyTake.ts maps 404/405/501 to
    // "the mechanism is not deployed". A flag flip is not that.
    expect([404, 405, 501]).not.toContain(response.status);
  });

  it('still refuses an unauthenticated request with the flag off', async () => {
    const route = loadRoute(false);
    const response = await route.POST(request());
    expect(response.status).toBe(401);
  });
});

describe('failures (Rule 11)', () => {
  it('answers 503 and reports when the collect itself fails', async () => {
    const route = loadRoute(true);
    playerFound();
    mockRpc.mockResolvedValue({
      data: null,
      error: { code: '40001', message: 'could not serialize access' },
    });

    const response = await route.POST(request('Bearer ok'));

    expect(response.status).toBe(503);
    expect(mockCaptureException).toHaveBeenCalled();
  });

  it('answers 503 and reports when the player lookup fails', async () => {
    const route = loadRoute(true);
    mockFrom.mockImplementation(() => {
      const chain: Record<string, unknown> = {};
      chain.select = () => chain;
      chain.eq = () => chain;
      chain.maybeSingle = () =>
        Promise.resolve({ data: null, error: { code: '57014', message: 'statement timeout' } });
      return chain;
    });

    const response = await route.POST(request('Bearer ok'));

    expect(response.status).toBe(503);
    expect(mockCaptureException).toHaveBeenCalledTimes(1);
    expect(mockRpc).not.toHaveBeenCalled();
  });

  it('answers live:false before migration 050 applies', async () => {
    const route = loadRoute(true);
    playerFound();
    mockRpc.mockResolvedValue({
      data: null,
      error: { code: 'PGRST202', message: 'Could not find the function collect_daily_take' },
    });

    const response = await route.POST(request('Bearer ok'));

    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ live: false, collected: false, amount: 0 });
    expect(mockCaptureException).not.toHaveBeenCalled();
  });
});

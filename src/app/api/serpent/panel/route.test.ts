/**
 * @jest-environment node
 *
 * GET /api/serpent/panel — the published contract (Constitution §7.3).
 *
 * WP-1.07 builds its surfaces against the shape asserted here, so these tests
 * are the contract's executable half: the flag-off payload, the authenticated
 * payload, and the guarantee that nothing in either is a threshold, a currency
 * or a claim.
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
import { GET } from './route';

function request(authorization?: string) {
  const headers: Record<string, string> = {};
  if (authorization) headers.authorization = authorization;
  return new NextRequest('http://localhost/api/serpent/panel', { headers });
}

function tableRows(rows: Record<string, unknown[]>) {
  mockFrom.mockImplementation((table: string) => {
    const data = rows[table] ?? [];
    const chain: Record<string, unknown> = {};
    for (const op of ['eq', 'in', 'is', 'not', 'gt', 'lte', 'neq', 'or', 'order', 'limit']) {
      chain[op] = () => chain;
    }
    chain.select = () => {
      const promise = Promise.resolve({ data, error: null });
      return Object.assign(chain, {
        then: promise.then.bind(promise),
        catch: promise.catch.bind(promise),
        finally: promise.finally.bind(promise),
      });
    };
    chain.maybeSingle = () => Promise.resolve({ data: data[0] ?? null, error: null });
    chain.single = chain.maybeSingle;
    return chain;
  });
}

beforeEach(() => {
  jest.clearAllMocks();
  mockGetUser.mockResolvedValue({ data: { user: { id: 'u1' } }, error: null });
  mockRpc.mockResolvedValue({ data: null, error: null });
  tableRows({ players: [{ id: 'p1' }] });
});

describe('authentication', () => {
  it('401s without a bearer', async () => {
    const response = await GET(request());
    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({ error: 'Unauthorized' });
  });

  it('401s on an invalid token', async () => {
    mockGetUser.mockResolvedValue({ data: { user: null }, error: { message: 'bad token' } });
    const response = await GET(request('Bearer nope'));
    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({ error: 'Invalid token' });
  });

  it('404s when the account has no player row', async () => {
    tableRows({ players: [] });
    const response = await GET(request('Bearer good'));
    expect(response.status).toBe(404);
  });
});

describe('the contract, with the flag OFF (the tested rollback path)', () => {
  it('answers 200 with a renderable off state, never a 404 or a 500', async () => {
    // NEXT_PUBLIC_SERPENT_V1 is unset in the test environment, which is the
    // production default until the Phase 1 gate.
    const response = await GET(request('Bearer good'));
    expect(response.status).toBe(200);

    const body = await response.json();
    expect(body).toEqual({
      live: false,
      week: null,
      you: {
        depth: 0,
        attempts: 0,
        bestYield: 0,
        countedYields: [],
        countedRuns: 3,
        bestWeekDepth: 0,
        lifetimeDepth: 0,
        deltaVsBestWeek: 0,
      },
      clan: null,
      history: [],
      chronicle: [],
    });
  });

  it('resolves no week, so no run can be flagged while the flag is off', async () => {
    await GET(request('Bearer good'));
    expect(mockRpc).not.toHaveBeenCalledWith('ensure_serpent_week', expect.anything());
  });

  it('carries no claim, no currency and no threshold in the off state either', async () => {
    const body = JSON.stringify(await (await GET(request('Bearer good'))).json());
    for (const forbidden of ['dna', 'claim', 'collect', 'threshold', 'reward', 'purchase']) {
      expect(body.toLowerCase()).not.toContain(forbidden);
    }
  });
});

/**
 * @jest-environment node
 *
 * Own Chronicle API tests (Player Identity v1 sections 6.3 + 7):
 * - GET: auth gate, lazy refresh behind the records_refresh rate limit
 *   (60s) - a second view inside the window must NOT recompute
 * - POST refresh: 429 inside the window, single RPC per allowed window
 *   (no duplicate grants at the route level), pre-023 degradation
 */

var mockAuth: jest.Mock;
var mockFrom: jest.Mock;
var mockRpc: jest.Mock;

jest.mock('@supabase/supabase-js', () => ({
  createClient: () => ({
    auth: { getUser: (...args: unknown[]) => mockAuth(...args) },
    from: (...args: unknown[]) => mockFrom(...args),
    rpc: (...args: unknown[]) => mockRpc(...args),
  }),
}));

jest.mock('@/lib/server/chronicle', () => ({
  buildChronicle: jest.fn(async () => ({
    identity: { playerId: 'player-1', displayHandle: 'Souci', legacyScore: 40 },
    legacyScore: 40,
    recordsLive: true,
    earningRuns: 12,
    limited: false,
    records: { records: [], capstones: [] },
    pbTimeline: { points: [], annotations: [] },
    collectionLog: [],
    seasons: [],
    clan: null,
  })),
}));

import { GET, POST } from './route';
import { NextRequest } from 'next/server';

const REFRESH_OK = {
  success: true,
  legacy_score: 40,
  records: { vault: { value: 6000, tier: 1 } },
};

function makeRequest(method: 'GET' | 'POST', body?: unknown): NextRequest {
  return new NextRequest('http://localhost/api/chronicle', {
    method,
    ...(body !== undefined
      ? {
          body: JSON.stringify(body),
          headers: {
            authorization: 'Bearer token',
            'content-type': 'application/json',
          },
        }
      : { headers: { authorization: 'Bearer token' } }),
  });
}

/** rate_limits state: lastActionAt = null means no row yet. */
function wireTables(lastActionAt: string | null) {
  mockAuth.mockResolvedValue({ data: { user: { id: 'user-1' } }, error: null });
  mockFrom.mockImplementation((table: string) => {
    if (table === 'players') {
      return {
        select: () => ({
          eq: () => ({
            single: async () => ({
              data: {
                id: 'player-1',
                user_id: 'user-1',
                created_at: '2026-07-01T00:00:00.000Z',
              },
              error: null,
            }),
          }),
        }),
      };
    }
    if (table === 'rate_limits') {
      return {
        select: () => ({
          eq: () => ({
            eq: () => ({
              single: async () => ({
                data: lastActionAt ? { last_action_at: lastActionAt } : null,
                error: lastActionAt ? null : { code: 'PGRST116' },
              }),
            }),
          }),
        }),
        upsert: async () => ({ data: null, error: null }),
      };
    }
    throw new Error(`Unexpected table in test: ${table}`);
  });
}

beforeEach(() => {
  mockAuth = jest.fn();
  mockFrom = jest.fn();
  mockRpc = jest.fn().mockResolvedValue({ data: REFRESH_OK, error: null });
});

describe('GET /api/chronicle', () => {
  it('requires auth', async () => {
    const response = await GET(
      new NextRequest('http://localhost/api/chronicle')
    );
    expect(response.status).toBe(401);
  });

  it('lazily refreshes records when outside the rate window', async () => {
    wireTables(null);
    const response = await GET(makeRequest('GET'));
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.own).toBe(true);
    expect(body.refreshed).toBe(true);
    expect(mockRpc).toHaveBeenCalledTimes(1);
    expect(mockRpc).toHaveBeenCalledWith('refresh_player_records', {
      p_player_id: 'player-1',
    });
  });

  it('does NOT recompute inside the 60s window (double view, one refresh)', async () => {
    wireTables(new Date(Date.now() - 5_000).toISOString());
    const response = await GET(makeRequest('GET'));
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.refreshed).toBe(false);
    expect(mockRpc).not.toHaveBeenCalled();
  });

  it('still serves the chronicle when the refresh RPC is pre-023', async () => {
    wireTables(null);
    mockRpc.mockResolvedValue({
      data: null,
      error: { code: 'PGRST202', message: 'function not found' },
    });
    const response = await GET(makeRequest('GET'));
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.refreshed).toBe(false);
    expect(body.recordsLive).toBe(true); // stubbed builder payload
  });
});

describe('POST /api/chronicle (refresh)', () => {
  it('rejects unknown actions', async () => {
    wireTables(null);
    const response = await POST(makeRequest('POST', { action: 'nope' }));
    expect(response.status).toBe(400);
  });

  it('refreshes once per allowed window and returns the recompute summary', async () => {
    wireTables(null);
    const response = await POST(makeRequest('POST', { action: 'refresh' }));
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body).toMatchObject({ success: true, live: true, legacyScore: 40 });
    expect(body.records.vault).toEqual({ value: 6000, tier: 1 });
    expect(mockRpc).toHaveBeenCalledTimes(1);
  });

  it('429s inside the window - the double-call never reaches the RPC', async () => {
    wireTables(new Date(Date.now() - 10_000).toISOString());
    const response = await POST(makeRequest('POST', { action: 'refresh' }));
    expect(response.status).toBe(429);
    const body = await response.json();
    expect(body.retryAfterMs).toBeGreaterThan(0);
    expect(mockRpc).not.toHaveBeenCalled();
  });

  it('degrades to live:false pre-023 (never a 500)', async () => {
    wireTables(null);
    mockRpc.mockResolvedValue({
      data: null,
      error: { code: '42883', message: 'refresh_player_records missing' },
    });
    const response = await POST(makeRequest('POST', { action: 'refresh' }));
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ success: false, live: false });
  });

  it('requires auth', async () => {
    const response = await POST(
      new NextRequest('http://localhost/api/chronicle', {
        method: 'POST',
        body: JSON.stringify({ action: 'refresh' }),
      })
    );
    expect(response.status).toBe(401);
  });
});

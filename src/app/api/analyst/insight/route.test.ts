/**
 * @jest-environment node
 *
 * Analyst run-insight route tests (Identity v1 §9.2): auth gate,
 * sessionId validation, pre-025 503 degradation, cache-first bypass of
 * the rate limit, the 30s 'analyst' rate gate on generations, and
 * ownership/ended checks surfacing as 404/409.
 */

var mockAuth: jest.Mock;
var mockFrom: jest.Mock;

jest.mock('@supabase/supabase-js', () => ({
  createClient: () => ({
    auth: { getUser: (...args: unknown[]) => mockAuth(...args) },
    from: (...args: unknown[]) => mockFrom(...args),
  }),
}));

const mockGetCachedInsight = jest.fn();
const mockGenerateRunInsight = jest.fn();

jest.mock('@/lib/analyst/insights', () => ({
  getCachedInsight: (...args: unknown[]) => mockGetCachedInsight(...args),
  generateRunInsight: (...args: unknown[]) => mockGenerateRunInsight(...args),
}));

import { POST } from './route';
import { NextRequest } from 'next/server';

const SESSION_ID = '11111111-1111-4111-8111-111111111111';

function makeRequest(body: unknown, withAuth = true): NextRequest {
  return new NextRequest('http://localhost/api/analyst/insight', {
    method: 'POST',
    body: JSON.stringify(body),
    headers: withAuth
      ? { authorization: 'Bearer token', 'content-type': 'application/json' }
      : { 'content-type': 'application/json' },
  });
}

/** lastActionAt=null → outside the rate window. */
function wireTables(lastActionAt: string | null) {
  mockAuth.mockResolvedValue({ data: { user: { id: 'user-1' } }, error: null });
  mockFrom.mockImplementation((table: string) => {
    if (table === 'players') {
      return {
        select: () => ({
          eq: () => ({
            single: async () => ({ data: { id: 'player-1' }, error: null }),
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
  mockGetCachedInsight.mockReset();
  mockGenerateRunInsight.mockReset();
});

describe('POST /api/analyst/insight', () => {
  it('requires auth', async () => {
    const response = await POST(makeRequest({ sessionId: SESSION_ID }, false));
    expect(response.status).toBe(401);
  });

  it('rejects a malformed sessionId', async () => {
    wireTables(null);
    const response = await POST(makeRequest({ sessionId: 'not-a-uuid' }));
    expect(response.status).toBe(400);
  });

  it('pre-025: cache probe reports not live → 503', async () => {
    wireTables(null);
    mockGetCachedInsight.mockResolvedValue({ live: false, row: null });
    const response = await POST(makeRequest({ sessionId: SESSION_ID }));
    expect(response.status).toBe(503);
    expect((await response.json()).live).toBe(false);
    expect(mockGenerateRunInsight).not.toHaveBeenCalled();
  });

  it('cache hit returns without consuming the rate limit', async () => {
    wireTables(null);
    mockGetCachedInsight.mockResolvedValue({
      live: true,
      row: {
        id: 'i1',
        content: { headline: 'h', body: 'b', tips: [] },
        model: 'gpt-5-mini',
      },
    });
    const response = await POST(makeRequest({ sessionId: SESSION_ID }));
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.cached).toBe(true);
    expect(body.source).toBe('llm');
    // rate_limits was never touched
    const tables = mockFrom.mock.calls.map(([t]) => t);
    expect(tables).not.toContain('rate_limits');
    expect(mockGenerateRunInsight).not.toHaveBeenCalled();
  });

  it('generation inside the 30s window → 429 with retryAfterMs', async () => {
    wireTables(new Date().toISOString());
    mockGetCachedInsight.mockResolvedValue({ live: true, row: null });
    const response = await POST(makeRequest({ sessionId: SESSION_ID }));
    expect(response.status).toBe(429);
    expect((await response.json()).retryAfterMs).toBeGreaterThan(0);
    expect(mockGenerateRunInsight).not.toHaveBeenCalled();
  });

  it('generates on cache miss outside the window', async () => {
    wireTables(null);
    mockGetCachedInsight.mockResolvedValue({ live: true, row: null });
    mockGenerateRunInsight.mockResolvedValue({
      live: true,
      cached: false,
      source: 'llm',
      insight: {
        id: 'i2',
        content: { headline: 'h', body: 'b', tips: ['t'] },
        model: 'gpt-5-mini',
      },
    });
    const response = await POST(makeRequest({ sessionId: SESSION_ID }));
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.source).toBe('llm');
    expect(body.cached).toBe(false);
    expect(mockGenerateRunInsight).toHaveBeenCalledWith(expect.anything(), {
      playerId: 'player-1',
      sessionId: SESSION_ID,
    });
  });

  it('not-own/unknown session → 404, unended → 409', async () => {
    wireTables(null);
    mockGetCachedInsight.mockResolvedValue({ live: true, row: null });
    mockGenerateRunInsight.mockResolvedValue({
      live: true, cached: false, source: null, insight: null, notFound: true,
    });
    expect((await POST(makeRequest({ sessionId: SESSION_ID }))).status).toBe(404);

    wireTables(null);
    mockGenerateRunInsight.mockResolvedValue({
      live: true, cached: false, source: null, insight: null, notEnded: true,
    });
    expect((await POST(makeRequest({ sessionId: SESSION_ID }))).status).toBe(409);
  });
});

/**
 * @jest-environment node
 *
 * Analyst weekly digest route tests (Identity v1 §9.2): auth gate,
 * pre-025 503, cached current-week return, generate-on-miss for the
 * last completed week, and the soft rate gate falling back to the
 * latest older digest instead of 429ing a read surface.
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
const mockGetLatestInsight = jest.fn();
const mockGenerateWeeklyDigest = jest.fn();

jest.mock('@/lib/analyst/insights', () => {
  const actual = jest.requireActual('@/lib/analyst/insights');
  return {
    getCachedInsight: (...args: unknown[]) => mockGetCachedInsight(...args),
    getLatestInsight: (...args: unknown[]) => mockGetLatestInsight(...args),
    generateWeeklyDigest: (...args: unknown[]) => mockGenerateWeeklyDigest(...args),
    lastCompletedWeekStart: actual.lastCompletedWeekStart,
  };
});

import { GET } from './route';
import { NextRequest } from 'next/server';
import { lastCompletedWeekStart } from '@/lib/analyst/insights';

function makeRequest(withAuth = true): NextRequest {
  return new NextRequest('http://localhost/api/analyst/digest', {
    headers: withAuth ? { authorization: 'Bearer token' } : {},
  });
}

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
  mockGetLatestInsight.mockReset();
  mockGenerateWeeklyDigest.mockReset();
});

describe('GET /api/analyst/digest', () => {
  it('requires auth', async () => {
    expect((await GET(makeRequest(false))).status).toBe(401);
  });

  it('pre-025 → 503 { live: false }', async () => {
    wireTables(null);
    mockGetCachedInsight.mockResolvedValue({ live: false, row: null });
    const response = await GET(makeRequest());
    expect(response.status).toBe(503);
  });

  it('returns the cached digest for the last completed week', async () => {
    wireTables(null);
    mockGetCachedInsight.mockResolvedValue({
      live: true,
      row: { content: { headline: 'h', body: 'b', tips: [] }, scope_ref: 'w' },
    });
    const response = await GET(makeRequest());
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.digest.headline).toBe('h');
    expect(body.weekStart).toBe(lastCompletedWeekStart());
    expect(mockGenerateWeeklyDigest).not.toHaveBeenCalled();
  });

  it('generates on miss for the last completed week', async () => {
    wireTables(null);
    mockGetCachedInsight.mockResolvedValue({ live: true, row: null });
    mockGenerateWeeklyDigest.mockResolvedValue({
      live: true,
      cached: false,
      source: 'fallback',
      insight: { content: { headline: 'fresh', body: 'b', tips: [] } },
    });
    const response = await GET(makeRequest());
    const body = await response.json();
    expect(body.digest.headline).toBe('fresh');
    expect(mockGenerateWeeklyDigest).toHaveBeenCalledWith(expect.anything(), {
      playerId: 'player-1',
      weekStart: lastCompletedWeekStart(),
    });
  });

  it('rate-gated miss degrades to the latest older digest (no 429)', async () => {
    wireTables(new Date().toISOString()); // inside the window
    mockGetCachedInsight.mockResolvedValue({ live: true, row: null });
    mockGetLatestInsight.mockResolvedValue({
      live: true,
      row: {
        content: { headline: 'older', body: 'b', tips: [] },
        scope_ref: '2026-06-29',
      },
    });
    const response = await GET(makeRequest());
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.digest.headline).toBe('older');
    expect(body.weekStart).toBe('2026-06-29');
    expect(mockGenerateWeeklyDigest).not.toHaveBeenCalled();
  });

  it('no digest anywhere → digest: null, still 200', async () => {
    wireTables(null);
    mockGetCachedInsight.mockResolvedValue({ live: true, row: null });
    mockGenerateWeeklyDigest.mockResolvedValue({
      live: true, cached: false, source: null, insight: null, skipped: 'no_runs',
    });
    mockGetLatestInsight.mockResolvedValue({ live: true, row: null });
    const response = await GET(makeRequest());
    expect(response.status).toBe(200);
    expect((await response.json()).digest).toBeNull();
  });
});

/**
 * @jest-environment node
 *
 * Analyst season Recall route tests (Identity v1 §9.2): auth gate,
 * 409 season_active while no season has ended, GET returning only
 * cached artifacts, POST generating archetype-then-Recall cache-first,
 * and pre-025 503 degradation.
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
const mockLatestEndedSeason = jest.fn();
const mockGenerateArchetype = jest.fn();
const mockGenerateSeasonRecall = jest.fn();

jest.mock('@/lib/analyst/insights', () => ({
  getCachedInsight: (...args: unknown[]) => mockGetCachedInsight(...args),
  latestEndedSeason: (...args: unknown[]) => mockLatestEndedSeason(...args),
  generateArchetype: (...args: unknown[]) => mockGenerateArchetype(...args),
  generateSeasonRecall: (...args: unknown[]) => mockGenerateSeasonRecall(...args),
}));

import { GET, POST } from './route';
import { NextRequest } from 'next/server';

const SEASON = {
  id: 'season-1',
  seq: 1,
  name: 'Solstice',
  startsOn: '2026-07-20',
  endsOn: '2026-09-07',
};

function makeRequest(method: 'GET' | 'POST', withAuth = true): NextRequest {
  return new NextRequest('http://localhost/api/analyst/recall', {
    method,
    headers: withAuth ? { authorization: 'Bearer token' } : {},
  });
}

function wireTables(lastActionAt: string | null = null) {
  mockAuth.mockResolvedValue({ data: { user: { id: 'user-1' } }, error: null });
  mockFrom.mockImplementation((table: string) => {
    if (table === 'players') {
      return {
        select: () => ({
          eq: () => ({
            single: async () => ({
              data: { id: 'player-1', user_id: 'user-1' },
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
  mockGetCachedInsight.mockReset();
  mockLatestEndedSeason.mockReset();
  mockGenerateArchetype.mockReset();
  mockGenerateSeasonRecall.mockReset();
});

describe('GET /api/analyst/recall', () => {
  it('requires auth', async () => {
    expect((await GET(makeRequest('GET', false))).status).toBe(401);
  });

  it('409 season_active while no season has ended', async () => {
    wireTables();
    mockLatestEndedSeason.mockResolvedValue(null);
    const response = await GET(makeRequest('GET'));
    expect(response.status).toBe(409);
    expect((await response.json()).error).toBe('season_active');
  });

  it('returns cached recall + archetype without generating', async () => {
    wireTables();
    mockLatestEndedSeason.mockResolvedValue(SEASON);
    mockGetCachedInsight
      .mockResolvedValueOnce({
        live: true,
        row: { content: { headline: 'recall', body: 'b', tips: [] } },
      })
      .mockResolvedValueOnce({
        live: true,
        row: { content: { headline: 'The Surgeon', body: 'b', tips: [], archetype: 'surgeon' } },
      });
    const response = await GET(makeRequest('GET'));
    const body = await response.json();
    expect(body.recall.headline).toBe('recall');
    expect(body.archetype.archetype).toBe('surgeon');
    expect(body.season).toEqual({ seq: 1, name: 'Solstice' });
    expect(mockGenerateSeasonRecall).not.toHaveBeenCalled();
  });

  it('pre-025 → 503', async () => {
    wireTables();
    mockLatestEndedSeason.mockResolvedValue(SEASON);
    mockGetCachedInsight.mockResolvedValue({ live: false, row: null });
    expect((await GET(makeRequest('GET'))).status).toBe(503);
  });
});

describe('POST /api/analyst/recall', () => {
  it('409 while the season is live', async () => {
    wireTables();
    mockLatestEndedSeason.mockResolvedValue(null);
    expect((await POST(makeRequest('POST'))).status).toBe(409);
  });

  it('generates archetype first, then the Recall', async () => {
    wireTables();
    mockLatestEndedSeason.mockResolvedValue(SEASON);
    mockGetCachedInsight.mockResolvedValue({ live: true, row: null });
    const order: string[] = [];
    mockGenerateArchetype.mockImplementation(async () => {
      order.push('archetype');
      return {
        live: true, cached: false, source: 'llm', archetype: 'surgeon',
        insight: { content: { headline: 'The Surgeon', body: 'b', tips: [] } },
      };
    });
    mockGenerateSeasonRecall.mockImplementation(async () => {
      order.push('recall');
      return {
        live: true, cached: false, source: 'llm',
        insight: { content: { headline: 'recall', body: 'b', tips: [] } },
      };
    });
    const response = await POST(makeRequest('POST'));
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(order).toEqual(['archetype', 'recall']);
    expect(body.recall.headline).toBe('recall');
    expect(mockGenerateSeasonRecall).toHaveBeenCalledWith(expect.anything(), {
      playerId: 'player-1',
      userId: 'user-1',
      season: SEASON,
    });
  });

  it('generation on a cold cache is rate-gated (429 inside the window)', async () => {
    wireTables(new Date().toISOString());
    mockLatestEndedSeason.mockResolvedValue(SEASON);
    mockGetCachedInsight.mockResolvedValue({ live: true, row: null });
    const response = await POST(makeRequest('POST'));
    expect(response.status).toBe(429);
    expect(mockGenerateSeasonRecall).not.toHaveBeenCalled();
  });
});

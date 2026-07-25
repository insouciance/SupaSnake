/**
 * @jest-environment node
 *
 * Public profile API tests (Player Identity v1 section 7): no-auth
 * reads, 404 for invalid/derived/unknown handles, the s-maxage cache
 * header, payload passthrough (including the section 7.2 limited
 * empty-state shape), and pre-022 degradation.
 */

var mockFrom: jest.Mock;

jest.mock('@supabase/supabase-js', () => ({
  createClient: () => ({
    from: (...args: unknown[]) => mockFrom(...args),
  }),
}));

const mockBuildChronicle = jest.fn();
jest.mock('@/lib/server/chronicle', () => ({
  buildChronicle: (...args: unknown[]) => mockBuildChronicle(...args),
}));

import { GET } from './route';
import { NextRequest } from 'next/server';

const FULL_PAYLOAD = {
  identity: {
    playerId: 'player-1',
    userId: null,
    displayHandle: 'Souci',
    legacyScore: 75,
  },
  legacyScore: 75,
  recordsLive: true,
  earningRuns: 40,
  limited: false,
  records: { records: [], capstones: [] },
  pbTimeline: { points: [], annotations: [] },
  collectionLog: [{ variantId: 'v1', name: 'CYBER SPARK', acquiredAt: null }],
  seasons: [],
  clan: null,
};

function wirePlayers(row: Record<string, unknown> | null, error: { code?: string; message?: string } | null = null) {
  mockFrom.mockImplementation((table: string) => {
    if (table !== 'players') throw new Error(`Unexpected table: ${table}`);
    return {
      select: () => ({
        ilike: (_column: string, pattern: string) => ({
          maybeSingle: async () => {
            (wirePlayers as unknown as { lastPattern?: string }).lastPattern =
              pattern;
            return { data: row, error };
          },
        }),
      }),
    };
  });
}

function requestFor(handle: string) {
  return [
    new NextRequest(`http://localhost/api/profile/${handle}`),
    { params: Promise.resolve({ handle }) },
  ] as const;
}

beforeEach(() => {
  mockFrom = jest.fn();
  mockBuildChronicle.mockReset();
  mockBuildChronicle.mockResolvedValue(FULL_PAYLOAD);
});

describe('GET /api/profile/[handle]', () => {
  it('404s derived handler-NNNN names without a lookup (section 3.2)', async () => {
    const [request, context] = requestFor('handler-0417');
    const response = await GET(request, context);
    expect(response.status).toBe(404);
    expect(mockFrom).not.toHaveBeenCalled();
  });

  it('404s format-invalid handles (too short, bad chars)', async () => {
    for (const bad of ['ab', 'has space', 'way_too_long_for_a_handle', 'héllo']) {
      const [request, context] = requestFor(bad);
      const response = await GET(request, context);
      expect(response.status).toBe(404);
    }
    expect(mockFrom).not.toHaveBeenCalled();
  });

  it('404s unknown handles', async () => {
    wirePlayers(null);
    const [request, context] = requestFor('Nobody99');
    const response = await GET(request, context);
    expect(response.status).toBe(404);
    expect(mockBuildChronicle).not.toHaveBeenCalled();
  });

  it('serves the public payload with the s-maxage cache header', async () => {
    wirePlayers({
      id: 'player-1',
      user_id: 'user-1',
      created_at: '2026-07-01T00:00:00.000Z',
      handle: 'Souci',
    });
    const [request, context] = requestFor('souci'); // case-insensitive
    const response = await GET(request, context);
    expect(response.status).toBe(200);
    expect(response.headers.get('cache-control')).toBe(
      'public, s-maxage=60, stale-while-revalidate=300'
    );
    const body = await response.json();
    expect(body.identity.displayHandle).toBe('Souci');
    expect(body.legacyScore).toBe(75);
    expect(body.limited).toBe(false);
    // Public view requested from the builder
    expect(mockBuildChronicle).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ id: 'player-1' }),
      { publicView: true }
    );
  });

  it('escapes _ in the ilike pattern (not a single-char wildcard)', async () => {
    wirePlayers({
      id: 'player-1',
      user_id: null,
      created_at: '2026-07-01T00:00:00.000Z',
      handle: 'a_b_c',
    });
    const [request, context] = requestFor('a_b_c');
    await GET(request, context);
    expect(
      (wirePlayers as unknown as { lastPattern?: string }).lastPattern
    ).toBe('a\\_b\\_c');
  });

  it('passes the limited (<5 earning runs) empty-state payload through (section 7.2)', async () => {
    wirePlayers({
      id: 'player-2',
      user_id: null,
      created_at: '2026-07-16T00:00:00.000Z',
      handle: 'Fresh1',
    });
    mockBuildChronicle.mockResolvedValue({
      ...FULL_PAYLOAD,
      earningRuns: 2,
      limited: true,
      records: null,
      pbTimeline: null,
      seasons: null,
      clan: null,
    });
    const [request, context] = requestFor('Fresh1');
    const response = await GET(request, context);
    const body = await response.json();
    expect(body.limited).toBe(true);
    expect(body.records).toBeNull();
    expect(body.pbTimeline).toBeNull();
    expect(body.collectionLog.length).toBeGreaterThan(0); // silhouettes stay
  });

  it('404s pre-022 (no handle column) instead of erroring', async () => {
    wirePlayers(null, { code: '42703', message: 'column players.handle does not exist' });
    const [request, context] = requestFor('Souci');
    const response = await GET(request, context);
    expect(response.status).toBe(404);
  });
});

// ---------------------------------------------------------------------------
// WP-0.06 — cohort exclusion (GT §13)
// ---------------------------------------------------------------------------

describe('a flagged cohort has no public profile', () => {
  it.each(['dev', 'qa', 'fixture'])('404s a %s account', async (cohort) => {
    wirePlayers({ id: 'player-1', user_id: null, created_at: null, handle: 'Souci', cohort });
    const [request, context] = requestFor('Souci');

    const response = await GET(request, context);

    expect(response.status).toBe(404);
    // The Chronicle is never even built, so nothing about the account leaks.
    expect(mockBuildChronicle).not.toHaveBeenCalled();
  });

  it('serves a player-cohort account normally', async () => {
    wirePlayers({
      id: 'player-1',
      user_id: null,
      created_at: null,
      handle: 'Souci',
      cohort: 'player',
    });
    const [request, context] = requestFor('Souci');

    const response = await GET(request, context);

    expect(response.status).toBe(200);
    expect(mockBuildChronicle).toHaveBeenCalled();
  });

  it('serves normally before migration 045, when there is no cohort column', async () => {
    // The first read names `cohort` and fails; the retry drops it.
    let attempt = 0;
    mockFrom.mockImplementation((table: string) => {
      if (table !== 'players') throw new Error(`Unexpected table: ${table}`);
      return {
        select: (columns: string) => ({
          ilike: () => ({
            maybeSingle: async () => {
              attempt += 1;
              if (columns.includes('cohort')) {
                return {
                  data: null,
                  error: { code: '42703', message: 'column players.cohort does not exist' },
                };
              }
              return {
                data: { id: 'player-1', user_id: null, created_at: null, handle: 'Souci' },
                error: null,
              };
            },
          }),
        }),
      };
    });

    const [request, context] = requestFor('Souci');
    const response = await GET(request, context);

    expect(attempt).toBe(2);
    expect(response.status).toBe(200);
    expect(mockBuildChronicle).toHaveBeenCalled();
  });
});

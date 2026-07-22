/** @jest-environment node */

var mockAuth: jest.Mock;
var mockFrom: jest.Mock;

jest.mock('@supabase/supabase-js', () => ({
  createClient: () => ({
    auth: { getUser: (...args: unknown[]) => mockAuth(...args) },
    from: (...args: unknown[]) => mockFrom(...args),
  }),
}));

import { NextRequest } from 'next/server';
import { GET } from './route';

const PLAYER_ID = 'player-1';

function request() {
  return new NextRequest('http://localhost:3000/api/codex', {
    headers: { authorization: 'Bearer token' },
  });
}

function mockDatabase(options: { codexError?: object; bankedRuns?: number } = {}) {
  mockAuth.mockResolvedValue({ data: { user: { id: 'user-1' } }, error: null });
  mockFrom.mockImplementation((table: string) => {
    if (table === 'players') {
      return {
        select: () => ({
          eq: () => ({
            single: async () => ({ data: { id: PLAYER_ID }, error: null }),
          }),
        }),
      };
    }
    if (table === 'player_codex') {
      return {
        select: () => ({
          eq: async () => ({
            data: options.codexError
              ? null
              : [
                  {
                    discovery_type: 'gene',
                    entry_id: 'gold_trail',
                    first_discovered_at: '2026-07-01T00:00:00Z',
                  },
                ],
            error: options.codexError ?? null,
          }),
        }),
      };
    }
    if (table === 'codex_first_discoveries') {
      return {
        select: async () => ({ data: [], error: null }),
      };
    }
    if (table === 'game_sessions') {
      const countQuery = {
        eq: () => countQuery,
        not: async () => ({
          count: options.bankedRuns ?? 20,
          error: null,
        }),
      };
      const sessionQuery = {
        eq: () => sessionQuery,
        not: () => sessionQuery,
        order: () => sessionQuery,
        limit: async () => ({
          data: [
            {
              extracted: true,
              genome: { v: 1, picks: [{ id: 'gold_trail' }], splices: [] },
            },
          ],
          error: null,
        }),
      };
      return {
        select: (_columns: string, queryOptions?: { head?: boolean }) =>
          queryOptions?.head ? countQuery : sessionQuery,
      };
    }
    if (table === 'player_cosmetics') {
      return {
        select: () => ({
          eq: () => ({
            eq: () => ({
              maybeSingle: async () => ({ data: null, error: null }),
            }),
          }),
        }),
      };
    }
    throw new Error(`Unexpected table ${table}`);
  });
}

describe('GET /api/codex', () => {
  beforeEach(() => {
    mockAuth = jest.fn();
    mockFrom = jest.fn();
  });

  it('requires authentication', async () => {
    expect(
      (await GET(new NextRequest('http://localhost:3000/api/codex'))).status
    ).toBe(401);
  });

  it('returns private discoveries and bounded session stats without a premium check', async () => {
    mockDatabase();
    const response = await GET(request());
    const body = await response.json();
    expect(response.status).toBe(200);
    expect(body.live).toBe(true);
    expect(body.unlocked).toBe(true);
    expect(body.genes.find((gene: { id: string }) => gene.id === 'gold_trail')).toMatchObject({
      discovered: true,
      picks: 1,
      banks: 1,
    });
    expect(mockFrom).not.toHaveBeenCalledWith('premium_subscriptions');
  });

  it('keeps the catalog hidden before the server FTUE gate', async () => {
    mockDatabase({ bankedRuns: 14 });
    const response = await GET(request());
    expect(await response.json()).toEqual({
      live: true,
      unlocked: false,
      bankedRuns: 14,
      unlockAt: 15,
    });
  });

  it('degrades to live:false before migration 031', async () => {
    mockDatabase({
      codexError: { code: '42P01', message: 'relation player_codex does not exist' },
    });
    const response = await GET(request());
    expect(await response.json()).toEqual({ live: false });
  });
});

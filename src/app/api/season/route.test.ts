/**
 * @jest-environment node
 */

/**
 * Season API tests - RPC-shaped, Supabase mocked. GET maps the get_season
 * payload (season/track/playoffs/champions) and degrades to { live: false }
 * during the pre-migration-021 window. There is deliberately no reward-claim
 * method; Daily Take is the only collect.
 */

// Mock Supabase - must be before imports due to jest.mock hoisting

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

import { GET } from './route';
import { NextRequest } from 'next/server';

const PLAYER_ID = 'player-1';

beforeEach(() => {
  mockAuth = jest.fn();
  mockFrom = jest.fn();
  mockRpc = jest.fn();
});

function authedUser() {
  mockAuth.mockResolvedValue({ data: { user: { id: 'user-1' } }, error: null });
  mockFrom.mockImplementation(() => ({
    select: () => ({
      eq: () => ({
        single: async () => ({ data: { id: PLAYER_ID }, error: null }),
      }),
    }),
  }));
}

function getRequest() {
  return new NextRequest('http://localhost:3000/api/season', {
    headers: { authorization: 'Bearer valid-token' },
  });
}

describe('GET /api/season', () => {
  it('401 without a token', async () => {
    const response = await GET(new NextRequest('http://localhost:3000/api/season'));
    expect(response.status).toBe(401);
  });

  it('404s when the authenticated account has no player row', async () => {
    mockAuth.mockResolvedValue({ data: { user: { id: 'user-1' } }, error: null });
    mockFrom.mockImplementation(() => ({
      select: () => ({
        eq: () => ({
          single: async () => ({
            data: null,
            error: { code: 'PGRST116', message: 'no rows' },
          }),
        }),
      }),
    }));

    const response = await GET(getRequest());
    expect(response.status).toBe(404);
    expect(mockRpc).not.toHaveBeenCalled();
  });

  it('fails closed when the player lookup itself fails', async () => {
    mockAuth.mockResolvedValue({ data: { user: { id: 'user-1' } }, error: null });
    mockFrom.mockImplementation(() => ({
      select: () => ({
        eq: () => ({
          single: async () => ({
            data: null,
            error: { code: 'XX000', message: 'database failure' },
          }),
        }),
      }),
    }));

    const response = await GET(getRequest());
    expect(response.status).toBe(500);
    expect(mockRpc).not.toHaveBeenCalled();
  });

  it('maps the get_season payload', async () => {
    authedUser();
    mockRpc.mockResolvedValue({
      data: {
        season: {
          seq: 1,
          name: 'Season 1 — Solstice',
          week: 3,
          playoff_phase: 'none',
          mutations: [{ id: 'solstice_engine', name: 'Solstice Engine' }],
        },
        track: { xp: 1200, level: 4, max_level: 30, xp_per_level: 400, tiers: [], reroll_tokens: 2 },
        playoffs: [],
        champions: [{ seq: 1, clan_name: 'VIPERS' }],
      },
      error: null,
    });

    const response = await GET(getRequest());
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.live).toBe(true);
    expect(body.season.seq).toBe(1);
    expect(body.season.genes).toEqual([{ id: 'solstice_engine', name: 'Solstice Engine' }]);
    expect(body.season.mutations).toEqual([{ id: 'solstice_engine', name: 'Solstice Engine' }]);
    expect(body.track.level).toBe(4);
    expect(body.champions).toHaveLength(1);
    expect(mockRpc).toHaveBeenCalledWith('get_season', { p_player_id: PLAYER_ID });
  });

  it('PRE-021: missing RPC reads as { live: false }', async () => {
    authedUser();
    mockRpc.mockResolvedValue({
      data: null,
      error: { code: '42883', message: 'function get_season(uuid) does not exist' },
    });

    const response = await GET(getRequest());
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body).toEqual({
      live: false,
      season: null,
      track: null,
      playoffs: [],
      champions: [],
    });
  });
});

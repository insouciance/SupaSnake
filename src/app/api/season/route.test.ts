/**
 * @jest-environment node
 */

/**
 * Season API tests - RPC-shaped, Supabase mocked. GET maps the get_season
 * payload (season/track/playoffs/champions), POST claim maps the
 * claim_season_tier error codes, and both degrade to { live: false } /
 * 503 during the pre-migration-021 window.
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

import { GET, POST } from './route';
import { NextRequest } from 'next/server';
import { mapSeasonRpcError } from './utils';

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

function postRequest(body: unknown) {
  return new NextRequest('http://localhost:3000/api/season', {
    method: 'POST',
    headers: {
      authorization: 'Bearer valid-token',
      'content-type': 'application/json',
    },
    body: JSON.stringify(body),
  });
}

describe('GET /api/season', () => {
  it('401 without a token', async () => {
    const response = await GET(new NextRequest('http://localhost:3000/api/season'));
    expect(response.status).toBe(401);
  });

  it('maps the get_season payload', async () => {
    authedUser();
    mockRpc.mockResolvedValue({
      data: {
        season: { seq: 1, name: 'Season 1 — Solstice', week: 3, playoff_phase: 'none' },
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

describe('POST /api/season claim', () => {
  it('validates the level shape', async () => {
    authedUser();
    const response = await POST(postRequest({ action: 'claim', level: 'ten' }));
    expect(response.status).toBe(400);
    expect(mockRpc).not.toHaveBeenCalled();
  });

  it('claims a reached milestone', async () => {
    authedUser();
    mockRpc.mockResolvedValue({
      data: { level: 5, reward_type: 'reroll_token', reward_amount: 1, reroll_tokens: 3 },
      error: null,
    });

    const response = await POST(postRequest({ action: 'claim', level: 5 }));
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.success).toBe(true);
    expect(body.reward.reward_type).toBe('reroll_token');
    expect(mockRpc).toHaveBeenCalledWith('claim_season_tier', {
      p_player_id: PLAYER_ID,
      p_level: 5,
    });
  });

  it('maps ALREADY_CLAIMED to 409 and LEVEL_NOT_REACHED to 400', async () => {
    authedUser();
    mockRpc.mockResolvedValue({ data: null, error: { message: 'ALREADY_CLAIMED' } });
    expect((await POST(postRequest({ action: 'claim', level: 5 }))).status).toBe(409);

    mockRpc.mockResolvedValue({ data: null, error: { message: 'LEVEL_NOT_REACHED' } });
    expect((await POST(postRequest({ action: 'claim', level: 30 }))).status).toBe(400);
  });

  it('PRE-021: missing RPC returns 503', async () => {
    authedUser();
    mockRpc.mockResolvedValue({
      data: null,
      error: { code: 'PGRST202', message: 'function claim_season_tier(uuid, integer) does not exist' },
    });
    expect((await POST(postRequest({ action: 'claim', level: 1 }))).status).toBe(503);
  });
});

describe('mapSeasonRpcError', () => {
  it('covers every claim_season_tier code; unknown falls through', () => {
    for (const [code, status] of [
      ['NO_ACTIVE_SEASON', 400],
      ['NO_TIER_AT_LEVEL', 400],
      ['PLAYER_NOT_FOUND', 404],
      ['LEVEL_NOT_REACHED', 400],
      ['ALREADY_CLAIMED', 409],
    ] as const) {
      expect(mapSeasonRpcError(`error: ${code}`)?.status).toBe(status);
    }
    expect(mapSeasonRpcError('SOMETHING_ELSE')).toBeNull();
  });
});

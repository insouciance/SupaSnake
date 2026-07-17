/**
 * @jest-environment node
 */

/**
 * Clan Duel API tests - GET handler with mocked supabase client
 */

// Mock Supabase - must be before imports due to jest.mock hoisting

var mockGetUser: jest.Mock;

var mockFrom: jest.Mock;

var mockRpc: jest.Mock;

jest.mock('@supabase/supabase-js', () => ({
  createClient: () => ({
    auth: { getUser: (...args: unknown[]) => mockGetUser(...args) },
    from: (...args: unknown[]) => mockFrom(...args),
    rpc: (...args: unknown[]) => mockRpc(...args),
  }),
}));

import { GET } from './route';
import { mapDuelPayload } from './utils';
import { NextRequest } from 'next/server';

function makeRequest(token?: string) {
  return new NextRequest('http://localhost/api/clan/duel', {
    headers: token ? { authorization: `Bearer ${token}` } : {},
  });
}

function mockMembership(clanId: string | null) {
  mockFrom = jest.fn().mockReturnValue({
    select: jest.fn().mockReturnValue({
      eq: jest.fn().mockReturnValue({
        maybeSingle: jest
          .fn()
          .mockResolvedValue({ data: clanId ? { clan_id: clanId } : null, error: null }),
      }),
    }),
  });
}

const activeDuelPayload = {
  rating: 1010,
  record: { wins: 3, losses: 1 },
  duel: {
    week_start: '2026-07-13',
    ends_at: '2026-07-20T00:00:00+00:00',
    status: 'active',
    is_bye: false,
    my_score: 4200,
    their_score: 3900,
    opponent: { id: 'clan-2', name: 'Dragon Lords', tag: 'DRAG', rating: 990 },
    top_contributors: [
      { name: 'viper', dna: 2400 },
      { name: 'cobra', dna: 1800 },
    ],
  },
  last_week: {
    result: 'won',
    rating_delta: 16,
    opponent_name: 'Old Rivals',
    my_score: 5000,
    their_score: 4000,
    bonus_active: true,
  },
};

beforeEach(() => {
  mockGetUser = jest
    .fn()
    .mockResolvedValue({ data: { user: { id: 'user-1' } }, error: null });
  mockRpc = jest.fn().mockResolvedValue({ data: activeDuelPayload, error: null });
  mockMembership('clan-1');
});

describe('GET /api/clan/duel', () => {
  it('returns 401 without an Authorization header', async () => {
    const response = await GET(makeRequest());
    expect(response.status).toBe(401);
  });

  it('returns 401 for an invalid token', async () => {
    mockGetUser = jest
      .fn()
      .mockResolvedValue({ data: { user: null }, error: { message: 'bad token' } });

    const response = await GET(makeRequest('bad-token'));
    expect(response.status).toBe(401);
  });

  it('returns 404 when the player is not in a clan', async () => {
    mockMembership(null);

    const response = await GET(makeRequest('token'));
    const body = await response.json();

    expect(response.status).toBe(404);
    expect(body.error).toBe('Not in a clan');
    expect(mockRpc).not.toHaveBeenCalled();
  });

  it('calls get_clan_duel with the player clan id (lazy settlement entry point)', async () => {
    await GET(makeRequest('token'));

    expect(mockRpc).toHaveBeenCalledWith('get_clan_duel', { p_clan_id: 'clan-1' });
  });

  it('returns the mapped duel payload for an active duel', async () => {
    const response = await GET(makeRequest('token'));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toEqual({
      duel: {
        weekStart: '2026-07-13',
        status: 'active',
        isBye: false,
        opponent: { name: 'Dragon Lords', tag: 'DRAG', rating: 990 },
        myScore: 4200,
        theirScore: 3900,
        endsAt: '2026-07-20T00:00:00+00:00',
        myTopContributors: [
          { name: 'viper', dna: 2400 },
          { name: 'cobra', dna: 1800 },
        ],
      },
      rating: 1010,
      record: { wins: 3, losses: 1 },
      lastWeek: {
        result: 'won',
        ratingDelta: 16,
        opponentName: 'Old Rivals',
        myScore: 5000,
        theirScore: 4000,
        bonusActive: true,
      },
    });
  });

  it('maps a bye week (no opponent, null clan_b)', async () => {
    mockRpc = jest.fn().mockResolvedValue({
      data: {
        rating: 1000,
        record: { wins: 0, losses: 0 },
        duel: {
          week_start: '2026-07-13',
          ends_at: '2026-07-20T00:00:00+00:00',
          status: 'bye',
          is_bye: true,
          my_score: 1200,
          their_score: 0,
          opponent: null,
          top_contributors: [],
        },
        last_week: null,
      },
      error: null,
    });

    const response = await GET(makeRequest('token'));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.duel.isBye).toBe(true);
    expect(body.duel.status).toBe('bye');
    expect(body.duel.opponent).toBeNull();
    expect(body.lastWeek).toBeNull();
  });

  it('handles an unpaired clan (joined after pairing ran): duel is null', async () => {
    mockRpc = jest.fn().mockResolvedValue({
      data: {
        rating: 1000,
        record: { wins: 0, losses: 0 },
        duel: null,
        last_week: null,
      },
      error: null,
    });

    const response = await GET(makeRequest('token'));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.duel).toBeNull();
    expect(body.rating).toBe(1000);
  });

  it('returns 500 when the RPC fails', async () => {
    mockRpc = jest.fn().mockResolvedValue({ data: null, error: { message: 'boom' } });

    const response = await GET(makeRequest('token'));
    expect(response.status).toBe(500);
  });

  it('returns 404 when the RPC reports a missing clan', async () => {
    mockRpc = jest.fn().mockResolvedValue({ data: { error: 'Clan not found' }, error: null });

    const response = await GET(makeRequest('token'));
    expect(response.status).toBe(404);
  });
});

describe('mapDuelPayload', () => {
  it('defaults missing scores and contributors safely', () => {
    const mapped = mapDuelPayload({
      rating: 1000,
      record: { wins: 0, losses: 0 },
      duel: {
        week_start: '2026-07-13',
        ends_at: '2026-07-20T00:00:00+00:00',
        status: 'active',
        is_bye: false,
        my_score: undefined as unknown as number,
        their_score: undefined as unknown as number,
        opponent: null,
        top_contributors: undefined as unknown as [],
      },
      last_week: null,
    });

    expect(mapped.duel?.myScore).toBe(0);
    expect(mapped.duel?.theirScore).toBe(0);
    expect(mapped.duel?.myTopContributors).toEqual([]);
  });

  it('negates nothing: rating delta passes through signed for losses', () => {
    const mapped = mapDuelPayload({
      rating: 984,
      record: { wins: 0, losses: 1 },
      duel: null,
      last_week: {
        result: 'lost',
        rating_delta: -16,
        opponent_name: 'Dragon Lords',
        my_score: 100,
        their_score: 300,
        bonus_active: false,
      },
    });

    expect(mapped.lastWeek?.ratingDelta).toBe(-16);
    expect(mapped.lastWeek?.bonusActive).toBe(false);
  });
});

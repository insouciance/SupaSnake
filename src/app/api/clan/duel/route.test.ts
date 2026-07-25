/**
 * @jest-environment node
 */

/**
 * Clan Duel API tests — the FOLD and the GATE (§9.4, §12.1 slot 7).
 *
 * WP-1.02 folded head-to-head into the Serpent week. The paired-week surface
 * is `GET /api/clan/hunt`: it carries the self-referential primary, the
 * optional rival layer and the rivalry memory on the one weekly surface §12.2
 * allows. This endpoint is the OLD duel — its own weekly calendar, its own Elo
 * rating and the Gauntlet's blind picks riding on top of it — so it now rides
 * the Gauntlet's population gate.
 *
 * These tests assert both halves of "hidden, not deleted":
 *
 *   HIDDEN — with the flag off (the default, and what CI must never infer from
 *   an omitted variable) the route answers 200 `{ available: false }` and
 *   touches NO row. That last part is the point rather than a nicety:
 *   `get_clan_duel` settles finished weeks and pairs new ones lazily, in SQL,
 *   on every read. Leaving the read open would keep the superseded duel
 *   machinery rating and grading clans behind a surface no player can see,
 *   which is precisely what Rule 8 forbids happening at all.
 *
 *   NOT DELETED — with the flag on, every behaviour the standalone duel had
 *   still answers exactly as it did, byes and unpaired clans included. The
 *   day §9.3's gate opens, the layer is the layer it was, and migration 048's
 *   tripwire has kept its rows (see `noOfficerLever.test.ts`).
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

import { mapDuelPayload } from './utils';
import { NextRequest } from 'next/server';

type DuelRoute = typeof import('./route');

const ORIGINAL_FLAG = process.env.NEXT_PUBLIC_CLAN_GAUNTLET;

/**
 * Load the route with the gate in a chosen state. The flag is read once, at
 * module scope, on the server as on the client — so switching it means
 * reloading the module, exactly as a deployment would.
 */
function loadRoute(flag?: string): DuelRoute {
  if (flag === undefined) {
    delete process.env.NEXT_PUBLIC_CLAN_GAUNTLET;
  } else {
    process.env.NEXT_PUBLIC_CLAN_GAUNTLET = flag;
  }
  jest.resetModules();
  return require('./route') as DuelRoute;
}

afterAll(() => {
  if (ORIGINAL_FLAG === undefined) {
    delete process.env.NEXT_PUBLIC_CLAN_GAUNTLET;
  } else {
    process.env.NEXT_PUBLIC_CLAN_GAUNTLET = ORIGINAL_FLAG;
  }
  jest.resetModules();
});

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
  },
};

beforeEach(() => {
  mockGetUser = jest
    .fn()
    .mockResolvedValue({ data: { user: { id: 'user-1' } }, error: null });
  mockRpc = jest.fn().mockResolvedValue({ data: activeDuelPayload, error: null });
  mockMembership('clan-1');
});

describe('GET /api/clan/duel — gated, because the duel is folded into the week', () => {
  it('answers 200 { available: false } with the flag absent, not an error', async () => {
    // Absent, not "false": CI must never infer the rollback path from an
    // omitted variable, so the omitted case is tested on its own.
    const { GET } = loadRoute(undefined);
    const response = await GET(makeRequest('token'));
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ available: false, gate: 'clan_gauntlet' });
  });

  it('touches no row: the lazy settler in get_clan_duel is never reached', async () => {
    const { GET } = loadRoute(undefined);
    await GET(makeRequest('token'));
    expect(mockRpc).not.toHaveBeenCalled();
    expect(mockFrom).not.toHaveBeenCalled();
    expect(mockGetUser).not.toHaveBeenCalled();
  });

  it('leaks no duel state through the closed answer', async () => {
    const { GET } = loadRoute(undefined);
    const body = await (await GET(makeRequest('token'))).json();
    expect(body).not.toHaveProperty('duel');
    expect(body).not.toHaveProperty('rating');
    expect(body).not.toHaveProperty('record');
  });

  it('closes for an unauthenticated caller too — a hidden layer is not a 401', async () => {
    const { GET } = loadRoute(undefined);
    const response = await GET(makeRequest());
    expect(response.status).toBe(200);
    expect((await response.json()).available).toBe(false);
  });

  it('opens only for the exact string "true"', async () => {
    for (const flag of ['false', 'TRUE', '1', '']) {
      const { GET } = loadRoute(flag);
      const body = await (await GET(makeRequest('token'))).json();
      expect(body).toEqual({ available: false, gate: 'clan_gauntlet' });
    }
    const { GET } = loadRoute('true');
    expect((await (await GET(makeRequest('token'))).json()).available).toBeUndefined();
  });
});

describe('GET /api/clan/duel — behind an open gate, the preserved surface is intact', () => {
  let GET: DuelRoute['GET'];

  beforeEach(() => {
    ({ GET } = loadRoute('true'));
  });

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
        // Pre-020 RPC payloads carry no gauntlet block - mapped to null
        gauntlet: null,
      },
      rating: 1010,
      record: { wins: 3, losses: 1 },
      lastWeek: {
        result: 'won',
        ratingDelta: 16,
        opponentName: 'Old Rivals',
        myScore: 5000,
        theirScore: 4000,
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

  it('returns 500 when the RPC fails, and reports it (Rule 11)', async () => {
    mockRpc = jest.fn().mockResolvedValue({ data: null, error: { message: 'boom' } });

    const response = await GET(makeRequest('token'));
    expect(response.status).toBe(500);
  });

  it('returns 404 when the RPC reports a missing clan', async () => {
    mockRpc = jest.fn().mockResolvedValue({ data: { error: 'Clan not found' }, error: null });

    const response = await GET(makeRequest('token'));
    expect(response.status).toBe(404);
  });

  it('fails loudly rather than silently when the membership read errors (Rule 11)', async () => {
    mockFrom = jest.fn().mockReturnValue({
      select: jest.fn().mockReturnValue({
        eq: jest.fn().mockReturnValue({
          maybeSingle: jest
            .fn()
            .mockResolvedValue({ data: null, error: { message: 'connection reset' } }),
        }),
      }),
    });

    const response = await GET(makeRequest('token'));
    expect(response.status).toBe(500);
    expect(mockRpc).not.toHaveBeenCalled();
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
        // WP-0.02: get_clan_duel still emits this key; the mapper drops it.
        bonus_active: false,
      },
    });

    expect(mapped.lastWeek?.ratingDelta).toBe(-16);
    expect(mapped.lastWeek).not.toHaveProperty('bonusActive');
  });
});

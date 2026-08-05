/**
 * @jest-environment node
 *
 * GET /api/player/cosmetics — what the home chamber is allowed to believe.
 *
 * The read half of the cosmetics contract, Supabase mocked. Three things are
 * pinned here and each of them is load-bearing somewhere else.
 *
 * The first is authority: the route reads, and it reads for exactly one player
 * — the `players` row behind the bearer token, never a player id the caller
 * names. The RPC argument assertion is that guarantee written down.
 *
 * The second, and the reason this file exists, is the deploy window. Release
 * order is app-first, database-second, so there is a stretch of minutes where
 * the built chamber asks for `read_snake_cosmetic_catalog` and Postgres has
 * never heard of it. That must come back 200 with `live: false` and an empty
 * catalog, and it must arrive at Sentry as nothing at all. A player with no
 * cosmetics is a legitimate state; a pre-migration build looks exactly like
 * one, and Home renders either way (doctrine principle 1). The inverse matters
 * just as much: a genuine database failure wearing no such disguise is an
 * incident and must page. So both halves are asserted — the quiet one for its
 * silence, the loud one for its noise.
 *
 * The third is tolerance. The catalog is data and the renderer is code and they
 * ship on separate clocks, so a row the build cannot make sense of is dropped
 * and the rest of the menu still opens. Nothing in a cosmetics payload is worth
 * failing a request over.
 */

const mockCaptureException = jest.fn();
const mockGetUser = jest.fn();
const mockFrom = jest.fn();
const mockRpc = jest.fn();

jest.mock('@sentry/nextjs', () => ({
  captureException: (...args: unknown[]) => mockCaptureException(...args),
}));

jest.mock('@supabase/supabase-js', () => ({
  createClient: () => ({
    auth: { getUser: (...args: unknown[]) => mockGetUser(...args) },
    from: (table: string) => mockFrom(table),
    rpc: (fn: string, params: unknown) => mockRpc(fn, params),
  }),
}));

import { NextRequest } from 'next/server';
import { GET } from './route';

const PLAYER_ID = 'player-1';

function request(authorization?: string) {
  const headers: Record<string, string> = {};
  if (authorization) headers.authorization = authorization;
  return new NextRequest('http://localhost:3000/api/player/cosmetics', {
    headers,
  });
}

function authedRequest() {
  return request('Bearer valid-token');
}

/** The `players` lookup answering with a row, or with nothing. */
function playerRow(row: { id: string } | null) {
  mockFrom.mockImplementation(() => ({
    select: () => ({
      eq: () => ({
        single: async () =>
          row
            ? { data: row, error: null }
            : { data: null, error: { code: 'PGRST116', message: 'no rows' } },
      }),
    }),
  }));
}

beforeEach(() => {
  jest.clearAllMocks();
  mockGetUser.mockResolvedValue({ data: { user: { id: 'user-1' } }, error: null });
  playerRow({ id: PLAYER_ID });
  mockRpc.mockResolvedValue({ data: null, error: null });
});

describe('who is allowed to ask', () => {
  it('refuses an anonymous caller before touching the database', async () => {
    const response = await GET(request());
    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({ error: 'Unauthorized' });
    expect(mockRpc).not.toHaveBeenCalled();
  });

  it('refuses a token the auth service does not recognise', async () => {
    mockGetUser.mockResolvedValue({
      data: { user: null },
      error: { message: 'invalid JWT' },
    });
    const response = await GET(authedRequest());
    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({ error: 'Invalid token' });
    expect(mockRpc).not.toHaveBeenCalled();
  });

  it('reports a signed-in account with no player row as missing, not broken', async () => {
    playerRow(null);
    const response = await GET(authedRequest());
    expect(response.status).toBe(404);
    expect(await response.json()).toEqual({ error: 'Player not found' });
    expect(mockRpc).not.toHaveBeenCalled();
  });
});

describe('the catalog a signed-in player gets back', () => {
  it('returns what this player owns and what they are wearing', async () => {
    mockRpc.mockResolvedValue({
      data: {
        loadout: { face: 'visor_neon', crown: null, food_skin: null },
        items: [
          {
            id: 'face_visor_neon',
            slot: 'face',
            component: 'visor_neon',
            name: 'Neon Visor',
            rarity: 'rare',
            supporterOnly: false,
            owned: true,
            equipped: true,
          },
          {
            id: 'crown_solstice',
            slot: 'crown',
            component: 'solstice_crown',
            name: 'Solstice Crown',
            rarity: 'legendary',
            supporterOnly: true,
            owned: false,
            equipped: false,
          },
        ],
      },
      error: null,
    });

    const response = await GET(authedRequest());
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      live: true,
      loadout: { face: 'visor_neon', crown: null, food_skin: null },
      items: [
        {
          id: 'face_visor_neon',
          slot: 'face',
          component: 'visor_neon',
          name: 'Neon Visor',
          rarity: 'rare',
          supporterOnly: false,
          owned: true,
          equipped: true,
        },
        {
          id: 'crown_solstice',
          slot: 'crown',
          component: 'solstice_crown',
          name: 'Solstice Crown',
          rarity: 'legendary',
          supporterOnly: true,
          owned: false,
          equipped: false,
        },
      ],
    });
    expect(mockCaptureException).not.toHaveBeenCalled();
  });

  it('asks only about the player behind the token', async () => {
    mockRpc.mockResolvedValue({ data: { loadout: {}, items: [] }, error: null });
    await GET(authedRequest());
    expect(mockRpc).toHaveBeenCalledTimes(1);
    expect(mockRpc).toHaveBeenCalledWith('read_snake_cosmetic_catalog', {
      p_player_id: PLAYER_ID,
    });
  });
});

describe('the window between the app shipping and the migration landing', () => {
  it('degrades quietly while the migration is still pending', async () => {
    mockRpc.mockResolvedValue({
      data: null,
      error: {
        code: '42883',
        message: 'function read_snake_cosmetic_catalog(uuid) does not exist',
      },
    });

    const response = await GET(authedRequest());
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      live: false,
      loadout: { face: null, crown: null, food_skin: null },
      items: [],
    });
    // The chamber renders the bare specimen. Nobody is woken up for it.
    expect(mockCaptureException).not.toHaveBeenCalled();
  });

  it('recognises the same absence when only the message names the missing RPC', async () => {
    mockRpc.mockResolvedValue({
      data: null,
      error: {
        code: 'PGRST202',
        message: 'Could not find the function public.read_snake_cosmetic_catalog',
      },
    });

    const response = await GET(authedRequest());
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ live: false, items: [] });
    expect(mockCaptureException).not.toHaveBeenCalled();
  });
});

describe('a database that is actually in trouble', () => {
  it('fails loudly when the read breaks for a reason that is not a pending migration', async () => {
    const consoleSpy = jest
      .spyOn(console, 'error')
      .mockImplementation(() => undefined);
    mockRpc.mockResolvedValue({
      data: null,
      error: {
        code: '08006',
        message: 'server closed the connection unexpectedly',
      },
    });

    const response = await GET(authedRequest());
    expect(response.status).toBe(500);
    expect(await response.json()).toEqual({
      error: 'Could not read your cosmetics',
    });
    expect(mockCaptureException).toHaveBeenCalledTimes(1);

    consoleSpy.mockRestore();
  });
});

describe('a catalog row this build cannot make sense of', () => {
  it('opens the menu empty rather than throwing when items is not a list', async () => {
    mockRpc.mockResolvedValue({
      data: { loadout: { face: 'visor_neon' }, items: 'not-a-list' },
      error: null,
    });

    const response = await GET(authedRequest());
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      live: true,
      loadout: { face: 'visor_neon', crown: null, food_skin: null },
      items: [],
    });
    expect(mockCaptureException).not.toHaveBeenCalled();
  });

  it('drops rows it cannot equip and keeps the rest of the menu', async () => {
    mockRpc.mockResolvedValue({
      data: {
        loadout: { face: null, crown: null, food_skin: null },
        items: [
          null,
          'a string where an object should be',
          // No id: nothing for the equip call to name.
          { slot: 'face', component: 'visor_neon', name: 'Nameless' },
          // A slot from a later migration than this build knows about.
          { id: 'hat_tricorn', slot: 'hat', component: 'tricorn', name: 'Tricorn' },
          { id: 'face_scarred', slot: 'face', component: 'scarred', name: 'Scarred' },
        ],
      },
      error: null,
    });

    const response = await GET(authedRequest());
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.live).toBe(true);
    expect(body.items).toHaveLength(1);
    expect(body.items[0]).toMatchObject({ id: 'face_scarred', slot: 'face' });
    expect(mockCaptureException).not.toHaveBeenCalled();
  });

  it('fills in the fields a sparse row leaves out instead of rendering holes', async () => {
    mockRpc.mockResolvedValue({
      data: { loadout: 'not-an-object', items: [{ id: 'crown_bare', slot: 'crown' }] },
      error: null,
    });

    const response = await GET(authedRequest());
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      live: true,
      // An unreadable loadout is "wearing nothing", not a missing key the
      // renderer has to branch on.
      loadout: { face: null, crown: null, food_skin: null },
      items: [
        {
          id: 'crown_bare',
          slot: 'crown',
          component: null,
          name: 'crown_bare',
          rarity: 'common',
          supporterOnly: false,
          owned: false,
          equipped: false,
        },
      ],
    });
  });
});

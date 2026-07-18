/**
 * @jest-environment node
 */

/**
 * Handle API tests (Player Identity v1 section 3) - Supabase mocked.
 * GET answers format/denylist (leet-normalized)/taken; POST maps the
 * claim_handle result codes (invalid_format / reserved / cooldown +
 * next_change_at / taken / success); both rate-limit and both degrade
 * cleanly during the pre-migration-022 window.
 */

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
import { generatedHandleFor, normalizeHandle } from '@/lib/identity/handle';

const PLAYER_ID = 'player-1';

/** Table-driven mock: players + rate_limits + reserved_handles. */
function mockTables(options: {
  reserved?: Array<{ pattern: string; match_mode: string }>;
  reservedError?: { code?: string; message: string };
  takenRows?: Array<{ id: string }>;
  takenError?: { code?: string; message: string };
} = {}) {
  mockAuth.mockResolvedValue({ data: { user: { id: 'user-1' } }, error: null });
  mockFrom.mockImplementation((table: string) => {
    if (table === 'players') {
      return {
        select: () => ({
          eq: () => ({
            single: async () => ({ data: { id: PLAYER_ID }, error: null }),
          }),
          ilike: () => ({
            limit: async () => ({
              data: options.takenRows ?? [],
              error: options.takenError ?? null,
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
              single: async () => ({ data: null, error: null }),
            }),
          }),
        }),
        upsert: async () => ({ data: null, error: null }),
      };
    }
    if (table === 'reserved_handles') {
      return {
        select: async () => ({
          data: options.reservedError ? null : (options.reserved ?? []),
          error: options.reservedError ?? null,
        }),
      };
    }
    throw new Error(`Unexpected table ${table}`);
  });
}

// The players.select chain is used for BOTH the player lookup (eq/single)
// and the taken check (ilike/limit) - the mock above serves both.

function getRequest(check: string) {
  return new NextRequest(
    `http://localhost:3000/api/player/handle?check=${encodeURIComponent(check)}`,
    { headers: { authorization: 'Bearer valid-token' } }
  );
}

function postRequest(handle: unknown) {
  return new NextRequest('http://localhost:3000/api/player/handle', {
    method: 'POST',
    headers: {
      authorization: 'Bearer valid-token',
      'content-type': 'application/json',
    },
    body: JSON.stringify({ handle }),
  });
}

beforeEach(() => {
  mockAuth = jest.fn();
  mockFrom = jest.fn();
  mockRpc = jest.fn();
});

describe('handle normalization (lockstep with normalize_handle SQL)', () => {
  it('lowercases, strips underscores, maps the leet alphabet', () => {
    expect(normalizeHandle('S0uc1')).toBe('souci');
    expect(normalizeHandle('h4ndl3r')).toBe('handler');
    expect(normalizeHandle('_A_d_m_1_n_')).toBe('admin');
    expect(normalizeHandle('$h17')).toBe('shit');
    expect(normalizeHandle('n@z1')).toBe('nazi');
  });

  it('derives the section 3.2 guest name: last 4 hex, mod 10000, padded', () => {
    // ...0417 hex = 1047 decimal
    expect(
      generatedHandleFor('00000000-0000-0000-0000-000000000417')
    ).toBe('handler-1047');
    // ffff = 65535 -> mod 10000 = 5535
    expect(
      generatedHandleFor('00000000-0000-0000-0000-00000000ffff')
    ).toBe('handler-5535');
  });
});

describe('GET /api/player/handle (availability)', () => {
  it('401 without a token', async () => {
    const response = await GET(
      new NextRequest('http://localhost:3000/api/player/handle?check=Souci')
    );
    expect(response.status).toBe(401);
  });

  it('rejects bad formats without touching the database', async () => {
    mockTables();
    for (const bad of ['ab', 'a'.repeat(17), 'söuci', 'has space', 'no-dash']) {
      const response = await GET(getRequest(bad));
      const body = await response.json();
      expect(body).toMatchObject({ live: true, available: false, reason: 'invalid_format' });
    }
  });

  it('answers reserved for an exact reserved word', async () => {
    mockTables({ reserved: [{ pattern: 'admin', match_mode: 'exact' }] });
    const body = await (await GET(getRequest('Admin'))).json();
    expect(body).toMatchObject({ available: false, reason: 'reserved' });
  });

  it('answers reserved for leet-disguised profanity (substring)', async () => {
    mockTables({ reserved: [{ pattern: 'shit', match_mode: 'substring' }] });
    const body = await (await GET(getRequest('xX_5h17_Xx'))).json();
    expect(body).toMatchObject({ available: false, reason: 'reserved' });
  });

  it('answers taken when a player holds the name (case-insensitive)', async () => {
    mockTables({ takenRows: [{ id: 'other' }] });
    const body = await (await GET(getRequest('Souci'))).json();
    expect(body).toMatchObject({ available: false, reason: 'taken' });
  });

  it('answers available for a clean name', async () => {
    mockTables();
    const body = await (await GET(getRequest('Souci'))).json();
    expect(body).toMatchObject({ live: true, available: true });
  });

  it('degrades to { live: false } pre-022 (missing reserved_handles)', async () => {
    mockTables({
      reservedError: { code: '42P01', message: 'relation "reserved_handles" does not exist' },
    });
    const response = await GET(getRequest('Souci'));
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ live: false });
  });
});

describe('POST /api/player/handle (claim)', () => {
  it('maps a successful claim', async () => {
    mockTables();
    mockRpc.mockResolvedValue({ data: { success: true, handle: 'Souci' }, error: null });
    const response = await POST(postRequest('Souci'));
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ success: true, handle: 'Souci' });
    expect(mockRpc).toHaveBeenCalledWith('claim_handle', {
      p_player_id: PLAYER_ID,
      p_handle: 'Souci',
    });
  });

  it('maps invalid_format to 400', async () => {
    mockTables();
    mockRpc.mockResolvedValue({ data: { error: 'invalid_format' }, error: null });
    const response = await POST(postRequest('!!'));
    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({ error: 'invalid_format' });
  });

  it('maps reserved to 409', async () => {
    mockTables();
    mockRpc.mockResolvedValue({ data: { error: 'reserved' }, error: null });
    const response = await POST(postRequest('admin'));
    expect(response.status).toBe(409);
    expect(await response.json()).toMatchObject({ error: 'reserved' });
  });

  it('maps taken to 409', async () => {
    mockTables();
    mockRpc.mockResolvedValue({ data: { error: 'taken' }, error: null });
    const response = await POST(postRequest('Souci'));
    expect(response.status).toBe(409);
    expect(await response.json()).toMatchObject({ error: 'taken' });
  });

  it('maps cooldown to 409 WITH the next-change date', async () => {
    mockTables();
    mockRpc.mockResolvedValue({
      data: { error: 'cooldown', next_change_at: '2026-08-17T00:00:00Z' },
      error: null,
    });
    const response = await POST(postRequest('NewName'));
    expect(response.status).toBe(409);
    expect(await response.json()).toEqual({
      error: 'cooldown',
      nextChangeAt: '2026-08-17T00:00:00Z',
    });
  });

  it('503s (never 500s) while claim_handle does not exist yet', async () => {
    mockTables();
    mockRpc.mockResolvedValue({
      data: null,
      error: { code: 'PGRST202', message: 'Could not find the function claim_handle' },
    });
    const response = await POST(postRequest('Souci'));
    expect(response.status).toBe(503);
  });
});

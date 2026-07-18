/**
 * @jest-environment node
 */

/**
 * Discord status + unlink tests (Identity v1 sections 8.3/8.5).
 * GET never leaks token material; DELETE revokes at Discord then
 * deletes the row, degrading to revoked_at when revocation fails.
 */

import { randomBytes } from 'crypto';

process.env.DISCORD_TOKEN_ENC_KEY = randomBytes(32).toString('base64');
process.env.DISCORD_CLIENT_ID = 'app-123';
process.env.DISCORD_CLIENT_SECRET = 'secret-123';

var mockAuth: jest.Mock;
var mockFrom: jest.Mock;

jest.mock('@supabase/supabase-js', () => ({
  createClient: () => ({
    auth: { getUser: (...args: unknown[]) => mockAuth(...args) },
    from: (...args: unknown[]) => mockFrom(...args),
  }),
}));

import { GET, DELETE } from './route';
import { NextRequest } from 'next/server';
import { encryptSecret } from '@/lib/server/crypto';

const mockFetch = jest.fn();
global.fetch = mockFetch as unknown as typeof fetch;

function jsonResponse(status: number, body: unknown): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: new Headers(),
    json: async () => body,
    text: async () => JSON.stringify(body),
  } as unknown as Response;
}

interface StatusFixture {
  linkRow: Record<string, unknown> | null;
  linkError?: { code?: string; message: string };
  deletes: number;
  updates: Array<Record<string, unknown>>;
}

function configure(fixture: StatusFixture) {
  mockAuth = jest.fn().mockResolvedValue({ data: { user: { id: 'user-1' } }, error: null });
  mockFrom = jest.fn().mockImplementation((table: string) => {
    if (table === 'players') {
      return {
        select: () => ({
          eq: () => ({ single: async () => ({ data: { id: 'player-1' }, error: null }) }),
        }),
      };
    }
    if (table === 'discord_links') {
      return {
        select: () => ({
          eq: () => ({
            maybeSingle: async () => ({
              data: fixture.linkError ? null : fixture.linkRow,
              error: fixture.linkError ?? null,
            }),
          }),
        }),
        delete: () => ({
          eq: async () => {
            fixture.deletes += 1;
            return { error: null };
          },
        }),
        update: (values: Record<string, unknown>) => ({
          eq: async () => {
            fixture.updates.push(values);
            return { error: null };
          },
        }),
      };
    }
    throw new Error(`Unexpected table ${table}`);
  });
}

function request(method: 'GET' | 'DELETE' = 'GET') {
  return new NextRequest('https://supasnake.com/api/discord/status', {
    method,
    headers: { authorization: 'Bearer token' },
  });
}

beforeEach(() => {
  mockFetch.mockReset();
});

describe('GET /api/discord/status', () => {
  it('reports linked WITHOUT any token material', async () => {
    configure({
      linkRow: { discord_username: 'Souci', linked_at: '2026-07-18T00:00:00Z', revoked_at: null },
      deletes: 0,
      updates: [],
    });
    const response = await GET(request());
    const body = await response.json();
    expect(body).toEqual({
      live: true,
      linked: true,
      discordUsername: 'Souci',
      linkedAt: '2026-07-18T00:00:00Z',
    });
    expect(JSON.stringify(body)).not.toMatch(/token/i);
  });

  it('reports not-linked and the revoked degradation notice', async () => {
    configure({ linkRow: null, deletes: 0, updates: [] });
    expect(await (await GET(request())).json()).toEqual({ live: true, linked: false });

    configure({
      linkRow: { discord_username: 'Souci', linked_at: null, revoked_at: '2026-07-01T00:00:00Z' },
      deletes: 0,
      updates: [],
    });
    expect(await (await GET(request())).json()).toEqual({
      live: true,
      linked: false,
      revoked: true,
    });
  });

  it('degrades pre-024 to live:false', async () => {
    configure({
      linkRow: null,
      linkError: { code: '42P01', message: 'relation "discord_links" does not exist' },
      deletes: 0,
      updates: [],
    });
    expect(await (await GET(request())).json()).toEqual({ live: false, linked: false });
  });
});

describe('DELETE /api/discord/status (unlink)', () => {
  it('revokes at Discord then DELETES the row', async () => {
    const fixture: StatusFixture = {
      linkRow: { access_token_enc: encryptSecret('the-access-token') },
      deletes: 0,
      updates: [],
    };
    configure(fixture);
    mockFetch.mockResolvedValueOnce(jsonResponse(200, {}));

    const response = await DELETE(request('DELETE'));
    expect(await response.json()).toEqual({ success: true, linked: false });

    // The revocation call carried the DECRYPTED token to Discord only
    const [url, init] = mockFetch.mock.calls[0];
    expect(url).toContain('/oauth2/token/revoke');
    expect(init.body as string).toContain('token=the-access-token');
    expect(fixture.deletes).toBe(1);
    expect(fixture.updates).toHaveLength(0);
  });

  it('keeps the row with revoked_at when Discord revocation fails (sweep collects it)', async () => {
    const fixture: StatusFixture = {
      linkRow: { access_token_enc: encryptSecret('the-access-token') },
      deletes: 0,
      updates: [],
    };
    configure(fixture);
    mockFetch.mockResolvedValue(jsonResponse(500, { message: 'oops' }));

    const response = await DELETE(request('DELETE'));
    expect(await response.json()).toEqual({ success: true, linked: false });
    expect(fixture.deletes).toBe(0);
    expect(fixture.updates).toHaveLength(1);
    expect(fixture.updates[0]).toHaveProperty('revoked_at');
  });

  it('is a no-op when nothing is linked', async () => {
    configure({ linkRow: null, deletes: 0, updates: [] });
    const response = await DELETE(request('DELETE'));
    expect(await response.json()).toEqual({ success: true, linked: false });
    expect(mockFetch).not.toHaveBeenCalled();
  });
});

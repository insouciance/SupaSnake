/**
 * @jest-environment node
 */

/**
 * Discord OAuth callback tests (Identity v1 section 8.3) - Discord
 * fetch + Supabase mocked, REAL crypto/state/discord modules.
 *
 * Success (exchange -> encrypted store -> guilds.join -> redirect
 * ?discord=linked), user-denied, forged/expired state, guilds.join 403
 * -> widget invite fallback, and the duplicate-Discord-account 409.
 * Every stored token must decrypt back to the exchanged pair - and the
 * raw tokens must never appear in the stored row.
 */

import { randomBytes } from 'crypto';

process.env.DISCORD_TOKEN_ENC_KEY = randomBytes(32).toString('base64');
process.env.DISCORD_BOT_TOKEN = 'bot-token';
process.env.DISCORD_CLIENT_ID = 'app-123';
process.env.DISCORD_CLIENT_SECRET = 'secret-123';
process.env.DISCORD_GUILD_ID = 'guild-official';
process.env.DISCORD_REDIRECT_URI = 'https://supasnake.com/api/discord/callback';
process.env.DISCORD_REDIRECT_URI_LOCAL = 'http://localhost:3000/api/discord/callback';

var mockFrom: jest.Mock;
var mockRefreshLinkedRoles: jest.Mock;

jest.mock('@supabase/supabase-js', () => ({
  createClient: () => ({
    from: (...args: unknown[]) => mockFrom(...args),
  }),
}));

jest.mock('@/lib/server/discordSync', () => ({
  refreshLinkedRolesForPlayer: (...args: unknown[]) => mockRefreshLinkedRoles(...args),
}));

import { GET } from './route';
import { NextRequest } from 'next/server';
import { decryptSecret, createOAuthState } from '@/lib/server/crypto';
import { clearWidgetCache } from '@/lib/server/discord';

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

interface TableConfig {
  existingLink?: { player_id: string } | null;
  upserts: Array<Record<string, unknown>>;
  clanLink?: { guild_id: string; role_id: string } | null;
}

function configureTables(config: TableConfig) {
  mockFrom.mockImplementation((table: string) => {
    if (table === 'discord_links') {
      return {
        select: () => ({
          eq: () => ({
            maybeSingle: async () => ({ data: config.existingLink ?? null, error: null }),
          }),
        }),
        upsert: async (values: Record<string, unknown>) => {
          config.upserts.push(values);
          return { error: null };
        },
      };
    }
    if (table === 'players') {
      return {
        select: () => ({
          eq: () => ({
            single: async () => ({ data: { user_id: 'auth-user-1' }, error: null }),
          }),
        }),
      };
    }
    if (table === 'clan_members') {
      return {
        select: () => ({
          eq: () => ({
            maybeSingle: async () => ({
              data: config.clanLink === undefined ? null : { clan_id: 'clan-1' },
              error: null,
            }),
          }),
        }),
      };
    }
    if (table === 'discord_clan_links') {
      return {
        select: () => ({
          eq: () => ({
            maybeSingle: async () => ({ data: config.clanLink ?? null, error: null }),
          }),
        }),
      };
    }
    throw new Error(`Unexpected table ${table}`);
  });
}

/** Discord API responses keyed by URL substring + method. */
function discordApi(overrides: Partial<Record<string, Response>> = {}) {
  mockFetch.mockImplementation(async (url: string, init?: RequestInit) => {
    const method = init?.method ?? 'GET';
    for (const [key, response] of Object.entries(overrides)) {
      if (url.includes(key.split(' ')[1] ?? key) && (key.split(' ')[0] === method || !key.includes(' '))) {
        return response;
      }
    }
    if (url.includes('/oauth2/token')) {
      return jsonResponse(200, {
        access_token: 'raw-access-token',
        refresh_token: 'raw-refresh-token',
        expires_in: 604800,
        scope: 'identify guilds.join role_connections.write',
      });
    }
    if (url.includes('/users/@me')) {
      return jsonResponse(200, { id: 'discord-user-1', username: 'souci', global_name: 'Souci' });
    }
    if (url.includes('/members/') && method === 'PUT') {
      return jsonResponse(201, { user: {} });
    }
    if (url.includes('/widget.json')) {
      return jsonResponse(200, {
        presence_count: 3,
        instant_invite: 'https://discord.gg/fallback',
        members: [],
      });
    }
    throw new Error(`Unexpected Discord call: ${method} ${url}`);
  });
}

function callbackRequest(params: Record<string, string>) {
  const url = new URL('https://supasnake.com/api/discord/callback');
  for (const [key, value] of Object.entries(params)) url.searchParams.set(key, value);
  return new NextRequest(url.toString());
}

beforeEach(() => {
  mockFrom = jest.fn();
  mockRefreshLinkedRoles = jest.fn().mockResolvedValue(true);
  mockFetch.mockReset();
  clearWidgetCache();
});

describe('GET /api/discord/callback', () => {
  it('links happily: exchange, ENCRYPTED store, guilds.join, metadata push, redirect', async () => {
    const config: TableConfig = { existingLink: null, upserts: [] };
    configureTables(config);
    discordApi();

    const response = await GET(
      callbackRequest({ code: 'auth-code', state: createOAuthState('player-1') })
    );

    expect(response.status).toBe(307);
    const location = new URL(response.headers.get('location')!);
    expect(location.pathname).toBe('/settings');
    expect(location.searchParams.get('discord')).toBe('linked');

    // Stored row: encrypted tokens that decrypt back; raw NEVER stored
    expect(config.upserts).toHaveLength(1);
    const stored = config.upserts[0];
    expect(stored.player_id).toBe('player-1');
    expect(stored.discord_user_id).toBe('discord-user-1');
    expect(stored.access_token_enc).not.toContain('raw-access-token');
    expect(stored.refresh_token_enc).not.toContain('raw-refresh-token');
    expect(decryptSecret(stored.access_token_enc as string)).toBe('raw-access-token');
    expect(decryptSecret(stored.refresh_token_enc as string)).toBe('raw-refresh-token');
    expect(stored.revoked_at).toBeNull();
    expect(JSON.stringify(stored)).not.toContain('raw-access-token');

    // The exchange used the prod redirect URI (host = supasnake.com)
    const exchangeBody = mockFetch.mock.calls.find(([u]) => (u as string).includes('/oauth2/token'))![1]!.body as string;
    expect(exchangeBody).toContain(encodeURIComponent('https://supasnake.com/api/discord/callback'));

    // guilds.join hit the official guild with the user's access token
    const joinCall = mockFetch.mock.calls.find(
      ([u, i]) => (u as string).includes('/members/') && (i as RequestInit).method === 'PUT'
    )!;
    expect(joinCall[0]).toContain('/guilds/guild-official/members/discord-user-1');

    expect(mockRefreshLinkedRoles).toHaveBeenCalledWith(expect.anything(), 'player-1');
  });

  it('redirects ?discord=error when the user denied the authorization', async () => {
    configureTables({ existingLink: null, upserts: [] });
    const response = await GET(callbackRequest({ error: 'access_denied' }));
    const location = new URL(response.headers.get('location')!);
    expect(location.searchParams.get('discord')).toBe('error');
    expect(location.searchParams.get('reason')).toBe('denied');
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it('rejects a forged state without touching Discord', async () => {
    configureTables({ existingLink: null, upserts: [] });
    const response = await GET(
      callbackRequest({ code: 'auth-code', state: 'forged.state' })
    );
    const location = new URL(response.headers.get('location')!);
    expect(location.searchParams.get('reason')).toBe('state');
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it('rejects an expired state', async () => {
    configureTables({ existingLink: null, upserts: [] });
    const stale = createOAuthState('player-1', Date.now() - 11 * 60 * 1000);
    const response = await GET(callbackRequest({ code: 'auth-code', state: stale }));
    expect(new URL(response.headers.get('location')!).searchParams.get('reason')).toBe('state');
  });

  it('falls back to the widget invite link when guilds.join 403s', async () => {
    const config: TableConfig = { existingLink: null, upserts: [] };
    configureTables(config);
    discordApi({
      'PUT /members/': jsonResponse(403, { message: 'Missing Permissions', code: 50013 }),
    });

    const response = await GET(
      callbackRequest({ code: 'auth-code', state: createOAuthState('player-1') })
    );
    const location = new URL(response.headers.get('location')!);
    // Still linked - the grant stored fine
    expect(location.searchParams.get('discord')).toBe('linked');
    expect(location.searchParams.get('join')).toBe('invite');
    expect(location.searchParams.get('invite')).toBe('https://discord.gg/fallback');
    expect(config.upserts).toHaveLength(1);
  });

  it('409s when the Discord account is already linked to ANOTHER player', async () => {
    const config: TableConfig = {
      existingLink: { player_id: 'someone-else' },
      upserts: [],
    };
    configureTables(config);
    discordApi();

    const response = await GET(
      callbackRequest({ code: 'auth-code', state: createOAuthState('player-1') })
    );
    expect(response.status).toBe(409);
    expect(config.upserts).toHaveLength(0);
    const body = await response.json();
    expect(body.error).toContain('already linked');
  });

  it('re-links the SAME player fine (upsert path)', async () => {
    const config: TableConfig = {
      existingLink: { player_id: 'player-1' },
      upserts: [],
    };
    configureTables(config);
    discordApi();

    const response = await GET(
      callbackRequest({ code: 'auth-code', state: createOAuthState('player-1') })
    );
    expect(new URL(response.headers.get('location')!).searchParams.get('discord')).toBe('linked');
    expect(config.upserts).toHaveLength(1);
  });
});

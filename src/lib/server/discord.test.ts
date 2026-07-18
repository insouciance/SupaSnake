/**
 * @jest-environment node
 */

/**
 * Discord REST layer tests (Identity v1 section 8.3) - global fetch
 * mocked. 429 retry-after handling, typed errors, rotating token
 * refresh persistence + revoked_at degradation, widget 60s cache,
 * provisioning rollback, and the pre-024 infra detector.
 */

import { randomBytes } from 'crypto';

process.env.DISCORD_TOKEN_ENC_KEY = randomBytes(32).toString('base64');
process.env.DISCORD_BOT_TOKEN = 'test-bot-token';
process.env.DISCORD_CLIENT_ID = 'app-123';
process.env.DISCORD_CLIENT_SECRET = 'secret-123';
process.env.DISCORD_REDIRECT_URI = 'https://supasnake.com/api/discord/callback';
process.env.DISCORD_REDIRECT_URI_LOCAL = 'http://localhost:3000/api/discord/callback';

import type { SupabaseClient } from '@supabase/supabase-js';
import { encryptSecret, decryptSecret } from './crypto';
import {
  DiscordApiError,
  buildAuthorizeUrl,
  clearWidgetCache,
  discordFetch,
  getGuildWidget,
  getLiveDiscordLink,
  isMissingDiscordInfra,
  provisionClanSpace,
  redirectUriForHost,
} from './discord';

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

beforeEach(() => {
  mockFetch.mockReset();
  clearWidgetCache();
});

describe('isMissingDiscordInfra (pre-024 detector)', () => {
  it('classifies missing relations/columns/functions', () => {
    expect(isMissingDiscordInfra({ code: '42P01' })).toBe(true);
    expect(isMissingDiscordInfra({ code: '42703' })).toBe(true);
    expect(isMissingDiscordInfra({ code: 'PGRST202' })).toBe(true);
    expect(isMissingDiscordInfra({ message: 'relation "discord_links" does not exist' })).toBe(true);
    expect(isMissingDiscordInfra({ message: 'function respond_clan_invite does not exist' })).toBe(true);
  });

  it('does not swallow real errors', () => {
    expect(isMissingDiscordInfra(null)).toBe(false);
    expect(isMissingDiscordInfra({ code: '23505', message: 'duplicate key' })).toBe(false);
  });
});

describe('discordFetch', () => {
  it('sends the bot token and the proper User-Agent', async () => {
    mockFetch.mockResolvedValueOnce(jsonResponse(200, { id: '1' }));
    await discordFetch('/guilds/1');
    const [url, init] = mockFetch.mock.calls[0];
    expect(url).toBe('https://discord.com/api/v10/guilds/1');
    expect(init.headers['Authorization']).toBe('Bot test-bot-token');
    expect(init.headers['User-Agent']).toBe('DiscordBot (https://supasnake.com, 0.1)');
  });

  it('retries after a 429 using retry_after and then succeeds', async () => {
    mockFetch
      .mockResolvedValueOnce(jsonResponse(429, { retry_after: 0.01 }))
      .mockResolvedValueOnce(jsonResponse(200, { id: 'ok' }));
    const result = await discordFetch<{ id: string }>('/guilds/1');
    expect(result?.id).toBe('ok');
    expect(mockFetch).toHaveBeenCalledTimes(2);
  });

  it('gives up after repeated 429s with a typed 429 error', async () => {
    mockFetch.mockResolvedValue(jsonResponse(429, { retry_after: 0.001 }));
    await expect(discordFetch('/guilds/1')).rejects.toMatchObject({
      name: 'DiscordApiError',
      status: 429,
    });
    expect(mockFetch).toHaveBeenCalledTimes(3);
  });

  it('throws typed errors with the Discord message and code', async () => {
    mockFetch.mockResolvedValueOnce(
      jsonResponse(403, { message: 'Missing Permissions', code: 50013 })
    );
    try {
      await discordFetch('/guilds/1/channels', { method: 'POST', body: '{}' });
      throw new Error('should have thrown');
    } catch (err) {
      expect(err).toBeInstanceOf(DiscordApiError);
      expect((err as DiscordApiError).status).toBe(403);
      expect((err as DiscordApiError).code).toBe(50013);
      expect((err as DiscordApiError).message).toBe('Missing Permissions');
    }
  });

  it('returns null on 204 (guilds.join "already a member")', async () => {
    mockFetch.mockResolvedValueOnce(jsonResponse(204, null));
    expect(await discordFetch('/guilds/1/members/2', { method: 'PUT' })).toBeNull();
  });
});

describe('OAuth URL + redirect selection', () => {
  it('picks the local redirect for localhost hosts only', () => {
    expect(redirectUriForHost('localhost:3000')).toBe(process.env.DISCORD_REDIRECT_URI_LOCAL);
    expect(redirectUriForHost('127.0.0.1:3000')).toBe(process.env.DISCORD_REDIRECT_URI_LOCAL);
    expect(redirectUriForHost('supasnake.com')).toBe(process.env.DISCORD_REDIRECT_URI);
    expect(redirectUriForHost(null)).toBe(process.env.DISCORD_REDIRECT_URI);
  });

  it('builds the authorize URL with the three scopes and the state', () => {
    const url = new URL(buildAuthorizeUrl('https://supasnake.com/api/discord/callback', 'state-x'));
    expect(url.origin + url.pathname).toBe('https://discord.com/oauth2/authorize');
    expect(url.searchParams.get('client_id')).toBe('app-123');
    expect(url.searchParams.get('scope')).toBe('identify guilds.join role_connections.write');
    expect(url.searchParams.get('state')).toBe('state-x');
    expect(url.searchParams.get('response_type')).toBe('code');
  });
});

describe('getLiveDiscordLink (rotating refresh custody)', () => {
  function mockSupabase(row: Record<string, unknown> | null, capture: { updates: Record<string, unknown>[] }) {
    return {
      from: (table: string) => {
        if (table !== 'discord_links') throw new Error(`unexpected table ${table}`);
        return {
          select: () => ({
            eq: () => ({
              maybeSingle: async () => ({ data: row, error: null }),
            }),
          }),
          update: (values: Record<string, unknown>) => {
            capture.updates.push(values);
            return { eq: async () => ({ error: null }) };
          },
        };
      },
    } as unknown as SupabaseClient;
  }

  it('returns the decrypted access token when not near expiry', async () => {
    const capture = { updates: [] as Record<string, unknown>[] };
    const supabase = mockSupabase(
      {
        player_id: 'p1',
        discord_user_id: 'd1',
        access_token_enc: encryptSecret('live-access'),
        refresh_token_enc: encryptSecret('live-refresh'),
        token_expires_at: new Date(Date.now() + 3600_000).toISOString(),
        revoked_at: null,
      },
      capture
    );
    const link = await getLiveDiscordLink(supabase, 'p1');
    expect(link).toEqual({ discordUserId: 'd1', accessToken: 'live-access' });
    // touch of last_used_at only
    expect(capture.updates).toHaveLength(1);
    expect(capture.updates[0]).toHaveProperty('last_used_at');
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it('refreshes near expiry and persists the ROTATED pair', async () => {
    mockFetch.mockResolvedValueOnce(
      jsonResponse(200, {
        access_token: 'new-access',
        refresh_token: 'new-refresh',
        expires_in: 604800,
        scope: 'identify',
      })
    );
    const capture = { updates: [] as Record<string, unknown>[] };
    const supabase = mockSupabase(
      {
        player_id: 'p1',
        discord_user_id: 'd1',
        access_token_enc: encryptSecret('old-access'),
        refresh_token_enc: encryptSecret('old-refresh'),
        token_expires_at: new Date(Date.now() - 1000).toISOString(),
        revoked_at: null,
      },
      capture
    );
    const link = await getLiveDiscordLink(supabase, 'p1');
    expect(link?.accessToken).toBe('new-access');
    // the refresh grant used the OLD refresh token
    const body = mockFetch.mock.calls[0][1].body as string;
    expect(body).toContain('grant_type=refresh_token');
    expect(body).toContain('refresh_token=old-refresh');
    // BOTH tokens persisted encrypted (rotating pair)
    const persisted = capture.updates[0];
    expect(decryptSecret(persisted.access_token_enc as string)).toBe('new-access');
    expect(decryptSecret(persisted.refresh_token_enc as string)).toBe('new-refresh');
  });

  it('degrades to revoked_at on refresh failure and returns null', async () => {
    mockFetch.mockResolvedValue(jsonResponse(400, { error: 'invalid_grant' }));
    const capture = { updates: [] as Record<string, unknown>[] };
    const supabase = mockSupabase(
      {
        player_id: 'p1',
        discord_user_id: 'd1',
        access_token_enc: encryptSecret('old-access'),
        refresh_token_enc: encryptSecret('old-refresh'),
        token_expires_at: new Date(Date.now() - 1000).toISOString(),
        revoked_at: null,
      },
      capture
    );
    const link = await getLiveDiscordLink(supabase, 'p1');
    expect(link).toBeNull();
    expect(capture.updates.some((u) => 'revoked_at' in u && u.revoked_at !== null)).toBe(true);
  });

  it('ignores revoked and missing links', async () => {
    const capture = { updates: [] as Record<string, unknown>[] };
    expect(
      await getLiveDiscordLink(
        mockSupabase(
          {
            player_id: 'p1',
            discord_user_id: 'd1',
            access_token_enc: encryptSecret('a'),
            refresh_token_enc: encryptSecret('r'),
            token_expires_at: new Date(Date.now() + 3600_000).toISOString(),
            revoked_at: new Date().toISOString(),
          },
          capture
        ),
        'p1'
      )
    ).toBeNull();
    expect(await getLiveDiscordLink(mockSupabase(null, capture), 'p1')).toBeNull();
  });
});

describe('getGuildWidget (60s in-memory cache)', () => {
  it('caches per guild for 60 seconds', async () => {
    mockFetch.mockResolvedValue(
      jsonResponse(200, {
        presence_count: 4,
        instant_invite: 'https://discord.gg/abc',
        members: [{ username: 'souci', status: 'online' }],
      })
    );
    const first = await getGuildWidget('guild-1');
    const second = await getGuildWidget('guild-1');
    expect(first?.presence_count).toBe(4);
    expect(second).toBe(first);
    expect(mockFetch).toHaveBeenCalledTimes(1);
    // widget.json is unauthenticated
    expect(mockFetch.mock.calls[0][1].headers['Authorization']).toBeUndefined();

    await getGuildWidget('guild-2');
    expect(mockFetch).toHaveBeenCalledTimes(2);
  });

  it('caches null (widget disabled) instead of hammering Discord', async () => {
    mockFetch.mockResolvedValue(jsonResponse(403, { message: 'Widget Disabled', code: 50001 }));
    expect(await getGuildWidget('guild-3')).toBeNull();
    expect(await getGuildWidget('guild-3')).toBeNull();
    expect(mockFetch).toHaveBeenCalledTimes(1);
  });
});

describe('provisionClanSpace', () => {
  it('creates role -> private channel (deny @everyone / allow role) -> webhook -> invite', async () => {
    mockFetch
      .mockResolvedValueOnce(jsonResponse(200, { id: 'role-1' }))
      .mockResolvedValueOnce(jsonResponse(200, { id: 'chan-1' }))
      .mockResolvedValueOnce(jsonResponse(200, { id: 'hook-1', token: 'hook-token' }))
      .mockResolvedValueOnce(jsonResponse(200, { code: 'inv123' }));

    const space = await provisionClanSpace('guild-9', { name: 'Elite', tag: 'ELIT' });
    expect(space).toEqual({
      guildId: 'guild-9',
      channelId: 'chan-1',
      roleId: 'role-1',
      webhookId: 'hook-1',
      webhookToken: 'hook-token',
      inviteUrl: 'https://discord.gg/inv123',
    });

    const channelBody = JSON.parse(mockFetch.mock.calls[1][1].body as string);
    expect(channelBody.permission_overwrites).toEqual([
      { id: 'guild-9', type: 0, deny: '1024' },
      { id: 'role-1', type: 0, allow: '1024' },
    ]);
  });

  it('rolls back the role and channel when the webhook fails', async () => {
    mockFetch
      .mockResolvedValueOnce(jsonResponse(200, { id: 'role-1' }))
      .mockResolvedValueOnce(jsonResponse(200, { id: 'chan-1' }))
      .mockResolvedValueOnce(jsonResponse(403, { message: 'Missing Permissions', code: 50013 }))
      // cleanup deletes
      .mockResolvedValueOnce(jsonResponse(204, null))
      .mockResolvedValueOnce(jsonResponse(204, null));

    await expect(
      provisionClanSpace('guild-9', { name: 'Elite', tag: 'ELIT' })
    ).rejects.toMatchObject({ status: 403 });

    const deleteCalls = mockFetch.mock.calls.filter(([, init]) => init.method === 'DELETE');
    expect(deleteCalls.map(([url]) => url)).toEqual([
      'https://discord.com/api/v10/channels/chan-1',
      'https://discord.com/api/v10/guilds/guild-9/roles/role-1',
    ]);
  });
});

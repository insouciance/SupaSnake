/**
 * @jest-environment node
 */

/**
 * Clan Discord space tests (Identity v1 section 8.3): the permission
 * matrix (owner/officer yes, member 403), the 400-official-links cap
 * guard, own-server verification, encrypted webhook storage, unlink
 * cleanup, and the pre-024 503.
 */

import { randomBytes } from 'crypto';

process.env.DISCORD_TOKEN_ENC_KEY = randomBytes(32).toString('base64');
process.env.DISCORD_GUILD_ID = 'guild-official';

var mockAuth: jest.Mock;
var mockFrom: jest.Mock;
var mockProvision: jest.Mock;
var mockGetGuild: jest.Mock;
var mockDeleteChannel: jest.Mock;
var mockDeleteRole: jest.Mock;
var mockAddMemberRole: jest.Mock;

jest.mock('@supabase/supabase-js', () => ({
  createClient: () => ({
    auth: { getUser: (...args: unknown[]) => mockAuth(...args) },
    from: (...args: unknown[]) => mockFrom(...args),
  }),
}));

jest.mock('@/lib/server/discord', () => {
  const actual = jest.requireActual('@/lib/server/discord');
  return {
    ...actual,
    provisionClanSpace: (...args: unknown[]) => mockProvision(...args),
    getGuild: (...args: unknown[]) => mockGetGuild(...args),
    deleteChannel: (...args: unknown[]) => mockDeleteChannel(...args),
    deleteRole: (...args: unknown[]) => mockDeleteRole(...args),
    addMemberRole: (...args: unknown[]) => mockAddMemberRole(...args),
  };
});

import { POST } from './route';
import { NextRequest } from 'next/server';
import { decryptSecret } from '@/lib/server/crypto';
import { DiscordApiError, OFFICIAL_LINK_CAP } from '@/lib/server/discord';

interface Fixture {
  role: 'owner' | 'officer' | 'member';
  existingLink?: Record<string, unknown> | null;
  linkReadError?: { code?: string; message: string };
  officialCount?: number;
  inserts: Array<Record<string, unknown>>;
  deletes: number;
}

function configure(fixture: Fixture) {
  mockAuth = jest.fn().mockResolvedValue({ data: { user: { id: 'user-1' } }, error: null });
  mockFrom = jest.fn().mockImplementation((table: string) => {
    if (table === 'clan_members') {
      return {
        select: (columns: string) => {
          if (columns.includes('role')) {
            return {
              eq: () => ({
                maybeSingle: async () => ({
                  data: { clan_id: 'clan-1', role: fixture.role },
                  error: null,
                }),
              }),
            };
          }
          // member fan-out read
          return { eq: async () => ({ data: [], error: null }) };
        },
      };
    }
    if (table === 'clans') {
      return {
        select: () => ({
          eq: () => ({
            single: async () => ({
              data: { id: 'clan-1', name: 'Elite', tag: 'ELIT' },
              error: null,
            }),
          }),
        }),
      };
    }
    if (table === 'discord_clan_links') {
      return {
        select: (_columns: string, options?: { count?: string }) => {
          if (options?.count) {
            return {
              eq: async () => ({ count: fixture.officialCount ?? 0, error: null }),
            };
          }
          return {
            eq: () => ({
              maybeSingle: async () => ({
                data: fixture.linkReadError ? null : (fixture.existingLink ?? null),
                error: fixture.linkReadError ?? null,
              }),
            }),
          };
        },
        insert: async (values: Record<string, unknown>) => {
          fixture.inserts.push(values);
          return { error: null };
        },
        delete: () => ({
          eq: async () => {
            fixture.deletes += 1;
            return { error: null };
          },
        }),
      };
    }
    if (table === 'players' || table === 'discord_links') {
      return {
        select: () => ({ in: async () => ({ data: [], error: null }) }),
      };
    }
    throw new Error(`Unexpected table ${table}`);
  });
}

function request(body: Record<string, unknown>) {
  return new NextRequest('https://supasnake.com/api/clan/discord', {
    method: 'POST',
    headers: {
      authorization: 'Bearer token',
      'content-type': 'application/json',
    },
    body: JSON.stringify(body),
  });
}

const SPACE = {
  guildId: 'guild-official',
  channelId: 'chan-1',
  roleId: 'role-1',
  webhookId: 'hook-1',
  webhookToken: 'hook-token',
  inviteUrl: 'https://discord.gg/elite',
};

beforeEach(() => {
  mockProvision = jest.fn().mockResolvedValue(SPACE);
  mockGetGuild = jest.fn().mockResolvedValue({ id: 'guild-own', name: 'Elite HQ' });
  mockDeleteChannel = jest.fn().mockResolvedValue(undefined);
  mockDeleteRole = jest.fn().mockResolvedValue(undefined);
  mockAddMemberRole = jest.fn().mockResolvedValue(undefined);
});

describe('POST /api/clan/discord - permission matrix', () => {
  it('members get 403; owner and officer pass', async () => {
    for (const [role, expected] of [
      ['member', 403],
      ['officer', 200],
      ['owner', 200],
    ] as const) {
      const fixture: Fixture = { role, inserts: [], deletes: 0 };
      configure(fixture);
      const response = await POST(request({ action: 'link_official' }));
      expect(response.status).toBe(expected);
    }
  });
});

describe('link_official', () => {
  it('provisions in the official guild and stores an ENCRYPTED webhook token', async () => {
    const fixture: Fixture = { role: 'owner', inserts: [], deletes: 0 };
    configure(fixture);
    const response = await POST(request({ action: 'link_official' }));
    const body = await response.json();
    expect(body).toMatchObject({
      success: true,
      linked: true,
      model: 'official',
      guildId: 'guild-official',
      channelId: 'chan-1',
    });
    expect(mockProvision).toHaveBeenCalledWith('guild-official', {
      id: 'clan-1',
      name: 'Elite',
      tag: 'ELIT',
    });
    const stored = fixture.inserts[0];
    expect(stored.model).toBe('official');
    expect(stored.webhook_token_enc).not.toContain('hook-token');
    expect(decryptSecret(stored.webhook_token_enc as string)).toBe('hook-token');
    // the response never carries the webhook token
    expect(JSON.stringify(body)).not.toContain('hook-token');
  });

  it(`refuses past the ${OFFICIAL_LINK_CAP}-clan cap with Model B guidance`, async () => {
    const fixture: Fixture = {
      role: 'owner',
      officialCount: OFFICIAL_LINK_CAP,
      inserts: [],
      deletes: 0,
    };
    configure(fixture);
    const response = await POST(request({ action: 'link_official' }));
    expect(response.status).toBe(409);
    const body = await response.json();
    expect(body.code).toBe('official_full');
    expect(body.error).toContain('own Discord server');
    expect(mockProvision).not.toHaveBeenCalled();
  });

  it('409s when the clan already has a space', async () => {
    const fixture: Fixture = {
      role: 'owner',
      existingLink: { clan_id: 'clan-1', model: 'official' },
      inserts: [],
      deletes: 0,
    };
    configure(fixture);
    expect((await POST(request({ action: 'link_official' }))).status).toBe(409);
  });

  it('maps a 403 provisioning failure to a permissions message', async () => {
    mockProvision.mockRejectedValue(new DiscordApiError(403, 'Missing Permissions', 50013));
    const fixture: Fixture = { role: 'owner', inserts: [], deletes: 0 };
    configure(fixture);
    const response = await POST(request({ action: 'link_official' }));
    expect(response.status).toBe(502);
    expect((await response.json()).error).toContain('Manage Channels');
  });
});

describe('link_own', () => {
  it('verifies the bot is in the guild, then provisions there', async () => {
    const fixture: Fixture = { role: 'officer', inserts: [], deletes: 0 };
    configure(fixture);
    const response = await POST(
      request({ action: 'link_own', guildId: '123456789012345678' })
    );
    expect(response.status).toBe(200);
    expect(mockGetGuild).toHaveBeenCalledWith('123456789012345678');
    expect(mockProvision).toHaveBeenCalledWith('123456789012345678', expect.anything());
    expect(fixture.inserts[0].model).toBe('own');
  });

  it('422s when the bot is not in the guild', async () => {
    mockGetGuild.mockRejectedValue(new DiscordApiError(404, 'Unknown Guild'));
    const fixture: Fixture = { role: 'owner', inserts: [], deletes: 0 };
    configure(fixture);
    const response = await POST(
      request({ action: 'link_own', guildId: '123456789012345678' })
    );
    expect(response.status).toBe(422);
    expect((await response.json()).error).toContain('invite it first');
    expect(mockProvision).not.toHaveBeenCalled();
  });

  it('400s on malformed guild ids', async () => {
    const fixture: Fixture = { role: 'owner', inserts: [], deletes: 0 };
    configure(fixture);
    expect((await POST(request({ action: 'link_own', guildId: 'not-a-snowflake' }))).status).toBe(400);
    expect((await POST(request({ action: 'link_own' }))).status).toBe(400);
  });
});

describe('unlink', () => {
  it('deletes the provisioned channel + role and removes the link row', async () => {
    const fixture: Fixture = {
      role: 'owner',
      existingLink: {
        clan_id: 'clan-1',
        model: 'official',
        guild_id: 'guild-official',
        channel_id: 'chan-1',
        role_id: 'role-1',
      },
      inserts: [],
      deletes: 0,
    };
    configure(fixture);
    const response = await POST(request({ action: 'unlink' }));
    expect(await response.json()).toEqual({ success: true, linked: false });
    expect(mockDeleteChannel).toHaveBeenCalledWith('chan-1');
    expect(mockDeleteRole).toHaveBeenCalledWith('guild-official', 'role-1');
    expect(fixture.deletes).toBe(1);
  });

  it('still unlinks when Discord cleanup fails (best effort)', async () => {
    mockDeleteChannel.mockRejectedValue(new DiscordApiError(404, 'Unknown Channel'));
    mockDeleteRole.mockRejectedValue(new DiscordApiError(404, 'Unknown Role'));
    const fixture: Fixture = {
      role: 'owner',
      existingLink: {
        clan_id: 'clan-1',
        model: 'own',
        guild_id: 'guild-own',
        channel_id: 'chan-x',
        role_id: 'role-x',
      },
      inserts: [],
      deletes: 0,
    };
    configure(fixture);
    const response = await POST(request({ action: 'unlink' }));
    expect((await response.json()).success).toBe(true);
    expect(fixture.deletes).toBe(1);
  });

  it('400s when nothing is linked', async () => {
    const fixture: Fixture = { role: 'owner', inserts: [], deletes: 0 };
    configure(fixture);
    expect((await POST(request({ action: 'unlink' }))).status).toBe(400);
  });
});

describe('pre-024 window', () => {
  it('answers 503 while the discord tables are missing', async () => {
    const fixture: Fixture = {
      role: 'owner',
      linkReadError: { code: '42P01', message: 'relation "discord_clan_links" does not exist' },
      inserts: [],
      deletes: 0,
    };
    configure(fixture);
    const response = await POST(request({ action: 'link_official' }));
    expect(response.status).toBe(503);
  });
});

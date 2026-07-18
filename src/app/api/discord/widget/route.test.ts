/**
 * @jest-environment node
 */

/**
 * Widget proxy tests (Identity v1 section 8.4): auth gate, the trimmed
 * presence shape (no raw guild widget passthrough beyond the fields the
 * panel renders), the linked/unlinked/disabled states, and upstream
 * caching via getGuildWidget (mocked here - its 60s cache is covered in
 * discord.test.ts).
 */

var mockAuth: jest.Mock;
var mockFrom: jest.Mock;
var mockGetWidget: jest.Mock;

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
    getGuildWidget: (...args: unknown[]) => mockGetWidget(...args),
  };
});

import { GET } from './route';
import { NextRequest } from 'next/server';

function configure(options: {
  link?: { guild_id: string; invite_url: string | null } | null;
  linkError?: { code?: string; message: string };
}) {
  mockAuth = jest.fn().mockResolvedValue({ data: { user: { id: 'user-1' } }, error: null });
  mockFrom = jest.fn().mockImplementation((table: string) => {
    if (table === 'discord_clan_links') {
      return {
        select: () => ({
          eq: () => ({
            maybeSingle: async () => ({
              data: options.linkError ? null : (options.link ?? null),
              error: options.linkError ?? null,
            }),
          }),
        }),
      };
    }
    throw new Error(`Unexpected table ${table}`);
  });
}

function request(clan: string | null, withAuth = true) {
  const url = new URL('https://supasnake.com/api/discord/widget');
  if (clan) url.searchParams.set('clan', clan);
  return new NextRequest(url.toString(), {
    headers: withAuth ? { authorization: 'Bearer token' } : {},
  });
}

beforeEach(() => {
  mockGetWidget = jest.fn();
});

describe('GET /api/discord/widget', () => {
  it('401s without auth and 400s without a clan id', async () => {
    configure({ link: null });
    expect((await GET(request('clan-1', false))).status).toBe(401);
    expect((await GET(request(null))).status).toBe(400);
  });

  it('returns trimmed presence for a linked clan (max 12 chips)', async () => {
    configure({ link: { guild_id: 'guild-1', invite_url: 'https://discord.gg/clan' } });
    mockGetWidget.mockResolvedValue({
      presence_count: 17,
      instant_invite: 'https://discord.gg/widget',
      members: Array.from({ length: 20 }, (_, i) => ({
        username: `member-${i}`,
        status: 'online',
        avatar_url: `https://cdn.discordapp.com/widget-avatars/${i}`,
      })),
    });

    const body = await (await GET(request('clan-1'))).json();
    expect(body.linked).toBe(true);
    expect(body.presence.onlineCount).toBe(17);
    expect(body.presence.members).toHaveLength(12);
    expect(body.presence.members[0]).toEqual({
      username: 'member-0',
      status: 'online',
      avatarUrl: 'https://cdn.discordapp.com/widget-avatars/0',
    });
    // stored invite wins over the widget's
    expect(body.inviteUrl).toBe('https://discord.gg/clan');
    expect(mockGetWidget).toHaveBeenCalledWith('guild-1');
  });

  it('handles unlinked clans and disabled widgets', async () => {
    configure({ link: null });
    expect(await (await GET(request('clan-1'))).json()).toEqual({ live: true, linked: false });

    configure({ link: { guild_id: 'guild-1', invite_url: null } });
    mockGetWidget.mockResolvedValue(null);
    const body = await (await GET(request('clan-1'))).json();
    expect(body).toEqual({ live: true, linked: true, presence: null, inviteUrl: null });
  });

  it('degrades pre-024 to live:false', async () => {
    configure({ linkError: { code: '42P01', message: 'relation "discord_clan_links" does not exist' } });
    expect(await (await GET(request('clan-1'))).json()).toEqual({ live: false, linked: false });
  });
});

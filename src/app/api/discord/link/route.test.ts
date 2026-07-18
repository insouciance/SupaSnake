/**
 * @jest-environment node
 */

/**
 * Discord link-start tests (Identity v1 section 8.3): auth gate, the
 * authorize URL contents, a verifiable HMAC state carrying the PLAYER
 * id, and host-based redirect-URI selection.
 */

import { randomBytes } from 'crypto';

process.env.DISCORD_TOKEN_ENC_KEY = randomBytes(32).toString('base64');
process.env.DISCORD_CLIENT_ID = 'app-123';
process.env.DISCORD_REDIRECT_URI = 'https://supasnake.com/api/discord/callback';
process.env.DISCORD_REDIRECT_URI_LOCAL = 'http://localhost:3000/api/discord/callback';

var mockAuth: jest.Mock;
var mockFrom: jest.Mock;

jest.mock('@supabase/supabase-js', () => ({
  createClient: () => ({
    auth: { getUser: (...args: unknown[]) => mockAuth(...args) },
    from: (...args: unknown[]) => mockFrom(...args),
  }),
}));

import { GET } from './route';
import { NextRequest } from 'next/server';
import { verifyOAuthState } from '@/lib/server/crypto';

beforeEach(() => {
  mockAuth = jest.fn().mockResolvedValue({ data: { user: { id: 'user-1' } }, error: null });
  mockFrom = jest.fn().mockImplementation((table: string) => {
    if (table === 'players') {
      return {
        select: () => ({
          eq: () => ({ single: async () => ({ data: { id: 'player-1' }, error: null }) }),
        }),
      };
    }
    throw new Error(`Unexpected table ${table}`);
  });
});

function request(url: string, withAuth = true) {
  return new NextRequest(url, {
    headers: withAuth ? { authorization: 'Bearer token' } : {},
  });
}

describe('GET /api/discord/link', () => {
  it('401s without a token', async () => {
    const response = await GET(request('https://supasnake.com/api/discord/link', false));
    expect(response.status).toBe(401);
  });

  it('returns the authorize URL with scopes + a verifiable player-id state', async () => {
    const response = await GET(request('https://supasnake.com/api/discord/link'));
    expect(response.status).toBe(200);
    const { url } = await response.json();
    const parsed = new URL(url);
    expect(parsed.origin + parsed.pathname).toBe('https://discord.com/oauth2/authorize');
    expect(parsed.searchParams.get('scope')).toBe('identify guilds.join role_connections.write');
    expect(parsed.searchParams.get('redirect_uri')).toBe(
      'https://supasnake.com/api/discord/callback'
    );
    const state = verifyOAuthState(parsed.searchParams.get('state'));
    expect(state?.userId).toBe('player-1');
  });

  it('uses the LOCAL redirect uri for localhost requests', async () => {
    const response = await GET(request('http://localhost:3000/api/discord/link'));
    const { url } = await response.json();
    expect(new URL(url).searchParams.get('redirect_uri')).toBe(
      'http://localhost:3000/api/discord/callback'
    );
  });
});

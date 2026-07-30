/**
 * @jest-environment node
 */

/**
 * Clan API — the reworked actions (WP-1.02; Constitution §9.2, §12.2,
 * Rules 5, 6, 8, 11).
 *
 * The suite this replaces asserted local literals (`const clan = { memberCount:
 * 48, maxMembers: 50 }; expect(clan.memberCount < clan.maxMembers).toBe(true)`)
 * and never called a handler. These tests drive the real `GET`/`POST` against a
 * mocked Supabase and assert what the route ASKS FOR as well as what it answers.
 *
 * What is pinned here:
 *
 *   - founding a clan of one, in one RPC;
 *   - joining is by invite code and by nothing else;
 *   - the 12 cap comes back from the server, not from the client;
 *   - leaving goes through `leave_clan` — the route deletes nothing (F-7);
 *   - the removed actions are removed, and answer 400;
 *   - the directory never carries a total (§9.2);
 *   - a missing migration 048 answers 503, never 500.
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

jest.mock('@sentry/nextjs', () => ({ captureException: jest.fn() }));

import { describe, expect, it, beforeEach } from '@jest/globals';
import { NextRequest } from 'next/server';
import { GET, POST } from './route';
import { CLAN_LIMITS } from '@/lib/clan/types';

function post(body: Record<string, unknown>, token = 'token') {
  return new NextRequest('https://supasnake.com/api/clan', {
    method: 'POST',
    headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

function get(url = 'https://supasnake.com/api/clan') {
  return new NextRequest(url);
}

beforeEach(() => {
  mockAuth = jest.fn().mockResolvedValue({ data: { user: { id: 'user-1' } }, error: null });
  mockFrom = jest.fn();
  mockRpc = jest.fn().mockResolvedValue({ data: {}, error: null });
});

describe('POST found — the clan of one (§9.2)', () => {
  it('founds with a name alone and returns the invite artifact', async () => {
    mockRpc.mockResolvedValue({
      data: {
        clan_id: 'clan-1',
        name: 'Elite Snakes',
        tag: 'ES',
        invite_code: 'ABCDEFGH',
        member_count: 1,
        max_members: 12,
      },
      error: null,
    });

    const response = await POST(post({ action: 'found', name: 'Elite Snakes' }));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(mockRpc).toHaveBeenCalledWith(
      'found_clan',
      expect.objectContaining({ p_user_id: 'user-1', p_name: 'Elite Snakes', p_tag: null })
    );
    // A clan of one is complete on arrival: one member, and a way in for others.
    expect(body.clan.memberCount).toBe(1);
    expect(body.invite).toEqual({ code: 'ABCDEFGH', url: '/clan/join/ABCDEFGH' });
  });

  it('passes preset heraldry straight through (§9.2: preset-only)', async () => {
    mockRpc.mockResolvedValue({ data: { clan_id: 'c', invite_code: 'ABCDEFGH' }, error: null });
    await POST(
      post({ action: 'found', name: 'Elite Snakes', bannerId: 'venom_wake', emblemId: 'fang' })
    );
    expect(mockRpc).toHaveBeenCalledWith(
      'found_clan',
      expect.objectContaining({ p_banner_id: 'venom_wake', p_emblem_id: 'fang' })
    );
  });

  it('rejects a name the moderation bound refuses, without reaching the RPC', async () => {
    const response = await POST(post({ action: 'found', name: '<script>' }));
    expect(response.status).toBe(400);
    expect(mockRpc).not.toHaveBeenCalled();
  });

  it('answers 503, not 500, before migration 048 is applied', async () => {
    mockRpc.mockResolvedValue({
      data: null,
      error: { code: 'PGRST202', message: 'Could not find the function found_clan' },
    });
    const response = await POST(post({ action: 'found', name: 'Elite Snakes' }));
    expect(response.status).toBe(503);
  });
});

describe('POST join_by_code — the only recruitment surface (§9.2)', () => {
  it('normalises the code and calls the RPC', async () => {
    mockRpc.mockResolvedValue({ data: { clan_id: 'clan-1', member_count: 2 }, error: null });
    const response = await POST(post({ action: 'join_by_code', code: ' abcdefgh ' }));
    expect(response.status).toBe(200);
    expect(mockRpc).toHaveBeenCalledWith('join_clan_by_code', {
      p_user_id: 'user-1',
      p_code: 'ABCDEFGH',
    });
  });

  it('refuses a malformed code before touching the database', async () => {
    const response = await POST(post({ action: 'join_by_code', code: 'nope' }));
    expect(response.status).toBe(400);
    expect((await response.json()).code).toBe('invalid_code');
    expect(mockRpc).not.toHaveBeenCalled();
  });

  it('surfaces the SERVER-SIDE 12 cap as 400 clan_full', async () => {
    // The cap is decided inside `join_clan_by_code` under FOR UPDATE, not by
    // any client-side count — the route only reports what SQL decided.
    mockRpc.mockResolvedValue({ data: { error: 'clan_full' }, error: null });
    const response = await POST(post({ action: 'join_by_code', code: 'ABCDEFGH' }));
    const body = await response.json();
    expect(response.status).toBe(400);
    expect(body.code).toBe('clan_full');
    expect(CLAN_LIMITS.maxMembers).toBe(12);
  });

  it('reports a disbanded clan as gone rather than missing', async () => {
    mockRpc.mockResolvedValue({ data: { error: 'clan_disbanded' }, error: null });
    const response = await POST(post({ action: 'join_by_code', code: 'ABCDEFGH' }));
    expect(response.status).toBe(410);
  });
});

describe('POST leave — F-7, closed', () => {
  it('goes through leave_clan and deletes nothing itself', async () => {
    mockRpc.mockResolvedValue({
      data: { clan_id: 'clan-1', disbanded: false, tenure_since: '2026-01-01T00:00:00Z' },
      error: null,
    });
    const response = await POST(post({ action: 'leave' }));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(mockRpc).toHaveBeenCalledWith('leave_clan', { p_user_id: 'user-1' });
    // The route no longer touches `clan_members` at all on this path — the
    // whole point of F-7's fix is that the archive and the removal are one
    // transaction in SQL.
    expect(mockFrom).not.toHaveBeenCalled();
    expect(body.result.tenure_since).toBe('2026-01-01T00:00:00Z');
  });

  it('tells the last owner their clan disbanded rather than vanishing quietly', async () => {
    mockRpc.mockResolvedValue({ data: { clan_id: 'c', disbanded: true }, error: null });
    const body = await (await POST(post({ action: 'leave' }))).json();
    expect(body.result.disbanded).toBe(true);
  });

  it('asks an owner with clanmates to hand the clan over first', async () => {
    mockRpc.mockResolvedValue({ data: { error: 'owner_must_transfer' }, error: null });
    const response = await POST(post({ action: 'leave' }));
    expect(response.status).toBe(400);
    expect((await response.json()).code).toBe('owner_must_transfer');
  });
});

describe('POST remove_member — plain roster management (§9.2)', () => {
  it('takes a target and nothing else', async () => {
    mockRpc.mockResolvedValue({ data: { clan_id: 'c', member_count: 2 }, error: null });
    await POST(post({ action: 'remove_member', targetUserId: 'user-2' }));

    const [, args] = mockRpc.mock.calls[0] as [string, Record<string, unknown>];
    expect(Object.keys(args).sort()).toEqual(['p_target_user_id', 'p_user_id']);
    // No metric of the removed member travels with the request: Rule 8's
    // "no officer lever keyed to a member's output", enforced by there being
    // no parameter to key it to.
    expect(JSON.stringify(args)).not.toMatch(/depth|contribution|score|rank|minimum/i);
  });

  it('requires a target', async () => {
    const response = await POST(post({ action: 'remove_member' }));
    expect(response.status).toBe(400);
    expect(mockRpc).not.toHaveBeenCalled();
  });
});

describe('POST — the actions this rework removed', () => {
  it.each(['create', 'join', 'invite', 'set_role'])(
    'answers 400 Invalid action for `%s`',
    async (action) => {
      const response = await POST(
        post({ action, name: 'x', tag: 'XX', clanId: 'c', handle: 'h' })
      );
      expect(response.status).toBe(400);
      expect((await response.json()).error).toBe('Invalid action');
      expect(mockRpc).not.toHaveBeenCalled();
    }
  );
});

describe('POST update_identity — ungated heraldry', () => {
  it('calls set_clan_heraldry, not the research-gated 024 RPC', async () => {
    mockRpc.mockResolvedValue({ data: { clan_id: 'c' }, error: null });
    await POST(post({ action: 'update_identity', bannerId: 'iron_march' }));
    expect(mockRpc).toHaveBeenCalledWith(
      'set_clan_heraldry',
      expect.objectContaining({ p_user_id: 'user-1', p_banner_id: 'iron_march' })
    );
    expect(mockRpc).not.toHaveBeenCalledWith('update_clan_identity', expect.anything());
  });
});

describe('auth', () => {
  it('rejects a request with no bearer token', async () => {
    const response = await POST(
      new NextRequest('https://supasnake.com/api/clan', {
        method: 'POST',
        body: JSON.stringify({ action: 'leave' }),
      })
    );
    expect(response.status).toBe(401);
  });

  it('rejects an invalid token', async () => {
    mockAuth.mockResolvedValue({ data: { user: null }, error: { message: 'bad' } });
    const response = await POST(post({ action: 'leave' }));
    expect(response.status).toBe(401);
  });
});

describe('GET directory — short and alive, and never a total (§9.2)', () => {
  it('returns clans with no population count anywhere in the payload', async () => {
    mockFrom.mockImplementation((table: string) => {
      const rows: Record<string, unknown[]> = {
        serpent_weeks: [{ id: 'w1', week_start: '2026-07-20' }],
        serpent_week_clans: [{ clan_id: 'clan-1', week_id: 'w1', depth: 4200 }],
        clans: [
          {
            id: 'clan-1',
            name: 'Elite Snakes',
            tag: 'ES',
            member_count: 1,
            max_members: 12,
            best_week_depth: 5000,
            disbanded_at: null,
          },
        ],
      };
      const result = { data: rows[table] ?? [], error: null };
      const chain: Record<string, unknown> = {};
      for (const op of ['eq', 'in', 'is', 'not', 'order', 'limit', 'neq', 'gt', 'gte']) {
        chain[op] = () => chain;
      }
      chain.select = () => {
        const promise = Promise.resolve(result);
        return Object.assign(chain, {
          then: promise.then.bind(promise),
          catch: promise.catch.bind(promise),
          finally: promise.finally.bind(promise),
        });
      };
      return chain;
    });

    const response = await GET(get('https://supasnake.com/api/clan?view=directory'));
    const body = await response.json();

    expect(body.clans).toHaveLength(1);
    expect(body.clans[0]).toMatchObject({
      name: 'Elite Snakes',
      lastHuntedWeek: '2026-07-20',
    });
    // "Total-population counts are never displayed anywhere" — the response
    // has no field to put one in.
    expect(body).not.toHaveProperty('total');
    expect(Object.keys(body)).toEqual(['clans']);
  });
});

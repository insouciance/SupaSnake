/** @jest-environment node */

var mockAuth: jest.Mock;
var mockFrom: jest.Mock;
var mockRpc: jest.Mock;
var mockCapture: jest.Mock;

jest.mock('@supabase/supabase-js', () => ({
  createClient: () => ({
    auth: { getUser: (...args: unknown[]) => mockAuth(...args) },
    from: (...args: unknown[]) => mockFrom(...args),
    rpc: (...args: unknown[]) => mockRpc(...args),
  }),
}));
jest.mock('@sentry/nextjs', () => ({
  captureException: (...args: unknown[]) => mockCapture(...args),
}));

import { beforeEach, describe, expect, it } from '@jest/globals';
import { NextRequest } from 'next/server';
import { GET, POST } from './route';
import { CLAN_ECONOMY_CONFIG, DIRECTORY_ALIVE_WEEKS } from '@/lib/clan/config';

function thenableChain(result: { data: unknown; error: unknown }) {
  const chain: Record<string, unknown> = {};
  for (const method of ['select', 'eq', 'gt', 'gte', 'is', 'in', 'order', 'limit']) {
    chain[method] = () => chain;
  }
  chain.single = () => Promise.resolve(result);
  chain.maybeSingle = () => Promise.resolve(result);
  const promise = Promise.resolve(result);
  chain.then = promise.then.bind(promise);
  chain.catch = promise.catch.bind(promise);
  chain.finally = promise.finally.bind(promise);
  return chain;
}

function post(body: Record<string, unknown>, token = 'token') {
  return new NextRequest('https://supasnake.com/api/clan', {
    method: 'POST',
    headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  mockAuth = jest.fn().mockResolvedValue({ data: { user: { id: 'user-1' } }, error: null });
  mockFrom = jest.fn();
  mockRpc = jest.fn().mockResolvedValue({ data: {}, error: null });
  mockCapture = jest.fn();
});

describe('founding economy', () => {
  const confirmedFounding = (extra: Record<string, unknown> = {}) => ({
    action: 'found',
    name: 'Elite Snakes',
    confirmedFoundingDnaCost: CLAN_ECONOMY_CONFIG.foundingDnaCost,
    ...extra,
  });

  it('fails an outgoing unquoted founding request closed before the RPC', async () => {
    const response = await POST(post({ action: 'found', name: 'Elite Snakes' }));
    expect(response.status).toBe(409);
    expect(await response.json()).toMatchObject({
      code: 'founding_confirmation_required',
      economy: { foundingDnaCost: CLAN_ECONOMY_CONFIG.foundingDnaCost },
    });
    expect(mockRpc).not.toHaveBeenCalled();
  });

  it('rejects a stale or forged founding quote without mutation', async () => {
    const response = await POST(post(confirmedFounding({
      confirmedFoundingDnaCost: CLAN_ECONOMY_CONFIG.foundingDnaCost + 1,
    })));
    expect(response.status).toBe(409);
    expect(await response.json()).toMatchObject({
      code: 'founding_confirmation_required',
      economy: { foundingDnaCost: CLAN_ECONOMY_CONFIG.foundingDnaCost },
    });
    expect(mockRpc).not.toHaveBeenCalled();
  });

  it('passes the central cost to one atomic RPC and returns the settled balance', async () => {
    mockRpc.mockResolvedValue({
      data: {
        clan_id: 'clan-1', name: 'Elite Snakes', tag: 'ES',
        member_count: 1, max_members: 12, join_policy: 'open',
        invite_code: 'ABCDEFGH', founding_dna_cost: 500, dna_balance: 725,
      },
      error: null,
    });
    const response = await POST(post(confirmedFounding()));
    expect(response.status).toBe(200);
    expect(mockRpc).toHaveBeenCalledWith('found_clan', expect.objectContaining({
      p_user_id: 'user-1',
      p_name: 'Elite Snakes',
      p_founding_cost: CLAN_ECONOMY_CONFIG.foundingDnaCost,
    }));
    expect(await response.json()).toMatchObject({
      clan: { id: 'clan-1', joinPolicy: 'open' },
      economy: { foundingDnaCost: 500, dnaBalance: 725 },
    });
  });

  it('reports insufficient DNA without inventing a client balance', async () => {
    mockRpc.mockResolvedValue({
      data: { error: 'insufficient_dna', required_dna: 500, dna_balance: 100 },
      error: null,
    });
    const response = await POST(post(confirmedFounding()));
    expect(response.status).toBe(409);
    expect(await response.json()).toMatchObject({
      code: 'insufficient_dna',
      details: { required_dna: 500, dna_balance: 100 },
    });
  });

  it('rejects invalid names before any economy call', async () => {
    const response = await POST(post({ action: 'found', name: '<script>' }));
    expect(response.status).toBe(400);
    expect(mockRpc).not.toHaveBeenCalled();
  });

  it('rejects forged heraldry outside the launch presets before spending DNA', async () => {
    const response = await POST(post({
      action: 'found', name: 'Elite Snakes', bannerId: 'unreleased_paid_banner',
    }));
    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({ code: 'invalid_banner' });
    expect(mockRpc).not.toHaveBeenCalled();
  });
});

describe('recruitment policies and exact-handle invites', () => {
  it('requests open/application membership by clan id', async () => {
    await POST(post({ action: 'apply', clanId: 'clan-2' }));
    expect(mockRpc).toHaveBeenCalledWith('request_clan_membership', {
      p_user_id: 'user-1', p_clan_id: 'clan-2',
    });
  });

  it('creates a direct invitation from the exact handle only', async () => {
    await POST(post({ action: 'invite', handle: 'Strong_Player', targetUserId: 'ignored' }));
    expect(mockRpc).toHaveBeenCalledWith('create_clan_invite_by_handle', {
      p_actor_user_id: 'user-1',
      p_handle: 'Strong_Player',
      p_expires_in_seconds: CLAN_ECONOMY_CONFIG.invitationLifetimeSeconds,
    });
    expect(JSON.stringify(mockRpc.mock.calls[0][1])).not.toContain('targetUserId');
  });

  it('rejects malformed handles without a lookup', async () => {
    const response = await POST(post({ action: 'invite', handle: 'not a handle' }));
    expect(response.status).toBe(400);
    expect(mockRpc).not.toHaveBeenCalled();
  });

  it.each([
    ['approve_application', true],
    ['reject_application', false],
  ] as const)('%s uses the same audited review transition', async (action, approve) => {
    await POST(post({ action, applicationId: 'app-1' }));
    expect(mockRpc).toHaveBeenCalledWith('review_clan_application', {
      p_actor_user_id: 'user-1',
      p_application_id: 'app-1',
      p_approve: approve,
    });
  });

  it('surfaces invite-only and permission decisions from SQL', async () => {
    mockRpc.mockResolvedValue({ data: { error: 'invite_required' }, error: null });
    expect((await POST(post({ action: 'apply', clanId: 'c' }))).status).toBe(403);
    mockRpc.mockResolvedValue({ data: { error: 'not_authorized' }, error: null });
    expect((await POST(post({ action: 'invite', handle: 'Strong_Player' }))).status).toBe(403);
  });
});

describe('governance and Glory', () => {
  it('promotes/demotes only to co_leader or member', async () => {
    await POST(post({ action: 'set_role', targetUserId: 'user-2', role: 'co_leader' }));
    expect(mockRpc).toHaveBeenCalledWith('set_clan_member_role', {
      p_actor_user_id: 'user-1', p_target_user_id: 'user-2', p_role: 'co_leader',
    });
    mockRpc.mockClear();
    const response = await POST(post({ action: 'set_role', targetUserId: 'user-2', role: 'owner' }));
    expect(response.status).toBe(400);
    expect(mockRpc).not.toHaveBeenCalled();
  });

  it('updates only a valid recruitment policy', async () => {
    await POST(post({ action: 'update_settings', joinPolicy: 'application' }));
    expect(mockRpc).toHaveBeenCalledWith('update_clan_settings', {
      p_actor_user_id: 'user-1', p_join_policy: 'application',
    });
    mockRpc.mockClear();
    expect((await POST(post({ action: 'update_settings', joinPolicy: 'closed' }))).status).toBe(400);
    expect(mockRpc).not.toHaveBeenCalled();
  });

  it('derives every Glory term and cycle server-side', async () => {
    await POST(post({
      action: 'assign_glory', targetUserId: 'user-2', seat: 1,
      rewardDna: 999999, cycleIndex: 999999, rank: 1,
    }));
    const [name, args] = mockRpc.mock.calls[0] as [string, Record<string, unknown>];
    expect(name).toBe('assign_clan_glory');
    expect(args).toMatchObject({
      p_actor_user_id: 'user-1',
      p_target_user_id: 'user-2',
      p_seat: 1,
      p_reward_dna: CLAN_ECONOMY_CONFIG.glory.rewardDna,
      p_minimum_tenure_seconds: CLAN_ECONOMY_CONFIG.glory.minimumTenureSeconds,
      p_minimum_contribution_depth: CLAN_ECONOMY_CONFIG.glory.minimumContributionDepth,
    });
    expect(args).not.toHaveProperty('rewardDna');
    expect(args).not.toHaveProperty('rank');
    expect(args).not.toHaveProperty('cycleIndex');
  });

  it('rejects a third seat before SQL', async () => {
    const response = await POST(post({ action: 'assign_glory', targetUserId: 'u2', seat: 3 }));
    expect(response.status).toBe(400);
    expect(mockRpc).not.toHaveBeenCalled();
  });
});

describe('directory contract', () => {
  it('passes bounded search/filter/page inputs and returns factual fields', async () => {
    mockRpc.mockResolvedValue({
      data: [{
        id: 'c1', name: 'Elite Snakes', tag: 'ES', banner_id: null,
        emblem_id: null, color_primary: null, member_count: 4,
        max_members: 12, available_spots: 8, join_policy: 'application',
        best_week_depth: 900, recent_activity_at: '2026-07-30T12:00:00Z',
        recent_activity_kind: 'energy_battle',
      }],
      error: null,
    });
    const response = await GET(new NextRequest(
      'https://supasnake.com/api/clan?view=directory&q=Elite&policy=application&hasSpace=true&limit=500&offset=4'
    ));
    expect(response.status).toBe(200);
    expect(mockRpc).toHaveBeenCalledWith('get_competitive_clan_directory', {
      p_search: 'Elite', p_policy: 'application', p_has_space: true,
      p_limit: 100, p_offset: 4, p_alive_weeks: DIRECTORY_ALIVE_WEEKS,
    });
    expect((await response.json()).clans[0]).toMatchObject({
      memberCount: 4,
      availableSpots: 8,
      joinPolicy: 'application',
      recentActivityAt: '2026-07-30T12:00:00Z',
    });
  });

  it('rejects invalid filters before reading the directory', async () => {
    expect((await GET(new NextRequest('https://supasnake.com/api/clan?policy=closed'))).status).toBe(400);
    expect((await GET(new NextRequest('https://supasnake.com/api/clan?hasSpace=maybe'))).status).toBe(400);
    expect(mockRpc).not.toHaveBeenCalled();
  });
});

describe('authenticated membership bridge', () => {
  it('requires authentication and never accepts another player identity', async () => {
    const noAuth = await GET(new NextRequest(
      'https://supasnake.com/api/clan?playerId=user-1'
    ));
    expect(noAuth.status).toBe(401);

    const spoofed = await GET(new NextRequest(
      'https://supasnake.com/api/clan?playerId=user-2',
      { headers: { authorization: 'Bearer token' } }
    ));
    expect(spoofed.status).toBe(403);
    expect(mockFrom).not.toHaveBeenCalled();
  });

  it('returns only the authenticated player and a secret-free clan projection', async () => {
    mockFrom.mockReturnValue(thenableChain({
      data: {
        clan_id: 'clan-1', role: 'member', joined_at: '2026-07-01T00:00:00Z',
        clans: {
          id: 'clan-1', name: 'Elite Snakes', tag: 'ES', join_policy: 'open',
          invite_code: 'MUSTHIDE',
        },
      },
      error: null,
    }));
    const response = await GET(new NextRequest(
      'https://supasnake.com/api/clan?playerId=user-1',
      { headers: { authorization: 'Bearer token' } }
    ));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.clan).toMatchObject({ id: 'clan-1', name: 'Elite Snakes', tag: 'ES' });
    expect(body.clan).not.toHaveProperty('invite_code');
    expect(mockFrom).toHaveBeenCalledWith('clan_members');
  });
});

describe('failure and auth boundaries', () => {
  it('reports real Supabase failures and returns 500', async () => {
    mockRpc.mockResolvedValue({ data: null, error: { message: 'deadlock detected' } });
    const response = await POST(post({ action: 'leave' }));
    expect(response.status).toBe(500);
    expect(mockCapture).toHaveBeenCalled();
  });

  it('returns 503 for a missing forward migration', async () => {
    mockRpc.mockResolvedValue({
      data: null,
      error: { code: 'PGRST202', message: 'request_clan_membership not found' },
    });
    expect((await POST(post({ action: 'apply', clanId: 'c' }))).status).toBe(503);
  });

  it('requires a valid bearer token', async () => {
    const noToken = new NextRequest('https://supasnake.com/api/clan', {
      method: 'POST', body: JSON.stringify({ action: 'leave' }),
    });
    expect((await POST(noToken)).status).toBe(401);
    mockAuth.mockResolvedValue({ data: { user: null }, error: { message: 'bad token' } });
    expect((await POST(post({ action: 'leave' }))).status).toBe(401);
    expect(mockCapture).toHaveBeenCalled();
  });
});

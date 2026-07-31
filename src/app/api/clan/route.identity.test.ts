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
import { GET } from './route';

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

function fullRequest() {
  return new NextRequest('https://supasnake.com/api/clan?view=full', {
    headers: { authorization: 'Bearer token' },
  });
}

beforeEach(() => {
  mockAuth = jest.fn().mockResolvedValue({ data: { user: { id: 'co-1' } }, error: null });
  mockCapture = jest.fn();

  const calls = new Map<string, number>();
  mockFrom = jest.fn((table: string) => {
    const index = calls.get(table) ?? 0;
    calls.set(table, index + 1);
    const results: Record<string, Array<{ data: unknown; error: unknown }>> = {
      clan_members: [
        { data: { clan_id: 'clan-1', role: 'co_leader', joined_at: '2026-07-01T00:00:00Z' }, error: null },
        { data: [
          { player_id: 'owner-1', role: 'owner', joined_at: '2026-06-01T00:00:00Z' },
          { player_id: 'co-1', role: 'co_leader', joined_at: '2026-07-01T00:00:00Z' },
          { player_id: 'member-1', role: 'member', joined_at: '2026-07-15T00:00:00Z' },
        ], error: null },
      ],
      clan_invites: [{ data: [], error: null }],
      clan_applications: [
        { data: [], error: null },
        { data: [{ id: 'app-1', applicant_id: 'applicant-1', status: 'pending', created_at: '2026-07-30T00:00:00Z' }], error: null },
      ],
      clans: [{ data: {
        id: 'clan-1', name: 'Elite Snakes', tag: 'ES', owner_id: 'owner-1',
        member_count: 3, max_members: 12, join_policy: 'application',
        invite_code: 'ABCDEFGH', disbanded_at: null,
      }, error: null }],
      clan_membership_history: [{ data: [
        { player_id: 'co-1', joined_at: '2026-06-15T00:00:00Z' },
      ], error: null }],
      clan_glory_assignments: [{ data: [], error: null }],
      discord_clan_links: [{ data: null, error: null }],
    };
    return thenableChain(results[table]?.[index] ?? { data: [], error: null });
  });

  mockRpc = jest.fn((name: string) => {
    if (name === 'get_clan_competitive_roster') {
      return Promise.resolve({
        data: [
          { user_id: 'owner-1', best_five_depth: 900, contribution_rank: 1, eligible_results: 5, best_generation: 8, last_contributed_at: '2026-07-30T12:00:00Z' },
          { user_id: 'co-1', best_five_depth: 700, contribution_rank: 2, eligible_results: 4, best_generation: 6, last_contributed_at: '2026-07-30T11:00:00Z' },
          { user_id: 'member-1', best_five_depth: null, contribution_rank: null, eligible_results: 0, best_generation: null, last_contributed_at: null },
        ],
        error: null,
      });
    }
    if (name === 'get_player_identities') {
      return Promise.resolve({
        data: [
          { user_id: 'owner-1', display_handle: 'LeaderOne' },
          { user_id: 'co-1', display_handle: 'StrongCo' },
          { user_id: 'member-1', display_handle: 'NewMember' },
          { user_id: 'applicant-1', display_handle: 'Applicant' },
        ],
        error: null,
      });
    }
    return Promise.resolve({ data: {}, error: null });
  });
});

describe('full competitive clan view', () => {
  it('returns UI-ready role labels and the co-leader permission matrix', async () => {
    const response = await GET(fullRequest());
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.membership).toMatchObject({
      role: 'co_leader',
      roleLabel: 'Co-leader',
      permissions: {
        invite: true,
        reviewApplications: true,
        removeMembers: true,
        manageSettings: false,
        transferOwnership: false,
        assignGlory: false,
      },
      tenureSince: '2026-06-15T00:00:00Z',
    });
    expect(body.settings.joinPolicy).toBe('application');
    expect(body.applications[0]).toMatchObject({
      id: 'app-1', applicantUserId: 'applicant-1', status: 'pending',
    });
  });

  it('returns authoritative best-five ranks and distinguishes no result from zero', async () => {
    const body = await (await GET(fullRequest())).json();
    expect(body.roster[0].contribution).toMatchObject({
      hasEligibleContribution: true,
      bestFiveDepth: 900,
      rank: 1,
      eligibleResults: 5,
      bestGeneration: 8,
    });
    expect(body.roster[2].contribution).toMatchObject({
      hasEligibleContribution: false,
      bestFiveDepth: null,
      rank: null,
      eligibleResults: 0,
    });
    expect(mockRpc).toHaveBeenCalledWith('get_clan_competitive_roster', expect.objectContaining({
      p_clan_id: 'clan-1',
    }));
  });

  it('quotes founding and Glory terms for the consuming UI', async () => {
    const response = await GET(new NextRequest('https://supasnake.com/api/clan?view=config'));
    const body = await response.json();
    expect(body.competitiveConfig).toMatchObject({
      foundingDnaCost: expect.any(Number),
      policies: ['open', 'application', 'invite_only'],
      roleLabels: { owner: 'Leader', co_leader: 'Co-leader', member: 'Member' },
      glory: { maxSeats: 2, rewardDna: expect.any(Number) },
    });
  });

  it('reports a contribution RPC failure instead of fabricating empty ranks', async () => {
    mockRpc.mockImplementation((name: string) => {
      if (name === 'get_clan_competitive_roster') {
        return Promise.resolve({ data: null, error: { message: 'read failed' } });
      }
      return Promise.resolve({ data: [], error: null });
    });
    const response = await GET(fullRequest());
    expect(response.status).toBe(503);
    expect(await response.json()).toMatchObject({ error: 'Failed to load contribution ranks' });
    expect(mockCapture).toHaveBeenCalled();
  });
});

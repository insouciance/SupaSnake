/** @jest-environment node */

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

import { NextRequest } from 'next/server';
import { GET, PATCH } from './route';

const ITEM_ID = '550e8400-e29b-41d4-a716-446655440000';

function request(method: 'GET' | 'PATCH', body?: unknown, auth = true) {
  return new NextRequest('http://localhost/api/progression/attention', {
    method,
    headers: auth
      ? { authorization: 'Bearer token', 'content-type': 'application/json' }
      : { 'content-type': 'application/json' },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
}

describe('/api/progression/attention', () => {
  beforeEach(() => {
    mockAuth = jest.fn().mockResolvedValue({ data: { user: { id: 'user-1' } }, error: null });
    mockRpc = jest.fn();
    mockFrom = jest.fn((table: string) => {
      const chain: Record<string, jest.Mock> = {};
      chain.select = jest.fn(() => chain);
      chain.eq = jest.fn(() => chain);
      chain.in = jest.fn(() => chain);
      chain.or = jest.fn(() => chain);
      chain.order = jest.fn(() => chain);
      chain.range = jest.fn(async () => ({
        data:
          table === 'player_attention_items'
            ? [
                {
                  id: ITEM_ID,
                  moment_id: 'moment-1',
                  source_type: 'run',
                  source_id: 'session-1',
                  attention_kind: 'recognition',
                  status: 'unseen',
                  destination: 'mastery',
                  headline: 'PRIMAL Mastery M3',
                  detail: null,
                  artifact_ref: 'PRIMAL',
                  created_at: '2026-07-30T12:00:00Z',
                  seen_at: null,
                  resolved_at: null,
                },
              ]
            : null,
        error: null,
      }));
      chain.maybeSingle = jest.fn(async () => ({
        data: table === 'players' ? { id: 'player-1' } : null,
        error: null,
      }));
      return chain;
    });
  });

  it('requires authentication', async () => {
    const response = await GET(request('GET', undefined, false));
    expect(response.status).toBe(401);
    expect(response.headers.get('cache-control')).toBe('private, no-store');
  });

  it('lists server-owned unresolved attention', async () => {
    const response = await GET(request('GET'));
    expect(response.status).toBe(200);
    expect(response.headers.get('cache-control')).toBe('private, no-store');
    expect(await response.json()).toEqual({
      items: [
        expect.objectContaining({
          id: ITEM_ID,
          kind: 'recognition',
          status: 'unseen',
          source: { type: 'run', id: 'session-1' },
          artifactRef: 'PRIMAL',
        }),
      ],
      nextOffset: null,
    });
    const attentionChain = mockFrom.mock.results
      .map((result) => result.value as Record<string, jest.Mock>)
      .find((chain) => chain.or?.mock.calls.length > 0);
    expect(attentionChain?.or).toHaveBeenCalledWith(
      'status.eq.unseen,and(attention_kind.eq.action,status.eq.seen)'
    );
    expect(attentionChain?.order).toHaveBeenNthCalledWith(1, 'status', {
      ascending: false,
    });
    expect(attentionChain?.range).toHaveBeenCalledWith(0, 99);
  });

  it('rejects an invalid pagination offset', async () => {
    const response = await GET(new NextRequest(
      'http://localhost/api/progression/attention?offset=-1',
      { headers: { authorization: 'Bearer token' } }
    ));
    expect(response.status).toBe(400);
  });

  it('transitions one owned item through the SQL state machine', async () => {
    mockRpc.mockResolvedValue({
      data: { id: ITEM_ID, kind: 'recognition', status: 'seen' },
      error: null,
    });
    const response = await PATCH(
      request('PATCH', { id: ITEM_ID, transition: 'seen' })
    );
    expect(response.status).toBe(200);
    expect(mockRpc).toHaveBeenCalledWith('transition_player_attention', {
      p_player_id: 'player-1',
      p_item_id: ITEM_ID,
      p_transition: 'seen',
    });
  });

  it('maps forbidden recognition resolution to a conflict', async () => {
    mockRpc.mockResolvedValue({
      data: null,
      error: { message: 'INVALID_ATTENTION_TRANSITION' },
    });
    expect(
      (await PATCH(request('PATCH', { id: ITEM_ID, transition: 'resolved' }))).status
    ).toBe(409);
  });
});

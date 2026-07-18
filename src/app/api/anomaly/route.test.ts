/**
 * @jest-environment node
 */

/**
 * Anomaly board API tests - RPC-shaped, Supabase mocked. GET returns the
 * deterministic rotation header always, the RPC board when live, and a
 * clean { live: false } during the pre-migration-021 window.
 */

// Mock Supabase - must be before imports due to jest.mock hoisting

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

import { GET } from './route';
import { NextRequest } from 'next/server';
import { ANOMALIES, anomalyForWeek } from '@/shared/game/anomalies';

const PLAYER_ID = 'player-1';

beforeEach(() => {
  mockAuth = jest.fn();
  mockFrom = jest.fn();
  mockRpc = jest.fn();
});

function authedUser() {
  mockAuth.mockResolvedValue({ data: { user: { id: 'user-1' } }, error: null });
  mockFrom.mockImplementation(() => ({
    select: () => ({
      eq: () => ({
        single: async () => ({ data: { id: PLAYER_ID }, error: null }),
      }),
    }),
  }));
}

function getRequest(token = 'valid-token') {
  return new NextRequest('http://localhost:3000/api/anomaly', {
    headers: token ? { authorization: `Bearer ${token}` } : {},
  });
}

describe('GET /api/anomaly', () => {
  it('401 without a token', async () => {
    const response = await GET(new NextRequest('http://localhost:3000/api/anomaly'));
    expect(response.status).toBe(401);
  });

  it('returns the live board with the deterministic rotation header', async () => {
    authedUser();
    mockRpc.mockResolvedValue({
      data: {
        anomaly_id: anomalyForWeek(new Date()),
        top: [{ rank: 1, name: 'Viper', score: 4200 }],
        my: { best: 900, rank: 7, runs: 3 },
      },
      error: null,
    });

    const response = await GET(getRequest());
    expect(response.status).toBe(200);
    const body = await response.json();

    expect(body.live).toBe(true);
    const expected = anomalyForWeek(new Date());
    expect(body.anomaly.id).toBe(expected);
    expect(body.anomaly.name).toBe(ANOMALIES[expected].name);
    expect(body.anomaly.effect).toBe(ANOMALIES[expected].effect);
    expect(new Date(body.anomaly.endsAt).getTime()).toBeGreaterThan(Date.now());
    expect(body.top).toEqual([{ rank: 1, name: 'Viper', score: 4200 }]);
    expect(body.my).toEqual({ best: 900, rank: 7, runs: 3 });
    expect(mockRpc).toHaveBeenCalledWith('get_anomaly_board', {
      p_player_id: PLAYER_ID,
    });
  });

  it('PRE-021: a missing RPC reads as { live: false } with the rotation intact', async () => {
    authedUser();
    mockRpc.mockResolvedValue({
      data: null,
      error: { code: 'PGRST202', message: 'function get_anomaly_board(uuid) does not exist' },
    });

    const response = await GET(getRequest());
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.live).toBe(false);
    expect(body.anomaly.id).toBe(anomalyForWeek(new Date()));
    expect(body.top).toEqual([]);
    expect(body.my).toBeNull();
  });

  it('unexpected RPC errors surface as 500 (never silently not-live)', async () => {
    authedUser();
    mockRpc.mockResolvedValue({
      data: null,
      error: { code: 'XX000', message: 'unexpected' },
    });

    const response = await GET(getRequest());
    expect(response.status).toBe(500);
  });
});

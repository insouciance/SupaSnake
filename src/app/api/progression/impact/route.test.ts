/** @jest-environment node */

var mockAuth: jest.Mock;
var mockFrom: jest.Mock;

jest.mock('@supabase/supabase-js', () => ({
  createClient: () => ({
    auth: { getUser: (...args: unknown[]) => mockAuth(...args) },
    from: (...args: unknown[]) => mockFrom(...args),
  }),
}));
jest.mock('@sentry/nextjs', () => ({ captureException: jest.fn() }));

import { NextRequest } from 'next/server';
import { GET } from './route';

const SESSION_ID = '550e8400-e29b-41d4-a716-446655440000';
const impact = {
  version: 1,
  sessionId: SESSION_ID,
  settledAt: '2026-07-30T12:00:00.000Z',
  outcome: 'extracted',
  dynasty: 'PRIMAL',
  receipt: {
    validated: true,
    score: 1,
    yieldDna: 2,
    dnaCredited: 2,
    energyCommitted: 1,
    commitmentMultiplierBps: 10000,
    generation: 1,
    personalBest: { eligible: true, before: 0, after: 1, improved: true },
  },
  impacts: [],
  featuredImpactKeys: [],
  recommendedAction: null,
};

function request(sessionId = SESSION_ID, auth = true) {
  return new NextRequest(`http://localhost/api/progression/impact?sessionId=${sessionId}`, {
    headers: auth ? { authorization: 'Bearer token' } : {},
  });
}

describe('GET /api/progression/impact', () => {
  beforeEach(() => {
    mockAuth = jest.fn().mockResolvedValue({ data: { user: { id: 'user-1' } }, error: null });
    mockFrom = jest.fn((table: string) => {
      const result = table === 'players' ? { id: 'player-1' } : { envelope: impact };
      const chain: Record<string, jest.Mock> = {};
      chain.select = jest.fn(() => chain);
      chain.eq = jest.fn(() => chain);
      chain.maybeSingle = jest.fn(async () => ({ data: result, error: null }));
      return chain;
    });
  });

  it('requires authentication and a valid session id', async () => {
    const unauthorized = await GET(request(SESSION_ID, false));
    expect(unauthorized.status).toBe(401);
    expect(unauthorized.headers.get('cache-control')).toBe('private, no-store');
    expect((await GET(request('bad'))).status).toBe(400);
  });

  it('returns only the authenticated player canonical receipt', async () => {
    const response = await GET(request());
    expect(response.status).toBe(200);
    expect(response.headers.get('cache-control')).toBe('private, no-store');
    expect(await response.json()).toEqual({ impact });
    expect(mockFrom).toHaveBeenCalledWith('run_impact_receipts');
  });

  it('returns 404 when no canonical receipt exists', async () => {
    mockFrom.mockImplementation((table: string) => {
      const chain: Record<string, jest.Mock> = {};
      chain.select = jest.fn(() => chain);
      chain.eq = jest.fn(() => chain);
      chain.maybeSingle = jest.fn(async () => ({
        data: table === 'players' ? { id: 'player-1' } : null,
        error: null,
      }));
      return chain;
    });
    expect((await GET(request())).status).toBe(404);
  });

  it('returns a retryable 503 when the receipt read fails', async () => {
    mockFrom.mockImplementation((table: string) => {
      const chain: Record<string, jest.Mock> = {};
      chain.select = jest.fn(() => chain);
      chain.eq = jest.fn(() => chain);
      chain.maybeSingle = jest.fn(async () =>
        table === 'players'
          ? { data: { id: 'player-1' }, error: null }
          : { data: null, error: { code: '08006', message: 'connection failure' } }
      );
      return chain;
    });
    const response = await GET(request());
    expect(response.status).toBe(503);
    expect(response.headers.get('cache-control')).toBe('private, no-store');
    expect(await response.json()).toEqual({
      error: 'Impact receipt is temporarily unavailable',
      retryable: true,
    });
  });
});

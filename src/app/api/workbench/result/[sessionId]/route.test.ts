/** @jest-environment node */

var mockAuth: jest.Mock;
var mockFrom: jest.Mock;
var sessionEqCalls: Array<[string, unknown]>;

jest.mock('@supabase/supabase-js', () => ({
  createClient: () => ({
    auth: { getUser: (...args: unknown[]) => mockAuth(...args) },
    from: (...args: unknown[]) => mockFrom(...args),
  }),
}));
jest.mock('@sentry/nextjs', () => ({ captureException: jest.fn() }));

import { NextRequest } from 'next/server';
import { createGenomeV2State, genomeV2RunRecord, settleGenomeV2 } from '@/shared/game/genomeV2';
import { GET } from './route';

const SESSION_ID = '123e4567-e89b-42d3-a456-426614174000';

function completedGenome() {
  const state = createGenomeV2State('CYBER');
  return genomeV2RunRecord(state, settleGenomeV2(state, 'bank'));
}

function request() {
  return new NextRequest(`http://localhost/api/workbench/result/${SESSION_ID}`, {
    headers: { authorization: 'Bearer token' },
  });
}

function context(sessionId = SESSION_ID) {
  return { params: Promise.resolve({ sessionId }) };
}

const DEFAULT_RUN: Record<string, unknown> = {
  id: SESSION_ID,
  player_id: 'player-1',
  ended_at: '2026-08-02T00:00:00Z',
  validated: true,
  genome: completedGenome(),
};

function database(options: {
  run?: Record<string, unknown> | null;
  playerError?: Record<string, unknown> | null;
  runError?: Record<string, unknown> | null;
} = {}) {
  const run = Object.prototype.hasOwnProperty.call(options, 'run')
    ? options.run ?? null
    : DEFAULT_RUN;
  mockAuth.mockResolvedValue({ data: { user: { id: 'user-1' } }, error: null });
  mockFrom.mockImplementation((table: string) => {
    if (table === 'players') {
      return {
        select: () => ({
          eq: () => ({
            maybeSingle: async () => ({
              data: options.playerError ? null : { id: 'player-1' },
              error: options.playerError ?? null,
            }),
          }),
        }),
      };
    }
    if (table === 'game_sessions') {
      const query = {
        eq: (column: string, value: unknown) => {
          sessionEqCalls.push([column, value]);
          return query;
        },
        maybeSingle: async () => ({
          data: options.runError ? null : run,
          error: options.runError ?? null,
        }),
      };
      return { select: () => query };
    }
    throw new Error(`Unexpected table ${table}`);
  });
}

describe('GET /api/workbench/result/[sessionId]', () => {
  beforeEach(() => {
    process.env.NEXT_PUBLIC_GENOME_V2 = 'true';
    mockAuth = jest.fn();
    mockFrom = jest.fn();
    sessionEqCalls = [];
  });

  afterAll(() => {
    delete process.env.NEXT_PUBLIC_GENOME_V2;
  });

  it('returns only the authenticated player’s completed authoritative Genome', async () => {
    database();
    const response = await GET(request(), context());
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(response.headers.get('cache-control')).toContain('no-store');
    expect(body.sessionId).toBe(SESSION_ID);
    expect(body.genome).toMatchObject({ v: 2, dynasty: 'CYBER' });
    expect(body).not.toHaveProperty('player_id');
    expect(sessionEqCalls).toEqual([
      ['id', SESSION_ID],
      ['player_id', 'player-1'],
    ]);
  });

  it('requires a present and valid bearer identity', async () => {
    const missing = await GET(
      new NextRequest(`http://localhost/api/workbench/result/${SESSION_ID}`),
      context()
    );
    expect(missing.status).toBe(401);

    database();
    mockAuth.mockResolvedValue({ data: { user: null }, error: { message: 'expired' } });
    const invalid = await GET(request(), context());
    expect(invalid.status).toBe(401);
    expect(mockFrom).not.toHaveBeenCalled();
  });

  it('does not expose the surface while the rollout flag is off', async () => {
    process.env.NEXT_PUBLIC_GENOME_V2 = 'false';
    const response = await GET(request(), context());
    expect(response.status).toBe(404);
    expect(mockAuth).not.toHaveBeenCalled();
  });

  it('rejects invalid opaque identifiers before any database read', async () => {
    database();
    const response = await GET(request(), context('raw-genome-json'));
    expect(response.status).toBe(400);
    expect(mockFrom).not.toHaveBeenCalled();
  });

  it('does not reveal another player’s or absent run', async () => {
    database({ run: null });
    const response = await GET(request(), context());
    expect(response.status).toBe(404);
  });

  it('refuses unsettled and malformed records', async () => {
    database({ run: {
      id: SESSION_ID,
      player_id: 'player-1',
      ended_at: null,
      validated: true,
      genome: completedGenome(),
    } });
    expect((await GET(request(), context())).status).toBe(409);

    database({ run: {
      id: SESSION_ID,
      player_id: 'player-1',
      ended_at: '2026-08-02T00:00:00Z',
      validated: true,
      genome: { v: 2, terminalClaim: 'client-owned' },
    } });
    expect((await GET(request(), context())).status).toBe(422);
  });

  it('reports player and session database errors without returning a record', async () => {
    const consoleSpy = jest.spyOn(console, 'error').mockImplementation(() => undefined);
    database({ playerError: { code: 'XX001', message: 'player read failed' } });
    expect((await GET(request(), context())).status).toBe(503);

    database({ runError: { code: 'XX002', message: 'run read failed' } });
    expect((await GET(request(), context())).status).toBe(503);
    consoleSpy.mockRestore();
  });
});

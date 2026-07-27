/**
 * @jest-environment node
 *
 * GET /api/workbench/panel — the facts a plan is computed from (WP-2.08).
 *
 * The route computes nothing, and that is the property worth asserting: every
 * projection, tier and offer share is derived in the browser by
 * `@/shared/game/workbench`, which is what lets the parity suite check the
 * calculator against the ENGINE rather than against a second server
 * implementation. So these tests assert the contract's shape, that a read
 * failure is refused rather than absorbed into a wrong number, and — the one
 * that matters most on a planning surface — that nothing here mutates.
 */

const mockCaptureException = jest.fn();
const mockGetUser = jest.fn();
const mockFrom = jest.fn();
const mockRpc = jest.fn();

jest.mock('@sentry/nextjs', () => ({
  captureException: (...args: unknown[]) => mockCaptureException(...args),
}));

jest.mock('@supabase/supabase-js', () => ({
  createClient: () => ({
    auth: { getUser: (...args: unknown[]) => mockGetUser(...args) },
    from: (table: string) => mockFrom(table),
    rpc: (fn: string, params: unknown) => mockRpc(fn, params),
  }),
}));

import * as fs from 'fs';
import * as path from 'path';
import { NextRequest } from 'next/server';
import { GET } from './route';

function request(authorization?: string) {
  const headers: Record<string, string> = {};
  if (authorization) headers.authorization = authorization;
  return new NextRequest('http://localhost/api/workbench/panel', { headers });
}

type TableFixture = { rows?: unknown[]; error?: unknown; count?: number };

function tables(fixtures: Record<string, TableFixture>) {
  mockFrom.mockImplementation((table: string) => {
    const fixture = fixtures[table] ?? { rows: [] };
    const data = fixture.rows ?? [];
    const error = fixture.error ?? null;
    const chain: Record<string, unknown> = {};
    for (const op of ['eq', 'in', 'is', 'not', 'gt', 'lte', 'neq', 'or', 'order', 'limit']) {
      chain[op] = () => chain;
    }
    chain.select = () => {
      const promise = Promise.resolve({
        data: error ? null : data,
        error,
        count: fixture.count ?? data.length,
      });
      return Object.assign(chain, {
        then: promise.then.bind(promise),
        catch: promise.catch.bind(promise),
        finally: promise.finally.bind(promise),
      });
    };
    chain.maybeSingle = () =>
      Promise.resolve({ data: error ? null : (data[0] ?? null), error });
    chain.single = chain.maybeSingle;
    return chain;
  });
}

const SNAKE_ROW = {
  id: 's1',
  generation: 4,
  traits: [],
  lineage: { strains: ['AURUM'], strength: 1 },
  is_equipped: true,
  snake_variants: { id: 'v1', name: 'CYBER SPARK', dynasties: { name: 'CYBER' } },
};

function healthy(over: Record<string, TableFixture> = {}) {
  tables({
    players: { rows: [{ id: 'p1' }] },
    collected_snakes: { rows: [SNAKE_ROW], count: 1 },
    game_sessions: { rows: [], count: 7 },
    economy_transactions: {
      rows: [
        { metadata: { food_count: 40 }, created_at: '2026-07-20' },
        { metadata: { food_count: 90 }, created_at: '2026-07-19' },
        { metadata: {}, created_at: '2026-07-18' },
      ],
    },
    player_mastery: { rows: [{ xp: 5000 }] },
    season_genes: { rows: [] },
    ...over,
  });
}

beforeEach(() => {
  jest.clearAllMocks();
  mockGetUser.mockResolvedValue({ data: { user: { id: 'u1' } }, error: null });
  mockRpc.mockResolvedValue({ data: null, error: null });
  healthy();
});

describe('authentication', () => {
  it('401s without a bearer', async () => {
    const response = await GET(request());
    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({ error: 'Unauthorized' });
  });

  it('401s on an invalid token', async () => {
    mockGetUser.mockResolvedValue({ data: { user: null }, error: { message: 'bad' } });
    expect((await GET(request('Bearer nope'))).status).toBe(401);
  });

  it('404s when the user has no player row', async () => {
    healthy({ players: { rows: [] } });
    expect((await GET(request('Bearer ok'))).status).toBe(404);
  });
});

describe('the payload', () => {
  it('returns the inventory, the account dials and the contexts', async () => {
    const response = await GET(request('Bearer ok'));
    expect(response.status).toBe(200);
    const body = await response.json();

    expect(body.live).toBe(true);
    expect(body.snakes).toHaveLength(1);
    expect(body.snakes[0]).toMatchObject({
      id: 's1',
      name: 'CYBER SPARK',
      dynasty: 'CYBER',
      generation: 4,
    });
    expect(body.account).toMatchObject({ bankedRuns: 7, ownedVariants: 0 });
    expect(Array.isArray(body.account.runFoods)).toBe(true);
    // The three contexts a plan can be made against.
    expect(body.contexts.map((entry: { id: string }) => entry.id)).toEqual([
      'week',
      'signal',
      'neutral',
    ]);
  });

  it('reads run length from the audited reward metadata, skipping rows without it', async () => {
    const body = await (await GET(request('Bearer ok'))).json();
    // Three transactions, one with no food_count — refused rather than
    // counted as a zero-length run, which would drag the median down.
    expect(body.account.runFoods).toEqual([40, 90]);
  });

  it('drops a snake whose variant join carries no dynasty rather than guessing one', async () => {
    healthy({
      collected_snakes: {
        rows: [SNAKE_ROW, { id: 's2', generation: 1, snake_variants: null }],
      },
    });
    const body = await (await GET(request('Bearer ok'))).json();
    expect(body.snakes.map((snake: { id: string }) => snake.id)).toEqual(['s1']);
  });
});

describe('Rule 11 — every Supabase error is checked AND reported', () => {
  it('refuses rather than planning against an unreadable collection', async () => {
    healthy({ collected_snakes: { error: { message: 'boom' } } });
    const response = await GET(request('Bearer ok'));
    expect(response.status).toBe(503);
    expect(mockCaptureException).toHaveBeenCalled();
  });

  it('refuses rather than projecting against an unreadable run history', async () => {
    healthy({ economy_transactions: { error: { message: 'boom' } } });
    const response = await GET(request('Bearer ok'));
    expect(response.status).toBe(503);
    expect(mockCaptureException).toHaveBeenCalled();
  });

  it('refuses rather than deriving a gene pool from an unreadable mastery', async () => {
    healthy({ player_mastery: { error: { message: 'boom' } } });
    const response = await GET(request('Bearer ok'));
    expect(response.status).toBe(503);
    expect(mockCaptureException).toHaveBeenCalled();
  });
});

describe('a planning surface mutates nothing (Rule 11)', () => {
  it('the source contains no write of any kind', () => {
    const source = fs.readFileSync(path.join(__dirname, 'route.ts'), 'utf8');
    expect(source).not.toMatch(/\.insert\(/);
    expect(source).not.toMatch(/\.update\(/);
    expect(source).not.toMatch(/\.upsert\(/);
    expect(source).not.toMatch(/\.delete\(/);
    // And it exports only a read.
    expect(source).not.toMatch(/export async function (POST|PATCH|PUT|DELETE)/);
  });

  it('projects no Score and no Yield — it returns facts, not conclusions', () => {
    const source = fs.readFileSync(path.join(__dirname, 'route.ts'), 'utf8');
    expect(source).not.toMatch(/computeGenomeRunTotals|applyGenomeOutcome/);
    expect(source).not.toMatch(/FOOD_BASE_SCORE|scoreMultiplier/);
  });
});

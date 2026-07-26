/**
 * @jest-environment node
 *
 * GET /api/signal/ascension with the flag DOWN — the tested rollback path.
 *
 * The project rule is that a rollback path is exercised rather than inferred
 * from an omitted flag, so this file mocks `ASCENSION_V1_ENABLED` false and
 * asserts the three things that make the rollback safe:
 *
 *   1. It is still a 200. A 404 would turn "Ascension is off" into an error
 *      the client has to special-case, and a client that special-cases an
 *      error eventually special-cases it wrongly. Off and on publish the same
 *      shape; only `live` differs.
 *   2. Nothing is read. With the flag down the route touches `players` to
 *      resolve the caller and stops — no month query is issued at all, so
 *      turning Ascension off cannot cost a database round trip on a page that
 *      is not showing it.
 *   3. Nothing is written, offered or claimable — same as flag on, because
 *      Ascension never writes in either state (§12.2, §7.2).
 *
 * Auth still applies with the flag down. An off feature is not an open one.
 */

const mockCaptureException = jest.fn();
const mockGetUser = jest.fn();
const mockFrom = jest.fn();

jest.mock('@sentry/nextjs', () => ({
  captureException: (...args: unknown[]) => mockCaptureException(...args),
}));

jest.mock('@supabase/supabase-js', () => ({
  createClient: () => ({
    auth: { getUser: (...args: unknown[]) => mockGetUser(...args) },
    from: (table: string) => mockFrom(table),
  }),
}));

jest.mock('@/lib/ascension/config', () => ({ ASCENSION_V1_ENABLED: false }));

import { NextRequest } from 'next/server';
import { GET } from './route';

function request(month?: string, authorization = 'Bearer token') {
  const url = month
    ? `http://localhost/api/signal/ascension?month=${month}`
    : 'http://localhost/api/signal/ascension';
  const headers: Record<string, string> = {};
  if (authorization) headers.authorization = authorization;
  return new NextRequest(url, { headers });
}

beforeEach(() => {
  jest.clearAllMocks();
  mockGetUser.mockResolvedValue({ data: { user: { id: 'u1' } }, error: null });
  mockFrom.mockImplementation(() => {
    const chain: Record<string, unknown> = {};
    for (const op of ['eq', 'in', 'gte', 'lte', 'order', 'limit']) {
      chain[op] = () => chain;
    }
    chain.select = () => chain;
    chain.maybeSingle = () => Promise.resolve({ data: { id: 'p1' }, error: null });
    return chain;
  });
});

describe('GET /api/signal/ascension (flag off)', () => {
  it('answers 200 with a not-live month — never a 404', async () => {
    const response = await GET(request('2026-08'));

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.live).toBe(false);
    expect(Object.keys(body).sort()).toEqual(['currentMonth', 'live', 'reading']);
    // The reading is present and zeroed rather than null, so the surface has
    // the same shape to render in both states.
    expect(body.reading.month).toBe('2026-08');
    expect(body.reading.points).toBe(0);
    expect(body.reading.signalsScored).toBe(0);
    expect(body.reading.days).toEqual([]);
  });

  it('queries no month at all', async () => {
    await GET(request('2026-08'));

    const tables = mockFrom.mock.calls.map((call) => String(call[0]));
    expect(tables).toEqual(['players']);
    expect(tables).not.toContain('signal_objective_runs');
    expect(tables).not.toContain('game_sessions');
    expect(mockCaptureException).not.toHaveBeenCalled();
  });

  it('still requires a bearer — off is not open', async () => {
    const response = await GET(request('2026-08', ''));
    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({ error: 'Unauthorized' });
  });

  it('carries no currency, claim or commercial field while off either', async () => {
    const body = await (await GET(request('2026-08'))).json();
    const json = JSON.stringify(body).toLowerCase();
    for (const banned of ['dna', 'claim', 'collect', 'reward', 'payout', 'price', 'premium']) {
      expect(json).not.toContain(banned);
    }
  });
});

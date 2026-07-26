/**
 * @jest-environment node
 *
 * GET /api/signal/ascension — the published contract (Constitution §6.1, §12.2).
 *
 * The executable half of the route's contract, and the place §12.2's caps are
 * checked against a real payload rather than a doc comment: no currency, no
 * claim, no commercial field, and no number that can decrease.
 *
 * It also pins the route's SHAPE. A recent defect had a route file exporting
 * something other than an HTTP handler and taking the production build down
 * with it, so the module's exports are asserted here directly.
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

jest.mock('@/lib/ascension/config', () => ({ ASCENSION_V1_ENABLED: true }));

import { NextRequest } from 'next/server';
import * as route from './route';
import { GET } from './route';

function request(month?: string, authorization = 'Bearer token') {
  const url = month
    ? `http://localhost/api/signal/ascension?month=${month}`
    : 'http://localhost/api/signal/ascension';
  const headers: Record<string, string> = {};
  if (authorization) headers.authorization = authorization;
  return new NextRequest(url, { headers });
}

function tableRows(rows: Record<string, unknown[]>, errors: Record<string, unknown> = {}) {
  mockFrom.mockImplementation((table: string) => {
    const data = rows[table] ?? [];
    const error = errors[table] ?? null;
    const chain: Record<string, unknown> = {};
    for (const op of ['eq', 'in', 'is', 'not', 'gt', 'gte', 'lte', 'neq', 'or', 'order', 'limit']) {
      chain[op] = () => chain;
    }
    chain.select = () => {
      const promise = Promise.resolve({ data, error });
      return Object.assign(chain, {
        then: promise.then.bind(promise),
        catch: promise.catch.bind(promise),
        finally: promise.finally.bind(promise),
      });
    };
    chain.maybeSingle = () => Promise.resolve({ data: data[0] ?? null, error });
    chain.single = chain.maybeSingle;
    return chain;
  });
}

beforeEach(() => {
  jest.clearAllMocks();
  mockGetUser.mockResolvedValue({ data: { user: { id: 'u1' } }, error: null });
  tableRows({ players: [{ id: 'p1' }] });
});

describe('the module is a route file and nothing else', () => {
  it('exports HTTP handlers only', () => {
    expect(typeof route.GET).toBe('function');
    // No POST, PUT, PATCH or DELETE: a month cannot be written, claimed or
    // collected (§7.2, §12.2). The absence is the contract.
    expect(Object.keys(route)).toEqual(['GET']);
  });
});

describe('authentication', () => {
  it('401s without a bearer', async () => {
    const response = await GET(request('2026-08', ''));
    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({ error: 'Unauthorized' });
  });

  it('401s on an invalid token', async () => {
    mockGetUser.mockResolvedValue({
      data: { user: null },
      error: { message: 'bad token' },
    });
    const response = await GET(request('2026-08'));
    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({ error: 'Invalid token' });
  });

  it('404s when the account has no player row', async () => {
    tableRows({ players: [] });
    const response = await GET(request('2026-08'));
    expect(response.status).toBe(404);
    expect(await response.json()).toEqual({ error: 'Player not found' });
  });

  it('reports a player-lookup failure to Sentry and answers a not-live month (Rule 11)', async () => {
    tableRows({ players: [] }, { players: { code: '08006', message: 'connection reset' } });
    const response = await GET(request('2026-08'));
    expect(response.status).toBe(200);
    expect(mockCaptureException).toHaveBeenCalledTimes(1);
    const body = await response.json();
    expect(body.live).toBe(false);
    expect(body.reading.month).toBe('2026-08');
  });
});

describe('the month parameter', () => {
  it('defaults to the month running now', async () => {
    const response = await GET(request());
    const body = await response.json();
    expect(body.reading.month).toBe(body.currentMonth);
    expect(body.currentMonth).toMatch(/^\d{4}-\d{2}$/);
  });

  it('answers a null reading — never a fabricated month — for a non-month', async () => {
    const response = await GET(request('banana'));
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.reading).toBeNull();
    expect(body.live).toBe(false);
  });

  it('reads a real past month', async () => {
    const response = await GET(request('2026-01'));
    const body = await response.json();
    expect(body.reading.month).toBe('2026-01');
    expect(body.reading.label).toBe('January 2026');
    expect(body.reading.daysInMonth).toBe(31);
  });
});

/** A `game_sessions` row Score's own eligibility predicate accepts. */
function rankable(id: string, score: number, startedAt: string) {
  return {
    id,
    player_id: 'p1',
    score,
    dynasty: 'CYBER',
    started_at: startedAt,
    ended_at: startedAt,
    validated: true,
    is_free_play: false,
    anomaly_id: null,
    end_reason: 'completed',
  };
}

describe('the flag on — a month folded from real rows', () => {
  // The `signal_days` embed comes back as an object from PostgREST and as a
  // one-element array from some driver versions. Both are fed in here, because
  // the route is what a browser actually talks to and neither shape is a
  // hypothetical.
  const ATTEMPTS = [
    { session_id: 's1', signal_days: { day: '2026-08-04' } },
    { session_id: 's2', signal_days: [{ day: '2026-08-05' }] },
  ];
  const SESSIONS = [
    rankable('s1', 900, '2026-08-04T12:00:00.000Z'),
    rankable('s2', 640, '2026-08-05T12:00:00.000Z'),
  ];

  it('answers live with the month summed from the player Signals', async () => {
    tableRows({
      players: [{ id: 'p1' }],
      signal_objective_runs: ATTEMPTS,
      game_sessions: SESSIONS,
    });

    const response = await GET(request('2026-08'));
    expect(response.status).toBe(200);
    const body = await response.json();

    expect(body.live).toBe(true);
    expect(body.reading.month).toBe('2026-08');
    expect(body.reading.signalsScored).toBe(2);
    expect(body.reading.counted).toEqual([900, 640]);
    expect(body.reading.points).toBe(1_540);
    expect(body.reading.best).toBe(900);
    // Eight of the ten counting places are open. Never "23 days unplayed":
    // the payload has no field for a day nobody played (Rule 5).
    expect(body.reading.openPlaces).toBe(8);
    expect(body.reading.days).toHaveLength(2);
    expect(mockCaptureException).not.toHaveBeenCalled();
  });

  it('refuses a run Score itself refuses, rather than ranking it', async () => {
    tableRows({
      players: [{ id: 'p1' }],
      signal_objective_runs: ATTEMPTS,
      game_sessions: [
        SESSIONS[0],
        { ...rankable('s2', 5_000, '2026-08-05T12:00:00.000Z'), is_free_play: true },
      ],
    });

    const body = await (await GET(request('2026-08'))).json();
    // The free-play run is absent, not zeroed: 900 alone, one Signal scored.
    expect(body.reading.signalsScored).toBe(1);
    expect(body.reading.points).toBe(900);
  });

  it('reports a month-read failure to Sentry and answers a not-live month (Rule 11)', async () => {
    tableRows(
      { players: [{ id: 'p1' }] },
      { signal_objective_runs: { code: '08006', message: 'connection reset' } }
    );

    const response = await GET(request('2026-08'));
    expect(response.status).toBe(200);
    expect(mockCaptureException).toHaveBeenCalledTimes(1);
    const body = await response.json();
    // A failed readback shows no month. It never invents one, and it never
    // turns a transient database fault into a month that reads as empty-live.
    expect(body.live).toBe(false);
    expect(body.reading.month).toBe('2026-08');
    expect(body.reading.points).toBe(0);
  });
});

describe('§12.2 — what the payload may never carry', () => {
  it('has no currency, claim, threshold-reward or commercial field', async () => {
    const response = await GET(request('2026-08'));
    const body = await response.json();
    const json = JSON.stringify(body).toLowerCase();

    for (const banned of [
      'dna',
      'currency',
      'balance',
      'claim',
      'collect',
      'grant',
      'reward',
      'payout',
      'bonus',
      'price',
      'premium',
      'entitle',
      'checkout',
      'stripe',
      'offer',
      'streak',
    ]) {
      expect(json).not.toContain(banned);
    }
  });

  it('publishes exactly the documented top-level keys', async () => {
    const response = await GET(request('2026-08'));
    const body = await response.json();
    expect(Object.keys(body).sort()).toEqual(['currentMonth', 'live', 'reading']);
  });

  it('publishes a reading whose every number is a score, a count or a date', async () => {
    const response = await GET(request('2026-08'));
    const body = await response.json();
    expect(Object.keys(body.reading).sort()).toEqual(
      [
        'best',
        'concluded',
        'counted',
        'daysInMonth',
        'days',
        'endsAt',
        'label',
        'month',
        'nextTier',
        'openPlaces',
        'points',
        'scoringDaysAhead',
        'signalsScored',
        'startsAt',
        'tier',
        'toNextTier',
      ].sort()
    );
    // Nothing in the reading names absence.
    for (const key of Object.keys(body.reading)) {
      expect(key).not.toMatch(/miss|lost|gap|break|streak|debt|penalt/i);
    }
  });
});

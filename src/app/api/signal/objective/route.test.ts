/**
 * @jest-environment node
 *
 * POST /api/signal/objective — taking the day's Signal (Constitution §7.2).
 *
 * The load-bearing property: a client CHOOSES among the day's three, it never
 * DEFINES one. These tests pin the refusal of an objective the server-derived
 * day does not contain, the flag-off path, and the fact that taking the Signal
 * a second time earns nothing.
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

import { NextRequest } from 'next/server';
import { describeSignalDay } from '@/shared/game/signal';

type RouteModule = typeof import('./route');

function loadRoute(enabled: boolean): RouteModule {
  if (enabled) {
    process.env.NEXT_PUBLIC_SIGNAL_V1 = 'true';
  } else {
    delete process.env.NEXT_PUBLIC_SIGNAL_V1;
  }
  let mod!: RouteModule;
  jest.isolateModules(() => {
    mod = require('./route') as RouteModule;
  });
  return mod;
}

function request(body: unknown, authorization = 'Bearer good') {
  const headers: Record<string, string> = { 'content-type': 'application/json' };
  if (authorization) headers.authorization = authorization;
  return new NextRequest('http://localhost/api/signal/objective', {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
  });
}

function tableRows(rows: Record<string, unknown[]>) {
  mockFrom.mockImplementation((table: string) => {
    const data = rows[table] ?? [];
    const chain: Record<string, unknown> = {};
    for (const op of ['eq', 'in', 'is', 'not', 'gt', 'gte', 'lte', 'neq', 'or', 'order', 'limit']) {
      chain[op] = () => chain;
    }
    chain.select = () => {
      const promise = Promise.resolve({ data, error: null });
      return Object.assign(chain, {
        then: promise.then.bind(promise),
        catch: promise.catch.bind(promise),
        finally: promise.finally.bind(promise),
      });
    };
    chain.maybeSingle = () => Promise.resolve({ data: data[0] ?? null, error: null });
    chain.single = chain.maybeSingle;
    return chain;
  });
}

const TODAY = describeSignalDay(Date.now());
const CHOSEN = TODAY.objectives[0];

/** The database, doing what migration 049 §7 does. */
function claimRpc(overrides: Record<string, unknown> = {}) {
  mockRpc.mockImplementation((fn: string, params: Record<string, unknown>) => {
    if (fn === 'ensure_signal_day') {
      return Promise.resolve({ data: [{ id: 'day-a' }], error: null });
    }
    if (fn === 'begin_signal_objective_run') {
      return Promise.resolve({
        data: [
          {
            id: 'run-a',
            day_id: params.p_day_id,
            objective_id: params.p_objective_id,
            target: params.p_target,
            session_id: params.p_session_id,
            progress: 0,
            completed_at: null,
            owns_attempt: true,
            ...overrides,
          },
        ],
        error: null,
      });
    }
    return Promise.resolve({ data: null, error: null });
  });
}

beforeEach(() => {
  jest.clearAllMocks();
  mockGetUser.mockResolvedValue({ data: { user: { id: 'u1' } }, error: null });
  mockRpc.mockResolvedValue({ data: null, error: null });
  tableRows({ players: [{ id: 'p1' }] });
});

afterEach(() => {
  delete process.env.NEXT_PUBLIC_SIGNAL_V1;
});

describe('authentication and request shape', () => {
  it('401s without a bearer', async () => {
    const response = await loadRoute(true).POST(
      request({ sessionId: 's1', objectiveId: CHOSEN.id }, '')
    );
    expect(response.status).toBe(401);
  });

  it('401s on an invalid token, without resolving a day', async () => {
    mockGetUser.mockResolvedValue({ data: { user: null }, error: { message: 'bad' } });
    const response = await loadRoute(true).POST(
      request({ sessionId: 's1', objectiveId: CHOSEN.id })
    );
    expect(response.status).toBe(401);
    expect(mockRpc).not.toHaveBeenCalled();
  });

  it('400s without a sessionId or an objectiveId', async () => {
    const route = loadRoute(true);
    expect((await route.POST(request({ objectiveId: CHOSEN.id }))).status).toBe(400);
    expect((await route.POST(request({ sessionId: 's1' }))).status).toBe(400);
    expect(mockRpc).not.toHaveBeenCalled();
  });

  it('404s when the account has no player row', async () => {
    tableRows({ players: [] });
    const response = await loadRoute(true).POST(
      request({ sessionId: 's1', objectiveId: CHOSEN.id })
    );
    expect(response.status).toBe(404);
  });
});

describe('the choice is validated against the SERVER-derived day (Rule 11)', () => {
  beforeEach(() => claimRpc());

  it('rejects an objective that is not one of the day three', async () => {
    const response = await loadRoute(true).POST(
      request({ sessionId: 's1', objectiveId: 'signal_win_everything' })
    );
    expect(response.status).toBe(400);

    const body = await response.json();
    expect(body.error).toBe('Unknown Signal objective');
    // The day's actual three come back so a surface can correct itself.
    expect(body.objectives.map((o: { id: string }) => o.id)).toEqual(
      TODAY.objectives.map((o) => o.id)
    );
    // And nothing was claimed: no attempt, so no exemption.
    expect(mockRpc).not.toHaveBeenCalledWith(
      'begin_signal_objective_run',
      expect.anything()
    );
  });

  it('rejects an objective id of the wrong type just as flatly', async () => {
    for (const objectiveId of [42, null, { id: CHOSEN.id }, [CHOSEN.id]]) {
      const response = await loadRoute(true).POST(request({ sessionId: 's1', objectiveId }));
      expect(response.status).toBe(400);
    }
    expect(mockRpc).not.toHaveBeenCalledWith(
      'begin_signal_objective_run',
      expect.anything()
    );
  });

  it('sends the DAY target, never a number the request supplied', async () => {
    await loadRoute(true).POST(
      request({
        sessionId: 's1',
        objectiveId: CHOSEN.id,
        // Every one of these is ignored: there is no parameter for them.
        target: 1,
        day: '2020-01-01',
        dayId: 'day-of-my-choosing',
        bonusDna: 99999,
      })
    );

    expect(mockRpc).toHaveBeenCalledWith('begin_signal_objective_run', {
      p_player_id: 'p1',
      p_day_id: 'day-a',
      p_objective_id: CHOSEN.id,
      p_target: CHOSEN.target,
      p_session_id: 's1',
    });
    expect(mockRpc).toHaveBeenCalledWith(
      'ensure_signal_day',
      expect.objectContaining({ p_day: TODAY.day, p_seed: TODAY.seed })
    );
  });

  it('accepts one of the three and reports the exemption the SERVER granted', async () => {
    const response = await loadRoute(true).POST(
      request({ sessionId: 's1', objectiveId: CHOSEN.id })
    );
    expect(response.status).toBe(200);

    const body = await response.json();
    expect(body.live).toBe(true);
    expect(body.objective.id).toBe(CHOSEN.id);
    expect(body.objective.target).toBe(CHOSEN.target);
    expect(body.ownsAttempt).toBe(true);
    expect(body.chargeExempt).toBe(true);
  });
});

describe('a second take earns nothing (one attempt per day)', () => {
  it('reports the FIRST run as the owner, so the later run stays ordinary', async () => {
    claimRpc({ session_id: 's-first', owns_attempt: false, progress: 7 });
    const body = await (
      await loadRoute(true).POST(request({ sessionId: 's-second', objectiveId: CHOSEN.id }))
    ).json();

    expect(body.live).toBe(true);
    expect(body.ownsAttempt).toBe(false);
    expect(body.chargeExempt).toBe(false);
    expect(body.progress).toBe(7);
  });
});

describe('the flag-off path is closed, and tested rather than inferred', () => {
  it('answers 200 with live:false and never touches the claim RPC', async () => {
    claimRpc();
    const response = await loadRoute(false).POST(
      request({ sessionId: 's1', objectiveId: CHOSEN.id })
    );
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      live: false,
      day: null,
      objective: null,
      ownsAttempt: false,
      chargeExempt: false,
      progress: 0,
      completed: false,
    });
    expect(mockRpc).not.toHaveBeenCalled();
  });
});

describe('a refused claim is reported, and costs the player nothing (Rule 11)', () => {
  it('503s and reports to Sentry when the session is not this player open run', async () => {
    mockRpc.mockImplementation((fn: string) =>
      fn === 'ensure_signal_day'
        ? Promise.resolve({ data: [{ id: 'day-a' }], error: null })
        : Promise.resolve({
            data: null,
            error: {
              code: 'P0001',
              message:
                'begin_signal_objective_run: session s1 is not an open run for this player',
            },
          })
    );

    const response = await loadRoute(true).POST(
      request({ sessionId: 's1', objectiveId: CHOSEN.id })
    );
    expect(response.status).toBe(503);
    // A raise names the function, so it must NOT be mistaken for "migration
    // 049 is not applied" and swallowed.
    expect(mockCaptureException).toHaveBeenCalled();
  });
});

describe('this route pays nothing (§7.2, §12.2)', () => {
  it('invokes no settlement and no other RPC than the day and the claim', async () => {
    claimRpc();
    await loadRoute(true).POST(request({ sessionId: 's1', objectiveId: CHOSEN.id }));
    expect(mockRpc.mock.calls.map((call) => call[0]).sort()).toEqual([
      'begin_signal_objective_run',
      'ensure_signal_day',
    ]);
  });
});

/**
 * @jest-environment node
 *
 * GET /api/signal/panel — the published contract (Constitution §7.2).
 *
 * Track B builds its surfaces against the shape asserted here, so these tests
 * are the contract's executable half: the unauthenticated refusals, the
 * flag-OFF payload (200 with `live: false`, never a 404 — the rollback path is
 * TESTED, never inferred), and the flag-ON payload with the day the server
 * derived.
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
import { describeSignalDay, signalObjectiveId } from '@/shared/game/signal';

type RouteModule = typeof import('./route');

/**
 * The flag is read at module load, so the route is loaded per test with the
 * environment the test is about. `NEXT_PUBLIC_SIGNAL_V1` unset is production's
 * default until the Phase 1 gate.
 */
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

function request(authorization?: string) {
  const headers: Record<string, string> = {};
  if (authorization) headers.authorization = authorization;
  return new NextRequest('http://localhost/api/signal/panel', { headers });
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

beforeEach(() => {
  jest.clearAllMocks();
  mockGetUser.mockResolvedValue({ data: { user: { id: 'u1' } }, error: null });
  mockRpc.mockResolvedValue({ data: null, error: null });
  tableRows({ players: [{ id: 'p1', signals_completed: 0 }] });
});

afterEach(() => {
  delete process.env.NEXT_PUBLIC_SIGNAL_V1;
});

describe('authentication', () => {
  it('401s without a bearer', async () => {
    const response = await loadRoute(true).GET(request());
    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({ error: 'Unauthorized' });
  });

  it('401s on an invalid token', async () => {
    mockGetUser.mockResolvedValue({ data: { user: null }, error: { message: 'bad token' } });
    const response = await loadRoute(true).GET(request('Bearer nope'));
    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({ error: 'Invalid token' });
  });

  it('never resolves a day for an unauthenticated caller', async () => {
    await loadRoute(true).GET(request());
    expect(mockRpc).not.toHaveBeenCalled();
  });

  it('404s when the account has no player row', async () => {
    tableRows({ players: [] });
    const response = await loadRoute(true).GET(request('Bearer good'));
    expect(response.status).toBe(404);
  });
});

describe('the contract, with the flag OFF (the tested rollback path)', () => {
  it('answers 200 with a renderable off state, never a 404 or a 500', async () => {
    const response = await loadRoute(false).GET(request('Bearer good'));
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      live: false,
      day: null,
      you: {
        chosen: false,
        objectiveId: null,
        objective: null,
        progress: 0,
        target: 0,
        completed: false,
        bonusPaid: false,
      },
      marks: { signalsCompleted: 0, reached: [], next: 30 },
    });
  });

  it('resolves no day, so no run can obtain an exemption while the flag is off', async () => {
    await loadRoute(false).GET(request('Bearer good'));
    expect(mockRpc).not.toHaveBeenCalledWith('ensure_signal_day', expect.anything());
  });

  it('carries no claim and no collect step in the off state either (§7.2, §12.2)', async () => {
    const body = JSON.stringify(await (await loadRoute(false).GET(request('Bearer good'))).json());
    for (const forbidden of ['claim', 'collect', 'purchase', 'streak', 'consecutive']) {
      expect(body.toLowerCase()).not.toContain(forbidden);
    }
  });
});

describe('the contract, with the flag ON', () => {
  const NOW = Date.now();

  beforeEach(() => {
    mockRpc.mockImplementation((fn: string) =>
      fn === 'ensure_signal_day'
        ? Promise.resolve({ data: [{ id: 'day-a' }], error: null })
        : Promise.resolve({ data: null, error: null })
    );
  });

  it('publishes the server-derived day and its three objectives', async () => {
    const response = await loadRoute(true).GET(request('Bearer good'));
    expect(response.status).toBe(200);

    const body = await response.json();
    const derived = describeSignalDay(NOW);

    expect(body.live).toBe(true);
    expect(body.day.id).toBe('day-a');
    expect(body.day.day).toBe(derived.day);
    expect(body.day.seed).toBe(derived.seed);
    expect(body.day.condition.id).toBe(derived.condition.id);
    expect(body.day.objectives).toHaveLength(3);
    expect(body.day.objectives.map((o: { id: string }) => o.id)).toEqual([
      signalObjectiveId('endure'),
      signalObjectiveId('extract'),
      signalObjectiveId('engineer'),
    ]);
  });

  it('sends the day to the database entirely from the calendar (Rule 11)', async () => {
    await loadRoute(true).GET(request('Bearer good'));
    const derived = describeSignalDay(NOW);
    expect(mockRpc).toHaveBeenCalledWith(
      'ensure_signal_day',
      expect.objectContaining({
        p_day: derived.day,
        p_seed: derived.seed,
        p_modifier: derived.condition.id,
      })
    );
  });

  it('reports a player who has not taken today Signal as unchosen, not as failed', async () => {
    const body = await (await loadRoute(true).GET(request('Bearer good'))).json();
    expect(body.you).toEqual({
      chosen: false,
      objectiveId: null,
      objective: null,
      progress: 0,
      target: 0,
      completed: false,
      bonusPaid: false,
    });
  });

  it('reports the attempt the player actually opened, against the target they played for', async () => {
    const derived = describeSignalDay(NOW);
    const chosen = derived.objectives[1];
    tableRows({
      players: [{ id: 'p1', signals_completed: 31 }],
      signal_objective_runs: [
        {
          id: 'run-a',
          day_id: 'day-a',
          player_id: 'p1',
          objective_id: chosen.id,
          // Deliberately NOT the derived target: Rule 6 says the player is
          // judged against the number they were shown.
          target: chosen.target + 500,
          session_id: 's1',
          progress: 12,
          completed_at: null,
          settled_at: null,
          bonus_paid_at: null,
          signal_days: { day: derived.day },
        },
      ],
    });

    const body = await (await loadRoute(true).GET(request('Bearer good'))).json();
    expect(body.you.chosen).toBe(true);
    expect(body.you.objectiveId).toBe(chosen.id);
    expect(body.you.objective.kind).toBe(chosen.kind);
    expect(body.you.target).toBe(chosen.target + 500);
    expect(body.you.progress).toBe(12);
    expect(body.you.completed).toBe(false);
    expect(body.marks).toEqual({ signalsCompleted: 31, reached: [30], next: 100 });
  });

  it('settles nothing and claims nothing — it is a read (§7.2, §12.2)', async () => {
    await loadRoute(true).GET(request('Bearer good'));
    const calledRpcs = mockRpc.mock.calls.map((call) => call[0]);
    expect(calledRpcs).not.toContain('settle_signal_objective_run');
    expect(calledRpcs).not.toContain('begin_signal_objective_run');
  });
});

/**
 * Server-side sweeps and the cohort lookup (WP-0.06, GT §9.6 / §13).
 *
 * The load-bearing assertion in this file is negative: whatever else the
 * sweeps do, they only ever touch `game_sessions`, and only ever write
 * `ended_at` and `end_reason`. Every test records the tables and payloads that
 * were written so an added grant would show up as a new table or a new column.
 */

const mockCaptureException = jest.fn();

jest.mock('@sentry/nextjs', () => ({
  captureException: (...args: unknown[]) => mockCaptureException(...args),
}));

import type { SupabaseClient } from '@supabase/supabase-js';
import {
  abandonStalePlayerSessions,
  excludedCohortPlayerIds,
  expireStaleSessions,
  isMissingLifecycleInfra,
} from './sessionLifecycle';
import {
  STALE_OPEN_MINUTES,
  STALE_PENDING_SETTLEMENT_MINUTES,
  staleSessionCutoffs,
} from '@/lib/session/lifecycle';

interface Write {
  table: string;
  payload: Record<string, unknown>;
  filters: Array<[string, ...unknown[]]>;
}

function fakeClient(options: {
  rpc?: { data?: unknown; error?: unknown };
  update?: { data?: unknown; error?: unknown };
  select?: { data?: unknown; error?: unknown };
}) {
  const writes: Write[] = [];
  const rpcCalls: Array<{ fn: string; params: unknown }> = [];
  const reads: Array<{ table: string; filters: Array<[string, ...unknown[]]> }> = [];

  const client = {
    rpc: (fn: string, params: unknown) => {
      rpcCalls.push({ fn, params });
      return Promise.resolve({
        data: options.rpc?.data ?? null,
        error: options.rpc?.error ?? null,
      });
    },
    from: (table: string) => {
      const filters: Array<[string, ...unknown[]]> = [];
      const chain: Record<string, unknown> = {};
      const record = (op: string) => (...args: unknown[]) => {
        filters.push([op, ...args]);
        return chain;
      };
      for (const op of ['eq', 'is', 'lt', 'neq', 'not', 'gte']) {
        chain[op] = record(op);
      }
      chain.update = (payload: Record<string, unknown>) => {
        writes.push({ table, payload, filters });
        return chain;
      };
      chain.select = (columns?: string) => {
        reads.push({ table, filters });
        const settled = Promise.resolve({
          data: options.update?.data ?? options.select?.data ?? [],
          error: options.update?.error ?? options.select?.error ?? null,
        });
        // `.select()` terminates both the update chain and the read chain.
        return Object.assign(chain, {
          then: settled.then.bind(settled),
          catch: settled.catch.bind(settled),
          finally: settled.finally.bind(settled),
          columns,
        });
      };
      return chain;
    },
  };

  return { client: client as unknown as SupabaseClient, writes, rpcCalls, reads };
}

beforeEach(() => {
  mockCaptureException.mockClear();
});

describe('isMissingLifecycleInfra', () => {
  it('recognises the pre-045 schema, by code and by name', () => {
    expect(isMissingLifecycleInfra({ code: '42703' })).toBe(true);
    expect(isMissingLifecycleInfra({ code: 'PGRST202' })).toBe(true);
    expect(
      isMissingLifecycleInfra({ message: 'column game_sessions.end_reason does not exist' })
    ).toBe(true);
    expect(isMissingLifecycleInfra({ message: 'column players.cohort does not exist' })).toBe(
      true
    );
  });

  it('does not swallow a real failure', () => {
    expect(isMissingLifecycleInfra({ code: '40001', message: 'deadlock detected' })).toBe(
      false
    );
    expect(isMissingLifecycleInfra(null)).toBe(false);
  });
});

describe('expireStaleSessions', () => {
  it('runs the sweep in SQL with both windows and returns the count', async () => {
    const { client, rpcCalls, writes } = fakeClient({ rpc: { data: 41 } });

    const result = await expireStaleSessions(client);

    expect(result).toEqual({ expired: 41, skipped: false });
    expect(rpcCalls).toEqual([
      {
        fn: 'expire_stale_game_sessions',
        params: {
          p_open_max_minutes: STALE_OPEN_MINUTES,
          p_pending_max_minutes: STALE_PENDING_SETTLEMENT_MINUTES,
          p_batch_limit: 5000,
        },
      },
    ]);
    // The sweep grants nothing because it writes nothing outside the RPC.
    expect(writes).toEqual([]);
  });

  it('is a no-op before migration 045, without reporting an error', async () => {
    const { client } = fakeClient({ rpc: { error: { code: 'PGRST202' } } });

    expect(await expireStaleSessions(client)).toEqual({ expired: null, skipped: true });
    expect(mockCaptureException).not.toHaveBeenCalled();
  });

  it('reports a real failure to Sentry (Rule 11)', async () => {
    const { client } = fakeClient({
      rpc: { error: { code: '40001', message: 'deadlock detected' } },
    });

    expect(await expireStaleSessions(client)).toEqual({ expired: null, skipped: false });
    expect(mockCaptureException).toHaveBeenCalledTimes(1);
  });
});

describe('abandonStalePlayerSessions', () => {
  const NOW = new Date('2026-07-25T12:00:00.000Z');

  it('closes only this player’s own stale, never-settled runs', async () => {
    const { client, writes } = fakeClient({ update: { data: [{ id: 's1' }] } });

    const result = await abandonStalePlayerSessions(client, 'player-1', NOW);

    expect(result).toEqual({ expired: 1, skipped: false });
    expect(writes).toHaveLength(1);

    const [write] = writes;
    expect(write.table).toBe('game_sessions');
    // Two columns. Nothing else — no score, no dna_earned, no validated.
    expect(Object.keys(write.payload).sort()).toEqual(['end_reason', 'ended_at']);
    expect(write.payload.end_reason).toBe('abandoned');
    expect(write.payload.ended_at).toBe(NOW.toISOString());

    expect(write.filters).toEqual(
      expect.arrayContaining([
        ['eq', 'player_id', 'player-1'],
        ['is', 'ended_at', null],
        // A settled row waiting for an outbox replay is out of reach here.
        ['is', 'end_reason', null],
        ['lt', 'started_at', staleSessionCutoffs(NOW).open],
      ])
    );
  });

  it('touches no table but game_sessions', async () => {
    const { client, writes, rpcCalls } = fakeClient({ update: { data: [] } });
    await abandonStalePlayerSessions(client, 'player-1', NOW);
    expect(writes.map((w) => w.table)).toEqual(['game_sessions']);
    expect(rpcCalls).toEqual([]);
  });

  it('is a silent no-op before migration 045', async () => {
    const { client } = fakeClient({ update: { error: { code: '42703' } } });
    expect(await abandonStalePlayerSessions(client, 'player-1', NOW)).toEqual({
      expired: null,
      skipped: true,
    });
    expect(mockCaptureException).not.toHaveBeenCalled();
  });

  it('reports a real failure and never blocks the new run', async () => {
    const { client } = fakeClient({
      update: { error: { code: '55P03', message: 'lock not available' } },
    });
    await expect(abandonStalePlayerSessions(client, 'player-1', NOW)).resolves.toEqual({
      expired: null,
      skipped: false,
    });
    expect(mockCaptureException).toHaveBeenCalledTimes(1);
  });
});

describe('excludedCohortPlayerIds', () => {
  it('reads only the flagged minority', async () => {
    const { client, reads } = fakeClient({
      select: { data: [{ id: 'dev-1' }, { id: 'qa-1' }] },
    });

    const { ids, skipped } = await excludedCohortPlayerIds(client);

    expect(skipped).toBe(false);
    expect([...ids].sort()).toEqual(['dev-1', 'qa-1']);
    expect(reads).toHaveLength(1);
    expect(reads[0].table).toBe('players');
    expect(reads[0].filters).toEqual([['neq', 'cohort', 'player']]);
  });

  it('writes nothing — flagging is read-side (Rule 6)', async () => {
    const { client, writes } = fakeClient({ select: { data: [{ id: 'dev-1' }] } });
    await excludedCohortPlayerIds(client);
    expect(writes).toEqual([]);
  });

  it('excludes nobody before migration 045', async () => {
    const { client } = fakeClient({ select: { error: { code: '42703' } } });
    const { ids, skipped } = await excludedCohortPlayerIds(client);
    expect(ids.size).toBe(0);
    expect(skipped).toBe(true);
    expect(mockCaptureException).not.toHaveBeenCalled();
  });

  it('reports a real failure and degrades to showing everyone', async () => {
    const { client } = fakeClient({
      select: { error: { code: '08006', message: 'connection failure' } },
    });
    const { ids } = await excludedCohortPlayerIds(client);
    expect(ids.size).toBe(0);
    expect(mockCaptureException).toHaveBeenCalledTimes(1);
  });
});

/**
 * Ascension — the server read (WP-2.01; Constitution §6.1, §12.2, Rules 5, 6, 11).
 *
 * What this file pins:
 *
 *   - the read is a READ: no RPC, no insert, no update, no claim, ever;
 *   - a month is scoped by the Signal calendar, not by an unbounded query;
 *   - eligibility is Score's own predicate, imported rather than re-stated —
 *     so a month can never rank a run the leaderboard refuses;
 *   - every Supabase `error` is reported to Sentry (Rule 11) and turns into an
 *     empty reading rather than an invented one;
 *   - the flag-off path is exercised directly, not inferred;
 *   - no currency, no DNA column and no claim field reaches the payload.
 */

const mockCaptureException = jest.fn();

jest.mock('@sentry/nextjs', () => ({
  captureException: (...args: unknown[]) => mockCaptureException(...args),
}));

import { describe, expect, it, beforeEach } from '@jest/globals';
import type { SupabaseClient } from '@supabase/supabase-js';
import { buildAscensionView, emptyAscensionView } from './ascension';

const NOW = Date.UTC(2026, 7, 15, 12); // mid-August 2026
const PLAYER = 'player-1';

interface TableFixture {
  data?: unknown;
  error?: { code?: string; message?: string } | null;
}

interface FilterCall {
  table: string;
  op: string;
  args: unknown[];
}

/** A Supabase double that records what was ASKED for as well as what came back. */
function fakeClient(tables: Record<string, TableFixture> = {}) {
  const selects: Array<{ table: string; columns: string }> = [];
  const filters: FilterCall[] = [];
  const writes: string[] = [];
  const rpcCalls: string[] = [];

  const client = {
    rpc: (fn: string) => {
      rpcCalls.push(fn);
      return Promise.resolve({ data: null, error: null });
    },
    from: (table: string) => {
      const fixture = tables[table];
      const settled = () =>
        Promise.resolve({ data: fixture?.data ?? [], error: fixture?.error ?? null });
      const chain: Record<string, unknown> = {};
      const record = (op: string) => (...args: unknown[]) => {
        filters.push({ table, op, args });
        return chain;
      };
      for (const op of ['eq', 'in', 'is', 'not', 'gt', 'gte', 'lte', 'lt', 'neq', 'or', 'order', 'limit']) {
        chain[op] = record(op);
      }
      for (const op of ['insert', 'update', 'upsert', 'delete']) {
        chain[op] = (...args: unknown[]) => {
          writes.push(`${table}.${op}`);
          filters.push({ table, op, args });
          return chain;
        };
      }
      chain.select = (columns = '') => {
        selects.push({ table, columns: String(columns) });
        const promise = settled();
        return Object.assign(chain, {
          then: promise.then.bind(promise),
          catch: promise.catch.bind(promise),
          finally: promise.finally.bind(promise),
        });
      };
      chain.maybeSingle = () => {
        const rows = fixture?.data;
        const row = Array.isArray(rows) ? (rows[0] ?? null) : (rows ?? null);
        return Promise.resolve({ data: row, error: fixture?.error ?? null });
      };
      chain.single = chain.maybeSingle;
      return chain;
    },
  };

  return { client: client as unknown as SupabaseClient, selects, filters, writes, rpcCalls };
}

/** An attempt row as PostgREST returns it, with the `signal_days` embed. */
const attempt = (sessionId: string, day: string) => ({
  session_id: sessionId,
  signal_days: { day },
});

/** A `game_sessions` row that Score's own predicate accepts. */
const session = (id: string, score: number, overrides: Record<string, unknown> = {}) => ({
  id,
  player_id: PLAYER,
  score,
  dynasty: 'CYBER',
  started_at: '2026-08-04T12:00:00.000Z',
  ended_at: '2026-08-04T12:20:00.000Z',
  validated: true,
  is_free_play: false,
  anomaly_id: null,
  end_reason: 'completed',
  ...overrides,
});

function fixture(attempts: unknown[], sessions: unknown[]) {
  return fakeClient({
    signal_objective_runs: { data: attempts },
    game_sessions: { data: sessions },
  });
}

beforeEach(() => {
  mockCaptureException.mockClear();
});

describe('the flag-off path is closed, and is tested rather than inferred', () => {
  it('reads nothing at all when Ascension is off', async () => {
    const { client, selects } = fixture(
      [attempt('s1', '2026-08-04')],
      [session('s1', 900)]
    );
    const view = await buildAscensionView(client, PLAYER, '2026-08', NOW, {
      enabled: false,
    });

    expect(view.live).toBe(false);
    expect(view.reading?.points).toBe(0);
    // The database was never asked. Off means off, not "read and hidden".
    expect(selects).toHaveLength(0);
  });

  it('still hands back a well-formed month, so a surface can render an off state', () => {
    const off = emptyAscensionView('2026-08', NOW);
    expect(off.live).toBe(false);
    expect(off.reading?.month).toBe('2026-08');
    expect(off.reading?.tier.id).toBe('COIL');
    expect(off.currentMonth).toBe('2026-08');
  });
});

describe('the read is a read (§7.2, §12.2)', () => {
  it('issues no RPC and no write of any kind', async () => {
    const { client, writes, rpcCalls } = fixture(
      [attempt('s1', '2026-08-04')],
      [session('s1', 900)]
    );
    await buildAscensionView(client, PLAYER, '2026-08', NOW, { enabled: true });

    expect(writes).toEqual([]);
    expect(rpcCalls).toEqual([]);
  });

  it('touches only the two tables a month is folded from', async () => {
    const { client, selects } = fixture(
      [attempt('s1', '2026-08-04')],
      [session('s1', 900)]
    );
    await buildAscensionView(client, PLAYER, '2026-08', NOW, { enabled: true });

    expect(selects.map((s) => s.table)).toEqual([
      'signal_objective_runs',
      'game_sessions',
    ]);
  });

  it('never selects a currency column — a month has no payout (§12.2)', async () => {
    const { client, selects } = fixture(
      [attempt('s1', '2026-08-04')],
      [session('s1', 900)]
    );
    await buildAscensionView(client, PLAYER, '2026-08', NOW, { enabled: true });

    for (const { columns } of selects) {
      expect(columns).not.toMatch(/dna_earned|yield_dna|\bdna\b/i);
      expect(columns).not.toMatch(/premium|entitle|stripe|subscription/i);
    }
  });
});

describe('the month is scoped by the Signal calendar', () => {
  it('bounds the attempt query to the month, inclusive at both ends', async () => {
    const { client, filters } = fixture([], []);
    await buildAscensionView(client, PLAYER, '2026-08', NOW, { enabled: true });

    const gte = filters.find((f) => f.op === 'gte');
    const lte = filters.find((f) => f.op === 'lte');
    expect(gte?.args).toEqual(['signal_days.day', '2026-08-01']);
    expect(lte?.args).toEqual(['signal_days.day', '2026-08-31']);
  });

  it('uses an inner embed, so the day filter prunes parents and not just children', async () => {
    const { client, selects } = fixture([], []);
    await buildAscensionView(client, PLAYER, '2026-08', NOW, { enabled: true });
    expect(selects[0].columns).toContain('signal_days!inner(day)');
  });

  it('scopes both queries to the player, and re-checks ownership on the rows', async () => {
    const { client, filters } = fixture(
      [attempt('s1', '2026-08-04'), attempt('s2', '2026-08-05')],
      [session('s1', 900), session('s2', 800, { player_id: 'someone-else' })]
    );
    const view = await buildAscensionView(client, PLAYER, '2026-08', NOW, {
      enabled: true,
    });

    const playerFilters = filters.filter(
      (f) => f.op === 'eq' && f.args[0] === 'player_id'
    );
    expect(playerFilters).toHaveLength(2);
    // Gate two: the foreign row is dropped even though the query asked for it.
    expect(view.reading?.signalsScored).toBe(1);
    expect(view.reading?.points).toBe(900);
  });

  it('refuses a month key that is not a month, without querying', async () => {
    const { client, selects } = fixture([], []);
    const view = await buildAscensionView(client, PLAYER, '2026-13', NOW, {
      enabled: true,
    });
    expect(view.reading).toBeNull();
    expect(view.live).toBe(false);
    expect(selects).toHaveLength(0);
  });

  it('skips the session query entirely when the month has no attempts', async () => {
    const { client, selects } = fixture([], [session('s1', 900)]);
    const view = await buildAscensionView(client, PLAYER, '2026-08', NOW, {
      enabled: true,
    });
    expect(view.live).toBe(true);
    expect(view.reading?.signalsScored).toBe(0);
    expect(selects.map((s) => s.table)).toEqual(['signal_objective_runs']);
  });

  it('handles the embed arriving as an array, which some drivers do', async () => {
    const { client } = fixture(
      [{ session_id: 's1', signal_days: [{ day: '2026-08-04' }] }],
      [session('s1', 900)]
    );
    const view = await buildAscensionView(client, PLAYER, '2026-08', NOW, {
      enabled: true,
    });
    expect(view.reading?.points).toBe(900);
  });
});

describe("eligibility is Score's own (§6.1)", () => {
  it('counts a completed, validated Signal run', async () => {
    const { client } = fixture(
      [attempt('s1', '2026-08-04'), attempt('s2', '2026-08-09')],
      [session('s1', 900), session('s2', 640)]
    );
    const view = await buildAscensionView(client, PLAYER, '2026-08', NOW, {
      enabled: true,
    });
    expect(view.reading?.points).toBe(1_540);
    expect(view.reading?.signalsScored).toBe(2);
  });

  it.each([
    ['a flagged run', { validated: false }],
    ['an unvalidated run', { validated: null }],
    ['a run still open', { ended_at: null }],
    ['a practice run', { is_free_play: true }],
    ['a run that did not settle', { end_reason: 'abandoned' }],
    ['a run that started before the month', { started_at: '2026-07-01T00:00:00.000Z' }],
  ])('does not count %s', async (_label, overrides) => {
    const { client } = fixture(
      [attempt('s1', '2026-08-04'), attempt('s2', '2026-08-09')],
      [session('s1', 900, overrides), session('s2', 640)]
    );
    const view = await buildAscensionView(client, PLAYER, '2026-08', NOW, {
      enabled: true,
    });
    expect(view.reading?.points).toBe(640);
    expect(view.reading?.signalsScored).toBe(1);
  });

  it('counts a Signal run despite the anomaly-board exclusion, because Signal runs stamp no anomaly_id', async () => {
    // `mode: 'signal'` writes no `anomaly_id` (api/game/session/route.ts); only
    // `mode: 'anomaly'` does. If that ever changed, every month would silently
    // read zero — which is why this is asserted rather than assumed.
    const { client } = fixture([attempt('s1', '2026-08-04')], [session('s1', 900)]);
    const view = await buildAscensionView(client, PLAYER, '2026-08', NOW, {
      enabled: true,
    });
    expect(view.reading?.points).toBe(900);
  });

  it('drops an attempt with no run behind it, without inventing a zero (Rule 5)', async () => {
    const { client } = fixture(
      [attempt('s1', '2026-08-04'), { session_id: null, signal_days: { day: '2026-08-05' } }],
      [session('s1', 900)]
    );
    const view = await buildAscensionView(client, PLAYER, '2026-08', NOW, {
      enabled: true,
    });
    // The opened-but-unfinished day is absent, not a zero-scored row.
    expect(view.reading?.signalsScored).toBe(1);
    expect(view.reading?.days).toHaveLength(1);
  });

  it('counts only the comparable half of a month that straddles the content epoch', async () => {
    // `LEADERBOARD_CONTENT_EPOCH` is 2026-07-18: scores from before it were
    // folded differently and §6.1 requires a "compatible content version". July
    // 2026 is the one month that straddles it, so it is asserted rather than
    // left to be discovered when someone opens an archived month.
    const july = Date.UTC(2026, 6, 25, 12);
    const { client } = fixture(
      [attempt('s1', '2026-07-10'), attempt('s2', '2026-07-20')],
      [
        session('s1', 900, {
          started_at: '2026-07-10T12:00:00.000Z',
          ended_at: '2026-07-10T12:20:00.000Z',
        }),
        session('s2', 640, {
          started_at: '2026-07-20T12:00:00.000Z',
          ended_at: '2026-07-20T12:20:00.000Z',
        }),
      ]
    );
    const view = await buildAscensionView(client, PLAYER, '2026-07', july, {
      enabled: true,
    });
    expect(view.reading?.signalsScored).toBe(1);
    expect(view.reading?.points).toBe(640);
  });

  it('takes only the best ten of a busy month', async () => {
    const attempts = Array.from({ length: 14 }, (_, i) =>
      attempt(`s${i}`, `2026-08-${String(i + 1).padStart(2, '0')}`)
    );
    const sessions = Array.from({ length: 14 }, (_, i) => session(`s${i}`, (i + 1) * 100));
    const { client } = fixture(attempts, sessions);
    const view = await buildAscensionView(client, PLAYER, '2026-08', NOW, {
      enabled: true,
    });
    expect(view.reading?.counted).toHaveLength(10);
    // 500..1400
    expect(view.reading?.points).toBe(9_500);
    expect(view.reading?.signalsScored).toBe(14);
  });
});

describe('Rule 11 — every error is checked and reported', () => {
  it('reports an attempt-read failure and returns an empty month', async () => {
    const { client } = fakeClient({
      signal_objective_runs: { error: { code: '08006', message: 'connection reset' } },
    });
    const view = await buildAscensionView(client, PLAYER, '2026-08', NOW, {
      enabled: true,
    });

    expect(mockCaptureException).toHaveBeenCalledTimes(1);
    expect(view.live).toBe(false);
    expect(view.reading?.points).toBe(0);
  });

  it('reports a session-read failure and returns an empty month', async () => {
    const { client } = fakeClient({
      signal_objective_runs: { data: [attempt('s1', '2026-08-04')] },
      game_sessions: { error: { code: '08006', message: 'connection reset' } },
    });
    const view = await buildAscensionView(client, PLAYER, '2026-08', NOW, {
      enabled: true,
    });

    expect(mockCaptureException).toHaveBeenCalledTimes(1);
    expect(view.live).toBe(false);
  });

  it('treats "migration 049 is not applied here" as not-live, not as an incident', async () => {
    const { client } = fakeClient({
      signal_objective_runs: {
        error: { code: '42P01', message: 'relation "signal_objective_runs" does not exist' },
      },
    });
    const view = await buildAscensionView(client, PLAYER, '2026-08', NOW, {
      enabled: true,
    });

    expect(mockCaptureException).not.toHaveBeenCalled();
    expect(view.live).toBe(false);
    expect(view.reading?.month).toBe('2026-08');
  });
});

describe('the payload (§12.2, Rule 7)', () => {
  it('carries no currency, claim, price or entitlement field', async () => {
    const { client } = fixture(
      [attempt('s1', '2026-08-04'), attempt('s2', '2026-08-09')],
      [session('s1', 900), session('s2', 640)]
    );
    const view = await buildAscensionView(client, PLAYER, '2026-08', NOW, {
      enabled: true,
    });

    const json = JSON.stringify(view).toLowerCase();
    for (const banned of [
      'dna',
      'currency',
      'balance',
      'claim',
      'collect',
      'reward',
      'payout',
      'bonus',
      'price',
      'premium',
      'entitle',
      'checkout',
      'stripe',
    ]) {
      expect(json).not.toContain(banned);
    }
  });

  it('names the current month from the server clock, so a client cannot invent one', async () => {
    const { client } = fixture([], []);
    const view = await buildAscensionView(client, PLAYER, '2026-05', NOW, {
      enabled: true,
    });
    expect(view.currentMonth).toBe('2026-08');
    expect(view.reading?.month).toBe('2026-05');
  });
});

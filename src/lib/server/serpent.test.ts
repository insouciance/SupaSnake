/**
 * The World Serpent — server authority (WP-1.01; Constitution §7.3, §8.6,
 * Rules 6, 8 and 11).
 *
 * What this file pins:
 *
 *   - the week is derived from the calendar and never from a request;
 *   - the flag-off path is CLOSED — no week, no exemption, no run flagging;
 *   - settlement is an exact recompute, and running it twice sends the same
 *     payload (the cron-idempotency acceptance criterion);
 *   - a Serpent attempt consumes no charge;
 *   - Depth never reads the lean-adjusted DNA — `dna_earned` is not in any
 *     query this module issues.
 */

const mockCaptureException = jest.fn();

jest.mock('@sentry/nextjs', () => ({
  captureException: (...args: unknown[]) => mockCaptureException(...args),
}));

import { describe, expect, it, beforeEach } from '@jest/globals';
import type { SupabaseClient } from '@supabase/supabase-js';
import * as fs from 'fs';
import * as path from 'path';
import {
  buildSerpentPanel,
  ensureCurrentSerpentWeek,
  isMissingSerpentInfra,
  loadSerpentWeekRuns,
  settleDueSerpentWeeks,
  settleSerpentWeekRow,
  emptySerpentPanel,
  type SerpentWeekRow,
} from './serpent';
import { consumeRunCharge } from './energyEnvelope';
import { NO_EXEMPTION } from '@/shared/game/energyEnvelope';
import {
  describeSerpentWeek,
  serpentStoredModifiers,
} from '@/shared/game/serpent';

const NOW = Date.UTC(2026, 6, 27, 0, 30); // Monday 00:30 UTC — cron time
const LAST_WEEK = describeSerpentWeek(Date.UTC(2026, 6, 22));

interface RpcCall {
  fn: string;
  params: Record<string, unknown>;
}

interface TableFixture {
  data?: unknown;
  error?: { code?: string; message?: string } | null;
}

/**
 * A Supabase double that records everything. Reads are answered from
 * `tables`, RPCs from `rpcs`; both record their calls so a test can assert
 * what was ASKED for as well as what came back.
 */
function fakeClient(options: {
  tables?: Record<string, TableFixture>;
  rpcs?: Record<string, TableFixture>;
} = {}) {
  const rpcCalls: RpcCall[] = [];
  const selects: Array<{ table: string; columns: string }> = [];

  const client = {
    rpc: (fn: string, params: Record<string, unknown>) => {
      rpcCalls.push({ fn, params });
      const fixture = options.rpcs?.[fn];
      return Promise.resolve({
        data: fixture?.data ?? null,
        error: fixture?.error ?? null,
      });
    },
    from: (table: string) => {
      const fixture = options.tables?.[table];
      const settled = () =>
        Promise.resolve({
          data: fixture?.data ?? [],
          error: fixture?.error ?? null,
        });
      const chain: Record<string, unknown> = {};
      const passthrough = () => chain;
      for (const op of ['eq', 'in', 'is', 'not', 'gt', 'gte', 'lte', 'lt', 'neq', 'or', 'order', 'limit']) {
        chain[op] = passthrough;
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

  return { client: client as unknown as SupabaseClient, rpcCalls, selects };
}

const weekRpcRow = (week = LAST_WEEK, id = 'week-a') => ({
  id,
  week_start: week.weekStart,
  starts_at: week.startsAt,
  ends_at: week.endsAt,
  seed: week.seed,
  modifiers: week.modifiers,
  settled_at: null,
});

const session = (overrides: Record<string, unknown> = {}) => ({
  id: `s-${Math.random().toString(36).slice(2)}`,
  player_id: 'p1',
  serpent_week_id: 'week-a',
  yield_dna: 100,
  ended_at: '2026-07-23T12:00:00.000Z',
  end_reason: 'completed',
  validated: true,
  is_free_play: false,
  ...overrides,
});

beforeEach(() => {
  mockCaptureException.mockClear();
});

// ---------------------------------------------------------------------------
// The flag, and the closed default
// ---------------------------------------------------------------------------

describe('the flag-off path is closed, and is tested rather than inferred', () => {
  it('resolves no week, so no run can be flagged and no exemption granted', async () => {
    const { client, rpcCalls } = fakeClient({
      rpcs: { ensure_serpent_week: { data: [weekRpcRow()] } },
    });
    const week = await ensureCurrentSerpentWeek(client, NOW, { enabled: false });
    expect(week).toBeNull();
    // The database was never asked. Off means off, not "resolved and hidden".
    expect(rpcCalls).toHaveLength(0);
  });

  it('the panel answers a renderable off state, not an error', async () => {
    const { client } = fakeClient();
    const panel = await buildSerpentPanel(client, 'p1', NOW, { enabled: false });
    expect(panel).toEqual(emptySerpentPanel());
    expect(panel.live).toBe(false);
    expect(panel.week).toBeNull();
    expect(panel.you.depth).toBe(0);
    expect(panel.you.lifetimeDepth).toBe(0);
    expect(panel.clan).toBeNull();
  });

  it('a flag-off run therefore takes the ORDINARY charged path', async () => {
    const { client, rpcCalls } = fakeClient({
      rpcs: {
        ensure_serpent_week: { data: [weekRpcRow()] },
        consume_run_charge: {
          data: [{ charged: true, charges_day: '2026-07-27', charges_used: 1 }],
        },
      },
    });
    const week = await ensureCurrentSerpentWeek(client, NOW, { enabled: false });
    const charge = await consumeRunCharge(client, 'p1', {
      ...NO_EXEMPTION,
      serpentWeekId: week?.id ?? null,
    });
    expect(charge.state).toBe('charged');
    expect(rpcCalls.map((call) => call.fn)).toContain('consume_run_charge');
  });
});

// ---------------------------------------------------------------------------
// The week — derived, never asserted
// ---------------------------------------------------------------------------

describe('the week is derived from the UTC calendar', () => {
  it('sends only calendar-derived values to the database', async () => {
    const { client, rpcCalls } = fakeClient({
      rpcs: { ensure_serpent_week: { data: [weekRpcRow()] } },
    });
    const week = await ensureCurrentSerpentWeek(client, Date.UTC(2026, 6, 23), {
      enabled: true,
    });

    expect(rpcCalls).toHaveLength(1);
    expect(rpcCalls[0].fn).toBe('ensure_serpent_week');
    const expected = describeSerpentWeek(Date.UTC(2026, 6, 23));
    expect(rpcCalls[0].params).toEqual({
      p_week_start: expected.weekStart,
      p_starts_at: expected.startsAt,
      p_ends_at: expected.endsAt,
      p_seed: expected.seed,
      // serpentStoredModifiers, not expected.modifiers: the column holds
      // [...anomalies, ...clauses] (WP-2.10b), and asserting through the same
      // composition the implementation uses keeps this test honest — if the
      // composition changes, both sides move together, and a clause that
      // silently stopped being persisted still fails here.
      p_modifiers: serpentStoredModifiers(expected),
    });
    expect(week?.id).toBe('week-a');
    expect(week?.modifiers.map((m) => m.id)).toEqual(expected.modifiers);
  });

  it('degrades to "not live" before migration 046, without alarming Sentry', async () => {
    const { client } = fakeClient({
      rpcs: {
        ensure_serpent_week: {
          error: { code: '42883', message: 'function ensure_serpent_week does not exist' },
        },
      },
    });
    expect(await ensureCurrentSerpentWeek(client, NOW, { enabled: true })).toBeNull();
    expect(mockCaptureException).not.toHaveBeenCalled();
  });

  it('reports a REAL failure to Sentry and still fails closed', async () => {
    const { client } = fakeClient({
      rpcs: {
        ensure_serpent_week: { error: { code: '08006', message: 'connection failure' } },
      },
    });
    expect(await ensureCurrentSerpentWeek(client, NOW, { enabled: true })).toBeNull();
    expect(mockCaptureException).toHaveBeenCalled();
  });

  it('recognises the pre-migration signatures and nothing else', () => {
    expect(isMissingSerpentInfra({ code: '42P01' })).toBe(true);
    expect(isMissingSerpentInfra({ code: '42703' })).toBe(true);
    expect(isMissingSerpentInfra({ message: 'column serpent_week_id does not exist' })).toBe(true);
    expect(isMissingSerpentInfra({ code: '08006', message: 'connection failure' })).toBe(false);
    expect(isMissingSerpentInfra(null)).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Gate one and gate two
// ---------------------------------------------------------------------------

describe('run loading applies its predicates twice', () => {
  it('never reads dna_earned — Depth is charge-blind by law (§8.6)', async () => {
    const { client, selects } = fakeClient({ tables: { game_sessions: { data: [] } } });
    await loadSerpentWeekRuns(client, 'week-a');
    const columns = selects.find((s) => s.table === 'game_sessions')?.columns ?? '';
    expect(columns).toContain('yield_dna');
    expect(columns).not.toContain('dna_earned');
  });

  it('re-applies eligibility in code, so a leaked row cannot reach Depth', async () => {
    // Every row here would be returned by a REGRESSED query. The pure gate
    // refuses all but the first.
    const { client } = fakeClient({
      tables: {
        game_sessions: {
          data: [
            session({ id: 'ok' }),
            session({ id: 'expired', end_reason: 'expired' }),
            session({ id: 'abandoned', end_reason: 'abandoned' }),
            session({ id: 'open', ended_at: null }),
            session({ id: 'flagged', validated: false }),
            session({ id: 'practice', is_free_play: true }),
            session({ id: 'other-week', serpent_week_id: 'week-b' }),
          ],
        },
      },
    });
    const { runs } = await loadSerpentWeekRuns(client, 'week-a');
    expect(runs.map((run) => run.sessionId)).toEqual(['ok']);
  });
});

// ---------------------------------------------------------------------------
// Settlement, and the idempotency acceptance criterion
// ---------------------------------------------------------------------------

function settlementClient(sessions: Array<Record<string, unknown>>) {
  return fakeClient({
    tables: {
      game_sessions: { data: sessions },
      players: { data: [{ id: 'p1', user_id: 'u1' }, { id: 'p2', user_id: 'u2' }] },
      clan_members: {
        data: [
          { player_id: 'u1', clan_id: 'clan-1' },
          { player_id: 'u2', clan_id: 'clan-1' },
        ],
      },
      serpent_weeks: { data: [weekRpcRow()] },
    },
    rpcs: {
      apply_serpent_week_settlement: {
        data: { week_id: 'week-a', players: 2, clans: 1, chronicle_entries: 1 },
      },
    },
  });
}

const WEEK_ROW: SerpentWeekRow = {
  id: 'week-a',
  weekStart: LAST_WEEK.weekStart,
  startsAt: LAST_WEEK.startsAt,
  endsAt: LAST_WEEK.endsAt,
  seed: LAST_WEEK.seed,
  modifiers: [],
  settledAt: null,
};

describe('settlement is an exact recompute', () => {
  const sessions = [
    session({ player_id: 'p1', yield_dna: 300 }),
    session({ player_id: 'p1', yield_dna: 200 }),
    session({ player_id: 'p1', yield_dna: 100 }),
    session({ player_id: 'p1', yield_dna: 50 }), // fourth run: does not count
    session({ player_id: 'p1', yield_dna: 9999, end_reason: 'expired' }),
    session({ player_id: 'p2', yield_dna: 150 }),
  ];

  it('sends best-3 per member and the clan each member belongs to', async () => {
    const { client, rpcCalls } = settlementClient(sessions);
    await settleSerpentWeekRow(client, WEEK_ROW);

    const apply = rpcCalls.find((c) => c.fn === 'apply_serpent_week_settlement');
    expect(apply).toBeDefined();
    const payload = apply?.params.p_players as Array<Record<string, unknown>>;
    const p1 = payload.find((row) => row.player_id === 'p1');
    expect(p1).toMatchObject({
      depth: 600,
      attempts: 4,
      best_yield: 300,
      counted_yields: [300, 200, 100],
      clan_id: 'clan-1',
    });
    expect(payload.find((row) => row.player_id === 'p2')).toMatchObject({
      depth: 150,
      clan_id: 'clan-1',
    });
  });

  it('IDEMPOTENT: settling the same week twice sends an identical payload', async () => {
    const first = settlementClient(sessions);
    await settleSerpentWeekRow(first.client, WEEK_ROW);
    const second = settlementClient(sessions);
    await settleSerpentWeekRow(second.client, WEEK_ROW);

    const payloadOf = (calls: RpcCall[]) =>
      calls.find((c) => c.fn === 'apply_serpent_week_settlement')?.params.p_players;

    expect(payloadOf(second.rpcCalls)).toEqual(payloadOf(first.rpcCalls));
    // And nothing in the payload is a delta, an increment or a bonus.
    const payload = payloadOf(first.rpcCalls) as Array<Record<string, unknown>>;
    for (const row of payload) {
      expect(Object.keys(row).sort()).toEqual([
        'attempts',
        'best_yield',
        'clan_id',
        'counted_yields',
        'depth',
        'player_id',
      ]);
    }
  });

  it('pays no DNA and touches no economy table', async () => {
    const { client, rpcCalls, selects } = settlementClient(sessions);
    await settleSerpentWeekRow(client, WEEK_ROW);
    const touched = new Set(selects.map((s) => s.table));
    expect(touched.has('economy_transactions')).toBe(false);
    expect([...touched]).toEqual(
      expect.arrayContaining(['game_sessions', 'players', 'clan_members'])
    );
    expect(rpcCalls.map((c) => c.fn)).toEqual([
      'apply_serpent_week_settlement',
    ]);
  });

  it('reports an apply failure and asks to be retried, rather than claiming success', async () => {
    const { client } = fakeClient({
      tables: {
        game_sessions: { data: [session()] },
        players: { data: [{ id: 'p1', user_id: 'u1' }] },
        clan_members: { data: [] },
      },
      rpcs: {
        apply_serpent_week_settlement: {
          error: { code: '40001', message: 'serialization failure' },
        },
      },
    });
    const result = await settleSerpentWeekRow(client, WEEK_ROW);
    expect(result.failed).toBe(true);
    expect(mockCaptureException).toHaveBeenCalled();
  });
});

describe('the cron settles every submerged week, and only submerged weeks', () => {
  it('skips silently before migration 046', async () => {
    const { client } = fakeClient({
      tables: {
        serpent_weeks: { error: { code: '42P01', message: 'relation "serpent_weeks" does not exist' } },
      },
    });
    const result = await settleDueSerpentWeeks(client, NOW);
    expect(result).toEqual({ settled: [], skipped: true, failed: false });
    expect(mockCaptureException).not.toHaveBeenCalled();
  });

  it('refuses to settle a week that is still being hunted, even if the query returns one', async () => {
    // A regressed `lte` bound would hand back the CURRENT week. Gate two
    // re-applies "has submerged" in code and drops it.
    const current = describeSerpentWeek(NOW);
    const { client, rpcCalls } = fakeClient({
      tables: {
        serpent_weeks: {
          data: [
            {
              id: 'week-current',
              week_start: current.weekStart,
              starts_at: current.startsAt,
              ends_at: current.endsAt,
              seed: current.seed,
              modifiers: current.modifiers,
              settled_at: null,
            },
          ],
        },
      },
    });
    const result = await settleDueSerpentWeeks(client, NOW);
    expect(result.settled).toHaveLength(0);
    expect(rpcCalls).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// §8.6 — a Serpent attempt consumes no charge
// ---------------------------------------------------------------------------

describe('a Serpent attempt consumes NO charge (§8.6)', () => {
  it('the ledger RPC is never called when the server resolved a week', async () => {
    const { client, rpcCalls } = fakeClient({
      rpcs: {
        ensure_serpent_week: { data: [weekRpcRow()] },
        consume_run_charge: {
          data: [{ charged: true, charges_day: '2026-07-27', charges_used: 1 }],
        },
      },
      tables: { players: { data: [{ charges_day: '2026-07-27', charges_used: 4 }] } },
    });

    const week = await ensureCurrentSerpentWeek(client, NOW, { enabled: true });
    expect(week).not.toBeNull();

    const charge = await consumeRunCharge(client, 'p1', {
      ...NO_EXEMPTION,
      serpentWeekId: week?.id ?? null,
    });

    expect(charge.state).toBe('exempt');
    expect(rpcCalls.map((call) => call.fn)).not.toContain('consume_run_charge');
  });

  it('is exempt even on a day whose allotment is already empty', async () => {
    const { client, rpcCalls } = fakeClient({
      tables: { players: { data: [{ charges_day: '2026-07-27', charges_used: 6 }] } },
    });
    const charge = await consumeRunCharge(
      client,
      'p1',
      { ...NO_EXEMPTION, serpentWeekId: 'week-a' },
      NOW
    );
    expect(charge.state).toBe('exempt');
    expect(charge.status.remaining).toBe(0);
    expect(rpcCalls).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// The session route actually populates the fact (the hook WP-0.01 left open)
// ---------------------------------------------------------------------------

describe('the session route supplies the server-resolved week id', () => {
  const routeSource = fs.readFileSync(
    path.join(process.cwd(), 'src/app/api/game/session/route.ts'),
    'utf8'
  );

  it('resolves the week from the server clock and passes its id as the fact', () => {
    expect(routeSource).toMatch(/ensureCurrentSerpentWeek\(supabase, startedAtDate\)/);
    expect(routeSource).toMatch(/serpentWeekId: serpentWeek\?\.id \?\? null/);
  });

  it('stamps the flag on the session row at START', () => {
    expect(routeSource).toMatch(/serpent_week_id: serpentWeek\.id/);
  });

  it('never derives the week from the request body', () => {
    // `mode` may ASK. Nothing else about the week may come from the client.
    expect(routeSource).not.toMatch(/body\.(serpent|week)/i);
    expect(routeSource).not.toMatch(/serpent_week_id:\s*(body|request)/i);
  });
});

// ---------------------------------------------------------------------------
// The panel
// ---------------------------------------------------------------------------

describe('the panel', () => {
  it('folds this week live, so it is meaningful before Sunday', async () => {
    const { client } = fakeClient({
      rpcs: { ensure_serpent_week: { data: [weekRpcRow()] } },
      tables: {
        players: { data: [{ id: 'p1', user_id: 'u1', lifetime_depth: 4000, best_week_depth: 900 }] },
        clan_members: { data: [] },
        game_sessions: {
          data: [
            session({ yield_dna: 500 }),
            session({ yield_dna: 400 }),
            session({ yield_dna: 300 }),
            session({ yield_dna: 200 }),
          ],
        },
        serpent_week_players: { data: [] },
        serpent_chronicle_entries: { data: [] },
      },
    });

    const panel = await buildSerpentPanel(client, 'p1', NOW, { enabled: true });
    expect(panel.live).toBe(true);
    expect(panel.you.depth).toBe(1200);
    expect(panel.you.attempts).toBe(4);
    expect(panel.you.countedYields).toEqual([500, 400, 300]);
    expect(panel.you.bestWeekDepth).toBe(900);
    expect(panel.you.lifetimeDepth).toBe(4000);
    expect(panel.you.deltaVsBestWeek).toBe(300);
  });

  it('carries no threshold, minimum, bar or reward field (Rule 8)', async () => {
    // No modifiers on this fixture: their flavour text is curated copy from
    // the shipped pool and is not what this test is about.
    const { client } = fakeClient({
      rpcs: { ensure_serpent_week: { data: [{ ...weekRpcRow(), modifiers: [] }] } },
      tables: {
        players: { data: [{ id: 'p1', user_id: 'u1', lifetime_depth: 0, best_week_depth: 0 }] },
        clan_members: { data: [] },
        game_sessions: { data: [] },
        serpent_week_players: { data: [] },
        serpent_chronicle_entries: { data: [] },
      },
    });
    const panel = await buildSerpentPanel(client, 'p1', NOW, { enabled: true });
    const serialized = JSON.stringify(panel).toLowerCase();
    for (const forbidden of [
      'threshold',
      'minimum',
      'required',
      'quota',
      'cutline',
      'passed',
      'failed',
      'reward',
      'bonus',
      'dna',
    ]) {
      expect(serialized).not.toContain(forbidden);
    }
  });
});

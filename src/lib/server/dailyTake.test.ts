/**
 * @jest-environment node
 *
 * The Daily Take's server engine (WP-1.04, Constitution §7.2, Rules 5, 6, 11).
 *
 * The arithmetic lives in `src/shared/game/dailyTake.test.ts`. What is tested
 * here is the engine's *behaviour against the database*: that the preview path
 * writes nothing at all, that the paying path is one RPC call with no
 * read-compute-write split for a double collect to slip through, that a
 * missing migration degrades closed, and that every Supabase error is reported.
 */

const mockCaptureException = jest.fn();
const mockFrom = jest.fn();
const mockRpc = jest.fn();

jest.mock('@sentry/nextjs', () => ({
  captureException: (...args: unknown[]) => mockCaptureException(...args),
}));

import type { SupabaseClient } from '@supabase/supabase-js';

type EngineModule = typeof import('./dailyTake');

/** Every operation the engine performed, in order. */
let operations: string[] = [];

function loadEngine(enabled: boolean): EngineModule {
  if (enabled) {
    process.env.NEXT_PUBLIC_DAILY_TAKE_V1 = 'true';
  } else {
    delete process.env.NEXT_PUBLIC_DAILY_TAKE_V1;
  }
  let mod!: EngineModule;
  jest.isolateModules(() => {
    mod = require('./dailyTake') as EngineModule;
  });
  return mod;
}

/**
 * A Supabase double that records every call. Any operation the engine is not
 * supposed to perform is present on the chain, so calling it is recorded
 * rather than throwing a TypeError that could be mistaken for something else.
 */
function client(options: {
  row?: Record<string, unknown> | null;
  selectError?: { code?: string; message?: string } | null;
  rpcData?: unknown;
  rpcError?: { code?: string; message?: string } | null;
}): SupabaseClient {
  mockFrom.mockImplementation((table: string) => {
    operations.push(`from:${table}`);
    const chain: Record<string, unknown> = {};
    for (const op of ['eq', 'in', 'is', 'not', 'gt', 'gte', 'lt', 'lte', 'order', 'limit']) {
      chain[op] = () => chain;
    }
    chain.select = () => {
      operations.push(`select:${table}`);
      return chain;
    };
    for (const op of ['update', 'insert', 'upsert', 'delete']) {
      chain[op] = () => {
        operations.push(`${op}:${table}`);
        return chain;
      };
    }
    chain.maybeSingle = () =>
      Promise.resolve({
        data: options.selectError ? null : (options.row ?? null),
        error: options.selectError ?? null,
      });
    chain.single = chain.maybeSingle;
    return chain;
  });

  mockRpc.mockImplementation((fn: string, params: unknown) => {
    operations.push(`rpc:${fn}:${JSON.stringify(params)}`);
    return Promise.resolve({
      data: options.rpcError ? null : (options.rpcData ?? null),
      error: options.rpcError ?? null,
    });
  });

  return {
    from: (table: string) => mockFrom(table),
    rpc: (fn: string, params: unknown) => mockRpc(fn, params),
  } as unknown as SupabaseClient;
}

/** The RPC's answer for a granted collect. */
function granted(over: Record<string, unknown> = {}) {
  return {
    collected: true,
    already_collected: false,
    amount: 125,
    tier: 1,
    multiplier: '1.25', // Postgres NUMERIC arrives as a string over PostgREST.
    streak_days: 3,
    longest_streak: 9,
    cooled: false,
    day: '2026-07-26',
    dna: 5125,
    ...over,
  };
}

/** The RPC's answer for a day that is already settled. */
function settled(over: Record<string, unknown> = {}) {
  return {
    collected: false,
    already_collected: true,
    amount: 0,
    tier: 1,
    multiplier: '1.25',
    streak_days: 3,
    longest_streak: 9,
    cooled: false,
    day: '2026-07-26',
    dna: 5125,
    ...over,
  };
}

beforeEach(() => {
  operations = [];
  mockCaptureException.mockReset();
  mockFrom.mockReset();
  mockRpc.mockReset();
});

describe('describeDailyTakeSlot — a preview, never a grant', () => {
  it('offers the day s Take with the tier the chain has earned', async () => {
    const engine = loadEngine(true);
    const supabase = client({
      row: {
        take_streak_days: 6,
        take_tier: 1,
        take_longest_streak: 9,
        take_last_claim_date: '2026-07-25',
      },
    });

    const slot = await engine.describeDailyTakeSlot(
      supabase,
      'player-1',
      new Date('2026-07-26T10:00:00Z')
    );

    expect(slot).toEqual({
      live: true,
      firstRunOfDay: true,
      amount: 150, // day 7 crosses the ×1.5 tier
      streakDays: 7,
      multiplier: 1.5,
      collected: false,
    });
  });

  it('performs EXACTLY one read and no write of any kind', async () => {
    const engine = loadEngine(true);
    const supabase = client({
      row: { take_streak_days: 2, take_last_claim_date: '2026-07-25' },
    });

    await engine.describeDailyTakeSlot(supabase, 'player-1', new Date('2026-07-26T10:00:00Z'));

    expect(operations).toEqual(['from:player_streaks', 'select:player_streaks']);
    // The settlement path calls this. It must not be able to grant a Take as a
    // side effect of a run ending (§7.2: the Take is collected with a tap).
    expect(operations.some((op) => /^(update|insert|upsert|delete|rpc):/.test(op))).toBe(false);
  });

  it('offers the Take to a player who has never collected one', async () => {
    const engine = loadEngine(true);
    const supabase = client({ row: null });

    const slot = await engine.describeDailyTakeSlot(
      supabase,
      'player-1',
      new Date('2026-07-26T10:00:00Z')
    );

    expect(slot).toEqual({
      live: true,
      firstRunOfDay: true,
      amount: 100,
      streakDays: 1,
      multiplier: 1,
      collected: false,
    });
  });

  it('stops offering the Take once the day is collected', async () => {
    const engine = loadEngine(true);
    const supabase = client({
      row: {
        take_streak_days: 3,
        take_tier: 1,
        take_longest_streak: 3,
        take_last_claim_date: '2026-07-26',
      },
    });

    const slot = await engine.describeDailyTakeSlot(
      supabase,
      'player-1',
      new Date('2026-07-26T23:59:59Z')
    );

    expect(slot).toMatchObject({ firstRunOfDay: false, collected: true, amount: 0 });
  });

  it('offers it again one second after 00:00 UTC (§7.1)', async () => {
    const engine = loadEngine(true);
    const supabase = client({
      row: {
        take_streak_days: 3,
        take_tier: 1,
        take_longest_streak: 3,
        take_last_claim_date: '2026-07-26',
      },
    });

    const before = await engine.describeDailyTakeSlot(
      supabase,
      'player-1',
      new Date('2026-07-26T23:59:59.999Z')
    );
    const after = await engine.describeDailyTakeSlot(
      supabase,
      'player-1',
      new Date('2026-07-27T00:00:00.000Z')
    );

    expect(before?.firstRunOfDay).toBe(false);
    expect(after?.firstRunOfDay).toBe(true);
    expect(after?.streakDays).toBe(4);
    expect(after?.amount).toBe(125);
  });

  it('shows the cooled tier to a player returning after a gap', async () => {
    const engine = loadEngine(true);
    const supabase = client({
      row: {
        take_streak_days: 30,
        take_tier: 4,
        take_longest_streak: 30,
        take_last_claim_date: '2026-07-01',
      },
    });

    const slot = await engine.describeDailyTakeSlot(
      supabase,
      'player-1',
      new Date('2026-07-26T10:00:00Z')
    );

    // One rung down, never to zero: ×3 becomes ×2, not ×1.
    expect(slot).toMatchObject({ streakDays: 14, multiplier: 2, amount: 200 });
  });

  it('never trusts a stored tier above what the days earned', async () => {
    const engine = loadEngine(true);
    const supabase = client({
      row: {
        take_streak_days: 1,
        take_tier: 4, // impossible under migration 041; refused anyway
        take_longest_streak: 1,
        take_last_claim_date: '2026-07-25',
      },
    });

    const slot = await engine.describeDailyTakeSlot(
      supabase,
      'player-1',
      new Date('2026-07-26T10:00:00Z')
    );

    expect(slot).toMatchObject({ streakDays: 2, multiplier: 1, amount: 100 });
  });
});

describe('collectDailyTake — the game s one claim', () => {
  it('sends the player id and nothing else (Rule 11)', async () => {
    const engine = loadEngine(true);
    const supabase = client({ rpcData: granted() });

    await engine.collectDailyTake(supabase, 'player-1', new Date('2026-07-26T10:00:00Z'));

    expect(operations).toEqual(['rpc:collect_daily_take:{"p_player_id":"player-1"}']);
    // No day, amount, tier or multiplier parameter exists to be abused.
    expect(operations[0]).not.toMatch(/day|date|amount|tier|multiplier|streak/);
  });

  it('is one round trip with no read before the write', async () => {
    const engine = loadEngine(true);
    const supabase = client({ rpcData: granted() });

    await engine.collectDailyTake(supabase, 'player-1');

    // A read-then-write split across the network is how a double collect
    // becomes possible. There is no read here at all.
    expect(operations.filter((op) => op.startsWith('select:'))).toEqual([]);
    expect(operations).toHaveLength(1);
  });

  it('reports what the RPC granted, coercing the NUMERIC multiplier', async () => {
    const engine = loadEngine(true);
    const supabase = client({ rpcData: granted() });

    const result = await engine.collectDailyTake(supabase, 'player-1');

    expect(result).toEqual({
      status: 'collected',
      amount: 125,
      cooled: false,
      dna: 5125,
      slot: {
        live: true,
        firstRunOfDay: false,
        amount: 125,
        streakDays: 3,
        multiplier: 1.25,
        collected: true,
      },
    });
  });

  it('grants nothing on the second call — double collect is impossible', async () => {
    const engine = loadEngine(true);
    // The RPC decides. First call grants, every call after it is settled.
    let calls = 0;
    mockRpc.mockImplementation(() => {
      calls += 1;
      operations.push('rpc:collect_daily_take');
      return Promise.resolve({ data: calls === 1 ? granted() : settled(), error: null });
    });
    const supabase = {
      from: (table: string) => mockFrom(table),
      rpc: (fn: string, params: unknown) => mockRpc(fn, params),
    } as unknown as SupabaseClient;

    const first = await engine.collectDailyTake(supabase, 'player-1');
    const second = await engine.collectDailyTake(supabase, 'player-1');
    const third = await engine.collectDailyTake(supabase, 'player-1');

    expect(first).toMatchObject({ status: 'collected', amount: 125 });
    expect(second).toMatchObject({ status: 'already' });
    expect(third).toMatchObject({ status: 'already' });
    expect(second.status === 'already' && second.slot.amount).toBe(0);
    expect(third.status === 'already' && third.slot.amount).toBe(0);
  });

  it('treats an already-settled day as success, not an error', async () => {
    const engine = loadEngine(true);
    const supabase = client({ rpcData: settled() });

    const result = await engine.collectDailyTake(supabase, 'player-1');

    expect(result.status).toBe('already');
    expect(mockCaptureException).not.toHaveBeenCalled();
  });

  it('accepts the RPC answer wrapped in an array (PostgREST set-returning shape)', async () => {
    const engine = loadEngine(true);
    const supabase = client({ rpcData: [granted({ amount: 300, tier: 4, multiplier: 3 })] });

    const result = await engine.collectDailyTake(supabase, 'player-1');

    expect(result).toMatchObject({ status: 'collected', amount: 300 });
  });

  it('never reports a bigger grant than the RPC did', async () => {
    const engine = loadEngine(true);
    const supabase = client({ rpcData: granted({ amount: -50 }) });

    const result = await engine.collectDailyTake(supabase, 'player-1');

    expect(result).toMatchObject({ status: 'collected', amount: 0 });
  });
});

describe('degrading closed', () => {
  it('grants nothing and calls nothing with the flag off', async () => {
    const engine = loadEngine(false);
    const supabase = client({ rpcData: granted() });

    const collect = await engine.collectDailyTake(supabase, 'player-1');
    const slot = await engine.describeDailyTakeSlot(supabase, 'player-1');

    expect(collect).toMatchObject({ status: 'off' });
    expect(collect.status === 'off' && collect.slot.amount).toBe(0);
    expect(slot).toBeNull();
    // Not a single database call was made.
    expect(operations).toEqual([]);
  });

  it('reads as "not live" before migration 050 applies, without a Sentry report', async () => {
    const engine = loadEngine(true);
    const supabase = client({
      rpcError: { code: 'PGRST202', message: 'Could not find the function collect_daily_take' },
      selectError: { code: '42703', message: 'column player_streaks.take_tier does not exist' },
    });

    const collect = await engine.collectDailyTake(supabase, 'player-1');
    const slot = await engine.describeDailyTakeSlot(supabase, 'player-1');

    expect(collect).toMatchObject({ status: 'off' });
    expect(slot).toBeNull();
    // A missing migration is a deploy-window fact, not an incident.
    expect(mockCaptureException).not.toHaveBeenCalled();
  });

  it('recognises the missing-infra codes and nothing else', () => {
    const engine = loadEngine(true);
    expect(engine.isMissingTakeInfra({ code: '42P01' })).toBe(true);
    expect(engine.isMissingTakeInfra({ code: '42883' })).toBe(true);
    expect(engine.isMissingTakeInfra({ code: 'PGRST204' })).toBe(true);
    expect(engine.isMissingTakeInfra({ message: 'collect_daily_take is unknown' })).toBe(true);
    expect(engine.isMissingTakeInfra(null)).toBe(false);
    expect(engine.isMissingTakeInfra({ code: '23514', message: 'check constraint violated' })).toBe(
      false
    );
  });
});

describe('Rule 11 — every Supabase error is checked and reported', () => {
  it('reports a failed collect to Sentry and grants nothing', async () => {
    const engine = loadEngine(true);
    const supabase = client({
      rpcError: { code: '40001', message: 'could not serialize access' },
    });

    const result = await engine.collectDailyTake(supabase, 'player-1');

    expect(result).toEqual({ status: 'failed' });
    expect(mockCaptureException).toHaveBeenCalledTimes(1);
  });

  it('reports a failed chain read and offers no slot', async () => {
    const engine = loadEngine(true);
    const supabase = client({
      selectError: { code: '57014', message: 'statement timeout' },
    });

    const slot = await engine.describeDailyTakeSlot(supabase, 'player-1');

    expect(slot).toBeNull();
    expect(mockCaptureException).toHaveBeenCalledTimes(1);
  });

  it('reports an RPC that answers with no row at all', async () => {
    const engine = loadEngine(true);
    const supabase = client({ rpcData: null });

    const result = await engine.collectDailyTake(supabase, 'player-1');

    expect(result).toEqual({ status: 'failed' });
    expect(mockCaptureException).toHaveBeenCalledTimes(1);
  });
});

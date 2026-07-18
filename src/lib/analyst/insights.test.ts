/**
 * @jest-environment node
 *
 * Orchestration tests (Identity v1 §9.3): pre-025 detection, cache-hit
 * short circuit (no session reads on a hit), the 23505
 * insert-conflict → return-existing dedup, and the week/season time
 * helpers the cron fan-out gates on.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import {
  generateRunInsight,
  getCachedInsight,
  inputHash,
  isMissingAnalystInfra,
  lastCompletedWeekStart,
  latestEndedSeason,
  saveInsight,
  weekStartUtc,
} from './insights';
import type { DigestFacts } from './facts';

const digestFacts: DigestFacts = {
  kind: 'weekly_digest',
  weekStart: '2026-07-06',
  runs: 1,
  earningRuns: 1,
  extractions: 1,
  extractionRatePct: 100,
  totalDna: 100,
  bestScore: 100,
  bestDnaRun: 100,
  activeDays: 1,
  dynastyRuns: { PRIMAL: 1 },
  topDynasty: 'PRIMAL',
  deathCauses: {},
  contracts: null,
  streak: null,
  recordsAdvanced: [],
};

/** Chainable query mock: every builder method returns itself; the chain
 *  is thenable and resolves to `result` (also via single/maybeSingle). */
function chain(result: unknown) {
  const c: Record<string, unknown> = {};
  for (const m of [
    'select', 'eq', 'neq', 'gt', 'gte', 'lt', 'lte', 'not', 'in',
    'order', 'limit', 'insert', 'upsert',
  ]) {
    c[m] = jest.fn(() => c);
  }
  c.single = jest.fn(async () => result);
  c.maybeSingle = jest.fn(async () => result);
  c.then = (resolve: (v: unknown) => unknown) => resolve(result);
  return c;
}

function supabaseWith(tables: Record<string, unknown>): SupabaseClient {
  return {
    from: jest.fn((table: string) => {
      if (!(table in tables)) {
        throw new Error(`Unexpected table in test: ${table}`);
      }
      return tables[table];
    }),
    rpc: jest.fn(async () => ({ data: null, error: null })),
  } as unknown as SupabaseClient;
}

describe('isMissingAnalystInfra', () => {
  it('detects missing-relation/function codes and analyst names', () => {
    expect(isMissingAnalystInfra({ code: '42P01' })).toBe(true);
    expect(isMissingAnalystInfra({ code: '42703' })).toBe(true);
    expect(isMissingAnalystInfra({ code: 'PGRST202' })).toBe(true);
    expect(isMissingAnalystInfra({ message: 'relation "ai_insights" does not exist' })).toBe(true);
    expect(isMissingAnalystInfra({ code: '23505', message: 'duplicate' })).toBe(false);
    expect(isMissingAnalystInfra(null)).toBe(false);
  });
});

describe('getCachedInsight', () => {
  it('pre-025: missing table reads as { live: false }', async () => {
    const supabase = supabaseWith({
      ai_insights: chain({ data: null, error: { code: '42P01', message: 'no ai_insights' } }),
    });
    const result = await getCachedInsight(supabase, 'run_insight', 's1', {
      playerId: 'p1',
    });
    expect(result).toEqual({ live: false, row: null });
  });

  it('returns the cached row when present', async () => {
    const row = { id: 'i1', kind: 'run_insight', scope_ref: 's1', content: { headline: 'x', body: 'y', tips: [] }, model: null, created_at: 'now' };
    const supabase = supabaseWith({ ai_insights: chain({ data: row, error: null }) });
    const result = await getCachedInsight(supabase, 'run_insight', 's1', {
      playerId: 'p1',
    });
    expect(result.live).toBe(true);
    expect(result.row).toEqual(row);
  });
});

describe('saveInsight — dedup index arbitration', () => {
  const params = {
    kind: 'weekly_digest' as const,
    scopeRef: '2026-07-06',
    owner: { playerId: 'p1' },
    content: { headline: 'h', body: 'b', tips: [] },
    model: null,
    tokensIn: 0,
    tokensOut: 0,
    facts: digestFacts,
  };

  it('23505 (another request won the race) returns the existing row', async () => {
    const existing = { id: 'winner', kind: 'weekly_digest', scope_ref: '2026-07-06', content: params.content, model: null, created_at: 'now' };
    let call = 0;
    const table = chain({ data: null, error: null });
    table.single = jest.fn(async () => ({ data: null, error: { code: '23505', message: 'duplicate key' } }));
    table.maybeSingle = jest.fn(async () => ({ data: existing, error: null }));
    // insert().select().single() errors; the re-read maybeSingle succeeds
    const supabase = {
      from: jest.fn(() => {
        call += 1;
        return table;
      }),
      rpc: jest.fn(),
    } as unknown as SupabaseClient;

    const saved = await saveInsight(supabase, params);
    expect(saved).toEqual(existing);
    expect(call).toBeGreaterThanOrEqual(2);
  });

  it('pre-025 insert returns null quietly', async () => {
    const table = chain({ data: null, error: null });
    table.single = jest.fn(async () => ({ data: null, error: { code: '42P01', message: 'no table' } }));
    const supabase = supabaseWith({ ai_insights: table });
    expect(await saveInsight(supabase, params)).toBeNull();
  });
});

describe('generateRunInsight — cache-hit short circuit', () => {
  it('a cache hit never touches game_sessions or economy_transactions', async () => {
    const row = { id: 'i1', kind: 'run_insight', scope_ref: 's1', content: { headline: 'x', body: 'y', tips: [] }, model: 'gpt-5-mini', created_at: 'now' };
    // ONLY ai_insights is wired — any other table access throws
    const supabase = supabaseWith({ ai_insights: chain({ data: row, error: null }) });
    const result = await generateRunInsight(supabase, {
      playerId: 'p1',
      sessionId: 's1',
    });
    expect(result.cached).toBe(true);
    expect(result.source).toBe('cache');
    expect(result.insight).toEqual(row);
  });

  it('pre-025 short-circuits to { live: false }', async () => {
    const supabase = supabaseWith({
      ai_insights: chain({ data: null, error: { code: '42P01', message: 'nope' } }),
    });
    const result = await generateRunInsight(supabase, {
      playerId: 'p1',
      sessionId: 's1',
    });
    expect(result.live).toBe(false);
  });

  it('unknown session reports notFound', async () => {
    const supabase = supabaseWith({
      ai_insights: chain({ data: null, error: null }),
      game_sessions: chain({ data: null, error: null }),
    });
    const result = await generateRunInsight(supabase, {
      playerId: 'p1',
      sessionId: '11111111-1111-4111-8111-111111111111',
    });
    expect(result.live).toBe(true);
    expect(result.notFound).toBe(true);
  });

  it('an unended session reports notEnded', async () => {
    const supabase = supabaseWith({
      ai_insights: chain({ data: null, error: null }),
      game_sessions: chain({
        data: { id: 's1', ended_at: null },
        error: null,
      }),
    });
    const result = await generateRunInsight(supabase, {
      playerId: 'p1',
      sessionId: 's1',
    });
    expect(result.notEnded).toBe(true);
  });
});

describe('time helpers', () => {
  it('weekStartUtc is the Monday of the containing week', () => {
    expect(weekStartUtc(new Date('2026-07-16T12:00:00Z'))).toBe('2026-07-13'); // Thu → Mon
    expect(weekStartUtc(new Date('2026-07-13T00:00:00Z'))).toBe('2026-07-13'); // Mon → itself
    expect(weekStartUtc(new Date('2026-07-19T23:59:59Z'))).toBe('2026-07-13'); // Sun → prev Mon
  });

  it('lastCompletedWeekStart is the previous Monday', () => {
    expect(lastCompletedWeekStart(new Date('2026-07-13T07:00:00Z'))).toBe('2026-07-06');
    expect(lastCompletedWeekStart(new Date('2026-07-16T12:00:00Z'))).toBe('2026-07-06');
  });

  it('inputHash is stable for identical facts', () => {
    expect(inputHash(digestFacts)).toBe(inputHash({ ...digestFacts }));
    expect(inputHash(digestFacts)).toMatch(/^[0-9a-f]{64}$/);
  });
});

describe('latestEndedSeason', () => {
  it('maps the seasons row and is null while a season is live', async () => {
    const supabase = supabaseWith({
      seasons: chain({
        data: { id: 'season-1', seq: 1, name: 'Solstice', starts_on: '2026-07-20', ends_on: '2026-09-07' },
        error: null,
      }),
    });
    const season = await latestEndedSeason(supabase, new Date('2026-09-08T00:00:00Z'));
    expect(season).toEqual({
      id: 'season-1',
      seq: 1,
      name: 'Solstice',
      startsOn: '2026-07-20',
      endsOn: '2026-09-07',
    });

    const empty = supabaseWith({ seasons: chain({ data: null, error: null }) });
    expect(await latestEndedSeason(empty, new Date())).toBeNull();
  });

  it('pre-021 reads as null', async () => {
    const supabase = supabaseWith({
      seasons: chain({ data: null, error: { code: '42P01', message: 'no seasons' } }),
    });
    expect(await latestEndedSeason(supabase, new Date())).toBeNull();
  });
});
